-- Include overdue machines in service-hour WhatsApp reminders.
-- The previous candidate window excluded machines that moved 1+ hour beyond
-- the due reading. Match the dashboard's machine-specific service schedule.
-- Existing service rows, fleet hours, machines and audit logs are unchanged.
CREATE OR REPLACE FUNCTION public.get_whatsapp_service_alert_candidates()
RETURNS TABLE(
 machine_id uuid,machine_name text,fleet_id text,current_hours numeric,
 service_due_hours numeric,alert_at_hours numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
 SELECT m.id,m.name,m.fleet_id,m.hours,m.next_service_hours,
   greatest(0,m.next_service_hours -
     coalesce(m.service_warning_hours,
       (select (value #>> '{}')::numeric
        from public.app_settings where key='service_warning_hours' limit 1),50))
 FROM public.machines m
 WHERE m.active IS TRUE
   AND m.next_service_hours IS NOT NULL
   AND m.hours >= greatest(0,m.next_service_hours -
     coalesce(m.service_warning_hours,
       (select (value #>> '{}')::numeric
        from public.app_settings where key='service_warning_hours' limit 1),50))
   AND coalesce((select (value #>> '{}')::boolean
     from public.app_settings where key='whatsapp_alerts_enabled' limit 1),false)
 ORDER BY m.hours-m.next_service_hours DESC,m.name;
$function$;
-- Keep the scheduler-only function private from browser API roles.
REVOKE EXECUTE ON FUNCTION public.get_whatsapp_service_alert_candidates()
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_whatsapp_service_alert_candidates()
 TO service_role;
