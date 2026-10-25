create unique index if not exists temporary_access_one_unrevoked_per_scope
 on public.temporary_access_grants(user_id,permission)
 where revoked_at is null;
