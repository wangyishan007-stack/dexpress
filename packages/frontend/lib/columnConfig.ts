export interface ColumnDef {
  key: string
  label: string
  headerLabel: string
  width: string
}

export interface ScreenerConfig {
  columns: string[]
  visible: Record<string, boolean>
}

export const COLUMN_DEFS: ColumnDef[] = [
  { key: 'price',        label: 'Price',        headerLabel: 'Price',     width: '100px' },
  { key: 'age',          label: 'Age',          headerLabel: 'Age',       width: '60px'  },
  { key: 'transactions', label: 'Transactions', headerLabel: 'Txns',      width: '80px'  },
  { key: 'volume',       label: 'Volume',       headerLabel: 'Volume',    width: '90px'  },
  { key: 'makers',       label: 'Makers',       headerLabel: 'Makers',    width: '70px'  },
  { key: '5m',           label: '5M',           headerLabel: '5M',        width: '68px'  },
  { key: '1h',           label: '1H',           headerLabel: '1H',        width: '68px'  },
  { key: '6h',           label: '6H',           headerLabel: '6H',        width: '68px'  },
  { key: '24h',          label: '24H',          headerLabel: '24H',       width: '68px'  },
  { key: 'liquidity',    label: 'Liquidity',    headerLabel: 'Liquidity', width: '90px'  },
  { key: 'mcap',         label: 'Market Cap',   headerLabel: 'MCap',      width: '90px'  },
]

const COLUMN_DEF_MAP = new Map(COLUMN_DEFS.map(c => [c.key, c]))

export function getColumnDef(key: string): ColumnDef | undefined {
  return COLUMN_DEF_MAP.get(key)
}

export const DEFAULT_CONFIG: ScreenerConfig = {
  columns: COLUMN_DEFS.map(c => c.key),
  visible: Object.fromEntries(COLUMN_DEFS.map(c => [c.key, true])),
}

const STORAGE_PREFIX = 'screener_columns_v1'

export type ScreenerPage = 'allcoins' | 'new-pairs' | 'gainers' | 'watchlist'

function storageKey(page: ScreenerPage): string {
  return `${STORAGE_PREFIX}_${page}`
}

export function loadConfig(page: ScreenerPage = 'allcoins'): ScreenerConfig {
  try {
    const raw = localStorage.getItem(storageKey(page))
    if (raw) {
      const parsed = JSON.parse(raw) as ScreenerConfig
      if (parsed && Array.isArray(parsed.columns) && parsed.columns.length > 0) {
        // Ensure all known columns exist (in case new columns were added)
        const known = new Set(COLUMN_DEFS.map(c => c.key))
        const existing = new Set(parsed.columns)
        for (const def of COLUMN_DEFS) {
          if (!existing.has(def.key)) {
            parsed.columns.push(def.key)
            parsed.visible[def.key] = true
          }
        }
        // Remove unknown columns
        parsed.columns = parsed.columns.filter(k => known.has(k))
        return parsed
      }
    }
  } catch {}
  return { ...DEFAULT_CONFIG, visible: { ...DEFAULT_CONFIG.visible } }
}

export function saveConfig(config: ScreenerConfig, page: ScreenerPage = 'allcoins'): void {
  try {
    localStorage.setItem(storageKey(page), JSON.stringify(config))
  } catch {}
}

export function getVisibleColumns(config: ScreenerConfig): ColumnDef[] {
  return config.columns
    .filter(key => config.visible[key])
    .map(key => getColumnDef(key))
    .filter(Boolean) as ColumnDef[]
}

export function buildGridCols(visibleCols: ColumnDef[], showStar: boolean): string {
  const fixed = showStar ? '28px 36px 1fr' : '36px 1fr'
  const dynamic = visibleCols.map(c => c.width).join(' ')
  return `${fixed} ${dynamic}`
}

/* ─── Two-panel (frozen token + scrollable data) helpers ── */
export const FROZEN_WIDTH_STAR = 280
export const FROZEN_WIDTH_NO_STAR = 250

export function buildDataGridCols(visibleCols: ColumnDef[]): string {
  return visibleCols.map(c => c.width).join(' ')
}

export const DEFAULT_DATA_GRID = COLUMN_DEFS.map(c => c.width).join(' ')
