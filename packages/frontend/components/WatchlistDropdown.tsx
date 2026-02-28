'use client'

import { useState, useRef, useEffect } from 'react'
import clsx from 'clsx'
import { useWatchlist } from '../hooks/useWatchlist'
import { ManageListsModal } from './ManageListsModal'

interface Props {
  className?: string
}

export function WatchlistDropdown({ className }: Props) {
  const { lists, activeList, activeListId, setActiveList, count } = useWatchlist()
  const [open, setOpen]       = useState(false)
  const [managing, setManaging] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Close on Esc
  useEffect(() => {
    if (!open) return
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  return (
    <>
      <div ref={ref} className={clsx('relative', className)}>
        {/* Trigger button */}
        <button
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-1.5 rounded-lg border border-border py-2 px-3 text-[12px] text-sub hover:text-text transition-colors"
        >
          {/* Filled star */}
          <svg width="14" height="14" viewBox="0 0 16 16" fill="#ffd166">
            <path d="M8 1.5l1.76 3.57 3.94.57-2.85 2.78.67 3.93L8 10.67l-3.52 1.68.67-3.93L2.3 5.64l3.94-.57L8 1.5z"/>
          </svg>
          <span className="text-text font-medium">Watchlist</span>
          {count > 0 && (
            <span className="bg-border/60 text-sub text-[10px] rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
              {count}
            </span>
          )}
        </button>

        {/* Dropdown panel */}
        {open && (
          <div className="absolute bottom-full mb-1 left-0 min-w-[220px] rounded-lg border border-border bg-[#1a1a1a] shadow-lg z-50 py-1">
            {lists.map(list => {
              const isActive = list.id === activeListId
              return (
                <button
                  key={list.id}
                  onClick={() => { setActiveList(list.id); setOpen(false) }}
                  className={clsx(
                    'flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-border/30',
                    isActive && 'bg-border/20'
                  )}
                >
                  {/* Star icon */}
                  {isActive ? (
                    <svg width="18" height="18" viewBox="0 0 16 16" fill="#ffd166" className="flex-shrink-0">
                      <path d="M8 1.5l1.76 3.57 3.94.57-2.85 2.78.67 3.93L8 10.67l-3.52 1.68.67-3.93L2.3 5.64l3.94-.57L8 1.5z"/>
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="#999" strokeWidth="1" className="flex-shrink-0">
                      <path d="M8 1.5l1.76 3.57 3.94.57-2.85 2.78.67 3.93L8 10.67l-3.52 1.68.67-3.93L2.3 5.64l3.94-.57L8 1.5z"/>
                    </svg>
                  )}
                  <span className={clsx('flex-1 text-[14px]', isActive ? 'text-text font-semibold' : 'text-text')}>
                    {list.name}
                  </span>
                  {isActive && (
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="flex-shrink-0 text-text">
                      <path d="M3 8l3.5 3.5L13 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </button>
              )
            })}

            {/* Divider */}
            <div className="my-1 border-t border-border" />

            {/* Manage my lists */}
            <button
              onClick={() => { setOpen(false); setManaging(true) }}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-[14px] text-sub hover:text-text transition-colors hover:bg-border/30"
            >
              <svg width="18" height="18" viewBox="0 0 16 16" fill="none" className="flex-shrink-0">
                <path d="M6.86 1.33h2.28l.3 1.83.72.3 1.56-.98 1.61 1.61-.98 1.56.3.72 1.83.3v2.28l-1.83.3-.3.72.98 1.56-1.61 1.61-1.56-.98-.72.3-.3 1.83H6.86l-.3-1.83-.72-.3-1.56.98-1.61-1.61.98-1.56-.3-.72-1.83-.3V6.86l1.83-.3.3-.72-.98-1.56 1.61-1.61 1.56.98.72-.3.3-1.83z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
                <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.2"/>
              </svg>
              Manage my lists
            </button>
          </div>
        )}
      </div>

      {/* Manage modal */}
      {managing && <ManageListsModal onClose={() => setManaging(false)} />}
    </>
  )
}
