"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const edgeSource=fs.readFileSync(path.join(__dirname,"..","supabase","functions","employee-management-v1","index.ts"),"utf8").replace(/^import\s+.*;\s*$/gm,"");
const clientSource=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");
const employee={first_name:"Thabo",surname:"Mokoena",email:"test.person@example.com",username:"thabo.m",role:"assistant_mechanic",mode:"invite",whatsapp_number:"+27 82 123 4567"};
function setup(options={}){
 let handler;
 const calls={invites:[],creates:[],profiles:[],audits:[],deletes:[]};
 const backend={
  auth:{
   getUser:async()=>({data:{user:options.unauthenticated?null:{id:"head-id"}},error:options.unauthenticated?{message:"Invalid"}:null}),
   admin:{
    inviteUserByEmail:async(email,opts)=>{calls.invites.push({email,opts});return options.mailError?{error:{status:429,message:"email rate limit"}}:{data:{user:{id:"new-user"}}}},
    createUser:async(payload)=>{calls.creates.push(payload);return {data:{user:{id:"new-user"}}}},
    deleteUser:async(id)=>{calls.deletes.push(id);return {error:null}}
   }
  },
  from(table){
   const b={
    select(){return b},
    eq(){return b},
    limit:async()=>({data:options.duplicate?[{id:"exists"}]:[],error:null}),
    maybeSingle:async()=>({data:{role:options.role||"head_of_operations",active:options.active!==false},error:null}),
    update(value){calls.profiles.push(value);return b},
    single:async()=>options.profileError?{data:null,error:{message:"conflict"}}:{data:{id:"new-user"},error:null},
    insert:async(value)=>{calls.audits.push(value);return {error:options.auditError?{message:"auditing failed"}:null}}
   };
   return b;
  }
 };
 const Deno={env:{get:k=>k==="SUPABASE_URL"?"https://example.invalid":k==="SUPABASE_SERVICE_ROLE_KEY"?"fixture":null},serve:callback=>handler=callback};
 vm.runInNewContext(edgeSource,{Deno,createClient:()=>backend,Response,Request,Date,console},{timeout:3000});
 return {calls,handler};
}
async function send(env,payload=employee,authorized=true){
 const response=await env.handler(new Request("https://example.invalid/functions/v1/employee-management-v1",{
  method:"POST",headers:authorized?{Authorization:"Bearer example-jwt"}:{},
  body:JSON.stringify(payload)
 }));
 return {status:response.status,data:await response.json()};
}
test("unauthenticated or non-Head employees cannot create accounts",async()=>{
 for(const scenario of [{unauthenticated:true},{role:"foreman"},{role:"operations_manager"},{active:false}]){
  const env=setup(scenario);const response=await send(env);
  assert.ok([401,403].includes(response.status));
  assert.equal(env.calls.invites.length,0);
  assert.equal(env.calls.creates.length,0);
 }
 const env=setup();assert.equal((await send(env,employee,false)).status,401);
});
test("valid invitation creates profile and audit without revealing a password",async()=>{
 const env=setup();const response=await send(env);
 assert.equal(response.status,201);
 assert.equal(response.data.ok,true);
 assert.equal(env.calls.invites.length,1);
 assert.equal(env.calls.invites[0].opts.data.username,"thabo.m");
 assert.equal(env.calls.profiles[0].role,"assistant_mechanic");
 assert.equal(env.calls.profiles[0].full_access,false);
 assert.equal(env.calls.audits[0].action,"create_user");
 assert.equal("password" in response.data,false);
});
test("privileged role and duplicate username are refused",async()=>{
 const env=setup();assert.equal((await send(env,{...employee,role:"head_of_operations"})).status,400);
 assert.equal(env.calls.invites.length,0);
 const duplicate=setup({duplicate:true});
 assert.equal((await send(duplicate)).status,409);
 assert.equal(duplicate.calls.invites.length,0);
});
test("temporary passwords require 12 characters; no password returned",async()=>{
 const env=setup();
 assert.equal((await send(env,{...employee,mode:"temporary_password",password:"notstrong"})).status,400);
 const result=await send(env,{...employee,mode:"temporary_password",password:"LongGeneratedPassword!2026"});
 assert.equal(result.status,201);
 assert.equal(env.calls.creates.length,1);
 assert.equal(result.data.password,undefined);
});
test("email failures and incomplete account setup return errors",async()=>{
 const mail=setup({mailError:true});assert.equal((await send(mail)).status,429);
 const profile=setup({profileError:true});assert.equal((await send(profile)).status,409);
 assert.equal(profile.calls.deletes.length,1);
 const audit=setup({auditError:true});assert.equal((await send(audit)).status,500);
 assert.equal(audit.calls.deletes.length,1);
});
test("Add Employee button only appears for active Head of Operations",()=>{
 const document={readyState:"loading",addEventListener(){},getElementById(){return null},querySelectorAll(){return []}};
 const ctx={document,window:{addEventListener(){}},Date,Promise,console,
  localStorage:{getItem(){return null},setItem(){}},setTimeout(){},setInterval(){}};
 vm.createContext(ctx);vm.runInContext(clientSource,ctx,{timeout:3000});
 vm.runInContext('S.people=[];S.p={role:"head_of_operations",active:true};',ctx);
 assert.match(vm.runInContext("people()",ctx),/id="addEmployee"/);
 vm.runInContext('S.p={role:"foreman",active:true};',ctx);
 assert.doesNotMatch(vm.runInContext("people()",ctx),/id="addEmployee"/);
 vm.runInContext('S.p={role:"head_of_operations",active:false};',ctx);
 assert.doesNotMatch(vm.runInContext("people()",ctx),/id="addEmployee"/);
});
