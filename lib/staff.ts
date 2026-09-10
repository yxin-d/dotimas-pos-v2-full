import { createClient } from '@/lib/supabase/server'
import type { Staff, PosSession, StaffShift } from '@/types/database'

export interface StaffAndShift {
  staff: Staff | null
  session: PosSession | null
  activeShift: StaffShift | null
}

/**
 * Resolves the currently logged-in staff member, today's pos_session (if any),
 * and their own active shift row (if any). Used by any page that needs to
 * show "who's logged in" or gate an action behind "shift must be open."
 *
 * A staff member can have MORE than one shift row per day (they can leave and
 * come back — see staff_shifts in the schema) so "active" specifically means
 * ended_at is null, not just "worked today."
 */
export async function getStaffAndShift(): Promise<StaffAndShift> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { staff: null, session: null, activeShift: null }
  }

  const [{ data: staff }, { data: session }] = await Promise.all([
    supabase.from('staff').select('*').eq('id', user.id).single(),
    supabase.from('pos_sessions').select('*').eq('session_date', new Date().toISOString().slice(0, 10)).maybeSingle(),
  ])

  let activeShift: StaffShift | null = null
  if (session) {
    const { data } = await supabase
      .from('staff_shifts')
      .select('*')
      .eq('session_id', session.id)
      .eq('staff_id', user.id)
      .is('ended_at', null)
      .maybeSingle()
    activeShift = data ?? null
  }

  return { staff: staff ?? null, session: session ?? null, activeShift }
}
