# Phatsema Fleet Operations — Full Stack

This is the production-oriented no-telematics model: the application records operational information entered by authorised people. It deliberately contains no fuel telemetry, GPS, device tracking or simulated sensor readings.

## Architecture
- Frontend: `index.html` (Supabase JS)
- Backend database/auth/storage: Supabase PostgreSQL, Auth and Storage
- Atomic fleet workflows: Postgres RPC functions in `supabase/schema.sql`
- Username login resolver: `username-login-v1`
- Secure user administration: `admin-user-management`
- Automatic WhatsApp: `send-whatsapp-alert`

## Deploy
1. Create/use the Phatsema Supabase project.
2. Run `supabase/schema.sql` in Supabase SQL Editor.
3. Deploy the three Edge Functions under `supabase/functions/`.
4. Set Edge Function secrets:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `WHATSAPP_ACCESS_TOKEN`
   - `WHATSAPP_PHONE_NUMBER_ID`
5. Create the first Head of Operations user in Supabase Auth and insert the matching profile row, or temporarily use the admin-user-management function with an existing authorised manager.
6. Host `index.html` on Netlify, Vercel, Cloudflare Pages, or another static host.

## WhatsApp
There are two honest modes:
- Automatic: the Edge Function calls Meta WhatsApp Cloud API. This requires Phatsema's Meta credentials as Edge Function secrets.
- Fallback: if automatic sending is not configured, the UI opens WhatsApp with a pre-filled alert instead of pretending it sent a message.

Never put a WhatsApp access token in `index.html`.

## Critical workflow guarantees
Machine state changes are performed through database RPC functions so the breakdown/service/machine updates occur in one database transaction. This prevents the previous bug where a breakdown could be marked resolved while the machine remained in breakdown status.
