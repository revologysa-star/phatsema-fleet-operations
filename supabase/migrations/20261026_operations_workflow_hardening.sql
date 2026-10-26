-- Phatsema Fleet Operations: commercial-readiness phase 1
-- Safety: retain historical records; no fleet/user rows are deleted or rewritten.
-- Status transitions happen through authorized RPCs, not unrestricted client table writes.

CREATE OR REPLACE FUNCTION public.report_breakdown(
 p_machine_id uuid,p_reason text,p_notes text DEFAULT ''::text,p_assigned_to uuid DEFAULT NULL::uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE bid uuid; actor_role text;
BEGIN
 SELECT p.role::text INTO actor_role FROM public.profiles p
 WHERE p.id=(select auth.uid()) AND p.active IS TRUE;
 IF actor_role IS NULL THEN RAISE EXCEPTION 'Active account required'; END IF;
 IF nullif(trim(coalesce(p_reason,'')),'') IS NULL THEN RAISE EXCEPTION 'Breakdown reason is required'; END IF;
 -- Serialize per machine to prevent duplicate open breakdowns under concurrent reporting.
 PERFORM 1 FROM public.machines WHERE id=p_machine_id AND active IS TRUE FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Active machine not found'; END IF;
 IF p_assigned_to IS NOT NULL THEN
   IF actor_role NOT IN ('foreman','operations_manager','head_of_operations')
     AND NOT public.can_manage()
   THEN RAISE EXCEPTION 'Only management can assign a technician'; END IF;
   IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=p_assigned_to AND p.active IS TRUE
     AND p.role::text IN ('assistant_mechanic','foreman','operations_manager','head_of_operations'))
   THEN RAISE EXCEPTION 'Assigned employee must be active'; END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM public.breakdowns WHERE machine_id=p_machine_id AND resolved_at IS NULL)
 THEN RAISE EXCEPTION 'This machine already has an open breakdown'; END IF;
 INSERT INTO public.breakdowns(machine_id,reason,notes,reported_by,assigned_to)
 VALUES(p_machine_id,trim(p_reason),coalesce(p_notes,''),(select auth.uid()),p_assigned_to)
 RETURNING id INTO bid;
 UPDATE public.machines SET status='breakdown',breakdown_started_at=now(),last_confirmed_at=now()
 WHERE id=p_machine_id AND active IS TRUE;
 INSERT INTO public.audit_log(actor_id,action,entity_type,entity_id,details)
 VALUES((select auth.uid()),'report_breakdown','breakdown',bid,
 jsonb_build_object('machine_id',p_machine_id,'reason',trim(p_reason),'assigned_to',p_assigned_to));
 RETURN bid;
END;
$function$;

CREATE OR REPLACE FUNCTION public.assign_breakdown(
 p_breakdown_id uuid,p_assigned_to uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE b public.breakdowns;
BEGIN
 IF NOT public.can_manage() THEN RAISE EXCEPTION 'Management permission required'; END IF;
 IF p_assigned_to IS NOT NULL AND NOT EXISTS (
   SELECT 1 FROM public.profiles WHERE id=p_assigned_to AND active IS TRUE
 ) THEN RAISE EXCEPTION 'Assigned employee must be active'; END IF;
 UPDATE public.breakdowns SET assigned_to=p_assigned_to
 WHERE id=p_breakdown_id AND resolved_at IS NULL RETURNING * INTO b;
 IF NOT FOUND THEN RAISE EXCEPTION 'Open breakdown not found'; END IF;
 INSERT INTO public.audit_log(actor_id,action,entity_type,entity_id,details)
 VALUES((select auth.uid()),'breakdown_assigned','breakdown',p_breakdown_id,
 jsonb_build_object('assigned_to',p_assigned_to,'machine_id',b.machine_id));
END;
$function$;

CREATE OR REPLACE FUNCTION public.complete_breakdown(
 p_breakdown_id uuid,p_ready boolean,p_reason text DEFAULT NULL::text,p_notes text DEFAULT NULL::text
) RETURNS public.breakdowns LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE b public.breakdowns;
BEGIN
 SELECT * INTO b FROM public.breakdowns WHERE id=p_breakdown_id FOR UPDATE;
 IF b.id IS NULL THEN RAISE EXCEPTION 'Breakdown not found'; END IF;
 IF b.resolved_at IS NOT NULL THEN RAISE EXCEPTION 'Breakdown already resolved'; END IF;
 IF NOT (
  public.can_manage()
  OR (b.assigned_to=(select auth.uid()) AND public.is_active_fleet_user())
 ) THEN RAISE EXCEPTION 'Only assigned technician or management can complete this repair'; END IF;
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

CREATE OR REPLACE FUNCTION public.log_service(
 p_machine_id uuid,p_work_completed text,p_hour_reading numeric,p_notes text DEFAULT ''::text
) RETURNS public.services LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE m public.machines; s public.services;
BEGIN
 IF NOT public.is_active_fleet_user() THEN RAISE EXCEPTION 'Active account required'; END IF;
 IF nullif(trim(coalesce(p_work_completed,'')),'') IS NULL THEN RAISE EXCEPTION 'Work completed is required'; END IF;
 SELECT * INTO m FROM public.machines WHERE id=p_machine_id AND active IS TRUE FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Active machine not found'; END IF;
 IF coalesce(p_hour_reading,0)<m.hours THEN RAISE EXCEPTION 'Hour reading cannot be lower than current machine hours'; END IF;
 INSERT INTO public.services(machine_id,work_completed,hour_reading,notes,recorded_by)
 VALUES(p_machine_id,trim(p_work_completed),coalesce(p_hour_reading,m.hours),coalesce(p_notes,''),(select auth.uid()))
 RETURNING * INTO s;
 -- Service logging is NOT a repair completion; never change the machine's status here.
 UPDATE public.machines SET hours=coalesce(p_hour_reading,m.hours),
  next_service_hours=coalesce(p_hour_reading,m.hours)+coalesce(m.service_interval_hours,500),
  next_service_date=null,last_confirmed_at=now()
 WHERE id=p_machine_id;
 INSERT INTO public.audit_log(actor_id,action,entity_type,entity_id,details)
 VALUES((select auth.uid()),'log_service','service',s.id,
  jsonb_build_object('machine_id',p_machine_id,'hours',s.hour_reading,'work',trim(p_work_completed)));
 RETURN s;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_machine_status(
 p_machine_id uuid,p_status text,p_reason text DEFAULT NULL::text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE old_status text;
BEGIN
 IF NOT (public.can_manage() OR public.has_temporary_permission('manage_fleet'))
 THEN RAISE EXCEPTION 'Fleet management permission required'; END IF;
 IF p_status NOT IN ('working','available','breakdown','maintenance','offline')
 THEN RAISE EXCEPTION 'Invalid machine status'; END IF;
 SELECT status::text INTO old_status FROM public.machines
 WHERE id=p_machine_id AND active IS TRUE FOR UPDATE;
 IF old_status IS NULL THEN RAISE EXCEPTION 'Machine not found'; END IF;
 UPDATE public.machines SET status=p_status::public.machine_status,
  last_confirmed_at=now(),breakdown_started_at=CASE
    WHEN p_status='breakdown' THEN coalesce(breakdown_started_at,now())
    ELSE NULL END,
  updated_at=now() WHERE id=p_machine_id;
 IF p_status='working' AND old_status='breakdown' THEN
  UPDATE public.breakdowns SET resolved_at=coalesce(resolved_at,now()),
   downtime_minutes=greatest(0,floor(extract(epoch from(coalesce(resolved_at,now())-started_at))/60))::int,
   repair_completed_at=coalesce(repair_completed_at,now()),
   repair_completed_by=coalesce(repair_completed_by,(select auth.uid())),
   repair_notes=coalesce(repair_notes,p_reason)
  WHERE machine_id=p_machine_id AND resolved_at IS NULL;
 END IF;
 INSERT INTO public.audit_log(actor_id,action,entity_type,entity_id,details)
 VALUES((select auth.uid()),'machine_status_changed','machine',p_machine_id,
  jsonb_build_object('from',old_status,'to',p_status,'reason',p_reason));
END;
$function$;

-- Only the actual Head of Operations may grant permanent full access.
CREATE OR REPLACE FUNCTION public.can_grant_full_access()
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
 SELECT EXISTS(SELECT 1 FROM public.profiles
 WHERE id=(select auth.uid()) AND active IS TRUE AND role::text='head_of_operations');
$function$;

-- Direct REST writes could bypass the workflows above. The app uses RPCs for
-- machine, breakdown and service changes; those functions are SECURITY DEFINER.
-- Keep service/breakdown PHOTO insert available for authorised evidence workflows.
REVOKE INSERT,UPDATE,DELETE ON public.machines,public.breakdowns,public.services,public.audit_log
 FROM anon,authenticated;
REVOKE UPDATE,DELETE ON public.breakdown_photos,public.service_photos FROM anon,authenticated;

-- Trigger functions should never be callable directly as REST RPC endpoints.
REVOKE EXECUTE ON FUNCTION
 public.handle_new_user(),public.audit_machine_changes(),public.audit_breakdown_events(),
 public.audit_service_events(),public.audit_media_events(),public.sync_manual_machine_status(),
 public.track_machine_production_time()
 FROM PUBLIC,anon,authenticated;

-- Existing photo records remain accessible; additional restrictive policies
-- ensure suspended employees cannot upload or access fleet evidence.
CREATE POLICY breakdown_photos_active_guard ON public.breakdown_photos
 AS RESTRICTIVE FOR ALL TO authenticated
 USING(public.is_active_fleet_user()) WITH CHECK(public.is_active_fleet_user());
CREATE POLICY breakdown_photos_permitted_uploader ON public.breakdown_photos
 AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(
   EXISTS(
    SELECT 1 FROM public.breakdowns b
    WHERE b.id=breakdown_id AND (
      b.reported_by=(select auth.uid())
      OR b.assigned_to=(select auth.uid())
      OR public.can_manage()
    )
   )
 );
CREATE POLICY fleet_evidence_active_guard ON storage.objects
 AS RESTRICTIVE FOR ALL TO authenticated
 USING(bucket_id NOT IN ('fleet-evidence','fleet-media') OR public.is_active_fleet_user())
 WITH CHECK(bucket_id NOT IN ('fleet-evidence','fleet-media') OR public.is_active_fleet_user());

CREATE INDEX IF NOT EXISTS idx_breakdown_photos_breakdown_id ON public.breakdown_photos(breakdown_id);
CREATE INDEX IF NOT EXISTS idx_breakdowns_started_at ON public.breakdowns(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_services_service_date ON public.services(service_date DESC);
