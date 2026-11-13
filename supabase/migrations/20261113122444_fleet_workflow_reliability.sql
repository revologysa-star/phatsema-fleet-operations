-- Settings can be saved in one upsert by the same managers who see the form.
create policy fleet_settings_insert on public.app_settings
  for insert to authenticated
  with check (
    key in ('service_interval_hours','service_warning_hours','whatsapp_alert_number','whatsapp_alerts_enabled')
    and (select public.can_manage()) and updated_by = (select auth.uid())
  );
create policy fleet_settings_update on public.app_settings
  for update to authenticated
  using (key in ('service_interval_hours','service_warning_hours','whatsapp_alert_number','whatsapp_alerts_enabled') and (select public.can_manage()))
  with check (
    key in ('service_interval_hours','service_warning_hours','whatsapp_alert_number','whatsapp_alerts_enabled')
    and (select public.can_manage()) and updated_by = (select auth.uid())
  );

create policy fleet_settings_recipient_read on public.app_settings
  as restrictive for select to authenticated
  using (key <> 'whatsapp_alert_number' or (select public.can_manage()));

-- The configured fleet warning overrides the per-machine default when present.
create or replace function public.get_whatsapp_service_alert_candidates()
returns table (
  machine_id uuid, machine_name text, fleet_id text, current_hours numeric,
  service_due_hours numeric, alert_at_hours numeric
)
language sql stable security definer set search_path = ''
as $function$
  select m.id, m.name, m.fleet_id, m.hours, m.next_service_hours, threshold.hours
  from public.machines m
  cross join lateral (
    select greatest(0, m.next_service_hours - coalesce(
      (select (value #>> '{}')::numeric from public.app_settings where key = 'service_warning_hours'),
      m.service_warning_hours, 50
    )) as hours
  ) threshold
  where m.active is true
    and m.next_service_hours is not null
    and m.hours >= threshold.hours
    and coalesce((select (value #>> '{}')::boolean from public.app_settings where key = 'whatsapp_alerts_enabled'), false)
  order by m.hours - m.next_service_hours desc, m.name;
$function$;

-- Start the first service interval when a machine joins the fleet.
create or replace function public.create_machine(
  p_name text, p_fleet_id text, p_model text, p_site text, p_hours numeric,
  p_status text, p_service_interval_hours numeric, p_service_warning_hours numeric
)
returns public.machines language plpgsql security definer set search_path = ''
as $function$
declare
  machine public.machines;
  reading numeric := round(coalesce(p_hours, 0), 1);
  interval_hours numeric := round(coalesce(p_service_interval_hours, 500), 1);
  warning_hours numeric := round(coalesce(p_service_warning_hours, 50), 1);
begin
  if not (public.can_manage() or public.has_temporary_permission('manage_fleet')) then
    raise exception 'Fleet management permission required';
  end if;
  if p_status is null or p_status not in ('working','available','breakdown','maintenance','offline') then
    raise exception 'Invalid machine status';
  end if;
  if nullif(btrim(p_name), '') is null or nullif(btrim(p_fleet_id), '') is null then
    raise exception 'Machine name and fleet ID are required';
  end if;
  if reading < 0 or interval_hours <= 0 or warning_hours < 0
     or reading::text in ('NaN','Infinity','-Infinity')
     or interval_hours::text in ('NaN','Infinity','-Infinity')
     or warning_hours::text in ('NaN','Infinity','-Infinity') then
    raise exception 'Enter valid hour readings and service settings';
  end if;
  insert into public.machines(name, fleet_id, model, site, hours, status, service_interval_hours,
    service_warning_hours, next_service_hours, active, last_confirmed_at, last_hours_at)
  values (btrim(p_name), btrim(p_fleet_id), coalesce(p_model, ''), coalesce(p_site, ''), reading,
    p_status::public.machine_status, interval_hours, warning_hours, reading + interval_hours, true, now(), now())
  returning * into machine;
  if p_status = 'breakdown' then
    perform public.report_breakdown(machine.id, 'Added in breakdown status', '', null);
    select m.* into machine from public.machines m where m.id = machine.id;
  end if;
  insert into public.audit_log(actor_id, action, entity_type, entity_id, details)
  values ((select auth.uid()), 'create_machine', 'machine', machine.id,
    jsonb_build_object('fleet_id', machine.fleet_id, 'status', machine.status));
  return machine;
end;
$function$;

-- The engine meter stores physical readings. The existing production-clock
-- trigger already records elapsed time when a machine starts or stops working.
create or replace function public.sync_machine_hours_before_write()
returns trigger language plpgsql set search_path = ''
as $function$
begin
  if tg_op = 'INSERT' then
    new.last_hours_at := coalesce(new.last_hours_at, now());
  elsif new.hours is distinct from old.hours then
    new.last_hours_at := now();
  else
    new.last_hours_at := old.last_hours_at;
  end if;
  return new;
end;
$function$;

-- Manager increases use an hours-only RPC, so a concurrent status change or
-- a retired machine cannot be overwritten by a stale hours form.
create function private.record_machine_hours(p_machine_id uuid, p_new_hours numeric, p_expected_hours numeric)
returns public.machines
language plpgsql security definer set search_path = ''
as $function$
declare
  previous public.machines;
  saved public.machines;
begin
  if not (public.can_manage() or public.has_temporary_permission('manage_fleet')) then
    raise exception 'Fleet management permission required';
  end if;
  if p_new_hours is null or p_new_hours::text in ('NaN','Infinity','-Infinity') or p_new_hours < 0 then
    raise exception 'Enter a valid non-negative hour reading';
  end if;
  select * into previous from public.machines where id = p_machine_id and active is true for update;
  if not found then raise exception 'Active machine not found'; end if;
  if previous.hours is distinct from p_expected_hours then
    raise exception 'Machine hours changed since you opened this form. Refresh and try again';
  end if;
  if round(p_new_hours, 1) <= previous.hours then
    raise exception 'Enter an hour reading higher than the current reading';
  end if;
  update public.machines set hours = round(p_new_hours, 1), last_confirmed_at = now()
  where id = p_machine_id returning * into saved;
  insert into public.audit_log(actor_id, action, entity_type, entity_id, details)
  values ((select auth.uid()), 'update_machine', 'machine', p_machine_id,
    jsonb_build_object('before_hours', previous.hours, 'after_hours', saved.hours));
  return saved;
end;
$function$;
revoke all on function private.record_machine_hours(uuid,numeric,numeric) from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.record_machine_hours(uuid,numeric,numeric) to authenticated;

create function public.record_machine_hours(p_machine_id uuid, p_new_hours numeric, p_expected_hours numeric)
returns public.machines
language sql security invoker set search_path = ''
as $function$
  select private.record_machine_hours(p_machine_id, p_new_hours, p_expected_hours);
$function$;
revoke all on function public.record_machine_hours(uuid,numeric,numeric) from public, anon, authenticated;
grant execute on function public.record_machine_hours(uuid,numeric,numeric) to authenticated;

-- A move into Breakdown creates its report. Moving out closes the report and
-- captures downtime even when the destination is Maintenance or Offline.
create or replace function public.set_machine_status(p_machine_id uuid, p_status text, p_reason text default null)
returns void language plpgsql security definer set search_path = ''
as $function$
declare
  old_status text;
  status_reason text := nullif(btrim(p_reason), '');
begin
  if not (public.can_manage() or public.has_temporary_permission('manage_fleet')) then
    raise exception 'Fleet management permission required';
  end if;
  if p_status is null or p_status not in ('working','available','breakdown','maintenance','offline') then
    raise exception 'Invalid machine status';
  end if;
  select status::text into old_status from public.machines where id = p_machine_id and active is true for update;
  if not found then raise exception 'Active machine not found'; end if;
  if old_status = p_status then return; end if;

  if p_status = 'breakdown' and not exists (
    select 1 from public.breakdowns where machine_id = p_machine_id and resolved_at is null
  ) then
    if status_reason is null then raise exception 'A breakdown reason is required'; end if;
    perform public.report_breakdown(p_machine_id, status_reason, '', null);
  else
    update public.machines
    set status = p_status::public.machine_status, last_confirmed_at = now()
    where id = p_machine_id;
  end if;

  if p_status <> 'breakdown' then
    update public.breakdowns
    set resolved_at = now(),
        repair_completed_at = case when p_status = 'working' then coalesce(repair_completed_at, now()) else repair_completed_at end,
        repair_completed_by = case when p_status = 'working' then coalesce(repair_completed_by, (select auth.uid())) else repair_completed_by end,
        repair_notes = coalesce(repair_notes, status_reason),
        not_ready_reason = case when p_status = 'working' then null else not_ready_reason end
    where machine_id = p_machine_id and resolved_at is null;
  end if;
  insert into public.audit_log(actor_id, action, entity_type, entity_id, details)
  values ((select auth.uid()), 'machine_status_changed', 'machine', p_machine_id,
    jsonb_build_object('from', old_status, 'to', p_status, 'reason', status_reason));
end;
$function$;

create or replace function public.retire_machine(p_machine_id uuid)
returns public.machines language plpgsql security definer set search_path = ''
as $function$
declare retired public.machines;
begin
  if not (public.can_manage() or public.has_temporary_permission('manage_fleet')) then
    raise exception 'Fleet management permission required';
  end if;
  select * into retired from public.machines where id = p_machine_id and active is true for update;
  if not found then raise exception 'Active machine not found'; end if;
  if exists (select 1 from public.breakdowns where machine_id = p_machine_id and resolved_at is null) then
    raise exception 'Resolve the open breakdown before removing this machine';
  end if;
  update public.machines set active = false, removed_at = now(), removed_reason = 'Retired by management'
  where id = p_machine_id returning * into retired;
  insert into public.audit_log(actor_id, action, entity_type, entity_id, details)
  values ((select auth.uid()), 'retire_machine', 'machine', p_machine_id, '{}');
  return retired;
end;
$function$;

-- Allow the recorder and management to retry missing service evidence.
-- Both evidence tables require the object's folder to match its parent record.
create policy service_photos_record_owner on public.service_photos
  as restrictive for insert to authenticated
  with check (
    split_part(storage_path, '/', 1) in ('service','services')
    and split_part(storage_path, '/', 2) = service_id::text
    and split_part(storage_path, '/', 3) <> ''
    and exists (select 1 from public.services s where s.id = service_id
      and (s.recorded_by = (select auth.uid()) or (select public.can_manage())))
  );
create policy breakdown_photos_parent_path on public.breakdown_photos
  as restrictive for insert to authenticated
  with check (
    split_part(storage_path, '/', 1) in ('breakdown','breakdowns')
    and split_part(storage_path, '/', 2) = breakdown_id::text
    and split_part(storage_path, '/', 3) <> ''
  );

-- An uploader can clean up their own unlinked uploads after a failed save.
-- Linked records and every other uploader's files retain their protection.
create policy fleet_evidence_unlinked_cleanup on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'fleet-evidence' and owner_id = (select auth.uid())::text
    and not exists (select 1 from public.service_photos p where p.storage_path = name)
    and not exists (select 1 from public.breakdown_photos p where p.storage_path = name)
  );

CREATE OR REPLACE FUNCTION public.complete_breakdown(p_breakdown_id uuid, p_ready boolean, p_reason text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS public.breakdowns
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE b public.breakdowns;
BEGIN
 -- Lock the active machine first, the same order as report and status changes.
 PERFORM 1 FROM public.machines m JOIN public.breakdowns fault ON fault.machine_id=m.id
 WHERE fault.id=p_breakdown_id AND m.active IS TRUE FOR UPDATE OF m;
 IF NOT FOUND THEN RAISE EXCEPTION 'Breakdown is missing or its machine is inactive'; END IF;
 SELECT * INTO b FROM public.breakdowns WHERE id=p_breakdown_id FOR UPDATE;
 IF b.id IS NULL THEN RAISE EXCEPTION 'Breakdown not found'; END IF;
 IF b.resolved_at IS NOT NULL THEN RAISE EXCEPTION 'Breakdown already resolved'; END IF;
 IF (
  coalesce(public.can_manage(),false)
  OR (
    b.assigned_to IS NOT NULL
    AND b.assigned_to=(select auth.uid())
    AND coalesce(public.is_active_fleet_user(),false)
  )
 ) IS DISTINCT FROM TRUE
 THEN RAISE EXCEPTION 'Only assigned technician or management can complete this repair'; END IF;
 IF p_ready IS NULL THEN RAISE EXCEPTION 'Repair readiness must be confirmed'; END IF;
 IF NOT p_ready AND nullif(trim(coalesce(p_reason,'')),'') IS NULL
 THEN RAISE EXCEPTION 'A reason is required if the machine is not ready'; END IF;
 IF p_ready THEN
  UPDATE public.breakdowns SET
   resolved_at=now(),repair_completed_at=now(),repair_completed_by=(select auth.uid()),
   repair_notes=nullif(trim(coalesce(p_notes,'')),''),not_ready_reason=null
  WHERE id=p_breakdown_id RETURNING * INTO b;
  UPDATE public.machines SET status='working',last_confirmed_at=now(),
   breakdown_started_at=null,last_hours_at=now()
  WHERE id=b.machine_id AND active IS TRUE;
  INSERT INTO public.audit_log(actor_id,action,entity_type,entity_id,details)
  VALUES((select auth.uid()),'complete_breakdown','breakdown',b.id,
   jsonb_build_object('ready',true,'machine_id',b.machine_id,'repair_notes',p_notes));
 ELSE
  UPDATE public.breakdowns SET
   repair_completed_at=now(),repair_completed_by=(select auth.uid()),
   repair_notes=nullif(trim(coalesce(p_notes,'')),''),not_ready_reason=trim(p_reason)
  WHERE id=p_breakdown_id RETURNING * INTO b;
  INSERT INTO public.audit_log(actor_id,action,entity_type,entity_id,details)
  VALUES((select auth.uid()),'repair_completed_not_ready','breakdown',b.id,
   jsonb_build_object('ready',false,'machine_id',b.machine_id,
      'reason',p_reason,'repair_notes',p_notes));
 END IF;
 RETURN b;
END;
$function$;

notify pgrst, 'reload schema';
