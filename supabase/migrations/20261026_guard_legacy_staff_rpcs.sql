-- Guard legacy SECURITY DEFINER helpers against unapproved or disabled accounts.
-- Preserve valid employees' existing permissions and return shapes.

create or replace function public.can_manage()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.active is true
      and (
        coalesce(p.full_access,false)
        or p.role::text in ('foreman','operations_manager','head_of_operations')
      )
  );
$function$;

create or replace function public.get_breakdown_assignment(p_breakdown_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare r jsonb;
begin
  if not public.is_active_fleet_user() then
    raise exception 'Active employee login required';
  end if;

  select jsonb_build_object(
    'breakdown_id',b.id,
    'machine_id',b.machine_id,
    'machine_name',m.name,
    'fleet_id',m.fleet_id,
    'reason',b.reason,
    'notes',b.notes,
    'started_at',b.started_at,
    'assigned_to',b.assigned_to,
    'assignee_name',p.full_name,
    'assignee_whatsapp',coalesce(p.whatsapp_number,p.phone_number),
    'media',coalesce((
      select jsonb_agg(jsonb_build_object(
        'name',bm.original_name,
        'type',bm.content_type,
        'path',bm.storage_path
      ))
      from public.breakdown_media bm
      where bm.breakdown_id=b.id
    ),'[]'::jsonb)
  )
  into r
  from public.breakdowns b
  join public.machines m on m.id=b.machine_id
  left join public.profiles p on p.id=b.assigned_to
  where b.id=p_breakdown_id;

  return r;
end;
$function$;

-- Existing grants stay unchanged: only authenticated staff may call these.
notify pgrst,'reload schema';
