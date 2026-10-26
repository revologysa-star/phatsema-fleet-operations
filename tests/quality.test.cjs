"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const source=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");
const styles=fs.readFileSync(path.join(__dirname,"..","styles.css"),"utf8");

function appSandbox(){
 const document={
  readyState:"loading",
  addEventListener(){},
  getElementById(){return null},
  querySelectorAll(){return []}
 };
 const context={
  window:{addEventListener(){}},
  document,localStorage:{getItem(){return null},setItem(){}},
  Date,Promise,console,FormData:class FakeFormData{},
  setTimeout(){},setInterval(){},clearInterval(){}
 };
 vm.createContext(context);
 vm.runInContext(source,context,{filename:"app.js",timeout:3000});
 return {context,run:code=>vm.runInContext(code,context,{timeout:3000})};
}
function resetState(env,fixtures){
 env.run("S.m="+JSON.stringify(fixtures.m||[])+";"+
  "S.b="+JSON.stringify(fixtures.b||[])+";"+
  "S.s="+JSON.stringify(fixtures.s||[])+";"+
  "S.people="+JSON.stringify(fixtures.people||[])+";"+
  "S.p="+JSON.stringify(fixtures.profile||{role:"head_of_operations",active:true})+";"+
  "S.user="+JSON.stringify(fixtures.user||{id:"head"})+";"+
  "S.grants="+JSON.stringify(fixtures.grants||[])+";");
}

test("dashboard reports real fleet counts and actionable drilldowns",()=>{
 const env=appSandbox();
 const machines=Array.from({length:100},(_,i)=>({
  id:"machine-"+i,name:"Machine "+i,fleet_id:"PH-"+i,
  status:i===0?"breakdown":"working",active:true,hours:100,
  next_service_hours:200,service_warning_hours:50
 }));
 resetState(env,{m:machines,b:[{id:"fault-1",machine_id:"machine-0",reason:"Hydraulic",resolved_at:null,started_at:"2026-10-25T08:00:00Z"}]});
 const metrics=env.run("metrics()");
 assert.equal(metrics.total,100);
 assert.equal(metrics.working,99);
 assert.equal(metrics.breakdown,1);
 assert.equal(metrics.workingPct,99);
 const html=env.run("dash()");
 assert.match(html,/Fleet command centre/);
 assert.match(html,/99\.0%/);
 assert.match(html,/data-state="working"/);
 assert.match(html,/data-filter-breakdowns="true"/);
 assert.match(html,/id="quickBreakdown"/);
 assert.match(html,/id="quickService"/);
 assert.match(html,/Next services/);
 assert.match(html,/Hydraulic/);
});
test("dashboard escapes user-provided breakdown reasons",()=>{
 const env=appSandbox();
 resetState(env,{m:[{id:"m",name:"Machine",fleet_id:"1",status:"breakdown",active:true,hours:20}],
 b:[{id:"b",machine_id:"m",reason:"<img src=x onerror=alert(1)>",started_at:"2026-10-25T08:00:00Z"}]});
 const html=env.run("dash()");
 assert.doesNotMatch(html,/<img src=x/);
 assert.match(html,/&lt;img src=x/);
});
test("service-schedule computation handles due, soon and future services",()=>{
 const env=appSandbox();
 const overdue=env.run("serviceSchedule({hours:600,next_service_hours:590,service_warning_hours:50})");
 assert.equal(overdue.due,true);
 const soon=env.run("serviceSchedule({hours:480,next_service_hours:500,service_warning_hours:40})");
 assert.equal(soon.due,false);
 assert.equal(soon.soon,true);
 const clear=env.run("serviceSchedule({hours:100,next_service_hours:700,service_warning_hours:50})");
 assert.equal(clear.due,false);
 assert.equal(clear.soon,false);
});
test("breakdown and service searches survive full re-renders",()=>{
 const env=appSandbox();
 resetState(env,{m:[{id:"m1",name:"Excavator",fleet_id:"PH-01",active:true,status:"working"}],
  b:[{id:"b1",machine_id:"m1",reason:"Hydraulic pump",started_at:"2026-10-25T08:00:00Z"},
     {id:"b2",machine_id:"m1",reason:"Electrical fault",started_at:"2026-10-25T09:00:00Z"}],
  s:[{id:"s1",machine_id:"m1",work_completed:"Oil and filters",hour_reading:120},
     {id:"s2",machine_id:"m1",work_completed:"Track repairs",hour_reading:140}]
 });
 env.run('S.breakdownSearch="hydraulic"; S.serviceSearch="oil";');
 const b=env.run("breakdowns()");
 assert.match(b,/Hydraulic pump/);
 assert.doesNotMatch(b,/Electrical fault/);
 assert.match(b,/value="hydraulic"/);
 const s=env.run("services()");
 assert.match(s,/Oil and filters/);
 assert.doesNotMatch(s,/Track repairs/);
 assert.match(s,/value="oil"/);
});
test("temporary permissions stay scoped and are not granted by UI",()=>{
 const env=appSandbox();
 resetState(env,{
  profile:{id:"worker",role:"assistant_mechanic",active:true},
  user:{id:"worker"},
  grants:[{id:"g",user_id:"worker",permission:"correct_hours",revoked_at:null,expires_at:new Date(Date.now()+3600000).toISOString()}]
 });
 assert.equal(env.run("canCorrectHours()"),true);
 assert.equal(env.run("canNextService()"),false);
 assert.equal(env.run("canFleetManage()"),false);
 env.run('S.grants[0].revoked_at=new Date().toISOString();');
 assert.equal(env.run("canCorrectHours()"),false);
});
test("form submit handler prevents duplicate saves",async()=>{
 const env=appSandbox();
 const save={disabled:false,textContent:"Save"};
 const feedback={textContent:""};
 const first={focus(){}};
 const form={querySelector(selector){
  if(selector==='button[type="submit"]')return save;
  if(selector==='input:not([disabled]),select,textarea')return first;
  return null;
 },onsubmit:null};
 const root={innerHTML:"",querySelector(){return {addEventListener(){}}}};
 const cancel={onclick:null};
 const doc=env.context.document;
 doc.getElementById=id=>({
  modalRoot:root,mf:form,modalFeedback:feedback,cancel
 })[id]||null;
 let calls=0;
 let release;
 const pending=new Promise(resolve=>{release=resolve});
 env.context.testSave=async()=>{calls++;await pending};
 env.run('modal("Test","<input name=\"reason\">",testSave)');
 const ev={preventDefault(){}};
 const p1=form.onsubmit(ev),p2=form.onsubmit(ev);
 assert.equal(calls,1);
 assert.equal(save.disabled,true);
 release();
 await Promise.all([p1,p2]);
 assert.equal(calls,1);
 assert.equal(save.disabled,false);
});
test("failed machine query retains previous fleet and shows a visible error",async()=>{
 const env=appSandbox();
 const errorBanner={textContent:"",setAttribute(){}};
 env.context.document.getElementById=id=>id==="loadErr"?errorBanner:null;
 env.run("render=()=>{}");
 const originals=[{id:"old",name:"Preserved Machine",status:"working",active:true,hours:22}];
 resetState(env,{m:originals});
 const results={
  machines:{data:null,error:{message:"permission denied"}},
  breakdowns:{data:[],error:null},
  services:{data:[],error:null},
  service_photos:{data:[],error:null},
  profiles:{data:[],error:null},
  app_settings:{data:[],error:null},
  machine_production_clocks:{data:[],error:null},
  temporary_access_grants:{data:[],error:null}
 };
 env.context.mockDatabase={from(table){
  return {select(){return this},eq(){return this},order(){return this},
   then(resolve,reject){return Promise.resolve(results[table]).then(resolve,reject)}};
 },storage:{from(){return {createSignedUrl:async()=>({data:{signedUrl:"https://example.invalid"}})}}}};
 env.run("db=mockDatabase");
 await env.run("load()");
 assert.equal(env.run("S.m.length"),1);
 assert.equal(env.run("S.m[0].name"),"Preserved Machine");
 assert.match(errorBanner.textContent,/permission denied/);
 assert.equal(env.run("S.loadErrors.length"),1);
 results.machines={data:[{id:"new",name:"Fetched Machine",status:"available",active:true,hours:10}],error:null};
 await env.run("load()");
 assert.equal(env.run("S.m[0].name"),"Fetched Machine");
 assert.equal(env.run("S.loadErrors.length"),0);
 assert.equal(typeof env.run("S.lastLoadedAt"),"string");
});
test("phone card layouts and dark mode styling exist",()=>{
 assert.match(styles,/\.ops-cards-table tbody tr/);
 assert.match(styles,/\.ops-fleet-table td:nth-child\(4\)::before/);
 assert.match(styles,/\.ops-dashboard/);
 assert.match(styles,/body\.dark \.ops-kpi/);
 assert.match(styles,/prefers-reduced-motion/);
});
