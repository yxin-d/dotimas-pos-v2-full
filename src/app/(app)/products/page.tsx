import { createClient } from '@/lib/supabase/server'
import ProductsClient from '@/src/components/products/products-client'

export const dynamic = 'force-dynamic'

export default async function ProductsPage() {
  const supabase = await createClient()
  const [{ data: products }, { data: categories }] = await Promise.all([
    supabase.from('products').select('*, product_categories(name)').order('name'),
    supabase.from('product_categories').select('*').order('sort_order').order('name'),
  ])

  return <ProductsClient initialProducts={products ?? []} categories={categories ?? []} />
}
