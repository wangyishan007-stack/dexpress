'use client'

import { useState, useRef, useEffect } from 'react'
import { useWatchlist } from '../hooks/useWatchlist'
import { ManageListsModal } from './ManageListsModal'

interface Props {
  pairAddress: string
}

export function PairWatchlistDropdown({ pairAddress }: Props) {
  const { lists, activeListId, setActiveList, toggle } = useWatchlist()
  const [open, setOpen] = useState(false)
  const [managing, setManaging] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Any list contains this pair?
  const isInAnyList = lists.some(l => l.pairIds.includes(pairAddress))

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

  function handleToggle(listId: string) {
    // Switch active list, then toggle
    if (listId !== activeListId) setActiveList(listId)
    // Need to toggle on the target list – set active first, then toggle in next tick
    setTimeout(() => {
      toggle(pairAddress)
    }, 0)
  }

  return (
    <>
      <div ref={ref} className="relative flex-1">
        <button
          onClick={() => setOpen(o => !o)}
          className="w-full flex items-center justify-center gap-2 h-10 rounded bg-muted text-[13px] text-sub hover:text-text transition-colors"
        >
          {isInAnyList ? (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" className="text-text">
              <path d="M7 1l1.8 3.6L13 5.3l-3 2.9.7 4.1L7 10.3 3.3 12.3l.7-4.1-3-2.9 4.2-.7z"/>
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2">
              <path d="M7 1l1.8 3.6L13 5.3l-3 2.9.7 4.1L7 10.3 3.3 12.3l.7-4.1-3-2.9 4.2-.7z"/>
            </svg>
          )}
          {isInAnyList ? 'Watchlisted' : 'Add to watchlist'}
        </button>

        {/* Dropdown */}
        {open && (
          <div
            className="absolute top-full left-0 mt-1 min-w-[240px] rounded-[12px] py-1 z-50 shadow-lg"
            style={{ backgroundColor: '#222', border: '1px solid #333' }}
          >
            {lists.map(list => {
              const pairInList = list.pairIds.includes(pairAddress)
              return (
                <button
                  key={list.id}
                  onClick={() => {
                    // Switch to this list and toggle
                    if (list.id !== activeListId) {
                      setActiveList(list.id)
                    }
                    // Small delay to ensure activeList is set before toggle
                    setTimeout(() => toggle(pairAddress), 0)
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors"
                >
                  {/* Star icon */}
                  <span className="text-text flex-shrink-0">
                    {pairInList ? (
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M10 1.5l2.5 5 5.5 .8-4 3.9.9 5.3L10 13.8l-4.9 2.7.9-5.3-4-3.9 5.5-.8z"/>
                      </svg>
                    ) : (
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.3">
                        <path d="M10 1.5l2.5 5 5.5 .8-4 3.9.9 5.3L10 13.8l-4.9 2.7.9-5.3-4-3.9 5.5-.8z"/>
                      </svg>
                    )}
                  </span>
                  <span className="text-[14px] font-bold text-text flex-1 text-left truncate">
                    {list.name}
                  </span>
                  {pairInList && (
                    <span className="text-text flex-shrink-0">
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <path d="M3 8l3.5 3.5L13 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </span>
                  )}
                </button>
              )
            })}

            {/* Divider */}
            <div className="my-1" style={{ borderTop: '1px solid #333' }} />

            {/* Manage my lists */}
            <button
              onClick={() => { setOpen(false); setManaging(true) }}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors"
            >
              <span className="text-sub flex-shrink-0">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M6.86 1.33h2.28l.3 1.83.72.3 1.56-.98 1.61 1.61-.98 1.56.3.72 1.83.3v2.28l-1.83.3-.3.72.98 1.56-1.61 1.61-1.56-.98-.72.3-.3 1.83H6.86l-.3-1.83-.72-.3-1.56.98-1.61-1.61.98-1.56-.3-.72-1.83-.3V6.86l1.83-.3.3-.72-.98-1.56 1.61-1.61 1.56.98.72-.3.3-1.83z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
                  <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.2"/>
                </svg>
              </span>
              <span className="text-[14px] text-text">Manage my lists</span>
            </button>
          </div>
        )}
      </div>

      {managing && <ManageListsModal onClose={() => setManaging(false)} />}
    </>
  )
}
