-- Phatsema Fleet Operations - production database
-- Run in Supabase SQL Editor on the Phatsema project.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  username text not null unique,
  email text not null unique,
  role text not null default 'assistant_mechanic' check (role in ('assistant_mechanic','foreman','operations_manager','head_of_operations')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.machines (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  fleet_id text not null unique,
  model text not null default '',
  site text not null default '',
  hours numeric not null default 0 check (hours >= 0),
  status text not null default 'working' check (status in ('working','available','breakdown','maintenance','offline')),
  service_interval_hours numeric not null default 500 check (service_interval_hours > 0),
  service_warning_hours numeric not null default 50 check (service_warning_hours >= 0),
  last_confirmed_at timestamptz,
  active boolean not null default true,
  removed_at timestamptz,
  removed_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.breakdowns (
  id uuid primary key default gen_random_uuid(),
  machine_id uuid not null references public.machines(id) on delete restrict,
  reason text not null,
  notes text not null default '',
  reported_by uuid not null references public.profiles(id) on delete restrict,
  assigned_to uuid references public.profiles(id) on delete set null,
  started_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  machine_id uuid not null references public.machines(id) on delete restrict,
  work_completed text not null,
  hour_reading numeric not null check (hour_reading >= 0),
  notes text not null default '',
  recorded_by uuid not null references public.profiles(id) on delete restrict,
  service_date timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.service_photos (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  storage_path text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.breakdown_photos (
  id uuid primary key default gen_random_uuid(),
  breakdown_id uuid not null references public.breakdowns(id) on delete cascade,
  storage_path text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_breakdowns_machine_open on public.breakdowns(machine_id) where resolved_at is null;
create index if not exists idx_breakdowns_started on public.breakdowns(started_at desc);
create index if not exists idx_services_machine_date on public.services(machine_id, service_date desc);
create index if not exists idx_audit_created on public.audit_log(created_at desc);

insert into public.app_settings(key,value) values
('service_interval_hours','500'::jsonb),
('service_warning_hours','50'::jsonb),
('fleet_confirmation_hours','12'::jsonb),
('photo_evidence_required','false'::jsonb),
('whatsapp_alert_number','""'::jsonb),
('whatsapp_alerts_enabled','true'::jsonb)
on conflict(key) do nothing;

create or replace function public.is_manager()
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.profiles p where p.id=auth.uid() and p.active and p.role in ('foreman','operations_manager','head_of_operations')); $$;

create or replace function public.is_head()
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.profiles p where p.id=auth.uid() and p.active and p.role='head_of_operations'); $$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end; $$;

drop trigger if exists machines_touch on public.machines;
create trigger machines_touch before update on public.machines for each row execute function public.touch_updated_at();
drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();

create or replace function public.create_machine(p_name text,p_fleet_id text,p_model text,p_site text,p_hours numeric,p_status text,p_service_interval_hours numeric,p_service_warning_hours numeric)
returns public.machines language plpgsql security invoker set search_path=public as $$
declare r public.machines;
begin
 if not public.is_manager() then raise exception 'Management permission required'; end if;
 insert into public.machines(name,fleet_id,model,site,hours,status,service_interval_hours,service_warning_hours,last_confirmed_at)
 values(trim(p_name),trim(p_fleet_id),coalesce(p_model,''),coalesce(p_site,''),greatest(p_hours,0),p_status,p_service_interval_hours,p_service_warning_hours,now()) returning * into r;
 insert into public.audit_log(actor_id,action,entity_type,entity_id,details) values(auth.uid(),'create_machine','machine',r.id,jsonb_build_object('fleet_id',r.fleet_id));
 return r;
end; $$;

create or replace function public.update_machine(p_machine_id uuid,p_name text,p_fleet_id text,p_model text,p_site text,p_hours numeric,p_status text,p_service_interval_hours numeric,p_service_warning_hours numeric)
returns public.machines language plpgsql security invoker set search_path=public as $$
declare r public.machines; old public.machines;
begin
 if not public.is_manager() then raise exception 'Management permission required'; end if;
 select * into old from public.machines where id=p_machine_id for update;
 if not found then raise exception 'Machine not found'; end if;
 if p_hours < old.hours then raise exception 'Machine hours cannot be reduced'; end if;
 update public.machines set name=trim(p_name),fleet_id=trim(p_fleet_id),model=coalesce(p_model,''),site=coalesce(p_site,''),hours=p_hours,status=p_status,service_interval_hours=p_service_interval_hours,service_warning_hours=p_service_warning_hours,last_confirmed_at=now() where id=p_machine_id returning * into r;
 insert into public.audit_log(actor_id,action,entity_type,entity_id,details) values(auth.uid(),'update_machine','machine',r.id,jsonb_build_object('before_status',old.status,'after_status',r.status,'before_hours',old.hours,'after_hours',r.hours));
 return r;
end; $$;

create or replace function public.set_machine_online(p_machine_id uuid)
returns public.machines language plpgsql security invoker set search_path=public as $$
declare r public.machines;
begin
 if not public.is_manager() then raise exception 'Management permission required'; end if;
 update public.machines set status='working',last_confirmed_at=now() where id=p_machine_id returning * into r;
 if not found then raise exception 'Machine not found'; end if;
 update public.breakdowns set resolved_at=coalesce(resolved_at,now()) where machine_id=p_machine_id and resolved_at is null;
 insert into public.audit_log(actor_id,action,entity_type,entity_id,details) values(auth.uid(),'set_machine_online','machine',r.id,jsonb_build_object('status','working'));
 return r;
end; $$;

create or replace function public.retire_machine(p_machine_id uuid)
returns public.machines language plpgsql security invoker set search_path=public as $$
declare r public.machines;
begin
 if not public.is_manager() then raise exception 'Management permission required'; end if;
 update public.machines set active=false,removed_at=now(),removed_reason='Retired by management' where id=p_machine_id returning * into r;
 if not found then raise exception 'Machine not found'; end if;
 insert into public.audit_log(actor_id,action,entity_type,entity_id,details) values(auth.uid(),'retire_machine','machine',r.id,'{}');
 return r;
end; $$;

create or replace function public.report_breakdown(p_machine_id uuid,p_reason text,p_notes text default '')
returns uuid language plpgsql security invoker set search_path=public as $$
declare bid uuid;
begin
 if not exists(select 1 from public.profiles where id=auth.uid() and active) then raise exception 'Active user required'; end if;
 if not exists(select 1 from public.machines where id=p_machine_id and active) then raise exception 'Active machine not found'; end if;
 insert into public.breakdowns(machine_id,reason,notes,reported_by) values(p_machine_id,trim(p_reason),coalesce(p_notes,''),auth.uid()) returning id into bid;
 update public.machines set status='breakdown',last_confirmed_at=now() where id=p_machine_id;
 insert into public.audit_log(actor_id,action,entity_type,entity_id,details) values(auth.uid(),'report_breakdown','breakdown',bid,jsonb_build_object('machine_id',p_machine_id,'reason',trim(p_reason)));
 return bid;
end; $$;

create or replace function public.resolve_breakdown(p_breakdown_id uuid)
returns public.breakdowns language plpgsql security invoker set search_path=public as $$
declare b public.breakdowns;
r public.breakdowns;
begin
 if not public.is_manager() then raise exception 'Management permission required'; end if;
 select * into b from public.breakdowns where id=p_breakdown_id for update;
 if not found then raise exception 'Breakdown not found'; end if;
 if b.resolved_at is null then update public.breakdowns set resolved_at=now() where id=p_breakdown_id returning * into r; else r:=b; end if;
 update public.machines set status='working',last_confirmed_at=coalesce(r.resolved_at,now()) where id=b.machine_id;
 insert into public.audit_log(actor_id,action,entity_type,entity_id,details) values(auth.uid(),'resolve_breakdown','breakdown',r.id,jsonb_build_object('machine_id',b.machine_id,'status','working'));
 return r;
end; $$;

create or replace function public.log_service(p_machine_id uuid,p_work_completed text,p_hour_reading numeric,p_notes text default '')
returns public.services language plpgsql security invoker set search_path=public as $$
declare m public.machines; s public.services;
begin
 if not exists(select 1 from public.profiles where id=auth.uid() and active) then raise exception 'Active user required'; end if;
 select * into m from public.machines where id=p_machine_id and active for update;
 if not found then raise exception 'Active machine not found'; end if;
 if p_hour_reading < m.hours then raise exception 'Hour reading cannot be lower than current machine hours'; end if;
 insert into public.services(machine_id,work_completed,hour_reading,notes,recorded_by) values(p_machine_id,trim(p_work_completed),p_hour_reading,coalesce(p_notes,''),auth.uid()) returning * into s;
 update public.machines set hours=p_hour_reading,status=case when status='breakdown' then 'working' else status end,last_confirmed_at=now() where id=p_machine_id;
 insert into public.audit_log(actor_id,action,entity_type,entity_id,details) values(auth.uid(),'log_service','service',s.id,jsonb_build_object('machine_id',p_machine_id,'hours',p_hour_reading,'work',trim(p_work_completed)));
 return s;
end; $$;

-- RLS
alter table public.profiles enable row level security;
alter table public.machines enable row level security;
alter table public.breakdowns enable row level security;
alter table public.services enable row level security;
alter table public.service_photos enable row level security;
alter table public.breakdown_photos enable row level security;
alter table public.app_settings enable row level security;
alter table public.audit_log enable row level security;

drop policy if exists profiles_self_or_manager_select on public.profiles;
create policy profiles_self_or_manager_select on public.profiles for select to authenticated using (id=auth.uid() or public.is_manager());
drop policy if exists profiles_manager_update on public.profiles;
create policy profiles_manager_update on public.profiles for update to authenticated using (public.is_manager()) with check (public.is_manager());

drop policy if exists machines_active_read on public.machines;
create policy machines_active_read on public.machines for select to authenticated using (active=true or public.is_manager());

drop policy if exists breakdowns_read on public.breakdowns;
create policy breakdowns_read on public.breakdowns for select to authenticated using (true);
drop policy if exists services_read on public.services;
create policy services_read on public.services for select to authenticated using (true);
drop policy if exists service_photos_read on public.service_photos;
create policy service_photos_read on public.service_photos for select to authenticated using (true);
drop policy if exists breakdown_photos_read on public.breakdown_photos;
create policy breakdown_photos_read on public.breakdown_photos for select to authenticated using (true);
drop policy if exists settings_manager_all on public.app_settings;
create policy settings_manager_all on public.app_settings for all to authenticated using (public.is_manager()) with check (public.is_manager());
drop policy if exists audit_manager_read on public.audit_log;
create policy audit_manager_read on public.audit_log for select to authenticated using (public.is_manager());

grants execute on function public.create_machine(text,text,text,text,numeric,text,numeric,numeric) to authenticated;
grants execute on function public.update_machine(uuid,text,text,text,text,numeric,text,numeric,numeric) to authenticated;
grants execute on function public.set_machine_online(uuid) to authenticated;
grants execute on function public.retire_machine(uuid) to authenticated;
grants execute on function public.report_breakdown(uuid,text,text) to authenticated;
grants execute on function public.resolve_breakdown(uuid) to authenticated;
grants execute on function public.log_service(uuid,text,numeric,text) to authenticated;

grant select on public.profiles,public.machines,public.breakdowns,public.services,public.service_photos,public.breakdown_photos to authenticated;
grant select,insert,update on public.app_settings to authenticated;
grant select on public.audit_log to authenticated;

-- Storage bucket
insert into storage.buckets(id,name,public) values('fleet-evidence','fleet-evidence',false) on conflict(id) do nothing;
drop policy if exists fleet_evidence_read on storage.objects;
create policy fleet_evidence_read on storage.objects for select to authenticated using (bucket_id='fleet-evidence');
drop policy if exists fleet_evidence_insert on storage.objects;
create policy fleet_evidence_insert on storage.objects for insert to authenticated with check (bucket_id='fleet-evidence');

-- New users need a profile. The admin-user-management Edge Function creates both auth user and profile.

drop policy if exists service_photos_insert on public.service_photos;
create policy service_photos_insert on public.service_photos for insert to authenticated with check (exists(select 1 from public.services s where s.id=service_id and s.recorded_by=auth.uid()));
drop policy if exists breakdown_photos_insert on public.breakdown_photos;
create policy breakdown_photos_insert on public.breakdown_photos for insert to authenticated with check (exists(select 1 from public.breakdowns b where b.id=breakdown_id and b.reported_by=auth.uid()));
drop policy if exists audit_insert_self on public.audit_log;
create policy audit_insert_self on public.audit_log for insert to authenticated with check (actor_id=auth.uid());
