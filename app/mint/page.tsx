'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { formatUnits } from 'viem'
import type { Connector } from 'wagmi'
import { useAccount, useConnect, useSwitchChain } from 'wagmi'
import { activeChain, MAX_SUPPLY, swapUrl, tokenUrl, txUrl } from './chain'
import { MintAnimation } from './MintAnimation'
import { useMint } from './useMint'
import styles from './mint.module.css'

const PRE_REVEAL = '/collection/pre-reveal.png'
const FALLBACK_PRICE = '150,000'

function amount(value: bigint | undefined, decimals: number): string {
  if (value === undefined) return '—'
  const whole = Number(formatUnits(value, decimals))
  return whole.toLocaleString('en-US', { maximumFractionDigits: whole < 1 ? 4 : 0 })
}

/** The pre-reveal artwork — the thing a collector is about to receive. */
function Artwork() {
  return (
    <div className={styles.frame}>
      <img src={PRE_REVEAL} alt="The Line, unrevealed" />
    </div>
  )
}

function WalletDialog({
  wallets,
  onPick,
  onClose,
}: {
  wallets: readonly Connector[]
  onPick: (connector: Connector) => void
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    // The page behind a dialog should not scroll under it.
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [onClose])

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label="Select a wallet"
      onClick={onClose}
    >
      {/* Clicks inside must not reach the overlay, or picking a wallet would
          close the dialog before the choice registered. */}
      <div className={styles.dialog} onClick={event => event.stopPropagation()}>
        <div className={styles.dialogHead}>
          <span>Select wallet</span>
          <button type="button" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>
        <ul className={styles.wallets}>
          {wallets.map(connector => (
            <li key={connector.uid}>
              <button type="button" onClick={() => onPick(connector)}>
                {connector.icon && <img src={connector.icon} alt="" />}
                <span>{connector.name}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

export default function MintPage() {
  const mint = useMint()
  const { connect, connectors, isPending: connecting } = useConnect()
  const { switchChain } = useSwitchChain()
  const { isConnected } = useAccount()

  // wagmi resolves the connection after hydration, so anything that depends on
  // it has to wait a tick or the server and client markup disagree.
  const [ready, setReady] = useState(false)
  useEffect(() => setReady(true), [])

  const [revealed, setRevealed] = useState(false)
  const [muted, setMuted] = useState(false)
  const [picking, setPicking] = useState(false)

  // wagmi discovers every installed wallet through EIP-6963 and also keeps a
  // generic "Injected" fallback. When real wallets have announced themselves
  // the fallback is noise — and worse, ambiguous: it connects to whichever one
  // happened to claim window.ethereum, which is not a choice the visitor made.
  const wallets = useMemo(() => {
    const announced = connectors.filter(connector => connector.id !== 'injected')
    if (announced.length) return announced
    if (typeof window !== 'undefined' && (window as { ethereum?: unknown }).ethereum) return connectors
    return []
  }, [connectors])

  const { step, error, tokenId, price, decimals, balance, totalMinted } = mint
  const collected = totalMinted !== undefined ? Number(totalMinted) : null
  const soldOut = collected !== null && collected >= MAX_SUPPLY
  // The approval is not the mint. Running the field while a token allowance is
  // being signed would show a line forming for something that has not started
  // yet, so the approval gets its own plain state and the animation waits for
  // the transaction that actually mints.
  const approving = step === 'approving' || step === 'confirmingApproval'

  // The receipt arrives before the animation finishes. Holding the number back
  // until the line has landed is the whole point — otherwise the answer is
  // already on screen while the field is still churning for it.
  const animating = step === 'burning' || step === 'confirming' || (step === 'success' && !revealed)
  const showResult = step === 'success' && revealed && tokenId !== null

  const startOver = () => {
    setRevealed(false)
    mint.reset()
  }

  const statusLabel: Record<string, string> = {
    burning: 'Burning',
    confirming: 'Confirming',
  }

  const priceLabel = price !== undefined ? amount(price, decimals) : FALLBACK_PRICE

  // Telling someone they are short is only half an answer. The shortfall is
  // the number they actually need, and the exchange is where they get it.
  const short = balance !== undefined && price !== undefined && balance < price
  const shortfall = short ? amount(price! - balance!, decimals) : null
  const swap = swapUrl()

  return (
    <main className={styles.page}>
      <header className={styles.nav}>
        <Link className={styles.wordmark} href="/">The Line</Link>
        <span className={styles.navMeta}>Mint</span>
      </header>

      <section className={styles.hero}>
        <div className={styles.art}>
          {animating ? (
            <MintAnimation
              active
              resolved={step === 'success'}
              muted={muted}
              onComplete={() => setRevealed(true)}
            />
          ) : (
            <Artwork />
          )}
        </div>

        <div className={styles.panel}>
          {showResult ? (
            <div className={styles.block} role="status" aria-live="polite">
              <span className={styles.kicker}>YOUR LINE</span>
              <h1 className={styles.lead}>The line has<br />been collected.</h1>
              {/* No number. Nothing about this work is legible yet — not the
                  artwork, not the traits, not the edition. Printing the id
                  here would be the one thing that broke that. It is on chain
                  and the link below leads straight to it. */}
              <p className={styles.note}>
                It stays unrevealed until all 3,333 have been collected.
              </p>
              <a className={styles.button} href={tokenUrl(tokenId!)} target="_blank" rel="noreferrer">
                VIEW ON OPENSEA
              </a>
              <button className={styles.ghost} type="button" onClick={startOver}>
                COLLECT ANOTHER
              </button>
            </div>
          ) : approving ? (
            <div className={styles.block} role="status" aria-live="polite">
              <span className={styles.kicker}>APPROVING</span>
              <h1 className={styles.lead}>One moment.</h1>
              <p className={styles.note}>
                Allowing the mint to take exactly {priceLabel} $LINE. The mint follows on its own.
              </p>
            </div>
          ) : animating ? (
            <div className={styles.block} role="status" aria-live="polite">
              <span className={styles.kicker}>{statusLabel[step] || 'Collecting'}</span>
              <h1 className={`${styles.lead} ${styles.pulse}`}>Your line<br />is forming.</h1>
              <p className={styles.note}>
                The burn and the mint are one transaction. Either both happen, or neither does.
              </p>
            </div>
          ) : (
            <div className={styles.block}>
              <span className={styles.kicker}>THE LINE</span>
              <h1 className={styles.lead}>Everything begins<br />with a line.</h1>

              {/* Price and supply are data, not headlines. Set as a ledger they
                  can be compared at a glance against the wallet's balance,
                  which is the only comparison that decides anything here. */}
              <dl className={styles.ledger}>
                <div>
                  <dt>Price</dt>
                  <dd>{priceLabel} $LINE</dd>
                </div>
                <div>
                  <dt>Collected</dt>
                  <dd>
                    {collected !== null ? collected.toLocaleString('en-US') : '—'} /{' '}
                    {MAX_SUPPLY.toLocaleString('en-US')}
                  </dd>
                </div>
                {ready && isConnected && !mint.wrongNetwork && mint.configured && (
                  <div>
                    <dt>Your balance</dt>
                    <dd className={balance !== undefined && !mint.hasEnough ? styles.short : undefined}>
                      {amount(balance, decimals)} $LINE
                    </dd>
                  </div>
                )}
              </dl>

              {!ready ? (
                <div className={styles.buttonPlaceholder} />
              ) : !mint.configured ? (
                <p className={styles.status}>Mint opens soon.</p>
              ) : soldOut ? (
                <p className={styles.status}>All 3,333 have been collected.</p>
              ) : !isConnected ? (
                <>
                  <button
                    className={styles.button}
                    type="button"
                    disabled={connecting || wallets.length === 0}
                    // One wallet is not a choice, so it does not get a dialog.
                    onClick={() =>
                      wallets.length === 1 ? connect({ connector: wallets[0] }) : setPicking(true)
                    }
                  >
                    {connecting ? 'CONNECTING' : wallets.length === 0 ? 'NO WALLET FOUND' : 'CONNECT WALLET'}
                  </button>
                  {/* Shown only when nothing was detected, so it never gets in
                      the way of someone who already has a wallet. Mobile comes
                      first: a phone visitor almost always owns a wallet — it is
                      just an app, and this page is open in Safari or Chrome
                      instead of inside it. */}
                  {wallets.length === 0 && (
                    <p className={styles.note}>
                      No wallet detected. On a phone, open this page inside your wallet
                      app&apos;s own browser. On a computer, install a browser wallet and reload.
                    </p>
                  )}
                </>
              ) : mint.wrongNetwork ? (
                <button
                  className={styles.button}
                  type="button"
                  onClick={() => switchChain({ chainId: activeChain.id })}
                >
                  SWITCH NETWORK
                </button>
              ) : (
                <>
                  {/* The primary action never moves. A button that changes
                      meaning while staying in the same place is how someone
                      pressing from memory presses the wrong thing. */}
                  <button
                    className={styles.button}
                    type="button"
                    disabled={approving || !mint.hasEnough || !mint.saleOpen || mint.paused}
                    onClick={mint.start}
                  >
                    BURN &amp; COLLECT
                  </button>
                  {/* The way out, offered only when it is the thing that is
                      actually in the way. */}
                  {short && swap && (
                    <a className={styles.ghost} href={swap} target="_blank" rel="noreferrer">
                      GET $LINE
                    </a>
                  )}
                  {short && (
                    <p className={styles.status}>
                      {shortfall} $LINE short.
                      {swap ? ' Swap, then come back to collect.' : ''}
                    </p>
                  )}
                  {!short && mint.saleOpen === false && (
                    <p className={styles.status}>The mint is not open.</p>
                  )}
                  {mint.paused && <p className={styles.status}>The mint is paused.</p>}
                </>
              )}

              {step === 'error' && (
                <p className={styles.error} role="alert">
                  {error}
                  {mint.mintHash && (
                    <>
                      {' '}
                      <a href={txUrl(mint.mintHash)} target="_blank" rel="noreferrer">
                        VIEW TRANSACTION
                      </a>
                    </>
                  )}
                </p>
              )}
            </div>
          )}
        </div>
      </section>

      {picking && wallets.length > 1 && (
        <WalletDialog
          wallets={wallets}
          onPick={connector => {
            setPicking(false)
            connect({ connector })
          }}
          onClose={() => setPicking(false)}
        />
      )}

      <button
        className={styles.soundToggle}
        type="button"
        onClick={() => setMuted(!muted)}
        aria-pressed={muted}
      >
        {muted ? 'SOUND OFF' : 'SOUND ON'}
      </button>
    </main>
  )
}
