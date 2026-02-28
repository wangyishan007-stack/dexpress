'use client'

import { useRef, useState, useEffect } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import clsx from 'clsx'
import type { Pool, TimeWindow } from '@dex/shared'
import { PairRow, PairRowFrozen, PairRowData, PairRowHeader, PairRowHeaderFrozen, PairRowHeaderData } from './PairRow'
import { SkeletonRow } from '../SkeletonRow'
import { EmptyState } from '../EmptyState'
import { FROZEN_WIDTH_STAR, FROZEN_WIDTH_NO_STAR, COLUMN_DEFS, getVisibleColumns } from '../../lib/columnConfig'
import type { ScreenerConfig } from '../../lib/columnConfig'

interface Props {
  pairs:          Pool[]
  hasMore:        boolean
  onLoadMore:     () => void
  isValidating:   boolean
  livePrices:     Record<string, number>
  flashing:       Record<string, 'up' | 'down'>
  timeWindow:     TimeWindow
  loading?:       boolean
  showStar?:      boolean
  autoHeight?:    boolean
  columnConfig?:  ScreenerConfig
}

export function PairList({ pairs, hasMore, onLoadMore, isValidating, livePrices, flashing, timeWindow, loading, showStar = false, autoHeight = false, columnConfig }: Props) {
  const mobileScrollRef  = useRef<HTMLDivElement>(null)
  const desktopScrollRef = useRef<HTMLDivElement>(null)

  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    setIsMobile(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const rowHeight = isMobile ? 64 : 70

  const virtualizer = useVirtualizer({
    count:            hasMore ? pairs.length + 1 : pairs.length,
    getScrollElement: () => isMobile ? mobileScrollRef.current : desktopScrollRef.current,
    estimateSize:     () => rowHeight,
    overscan:         12,
  })

  const items = virtualizer.getVirtualItems()
  const lastIdx = items.at(-1)?.index ?? 0
  if (hasMore && lastIdx >= pairs.length - 8 && !isValidating) {
    onLoadMore()
  }

  const frozenWidth = showStar ? FROZEN_WIDTH_STAR : FROZEN_WIDTH_NO_STAR

  /* Compute data panel min-width for horizontal scroll */
  const visCols = columnConfig ? getVisibleColumns(columnConfig) : COLUMN_DEFS
  const dataMinWidth = visCols.reduce((sum, c) => sum + parseInt(c.width), 0) + (visCols.length - 1) * 8 + 32
  const totalMinWidth = frozenWidth + dataMinWidth

  const outerCls = clsx(
    'flex flex-col border border-border rounded-lg',
    !autoHeight && 'flex-1 min-h-0'
  )

  /* Loading skeleton */
  if (loading) {
    return (
      <div className={outerCls}>
        <PairRowHeader showStar={showStar} columnConfig={columnConfig} />
        <div>
          {Array.from({ length: 12 }).map((_, i) => (
            <SkeletonRow key={i} showStar={showStar} />
          ))}
        </div>
      </div>
    )
  }

  /* Empty state */
  if (pairs.length === 0) {
    return (
      <div className={outerCls}>
        <PairRowHeader showStar={showStar} columnConfig={columnConfig} />
        <EmptyState
          heading="No pairs found"
          description="Try adjusting your filters or check back later."
        />
      </div>
    )
  }

  const totalSize = virtualizer.getTotalSize()

  return (
    <div className={outerCls}>
      {/* ── Mobile: single-column virtualizer ────────────────── */}
      {isMobile && (
        <div
          ref={mobileScrollRef}
          className={clsx('overflow-auto', !autoHeight && 'flex-1 min-h-0')}
        >
          <div style={{ height: totalSize, width: '100%', position: 'relative' }}>
            {items.map((vRow) => {
              const isLoader = vRow.index >= pairs.length
              const pair = pairs[vRow.index]

              return (
                <div
                  key={vRow.index}
                  data-index={vRow.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position:  'absolute',
                    top:        0,
                    left:       0,
                    width:     '100%',
                    transform: `translateY(${vRow.start}px)`,
                  }}
                >
                  {isLoader ? (
                    <div className="flex justify-center py-3 text-[11px] text-sub">
                      {isValidating ? 'Loading more…' : null}
                    </div>
                  ) : (
                    <PairRow
                      pair={pair}
                      rank={vRow.index + 1}
                      livePrice={livePrices[pair.address]}
                      flash={flashing[pair.address]}
                      timeWindow={timeWindow}
                      showStar={showStar}
                    />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Desktop: single scroll container + sticky frozen column ── */}
      {!isMobile && (
        <div
          ref={desktopScrollRef}
          className={clsx('overflow-auto', !autoHeight && 'flex-1 min-h-0')}
        >
          {/* Header: sticky top + frozen part sticky left */}
          <div className="sticky top-0 z-20 flex" style={{ minWidth: totalMinWidth }}>
            <div
              className="flex-shrink-0 sticky left-0 z-10 bg-surface"
              style={{ width: frozenWidth }}
            >
              <PairRowHeaderFrozen showStar={showStar} />
            </div>
            <div className="flex-1 min-w-0">
              <PairRowHeaderData columnConfig={columnConfig} />
            </div>
          </div>

          {/* Virtual scroll body */}
          <div style={{ height: totalSize, minWidth: totalMinWidth, position: 'relative' }}>
            {items.map((vRow) => {
              const isLoader = vRow.index >= pairs.length
              const pair = pairs[vRow.index]

              return (
                <div
                  key={vRow.index}
                  data-index={vRow.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position:  'absolute',
                    top:        0,
                    left:       0,
                    width:     '100%',
                    transform: `translateY(${vRow.start}px)`,
                  }}
                >
                  <div className="flex">
                    {/* Frozen token column: sticky left */}
                    <div
                      className="flex-shrink-0 sticky left-0 z-[1] bg-bg"
                      style={{ width: frozenWidth }}
                    >
                      {isLoader ? (
                        <div className="h-[70px]" />
                      ) : (
                        <PairRowFrozen
                          pair={pair}
                          rank={vRow.index + 1}
                          flash={flashing[pair.address]}
                          showStar={showStar}
                        />
                      )}
                    </div>
                    {/* Data columns */}
                    <div className="flex-1 min-w-0">
                      {isLoader ? (
                        <div className="flex items-center justify-center h-[70px] text-[11px] text-sub">
                          {isValidating ? 'Loading more…' : null}
                        </div>
                      ) : (
                        <PairRowData
                          pair={pair}
                          livePrice={livePrices[pair.address]}
                          flash={flashing[pair.address]}
                          timeWindow={timeWindow}
                          columnConfig={columnConfig}
                        />
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
