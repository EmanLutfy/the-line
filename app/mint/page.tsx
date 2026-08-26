'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { formatUnits } from 'viem'
import { useAccount, useConnect, useSwitchChain } from 'wagmi'
import { activeChain, MAX_SUPPLY, tokenUrl, txUrl } from './chain'
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
                <button
                  className={styles.button}
                  type="button"
                  disabled={connecting || connectors.length === 0}
                  onClick={() => connectors[0] && connect({ connector: connectors[0] })}
                >
                  {connecting ? 'CONNECTING' : 'CONNECT WALLET'}
                </button>
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
                  <button
                    className={styles.button}
                    type="button"
                    disabled={approving || !mint.hasEnough || !mint.saleOpen || mint.paused}
                    onClick={mint.start}
                  >
                    BURN &amp; COLLECT
                  </button>
                  {balance !== undefined && !mint.hasEnough && (
                    <p className={styles.status}>{priceLabel} $LINE required.</p>
                  )}
                  {mint.hasEnough && mint.saleOpen === false && (
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
