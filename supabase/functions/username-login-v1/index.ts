import { createClient } from "npm:@supabase/supabase-js@2.76.1";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
});
const invalidLogin = () => reply({ error: "Invalid username or password" }, 401);

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method !== "POST") return reply({ error: "Method not allowed" }, 405);

  const body = await request.json().catch(() => null);
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const password = body?.password;
  if (!username || username.length > 128 || username.includes("*") || typeof password !== "string" || !password || password.length > 4096) {
    return reply({ error: "Username and password are required" }, 400);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !service || !anon) return reply({ error: "Username sign-in is unavailable" }, 503);

  try {
    const options = { auth: { persistSession: false, autoRefreshToken: false } };
    const admin = createClient(url, service, options);
    // Treat underscores and percent signs as literal username characters.
    const literal = username.replace(/[\\%_]/g, "\\$&");
    const { data: profiles, error } = await admin.from("profiles").select("id,username,active,email")
      .ilike("username", literal).limit(2);
    if (error) return reply({ error: "Username sign-in is unavailable" }, 503);
    const profile = profiles?.length === 1 ? profiles[0] : null;
    if (!profile?.active || profile.username.toLowerCase() !== username.toLowerCase()) return invalidLogin();

    let email = profile.email;
    if (!email) {
      const { data, error: lookupError } = await admin.auth.admin.getUserById(profile.id);
      if (lookupError) return reply({ error: "Username sign-in is unavailable" }, 503);
      email = data.user?.email;
    }
    if (!email) return invalidLogin();

    const client = createClient(url, anon, options);
    const result = await client.auth.signInWithPassword({email, password});
    if (result.error?.status === 429) return reply({ error: "Too many sign-in attempts" }, 429);
    if (result.error || result.data.user?.id !== profile.id) return invalidLogin();
    return reply({ session: result.data.session, user: result.data.user });
  } catch {
    return reply({ error: "Username sign-in is unavailable" }, 503);
  }
});
