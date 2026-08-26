import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
Deno.serve(async (req) => {
  try {
    const auth = req.headers.get('Authorization') || '';
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {global:{headers:{Authorization:auth}}});
    const {data:{user}} = await userClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({error:'Authentication required.'}),{status:401,headers:{'Content-Type':'application/json'}});
    const {data:actor} = await admin.from('profiles').select('role,active').eq('id',user.id).single();
    if (!actor?.active || !['operations_manager','head_of_operations'].includes(actor.role)) return new Response(JSON.stringify({error:'Management permission required.'}),{status:403,headers:{'Content-Type':'application/json'}});
    const body = await req.json();
    if (body.action === 'create') {
      if (!body.email || !body.password || !body.username || !body.full_name) throw new Error('Name, username, email and password are required.');
      const {data:created,error:e} = await admin.auth.admin.createUser({email:body.email,password:body.password,email_confirm:true});
      if (e) throw e;
      const {error:p} = await admin.from('profiles').insert({id:created.user.id,email:body.email,username:body.username.trim(),full_name:body.full_name.trim(),role:body.role,active:body.active!==false});
      if (p) { await admin.auth.admin.deleteUser(created.user.id); throw p; }
      await admin.from('audit_log').insert({actor_id:user.id,action:'create_user',entity_type:'profile',entity_id:created.user.id,details:{username:body.username,role:body.role}});
      return new Response(JSON.stringify({ok:true}),{headers:{'Content-Type':'application/json'}});
    }
    if (body.action === 'update') {
      if (!body.user_id) throw new Error('User ID required.');
      const patch:any={email:body.email,username:body.username.trim(),full_name:body.full_name.trim(),role:body.role,active:body.active!==false,updated_at:new Date().toISOString()};
      const {error:p} = await admin.from('profiles').update(patch).eq('id',body.user_id); if(p) throw p;
      if (body.password) { const {error:e}=await admin.auth.admin.updateUserById(body.user_id,{password:body.password,email:body.email}); if(e) throw e; }
      else { const {error:e}=await admin.auth.admin.updateUserById(body.user_id,{email:body.email}); if(e) throw e; }
      await admin.from('audit_log').insert({actor_id:user.id,action:'update_user',entity_type:'profile',entity_id:body.user_id,details:{username:body.username,role:body.role,active:body.active}});
      return new Response(JSON.stringify({ok:true}),{headers:{'Content-Type':'application/json'}});
    }
    throw new Error('Unsupported action.');
  } catch (e) { return new Response(JSON.stringify({error:e instanceof Error?e.message:'User operation failed.'}),{status:400,headers:{'Content-Type':'application/json'}}); }
});
