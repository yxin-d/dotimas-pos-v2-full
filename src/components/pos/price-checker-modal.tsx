'use client'

import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatPeso } from '@/lib/utils/currency'
import { Scan, X, QrCode } from 'lucide-react'
import { toast } from 'sonner'
import Badge from '@/src/components/ui/badge'
import type { Product } from '@/types/database'

interface PriceCheckerModalProps {
  onClose: () => void
}

export default function PriceCheckerModal({ onClose }: PriceCheckerModalProps) {
  const [scannerInput, setScannerInput] = useState('')
  const [scannedProduct, setScannedProduct] = useState<Product | null>(null)
  const [checking, setChecking] = useState(false)
  const [clientReady, setClientReady] = useState(false)
  const supabaseRef = useRef<any>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // ─── Init Supabase ────────────────────────────────────────
  useEffect(() => {
    supabaseRef.current = createClient()
    setClientReady(true)
  }, [])

  // ─── Auto-focus input ────────────────────────────────────
  useEffect(() => {
    if (clientReady && inputRef.current) {
      inputRef.current.focus()
    }
  }, [clientReady])

  // ─── Handle price check ──────────────────────────────────
  const handlePriceCheck = async () => {
    const barcode = scannerInput.trim()
    if (!barcode) {
      toast.error('Please enter or scan a barcode')
      return
    }

    if (!clientReady) {
      toast.error('Client not ready')
      return
    }

    setChecking(true)
    const { data, error } = await supabaseRef.current
      .from('products')
      .select('*')
      .eq('barcode', barcode)
      .maybeSingle()

    if (error) {
      toast.error('Error checking product')
    } else if (data) {
      setScannedProduct(data)
      toast.success(`Found: ${data.name}`)
    } else {
      setScannedProduct(null)
      toast.error('Product not found')
    }
    setChecking(false)
    setScannerInput('')
    inputRef.current?.focus()
  }

  // ─── Handle Enter key ────────────────────────────────────
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handlePriceCheck()
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
      <div className="bg-surface rounded-2xl shadow-xl max-w-md w-full">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="text-lg font-semibold text-ink flex items-center gap-2">
            <Scan size={20} className="text-primary" />
            Price Checker
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-surface-sunken text-ink-faint hover:text-ink transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-5">
          {/* Scanner input */}
          <div className="flex gap-2 mb-4">
            <div className="flex-1 relative">
              <Scan size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
              <input
                ref={inputRef}
                type="text"
                placeholder="Scan or type barcode..."
                value={scannerInput}
                onChange={(e) => setScannerInput(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full pl-9 pr-3 py-2 border border-border rounded-lg text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                autoFocus
              />
            </div>
            <button
              onClick={handlePriceCheck}
              disabled={checking}
              className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary-dark disabled:opacity-50 transition-colors"
            >
              {checking ? '...' : 'Check'}
            </button>
          </div>

          {/* Result display */}
          {scannedProduct === null && scannerInput && !checking && (
            <div className="bg-danger-soft text-danger p-4 rounded-xl text-center text-sm">
              Product not found
            </div>
          )}

          {scannedProduct && (
            <div className="bg-surface-sunken rounded-xl p-4 space-y-2">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-ink-faint">Barcode</p>
                  <p className="text-sm font-mono text-ink">{scannedProduct.barcode || '—'}</p>
                </div>
                <Badge tone={scannedProduct.is_active ? 'primary' : 'neutral'}>
                  {scannedProduct.is_active ? 'Active' : 'Inactive'}
                </Badge>
              </div>
              <div>
                <p className="text-xs text-ink-faint">Product Name</p>
                <p className="text-base font-semibold text-ink">{scannedProduct.name}</p>
              </div>
              <div className="grid grid-cols-3 gap-4 pt-2 border-t border-border">
                <div>
                  <p className="text-xs text-ink-faint">Price</p>
                  <p className="text-xl font-bold text-primary tabular">
                    {formatPeso(scannedProduct.price)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-ink-faint">Cost</p>
                  <p className="text-sm text-ink-faint tabular">
                    {formatPeso(scannedProduct.cost)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-ink-faint">Stock</p>
                  <p
                    className={`text-sm font-semibold tabular ${
                      scannedProduct.stocks <= scannedProduct.low_stock_threshold
                        ? 'text-danger'
                        : 'text-ink'
                    }`}
                  >
                    {scannedProduct.stocks}
                  </p>
                </div>
              </div>
            </div>
          )}

          {!scannedProduct && !scannerInput && !checking && (
            <div className="bg-ink-faint/5 rounded-xl p-8 text-center">
              <QrCode size={32} className="mx-auto text-ink-faint/30 mb-2" />
              <p className="text-sm text-ink-faint">
                Scan a barcode to check price and availability
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}