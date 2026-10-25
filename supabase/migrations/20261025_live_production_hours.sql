-- Additive timer: machine.hours remains the actual meter reading.
alter table public.machines add column if not exists production_seconds numeric not null default 0;
alter table public.machines add column if not exists production_started_at timestamptz;
create or replace function public.machine_production_clock_transition()
returns trigger language plpgsql set search_path = public as $$
declare t timestamptz := statement_timestamp();
begin
 if tg_op = 'INSERT' then
  new.production_seconds := 0;
  new.production_started_at := case when new.active and new.status::text = 'working' then t else null end;
 elsif old.status is distinct from new.status or old.active is distinct from new.active then
  new.production_seconds := coalesce(old.production_seconds,0)
   + case when old.production_started_at is not null
       then greatest(0,extract(epoch from (t-old.production_started_at))) else 0 end;
  new.production_started_at := case when new.active and new.status::text = 'working' then t else null end;
 else
  new.production_seconds := old.production_seconds;
  new.production_started_at := old.production_started_at;
 end if;
 return new;
end $$;
drop trigger if exists machines_production_clock_transition on public.machines;
create trigger machines_production_clock_transition
before insert or update on public.machines
for each row execute function public.machine_production_clock_transition();
-- Start at deployment; no retroactive hours are assumed.
update public.machines set production_started_at = statement_timestamp()
where active and status::text = 'working' and production_started_at is null;
