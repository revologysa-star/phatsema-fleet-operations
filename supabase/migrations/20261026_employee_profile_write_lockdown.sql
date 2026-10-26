-- Only privileged server functions and the service role may modify employee profiles.
-- All employees retain authenticated SELECT access required by the app.
-- Existing authorized SECURITY DEFINER management RPCs and service-role Edge
-- Functions continue to work. Block direct self-promotion via REST/JS client.
REVOKE UPDATE ON TABLE public.profiles FROM authenticated, anon;
