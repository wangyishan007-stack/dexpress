'use client'

import { createContext, useContext, type ReactNode } from 'react'
import { getChain, type ChainSlug, type ChainConfig } from '@/lib/chains'

interface ChainContextValue {
  chain: ChainSlug
  chainConfig: ChainConfig
  isAllChains: boolean
}

const ChainContext = createContext<ChainContextValue>({
  chain: 'base',
  chainConfig: getChain('base'),
  isAllChains: false,
})

export function ChainProvider({
  initialChain,
  isAllChains = false,
  children,
}: {
  initialChain: ChainSlug
  isAllChains?: boolean
  children: ReactNode
}) {
  const value: ChainContextValue = {
    chain: initialChain,
    chainConfig: getChain(initialChain),
    isAllChains,
  }
  return <ChainContext.Provider value={value}>{children}</ChainContext.Provider>
}

export function useChain(): ChainContextValue {
  return useContext(ChainContext)
}
