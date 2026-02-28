'use client'

import clsx from 'clsx'
import { useWatchlist } from '../hooks/useWatchlist'

interface Props {
  address: string
  size?: number
  className?: string
}

export function WatchToggle({ address, size = 16, className }: Props) {
  const { isWatched, toggle } = useWatchlist()
  const watched = isWatched(address)

  return (
    <button
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggle(address) }}
      className={clsx(
        'flex items-center justify-center transition-colors',
        watched ? 'text-yellow' : 'text-sub/40 hover:text-yellow/60',
        className
      )}
      title={watched ? 'Remove from watchlist' : 'Add to watchlist'}
    >
      {watched ? (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 1.5l1.76 3.57 3.94.57-2.85 2.78.67 3.93L8 10.67l-3.52 1.68.67-3.93L2.3 5.64l3.94-.57L8 1.5z"/>
        </svg>
      ) : (
        <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2">
          <path d="M8 1.5l1.76 3.57 3.94.57-2.85 2.78.67 3.93L8 10.67l-3.52 1.68.67-3.93L2.3 5.64l3.94-.57L8 1.5z"/>
        </svg>
      )}
    </button>
  )
}
