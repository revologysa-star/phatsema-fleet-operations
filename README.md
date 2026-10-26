# Phatsema Fleet Operations — Full Stack

This is the production-oriented no-telematics model: the application records operational information entered by authorised people. It deliberately contains no fuel telemetry, GPS, device tracking or simulated sensor readings.

## Creator and intended rights

**Created and developed by Revology** (`revologysa-star`), as identified by the original creator. Authorship is recorded here without assuming that every commercial IP right is legally resolved; employment, work-for-hire, commission and third-party agreements may affect ownership. Phatsema's brand and its operational data remain separate from the software authorship claim.

Public visibility of this repository does not grant an open-source licence. Read [creator, commercial hosting and recovery guidance](docs/free-hosting-and-ownership.md) before licensing or offering this application as a service.

## Android installation (PWA)

The app now includes an Android install manifest, 192px/512px icons and static-only service worker. When hosted from its latest build on HTTPS, open the site in Android Chrome and choose **Install app**. The installed app still requires internet for login and fleet records.

**Commercial production:** Use a hosting provider whose current terms permit the intended use. Prepare the static-only release with `bash scripts/build-static.sh` and publish `dist/` via Cloudflare Pages or a suitable alternative. GitHub Pages and Vercel Hobby should not be used as a paid SaaS host. Free tiers have limits; Supabase Free has inactivity pausing and no automatic daily backups.

## Architecture
- Frontend: `index.html` (Supabase JS)
- Backend database/auth/storage: Supabase PostgreSQL, Auth and Storage
- Atomic fleet workflows: Postgres RPC functions in `supabase/schema.sql`
- Username login resolver: `username-login-v1`
- Secure user administration: `admin-user-management`
- Automatic WhatsApp: `send-whatsapp-alert`

## Deploy
1. Create/use the Phatsema Supabase project.
2. For a **new empty** backend only, review the current Supabase schema and versioned migrations before running SQL. **Never rerun the initial schema over an existing live fleet.**
3. Deploy the three Edge Functions under `supabase/functions/`.
4. Set Edge Function secrets:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `WHATSAPP_ACCESS_TOKEN`
   - `WHATSAPP_PHONE_NUMBER_ID`
5. Create the first Head of Operations user in Supabase Auth and insert the matching profile row, or temporarily use the admin-user-management function with an existing authorised manager.
6. Run `bash scripts/build-static.sh` and host **only `dist/`** on a provider whose terms permit your use, e.g. Cloudflare Pages or Netlify Free within their respective limits. Do not use Vercel Hobby or GitHub Pages for commercial SaaS.

## WhatsApp
There are two honest modes:
- Automatic: the Edge Function calls Meta WhatsApp Cloud API. This requires Phatsema's Meta credentials as Edge Function secrets.
- Fallback: if automatic sending is not configured, the UI opens WhatsApp with a pre-filled alert instead of pretending it sent a message.

Never put a WhatsApp access token in `index.html`.

## Critical workflow guarantees
Machine state changes are performed through database RPC functions so the breakdown/service/machine updates occur in one database transaction. This prevents the previous bug where a breakdown could be marked resolved while the machine remained in breakdown status.
