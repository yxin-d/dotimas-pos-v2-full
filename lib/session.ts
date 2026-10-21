import { createClient } from '@/lib/supabase/server'
import { manilaDate } from '@/lib/utils/date'
import type { PosSession } from '@/types/database'

/**
 * The business day the POS should be working in.
 *
 * - If a day is still open, that's the one — even if it was opened on an
 *   earlier date and never closed. Its drawer hasn't been counted yet, so
 *   sales keep going into it until someone closes it.
 * - Otherwise today's day (Manila time), which may already be closed.
 * - null when today hasn't been opened yet.
 *
 * There's no staff/shift tracking: the login only proves the person is
 * allowed to use the system.
 */
export async function getCurrentSession(): Promise<PosSession | null> {
  const supabase = await createClient()

  const { data: open } = await supabase
    .from('pos_sessions')
    .select('*')
    .eq('status', 'open')
    .order('session_date', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (open) return open

  const { data: today } = await supabase
    .from('pos_sessions')
    .select('*')
    .eq('session_date', manilaDate())
    .maybeSingle()
  return today ?? null
}
