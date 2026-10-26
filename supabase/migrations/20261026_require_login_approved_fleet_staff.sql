-- Require an approved employee account for fleet data and file access.
-- Existing active staff remain active. The Head-only employee-management
-- Edge Function explicitly sets approved invitees to active = true.
--
-- This migration changes grants/policies only; it does not modify any fleet,
-- service, breakdown, machine-hour or production-clock records.

-- Security-definer helper checks the trusted profiles table without recursion.
create or replace function public.is_active_fleet_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select (select auth.uid()) is not null
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.active is true
    );
$function$;

revoke all on function public.is_active_fleet_user() from public, anon;
grant execute on function public.is_active_fleet_user() to authenticated, service_role;

-- Supabase Auth's ordinary signup hook creates an unapproved profile.
-- Existing employees remain unchanged. The authorized Head-only admin
-- onboarding flow explicitly activates each newly created employee.
alter table public.profiles alter column active set default false;

-- Remove a broad public SELECT policy that could expose newly added machines.
drop policy if exists "Policy to implement Time To Live (TTL)" on public.machines;

-- Keep all existing role/permission policies and additionally require
-- an ACTIVE recognized profile for every browser-facing table operation.
do $hardening$
declare t record;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r','p')
      and c.relrowsecurity is true
  loop
    execute format('drop policy if exists %I on public.%I',
      'active_fleet_account_required', t.relname);
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated
       using ((select public.is_active_fleet_user()))
       with check ((select public.is_active_fleet_user()))',
      'active_fleet_account_required',t.relname
    );
  end loop;
end;
$hardening$;

-- Existing private storage buckets stay private. A valid password alone
-- cannot access the files unless it belongs to an approved active account.
drop policy if exists "active_fleet_account_required" on storage.objects;
create policy "active_fleet_account_required"
on storage.objects
as restrictive for all to authenticated
using (
  bucket_id not in ('fleet-evidence','fleet-media')
  or (select public.is_active_fleet_user())
)
with check (
  bucket_id not in ('fleet-evidence','fleet-media')
  or (select public.is_active_fleet_user())
);

-- Anonymous visitors do not need Data API table or sequence privileges.
-- Signed-in employees retain all existing permissions/role checks.
revoke all privileges on all tables in schema public from anon;
revoke all privileges on all sequences in schema public from anon;

-- Remove anonymous EXECUTE access, including inherited PUBLIC grants,
-- without reducing any current authenticated/service-role function rights.
do $routines$
declare p record;
begin
  for p in
    select oid::regprocedure::text as signature,
           has_function_privilege('authenticated',oid,'EXECUTE') as allowed_staff,
           has_function_privilege('service_role',oid,'EXECUTE') as allowed_service
    from pg_proc
    where pronamespace='public'::regnamespace and prokind='f'
  loop
    execute format('revoke execute on function %s from public, anon',p.signature);
    if p.allowed_staff then
      execute format('grant execute on function %s to authenticated',p.signature);
    end if;
    if p.allowed_service then
      execute format('grant execute on function %s to service_role',p.signature);
    end if;
  end loop;
end;
$routines$;

-- Supabase Auth still needs to invoke its user-created trigger.
grant execute on function public.handle_new_user() to supabase_auth_admin;

-- Keep future database additions private by default for the anon role.
alter default privileges for role postgres in schema public
  revoke all on tables from anon;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon;
alter default privileges for role postgres in schema public
  revoke execute on functions from anon;
alter default privileges for role supabase_admin in schema public
  revoke all on tables from anon;
alter default privileges for role supabase_admin in schema public
  revoke all on sequences from anon;
alter default privileges for role supabase_admin in schema public
  revoke execute on functions from anon;

notify pgrst, 'reload schema';
