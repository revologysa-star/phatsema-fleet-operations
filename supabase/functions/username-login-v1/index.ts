import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.76.1";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const out=(b:any,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{...cors,"Content-Type":"application/json"}});
Deno.serve(async(req)=>{if(req.method==='OPTIONS')return new Response('ok',{headers:cors});if(req.method!=='POST')return out({error:'Method not allowed'},405);try{const body=await req.json();const username=String(body?.username||'').trim();const password=body?.password;
if(!username||typeof password!=='string'||password.length===0)return out({error:'Username and password required'},400);
const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const {data:p,error:pe}=await admin.from('profiles').select('id,username,active,email').ilike('username',username).maybeSingle();
if(pe)return out({error:'Unable to look up account'},500); if(!p?.active)return out({error:'Invalid username or password'},401);
let email=p.email||null;
if(!email){const {data:u,error:ue}=await admin.auth.admin.getUserById(p.id);if(ue)return out({error:'Unable to load account'},500);email=u.user?.email||null;}
if(!email)return out({error:'Invalid username or password'},401);
const client=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!);const {data,error}=await client.auth.signInWithPassword({email,password});if(error)return out({error:'Invalid username or password'},401);return out({session:data.session,user:data.user});
}catch(e){return out({error:e instanceof Error?e.message:'Unexpected error'},500)}});