'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function createCategory(name: string) {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Category name is required')
  const supabase = await createClient()
  const { data, error } = await supabase.from('product_categories').insert({ name: trimmed }).select().single()
  if (error) throw new Error(error.message)
  revalidatePath('/products/categories')
  revalidatePath('/products')
  return data
}

export async function updateCategory(id: string, name: string) {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Category name is required')
  const supabase = await createClient()
  const { error } = await supabase.from('product_categories').update({ name: trimmed }).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/products/categories')
  revalidatePath('/products')
}

// Deleting a category doesn't delete its products — category_id is ON DELETE
// SET NULL, so they just become uncategorized, never silently removed.
export async function deleteCategory(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('product_categories').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/products/categories')
  revalidatePath('/products')
}
