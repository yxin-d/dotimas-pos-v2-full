revoke execute on function public.record_credit_change(uuid, uuid, ledger_entry_type, numeric, text) from public;
revoke execute on function public.start_shift(numeric) from public;
revoke execute on function public.close_day(numeric, text) from public;
revoke execute on function public.complete_sale(uuid, jsonb, boolean, jsonb) from public;
revoke execute on function public.void_sale(uuid, text) from public;
revoke execute on function public.confirm_gcash_submission(uuid) from public;
revoke execute on function public.reject_gcash_submission(uuid, text) from public;

grant execute on function public.record_credit_change(uuid, uuid, ledger_entry_type, numeric, text) to authenticated;
grant execute on function public.start_shift(numeric) to authenticated;
grant execute on function public.close_day(numeric, text) to authenticated;
grant execute on function public.complete_sale(uuid, jsonb, boolean, jsonb) to authenticated;
grant execute on function public.void_sale(uuid, text) to authenticated;
grant execute on function public.confirm_gcash_submission(uuid) to authenticated;
grant execute on function public.reject_gcash_submission(uuid, text) to authenticated;
