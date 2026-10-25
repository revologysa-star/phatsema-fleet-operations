-- Scoped temporary delegation without granting full access or changing roles.
create table if not exists public.temporary_access_grants (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id),
 permission text not null check (permission in ('manage_fleet','next_service','correct_hours')),
 granted_by uuid not null references public.profiles(id),
 granted_at timestamptz not null default statement_timestamp(),
 expires_at timestamptz not null,
 revoked_at timestamptz,
 revoked_by uuid references public.profiles(id),
 reason text not null check (char_length(reason) between 5 and 500),
 constraint temporary_grant_expiry check (expires_at > granted_at)
);
create index if not exists temporary_access_user_lookup
 on public.temporary_access_grants(user_id, permission, expires_at)
 where revoked_at is null;
alter table public.temporary_access_grants enable row level security;
revoke all on table public.temporary_access_grants from public, anon, authenticated;
grant select on table public.temporary_access_grants to authenticated;
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

create or replace function public.has_temporary_permission(p_permission text)
returns boolean language sql stable security definer set search_path = ''
as $$
 select exists (
   select 1
   from public.temporary_access_grants g
   join public.profiles p on p.id=g.user_id
   where g.user_id=(select auth.uid())
     and p.active is true
     and g.permission=p_permission
     and g.revoked_at is null
     and g.expires_at>statement_timestamp()
 );
$$;
revoke all on function public.has_temporary_permission(text) from public, anon, authenticated;
grant execute on function public.has_temporary_permission(text) to authenticated;

create or replace function public.grant_temporary_access(
 p_user_id uuid, p_permissions text[], p_duration_hours int, p_reason text
)
returns setof public.temporary_access_grants
language plpgsql security definer set search_path=''
as $$
declare
 recipient public.profiles%rowtype;
 scope text;
 scopes text[];
 new_grant public.temporary_access_grants%rowtype;
 explanation text := btrim(coalesce(p_reason,''));
begin
 if not public.is_head_of_operations() then
   raise exception 'Only the Head of Operations can grant temporary access';
 end if;
 select * into recipient from public.profiles
 where id=p_user_id and active is true for share;
 if not found then raise exception 'Select an active employee'; end if;
 if recipient.id=auth.uid() or recipient.role::text='head_of_operations' then
   raise exception 'Cannot delegate access to the Head of Operations';
 end if;
 if p_duration_hours is null or p_duration_hours not in (1,4,8,24,72,168) then
   raise exception 'Choose a valid access duration';
 end if;
 if char_length(explanation) not between 5 and 500 then
   raise exception 'Explain why temporary access is needed (5–500 characters)';
 end if;
 select array_agg(distinct v) into scopes from unnest(p_permissions) v;
 if coalesce(array_length(scopes,1),0) not between 1 and 3 then
   raise exception 'Choose at least one permission';
 end if;
 if exists (select 1 from unnest(scopes) s where s is null or s not in ('manage_fleet','next_service','correct_hours')) then
   raise exception 'Unsupported permission requested';
 end if;
 foreach scope in array scopes loop
   update public.temporary_access_grants
   set revoked_at=statement_timestamp(),revoked_by=auth.uid()
   where user_id=p_user_id and permission=scope and revoked_at is null;
   insert into public.temporary_access_grants
     (user_id,permission,granted_by,expires_at,reason)
   values
     (p_user_id,scope,auth.uid(),statement_timestamp()+make_interval(hours=>p_duration_hours),explanation)
   returning * into new_grant;
   insert into public.audit_log(actor_id,action,entity_type,entity_id,details)
   values(auth.uid(),'temporary_access_granted','profile',p_user_id,
     jsonb_build_object('grant_id',new_grant.id,'permission',scope,
       'expires_at',new_grant.expires_at,'reason',explanation,'recipient',recipient.username));
   return next new_grant;
 end loop;
end;
$$;
revoke all on function public.grant_temporary_access(uuid,text[],int,text)
 from public, anon, authenticated;
grant execute on function public.grant_temporary_access(uuid,text[],int,text)
 to authenticated;

create or replace function public.revoke_temporary_access(p_grant_id uuid)
returns boolean
language plpgsql security definer set search_path=''
as $$
declare entry public.temporary_access_grants%rowtype;
begin
 if not public.is_head_of_operations() then
   raise exception 'Only the Head of Operations can revoke temporary access';
 end if;
 update public.temporary_access_grants
 set revoked_at=statement_timestamp(),revoked_by=auth.uid()
 where id=p_grant_id and revoked_at is null
 returning * into entry;
 if not found then return false; end if;
 insert into public.audit_log(actor_id,action,entity_type,entity_id,details)
 values(auth.uid(),'temporary_access_revoked','profile',entry.user_id,
   jsonb_build_object('grant_id',entry.id,'permission',entry.permission,
     'expires_at',entry.expires_at));
 return true;
end;
$$;
revoke all on function public.revoke_temporary_access(uuid)
 from public, anon, authenticated;
grant execute on function public.revoke_temporary_access(uuid)
 to authenticated;

-- Add the exact named privilege to existing role checks, not broad management.
CREATE OR REPLACE FUNCTION public.set_machine_next_service(p_machine_id uuid, p_next_service_hours numeric DEFAULT NULL::numeric, p_next_service_date date DEFAULT NULL::date)
 RETURNS machines
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r public.machines;
begin
  if not (public.is_head_of_operations() or public.has_temporary_permission('next_service')) then
    raise exception 'Head of Operations permission required';
  end if;

  if p_next_service_hours is null and p_next_service_date is null then
    raise exception 'Set a next service hour reading or service date';
  end if;

  if p_next_service_hours is not null and p_next_service_hours < 0 then
    raise exception 'Next service hours cannot be negative';
  end if;

  update public.machines
  set next_service_hours = p_next_service_hours,
      next_service_date = p_next_service_date,
      updated_at = now()
  where id = p_machine_id and active
  returning * into r;

  if not found then
    raise exception 'Active machine not found';
  end if;

  insert into public.audit_log(actor_id,action,entity_type,entity_id,details)
  values(
    auth.uid(),
    'machine_next_service_set',
    'machine',
    r.id,
    jsonb_build_object(
      'next_service_hours',r.next_service_hours,
      'next_service_date',r.next_service_date
    )
  );

  return r;
end;
$function$;


CREATE OR REPLACE FUNCTION public.correct_machine_hours(p_machine_id uuid, p_new_hours numeric, p_expected_hours numeric, p_reason text)
 RETURNS machines
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  previous public.machines%rowtype;
  corrected public.machines%rowtype;
  explanation text;
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.active is true
      and (p.role::text = 'head_of_operations' or public.has_temporary_permission('correct_hours'))
  ) then
    raise exception 'Only the Head of Operations can correct machine hours';
  end if;

  if p_machine_id is null
     or p_new_hours is null
     or p_new_hours::text in ('NaN','Infinity','-Infinity')
     or p_new_hours < 0 then
    raise exception 'Enter a valid non-negative hour reading';
  end if;

  explanation := pg_catalog.btrim(coalesce(p_reason,''));
  if length(explanation) < 5 or length(explanation) > 500 then
    raise exception 'Provide a correction reason between 5 and 500 characters';
  end if;

  select * into previous
  from public.machines
  where id = p_machine_id and active is true
  for update;
  if not found then
    raise exception 'Active machine not found';
  end if;

  if p_expected_hours is null or previous.hours is distinct from p_expected_hours then
    raise exception 'Machine hours changed since you opened this form. Refresh and try again';
  end if;

  if previous.hours is not distinct from p_new_hours then
    raise exception 'Enter a different hour reading';
  end if;

  -- This local flag is checked in the BEFORE UPDATE trigger and cannot be
  -- used to correct another machine in the same transaction.
  perform pg_catalog.set_config(
    'phatsema.correcting_machine_hours_for',p_machine_id::text,true
  );
  update public.machines
  set hours = p_new_hours, updated_at = now()
  where id = p_machine_id and active is true
  returning * into corrected;
  perform pg_catalog.set_config('phatsema.correcting_machine_hours_for','',true);

  if corrected.id is null or corrected.hours is distinct from p_new_hours then
    raise exception 'Could not save the exact hour reading';
  end if;

  insert into public.audit_log(actor_id,action,entity_type,entity_id,details)
  values(
    auth.uid(),'machine_hours_corrected','machine',p_machine_id,
    pg_catalog.jsonb_build_object(
      'before_hours',previous.hours,
      'after_hours',corrected.hours,
      'reason',explanation,
      'direction',case when corrected.hours < previous.hours then 'decrease' else 'increase' end
    )
  );
  return corrected;
end;
$function$;


CREATE OR REPLACE FUNCTION public.sync_machine_hours_before_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare elapsed numeric;
begin
  -- Allow the head-only correction RPC to set the EXACT requested hour reading,
  -- including a lower number. The flag is scoped to the current transaction and
  -- the one machine being corrected. All other write paths keep their old rules.
  if tg_op = 'UPDATE'
     and pg_catalog.current_setting('phatsema.correcting_machine_hours_for', true) = old.id::text then
    if not exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.active is true
        and (p.role::text = 'head_of_operations' or public.has_temporary_permission('correct_hours'))
    ) then
      raise exception 'Head of Operations permission required';
    end if;
    if (to_jsonb(new) - array['hours', 'last_hours_at', 'updated_at'])
       is distinct from
       (to_jsonb(old) - array['hours', 'last_hours_at', 'updated_at']) then
      raise exception 'Hour correction may not change other machine fields';
    end if;
    if new.hours is null or new.hours::text in ('NaN','Infinity','-Infinity') or new.hours < 0 then
      raise exception 'Enter a valid non-negative hour reading';
    end if;
    new.last_hours_at := now();
    return new;
  end if;

  -- Existing schedule-only protection: Next Service changes never alter hours.
  if tg_op = 'UPDATE' then
    if (to_jsonb(new) - array['next_service_hours', 'next_service_date', 'updated_at'])
       = (to_jsonb(old) - array['next_service_hours', 'next_service_date', 'updated_at']) then
      new.hours := old.hours;
      new.last_hours_at := old.last_hours_at;
      return new;
    end if;
  end if;

  -- Existing behavior for ordinary machine changes stays intact.
  if tg_op='UPDATE' and old.status='working' and old.last_hours_at is not null then
    elapsed := greatest(0, extract(epoch from (now()-old.last_hours_at))/3600.0);
    if elapsed > 0 then new.hours := coalesce(old.hours,0) + elapsed; end if;
  elsif tg_op='UPDATE' and old.status<>'working' then
    new.hours := coalesce(new.hours,old.hours,0);
  end if;
  if tg_op='INSERT' then new.last_hours_at := coalesce(new.last_hours_at,now());
  elsif new.status is distinct from old.status then new.last_hours_at := now();
  else new.last_hours_at := coalesce(new.last_hours_at,old.last_hours_at,now()); end if;
  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION public.create_machine(p_name text, p_fleet_id text, p_model text, p_site text, p_hours numeric, p_status text, p_service_interval_hours numeric, p_service_warning_hours numeric)
 RETURNS machines
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r public.machines;
begin
 if not (public.is_manager() or public.has_temporary_permission('manage_fleet')) then raise exception 'Management permission required'; end if;
 if p_status not in ('working','available','breakdown','maintenance','offline') then raise exception 'Invalid machine status'; end if;
 insert into public.machines(name,fleet_id,model,site,hours,status,service_interval_hours,service_warning_hours,active,last_confirmed_at,last_hours_at)
 values(trim(p_name),trim(p_fleet_id),coalesce(p_model,''),coalesce(p_site,''),coalesce(p_hours,0),p_status::public.machine_status,coalesce(p_service_interval_hours,500),coalesce(p_service_warning_hours,50),true,now(),now()) returning * into r;
 insert into public.audit_log(actor_id,action,entity_type,entity_id,details) values(auth.uid(),'create_machine','machine',r.id,jsonb_build_object('fleet_id',r.fleet_id,'status',r.status));
 return r;
end; $function$;


CREATE OR REPLACE FUNCTION public.update_machine(p_machine_id uuid, p_name text, p_fleet_id text, p_model text, p_site text, p_hours numeric, p_status text, p_service_interval_hours numeric, p_service_warning_hours numeric)
 RETURNS machines
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r public.machines; old public.machines;
begin
 if not (public.is_manager() or public.has_temporary_permission('manage_fleet')) then raise exception 'Management permission required'; end if;
 if p_status not in ('working','available','breakdown','maintenance','offline') then raise exception 'Invalid machine status'; end if;
 select * into old from public.machines where id=p_machine_id for update;
 if not found then raise exception 'Machine not found'; end if;
 if coalesce(p_hours,0)<old.hours then raise exception 'Machine hours cannot be reduced'; end if;
 update public.machines set name=trim(p_name),fleet_id=trim(p_fleet_id),model=coalesce(p_model,''),site=coalesce(p_site,''),hours=coalesce(p_hours,old.hours),status=p_status::public.machine_status,service_interval_hours=coalesce(p_service_interval_hours,old.service_interval_hours),service_warning_hours=coalesce(p_service_warning_hours,old.service_warning_hours),last_confirmed_at=now() where id=p_machine_id returning * into r;
 insert into public.audit_log(actor_id,action,entity_type,entity_id,details) values(auth.uid(),'update_machine','machine',r.id,jsonb_build_object('before_status',old.status,'after_status',r.status,'before_hours',old.hours,'after_hours',r.hours));
 return r;
end; $function$;


CREATE OR REPLACE FUNCTION public.retire_machine(p_machine_id uuid)
 RETURNS machines
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r public.machines;
begin
 if not (public.is_manager() or public.has_temporary_permission('manage_fleet')) then raise exception 'Management permission required'; end if;
 update public.machines set active=false,removed_at=now(),removed_reason='Retired by management' where id=p_machine_id and active=true returning * into r;
 if not found then raise exception 'Active machine not found'; end if;
 insert into public.audit_log(actor_id,action,entity_type,entity_id,details) values(auth.uid(),'retire_machine','machine',r.id,'{}');
 return r;
end; $function$;

CREATE OR REPLACE FUNCTION public.set_machine_status(p_machine_id uuid, p_status text, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r text;
  old_status text;
begin
  select role::text into r from public.profiles where id=auth.uid() and active=true;
  if r is null then raise exception 'Not authenticated'; end if;
  if p_status not in ('working','available','breakdown','maintenance','offline') then
    raise exception 'Invalid machine status';
  end if;
  if r not in ('assistant_mechanic','foreman','operations_manager','head_of_operations') and not public.has_temporary_permission('manage_fleet') then
    raise exception 'Permission denied';
  end if;

  select status::text into old_status
  from public.machines
  where id=p_machine_id and active=true
  for update;

  if old_status is null then raise exception 'Machine not found'; end if;

  update public.machines
     set status=p_status::machine_status,
         last_confirmed_at=now(),
         breakdown_started_at=case
           when p_status='breakdown' then coalesce(breakdown_started_at,now())
           else null
         end,
         updated_at=now()
   where id=p_machine_id;

  if p_status='working' and old_status='breakdown' then
    update public.breakdowns
       set resolved_at=coalesce(resolved_at,now()),
           downtime_minutes=greatest(0,floor(extract(epoch from (coalesce(resolved_at,now())-started_at))/60))::int,
           repair_completed_at=coalesce(repair_completed_at,now()),
           repair_completed_by=coalesce(repair_completed_by,auth.uid()),
           repair_notes=coalesce(repair_notes,p_reason)
     where machine_id=p_machine_id and resolved_at is null;
  end if;

  insert into public.audit_log(actor_id,action,entity_type,entity_id,details)
  values(auth.uid(),'machine_status_changed','machine',p_machine_id,
         jsonb_build_object('from',old_status,'to',p_status,'reason',p_reason));
end;
$function$;

notify pgrst, 'reload schema';
