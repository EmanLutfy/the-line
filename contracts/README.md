# THE LINE — contracts

Two contracts. One holds the collection, one sells it. Neither knows more than
it has to.

| | |
|---|---|
| `src/TheLine.sol` | ERC-721 + ERC-2981, 3,333 max, ids 1–3333, pre-reveal → reveal, provenance hash |
| `src/LineMint.sol` | burns 150,000 $LINE, mints the next id |

## The design in one paragraph

There is no randomness. Ids are handed out strictly in order, so there is no
roll to re-run, nothing to simulate-and-revert, and no ordering to game. What
makes an in-order sale fair is that **the artwork behind every id stays hidden
until the whole collection is revealed** — during the mint every token returns
the same pre-reveal URI, so knowing you are about to get #1847 tells you
nothing. The `provenanceHash`, fixed at deployment and published before the
sale opens, is what proves afterwards that the assignment was decided in
advance and never rearranged.

## Setup

Foundry and OpenZeppelin both need network access, so run these in your own
Terminal:

```bash
curl -L https://foundry.paradigm.xyz | bash && foundryup

cd contracts
forge install foundry-rs/forge-std --no-commit
forge install OpenZeppelin/openzeppelin-contracts@v5.0.2 --no-commit
forge test -vvv
```

**The OpenZeppelin version is pinned on purpose.** From v5.2 onward `Strings.sol`
pulls in `Bytes.sol`, which uses `mcopy` — a Cancun opcode. Robinhood Chain runs
the Arbitrum stack, and Orbit chains do not all have Cancun enabled, so
`foundry.toml` targets Paris and an unpinned install fails to compile with
`Function "mcopy" not found`. Pinning to v5.0.2 keeps the bytecode to opcodes
every EVM chain has supported for years.

The alternative is `evm_version = "cancun"` with a current OpenZeppelin. Only do
that after confirming the chain accepts those opcodes — deploying bytecode a
chain cannot execute is not recoverable. v4 will not compile either way
(`Ownable(owner)` constructor, `_requireOwned`, `utils/Pausable.sol` are all v5).

## Prepare the collection

```bash
npm i viem
node tools/prepare-collection.mjs \
  --src ../THE_LINE_FINAL_3333_5PX_FAST \
  --out ./upload \
  --image-base ipfs://<IMAGES_CID>/
```

This rewrites the drawn collection into `upload/` and prints the provenance
hash. It changes exactly two things and preserves all eight traits:

- **Filenames lose the zero padding.** `tokenURI` is `baseURI + tokenId +
  ".json"`, and Solidity renders token 1 as `1`, never `0001`. Padded files
  would 404 for every token in the collection.
- **`image` becomes absolute.** A bare `"0001.png"` resolves against nothing
  once the JSON sits on IPFS.

Upload order matters, because the image CID has to exist before the metadata
can point at it:

1. Upload `upload/images/` → note the CID
2. Re-run the command above with `--image-base ipfs://<CID>/`
3. Upload `upload/metadata/` → note the CID
4. That second CID is what goes into `reveal()`

## Deploy (testnet 46630 first)

```bash
export OWNER_ADDRESS=0x...
export UNREVEALED_URI="ipfs://<CID>/pre-reveal.json"
export CONTRACT_URI="ipfs://<CID>/contract.json"   # see tools/contract.json.example
export PROVENANCE_HASH=0x...          # printed by prepare-collection
export ROBINHOOD_TESTNET_RPC_URL=...

forge script script/Deploy.s.sol:Deploy \
  --rpc-url robinhood_testnet --broadcast -vvvv
```

Then, in order:

```
nft.lockMinter()                                  # sale contract is now the only minter, forever
sale.configure(LINE_ADDRESS, 150000e18, true)     # third arg: does $LINE have burnFrom?
sale.lockConfig()                                 # price and token can never move again
sale.setSaleOpen(true)
```

After sold out:

```
nft.reveal("ipfs://<METADATA_CID>/")
nft.freezeMetadata()                              # one-way; nothing can be swapped after this
```

## Royalties

ERC-2981 is baked in at deployment because the interface cannot be added
afterwards — a collection that ships without it earns nothing on secondary
sales, forever, with no fix short of redeploying and asking every holder to
migrate. The rate and the recipient are a different matter: both are
changeable at any time.

```
nft.setDefaultRoyalty(<wallet>, 500)   # 500 = 5%, denominator is 10000
nft.setDefaultRoyalty(<wallet>, 250)   # 2.5%
nft.deleteDefaultRoyalty()             # none at all
```

It deploys pointing at the owner at 5%. Move it to a dedicated payout wallet
once that wallet exists. Generate that key yourself — `cast wallet new`, or a
new account in your wallet app — and never paste a private key into a chat,
an issue, or a commit.

## Reveal

Owner-controlled, deliberately. A hard `totalMinted == 3333` gate sounds more
trustless, but a mint that stalls at 3,332 could then never be revealed by
anyone, ever: holders would be left owning the pre-reveal image permanently,
with no owner call, upgrade or override able to fix it. The provenance hash is
what actually constrains the owner here — it proves the artwork behind every id
was fixed before the sale, whenever the reveal happens.

## Two things to decide before mainnet

**Does $LINE have `burnFrom`?** If it launches from a launchpad you do not
control, check. `useBurnFrom = true` is a real burn and `totalSupply()` drops.
`false` sends to `0x…dEaD` instead — the tokens leave circulation, but they
still count in `totalSupply()`. Set the flag to match reality; the contract
verifies the balance actually moved either way and reverts if it did not.

**Decimals.** `150000e18` assumes 18. If $LINE ships with a different number,
that constant is wrong by orders of magnitude.

## What the tests cover

- ids are 1, 2, 3 … across mixed buyers, and a fuzz run asserts no id is ever
  handed out twice
- supply stops at exactly 3,333
- the public cannot call `mintNext`; the minter cannot be swapped once locked
- fee-on-transfer and lying-`burnFrom` tokens are rejected instead of buying a
  free mint
- an `onERC721Received` hook cannot re-enter to mint twice off one payment
- every unrevealed token shares one URI; after reveal each resolves to its own
- a base URI typo can be corrected, and `freezeMetadata` makes it permanent
- ERC-721, ERC-2981 and ERC-165 all report through `supportsInterface`
- royalties default to 5%, can be re-pointed, re-rated or removed, and only by
  the owner
- `contractURI` survives `freezeMetadata`, because a storefront banner is not
  the artwork

## Not done yet

Not audited. Not deployed. Testnet only until both change.
