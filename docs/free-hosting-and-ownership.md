# Free-first hosting, installation, and creator information

## Creator and intellectual property

**Created and developed by Revology** (GitHub account `revologysa-star`), as stated by the creator of Phatsema Fleet Operations. This notice records the creator's claim, not a completed legal chain-of-title investigation.

Publishing this repository publicly does not by itself grant an open-source licence or transfer copyright. Before licensing software commercially, check any employment, commissioned-work, contributions or intellectual-property agreements and establish legal ownership in writing. Do not assume Phatsema owns the program, and do not assume creation alone resolves all possible contractual claims.

The Phatsema name, logo, and operational data may belong to Phatsema Projects & Supplies. Using those marks for third-party customers requires permission. Protect employee and client data under applicable South African privacy law (including POPIA). Do not share live operational records as samples or use client endorsements without their express approval.

## Free static hosting without publishing back-end code

The frontend is a static web app and can be deployed on free commercial-friendly static platforms such as Cloudflare Pages or Netlify Free, **subject to current terms, usage caps, and account availability**. Free hosting is not permanent availability or a commercial SLA.

From repository root, build only the allowed public app files:

```sh
bash scripts/build-static.sh
```

The generated `dist/` folder contains `index.html`, `app.js`, `styles.css`, `pwa-install.js`, `sw.js`, `manifest.webmanifest`, icon PNGs and `_headers` for deployment. **Publish only `dist/`.** Do not publish `.env`, secrets, database backups, migrations, Supabase Edge Functions, or employee information.

### Deploy with Cloudflare Pages

1. Sign in at https://dash.cloudflare.com/ and select **Workers & Pages → Create application → Pages → Connect to Git**.
2. Select `revologysa-star/phatsema-fleet-operations` and production branch `main`.
3. Build command: `bash scripts/build-static.sh`.
4. Build output directory: `dist`.
5. Deploy. Confirm the issued `*.pages.dev` HTTPS address serves `manifest.webmanifest`, `sw.js`, both PNG icons and the login screen.
6. Open the address **directly in Chrome on Android** (not an embedded browser), refresh and choose **Install app**.
7. Verify your allowed site/redirect URLs in Supabase Auth if the authentication method requires it.

Cloudflare Pages free plan has usage caps including deployment/build limits. No credit card or paid upgrade is required for a basic static site within free allowances, but ongoing suitability depends on the provider's terms.

### Alternative: Netlify Free

Connect the same GitHub repository, choose build command `bash scripts/build-static.sh` and publish directory `dist`. Verify the site's latest pricing, allowed commercial use, and usage/credit caps before enabling paying customers.

### Avoid for paid SaaS use

- GitHub Pages explicitly prohibits hosting commercial SaaS applications (https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits).
- Vercel Hobby explicitly limits its free plan to personal, non-commercial use (https://vercel.com/docs/plans/hobby).

Keep any existing developer or test links separate from the commercial production website. Do not promise a paid customer that these two free options are valid commercial hosting.

## Reliability and backups

Supabase is your database, login, storage and backend provider. Supabase Free projects can be paused after inactivity. Free projects lack automatically downloadable daily backups; Supabase recommends regular database exports using the CLI (`supabase db dump`). Database dumps **do not include file content from Storage API buckets**; back up those files separately.

- Never store unencrypted database dumps or secret keys in a public GitHub repository or static website.
- Maintain encrypted off-platform backups and periodically test a restore into a separate, disposable environment.
- Keep your GitHub account, Supabase organization, backup encryption keys and provider account access under the verified owner's control.
- Avoid promising guaranteed uptime until you have adequate hosting, testing, support, monitoring, backups and a suitable agreement.
- Review your client service terms, POPIA duties, support expectations and permission to use company branding.

Sources: https://supabase.com/docs/guides/platform/free-project-pausing ; https://supabase.com/docs/guides/platform/backups .

## What Android installation does and does not do

The PWA adds a home-screen icon and standalone app window. It is not a Play Store APK, and it cannot edit fleet data offline. It needs a secure internet connection for Supabase login, private fleet records, machine updates, photographic evidence and service alerts. The service worker only caches public frontend files.

## Acceptance tests before a commercial roll-out

- Confirm installation and icon launch on Android Chrome, logout and sign-in.
- Confirm Head of Operations can export the complete audit log; no other roles can.
- Confirm repair completion is denied for unassigned mechanics but works for assigned employees.
- Confirm photos upload to private storage with mobile camera/file picker.
- Confirm WhatsApp messages really send after Meta credentials are configured.
- Perform a backup and restore drill in a non-production environment.
- Verify login redirects and client roles from the new HTTPS domain.
