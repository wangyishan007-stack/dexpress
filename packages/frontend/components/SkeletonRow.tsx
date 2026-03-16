import { getVisibleColumns, buildDataGridCols, DEFAULT_DATA_GRID } from '../lib/columnConfig'
import type { ScreenerConfig } from '../lib/columnConfig'

interface Props {
  showStar?:     boolean
  columnConfig?: ScreenerConfig
}

export function SkeletonRow({ showStar = false, columnConfig }: Props) {
  // Fix 4: compute data grid template from columnConfig (same as PairRowData)
  const visCols = columnConfig ? getVisibleColumns(columnConfig) : null
  const gridTemplate = visCols ? buildDataGridCols(visCols) : DEFAULT_DATA_GRID
  const colCount = visCols ? visCols.length : 11

  return (
    <>
      {/* Mobile skeleton */}
      <div className="flex md:hidden items-center gap-2.5 px-3 h-[56px] border-b border-border animate-pulse">
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
      </div>

      {/* Desktop skeleton — matches actual data column widths */}
      <div className="hidden md:flex h-[70px] border-b border-border animate-pulse">
        {/* Frozen column placeholder */}
        <div
          className="flex-shrink-0 flex items-center gap-2 px-4 border-r border-border"
          style={{ width: showStar ? 240 : 215 }}
        >
          {showStar && <div className="w-4 h-4 bg-border/30 rounded flex-shrink-0" />}
          <div className="h-3 w-7 bg-border/40 rounded flex-shrink-0" />
          <div className="w-[30px] h-[30px] bg-border/40 rounded-md flex-shrink-0" />
          <div className="space-y-1.5 flex-1">
            <div className="h-3 w-16 bg-border/40 rounded" />
            <div className="h-2.5 w-10 bg-border/30 rounded" />
          </div>
        </div>

        {/* Data columns — width matches actual grid */}
        <div
          className="flex-1 grid items-center gap-x-2 px-4"
          style={{ gridTemplateColumns: gridTemplate }}
        >
          {Array.from({ length: colCount }).map((_, i) => (
            <div
              key={i}
              className="h-3 bg-border/40 rounded ml-auto"
              style={{ width: `${40 + (i % 3) * 16}px` }}
            />
          ))}
        </div>
      </div>
    </>
  )
}
