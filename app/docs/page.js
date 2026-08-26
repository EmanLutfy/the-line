import Link from 'next/link'
import styles from './docs.module.css'

export const metadata = {
  title: 'Documentation — The Line',
  description:
    'How The Line is minted, revealed and verified. What is fixed, what is not, and what you are trusting.',
}

const MINT_ADDRESS = process.env.NEXT_PUBLIC_MINT_ADDRESS || ''
const NFT_ADDRESS = process.env.NEXT_PUBLIC_NFT_ADDRESS || ''
const LINE_ADDRESS = process.env.NEXT_PUBLIC_LINE_ADDRESS || ''
const PROVENANCE = '0x018c2227d5030b4d7ee6bc30e887b0747bb6c70b40cb37f9db9a9138d051795e'

// 4663 is mainnet. Anything else is a rehearsal, and the addresses on this page
// belong to that rehearsal — not to the collection. Saying so loudly is the
// difference between a test deployment and a page that tells people to send
// money to the wrong contract.
const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 46630)
const IS_MAINNET = CHAIN_ID === 4663
const CHAIN_NAME = IS_MAINNET ? 'Robinhood Chain' : 'Robinhood Chain Testnet'

const sections = [
  ['01', 'What this is', 'what-this-is'],
  ['02', 'Collecting one', 'collecting'],
  ['03', 'There is no draw', 'no-draw'],
  ['04', 'Unrevealed, then revealed', 'reveal'],
  ['05', 'Provenance', 'provenance'],
  ['06', 'Traits', 'traits'],
  ['07', 'What the burn does', 'burn'],
  ['08', 'What you are trusting', 'trust'],
  ['09', 'The locks', 'locks'],
  ['10', 'Reference', 'reference'],
]

const rarity = [
  ['Common', '1,999', '59.98%'],
  ['Uncommon', '900', '27.00%'],
  ['Rare', '300', '9.00%'],
  ['Epic', '100', '3.00%'],
  ['Legendary', '33', '0.99%'],
  ['Mythic', '1', '0.03%'],
]

function Address({ value }) {
  if (!value) return <span className={styles.pending}>not deployed yet</span>
  return <code className={styles.address}>{value}</code>
}

export default function DocsPage() {
  return (
    <main className={styles.page}>
      <header className={styles.nav}>
        <Link className={styles.wordmark} href="/">The Line</Link>
        <span className={styles.navMeta}>Docs</span>
      </header>

      <div className={styles.shell}>
        <aside className={styles.toc} aria-label="Contents">
          <span className={styles.tocLabel}>Contents</span>
          <ol>
            {sections.map(([number, title, id]) => (
              <li key={id}>
                <a href={`#${id}`}>
                  <span>{number}</span>
                  {title}
                </a>
              </li>
            ))}
          </ol>
        </aside>

        <article className={styles.body}>
          {!IS_MAINNET && (
            <p className={styles.testnet} role="note">
              <strong>Testnet.</strong> Every contract address on this page belongs to a
              test deployment on chain {CHAIN_ID}. The tokens there have no value and the
              works are not the collection. Do not send anything real to them.
            </p>
          )}
          <h1>Documentation</h1>
          <p className={styles.standfirst}>
            How The Line is minted, revealed and verified — and, in plain terms, what is
            fixed forever, what can still change, and who can change it.
          </p>

          {/* ------------------------------------------------------------- */}
          <section id="what-this-is">
            <h2><span>01</span> What this is</h2>
            <p>
              The Line is 3,333 works, each drawn from a single element: a vertical
              line. Position, length, formation, width, density and count are the only
              variables. There is no colour anywhere in the collection.
            </p>
            <p>
              Token ids run from <strong>1 to 3,333</strong>. The supply is fixed in the
              contract and cannot be raised by anyone, including us.
            </p>
          </section>

          <section id="collecting">
            <h2><span>02</span> Collecting one</h2>
            <p>
              You burn <strong>150,000 $LINE</strong> and one work is minted directly to
              your wallet. There is no ETH price beyond gas, and no allowlist.
            </p>
            <p>
              It is <strong>a single transaction</strong>. The burn and the mint happen
              inside the same call, so either both succeed or neither does. There is no
              state in which your tokens are gone and no work arrives.
            </p>
            <p>
              The first time you mint, your wallet will ask twice: once to approve exactly
              150,000 $LINE for the mint contract, then once for the mint itself. The
              approval is for the exact amount, not an unlimited allowance.
            </p>
          </section>

          <section id="no-draw">
            <h2><span>03</span> There is no draw</h2>
            <p>
              Works are handed out <strong>in order</strong>. The first mint is #0001, the
              second is #0002, and so on to #3333. Nothing is rolled, shuffled or drawn.
            </p>
            <p>
              This is a deliberate choice, not a shortcut. On-chain randomness is difficult
              to do honestly: block hashes are influenced by whoever orders the block, and
              on a chain with a single sequencer that is one party. A draw that looks fair
              and is not is worse than no draw at all.
            </p>
            <p>
              Sequential minting has nothing to manipulate. There is no roll to re-run, no
              result to simulate and revert, and no ordering anyone can game. What makes it
              fair is the next section.
            </p>
          </section>

          <section id="reveal">
            <h2><span>04</span> Unrevealed, then revealed</h2>
            <p>
              While the mint is open, <strong>every work shows the same pre-reveal
              image</strong>. Knowing you are about to receive #1847 tells you nothing about
              what #1847 is — not its traits, not its rarity, not its artwork.
            </p>
            <p>
              That is what keeps an in-order mint fair. If the artwork were visible during
              the mint, buyers could wait for good positions and skip bad ones.
            </p>
            <p>
              The whole collection is revealed at once, after the mint. Everything flips in
              a single transaction.
            </p>
            <p>
              <strong>Revealing closes the mint.</strong> The mint contract refuses to run
              once the collection is revealed — not by convention, but because it checks.
              Otherwise the next id would be knowable and its artwork public, and a buyer
              could mint only when the next piece happened to be a good one.
            </p>
          </section>

          <section id="provenance">
            <h2><span>05</span> Provenance</h2>
            <p>
              Which artwork belongs to which id was decided <em>before</em> the mint opened,
              and is recorded on chain as an immutable hash set at deployment:
            </p>
            <p className={styles.hash}>{PROVENANCE}</p>
            <p>It is computed like this:</p>
            <pre>
{`imageHash[n] = keccak256(bytes of image n)

provenance   = keccak256(
                 imageHash[1] ‖ imageHash[2] ‖ … ‖ imageHash[3333]
               )`}
            </pre>
            <p>
              After the reveal, anyone can download the 3,333 images, hash each one in id
              order, hash the concatenation, and compare the result against
              <code>provenanceHash()</code> on the contract. If they match, the assignment
              was fixed in advance and was never rearranged after seeing who minted what.
              If they do not match, something was changed, and you would know.
            </p>
          </section>

          <section id="traits">
            <h2><span>06</span> Traits</h2>
            <p>
              Every work carries eight attributes: Rarity Tier, Rarity Rank, Line Count,
              Formation, Position, Length, Width and Density. Rarity Rank is a single
              number from 1 to 3,333 — no two works share one.
            </p>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr><th>Tier</th><th>Works</th><th>Share</th></tr>
                </thead>
                <tbody>
                  {rarity.map(([tier, count, share]) => (
                    <tr key={tier}>
                      <td>{tier}</td>
                      <td>{count}</td>
                      <td>{share}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>
              Rarity carries no utility. It does not earn anything, unlock anything or
              entitle the holder to anything. It describes how unusual a composition is
              within the set, and nothing more.
            </p>
          </section>

          <section id="burn">
            <h2><span>07</span> What the burn does</h2>
            <p>
              The 150,000 $LINE does not go to a treasury, a team wallet or a multisig. It
              leaves circulation.
            </p>
            <p>There are two ways that can happen, and they are not identical:</p>
            <ul>
              <li>
                <strong>A real burn.</strong> If $LINE exposes <code>burnFrom</code>, the
                tokens are destroyed and the token&apos;s <code>totalSupply()</code> drops
                by 150,000.
              </li>
              <li>
                <strong>The dead address.</strong> If it does not, the tokens are sent to{' '}
                <code>0x…dEaD</code>, an address nobody holds a key for. They are equally
                unreachable, but they still count toward <code>totalSupply()</code>.
              </li>
            </ul>
            <p>
              Which one applies is set at configuration and visible on chain. Either way,
              the mint contract <strong>measures the effect</strong> rather than trusting
              the token: it checks that supply actually fell, or that the dead address
              actually received every unit, and reverts the whole transaction if it did
              not. A token that skims a fee in transit, or claims to burn and does nothing,
              cannot buy a work.
            </p>
            <p className={styles.arith}>
              150,000 × 3,333 = <strong>499,950,000 $LINE</strong> removed if the collection
              sells out.
            </p>
          </section>

          <section id="trust">
            <h2><span>08</span> What you are trusting</h2>
            <p>
              Everything below is enforced by the contracts, and nobody can change it —
              not the owner, not us, not a future owner:
            </p>
            <ul>
              <li>Supply stops at 3,333. There is no function that mints beyond it.</li>
              <li>
                Only the mint contract can create a token. The public cannot call the NFT
                contract&apos;s mint function, and after <code>lockMinter()</code> the mint
                contract can never be swapped for another.
              </li>
              <li>No token id can be issued twice.</li>
              <li>
                After <code>lockConfig()</code>, the price and the accepted token are fixed.
                The price cannot be raised part-way through the mint.
              </li>
              <li>
                After <code>freezeMetadata()</code>, no owner can change what any token
                points at.
              </li>
              <li>The provenance hash is immutable from deployment.</li>
              <li>
                The secondary-sale royalty cannot exceed 10%. Without that ceiling an owner
                could set 100% after every other lock and quietly make each token
                unsellable.
              </li>
              <li>
                Ownership cannot be renounced. Several states here are only recoverable by
                the owner, and abandoning the contract in one of them would be
                unrecoverable for everyone.
              </li>
            </ul>

            <p>These are the things the owner <em>can</em> do, stated plainly:</p>
            <ul>
              <li>Pause and unpause the mint, and open or close the sale.</li>
              <li>
                Trigger the reveal, and correct the metadata URI until it is frozen.
              </li>
              <li>Change the secondary-sale royalty rate and recipient at any time.</li>
              <li>
                Recover tokens sent to the mint contract by mistake. The contract never
                holds anyone&apos;s funds during a mint — payment moves straight from buyer
                to burn — so there is nothing at risk for this to reach.
              </li>
            </ul>

            <p className={styles.caveat}>
              These contracts have <strong>not been through an independent security
              audit</strong>. They are small, they hold nobody&apos;s funds — payment moves
              straight from buyer to burn, so there is no pool to drain — and they are
              verified on the block explorer so anyone can read them. But no third party
              has reviewed them, and you should weigh that.
            </p>

            <p className={styles.caveat}>
              <strong>These contracts have not had an independent security audit.</strong>{' '}
              They are small, they hold nobody&apos;s funds — payment moves straight from
              buyer to burn — and they are verified on the block explorer so anyone can
              read them. But no third party has reviewed them, and you should weigh that
              the same way you would weigh anything else on this page.
            </p>

            <p className={styles.caveat}>
              A second residual point, stated rather than buried: <strong>the reveal is
              owner-controlled and is not gated on selling out.</strong> A contract that
              refused to reveal before 3,333 would sound stronger, but a mint that stalled
              at 3,332 could then never be revealed by anyone, ever, and every holder would
              be left owning a placeholder permanently. The provenance hash is what
              constrains us here instead: whenever the reveal happens, it proves the
              artwork behind every id was fixed before the mint opened.
            </p>
          </section>

          <section id="locks">
            <h2><span>09</span> The locks</h2>
            <p>
              Three one-way switches, each giving up a power permanently. They are called in
              this order and none can be reversed.
            </p>
            <dl className={styles.locks}>
              <div>
                <dt>lockMinter()</dt>
                <dd>
                  Fixes which contract is allowed to create tokens. Called before the mint
                  opens.
                </dd>
              </div>
              <div>
                <dt>lockConfig()</dt>
                <dd>
                  Fixes the price, the accepted token and the burn mode. The contract
                  refuses to run until at least one token has actually been minted — the
                  only on-chain proof that this exact configuration completes a mint.
                  Locking a burn path the real token rejects would leave the collection
                  unmintable forever.
                </dd>
              </div>
              <div>
                <dt>freezeMetadata()</dt>
                <dd>
                  Fixes what every token points at, forever. The contract refuses to run
                  before the reveal: freezing first would strand all 3,333 on the
                  placeholder permanently, with no way back for anyone.
                </dd>
              </div>
            </dl>
          </section>

          <section id="reference">
            <h2><span>10</span> Reference</h2>
            <dl className={styles.facts}>
              <div><dt>Collection</dt><dd>The Line · 3,333 · ERC-721</dd></div>
              <div><dt>Token ids</dt><dd>1 – 3333</dd></div>
              <div><dt>Chain</dt><dd>{CHAIN_NAME} · {CHAIN_ID}</dd></div>
              <div><dt>Price</dt><dd>150,000 $LINE per work</dd></div>
              <div><dt>Royalty</dt><dd>5% on secondary sales (ERC-2981)</dd></div>
              <div><dt>NFT contract</dt><dd><Address value={NFT_ADDRESS} /></dd></div>
              <div><dt>Mint contract</dt><dd><Address value={MINT_ADDRESS} /></dd></div>
              <div><dt>$LINE</dt><dd><Address value={LINE_ADDRESS} /></dd></div>
              <div><dt>Provenance</dt><dd><code className={styles.address}>{PROVENANCE}</code></dd></div>
            </dl>
            <p className={styles.caveat}>
              Contracts are verified on the block explorer. You do not have to take any of
              this page on faith — every claim above can be read directly from the source.
            </p>
          </section>

          <footer className={styles.foot}>
            <Link href="/mint">Go to mint</Link>
            <a href="https://x.com/thelinesart" target="_blank" rel="noreferrer">X</a>
          </footer>
        </article>
      </div>
    </main>
  )
}
