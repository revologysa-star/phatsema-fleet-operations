-- Phatsema Fleet Operations: employee image/video evidence storage
-- Private bucket for authenticated employee uploads.
-- Bucket limit: 50 MB per file.

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values (
  'fleet-media',
  'fleet-media',
  false,
  52428800,
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/gif',
    'video/mp4',
    'video/webm',
    'video/quicktime'
  ]::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "fleet_media_select" on storage.objects;
drop policy if exists "fleet_media_insert" on storage.objects;
drop policy if exists "fleet_media_update" on storage.objects;
drop policy if exists "fleet_media_delete" on storage.objects;

create policy "fleet_media_select"
on storage.objects for select
to authenticated
using (bucket_id = 'fleet-media');

create policy "fleet_media_insert"
on storage.objects for insert
to authenticated
with check (bucket_id = 'fleet-media');

create policy "fleet_media_update"
on storage.objects for update
to authenticated
using (bucket_id = 'fleet-media' and owner_id = (select auth.uid()::text))
with check (bucket_id = 'fleet-media');

create policy "fleet_media_delete"
on storage.objects for delete
to authenticated
using (bucket_id = 'fleet-media' and owner_id = (select auth.uid()::text));
