'use client'

import { useState, useEffect, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import useSWR from 'swr'
import { fetchPoolsByToken } from '../lib/dexscreener-client'
import { fmtUsd, fmtAge, shortAddr } from '../lib/formatters'
import { useWatchlist } from '../hooks/useWatchlist'
import type { Pool } from '@dex/shared'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import { useChain } from '@/contexts/ChainContext'
import { isQuoteToken, getDexInfo } from '@/lib/chains'

interface Props {
  open: boolean
  onClose: () => void
  currentAddress: string
  tokenAddress: string
}

export function OtherPairsModal({ open, onClose, currentAddress, tokenAddress }: Props) {
  useBodyScrollLock(open)
  const { chain, chainConfig } = useChain()
  const tModal = useTranslations('modals')
  const tCommon = useTranslations('common')
  const tDetail = useTranslations('pairDetail')
  const [query, setQuery] = useState('')
  const { lists, toggle } = useWatchlist()
  const isInAnyList = (addr: string) => lists.some(l => l.pairIds.includes(addr))

  const { data: pools, isLoading } = useSWR<Pool[]>(
    open && tokenAddress ? `other-pairs-${chain}:${tokenAddress}` : null,
    () => fetchPoolsByToken(tokenAddress, chain),
    { dedupingInterval: 120_000, revalidateOnFocus: false }
  )

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Exclude current pair
  const otherPairs = useMemo(() => {
    if (!pools) return []
    return pools.filter(p => p.address.toLowerCase() !== currentAddress.toLowerCase())
  }, [pools, currentAddress])

  const filtered = useMemo(() => {
    if (!query.trim()) return otherPairs
    const q = query.toLowerCase()
    return otherPairs.filter(
      (p) =>
        p.token0.symbol.toLowerCase().includes(q) ||
        p.token1.symbol.toLowerCase().includes(q) ||
        p.token0.name?.toLowerCase().includes(q) ||
        p.token1.name?.toLowerCase().includes(q) ||
        p.address.toLowerCase().includes(q)
    )
  }, [otherPairs, query])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60" onClick={onClose}>
      {/* Modal */}
      <div
        className="relative rounded-xl border border-border bg-[#111] shadow-2xl w-full max-w-[800px] max-h-[85vh] flex flex-col mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 md:px-6 py-3 border-b border-border flex-shrink-0">
          <span className="text-[16px] font-bold text-text">{tModal('otherPairsTitle')}</span>
          <button
            onClick={onClose}
            className="w-[28px] h-[28px] rounded-md flex items-center justify-center text-sub hover:text-text hover:bg-border/40 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M3 3l8 8M11 3l-8 8"/>
            </svg>
          </button>
        </div>

        {/* Search bar */}
        <div className="px-4 md:px-6 py-3 flex-shrink-0">
          <div className="flex items-center border border-border rounded-lg h-[36px] md:h-[40px] px-3">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-sub flex-shrink-0">
              <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.3"/>
              <path d="M9.5 9.5l3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tModal('searchForCoin')}
              className="flex-1 bg-transparent text-[13px] md:text-[14px] text-text placeholder:text-sub outline-none ml-2"
              autoFocus
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="bg-border rounded-full px-2.5 h-[26px] text-[12px] text-blue hover:text-blue/80 transition-colors flex-shrink-0"
              >
                {tCommon('clear')}
              </button>
            )}
          </div>
        </div>

        {/* Pair list */}
        <div className="flex flex-col gap-2 md:gap-3 overflow-y-auto flex-1 min-h-0 px-4 md:px-6 pb-4">
          {isLoading && (
            <div className="flex items-center justify-center py-8 text-sub text-[13px]">
              {tModal('loadingPairs')}
            </div>
          )}

          {!isLoading && filtered.length === 0 && (
            <div className="flex items-center justify-center py-8 text-sub text-[13px]">
              {tModal('noOtherPairs')}
            </div>
          )}

          {filtered.map((p) => {
            const base = isQuoteToken(chain, p.token0.address) ? p.token1 : p.token0
            const quote = isQuoteToken(chain, p.token0.address) ? p.token0 : p.token1
            const change24h = Number(p.change_24h)
            const isPos = Number.isFinite(change24h) && change24h > 0
            const isNeg = Number.isFinite(change24h) && change24h < 0
            const dexInfo = getDexInfo(p.dex)

            return (
              <Link
                key={p.address}
                href={`/${chain}/pair/${p.address}`}
                onClick={onClose}
                className="flex items-center gap-3 md:gap-4 p-3 md:p-4 rounded-lg transition-colors border border-border hover:border-blue"
              >
                {/* Left: Chain + DEX icons + Token avatar */}
                <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
                  <div className="flex flex-col gap-1.5 items-center w-4">
                    <img src={chainConfig.icon} alt={chainConfig.name} className="w-4 h-4" />
                    {dexInfo.icon ? (
                      <img src={dexInfo.icon} alt={dexInfo.shortLabel} className="w-4 h-4" />
                    ) : (
                      <span className="text-[9px] font-bold text-sub leading-none">{dexInfo.shortLabel}</span>
                    )}
                  </div>
                  <div className="w-[40px] h-[40px] md:w-[54px] md:h-[54px] rounded bg-muted flex-shrink-0 overflow-hidden">
                    {base.logo_url ? (
                      <img src={base.logo_url} alt={base.symbol} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-muted flex items-center justify-center text-sub text-[14px] md:text-[18px] font-bold">
                        {base.symbol?.charAt(0) || '?'}
                      </div>
                    )}
                  </div>
                </div>

                {/* Middle: Pair info */}
                <div className="flex flex-col gap-1.5 md:gap-3 flex-1 min-w-0">
                  {/* Row 1: Name + Price + 24H change */}
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-0.5">
                    <div className="flex items-center gap-1.5 text-[13px] md:text-[14px] min-w-0">
                      <span className="truncate">
                        <span className="font-bold text-text">${base.symbol}</span>
                        <span className="text-sub">/{quote.symbol}</span>
                      </span>
                      <span className="text-sub text-[11px] md:text-[14px] truncate hidden md:inline">{base.name || base.symbol}</span>
                    </div>
                    <div className="flex items-center gap-2 md:gap-3 text-[12px] md:text-[14px]">
                      <span className="font-bold text-text">{fmtUsd(p.price_usd)}</span>
                      <span className={`font-bold ${isPos ? 'text-green' : isNeg ? 'text-red' : 'text-sub'}`}>
                        {Number.isFinite(change24h) ? `${isPos ? '+' : ''}${change24h.toFixed(2)}%` : '—'}
                      </span>
                    </div>
                  </div>

                  {/* Row 2: Tags — wrap on mobile */}
                  <div className="flex items-center gap-1 md:gap-1.5 text-[11px] md:text-[12px] flex-wrap">
                    <span className="border border-border rounded px-1.5 md:px-2 py-0.5 md:py-1">
                      <span className="text-sub">{tDetail('mcap')}: </span>
                      <span className="font-bold text-text">{Number(p.mcap_usd) > 0 ? fmtUsd(p.mcap_usd) : '—'}</span>
                    </span>
                    <span className="border border-border rounded px-1.5 md:px-2 py-0.5 md:py-1">
                      <span className="text-sub">{tDetail('liq')}: </span>
                      <span className="font-bold text-text">{fmtUsd(p.liquidity_usd)}</span>
                    </span>
                    <span className="border border-border rounded px-1.5 md:px-2 py-0.5 md:py-1">
                      <span className="text-sub">{tDetail('vol')}: </span>
                      <span className="font-bold text-text">{fmtUsd(p.volume_24h)}</span>
                    </span>
                    <span className="border border-border rounded px-1.5 md:px-2 py-0.5 md:py-1">
                      <span className="text-sub">{tDetail('age')}: </span>
                      <span className="font-bold text-text">{p.created_at ? fmtAge(p.created_at) : '—'}</span>
                    </span>
                  </div>
                </div>

                {/* Right: Addresses — desktop only */}
                <div className="hidden md:flex flex-col gap-2.5 text-[14px] text-sub flex-shrink-0 w-[127px] text-right">
                  <span>{tDetail('pair')}: {shortAddr(p.address)}</span>
                  <span>{tDetail('token')}: {shortAddr(base.address)}</span>
                </div>

                {/* Star button */}
                <button
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    toggle(p.address)
                  }}
                  className="bg-border rounded-lg w-7 h-7 md:w-8 md:h-8 flex items-center justify-center flex-shrink-0 hover:bg-border/70 transition-colors"
                >
                  {isInAnyList(p.address) ? (
                    <svg width="12" height="12" viewBox="0 0 14 14" fill="#ffd166">
                      <path d="M7 1.5l1.8 3.6 4 .6-2.9 2.8.7 4L7 10.7 3.4 12.5l.7-4L1.2 5.7l4-.6L7 1.5z"/>
                    </svg>
                  ) : (
                    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="#666" strokeWidth="1.2">
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
