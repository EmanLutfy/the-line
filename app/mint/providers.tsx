'use client'

import { ReactNode, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider, createConfig, http } from 'wagmi'
import { fallback } from 'viem'
import { injected } from 'wagmi/connectors'
import { MAINNET_RPCS, TESTNET_RPCS, robinhoodMainnet, robinhoodTestnet } from './chain'

/**
 * Scoped to /mint by app/mint/layout.tsx on purpose. Wallet libraries are the
 * heaviest thing on the site, and a visitor reading about the work should
 * never pay to download them.
 */
// Both chains are registered even though only one is live at a time. Keying a
// transport off `activeChain.id` looked tidier but does not type-check: the
// active chain is a union, so the computed key produces a partial record and
// wagmi requires every chain to have one. Registering both is the better shape
// anyway — a visitor already connected to the other network is recognised and
// offered a switch, instead of arriving on a chain the app has never heard of.
//
// Each chain carries its own RPC (see chain.ts). One endpoint cannot serve two
// networks, so there is no single URL to share between them.
const config = createConfig({
  chains: [robinhoodMainnet, robinhoodTestnet],
  connectors: [injected()],
  // Each chain gets its own endpoints, primary first. viem's `fallback` moves
  // to the next URL on a transport error, so if the metered key is throttled or
  // its allowlist rejects a request, reads keep working on Robinhood's public
  // endpoint instead of the page filling with em-dashes on launch night. The
  // chain itself is never the thing at risk here — only our view of it.
  transports: {
    [robinhoodMainnet.id]: fallback(MAINNET_RPCS.map((url) => http(url))),
    [robinhoodTestnet.id]: fallback(TESTNET_RPCS.map((url) => http(url))),
  },
  ssr: true,
})

export function MintProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
  }))

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  )
}
