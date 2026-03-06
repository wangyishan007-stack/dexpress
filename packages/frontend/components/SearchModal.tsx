'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { TokenAvatar } from './TokenAvatar'
import { searchPools, getCachedPools } from '../lib/dexscreener-client'
import { fmtUsd, fmtPrice } from '../lib/formatters'
import type { Pool } from '@dex/shared'

function IconSearch() {
  return (
    <svg width="17" height="17" viewBox="0 0 17 17" fill="none">
      <path fillRule="evenodd" clipRule="evenodd" d="M7.5 1.5C4.18629 1.5 1.5 4.18629 1.5 7.5C1.5 10.8137 4.18629 13.5 7.5 13.5C8.90182 13.5 10.1884 13.0217 11.2175 12.2249L14.2463 15.2537C14.5244 15.5318 14.9756 15.5318 15.2537 15.2537C15.5318 14.9756 15.5318 14.5244 15.2537 14.2463L12.2249 11.2175C13.0217 10.1884 13.5 8.90182 13.5 7.5C13.5 4.18629 10.8137 1.5 7.5 1.5ZM3 7.5C3 5.01472 5.01472 3 7.5 3C9.98528 3 12 5.01472 12 7.5C12 9.98528 9.98528 12 7.5 12C5.01472 12 3 9.98528 3 7.5Z" fill="currentColor"/>
    </svg>
  )
}

function IconHistory() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M7 4.5V7.5L9 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  )
}

function IconClose() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path d="M6 6L18 18M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  )
}

// ─── Search history in localStorage ─────────────────────────

const HISTORY_KEY = 'search_history_v1'
const MAX_HISTORY = 5

interface HistoryItem {
  address: string
  symbol: string
  logoUrl: string | null
  tokenAddress: string
}

function getHistory(): HistoryItem[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]')
  } catch { return [] }
}

const QUOTE_ADDRS = new Set([
  '0x4200000000000000000000000000000000000006', // WETH
  '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', // USDC
])

function resolveBase(pool: Pool) {
  return QUOTE_ADDRS.has(pool.token0.address.toLowerCase()) ? pool.token1 : pool.token0
}
function resolveQuote(pool: Pool) {
  return QUOTE_ADDRS.has(pool.token0.address.toLowerCase()) ? pool.token0 : pool.token1
}

function addHistory(pool: Pool) {
  const base = resolveBase(pool)
  const item: HistoryItem = {
    address: pool.address,
    symbol: base.symbol,
    logoUrl: base.logo_url,
    tokenAddress: base.address,
  }
  const prev = getHistory().filter(h => h.address !== pool.address)
  localStorage.setItem(HISTORY_KEY, JSON.stringify([item, ...prev].slice(0, MAX_HISTORY)))
}

// ─── Component ──────────────────────────────────────────────

interface Props {
  open: boolean
  onClose: () => void
}

export function SearchModal({ open, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Pool[]>([])
  const [searching, setSearching] = useState(false)
  const [history, setHistory] = useState<HistoryItem[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

  // Recently updated: top pools from cache sorted by volume
  const recentTokens = useMemo(() => {
    const pools = getCachedPools()
    return [...pools].sort((a, b) => b.volume_24h - a.volume_24h).slice(0, 12)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load history from localStorage when modal opens
  useEffect(() => {
    if (open) {
      setHistory(getHistory())
      setTimeout(() => inputRef.current?.focus(), 50)
    } else {
      setQuery('')
      setResults([])
    }
  }, [open])

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    const q = query.trim()
    if (!q) {
      setResults([])
      setSearching(false)
      return
    }

    setSearching(true)

    // First: instant local filter from cached pools
    const cached = getCachedPools()
    const ql = q.toLowerCase()
    const localResults = cached.filter(p => {
      const t0 = p.token0, t1 = p.token1
      return t0.symbol.toLowerCase().includes(ql) || t0.name.toLowerCase().includes(ql) || t0.address.toLowerCase().includes(ql)
        || t1.symbol.toLowerCase().includes(ql) || t1.name.toLowerCase().includes(ql) || t1.address.toLowerCase().includes(ql)
        || p.address.toLowerCase().includes(ql)
    }).slice(0, 12)
    if (localResults.length > 0) {
      setResults(localResults)
    }

    // Then: debounced API search for broader results
    debounceRef.current = setTimeout(async () => {
      try {
        const apiResults = await searchPools(q)
        if (apiResults.length > 0) {
          // Merge: local results first (deduplicated), then API results
          const seen = new Set(localResults.map(p => p.address))
          const merged = [...localResults]
          for (const p of apiResults) {
            if (!seen.has(p.address)) {
              seen.add(p.address)
              merged.push(p)
            }
          }
          setResults(merged.slice(0, 20))
        }
      } catch { /* ignore */ }
      setSearching(false)
    }, 400)

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  const goToPair = useCallback((pool: Pool) => {
    addHistory(pool)
    onClose()
    router.push(`/pair/${pool.address}`)
  }, [onClose, router])

  const goToHistory = useCallback((item: HistoryItem) => {
    onClose()
    router.push(`/pair/${item.address}`)
  }, [onClose, router])

  if (!open) return null

  const showResults = query.trim().length > 0

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[80px]">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Modal */}
      <div
        className="relative rounded-xl border border-border bg-[#111] shadow-2xl w-[820px] max-w-[90vw] flex flex-col p-6"
        style={{ maxHeight: '80vh' }}
      >
        {/* Search input bar */}
        <div
          className="flex items-center h-[50px] rounded-full px-4 flex-shrink-0 border border-border bg-transparent"
        >
          <span className="text-sub flex-shrink-0 mr-2"><IconSearch /></span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by token name, symbol, or address"
            className="flex-1 bg-transparent text-[14px] text-text placeholder-sub outline-none"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="text-sub hover:text-text transition-colors ml-2"
            >
              <IconClose />
            </button>
          )}
        </div>

        {/* Scrollable content */}
        <div className="flex-1 min-h-0 overflow-y-auto mt-5">
          {showResults ? (
            /* Search results */
            <div>
              <p className="text-[14px] font-bold text-text mb-4">
                Search Results
                {searching && <span className="ml-2 text-sub font-normal">searching...</span>}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {results.map(pool => (
                  <TokenCard key={pool.address} pool={pool} onClick={() => goToPair(pool)} />
                ))}
              </div>
              {results.length === 0 && !searching && (
                <p className="text-[14px] text-sub text-center py-8">No results found</p>
              )}
            </div>
          ) : (
            /* Default: history + recently updated */
            <>
              {/* History */}
              {history.length > 0 && (
                <div className="flex items-center gap-3 px-2 mb-5 flex-wrap">
                  <div className="flex items-center gap-[7px]">
                    <span className="text-sub"><IconHistory /></span>
                    <span className="text-[14px] text-sub">History</span>
                  </div>
                  {history.map(item => (
                    <button
                      key={item.address}
                      onClick={() => goToHistory(item)}
                      className="flex items-center gap-1 hover:opacity-80 transition-opacity"
                    >
                      <TokenAvatar symbol={item.symbol} logoUrl={item.logoUrl} address={item.tokenAddress} size={18} />
                      <span className="text-[14px] text-sub">${item.symbol}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Top Tokens by Volume */}
              <p className="text-[14px] font-bold text-text mb-4">Top Tokens</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {recentTokens.map(pool => (
                  <TokenCard key={pool.address} pool={pool} onClick={() => goToPair(pool)} />
                ))}
              </div>
              {recentTokens.length === 0 && (
                <p className="text-[14px] text-sub text-center py-8">Loading...</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function TokenCard({ pool, onClick }: { pool: Pool; onClick: () => void }) {
  const base = resolveBase(pool)
  const quote = resolveQuote(pool)
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 p-3 rounded-lg text-left hover:bg-white/5 transition-colors border border-border/50"
    >
      <TokenAvatar symbol={base.symbol} logoUrl={base.logo_url} address={base.address} size={40} rounded="md" />
      <div className="flex flex-col gap-1 min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[13px] font-bold text-text truncate">${base.symbol}</span>
          <span className="text-[11px] text-sub">/ {quote.symbol}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-sub">{fmtPrice(pool.price_usd)}</span>
          <span className="text-[11px] text-sub">Vol {fmtUsd(pool.volume_24h)}</span>
        </div>
      </div>
    </button>
  )
}
