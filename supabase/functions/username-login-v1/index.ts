import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
Deno.serve(async (req) => {
  try {
    const { username } = await req.json();
    if (!username || typeof username !== 'string') return new Response(JSON.stringify({error:'Username is required.'}), {status:400,headers:{'Content-Type':'application/json'}});
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data, error } = await admin.from('profiles').select('email,active').eq('username',username.trim()).maybeSingle();
    if (error) throw error;
    if (!data || !data.active) return new Response(JSON.stringify({error:'Username not found or account disabled.'}), {status:404,headers:{'Content-Type':'application/json'}});
    return new Response(JSON.stringify({email:data.email}), {headers:{'Content-Type':'application/json'}});
  } catch (e) { return new Response(JSON.stringify({error:e instanceof Error?e.message:'Unable to resolve username.'}), {status:500,headers:{'Content-Type':'application/json'}}); }
});
