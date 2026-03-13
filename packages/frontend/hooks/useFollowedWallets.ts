'use client'

import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import type { ReactNode } from 'react'
import React from 'react'
import { STORAGE_KEY, MAX_FOLLOWED_WALLETS, type FollowedWallet, type FollowedWalletsState } from '@/lib/copyTrade'
import type { ChainSlug } from '@/lib/chains'

interface FollowedWalletsCtx {
  wallets: FollowedWallet[]
  follow: (address: string, chain: ChainSlug) => void
  unfollow: (address: string) => void
  isFollowing: (address: string) => boolean
  count: number
  isFull: boolean
}

const defaultCtx: FollowedWalletsCtx = {
  wallets: [],
  follow: () => {},
  unfollow: () => {},
  isFollowing: () => false,
  count: 0,
  isFull: false,
}

const FollowedWalletsContext = createContext<FollowedWalletsCtx>(defaultCtx)

// EVM addresses are case-insensitive; Solana base58 are case-sensitive
function addrMatch(a: string, b: string): boolean {
  if (a.startsWith('0x') && b.startsWith('0x')) return a.toLowerCase() === b.toLowerCase()
  return a === b
}

function makeDefault(): FollowedWalletsState {
  return { version: 1, wallets: [] }
}

export function FollowedWalletsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<FollowedWalletsState>(makeDefault)
  const [hydrated, setHydrated] = useState(false)

  // Hydrate from localStorage — filter out obviously fake/mock addresses
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed && Array.isArray(parsed.wallets)) {
          // Remove fake addresses from old mock data (signature: contain "1234567890")
          const cleaned = parsed.wallets.filter((w: FollowedWallet) => {
            if (!w.address || typeof w.address !== 'string') return false
            const addr = w.address.toLowerCase()
            // Mock addresses contain sequential digit runs like "1234567890"
            if (addr.includes('1234567890') || addr.includes('0123456789')) return false
            // Must be valid EVM hex or Solana base58
            if (!/^0x[0-9a-f]{40}$/i.test(addr) && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(w.address)) return false
            return true
          })
          if (cleaned.length !== parsed.wallets.length) {
            console.log(`[follow] Cleaned ${parsed.wallets.length - cleaned.length} invalid wallet(s) from storage`)
          }
          setState({ version: 1, wallets: cleaned })
        }
      }
    } catch {}
    setHydrated(true)
  }, [])

  // Persist
  useEffect(() => {
    if (!hydrated) return
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [state, hydrated])

  const follow = useCallback((address: string, chain: ChainSlug) => {
    // Validate address: EVM hex or Solana base58
    const isEvm = /^0x[0-9a-f]{40}$/i.test(address)
    const isSolana = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)
    if (!isEvm && !isSolana) return
    setState(prev => {
      if (prev.wallets.length >= MAX_FOLLOWED_WALLETS) return prev
      if (prev.wallets.some(w => addrMatch(w.address, address))) return prev
      return {
        ...prev,
        wallets: [...prev.wallets, { address, chain, followedAt: new Date().toISOString() }],
      }
    })
  }, [])

  const unfollow = useCallback((address: string) => {
    setState(prev => ({
      ...prev,
      wallets: prev.wallets.filter(w => !addrMatch(w.address, address)),
    }))
  }, [])

  const isFollowing = useCallback(
    (address: string) => {
      return state.wallets.some(w => addrMatch(w.address, address))
    },
    [state.wallets]
  )

  const count = state.wallets.length
  const isFull = count >= MAX_FOLLOWED_WALLETS

  const ctx = useMemo<FollowedWalletsCtx>(() => ({
    wallets: state.wallets,
    follow,
    unfollow,
    isFollowing,
    count,
    isFull,
  }), [state.wallets, follow, unfollow, isFollowing, count, isFull])

  return React.createElement(FollowedWalletsContext.Provider, { value: ctx }, children)
}

export function useFollowedWallets() {
  return useContext(FollowedWalletsContext)
}
