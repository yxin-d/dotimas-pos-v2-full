'use server'

import { createClient } from '@/lib/supabase/server'
import * as XLSX from 'xlsx'
import { revalidatePath } from 'next/cache'

// ------------------- CREATE / UPDATE (used by the quick-preview pane) -------------------

export interface ProductPayload {
  name: string
  sku: string | null
  barcode: string | null      // optional everywhere — no schema/UI requirement
  volume: string | null
  category_id: string | null
  price: number
  cost: number
  stocks: number
  low_stock_threshold: number
  is_active: boolean
}

function generateSku(categoryName: string, name: string, volume?: string | null): string {
  const slug = (s: string, max: number) =>
    s.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max)
  const parts = [slug(categoryName, 12), slug(name, 20)]
  if (volume) parts.push(slug(volume, 10))
  return parts.filter(Boolean).join('-') || 'ITEM'
}

export async function createProduct(payload: ProductPayload, categoryName?: string) {
  const supabase = await createClient()

  let sku = payload.sku
  if (!sku) {
    const base = generateSku(categoryName ?? 'ITEM', payload.name, payload.volume)
    let candidate = base
    let n = 2
    // Dedupe against existing SKUs
    while (true) {
      const { data } = await supabase.from('products').select('id').eq('sku', candidate).maybeSingle()
      if (!data) break
      candidate = `${base}-${n}`
      n++
    }
    sku = candidate
  }

  const { data, error } = await supabase
    .from('products')
    .insert({ ...payload, sku })
    .select('*, product_categories(name)')
    .single()

  if (error) throw new Error(error.message)
  revalidatePath('/products')
  return data
}

export async function updateProduct(id: string, payload: ProductPayload) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('products')
    .update(payload)
    .eq('id', id)
    .select('*, product_categories(name)')
    .single()

  if (error) throw new Error(error.message)
  revalidatePath('/products')
  return data
}

// ------------------- BULK EDIT -------------------

export interface BulkEditPayload {
  category_id?: string | null
  price?: number
  is_active?: boolean
}

export async function bulkUpdateProducts(ids: string[], changes: BulkEditPayload) {
  if (ids.length === 0) throw new Error('No products selected')
  const supabase = await createClient()

  const { error } = await supabase.from('products').update(changes).in('id', ids)
  if (error) throw new Error(error.message)
  revalidatePath('/products')
  return { updated: ids.length }
}

// ------------------- IMPORT -------------------
// Every sheet tab is its own category (auto-created if new). Price is optional —
// rows without one still import, just inactive, so barcode/name/volume aren't lost.

interface ProductImportRow {
  name: string
  sku?: string
  barcode?: string
  volume?: string
  price?: number
  cost?: number
  stocks?: number
  low_stock_threshold?: number
  is_active?: boolean
}

interface ImportResult {
  success: boolean
  message: string
  inserted: number
  updated: number
  skipped: number
  missing_price: number
  skippedRows: string[]
  categoriesCreated: string[]
}

export async function importProducts(formData: FormData): Promise<ImportResult> {
  const supabase = await createClient()
  const file = formData.get('file') as File
  if (!file) {
    return { success: false, message: 'No file uploaded', inserted: 0, updated: 0, skipped: 0, missing_price: 0, skippedRows: [], categoriesCreated: [] }
  }

  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })

  const mapKey = (key: string) => {
    const lower = key.toLowerCase().trim()
    if (['name', 'product name'].includes(lower)) return 'name'
    if (['sku', 'product code'].includes(lower)) return 'sku'
    if (['barcode', 'upc'].includes(lower)) return 'barcode'
    if (['volume', 'size', 'pack size'].includes(lower)) return 'volume'
    if (['price', 'selling price', 'unit price'].includes(lower)) return 'price'
    if (['cost', 'cost price', 'purchase price'].includes(lower)) return 'cost'
    if (['stocks', 'stock', 'quantity', 'qty'].includes(lower)) return 'stocks'
    if (['low_stock_threshold', 'threshold', 'alert level'].includes(lower)) return 'low_stock_threshold'
    if (['is_active', 'active', 'status'].includes(lower)) return 'is_active'
    return null
  }

  function normalizeRow(row: Record<string, unknown>): ProductImportRow {
    const mapped: Partial<Record<keyof ProductImportRow, string | number | boolean>> = {}
    for (const [key, value] of Object.entries(row)) {
      const mappedKey = mapKey(key)
      if (!mappedKey) continue
      if (value === undefined || value === null || String(value).trim() === '') continue
      const strVal = String(value).trim()
      if (['price', 'cost', 'stocks', 'low_stock_threshold'].includes(mappedKey)) {
        const num = parseFloat(strVal)
        if (!isNaN(num)) mapped[mappedKey as 'price'] = num
      } else if (mappedKey === 'is_active') {
        mapped.is_active = strVal.toLowerCase() === 'true' || value === 1 || strVal === '1'
      } else {
        mapped[mappedKey as 'name'] = strVal
      }
    }
    return mapped as ProductImportRow
  }

  const { data: existingCats } = await supabase.from('product_categories').select('id, name')
  const categoryMap = new Map<string, string>()
  existingCats?.forEach(c => categoryMap.set(c.name.toLowerCase(), c.id))
  const categoriesCreated: string[] = []

  async function getOrCreateCategoryId(name: string): Promise<string | null> {
    const key = name.toLowerCase()
    if (categoryMap.has(key)) return categoryMap.get(key)!
    const { data, error } = await supabase.from('product_categories').insert({ name }).select('id').single()
    if (error || !data) return null
    categoryMap.set(key, data.id)
    categoriesCreated.push(name)
    return data.id
  }

  const { data: existingSkuRows } = await supabase.from('products').select('sku')
  const usedSkus = new Set<string>((existingSkuRows || []).map(r => r.sku).filter(Boolean))

  function slug(s: string, max: number) {
    return s.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max)
  }
  function generateImportSku(category: string, name: string, volume?: string): string {
    const parts = [slug(category, 12), slug(name, 20)]
    if (volume) parts.push(slug(volume, 10))
    const base = parts.filter(Boolean).join('-') || 'ITEM'
    let candidate = base
    let n = 2
    while (usedSkus.has(candidate)) { candidate = `${base}-${n}`; n++ }
    usedSkus.add(candidate)
    return candidate
  }

  const results = { inserted: 0, updated: 0, skipped: 0, missing_price: 0 }
  const skippedRows: string[] = []

  for (const sheetName of workbook.SheetNames) {
    const rawRows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName])
    if (rawRows.length === 0) continue

    const categoryId = await getOrCreateCategoryId(sheetName)

    for (const [index, rawRow] of rawRows.entries()) {
      const row = normalizeRow(rawRow)
      const rowLabel = `[${sheetName}] Row ${index + 2}`

      if (!row.name) {
        results.skipped++
        skippedRows.push(`${rowLabel}: missing name — skipped`)
        continue
      }

      const hasPrice = row.price !== undefined && row.price >= 0
      if (!hasPrice) results.missing_price++

      const sku = row.sku || generateImportSku(sheetName, row.name, row.volume)

      const productPayload = {
        name: row.name,
        sku,
        barcode: row.barcode || null,
        volume: row.volume || null,
        category_id: categoryId,
        price: hasPrice ? row.price! : 0,
        cost: row.cost ?? 0,
        stocks: row.stocks || 0,
        low_stock_threshold: row.low_stock_threshold || 5,
        is_active: hasPrice ? (row.is_active ?? true) : false,
      }

      let existingId: string | null = null
      if (productPayload.barcode) {
        const { data: existing } = await supabase.from('products').select('id').eq('barcode', productPayload.barcode).maybeSingle()
        if (existing) existingId = existing.id
      }
      if (!existingId && productPayload.sku) {
        const { data: existing } = await supabase.from('products').select('id').eq('sku', productPayload.sku).maybeSingle()
        if (existing) existingId = existing.id
      }

      if (existingId) {
        const { error } = await supabase.from('products').update(productPayload).eq('id', existingId)
        if (!error) results.updated++
        else { results.skipped++; skippedRows.push(`${rowLabel}: update failed — ${error.message}`); continue }
      } else {
        const { error } = await supabase.from('products').insert(productPayload)
        if (!error) results.inserted++
        else { results.skipped++; skippedRows.push(`${rowLabel}: insert failed — ${error.message}`); continue }
      }
    }
  }

  const messageParts = [
    `✅ Import complete: ${results.inserted} inserted, ${results.updated} updated, ${results.skipped} skipped`,
  ]
  if (categoriesCreated.length > 0) messageParts.push(`New categories created: ${categoriesCreated.join(', ')}`)
  if (results.missing_price > 0) {
    messageParts.push(`⚠️ ${results.missing_price} product(s) had no price — imported but marked inactive. Use Bulk edit to price them.`)
  }

  revalidatePath('/products')
  return { success: true, message: messageParts.join('\n'), ...results, skippedRows, categoriesCreated }
}

// ------------------- EXPORT -------------------
// No product_batches table in V2 — plain product export only.
export async function exportProducts() {
  const supabase = await createClient()
  const { data: products, error } = await supabase
    .from('products')
    .select('name, sku, barcode, volume, price, cost, stocks, low_stock_threshold, is_active, product_categories(name)')
    .order('name')

  if (error) throw new Error('Failed to fetch products')

  const flat = (products ?? []).map(p => ({
    name: p.name,
    sku: p.sku,
    barcode: p.barcode,
    volume: p.volume,
    category: (p.product_categories as unknown as { name: string } | null)?.name ?? '',
    price: p.price,
    cost: p.cost,
    stocks: p.stocks,
    low_stock_threshold: p.low_stock_threshold,
    is_active: p.is_active,
  }))

  const worksheet = XLSX.utils.json_to_sheet(flat)
  return XLSX.utils.sheet_to_csv(worksheet)
}
