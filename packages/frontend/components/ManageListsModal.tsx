'use client'

import { useState, useEffect, useRef } from 'react'
import { useWatchlist } from '../hooks/useWatchlist'

function fmtUpdated(ts: string): string {
  if (!ts) return ''
  const ms = Date.now() - new Date(ts).getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} minute${mins > 1 ? 's' : ''} ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} hour${hrs > 1 ? 's' : ''} ago`
  const days = Math.floor(hrs / 24)
  return `${days} day${days > 1 ? 's' : ''} ago`
}

interface Props {
  onClose: () => void
}

export function ManageListsModal({ onClose }: Props) {
  const { lists, createList, renameList, deleteList } = useWatchlist()
  const [newName, setNewName]         = useState('')
  const [editingId, setEditingId]     = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const backdropRef = useRef<HTMLDivElement>(null)
  const inputRef    = useRef<HTMLInputElement>(null)

  // Focus create input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Close on Esc
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (editingId) { setEditingId(null); return }
        onClose()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose, editingId])

  function handleCreate() {
    if (!newName.trim()) return
    createList(newName)
    setNewName('')
  }

  function startRename(id: string, currentName: string) {
    setEditingId(id)
    setEditingName(currentName)
  }

  function commitRename() {
    if (editingId && editingName.trim()) {
      renameList(editingId, editingName)
    }
    setEditingId(null)
  }

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60"
      onClick={(e) => { if (e.target === backdropRef.current) onClose() }}
    >
      <div className="w-full max-w-[440px] mx-4 rounded-xl border border-border bg-[#111] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-[16px] font-bold text-text">Manage My Lists</h2>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-[28px] h-[28px] rounded-md text-sub hover:text-text hover:bg-border/40 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Create new list */}
        <div className="flex items-center gap-2 px-5 py-3 border-b border-border">
          <input
            ref={inputRef}
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreate() }}
            placeholder="New List"
            className="flex-1 h-[36px] rounded-lg border border-border bg-transparent px-3 text-[13px] text-text placeholder-sub outline-none focus:border-blue transition-colors"
          />
          <button
            onClick={handleCreate}
            disabled={!newName.trim()}
            className="h-[36px] px-4 rounded-lg bg-blue text-[13px] font-medium text-white hover:bg-blue/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Create list
          </button>
        </div>

        {/* Lists */}
        <div className="max-h-[320px] overflow-y-auto">
          {lists.map(list => {
            const isMain = list.id === 'main'
            const isEditing = editingId === list.id

            return (
              <div
                key={list.id}
                className="flex items-center gap-3 px-5 py-3 border-b border-border/50 last:border-0 hover:bg-border/10 transition-colors"
              >
                {/* Drag handle (visual only) */}
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="flex-shrink-0 text-sub/30">
                  <path d="M4 3h0M4 7h0M4 11h0M10 3h0M10 7h0M10 11h0" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
                </svg>

                {/* Name / edit input */}
                <div className="flex-1 min-w-0">
                  {isEditing ? (
                    <input
                      autoFocus
                      value={editingName}
                      onChange={e => setEditingName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setEditingId(null) }}
                      onBlur={commitRename}
                      className="w-full h-[28px] rounded border border-blue bg-transparent px-2 text-[13px] text-text outline-none"
                    />
                  ) : (
                    <>
                      <div className="text-[13px] font-medium text-text truncate">{list.name}</div>
                      <div className="text-[11px] text-sub">
                        {list.pairIds.length} pair{list.pairIds.length !== 1 ? 's' : ''}
                        {list.updatedAt ? `, updated ${fmtUpdated(list.updatedAt)}` : ''}
                      </div>
                    </>
                  )}
                </div>

                {/* Actions */}
                {!isEditing && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {/* Rename */}
                    <button
                      onClick={() => startRename(list.id, list.name)}
                      className="flex items-center justify-center w-[28px] h-[28px] rounded-md text-sub hover:text-text hover:bg-border/40 transition-colors"
                      title="Rename"
                    >
                      <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                        <path d="M8.5 1.5l3 3L4 12H1v-3L8.5 1.5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
                      </svg>
                    </button>
                    {/* Delete (not for main) */}
                    {!isMain && (
                      <button
                        onClick={() => deleteList(list.id)}
                        className="flex items-center justify-center w-[28px] h-[28px] rounded-md text-sub hover:text-red hover:bg-red/10 transition-colors"
                        title="Delete"
                      >
                        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                          <path d="M2 3.5h9M4.5 3.5V2.5a1 1 0 011-1h2a1 1 0 011 1v1M5.5 6v3.5M7.5 6v3.5M3 3.5l.5 7a1 1 0 001 1h4a1 1 0 001-1l.5-7" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
