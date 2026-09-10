'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Upload } from 'lucide-react'
import { importProducts } from '../action'
import { toast } from 'sonner'

export default function ImportProductsPage() {
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) return toast.error('Please select a file')

    setLoading(true)
    setResult(null)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await importProducts(formData)
      if (res.success) {
        const details = res.skippedRows.length > 0
          ? `\n\nSkipped rows:\n${res.skippedRows.slice(0, 20).join('\n')}${res.skippedRows.length > 20 ? `\n…and ${res.skippedRows.length - 20} more` : ''}`
          : ''
        setResult(res.message + details)
        toast.success('Import complete!')
        setTimeout(() => router.push('/products'), 2500)
      } else {
        toast.error(res.message)
        setResult(`❌ ${res.message}`)
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Import failed'
      toast.error(msg)
      setResult(`❌ Error: ${msg}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <Link href="/products" className="inline-flex items-center gap-1.5 text-sm text-ink-faint hover:text-ink mb-4 transition-colors">
        <ArrowLeft size={14} />
        Back to products
      </Link>

      <h1 className="text-2xl font-bold mb-4">Import Products</h1>

      <div className="bg-surface-sunken/60 rounded-xl p-4 mb-6 text-sm text-ink-faint space-y-1">
        <p>Upload an Excel (<strong>.xlsx</strong>, <strong>.xls</strong>) or <strong>CSV</strong> file. Every sheet tab is imported, and <strong>the sheet&apos;s tab name becomes the product category</strong> (created automatically if it doesn&apos;t exist yet). A plain CSV only has one implicit sheet, so it all lands in one category — use an XLSX with multiple tabs to import several categories at once.</p>
        <p>
          <span className="font-semibold text-ink-soft">Supported columns:</span><br />
          <strong>name</strong> (required), <strong>sku</strong> (auto-generated if left blank), <strong>barcode</strong> (optional), <strong>volume</strong>,{' '}
          <strong>price</strong>, <strong>cost</strong>, <strong>stocks</strong>,{' '}
          <strong>low_stock_threshold</strong>, <strong>is_active</strong> (true/false).
        </p>
        <p className="text-xs text-ink-faint/70">
          <span className="font-semibold">Note:</span> Rows with no price are still imported (so barcode/name aren&apos;t lost) but are marked inactive until you set a price — use Bulk edit on the Products page to price several at once.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="bg-surface rounded-xl border border-border p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Choose file</label>
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="w-full border border-border rounded-lg px-4 py-2 bg-surface-sunken file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-primary/10 file:text-primary hover:file:bg-primary/20 cursor-pointer"
            disabled={loading}
          />
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={!file || loading}
            className="flex-1 bg-primary text-white py-2.5 rounded-lg font-semibold hover:bg-primary-dark transition-colors disabled:bg-ink-faint disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? 'Importing...' : (<><Upload size={16} />Import Products</>)}
          </button>
          <button
            type="button"
            onClick={() => { setFile(null); setResult(null) }}
            className="px-4 border border-border rounded-lg text-ink-faint hover:bg-surface-sunken transition-colors disabled:opacity-50"
            disabled={!file || loading}
          >
            Clear
          </button>
        </div>

        {result && (
          <div className="mt-4 p-3 bg-surface-sunken rounded-lg text-sm whitespace-pre-wrap border border-border">
            {result}
          </div>
        )}
      </form>

      <div className="mt-6 text-center">
        <button
          onClick={() => {
            const headers = ['name', 'sku', 'barcode', 'volume', 'price', 'cost', 'stocks', 'low_stock_threshold', 'is_active']
            const sample = headers.join(',') + '\n' +
              '"Milk 1L","","890123456789","1L","85.00","65.00","50","5","true"\n' +
              '"Bread White","","890123456790","500g","45.00","30.00","20","3","true"\n' +
              '"Cola 330ml","","890123456791","330ml","25.00","18.00","100","10","true"'
            const blob = new Blob([sample], { type: 'text/csv' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = 'sample_product_import.csv'
            a.click()
            URL.revokeObjectURL(url)
            toast.success('Sample CSV downloaded')
          }}
          className="text-sm text-primary hover:underline"
        >
          📥 Download sample CSV template
        </button>
      </div>
    </div>
  )
}
