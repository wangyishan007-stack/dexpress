'use client'

import clsx from 'clsx'
import type { TimeWindow } from '@dex/shared'
import { Dropdown, DropdownItem } from '../Dropdown'

const OPTIONS: { value: TimeWindow; label: string }[] = [
  { value: '5m',  label: 'Last 5 minutes' },
  { value: '1h',  label: 'Last 1 hour' },
  { value: '6h',  label: 'Last 6 hours' },
  { value: '24h', label: 'Last 24 hours' },
]

const BTN_BASE = 'flex items-center gap-2 rounded-lg font-medium transition-colors'
const BTN_SIZE = 'h-[30px] px-2.5 text-[12px] md:h-[36px] md:px-2.5 md:text-[14px]'

function IconClock() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M5.99902 0.00976562C7.58719 0.0115809 9.11048 0.64352 10.2334 1.7666C11.3561 2.88958 11.9876 4.41209 11.9893 6C11.9872 7.58769 11.3551 9.10974 10.2324 10.2324C9.10974 11.3551 7.58772 11.9872 6 11.9893C4.41192 11.9878 2.88882 11.3561 1.76562 10.2334C0.642626 9.11068 0.0108313 7.58798 0.00878906 6C0.0104665 4.41181 0.642599 2.88963 1.76562 1.7666C2.88865 0.643575 4.41083 0.011443 5.99902 0.00976562ZM5.74902 2.52539C5.62027 2.52546 5.49628 2.57498 5.40332 2.66406C5.31027 2.75334 5.25534 2.87604 5.25 3.00488V6.49902C5.25003 6.68415 5.47989 6.8391 5.62988 6.9248C5.67103 6.98738 5.78506 7.04456 5.85449 7.08398L7.91309 8.33203C8.15201 8.46895 8.40981 8.38725 8.54785 8.14941C8.68499 7.91113 8.5575 7.60577 8.31836 7.46777L6.24902 6.27051V3.00488C6.24368 2.87605 6.18874 2.75333 6.0957 2.66406C6.00265 2.57479 5.87797 2.52539 5.74902 2.52539Z" fill="currentColor"/>
    </svg>
  )
}

function IconChevron() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  )
}

interface Props {
  window: TimeWindow
  onWindow: (w: TimeWindow) => void
}

export function TimeRangeDropdown({ window, onWindow }: Props) {
  const current = OPTIONS.find(o => o.value === window)

  return (
    <Dropdown
      trigger={
        <button className={clsx(BTN_BASE, BTN_SIZE, 'bg-blue text-white flex-shrink-0')}>
          <span><IconClock /></span>
          <span className="hidden md:inline">{current?.label ?? 'Last 24 hours'}</span>
          <span className="md:hidden">{window.toUpperCase()}</span>
          <IconChevron />
        </button>
      }
    >
      {OPTIONS.map(opt => (
        <DropdownItem
          key={opt.value}
          active={window === opt.value}
          onClick={() => onWindow(opt.value)}
        >
          {opt.label}
        </DropdownItem>
      ))}
    </Dropdown>
  )
}
