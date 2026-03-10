'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { getCachedPools } from '../lib/dexscreener-client'
import { useWatchlist } from '../hooks/useWatchlist'
import { TokenAvatar } from './TokenAvatar'

const QUOTE_ADDRS = new Set([
  '0x4200000000000000000000000000000000000006',
  '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
  '0xfde4c96c8593536e31f229ea8f37b2ada2699bb2',
  '0x50c5725949a6f0c72e6c4a641f24049a917db0cb',
])

interface Props {
  open: boolean
  onClose: () => void
}

export function AddPairModal({ open, onClose }: Props) {
  const tModal = useTranslations('modals')
  const tCommon = useTranslations('common')
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)
  const { toggle, isWatched } = useWatchlist()

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50)
    else setQuery('')
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  const allPools = useMemo(() => getCachedPools(), [open])
  const results = useMemo(() => {
    if (!query.trim()) return allPools.slice(0, 20)
    const q = query.toLowerCase()
    return allPools.filter(p => {
      const t0 = p.token0, t1 = p.token1
      return (
        t0.symbol.toLowerCase().includes(q) ||
        t0.name.toLowerCase().includes(q) ||
        t0.address.toLowerCase().includes(q) ||
        t1.symbol.toLowerCase().includes(q) ||
        t1.name.toLowerCase().includes(q) ||
        t1.address.toLowerCase().includes(q) ||
        p.address.toLowerCase().includes(q)
      )
    }).slice(0, 20)
  }, [query, allPools])

  if (!open) return null

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60"
      onClick={(e) => { if (e.target === backdropRef.current) onClose() }}
    >
      <div className="w-full max-w-[520px] mx-4 rounded-xl border border-border bg-[#111] shadow-2xl flex flex-col" style={{ maxHeight: '80vh' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-[16px] font-bold text-text">{tModal('addPairTitle')}</h2>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-[28px] h-[28px] rounded-md text-sub hover:text-text hover:bg-border/40 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Search */}
        <div className="px-5 py-3 border-b border-border">
          <div className="flex items-center h-[40px] rounded-full border border-border px-3 gap-2">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-sub flex-shrink-0">
              <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.3"/>
              <path d="M9.5 9.5l3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tModal('searchPlaceholder')}
              className="flex-1 bg-transparent text-[14px] text-text placeholder:text-sub outline-none"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="text-[13px] text-blue hover:text-blue/80 transition-colors flex-shrink-0"
              >
                {tCommon('clear')}
              </button>
            )}
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {results.length === 0 && (
            <div className="flex items-center justify-center py-8 text-sub text-[13px]">
              {allPools.length === 0 ? tModal('loadingPairs') : tModal('noPairsFound')}
            </div>
          )}

          {results.map((p) => {
            const base = QUOTE_ADDRS.has(p.token0.address.toLowerCase()) ? p.token1 : p.token0
            const watched = isWatched(p.address)

            return (
              <button
                key={p.address}
                onClick={() => toggle(p.address)}
                className="flex items-center gap-3 w-full px-5 py-3 text-left hover:bg-white/5 transition-colors border-b border-border/50 last:border-0"
              >
                {/* Token avatar */}
                <TokenAvatar symbol={base.symbol} logoUrl={base.logo_url} address={base.address} size={36} rounded="md" />

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-[14px]">
                    <span className="font-bold text-text">${base.symbol}</span>
                    <span className="text-sub truncate">{base.name}</span>
                  </div>
                  <div className="text-[12px] text-[#666] font-mono truncate">{p.address}</div>
                </div>

                {/* Watch status */}
                <div className={`flex items-center justify-center w-[28px] h-[28px] rounded-md flex-shrink-0 transition-colors ${
                  watched ? 'bg-blue/20 text-blue' : 'bg-border/30 text-sub'
                }`}>
                  {watched ? (
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M2.5 7l3 3 6-6.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M7 3v8M3 7h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
