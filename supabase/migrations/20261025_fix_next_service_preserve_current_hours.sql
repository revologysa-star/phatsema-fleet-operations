-- Correct schedule-only machine updates so they never change the stored engine-meter reading.
-- Live production time is stored separately in machine_production_clocks and is unaffected.
-- Keep all other machine-hours behavior and trigger ownership/privileges unchanged.
create or replace function public.sync_machine_hours_before_write()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare elapsed numeric;
begin
  if tg_op = 'UPDATE' then
    -- Ignore service schedule fields and the automatic updated_at timestamp.
    -- When nothing else is changing, preserve the actual meter reading and
    -- its reference timestamp. Also covers repeated saves of identical values.
    if (to_jsonb(new) - array['next_service_hours', 'next_service_date', 'updated_at'])
       = (to_jsonb(old) - array['next_service_hours', 'next_service_date', 'updated_at']) then
      new.hours := old.hours;
      new.last_hours_at := old.last_hours_at;
      return new;
    end if;
  end if;

  -- Preserve the existing machine-hour rules for all other updates.
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
end; $function$;
