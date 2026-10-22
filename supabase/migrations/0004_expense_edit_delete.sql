-- ============================================================================
-- Let signed-in users edit and delete expenses.
--
-- The Expenses page has always had Edit and Delete buttons, but the table was
-- created insert-only (no UPDATE/DELETE grant or policy), so both silently
-- failed with a permission error. An expense is a plain record the owner
-- manages, unlike sales (which are corrected by voiding), so allow both.
-- ============================================================================

create policy "expenses update" on public.expenses for update to authenticated using (true) with check (true);
create policy "expenses delete" on public.expenses for delete to authenticated using (true);
grant update, delete on public.expenses to authenticated;
