'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { MOCK_POOLS } from '../lib/mockData'
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

function addrToHue(address: string): number {
  let h = 0
  for (let i = 2; i < address.length; i++) h = (h * 31 + address.charCodeAt(i)) & 0xffff
  return h % 360
}

function TokenAvatar({ symbol, logoUrl, address, size = 40 }: { symbol: string; logoUrl: string | null; address: string; size?: number }) {
  const hue = addrToHue(address)
  return (
    <div
      className="relative flex items-center justify-center rounded-[4px] overflow-hidden flex-shrink-0"
      style={{ backgroundColor: `hsl(${hue},55%,20%)`, width: size, height: size }}
    >
      <span
        className="font-bold select-none"
        style={{ color: `hsl(${hue},70%,72%)`, fontSize: size * 0.35 }}
      >
        {symbol.slice(0, 2).toUpperCase()}
      </span>
      {logoUrl && (
        <img
          src={logoUrl}
          alt={symbol}
          width={size}
          height={size}
          className="absolute inset-0 rounded-[4px] object-cover"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
        />
      )}
    </div>
  )
}

interface Props {
  open: boolean
  onClose: () => void
}

export function SearchModal({ open, onClose }: Props) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  // History: use first 3 tokens as mock history
  const history = useMemo(() => MOCK_POOLS.slice(0, 3), [])

  // Search results: filter mock pools by query
  const results = useMemo(() => {
    if (!query.trim()) return []
    const q = query.toLowerCase()
    return MOCK_POOLS.filter(p => {
      const base = p.token1
      return base.symbol.toLowerCase().includes(q) || base.name.toLowerCase().includes(q) || base.address.toLowerCase().includes(q)
    }).slice(0, 12)
  }, [query])

  // Recently updated: show 12 tokens when no search query
  const recentTokens = useMemo(() => MOCK_POOLS.slice(0, 12), [])

  // Auto-focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50)
    } else {
      setQuery('')
    }
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  const goToPair = useCallback((pool: Pool) => {
    onClose()
    router.push(`/pair/${pool.address}`)
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
          className="flex items-center h-[50px] rounded-[100px] px-4 flex-shrink-0 border border-border bg-transparent"
        >
          <span className="text-sub flex-shrink-0 mr-2"><IconSearch /></span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search for coin"
            className="flex-1 bg-transparent text-[14px] text-text placeholder-sub outline-none"
          />
          {query ? (
            <button
              onClick={() => setQuery('')}
              className="text-sub hover:text-text transition-colors ml-2"
            >
              <IconClose />
            </button>
          ) : (
            <button className="flex items-center justify-center h-[30px] px-3 rounded-[100px] ml-2" style={{ backgroundColor: '#333' }}>
              <span className="text-[14px] text-blue">Search</span>
            </button>
          )}
        </div>

        {/* Scrollable content */}
        <div className="flex-1 min-h-0 overflow-y-auto mt-5">
          {showResults ? (
            /* Search results */
            <div>
              <p className="text-[14px] font-bold text-text mb-4">Search Results</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {results.map(pool => (
                  <TokenCard key={pool.address} pool={pool} onClick={() => goToPair(pool)} />
                ))}
              </div>
              {results.length === 0 && (
                <p className="text-[14px] text-sub text-center py-8">No results found</p>
              )}
            </div>
          ) : (
            /* Default: history + recently updated */
            <>
              {/* History */}
              <div className="flex items-center gap-3 px-2 mb-5 flex-wrap">
                <div className="flex items-center gap-[7px]">
                  <span className="text-sub"><IconHistory /></span>
                  <span className="text-[14px] text-sub">History</span>
                </div>
                {history.map(pool => {
                  const base = pool.token1
                  return (
                    <button
                      key={pool.address}
                      onClick={() => goToPair(pool)}
                      className="flex items-center gap-1 hover:opacity-80 transition-opacity"
                    >
                      <TokenAvatar symbol={base.symbol} logoUrl={base.logo_url} address={base.address} size={18} />
                      <span className="text-[14px] text-sub">${base.symbol}</span>
                    </button>
                  )
                })}
              </div>

              {/* Recently Updated Token Info */}
              <p className="text-[14px] font-bold text-text mb-4">Recently Updated Token Info</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {recentTokens.map(pool => (
                  <TokenCard key={pool.address} pool={pool} onClick={() => goToPair(pool)} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function TokenCard({ pool, onClick }: { pool: Pool; onClick: () => void }) {
  const base = pool.token1
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-4 p-2 rounded-[8px] text-left hover:bg-white/5 transition-colors"
      style={{ border: '1px solid #333' }}
    >
      <TokenAvatar symbol={base.symbol} logoUrl={base.logo_url} address={base.address} size={64} />
      <div className="flex flex-col gap-2 min-w-0">
        <span className="text-[14px] font-bold text-text truncate">{base.name}</span>
        <div className="flex items-center gap-[5px]">
          <div className="w-[14px] h-[14px] rounded-[1px] bg-[#0021F5] flex-shrink-0" />
          <span className="text-[14px] text-sub">Base</span>
        </div>
        <div className="flex items-center gap-1">
          <IconWeb />
          <IconX />
          <IconTelegram />
        </div>
      </div>
    </button>
  )
}

function IconWeb() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="5.5" stroke="#999" strokeWidth="1"/>
      <path d="M1.5 7H12.5M7 1.5C8.5 3.5 8.5 10.5 7 12.5M7 1.5C5.5 3.5 5.5 10.5 7 12.5" stroke="#999" strokeWidth="1"/>
    </svg>
  )
}

function IconX() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M8.36 5.93L12.05 1.75H11.1L7.94 5.33L5.43 1.75H2L5.87 7.35L2 11.75H2.95L6.29 7.95L8.94 11.75H12.37L8.36 5.93ZM6.77 7.41L6.35 6.81L3.28 2.45H5.01L7.15 5.6L7.57 6.2L11.1 11.09H9.37L6.77 7.41Z" fill="#999"/>
    </svg>
  )
}

function IconTelegram() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M11.78 2.56L10.14 11.09C10.14 11.09 9.91 11.66 9.28 11.39L6.02 8.87L4.73 8.25L2.37 7.49C2.37 7.49 2 7.36 1.97 7.09C1.94 6.82 2.38 6.67 2.38 6.67L11.08 3.22C11.08 3.22 11.78 2.92 11.78 3.39V2.56Z" fill="#999"/>
    </svg>
  )
}
