'use client'

import { ReactNode, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider, createConfig, http } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { activeChain } from './chain'

/**
 * Scoped to /mint by app/mint/layout.tsx on purpose. Wallet libraries are the
 * heaviest thing on the site, and a visitor reading about the work should
 * never pay to download them.
 */
const config = createConfig({
  chains: [activeChain],
  connectors: [injected()],
  transports: { [activeChain.id]: http(process.env.NEXT_PUBLIC_RPC_URL || undefined) },
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
