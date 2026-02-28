'use client'

import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import type { ReactNode } from 'react'
import React from 'react'

const STORAGE_KEY = 'watchlists_v1'

export interface WatchlistItem {
  id:        string
  name:      string
  pairIds:   string[]
  updatedAt: string
}

interface WatchlistsState {
  lists:        WatchlistItem[]
  activeListId: string
}

interface WatchlistCtx {
  lists:          WatchlistItem[]
  activeList:     WatchlistItem
  activeListId:   string
  setActiveList:  (id: string) => void
  toggle:         (pairId: string) => void
  isWatched:      (pairId: string) => boolean
  count:          number
  addresses:      string[]
  createList:     (name: string) => void
  renameList:     (id: string, name: string) => void
  deleteList:     (id: string) => void
}

const MAIN_ID = 'main'

function makeDefault(): WatchlistsState {
  return {
    lists: [
      { id: MAIN_ID, name: 'Main Watchlist', pairIds: [], updatedAt: new Date().toISOString() },
      { id: 'xx',    name: 'xx',              pairIds: [], updatedAt: new Date().toISOString() },
    ],
    activeListId: MAIN_ID,
  }
}

const EMPTY_LIST: WatchlistItem = { id: MAIN_ID, name: 'Main Watchlist', pairIds: [], updatedAt: '' }

const defaultCtx: WatchlistCtx = {
  lists:         [],
  activeList:    EMPTY_LIST,
  activeListId:  MAIN_ID,
  setActiveList: () => {},
  toggle:        () => {},
  isWatched:     () => false,
  count:         0,
  addresses:     [],
  createList:    () => {},
  renameList:    () => {},
  deleteList:    () => {},
}

const WatchlistContext = createContext<WatchlistCtx>(defaultCtx)

let idCounter = 1

export function WatchlistProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WatchlistsState>(makeDefault)
  const [hydrated, setHydrated] = useState(false)

  // Hydrate from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as WatchlistsState
        if (parsed && Array.isArray(parsed.lists) && parsed.lists.length > 0) {
          // Ensure main list name is always correct
          parsed.lists = parsed.lists.map(l =>
            l.id === MAIN_ID ? { ...l, name: 'Main Watchlist' } : l
          )
          setState(parsed)
        }
      }
    } catch {}
    setHydrated(true)
  }, [])

  // Persist
  useEffect(() => {
    if (!hydrated) return
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [state, hydrated])

  const activeList = useMemo(
    () => state.lists.find(l => l.id === state.activeListId) ?? state.lists[0] ?? EMPTY_LIST,
    [state.lists, state.activeListId]
  )

  const setActiveList = useCallback((id: string) => {
    setState(prev => ({ ...prev, activeListId: id }))
  }, [])

  const toggle = useCallback((pairId: string) => {
    setState(prev => {
      const lists = prev.lists.map(l => {
        if (l.id !== prev.activeListId) return l
        const has = l.pairIds.includes(pairId)
        return {
          ...l,
          pairIds: has ? l.pairIds.filter(p => p !== pairId) : [...l.pairIds, pairId],
          updatedAt: new Date().toISOString(),
        }
      })
      return { ...prev, lists }
    })
  }, [])

  const isWatched = useCallback(
    (pairId: string) => activeList.pairIds.includes(pairId),
    [activeList.pairIds]
  )

  const createList = useCallback((name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    setState(prev => {
      // Dedupe
      if (prev.lists.some(l => l.name.toLowerCase() === trimmed.toLowerCase())) return prev
      const newId = `list_${Date.now()}_${idCounter++}`
      return {
        ...prev,
        lists: [
          ...prev.lists,
          { id: newId, name: trimmed, pairIds: [], updatedAt: new Date().toISOString() },
        ],
      }
    })
  }, [])

  const renameList = useCallback((id: string, name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    setState(prev => ({
      ...prev,
      lists: prev.lists.map(l =>
        l.id === id ? { ...l, name: trimmed, updatedAt: new Date().toISOString() } : l
      ),
    }))
  }, [])

  const deleteList = useCallback((id: string) => {
    if (id === MAIN_ID) return // Can't delete Main
    setState(prev => ({
      ...prev,
      lists: prev.lists.filter(l => l.id !== id),
      activeListId: prev.activeListId === id ? MAIN_ID : prev.activeListId,
    }))
  }, [])

  const addresses = activeList.pairIds
  const count     = addresses.length

  const ctx: WatchlistCtx = useMemo(() => ({
    lists:         state.lists,
    activeList,
    activeListId:  state.activeListId,
    setActiveList,
    toggle,
    isWatched,
    count,
    addresses,
    createList,
    renameList,
    deleteList,
  }), [state.lists, state.activeListId, activeList, setActiveList, toggle, isWatched, count, addresses, createList, renameList, deleteList])

  return React.createElement(WatchlistContext.Provider, { value: ctx }, children)
}

export function useWatchlist() {
  return useContext(WatchlistContext)
}
