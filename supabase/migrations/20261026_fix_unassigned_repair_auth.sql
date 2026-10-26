-- Close NULL authorization bypass on unassigned breakdowns. No data changes.
CREATE OR REPLACE FUNCTION public.complete_breakdown(p_breakdown_id uuid, p_ready boolean, p_reason text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS breakdowns
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE b public.breakdowns;
BEGIN
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
$function$

