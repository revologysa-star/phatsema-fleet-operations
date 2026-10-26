// Phatsema employee onboarding. This endpoint is deliberately Head-only.
// Supabase privileged keys stay on the server; the browser sends only its user JWT.
import { createClient } from "npm:@supabase/supabase-js@2.76.1";

const ALLOWED_ROLES = new Set(["assistant_mechanic", "foreman", "operations_manager"]);
const APP_URL = "https://phatsema-fleet-operations-azs9.vercel.app/";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};
const reply = (status, data) => new Response(JSON.stringify(data), {
  status,
  headers: { ...CORS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
});
const string = (value) => typeof value === "string" ? value.trim() : "";
const fail = (status, message) => reply(status, { ok: false, error: message });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "POST") return fail(405, "Method not allowed.");

  // API-gateway JWT verification remains enabled in production. Validate
  // the same user token again before doing anything with the admin client.
  const header = request.headers.get("Authorization") || "";
  const jwt = /^Bearer\s+([^\s]+)$/i.exec(header)?.[1];
  if (!jwt) return fail(401, "Please sign in to add an employee.");

  const url = Deno.env.get("SUPABASE_URL");
  let key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!key) {
    try { key = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}").default; }
    catch { key = null; }
  }
  if (!url || !key) return fail(503, "Employee management is not configured on the server.");

  const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  try {
    const { data: auth, error: authError } = await admin.auth.getUser(jwt);
    if (authError || !auth?.user?.id) return fail(401, "Your session has expired. Sign in again.");

    const actorId = auth.user.id;
    // Always read current role/active flags from the protected database,
    // never from user_metadata or unrefreshed role claims in the JWT.
    const { data: actor, error: actorError } = await admin.from("profiles")
      .select("role,active").eq("id", actorId).maybeSingle();
    if (actorError) return fail(503, "Unable to verify your permissions right now.");
    if (!actor?.active || actor.role !== "head_of_operations")
      return fail(403, "Only the Head of Operations can add employees.");

    let input;
    try { input = await request.json(); }
    catch { return fail(400, "Employee details must be valid JSON."); }
    if (!input || typeof input !== "object" || Array.isArray(input))
      return fail(400, "Provide the employee details.");

    const firstName = string(input.first_name);
    const surname = string(input.surname);
    const email = string(input.email).toLowerCase();
    const username = string(input.username).toLowerCase();
    const phone = string(input.whatsapp_number);
    const role = string(input.role);
    const mode = string(input.mode || "invite");
    const password = typeof input.password === "string" ? input.password : "";

    if (!firstName || firstName.length > 80 || !surname || surname.length > 80)
      return fail(400, "Provide a first name and surname (up to 80 characters each).");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
      return fail(400, "Enter a valid employee email address.");
    if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username))
      return fail(400, "Username must be 3–32 characters (letters, numbers, dots, dashes or underscores).");
    if (!ALLOWED_ROLES.has(role))
      return fail(400, "Choose Assistant/Mechanic, Foreman or Operations Manager.");
    if (phone && (!/^\+?[0-9 ()-]{6,25}$/.test(phone) || phone.length > 25))
      return fail(400, "Enter a valid WhatsApp number, or leave it empty.");
    if (mode !== "invite" && mode !== "temporary_password")
      return fail(400, "Select an email invitation or temporary password.");
    if (mode === "temporary_password" && (password.length < 12 || password.length > 128))
      return fail(400, "Temporary passwords must contain 12–128 characters.");

    const { data: existing, error: duplicateError } = await admin.from("profiles")
      .select("id").eq("username", username).limit(1);
    if (duplicateError) return fail(503, "Could not verify username availability.");
    if (existing?.length) return fail(409, "This username is already in use.");

    const fullName = firstName + " " + surname;
    const metadata = { full_name: fullName, username };
    let created;
    if (mode === "invite") {
      created = await admin.auth.admin.inviteUserByEmail(email, {
        redirectTo: APP_URL,
        data: metadata,
      });
    } else {
      created = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: metadata,
      });
    }
    if (created.error) {
      const message = String(created.error.message || "Account creation failed.");
      const status = created.error.status === 429 ? 429 : 400;
      if (mode === "invite" && /rate limit|smtp|email|recipient|sending/i.test(message))
        return fail(status, "The invitation could not be emailed. Try the temporary-password option or check Supabase email settings.");
      if (/already|registered|exists|duplicate/i.test(message))
        return fail(409, "An account with this email or username may already exist.");
      return fail(status, message);
    }

    const userId = created.data?.user?.id;
    if (!userId) return fail(502, "No employee account ID was returned. Check the Auth users list.");
    const { data: profile, error: profileError } = await admin.from("profiles")
      .update({
        first_name: firstName,
        surname,
        full_name: fullName,
        username,
        email,
        whatsapp_number: phone || null,
        role,
        active: true,
        full_access: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId)
      .select("id,username")
      .single();

    if (profileError || !profile?.id) {
      const rollback = await admin.auth.admin.deleteUser(userId);
      if (rollback.error) return fail(500, "Account was created but the employee profile could not be saved. Contact the administrator before retrying.");
      return fail(409, "Could not save employee details (the account was rolled back). Check the username and try again.");
    }

    const { error: auditError } = await admin.from("audit_log").insert({
      actor_id: actorId,
      action: "create_user",
      entity_type: "profile",
      entity_id: userId,
      details: {
        username,
        role,
        email,
        onboarding: mode,
      },
    });
    if (auditError) {
      const rollback = await admin.auth.admin.deleteUser(userId);
      if (rollback.error) return fail(500, "Employee was created but auditing failed. Contact the administrator before retrying.");
      return fail(500, "Unable to audit account creation; account was rolled back.");
    }

    return reply(201, {
      ok: true,
      user_id: userId,
      username,
      email,
      role,
      mode,
      message: mode === "invite"
        ? "Employee invited. They must accept the email invitation and create their password."
        : "Employee created. Share the temporary password privately, then ask them to change it.",
    });
  } catch (_error) {
    // Do not leak database errors, credentials or request contents to clients.
    return fail(500, "Unable to create the employee right now. Please retry or contact the administrator.");
  }
});
