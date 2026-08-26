-- Compatibility fix for fleet management RPCs.
-- Several production machine-management functions still call public.is_manager(),
-- while the hardened schema exposes public.can_manage().

create or replace function public.is_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_manage();
$$;

grant execute on function public.is_manager() to authenticated;
