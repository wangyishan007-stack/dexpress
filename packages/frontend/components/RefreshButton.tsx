'use client'

import clsx from 'clsx'

interface Props {
  onClick: () => void
  isLoading?: boolean
}

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className={className}>
      <path
        d="M13.65 2.35a8 8 0 1 0 1.73 8.65h-2.09a6 6 0 1 1-1.22-6.08L10 7h6V1l-2.35 1.35z"
        fill="currentColor"
      />
    </svg>
  )
}

export function RefreshButton({ onClick, isLoading = false }: Props) {
  return (
    <button
      onClick={onClick}
      disabled={isLoading}
      className={clsx(
        'flex items-center gap-1.5 px-3 h-[30px] md:h-[36px] rounded-lg',
        'text-[13px] font-medium transition-colors',
        // Fix 3: use existing project tokens (surface, border, sub, text)
        'bg-border/40 hover:bg-border text-sub hover:text-text border border-border',
        'disabled:opacity-40 disabled:cursor-not-allowed'
      )}
      title="Refresh data"
    >
      <RefreshIcon className={clsx(isLoading && 'animate-spin')} />
      <span className="hidden sm:inline">Refresh</span>
    </button>
  )
}
