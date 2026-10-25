-- Additive, isolated production clocks. Does not write to machines.hours.
create table if not exists public.machine_production_clocks (
  machine_id uuid primary key references public.machines(id) on delete cascade,
  accumulated_seconds numeric not null default 0 check (accumulated_seconds >= 0),
  running_since timestamptz
);
alter table public.machine_production_clocks enable row level security;
drop policy if exists "Active staff can view production clocks" on public.machine_production_clocks;
create policy "Active staff can view production clocks"
  on public.machine_production_clocks for select to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.active is true
  ));
revoke all on table public.machine_production_clocks from anon, authenticated;
grant select on public.machine_production_clocks to authenticated;

-- Starting point is installation time; historical production is not inferred.
insert into public.machine_production_clocks(machine_id, accumulated_seconds, running_since)
select id, 0, case when active and status::text = 'working'
  then statement_timestamp() else null end
from public.machines
on conflict (machine_id) do nothing;

-- Trigger writes stay in the same transaction as existing machine-status workflows.
-- The function is trigger-only; public API roles have no execute permission.
create or replace function public.track_machine_production_time()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare t timestamptz := statement_timestamp();
begin
  if tg_op = 'INSERT' then
    insert into public.machine_production_clocks(machine_id, accumulated_seconds, running_since)
    values (new.id, 0, case when new.active and new.status::text = 'working' then t else null end)
    on conflict (machine_id) do nothing;
  elsif old.status is distinct from new.status or old.active is distinct from new.active then
    insert into public.machine_production_clocks(machine_id, accumulated_seconds, running_since)
    values (new.id, 0, case when new.active and new.status::text = 'working' then t else null end)
    on conflict (machine_id) do update set
      accumulated_seconds = public.machine_production_clocks.accumulated_seconds
        + case when public.machine_production_clocks.running_since is not null
            then greatest(0, extract(epoch from
              (t - public.machine_production_clocks.running_since)))
            else 0 end,
      running_since = case when new.active and new.status::text = 'working'
        then t else null end;
  end if;
  return new;
end;
$$;
revoke all on function public.track_machine_production_time() from public, anon, authenticated;
drop trigger if exists machines_track_production_time on public.machines;
create trigger machines_track_production_time
after insert or update of status, active on public.machines
for each row execute function public.track_machine_production_time();
