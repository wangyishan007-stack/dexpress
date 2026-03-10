import { notFound } from 'next/navigation'
import { SUPPORTED_CHAINS, DEFAULT_CHAIN, type ChainSlug } from '@/lib/chains'
import { ChainProvider } from '@/contexts/ChainContext'

const VALID_PARAMS = [...SUPPORTED_CHAINS, 'all'] as const

export function generateStaticParams() {
  return VALID_PARAMS.map(chain => ({ chain }))
}

export default function ChainLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: { chain: string }
}) {
  if (!VALID_PARAMS.includes(params.chain as any)) {
    notFound()
  }
  const isAll = params.chain === 'all'
  const chainSlug = isAll ? DEFAULT_CHAIN : (params.chain as ChainSlug)
  return (
    <ChainProvider initialChain={chainSlug} isAllChains={isAll}>
      {children}
    </ChainProvider>
  )
}
