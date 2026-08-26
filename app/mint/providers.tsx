'use client'

import { ReactNode, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider, createConfig, http } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { robinhoodMainnet, robinhoodTestnet } from './chain'

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
  transports: {
    [robinhoodMainnet.id]: http(),
    [robinhoodTestnet.id]: http(),
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
