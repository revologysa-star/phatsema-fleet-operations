-- Allow explicit, audited machine hour-meter corrections by the Head of Operations.
-- The existing increase-only RPCs and the separate live production clock are unchanged.
-- This migration does not modify any machine values, service records, or clock totals.

create or replace function public.sync_machine_hours_before_write()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
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
        and p.role::text = 'head_of_operations'
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

create or replace function public.correct_machine_hours(
  p_machine_id uuid,
  p_new_hours numeric,
  p_expected_hours numeric,
  p_reason text
)
returns public.machines
language plpgsql
security definer
set search_path = ''
as $function$
declare
  previous public.machines%rowtype;
  corrected public.machines%rowtype;
  explanation text;
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.active is true
      and p.role::text = 'head_of_operations'
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

revoke all on function public.correct_machine_hours(uuid,numeric,numeric,text)
from public, anon, authenticated;
grant execute on function public.correct_machine_hours(uuid,numeric,numeric,text)
to authenticated;
