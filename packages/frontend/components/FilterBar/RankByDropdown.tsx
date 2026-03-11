'use client'

import { useTranslations } from 'next-intl'
import { Dropdown, DropdownItem, DropdownSectionTitle, DropdownDivider } from '../Dropdown'

function IconRank() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M12.2447 2.52009H11.1388C10.9988 1.79909 10.3618 1.24609 9.59175 1.24609H4.48175C3.71875 1.24609 3.08175 1.79209 2.93475 2.52009H1.83575C1.42975 2.52009 1.09375 2.84909 1.09375 3.26209V4.52209C1.09375 5.54409 1.90575 6.38409 2.91375 6.43309C3.03975 8.44909 4.62175 10.0801 6.61675 10.2831V11.9141H3.32675C3.09575 11.9141 2.90675 12.1031 2.90675 12.3341C2.90675 12.5651 3.09575 12.7541 3.32675 12.7541H10.7537C10.9847 12.7541 11.1737 12.5651 11.1737 12.3341C11.1737 12.1031 10.9847 11.9141 10.7537 11.9141H7.46375V10.2831C9.45875 10.0801 11.0407 8.44909 11.1667 6.43309C12.1817 6.38409 12.9867 5.54409 12.9867 4.52209V3.26209C12.9867 2.85609 12.6577 2.52009 12.2447 2.52009ZM1.93375 4.52209V3.36009H2.90675V5.58609C2.36075 5.53709 1.93375 5.08209 1.93375 4.52209ZM12.1467 4.52209C12.1467 5.08209 11.7197 5.53709 11.1737 5.59309V3.36009H12.1467V4.52209Z" fill="currentColor"/>
    </svg>
  )
}

const TRENDING_WINDOWS = ['5m', '1h', '6h', '24h'] as const
const STATIC_FIELD_KEYS = [
  { value: 'liquidity_usd', key: 'liquidity' as const },
  { value: 'mcap_usd',      key: 'mcap'      as const },
]

interface Props {
  sort:       string
  order:      'asc' | 'desc'
  onSort:     (s: string) => void
  onOrder:    (o: 'asc' | 'desc') => void
  onFilter?:  (f: string) => void
  rankLabel:  string
  dataWindow: string
}

export function RankByDropdown({ sort, order, onSort, onOrder, onFilter, rankLabel, dataWindow }: Props) {
  const t = useTranslations('filter')
  const dynamicOptions = [
    { value: `txns_${dataWindow}`,   label: t('txns')      },
    { value: `buys_${dataWindow}`,   label: t('buys')      },
    { value: `sells_${dataWindow}`,  label: t('sells')     },
    { value: `volume_${dataWindow}`, label: t('volume')    },
  ]
  const trendingOptions = TRENDING_WINDOWS.map(w => ({
    value: `trending_${w}`, label: `${t('trending')} ${w.toUpperCase()}`,
  }))
  const staticOptions = STATIC_FIELD_KEYS.map(o => ({ value: o.value, label: t(o.key) }))
  const rankOptions = [...trendingOptions, ...dynamicOptions, ...staticOptions]

  return (
    <Dropdown
      align="right"
      trigger={
        <button className="flex items-center gap-2 h-full px-3 md:px-4 text-sub hover:text-white transition-colors whitespace-nowrap">
          <IconRank />
          <span className="hidden md:inline text-[14px] text-text">{t('rankByLabel', { label: rankLabel })}</span>
        </button>
      }
    >
      <DropdownSectionTitle>{t('orderLabel')}</DropdownSectionTitle>
      <DropdownItem active={order === 'desc'} onClick={() => onOrder('desc')}>
        {t('descending')}
      </DropdownItem>
      <DropdownItem active={order === 'asc'} onClick={() => onOrder('asc')}>
        {t('ascending')}
      </DropdownItem>

      <DropdownDivider />

      <DropdownSectionTitle>{t('rankBy')}</DropdownSectionTitle>
      {rankOptions.map((opt) => (
        <DropdownItem
          key={opt.value}
          active={sort === opt.value}
          onClick={() => {
            onSort(opt.value)
            // Auto-sync filter mode with selected sort
            if (onFilter) {
              if (opt.value.startsWith('trending_')) onFilter('trending')
              else if (opt.value.startsWith('change_')) onFilter('gainers')
              else if (opt.value.startsWith('volume_') || opt.value.startsWith('txns_') || opt.value.startsWith('buys_') || opt.value.startsWith('sells_') || opt.value === 'liquidity_usd' || opt.value === 'mcap_usd') onFilter('top')
              else if (opt.value === 'created_at') onFilter('new')
            }
          }}
        >
          {opt.label}
        </DropdownItem>
      ))}
    </Dropdown>
  )
}
