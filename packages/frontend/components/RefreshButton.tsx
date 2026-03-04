'use client'

import clsx from 'clsx'

interface Props {
  onClick: () => void
  isLoading?: boolean
}

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      className={className}
    >
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
        'flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md',
        'text-sm font-medium transition-colors',
        'bg-surface hover:bg-surface-hover border border-border',
        'text-text-secondary hover:text-text',
        'disabled:opacity-50 disabled:cursor-not-allowed'
      )}
      title="Refresh data"
    >
      <RefreshIcon
        className={clsx(
          'w-4 h-4',
          isLoading && 'animate-spin'
        )}
      />
      <span className="hidden sm:inline">Refresh</span>
    </button>
  )
}
