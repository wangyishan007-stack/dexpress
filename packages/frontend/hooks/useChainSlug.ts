'use client'

import { usePathname } from 'next/navigation'
import { SUPPORTED_CHAINS, DEFAULT_CHAIN, type ChainSlug } from '@/lib/chains'

/** Extract chain slug from current pathname. For use outside ChainProvider (e.g. Sidebar). */
export function useChainSlug(): ChainSlug {
  const pathname = usePathname()
  const seg = pathname.split('/')[1] || ''
  if (SUPPORTED_CHAINS.includes(seg as ChainSlug)) return seg as ChainSlug
  return DEFAULT_CHAIN
}
