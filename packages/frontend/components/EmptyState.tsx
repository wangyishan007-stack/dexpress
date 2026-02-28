import Link from 'next/link'

interface Props {
  icon?: React.ReactNode
  heading: string
  description?: string
  ctaLabel?: string
  ctaHref?: string
}

export function EmptyState({ icon, heading, description, ctaLabel, ctaHref }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      {icon && <div className="mb-4 text-sub">{icon}</div>}
      <h3 className="text-[15px] font-semibold text-text mb-1">{heading}</h3>
      {description && <p className="text-[13px] text-sub mb-4">{description}</p>}
      {ctaLabel && ctaHref && (
        <Link
          href={ctaHref}
          className="inline-flex items-center gap-1 rounded-lg bg-blue px-4 py-2 text-[13px] font-medium text-white hover:bg-blue/90 transition-colors"
        >
          {ctaLabel}
        </Link>
      )}
    </div>
  )
}
