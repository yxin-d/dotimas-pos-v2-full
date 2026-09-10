'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Users,
  Wallet,
  LogOut,
  Smartphone,
  ChartBar,
  ChevronDown,
  ChevronRight,
  Receipt,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils/utils' // if you have a cn utility; otherwise use template strings

// ─── Types ──────────────────────────────────────────────────
interface NavItem {
  type: 'item'
  href: string
  label: string
  icon: any
}

interface NavGroup {
  type: 'group'
  label: string
  icon: any
  children: NavItem[]
}

type NavEntry = NavItem | NavGroup

// ─── Navigation data ──────────────────────────────────────
const navItems: NavEntry[] = [
  { type: 'item', href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { type: 'item', href: '/pos', label: 'POS', icon: ShoppingCart },
  { type: 'item', href: '/products', label: 'Products', icon: Package },
  { type: 'item', href: '/customers', label: 'Customers', icon: Users },
  {
    type: 'group',
    label: 'Reports',
    icon: ChartBar,
    children: [
      { type: 'item', href: '/reports/sales', label: 'Sales', icon: Receipt },
      { type: 'item', href: '/reports/expenses', label: 'Expenses', icon: Wallet },
    ],
  },
  { type: 'item', href: '/gcash', label: 'GCash', icon: Smartphone },
]

interface SidebarProps {
  isMobileOpen: boolean
  onMobileClose: () => void
  isCollapsed: boolean
  onToggleCollapse: () => void
}

export default function Sidebar({
  isMobileOpen,
  onMobileClose,
  isCollapsed,
  onToggleCollapse,
}: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()

  // ─── Active check ────────────────────────────────────────
  const isActive = (href: string) => {
    return pathname === href || (href !== '/pos' && pathname.startsWith(href + '/'))
  }

  // ─── Expand state for groups ────────────────────────────
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {}
    for (const item of navItems) {
      if (item.type === 'group') {
        const isChildActive = item.children.some((child) => isActive(child.href))
        initial[item.label] = isChildActive
      }
    }
    return initial
  })

  const toggleGroup = (label: string) => {
    setExpandedGroups((prev) => ({ ...prev, [label]: !prev[label] }))
  }

  // ─── Sign out ─────────────────────────────────────────────
  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  // ─── Type guard ──────────────────────────────────────────
  const isGroup = (item: NavEntry): item is NavGroup => item.type === 'group'

  // ─── Sidebar content (shared between desktop and mobile) ──
  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className={cn(
        "px-4 py-5 border-b border-border",
        isCollapsed && "px-2 text-center"
      )}>
        <span className={cn(
          "font-bold text-ink text-base",
          isCollapsed && "text-xs block"
        )}>
          {isCollapsed ? 'DS' : 'Dotimas Store'}
        </span>
        {!isCollapsed && (
          <p className="text-xs text-ink-faint mt-0.5">Multipurpose POS System</p>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          // ── Regular nav item ──
          if (!isGroup(item)) {
            const active = isActive(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  active
                    ? 'bg-primary-soft text-primary font-semibold'
                    : 'text-ink-soft hover:bg-surface-sunken hover:text-ink',
                  isCollapsed && "justify-center px-0"
                )}
                title={isCollapsed ? item.label : undefined}
              >
                <item.icon size={16} />
                {!isCollapsed && item.label}
              </Link>
            )
          }

          // ── Group ──
          const isExpanded = expandedGroups[item.label] ?? false
          const isChildActive = item.children.some((child) => isActive(child.href))

          if (isCollapsed) {
            // In collapsed mode, only show the group icon, no expand/collapse
            return (
              <div key={item.label} className="relative group">
                <button
                  className={cn(
                    "w-full flex items-center justify-center px-0 py-2 rounded-lg text-sm font-medium transition-colors",
                    isChildActive
                      ? 'bg-primary-soft text-primary'
                      : 'text-ink-soft hover:bg-surface-sunken hover:text-ink'
                  )}
                  title={item.label}
                >
                  <item.icon size={16} />
                </button>
                {/* Tooltip-like expanded children on hover? We'll skip for simplicity */}
              </div>
            )
          }

          // Expanded mode with children
          return (
            <div key={item.label} className="space-y-0.5">
              <button
                onClick={() => toggleGroup(item.label)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  isChildActive
                    ? 'bg-primary-soft text-primary font-semibold'
                    : 'text-ink-soft hover:bg-surface-sunken hover:text-ink'
                )}
              >
                <item.icon size={16} />
                <span className="flex-1 text-left">{item.label}</span>
                {isExpanded ? (
                  <ChevronDown size={14} className="text-ink-faint" />
                ) : (
                  <ChevronRight size={14} className="text-ink-faint" />
                )}
              </button>

              {isExpanded && (
                <div className="ml-4 space-y-0.5">
                  {item.children.map((child) => {
                    const active = isActive(child.href)
                    return (
                      <Link
                        key={child.href}
                        href={child.href}
                        className={cn(
                          "flex items-center gap-3 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                          active
                            ? 'bg-primary-soft text-primary font-semibold'
                            : 'text-ink-soft hover:bg-surface-sunken hover:text-ink'
                        )}
                      >
                        <child.icon size={14} />
                        {child.label}
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      {/* Footer: Sign out */}
      <div className={cn(
        "px-2 pb-4 border-t border-border pt-3",
        isCollapsed && "px-0"
      )}>
        <button
          onClick={handleSignOut}
          className={cn(
            "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors w-full",
            "text-ink-faint hover:text-danger hover:bg-danger-soft",
            isCollapsed && "justify-center px-0"
          )}
          title={isCollapsed ? "Sign out" : undefined}
        >
          <LogOut size={16} />
          {!isCollapsed && "Sign out"}
        </button>
      </div>
    </div>
  )

  // ─── Render ──────────────────────────────────────────────
  return (
    <>
      {/* Mobile overlay */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-40 lg:hidden"
          onClick={onMobileClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed lg:sticky top-0 h-screen bg-surface border-r border-border flex flex-col shrink-0 z-50 transition-transform duration-300 ease-in-out",
          isCollapsed ? "w-16" : "w-56",
          // Mobile: slide in/out
          "lg:translate-x-0",
          isMobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {sidebarContent}
      </aside>
    </>
  )
}