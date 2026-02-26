'use client'

import { useRef, useState, useEffect } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { Pool } from '@dex/shared'
import { PairRow, PairRowHeader } from './PairRow'

interface Props {
  pairs:        Pool[]
  hasMore:      boolean
  onLoadMore:   () => void
  isValidating: boolean
  livePrices:   Record<string, number>
  flashing:     Record<string, 'up' | 'down'>
}

export function PairList({ pairs, hasMore, onLoadMore, isValidating, livePrices, flashing }: Props) {
  const parentRef = useRef<HTMLDivElement>(null)
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
    getScrollElement: () => parentRef.current,
    estimateSize:     () => rowHeight,
    overscan:         12,
  })

  const items = virtualizer.getVirtualItems()
  const lastIdx = items.at(-1)?.index ?? 0
  if (hasMore && lastIdx >= pairs.length - 8 && !isValidating) {
    onLoadMore()
  }

  return (
    <div className="border border-border rounded-[8px] overflow-hidden">
      <PairRowHeader />

      <div
        ref={parentRef}
        className="overflow-auto"
        style={{ height: isMobile ? 'calc(100vh - 160px)' : 'calc(100vh - 190px)' }}
      >
        <div style={{ height: virtualizer.getTotalSize(), width: '100%', position: 'relative' }}>
          {items.map((vRow) => {
            const isLoader = vRow.index >= pairs.length
            const pair     = pairs[vRow.index]

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
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
