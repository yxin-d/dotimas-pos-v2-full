'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import Header from '@/src/components/layout/header'
import Sidebar from '@/src/components/layout/sidebar'
import { cn } from '@/lib/utils/utils'

// POS runs full-screen with no sidebar — it's the highest-pressure, most
// time-critical screen, so it gets the most space. Everything else (Products,
// Customers, Dashboard, Reports, GCash) keeps the management-screen sidebar.
const FULL_SCREEN_PREFIXES = ['/pos']

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isFullScreen = FULL_SCREEN_PREFIXES.some(p => pathname?.startsWith(p))

  const [isMobileOpen, setIsMobileOpen] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('sidebar-collapsed') === 'true'
  })

  const handleToggleCollapse = () => {
    const newState = !isCollapsed
    setIsCollapsed(newState)
    localStorage.setItem('sidebar-collapsed', String(newState))
  }

  if (isFullScreen) {
    return <div className="h-screen overflow-hidden bg-canvas">{children}</div>
  }

  return (
    <div className="flex h-screen overflow-hidden bg-canvas">
      <Sidebar
        isMobileOpen={isMobileOpen}
        onMobileClose={() => setIsMobileOpen(false)}
        isCollapsed={isCollapsed}
        onToggleCollapse={handleToggleCollapse}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <Header
          onMenuClick={() => setIsMobileOpen(true)}
          isSidebarCollapsed={isCollapsed}
          onToggleCollapse={handleToggleCollapse}
        />
        <main className={cn('flex-1 overflow-y-auto p-4 transition-all duration-300')}>
          {children}
        </main>
      </div>
    </div>
  )
}
