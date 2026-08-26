import { ReactNode } from 'react'
import { MintProviders } from './providers'

export const metadata = {
  title: 'Mint — The Line',
  description: '3,333 unique interpretations. 150,000 $LINE to collect one.',
}

export default function MintLayout({ children }: { children: ReactNode }) {
  return <MintProviders>{children}</MintProviders>
}
