import { defineChain } from 'viem'

/**
 * Robinhood Chain. Everything the browser needs is public, so it all arrives
 * through NEXT_PUBLIC_ vars — there are no secrets on this page.
 */
export const robinhoodMainnet = defineChain({
  id: 4663,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [process.env.NEXT_PUBLIC_RPC_URL_MAINNET || ''] } },
  blockExplorers: {
    default: { name: 'Blockscout', url: 'https://robinhoodchain.blockscout.com' },
  },
})

export const robinhoodTestnet = defineChain({
  id: 46630,
  name: 'Robinhood Chain Testnet',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [process.env.NEXT_PUBLIC_RPC_URL_TESTNET || ''] } },
  blockExplorers: {
    default: { name: 'Explorer', url: 'https://explorer.testnet.chain.robinhood.com' },
  },
  testnet: true,
})

const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 46630)
export const activeChain = chainId === robinhoodMainnet.id ? robinhoodMainnet : robinhoodTestnet

/** An unset address reads as absent rather than as the zero address. */
function address(value: string | undefined): `0x${string}` | undefined {
  return value && /^0x[a-fA-F0-9]{40}$/.test(value) ? (value as `0x${string}`) : undefined
}

export const nftAddress = address(process.env.NEXT_PUBLIC_NFT_ADDRESS)
export const mintAddress = address(process.env.NEXT_PUBLIC_MINT_ADDRESS)

/**
 * $LINE does not exist yet, and the page has to render correctly in that world:
 * the collection is announced, the mint is visibly not open, and nothing
 * pretends otherwise.
 */
export const lineAddress = address(process.env.NEXT_PUBLIC_LINE_ADDRESS)

export const MAX_SUPPLY = 3333

/**
 * OpenSea's path segment for this chain is not something to guess — a wrong
 * slug produces a link that 404s on the collector's proudest moment. Left as
 * configuration, with the block explorer as the fallback.
 */
export function tokenUrl(tokenId: bigint | number): string {
  const base = process.env.NEXT_PUBLIC_OPENSEA_BASE
  if (base && nftAddress) return `${base.replace(/\/$/, '')}/${nftAddress}/${tokenId}`
  if (nftAddress) return `${activeChain.blockExplorers.default.url}/token/${nftAddress}/instance/${tokenId}`
  return activeChain.blockExplorers.default.url
}

/**
 * Where to send someone who is short of $LINE. Configured as a template with
 * a {token} placeholder rather than hardcoded, because the exchange holding
 * the pool is not known yet and should never require a code change:
 *
 *   NEXT_PUBLIC_SWAP_URL=https://somedex.xyz/swap?outputCurrency={token}
 *
 * Empty means the button is not shown at all. A link that goes nowhere useful
 * is worse than no link on the one screen where someone is already stuck.
 */
export function swapUrl(): string | undefined {
  const template = process.env.NEXT_PUBLIC_SWAP_URL
  if (!template || !lineAddress) return undefined
  return template.replace('{token}', lineAddress)
}

export function txUrl(hash: string): string {
  return `${activeChain.blockExplorers.default.url}/tx/${hash}`
}
