const COLS_STAR    = 'grid-cols-[28px_36px_minmax(190px,2.5fr)_100px_60px_80px_90px_70px_68px_68px_68px_68px_90px_90px]'
const COLS_NO_STAR = 'grid-cols-[36px_minmax(190px,2.5fr)_100px_60px_80px_90px_70px_68px_68px_68px_68px_90px_90px]'

export function SkeletonRow({ showStar = false }: { showStar?: boolean }) {
  return (
    <>
      {/* Mobile skeleton */}
      <div className="flex md:hidden items-center gap-2.5 px-3 h-[64px] border-b border-muted animate-pulse">
        <div className="w-[22px] h-3 bg-border/40 rounded" />
        <div className="w-7 h-7 bg-border/40 rounded-full flex-shrink-0" />
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="h-3 w-20 bg-border/40 rounded" />
          <div className="h-2.5 w-14 bg-border/30 rounded" />
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="h-3 w-16 bg-border/40 rounded" />
          <div className="h-2.5 w-10 bg-border/30 rounded" />
        </div>
        <div className="h-2.5 w-12 bg-border/30 rounded" />
      </div>

      {/* Desktop skeleton */}
      <div className={`hidden md:grid ${showStar ? COLS_STAR : COLS_NO_STAR} items-center gap-x-2 border-b border-muted h-[70px] px-4 animate-pulse`}>
        {showStar && <div />}
        <div className="h-3 w-5 bg-border/40 rounded ml-auto" />
        <div className="flex items-center gap-2">
          <div className="w-[34px] h-[22px] flex-shrink-0">
            <div className="w-[22px] h-[22px] bg-border/40 rounded-full" />
          </div>
          <div className="space-y-1">
            <div className="h-3 w-16 bg-border/40 rounded" />
            <div className="h-2.5 w-10 bg-border/30 rounded" />
          </div>
        </div>
        <div className="h-3 w-14 bg-border/40 rounded ml-auto" />
        <div className="h-3 w-8 bg-border/30 rounded ml-auto" />
        <div className="h-3 w-10 bg-border/40 rounded ml-auto" />
        <div className="h-3 w-14 bg-border/40 rounded ml-auto" />
        <div className="h-3 w-8 bg-border/30 rounded ml-auto" />
        <div className="h-3 w-10 bg-border/30 rounded ml-auto" />
        <div className="h-3 w-10 bg-border/30 rounded ml-auto" />
        <div className="h-3 w-10 bg-border/30 rounded ml-auto" />
        <div className="h-3 w-10 bg-border/30 rounded ml-auto" />
        <div className="h-3 w-14 bg-border/30 rounded ml-auto" />
        <div className="h-3 w-14 bg-border/30 rounded ml-auto" />
      </div>
    </>
  )
}
