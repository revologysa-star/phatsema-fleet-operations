-- Read-only, complete audit export for Head of Operations only.
-- Preserves current audit records and does not grant broader table access.
-- This SECURITY DEFINER API intentionally bypasses the audit table's manager
-- RLS but performs an independent active Head-of-Operations authorization check.

CREATE OR REPLACE FUNCTION public.audit_export_snapshot()
RETURNS TABLE(
  snapshot_max_id bigint,
  entry_count bigint,
  first_entry_at timestamptz,
  last_entry_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.active IS TRUE
      AND p.role::text = 'head_of_operations'
  ) THEN
    RAISE EXCEPTION 'Head of Operations access required to export the audit log'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT coalesce(max(a.id),0)::bigint, count(*)::bigint,
         min(a.created_at), max(a.created_at)
  FROM public.audit_log a;
END;
$function$;

CREATE OR REPLACE FUNCTION public.audit_export_page(
  p_snapshot_max_id bigint,
  p_after_id bigint DEFAULT 0,
  p_limit integer DEFAULT 500
)
RETURNS TABLE(
  id bigint,
  actor_id uuid,
  actor_name text,
  actor_role text,
  action text,
  entity_type text,
  entity_id uuid,
  details jsonb,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.active IS TRUE
      AND p.role::text = 'head_of_operations'
  ) THEN
    RAISE EXCEPTION 'Head of Operations access required to export the audit log'
      USING ERRCODE = '42501';
  END IF;

  IF p_snapshot_max_id IS NULL OR p_snapshot_max_id < 0
    OR p_after_id IS NULL OR p_after_id < 0
    OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 500
  THEN
    RAISE EXCEPTION 'Invalid audit export pagination arguments'
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT a.id,
         a.actor_id,
         CASE
           WHEN a.actor_id IS NULL THEN 'System'
           ELSE coalesce(nullif(trim(p.full_name), ''),
                         nullif(trim(p.username), ''),
                         'Former or unknown employee')
         END::text,
         coalesce(p.role::text, CASE WHEN a.actor_id IS NULL
           THEN 'system' ELSE 'unknown' END)::text,
         a.action,
         a.entity_type,
         a.entity_id,
         a.details,
         a.created_at
  FROM public.audit_log a
  LEFT JOIN public.profiles p ON p.id = a.actor_id
  WHERE a.id > p_after_id
    AND a.id <= p_snapshot_max_id
  ORDER BY a.id ASC
  LIMIT p_limit;
END;
$function$;

REVOKE ALL ON FUNCTION public.audit_export_snapshot() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.audit_export_page(bigint,bigint,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.audit_export_snapshot() TO authenticated;
GRANT EXECUTE ON FUNCTION public.audit_export_page(bigint,bigint,integer) TO authenticated;


-- Record that the Head prepared a complete report (without claiming a file
-- was printed or saved; the browser controls the final download/print action).
CREATE OR REPLACE FUNCTION public.record_audit_export(
  p_format text,
  p_record_count bigint,
  p_snapshot_max_id bigint
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE verified_count bigint;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id=(SELECT auth.uid())
      AND p.active IS TRUE
      AND p.role::text='head_of_operations'
  ) THEN
    RAISE EXCEPTION 'Head of Operations access required to record audit exports'
      USING ERRCODE='42501';
  END IF;

  IF p_format IS NULL OR p_format NOT IN ('csv','pdf')
    OR p_record_count IS NULL OR p_record_count < 0
    OR p_snapshot_max_id IS NULL OR p_snapshot_max_id < 0
  THEN
    RAISE EXCEPTION 'Invalid audit export metadata' USING ERRCODE='22023';
  END IF;

  SELECT count(*) INTO verified_count
  FROM public.audit_log a WHERE a.id <= p_snapshot_max_id;
  IF verified_count <> p_record_count THEN
    RAISE EXCEPTION 'Audit export count does not match database snapshot'
      USING ERRCODE='22023';
  END IF;

  INSERT INTO public.audit_log(actor_id,action,entity_type,entity_id,details)
  VALUES ((SELECT auth.uid()),'audit_export_prepared','audit_log',NULL,
    jsonb_build_object('format',p_format,'entries_exported',p_record_count,
                       'snapshot_max_id',p_snapshot_max_id));
  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.record_audit_export(text,bigint,bigint)
 FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_audit_export(text,bigint,bigint)
 TO authenticated;
