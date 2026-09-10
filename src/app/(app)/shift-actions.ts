'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function startShift(startingCash?: number) {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('start_shift', {
    p_starting_cash: startingCash ?? null,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/', 'layout')
  return data as { session_id: string; shift_id: string; mode: string }
}

export async function closeDay(closingCash: number, notes?: string) {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('close_day', {
    p_closing_cash: closingCash,
    p_notes: notes ?? null,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/', 'layout')
  return data as { expected_cash: number; variance: number; closing_cash: number }
}
