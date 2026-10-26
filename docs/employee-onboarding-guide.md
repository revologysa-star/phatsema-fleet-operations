# Employee onboarding — Phatsema Fleet Operations

## Add an employee (Head of Operations)
1. Open the production app and sign in as the **Head of Operations**.
2. Open **People** and choose **Add employee**.
3. Provide first name, surname, a unique username, email, and optional WhatsApp number.
4. Choose one role: Assistant/Mechanic, Foreman or Operations Manager.
5. Choose **Email invitation (recommended)** so the employee sets their own password, or **Temporary password** when invitation emails cannot be delivered.
6. Submit once. The new employee appears in the People list if creation succeeds.

## What the employee does
- **Invited employee:** Open the invitation email, accept and set a password, then sign in using the email address.
- **Temporary-password employee:** Sign in with the emailed account name and the privately shared temporary password; use **Guide → Change my password** as soon as possible.

## Security and troubleshooting
- Account creation is authorized by a separate Supabase Edge Function. It checks the user's current role and active flag on the server. Only active Head of Operations users are allowed to create accounts.
- New employees never receive Head of Operations or full-access privileges by default. Temporary access is managed separately from People → Manage access.
- The service-role key is never shipped to the browser.
- Username uniqueness is enforced by the database, and partial registration attempts are rolled back where possible.
- If an invitation fails, check Supabase email sending and rate limits. Use a temporary password if allowed by organizational policy.
- If the button does not appear, ensure the user is signed in as Head of Operations and reload the app.
- Sign-in requires **email**, not the display username.
- Account creation events appear in **Audit**. The original fleet data is unaffected.

## Release safety
All 14 automated regressions were passing before the feature was merged; no production employee was created during automated tests.
