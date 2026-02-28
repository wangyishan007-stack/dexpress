'use client'

import { useRef, useState, useEffect } from 'react'
import clsx from 'clsx'

/* ── Dropdown root ───────────────────────────────────────── */
interface DropdownProps {
  trigger: React.ReactNode
  children: React.ReactNode
  align?: 'left' | 'right'
  className?: string
}

export function Dropdown({ trigger, children, align = 'left', className }: DropdownProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} className={clsx('relative', className)}>
      <div onClick={() => setOpen(o => !o)}>{trigger}</div>
      {open && (
        <div
          className={clsx(
            'absolute top-full mt-1 min-w-[180px] rounded-lg border border-border bg-[#1a1a1a] shadow-lg z-50 py-1',
            align === 'right' ? 'right-0' : 'left-0'
          )}
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      )}
    </div>
  )
}

/* ── DropdownItem ────────────────────────────────────────── */
interface DropdownItemProps {
  children: React.ReactNode
  active?: boolean
  onClick?: () => void
}

export function DropdownItem({ children, active, onClick }: DropdownItemProps) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex w-full items-center gap-2 px-3 py-2 text-[13px] text-left transition-colors hover:bg-border/40',
        active ? 'text-blue font-medium' : 'text-text'
      )}
    >
      <span className="flex-1">{children}</span>
      {active && (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="flex-shrink-0">
          <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
    </button>
  )
}

/* ── DropdownSectionTitle ────────────────────────────────── */
export function DropdownSectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 py-1.5 text-[11px] font-semibold text-sub uppercase tracking-wider">
      {children}
    </div>
  )
}

/* ── DropdownDivider ─────────────────────────────────────── */
export function DropdownDivider() {
  return <div className="my-1 border-t border-border" />
}
