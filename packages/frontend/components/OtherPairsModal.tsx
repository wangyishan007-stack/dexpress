'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { MOCK_POOLS } from '../lib/mockData'
import { fmtUsd, fmtAge, shortAddr } from '../lib/formatters'
import { useWatchlist } from '../hooks/useWatchlist'

interface Props {
  open: boolean
  onClose: () => void
  currentAddress: string
  tokenAddress: string
}

export function OtherPairsModal({ open, onClose, currentAddress, tokenAddress }: Props) {
  const [query, setQuery] = useState('')
  const { lists, activeListId, setActiveList, toggle } = useWatchlist()
  const isInAnyList = (addr: string) => lists.some(l => l.pairIds.includes(addr))

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Filter pairs that contain the same token
  const otherPairs = useMemo(() => {
    return MOCK_POOLS.filter(
      (p) =>
        p.address !== currentAddress &&
        (p.token0.address.toLowerCase() === tokenAddress.toLowerCase() ||
          p.token1.address.toLowerCase() === tokenAddress.toLowerCase())
    )
  }, [currentAddress, tokenAddress])

  // If no other pairs with same token, show all pairs as fallback
  const displayPairs = otherPairs.length > 0 ? otherPairs : MOCK_POOLS.filter(p => p.address !== currentAddress)

  const filtered = useMemo(() => {
    if (!query.trim()) return displayPairs
    const q = query.toLowerCase()
    return displayPairs.filter(
      (p) =>
        p.token0.symbol.toLowerCase().includes(q) ||
        p.token1.symbol.toLowerCase().includes(q) ||
        p.token0.name?.toLowerCase().includes(q) ||
        p.token1.name?.toLowerCase().includes(q) ||
        p.address.toLowerCase().includes(q)
    )
  }, [displayPairs, query])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Modal */}
      <div className="relative rounded-xl border border-border bg-[#111] shadow-2xl p-6 w-full max-w-[800px] max-h-[80vh] flex flex-col gap-5">
        {/* Search bar */}
        <div className="flex items-center justify-between border border-border rounded-lg h-[40px] px-3 flex-shrink-0">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-sub flex-shrink-0">
              <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.3"/>
              <path d="M9.5 9.5l3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search for coin"
              className="flex-1 bg-transparent text-[14px] text-text placeholder:text-sub outline-none"
              autoFocus
            />
          </div>
          {query && (
            <button
              onClick={() => setQuery('')}
              className="bg-[#333] rounded-full px-3 h-[30px] text-[14px] text-blue hover:text-blue/80 transition-colors flex-shrink-0"
            >
              Clear
            </button>
          )}
        </div>

        {/* Pair list */}
        <div className="flex flex-col gap-3 overflow-y-auto flex-1 min-h-0">
          {filtered.length === 0 && (
            <div className="flex items-center justify-center py-8 text-sub text-[13px]">
              No other pairs found.
            </div>
          )}

          {filtered.map((p, i) => {
            const base = p.token0
            const quote = p.token1
            const change24h = Number(p.change_24h)
            const isPos = Number.isFinite(change24h) && change24h > 0
            const isNeg = Number.isFinite(change24h) && change24h < 0
            const dexLabel = p.dex === 'uniswap_v3' ? 'V3' : p.dex === 'uniswap_v4' ? 'V4' : 'Aero'

            return (
              <Link
                key={p.address}
                href={`/pair/${p.address}`}
                onClick={onClose}
                className="flex items-center gap-4 p-4 rounded-lg transition-colors border border-border hover:border-blue"
              >
                {/* Left: Chain + DEX icons + Token avatar */}
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="flex flex-col gap-1.5 items-center w-4">
                    <div className="w-4 h-4 rounded-sm bg-[#0021f5]" />
                    <div className="w-4 h-4 rounded-sm bg-muted" />
                  </div>
                  <div className="w-[54px] h-[54px] rounded bg-muted flex-shrink-0 overflow-hidden">
                    <div className="w-full h-full bg-muted" />
                  </div>
                </div>

                {/* Middle: Pair info */}
                <div className="flex flex-col gap-3 flex-1 min-w-0">
                  {/* Row 1: Name + Price + 24H change */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[14px]">
                      <span>
                        <span className="font-bold text-text">${base.symbol}</span>
                        <span className="text-sub">/{quote.symbol}</span>
                      </span>
                      <span className="text-text">{base.name || base.symbol}</span>
                    </div>
                    <div className="flex items-center gap-3 text-[14px]">
                      <span className="font-bold text-text">{fmtUsd(p.price_usd)}</span>
                      <span>
                        <span className="text-sub">24H: </span>
                        <span className={`font-bold ${isPos ? 'text-green' : isNeg ? 'text-red' : 'text-sub'}`}>
                          {Number.isFinite(change24h) ? `${isPos ? '+' : ''}${change24h.toFixed(2)}%` : '—'}
                        </span>
                      </span>
                    </div>
                  </div>

                  {/* Row 2: Tags */}
                  <div className="flex items-center gap-1.5 text-[12px]">
                    <span className="border border-[#333] rounded px-2 py-1">
                      <span className="text-sub">Market Cap: </span>
                      <span className="font-bold text-text">{Number(p.mcap_usd) > 0 ? fmtUsd(p.mcap_usd) : '—'}</span>
                    </span>
                    <span className="border border-[#333] rounded px-2 py-1">
                      <span className="text-sub">Liquidity: </span>
                      <span className="font-bold text-text">{fmtUsd(p.liquidity_usd)}</span>
                    </span>
                    <span className="border border-[#333] rounded px-2 py-1">
                      <span className="text-sub">24H Vol: </span>
                      <span className="font-bold text-text">{fmtUsd(p.volume_24h)}</span>
                    </span>
                    <span className="border border-[#333] rounded px-2 py-1">
                      <span className="text-sub">Age: </span>
                      <span className="font-bold text-text">{p.created_at ? fmtAge(p.created_at) : '—'}</span>
                    </span>
                  </div>
                </div>

                {/* Right: Addresses */}
                <div className="hidden md:flex flex-col gap-2.5 text-[14px] text-[#666] flex-shrink-0 w-[127px] text-right">
                  <span>Pair: {shortAddr(p.address)}</span>
                  <span>Token: {shortAddr(base.address)}</span>
                </div>

                {/* Star button — watchlist toggle */}
                <button
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    toggle(p.address)
                  }}
                  className="bg-[#333] rounded-lg w-8 h-8 flex items-center justify-center flex-shrink-0 hover:bg-[#444] transition-colors"
                >
                  {isInAnyList(p.address) ? (
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="#ffd166">
                      <path d="M7 1.5l1.8 3.6 4 .6-2.9 2.8.7 4L7 10.7 3.4 12.5l.7-4L1.2 5.7l4-.6L7 1.5z"/>
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#666" strokeWidth="1.2">
                      <path d="M7 1.5l1.8 3.6 4 .6-2.9 2.8.7 4L7 10.7 3.4 12.5l.7-4L1.2 5.7l4-.6L7 1.5z"/>
                    </svg>
                  )}
                </button>
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
