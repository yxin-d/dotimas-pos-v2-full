'use client'

import { Menu, ChevronLeft, ChevronRight } from 'lucide-react'

interface HeaderProps {
  onMenuClick: () => void
  isSidebarCollapsed: boolean
  onToggleCollapse: () => void
}

export default function Header({ onMenuClick, isSidebarCollapsed, onToggleCollapse }: HeaderProps) {
  return (
    <header className="h-14 border-b border-border bg-surface flex items-center px-4 sticky top-0 z-30">
      <button
        onClick={onMenuClick}
        className="lg:hidden p-2 rounded-lg hover:bg-surface-sunken transition-colors"
        aria-label="Toggle menu"
      >
        <Menu size={20} />
      </button>

      <div className="flex-1" />

      {/* Desktop collapse toggle */}
      <button
        onClick={onToggleCollapse}
        className="hidden lg:flex items-center gap-1 text-sm text-ink-faint hover:text-ink p-2 rounded-lg hover:bg-surface-sunken transition-colors"
      >
        {isSidebarCollapsed ? (
          <ChevronRight size={18} />
        ) : (
          <ChevronLeft size={18} />
        )}
        <span className="text-xs font-medium">
          {isSidebarCollapsed ? 'Expand' : 'Collapse'}
        </span>
      </button>
    </header>
  )
}