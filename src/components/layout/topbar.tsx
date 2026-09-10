'use client'

import { usePathname } from 'next/navigation'

const TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/pos': 'Point of Sale',
  '/products': 'Products',
  '/customers': 'Customers',
  '/sales': 'Sales',
  '/expenses': 'Expenses',
}

function titleFor(pathname: string): string {
  const base = '/' + pathname.split('/').filter(Boolean)[0]
  return TITLES[base] ?? 'Tindahan POS'
}

export default function Topbar() {
  const pathname = usePathname()
  const today = new Intl.DateTimeFormat('en-PH', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Manila',
  }).format(new Date())

  return (
    <header className="flex items-center justify-between px-6 py-4 bg-surface border-b border-border shrink-0">
      <h1 className="text-lg font-bold text-ink">{titleFor(pathname)}</h1>
      <span className="text-xs text-ink-faint tabular">{today}</span>
    </header>
  )
}
