-- Protect the existing five-minute WhatsApp service-alert scheduler.
-- The credential is generated inside Postgres and never committed to source.
-- Existing service settings, machines, alerts and schedule remain unchanged.
create schema if not exists private;
revoke all on schema private from public,anon,authenticated;

create table if not exists private.fleet_cron_keys(
  name text primary key,
  secret text not null check (length(secret)=64)
);
alter table private.fleet_cron_keys enable row level security;
revoke all on private.fleet_cron_keys from public,anon,authenticated;
insert into private.fleet_cron_keys(name,secret)
values ('phatsema-service-hours-whatsapp',encode(gen_random_bytes(32),'hex'))
on conflict (name) do nothing;

create or replace function public.authorize_fleet_service_alert_cron(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(
    (length(p_secret)=64 and exists(
       select 1 from private.fleet_cron_keys k
       where k.name='phatsema-service-hours-whatsapp'
         and k.secret=p_secret
     )),false
  );
$function$;
revoke all on function public.authorize_fleet_service_alert_cron(text)
from public,anon,authenticated;
grant execute on function public.authorize_fleet_service_alert_cron(text)
to service_role;

-- Preserve the five-minute cadence; only add a private credential to the
-- request headers. Cron runs as the privileged owner and reads the secret
-- directly from the private schema.
do $setup$
declare job_id bigint;
begin
  select jobid into job_id
  from cron.job
  where jobname='phatsema-service-hours-whatsapp'
    and active=true;
  if job_id is null then
    raise exception 'Existing active WhatsApp alert scheduler not found';
  end if;
  perform cron.alter_job(
    job_id,
    command := $cron_sql$
      select net.http_post(
        url:='https://fduccizawxtqnqtuxmjl.supabase.co/functions/v1/send-service-hours-whatsapp-alert',
        headers:=jsonb_build_object(
          'Content-Type','application/json',
          'x-phatsema-job-key',(
            select secret from private.fleet_cron_keys
            where name='phatsema-service-hours-whatsapp'
          )
        ),
        body:='{"source":"cron"}'::jsonb,
        timeout_milliseconds:=5000
      );
    $cron_sql$
  );
end $setup$;

notify pgrst,'reload schema';
