'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { COLUMN_DEFS, DEFAULT_CONFIG } from '../lib/columnConfig'
import type { ScreenerConfig } from '../lib/columnConfig'

function IconClose() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path d="M6 6L18 18M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  )
}

function IconDrag() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <circle cx="5.5" cy="3" r="1.2" fill="currentColor"/>
      <circle cx="9.5" cy="3" r="1.2" fill="currentColor"/>
      <circle cx="5.5" cy="7.5" r="1.2" fill="currentColor"/>
      <circle cx="9.5" cy="7.5" r="1.2" fill="currentColor"/>
      <circle cx="5.5" cy="12" r="1.2" fill="currentColor"/>
      <circle cx="9.5" cy="12" r="1.2" fill="currentColor"/>
    </svg>
  )
}

function Checkbox({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      className="flex items-center justify-center w-5 h-5 rounded-[6px] flex-shrink-0 transition-colors"
      style={{ backgroundColor: checked ? '#2744FF' : '#444444' }}
    >
      {checked && (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2.5 6L5 8.5L9.5 3.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
    </button>
  )
}

const COLUMN_LABEL_MAP = new Map(COLUMN_DEFS.map(c => [c.key, c.label]))

interface Props {
  open: boolean
  onClose: () => void
  config: ScreenerConfig
  onApply: (config: ScreenerConfig) => void
}

export function ScreenerSettingsModal({ open, onClose, config, onApply }: Props) {
  const [columns, setColumns] = useState<string[]>(config.columns)
  const [visible, setVisible] = useState<Record<string, boolean>>(config.visible)
  const dragItemRef = useRef<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)

  // Sync when modal opens
  useEffect(() => {
    if (open) {
      setColumns([...config.columns])
      setVisible({ ...config.visible })
    }
  }, [open, config])

  const toggle = useCallback((key: string) => {
    setVisible(prev => ({ ...prev, [key]: !prev[key] }))
  }, [])

  const handleApply = useCallback(() => {
    onApply({ columns, visible })
    onClose()
  }, [columns, visible, onApply, onClose])

  const handleReset = useCallback(() => {
    const def = { columns: [...DEFAULT_CONFIG.columns], visible: { ...DEFAULT_CONFIG.visible } }
    onApply(def)
    onClose()
  }, [onApply, onClose])

  // Drag handlers
  const handleDragStart = useCallback((idx: number) => {
    dragItemRef.current = idx
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, idx: number) => {
    e.preventDefault()
    setDragOverIdx(idx)
  }, [])

  const handleDrop = useCallback((idx: number) => {
    const fromIdx = dragItemRef.current
    if (fromIdx === null || fromIdx === idx) {
      dragItemRef.current = null
      setDragOverIdx(null)
      return
    }
    setColumns(prev => {
      const next = [...prev]
      const [moved] = next.splice(fromIdx, 1)
      next.splice(idx, 0, moved)
      return next
    })
    dragItemRef.current = null
    setDragOverIdx(null)
  }, [])

  const handleDragEnd = useCallback(() => {
    dragItemRef.current = null
    setDragOverIdx(null)
  }, [])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Modal */}
      <div className="relative rounded-xl border border-border bg-[#111] shadow-2xl w-[600px] max-w-[90vw] flex flex-col p-6" style={{ maxHeight: '85vh' }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-5 flex-shrink-0">
          <h2 className="text-[24px] font-bold text-text">Customize Screener</h2>
          <button onClick={onClose} className="text-sub hover:text-text transition-colors">
            <IconClose />
          </button>
        </div>

        {/* Column list */}
        <div className="flex flex-col gap-3 overflow-y-auto flex-1 min-h-0">
          {columns.map((key, idx) => (
            <div
              key={key}
              draggable
              onDragStart={() => handleDragStart(idx)}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDrop={() => handleDrop(idx)}
              onDragEnd={handleDragEnd}
              className="flex items-center justify-between border rounded-[10px] px-5 py-4 transition-colors"
              style={{
                borderColor: dragOverIdx === idx ? '#2744FF' : '#333333',
                opacity: dragItemRef.current === idx ? 0.5 : 1,
              }}
            >
              <div className="flex items-center gap-3">
                <Checkbox checked={visible[key] ?? true} onChange={() => toggle(key)} />
                <span className="text-[14px] font-bold text-text">{COLUMN_LABEL_MAP.get(key) ?? key}</span>
              </div>
              <span className="text-sub cursor-grab active:cursor-grabbing">
                <IconDrag />
              </span>
            </div>
          ))}
        </div>

        {/* Footer buttons */}
        <div className="flex items-center gap-3 mt-5 flex-shrink-0">
          <button
            onClick={handleApply}
            className="flex-1 h-[44px] rounded-[10px] text-[14px] font-bold text-white transition-colors"
            style={{ backgroundColor: '#2744FF' }}
          >
            Apply
          </button>
          <button
            onClick={handleReset}
            className="flex-1 h-[44px] rounded-[10px] text-[14px] font-bold text-text transition-colors"
            style={{ backgroundColor: '#333333' }}
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  )
}
