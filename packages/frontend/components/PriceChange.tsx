import { fmtPct } from '../lib/formatters'
import clsx from 'clsx'

interface Props {
  value:     number
  className?: string
}

export function PriceChange({ value, className }: Props) {
  const isPositive = value > 0
  const isNegative = value < 0

  return (
    <span
      className={clsx(
        'tabular text-right font-mono text-xs',
        isPositive  && 'text-green',
        isNegative  && 'text-red',
        !isPositive && !isNegative && 'text-sub',
        className
      )}
    >
      {fmtPct(value)}
    </span>
  )
}
