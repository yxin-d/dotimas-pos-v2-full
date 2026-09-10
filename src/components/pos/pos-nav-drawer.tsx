'use client'

import Link from 'next/link'
import { X, LayoutDashboard, Package, Users, Receipt, Wallet, Smartphone, LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

interface Props {
  onClose: () => void
}

const LINKS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/products', label: 'Products', icon: Package },
  { href: '/customers', label: 'Customers', icon: Users },
  { href: '/reports/sales', label: 'Sales reports', icon: Receipt },
  { href: '/reports/expenses', label: 'Expenses', icon: Wallet },
  { href: '/gcash', label: 'GCash', icon: Smartphone },
]

export default function PosNavDrawer({ onClose }: Props) {
  const router = useRouter()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-50" onClick={onClose} aria-hidden="true" />
      <div className="fixed inset-y-0 left-0 z-50 w-64 bg-surface border-r border-border flex flex-col">
        <div className="flex items-center justify-between px-4 py-4 border-b border-border">
          <span className="font-extrabold text-ink">
            <span className="text-primary">Dotimas</span>
          </span>
          <button onClick={onClose} className="text-ink-faint hover:text-ink"><X size={18} /></button>
        </div>
        <nav className="flex-1 p-2 flex flex-col gap-1">
          {LINKS.map(link => (
            <Link
              key={link.href}
              href={link.href}
              onClick={onClose}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-ink-soft hover:bg-primary-soft hover:text-primary-dark transition-colors"
            >
              <link.icon size={17} />
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="p-2 border-t border-border">
          <button
            onClick={handleSignOut}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-ink-faint hover:bg-danger-soft hover:text-danger transition-colors w-full"
          >
            <LogOut size={17} />
            Sign out
          </button>
        </div>
      </div>
    </>
  )
}
