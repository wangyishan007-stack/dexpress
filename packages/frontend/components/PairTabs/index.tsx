'use client'

import { useState } from 'react'
import clsx from 'clsx'
import { useTranslations } from 'next-intl'
import { TransactionsTable } from './TransactionsTable'
import { TopTradersTable } from './TopTradersTable'
import { HoldersTable } from './HoldersTable'
import { LiquidityTable } from './LiquidityTable'
import { BubblemapsEmbed } from './BubblePlaceholder'
import type { GoPlusResult } from '../../lib/goplus'
import type { MoralisTrader, MoralisHoldersResult } from '../../lib/moralis'
import type { LPProvidersResult } from '../../lib/uniswap-subgraph'

type TabKey = 'transactions' | 'top-traders' | 'holders' | 'liquidity' | 'bubblemaps'

/* ── Tab icons ──────────────────────────────────────────── */
function IconTransactions() {
  return (
    <svg width="13" height="12" viewBox="0 0 13 12" fill="currentColor">
      <rect x="0" y="0" width="13" height="2" rx="1"/>
      <rect x="0" y="5" width="13" height="2" rx="1"/>
      <rect x="0" y="10" width="13" height="2" rx="1"/>
    </svg>
  )
}
function IconTopTraders() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M7 1L3 5h3v4h2V5h3L7 1zM3 11h8v2H3v-2z" fill="currentColor"/>
    </svg>
  )
}
function IconHolders() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="4.5" r="2.5" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M2.5 12c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  )
}
function IconLiquidity() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M7 1.5S3 5.5 3 8.5a4 4 0 008 0c0-3-4-7-4-7z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
    </svg>
  )
}
function IconBubblemaps() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="5" cy="6" r="3" stroke="currentColor" strokeWidth="1.2"/>
      <circle cx="10" cy="5" r="2" stroke="currentColor" strokeWidth="1.2"/>
      <circle cx="9" cy="10.5" r="1.5" stroke="currentColor" strokeWidth="1.2"/>
    </svg>
  )
}

const TAB_ICONS: Record<TabKey, () => JSX.Element> = {
  'transactions': IconTransactions,
  'top-traders':  IconTopTraders,
  'holders':      IconHolders,
  'liquidity':    IconLiquidity,
  'bubblemaps':   IconBubblemaps,
}

const TAB_KEYS: { key: TabKey; tKey: string }[] = [
  { key: 'transactions', tKey: 'transactions' },
  { key: 'top-traders',  tKey: 'topTraders' },
  { key: 'holders',      tKey: 'holders' },
  { key: 'liquidity',    tKey: 'liquidity' },
  // Bubblemaps hidden until partner ID approved
  // { key: 'bubblemaps',   tKey: 'bubblemaps' },
]

interface RecentSwap {
  id: string
  tx_hash: string
  timestamp: string
  is_buy: boolean
  amount_usd: number
  amount0: number
  amount1: number
  price_usd: number
  sender: string | null
}

interface Props {
  swaps: RecentSwap[]
  swapHasMore: boolean
  swapLoading: boolean
  onLoadMore: () => void
  tokenAddress: string
  security?: GoPlusResult
  tokenPriceUsd: number
  traders?: MoralisTrader[]
  baseTokenSymbol?: string
  newSwapIds?: Set<string>
  holdersData?: MoralisHoldersResult
  lpProvidersData?: LPProvidersResult
}

export function PairTabs({ swaps, swapHasMore, swapLoading, onLoadMore, tokenAddress, security, tokenPriceUsd, traders, baseTokenSymbol, newSwapIds, holdersData, lpProvidersData }: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>('transactions')
  const t = useTranslations('tabs')

  return (
    <div className="flex flex-col gap-4 flex-shrink-0">
      {/* Tab bar */}
      <div className="relative flex items-center justify-between py-3 overflow-x-auto">
        <div className="flex items-center gap-6">
          {TAB_KEYS.map((tab) => {
            const Icon = TAB_ICONS[tab.key]
            const isActive = activeTab === tab.key
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={clsx(
                  'relative flex items-center gap-2 whitespace-nowrap transition-colors',
                  isActive
                    ? 'text-text text-[14px] font-bold'
                    : 'text-sub text-[14px] hover:text-text'
                )}
              >
                <Icon />
                {t(tab.tKey)}
                <span className={clsx(
                  'absolute -bottom-3 left-0 right-0 h-[2px] rounded-full transition-all duration-200',
                  isActive ? 'bg-blue opacity-100' : 'bg-transparent opacity-0'
                )} />
              </button>
            )
          })}
        </div>
      </div>

      {/* Tab content — keep all tabs mounted to preserve filter state */}
      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        <div style={{ display: activeTab === 'transactions' ? 'block' : 'none' }}>
          <TransactionsTable
            swaps={swaps}
            swapHasMore={swapHasMore}
            swapLoading={swapLoading}
            onLoadMore={onLoadMore}
            baseTokenSymbol={baseTokenSymbol}
            newSwapIds={newSwapIds}
          />
        </div>
        <div style={{ display: activeTab === 'top-traders' ? 'block' : 'none' }}>
          <TopTradersTable traders={traders} />
        </div>
        <div style={{ display: activeTab === 'holders' ? 'block' : 'none' }}>
          <HoldersTable holdersData={holdersData} />
        </div>
        <div style={{ display: activeTab === 'liquidity' ? 'block' : 'none' }}>
          <LiquidityTable lpHolders={security?.lp_holders} subgraphData={lpProvidersData} />
        </div>
        <div style={{ display: activeTab === 'bubblemaps' ? 'block' : 'none' }}>
          <BubblemapsEmbed tokenAddress={tokenAddress} />
        </div>
      </div>
    </div>
  )
}
