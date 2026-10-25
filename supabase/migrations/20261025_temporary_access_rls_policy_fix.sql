-- Profile-only read policy avoids reliance on is_head_of_operations() EXECUTE privilege.
drop policy if exists temporary_access_self_or_head_read on public.temporary_access_grants;
create policy temporary_access_self_or_head_read on public.temporary_access_grants
 for select to authenticated
 using (
  user_id = (select auth.uid())
  or exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.active and p.role::text = 'head_of_operations'
  )
);
