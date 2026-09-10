import { createClient } from '@/lib/supabase/server'
import { getStaffAndShift } from '@/lib/staff'
import PosClient from '@/src/components/pos/pos-client'

export const dynamic = 'force-dynamic'

export default async function PosPage() {
  const supabase = await createClient()
  const [{ staff, session, activeShift }, { data: categories }] = await Promise.all([
    getStaffAndShift(),
    supabase.from('product_categories').select('*').order('sort_order').order('name'),
  ])

  return (
    <PosClient
      staff={staff}
      session={session}
      activeShift={activeShift}
      categories={categories ?? []}
    />
  )
}
