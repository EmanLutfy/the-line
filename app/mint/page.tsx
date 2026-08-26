'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { formatUnits } from 'viem'
import { useAccount, useConnect, useSwitchChain } from 'wagmi'
import { activeChain, MAX_SUPPLY, tokenUrl, txUrl } from './chain'
import { useMint } from './useMint'
import styles from './mint.module.css'

const PRE_REVEAL_IMAGE = '/images/pre-reveal.png'

function pad(id: bigint | number): string {
  return String(id).padStart(4, '0')
}

function amount(value: bigint | undefined, decimals: number): string {
  if (value === undefined) return '—'
  const whole = Number(formatUnits(value, decimals))
  return whole.toLocaleString('en-US', { maximumFractionDigits: whole < 1 ? 4 : 0 })
}

/** The pre-reveal mark: one line, breathing. The same image every token gets. */
function PreReveal({ still }: { still?: boolean }) {
  return (
    <div className={styles.art} aria-hidden="true">
      <div className={styles.artFrame}>
        <i className={still ? styles.lineStill : styles.line} />
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

  const { step, error, tokenId, price, decimals, balance, totalMinted } = mint
  const collected = totalMinted !== undefined ? Number(totalMinted) : null
  const soldOut = collected !== null && collected >= MAX_SUPPLY
  const busy = step === 'approving' || step === 'confirmingApproval' || step === 'burning' || step === 'confirming'

  const statusLine: Record<string, string> = {
    approving: 'APPROVING',
    confirmingApproval: 'APPROVING',
    burning: 'BURNING',
    confirming: 'CONFIRMING',
  }

  return (
    <main className={styles.page}>
      <header className={styles.nav}>
        <Link className={styles.wordmark} href="/">The Line</Link>
        <span className={styles.navMeta}>Mint</span>
      </header>

      <section className={styles.hero}>
        <PreReveal still={step === 'success'} />

        <div className={styles.copy}>
          {step === 'success' && tokenId !== null ? (
            <div className={styles.result} role="status" aria-live="polite">
              <span className={styles.kicker}>YOUR LINE</span>
              <h2>#{pad(tokenId)}</h2>
              <p className={styles.resultBody}>The line has been collected.</p>
              <p className={styles.note}>
                It stays unrevealed until the collection is complete.
              </p>
              <div className={styles.actions}>
                <a className={styles.button} href={tokenUrl(tokenId)} target="_blank" rel="noreferrer">
                  VIEW ON OPENSEA
                </a>
                <button className={styles.ghostButton} type="button" onClick={mint.reset}>
                  COLLECT ANOTHER
                </button>
              </div>
            </div>
          ) : (
            <div className={styles.panel}>
              <span className={styles.kicker}>THE LINE</span>
              <p className={styles.statement}>3,333 unique interpretations.</p>

              <div className={styles.priceBlock}>
                <span className={styles.priceValue}>
                  {price !== undefined ? amount(price, decimals) : '150,000'} $LINE
                </span>
                <span className={styles.priceLabel}>to collect one.</span>
              </div>

              {/* Progress is read from the NFT contract, never from a counter
                  the site keeps for itself. */}
              {collected !== null && (
                <p className={styles.progress}>
                  {collected.toLocaleString('en-US')} / {MAX_SUPPLY.toLocaleString('en-US')} COLLECTED
                </p>
              )}

              {!ready ? (
                <div className={styles.buttonPlaceholder} />
              ) : !mint.configured ? (
                <p className={styles.notice}>MINT OPENS SOON.</p>
              ) : soldOut ? (
                <p className={styles.notice}>ALL 3,333 HAVE BEEN COLLECTED.</p>
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
                  SWITCH TO {activeChain.name.toUpperCase()}
                </button>
              ) : (
                <>
                  <dl className={styles.ledger}>
                    <div>
                      <dt>Balance</dt>
                      <dd>{amount(balance, decimals)} $LINE</dd>
                    </div>
                    <div>
                      <dt>Required</dt>
                      <dd>{amount(price, decimals)} $LINE</dd>
                    </div>
                  </dl>

                  <button
                    className={styles.button}
                    type="button"
                    disabled={busy || !mint.hasEnough || !mint.saleOpen || mint.paused}
                    onClick={mint.start}
                  >
                    {busy ? statusLine[step] : 'BURN & COLLECT'}
                  </button>

                  {busy && (
                    <p className={styles.note}>
                      The burn and the mint are one transaction. Either both happen, or neither does.
                    </p>
                  )}

                  {!busy && balance !== undefined && !mint.hasEnough && (
                    <p className={styles.notice}>{amount(price, decimals)} $LINE required.</p>
                  )}
                  {!busy && mint.hasEnough && mint.saleOpen === false && (
                    <p className={styles.notice}>THE MINT IS NOT OPEN.</p>
                  )}
                  {!busy && mint.paused && <p className={styles.notice}>THE MINT IS PAUSED.</p>}
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
    </main>
  )
}
