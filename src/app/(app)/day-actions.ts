'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// See the NOTE in pos/action.ts — returning { error } instead of throwing so
// the real message survives Next's production redaction of thrown Server
// Action errors.
export async function openDay(
  startingCash: number
): Promise<{ data: { session_id: string; mode: string } | null; error: string | null }> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('open_day', {
    p_starting_cash: startingCash,
  })
  if (error) return { data: null, error: error.message }
  revalidatePath('/', 'layout')
  return { data: data as { session_id: string; mode: string }, error: null }
}

export async function closeDay(
  closingCash: number,
  notes?: string
): Promise<{
  data: { session_date: string; expected_cash: number; variance: number; closing_cash: number } | null
  error: string | null
}> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('close_day', {
    p_closing_cash: closingCash,
    p_notes: notes ?? null,
  })
  if (error) return { data: null, error: error.message }
  revalidatePath('/', 'layout')
  return {
    data: data as { session_date: string; expected_cash: number; variance: number; closing_cash: number },
    error: null,
  }
}
