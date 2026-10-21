import { createClient } from '@/lib/supabase/server'
import { getCurrentSession } from '@/lib/session'
import PosClient from '@/src/components/pos/pos-client'

export const dynamic = 'force-dynamic'

export default async function PosPage() {
  const supabase = await createClient()
  const [session, { data: categories }] = await Promise.all([
    getCurrentSession(),
    supabase.from('product_categories').select('*').order('sort_order').order('name'),
  ])

  return <PosClient session={session} categories={categories ?? []} />
}
