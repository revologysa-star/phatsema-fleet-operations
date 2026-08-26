# Phatsema Fleet Operations

Production fleet operations application for fleet status, breakdowns, service history, people/access, settings and audit workflows.

## Deployment

Static frontend: `index.html`

Backend: Supabase (database, authentication and Edge Functions).

Supabase functions included:
- `admin-user-management`
- `username-login-v1`
- `send-whatsapp-alert`

Database files:
- `supabase/schema.sql`
- `supabase/migrations/repair_phatsema_fleet_workflows_and_analytics.sql`
