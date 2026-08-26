-- Prevent breakdown reporting from updating machines twice.
-- The breakdown INSERT trigger owns the machine status synchronization.

DROP FUNCTION IF EXISTS public.report_breakdown(uuid, text, text);

CREATE OR REPLACE FUNCTION public.report_breakdown(
  p_machine_id uuid,
  p_reason text,
  p_notes text DEFAULT '',
  p_assigned_to uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  bid uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND active) THEN
    RAISE EXCEPTION 'Active user required';
  END IF;
  IF trim(coalesce(p_reason,'')) = '' THEN
    RAISE EXCEPTION 'Breakdown reason is required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.machines WHERE id = p_machine_id AND active) THEN
    RAISE EXCEPTION 'Active machine not found';
  END IF;
  IF p_assigned_to IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_assigned_to AND active) THEN
    RAISE EXCEPTION 'A valid active assigned employee is required';
  END IF;
  IF EXISTS (SELECT 1 FROM public.breakdowns WHERE machine_id = p_machine_id AND resolved_at IS NULL) THEN
    RAISE EXCEPTION 'This machine already has an open breakdown';
  END IF;

  INSERT INTO public.breakdowns(machine_id, reason, notes, reported_by, assigned_to)
  VALUES (p_machine_id, trim(p_reason), coalesce(p_notes,''), auth.uid(), p_assigned_to)
  RETURNING id INTO bid;

  INSERT INTO public.audit_log(actor_id, action, entity_type, entity_id, details)
  VALUES (
    auth.uid(), 'report_breakdown', 'breakdown', bid,
    jsonb_build_object('machine_id', p_machine_id, 'reason', trim(p_reason), 'assigned_to', p_assigned_to)
  );

  RETURN bid;
END;
$$;
