import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.76.1";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"content-type":"application/json"}});
const clean=(v:unknown)=>String(v??'').replace(/\D/g,'');

Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS') return new Response('ok',{headers:cors});
  if(req.method!=='POST') return json({error:'Method not allowed'},405);
  const auth=req.headers.get('Authorization');
  if(!auth) return json({error:'Authentication required'},401);
  const url=Deno.env.get('SUPABASE_URL');
  const anon=Deno.env.get('SUPABASE_ANON_KEY');
  if(!url||!anon) return json({error:'Supabase environment is not configured'},500);
  const userClient=createClient(url,anon,{global:{headers:{Authorization:auth}}});
  const {data:{user}}=await userClient.auth.getUser();
  if(!user) return json({error:'Invalid session'},401);
  const {data:profile}=await userClient.from('profiles').select('id,role,active').eq('id',user.id).maybeSingle();
  if(!profile?.active || !['foreman','operations_manager','head_of_operations'].includes(profile.role)) return json({error:'Operations management access required to send alerts'},403);
  const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!serviceKey)return json({error:'Alert audit service is not configured'},503);
  const adminClient=createClient(url,serviceKey);
  const body=await req.json().catch(()=>({}));
  const breakdownId=body?.breakdown_id;
  if(!breakdownId) return json({error:'breakdown_id is required'},400);
  const {data:b,error:be}=await userClient.from('breakdowns').select('id,reason,notes,started_at,machine_id,assigned_to,machines(name,fleet_id)').eq('id',breakdownId).maybeSingle();
  if(be||!b) return json({error:be?.message||'Breakdown not found'},404);
  const {data:setting}=await userClient.from('app_settings').select('value').eq('key','whatsapp_alert_number').maybeSingle();
  const fallbackNumber=clean(setting?.value);
  const {data:recipients}=await userClient.from('profiles').select('id,full_name,role,active,whatsapp_number,phone_number').eq('active',true).in('role',['assistant_mechanic','foreman','operations_manager','head_of_operations']);
  const numbers=new Map<string,{name:string,role:string}>();
  for(const r of recipients??[]){
    const relevant=r.role!=='assistant_mechanic'||r.id===b.assigned_to;
    if(!relevant) continue;
    const number=clean(r.whatsapp_number||r.phone_number);
    if(number) numbers.set(number,{name:r.full_name||r.role,role:r.role});
  }
  if(fallbackNumber) numbers.set(fallbackNumber,{name:'Configured alert recipient',role:'alert_recipient'});
  if(numbers.size===0) return json({ok:false,configured:false,error:'No recipient WhatsApp numbers are configured. Add employee WhatsApp numbers in People or configure the alert number in Settings.',recipient_count:0},200);
  const machineName=String(b.machines?.name||'Machine');
  const fleetId=String(b.machines?.fleet_id||'');
  const issue=String(b.reason||'Breakdown');
  const reported=new Date(b.started_at).toLocaleString('en-ZA');
  const message=`PHATSEMA FLEET ALERT\n\nMachine: ${machineName}\nFleet ID: ${fleetId}\nIssue: ${issue}\nReported: ${reported}\n\nPlease review the breakdown in Phatsema Fleet Operations.`;
  const token=Deno.env.get('META_WHATSAPP_ACCESS_TOKEN');
  const phoneId=Deno.env.get('META_WHATSAPP_PHONE_NUMBER_ID');
  const graphVersion=Deno.env.get('META_GRAPH_VERSION')||'v23.0';
  const templateName=Deno.env.get('META_WHATSAPP_TEMPLATE_NAME');
  const templateLanguage=Deno.env.get('META_WHATSAPP_TEMPLATE_LANGUAGE')||'en_ZA';
  if(!token||!phoneId){
    const first=[...numbers.keys()][0];
    return json({ok:false,configured:false,error:'Meta WhatsApp credentials are not configured on the server',recipient_count:numbers.size,fallback_url:first?`https://wa.me/${first}?text=${encodeURIComponent(message)}`:null},200);
  }
  const results=[];
  for(const [to,meta] of numbers){
    let payload;
    if(templateName){
      payload={messaging_product:'whatsapp',to:to,type:'template',template:{name:templateName,language:{code:templateLanguage},components:[{type:'body',parameters:[{type:'text',text:machineName},{type:'text',text:fleetId},{type:'text',text:issue},{type:'text',text:reported}]}]}};
    }else{
      payload={messaging_product:'whatsapp',to:to,type:'text',text:{preview_url:false,body:message}};
    }
    const resp=await fetch(`https://graph.facebook.com/${graphVersion}/${phoneId}/messages`,{method:'POST',headers:{'Authorization':`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const result=await resp.json().catch(()=>({}));
    results.push({recipient:meta.name,role:meta.role,last4:to.slice(-4),ok:resp.ok,message_id:result?.messages?.[0]?.id||null,error:resp.ok?null:(result?.error?.message||'Meta WhatsApp API rejected the message')});
  }
  const sent=results.filter(x=>x.ok).length;
  await adminClient.from('audit_log').insert({actor_id:user.id,action:'whatsapp_alert_sent',entity_type:'breakdown',entity_id:breakdownId,details:{recipient_count:numbers.size,sent,provider:'meta',results:results.map(x=>({role:x.role,last4:x.last4,ok:x.ok,message_id:x.message_id,error:x.error}))}});
  return json({ok:sent>0,configured:true,recipient_count:numbers.size,sent,failed:numbers.size-sent,results});
});