import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
Deno.serve(async (req) => {
  try {
    const auth = req.headers.get('Authorization') || '';
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {global:{headers:{Authorization:auth}}});
    const {data:{user}} = await supabase.auth.getUser();
    if (!user) return new Response(JSON.stringify({error:'Authentication required.'}),{status:401,headers:{'Content-Type':'application/json'}});
    const {breakdown_id} = await req.json();
    const {data:b,error:e}=await supabase.from('breakdowns').select('*, machines(name,fleet_id)').eq('id',breakdown_id).single(); if(e) throw e;
    const {data:settings}=await supabase.from('app_settings').select('*').in('key',['whatsapp_alert_number','whatsapp_alerts_enabled']);
    const cfg=Object.fromEntries((settings||[]).map(x=>[x.key,x.value]));
    if(cfg.whatsapp_alerts_enabled===false) throw new Error('WhatsApp alerts are disabled in Settings.');
    const to=String(cfg.whatsapp_alert_number||'').replace(/\D/g,''); if(!to) throw new Error('Configure the WhatsApp alert number in Settings.');
    const token=Deno.env.get('WHATSAPP_ACCESS_TOKEN'); const phoneId=Deno.env.get('WHATSAPP_PHONE_NUMBER_ID');
    if(!token||!phoneId) throw new Error('WhatsApp API is not configured. Add WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID to the Edge Function secrets.');
    const text=`PHATSEMA FLEET ALERT\n\nMachine: ${b.machines?.name||'Machine'}\nFleet ID: ${b.machines?.fleet_id||''}\nIssue: ${b.reason}\nReported: ${new Date(b.started_at).toLocaleString()}\n\nPlease review the breakdown in Phatsema Fleet Operations.`;
    const resp=await fetch(`https://graph.facebook.com/v23.0/${phoneId}/messages`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',to,type:'text',text:{body:text}})});
    const out=await resp.json(); if(!resp.ok) throw new Error(out?.error?.message||'WhatsApp API request failed.');
    await supabase.from('audit_log').insert({actor_id:user.id,action:'whatsapp_alert_sent',entity_type:'breakdown',entity_id:breakdown_id,details:{to}});
    return new Response(JSON.stringify({ok:true,message_id:out?.messages?.[0]?.id||null}),{headers:{'Content-Type':'application/json'}});
  } catch(e){return new Response(JSON.stringify({error:e instanceof Error?e.message:'WhatsApp send failed.'}),{status:400,headers:{'Content-Type':'application/json'}})}
});
