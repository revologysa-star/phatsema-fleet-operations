import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.76.1';

const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'content-type':'application/json'}});

Deno.serve(async(req)=>{
  if(req.method==='OPTIONS') return new Response('ok',{headers:cors});
  if(req.method!=='POST') return json({error:'Method not allowed'},405);
  try{
    const url=Deno.env.get('SUPABASE_URL'), service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if(!url||!service) return json({error:'Supabase environment is not configured'},500);
    const admin=createClient(url,service);
    // This Edge Function runs without gateway JWT because pg_cron invokes it.
    // Reject all requests except the scheduled job's private server credential.
    const jobKey=req.headers.get('x-phatsema-job-key')||'';
    if(!/^[a-f0-9]{64}$/i.test(jobKey))
      return json({error:'Unauthorized'},401);
    const {data:authorized,error:authError}=await admin.rpc(
      'authorize_fleet_service_alert_cron',{p_secret:jobKey}
    );
    if(authError||authorized!==true)
      return json({error:'Unauthorized'},401);
    let body:any={};
    try{body=await req.json();}catch{}

    const {data:settings,error:settingsError}=await admin.from('app_settings').select('key,value').in('key',['whatsapp_alert_number','whatsapp_alerts_enabled']);
    if(settingsError) return json({error:settingsError.message},500);
    const cfg=Object.fromEntries((settings||[]).map((x:any)=>[x.key,x.value]));
    if(cfg.whatsapp_alerts_enabled!==true) return json({ok:true,sent:0,reason:'WhatsApp alerts disabled'});
    const to=String(cfg.whatsapp_alert_number||'').replace(/\D/g,'');
    if(!to) return json({ok:false,sent:0,error:'No WhatsApp alert number is configured in Settings.'},400);
    const {data:candidates,error:ce}=await admin.rpc('get_whatsapp_service_alert_candidates');
    if(ce) return json({error:ce.message},500);
    const tokenMeta=Deno.env.get('META_WHATSAPP_ACCESS_TOKEN')||Deno.env.get('WHATSAPP_ACCESS_TOKEN');
    const phoneId=Deno.env.get('META_WHATSAPP_PHONE_NUMBER_ID')||Deno.env.get('WHATSAPP_PHONE_NUMBER_ID');
    if(!tokenMeta||!phoneId) return json({ok:false,configured:false,sent:0,error:'Meta WhatsApp credentials are not configured on the Edge Function server.'});
    const version=Deno.env.get('META_GRAPH_VERSION')||'v23.0';
    const send=(message:string)=>fetch(`https://graph.facebook.com/${version}/${phoneId}/messages`,{method:'POST',headers:{Authorization:`Bearer ${tokenMeta}`,'Content-Type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',to,type:'text',text:{preview_url:false,body:message}})});
    let sent=0; const results:any[]=[];
    for(const m of (candidates||[])){
      const {data:latestService}=await admin.from('services').select('service_date,created_at,hour_reading').eq('machine_id',m.machine_id).order('service_date',{ascending:false}).order('created_at',{ascending:false}).limit(1).maybeSingle();
      const {data:previousAlert}=await admin.from('audit_log').select('created_at').eq('action','whatsapp_service_hours_alert_sent').eq('entity_type','machine').eq('entity_id',m.machine_id).order('created_at',{ascending:false}).limit(1).maybeSingle();
      if(previousAlert&&(!latestService?.created_at||new Date(previousAlert.created_at)>=new Date(latestService.created_at))){results.push({machine_id:m.machine_id,skipped:'already alerted for current service cycle'});continue;}
      const message=`PHATSEMA FLEET SERVICE ALERT\n\nMachine: ${m.machine_name}\nFleet ID: ${m.fleet_id||''}\nCurrent hours: ${m.current_hours}\nService due at: ${m.service_due_hours} hours\nAlert threshold: ${m.alert_at_hours} hours\n\nThe machine has reached its configured service warning threshold. Please arrange service in Phatsema Fleet Operations.`;
      const response=await send(message); const out=await response.json().catch(()=>({}));
      if(!response.ok){results.push({machine_id:m.machine_id,sent:false,error:out?.error?.message||'WhatsApp API rejected the message'});continue;}
      await admin.from('audit_log').insert({actor_id:null,action:'whatsapp_service_hours_alert_sent',entity_type:'machine',entity_id:m.machine_id,details:{recipient_last4:to.slice(-4),current_hours:m.current_hours,alert_at_hours:m.alert_at_hours,service_due_hours:m.service_due_hours}});
      sent++;results.push({machine_id:m.machine_id,sent:true,message_id:out?.messages?.[0]?.id||null});
    }
    return json({ok:true,configured:true,recipient_last4:to.slice(-4),sent,checked:(candidates||[]).length,results});
  }catch(e){return json({error:e instanceof Error?e.message:'WhatsApp service alert failed.'},400);}
});