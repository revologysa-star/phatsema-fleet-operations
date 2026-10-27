"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const app=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");

function fixture(){
 const els={
  aud:{innerHTML:""},
  auditCount:{textContent:""},
  auditSearch:{value:""},
  auditAction:{value:""}
 };
 const ctx={
  document:{readyState:"loading",addEventListener(){},getElementById:id=>els[id]||null,querySelectorAll(){return[]}},
  window:{addEventListener(){}},console,Date,Promise,setTimeout(){},setInterval(){},
  localStorage:{getItem(){return null},setItem(){}}
 };
 vm.createContext(ctx);
 vm.runInContext(app,ctx,{filename:"app.js",timeout:3000});
 const run=expr=>vm.runInContext(expr,ctx,{timeout:3000});
 run('S.m=[{id:"active-uuid",name:"Dump Truck DT01",active:true}];S.people=[];S.auditMachineNames={};');
 return {run,ctx,els};
}
test("direct machine changes show the machine name instead of a database UUID",()=>{
 const f=fixture();
 f.ctx.event={entity_type:"machine",entity_id:"active-uuid",details:{from:"working",to:"breakdown"},action:"machine_status_changed"};
 assert.equal(f.run("auditMachine(event)"),"Dump Truck DT01");
 assert.equal(f.run("auditMachineId(event)"),"active-uuid");
});
test("breakdown and service events resolve details.machine_id, never their entity ID",()=>{
 const f=fixture();
 f.ctx.breakdown={entity_type:"breakdown",entity_id:"breakdown-row-id",
  details:{machine_id:"active-uuid",reason:"engine"},action:"breakdown_recorded"};
 f.ctx.service={entity_type:"service",entity_id:"service-row-id",
  details:{machine_id:"active-uuid",work:"Oil change"},action:"service_recorded"};
 assert.equal(f.run("auditMachine(breakdown)"),"Dump Truck DT01");
 assert.equal(f.run("auditMachine(service)"),"Dump Truck DT01");
 assert.match(f.run("auditDetail(breakdown)"),/Machine: Dump Truck DT01/);
 assert.doesNotMatch(f.run("auditDetail(service)"),/Machine Id: active-uuid/);
});
test("history from retired machines loads names read-only and caches them",async()=>{
 const f=fixture();const calls=[];
 f.ctx.client={from(table){assert.equal(table,"machines");return{
  select(fields){calls.push(["select",fields]);assert.equal(fields,"id,name");return this},
  async in(field,ids){calls.push(["in",field,Array.from(ids)]);return{data:[{id:"retired-uuid",name:"Retired Excavator E5"}],error:null}}
 }}};
 f.run("db=client");
 const entries=[{entity_type:"breakdown",entity_id:"brk-1",details:{machine_id:"retired-uuid"}}];
 f.ctx.entries=entries;
 await f.run("loadAuditMachineNames(entries)");
 assert.equal(f.run("auditMachine(entries[0])"),"Retired Excavator E5");
 await f.run("loadAuditMachineNames(entries)");
 assert.equal(calls.filter(x=>x[0]==="in").length,1);
 assert.deepEqual(calls[1],["in","id",["retired-uuid"]]);
});
test("missing machine rows leave an honest ID fallback, no guessing",async()=>{
 const f=fixture();
 f.ctx.client={from(){return{select(){return this},async in(){return{data:[],error:null}}}}};
 f.ctx.event={entity_type:"breakdown",entity_id:"breakdown-55",
  details:{machine_id:"deleted-uuid",reason:"Engine"},action:"report_breakdown"};
 f.run("db=client");
 await f.run("loadAuditMachineNames([event])");
 assert.equal(f.run("auditMachine(event)"),null);
 assert.match(f.run("auditDetail(event)"),/Machine: deleted-uuid/);
});
test("machine names remain searchable in the last 100 audit events",()=>{
 const f=fixture();
 f.ctx.entry={entity_type:"service",entity_id:"service-22",actor_id:null,
   details:{machine_id:"active-uuid",work:"Oil filter"},action:"service_recorded",created_at:"2026-10-27T07:00:00Z"};
 f.run("S.audit=[entry]");
 f.els.auditSearch.value="dump truck";
 f.run("renderAudit()");
 assert.match(f.els.aud.innerHTML,/Dump Truck DT01/);
 assert.doesNotMatch(f.els.aud.innerHTML,/No audit entries found/);
});
test("CSV and printable reports display machine names while preserving raw IDs and JSON",()=>{
 const f=fixture();
 f.ctx.entry={id:12,created_at:"2026-10-27T08:00:00Z",actor_name:"Manager",
   actor_role:"head_of_operations",actor_id:"actor-uuid",action:"report_breakdown",
   entity_type:"breakdown",entity_id:"breakdown-row",details:{machine_id:"active-uuid",reason:"Broken"}}; 
 const csv=f.run("auditExportCSV([entry])");
 assert.match(csv,/Machine name/);
 assert.match(csv,/Dump Truck DT01/);
 assert.match(csv,/active-uuid/);
 assert.match(csv,/breakdown-row/);
 const pdf=f.run("auditFullPrintHTML([entry],{entry_count:1,snapshot_max_id:12})");
 assert.match(pdf,/Dump Truck DT01/);
 assert.match(pdf,/breakdown-row/);
});
test("machine names are HTML-escaped in the audit list and printable export",()=>{
 const f=fixture();
 f.run('S.m=[{id:"active-uuid",name:"<img src=x onerror=alert(1)>"}]');
 f.ctx.entry={id:3,action:"log_service",entity_type:"service",entity_id:"service",
   details:{machine_id:"active-uuid"},created_at:"2026-10-27T07:00:00Z"};
 f.run("S.audit=[entry]");
 f.run("renderAudit()");
 assert.match(f.els.aud.innerHTML,/&lt;img/);
 assert.doesNotMatch(f.els.aud.innerHTML,/<img/);
 const html=f.run("auditFullPrintHTML([entry],{entry_count:1,snapshot_max_id:3})");
 assert.match(html,/&lt;img/);
 assert.doesNotMatch(html,/<img/);
});


test("authenticated actor names appear next to the machine and details in audit entries",()=>{
 const f=fixture();
 f.run('S.people=[{id:"employee-27",full_name:"Nomsa Dlamini",role:"foreman"}]');
 f.ctx.entry={id:21,actor_id:"employee-27",action:"machine_status_changed",
  entity_type:"machine",entity_id:"active-uuid",created_at:"2026-10-27T19:00:00Z",
  details:{from:"working",to:"breakdown"}};
 f.run("S.audit=[entry]");
 f.run("renderAudit()");
 assert.match(f.els.aud.innerHTML,/By Nomsa Dlamini/);
 assert.match(f.els.aud.innerHTML,/Dump Truck DT01/);
 assert.match(f.els.aud.innerHTML,/Status Working.*Breakdown/);
 assert.doesNotMatch(f.els.aud.innerHTML,/By System/);
});

test("an actor ID never silently becomes System when profile lookup is unavailable",()=>{
 const f=fixture();
 f.ctx.entry={actor_id:"some-employee-uuid",action:"report_breakdown",details:{}};
 assert.equal(f.run("auditActor(entry.actor_id,entry)"),"Employee (ID some-emp)");
 assert.doesNotMatch(f.run("auditActor(entry.actor_id,entry)"),/System/);
});

test("historical null actor IDs remain explicitly unattributed; certified automation can say System",()=>{
 const f=fixture();
 f.ctx.unknown={actor_id:null,action:"machine_updated",details:{}};
 f.ctx.automation={actor_id:null,action:"scheduled_update",details:{automated:true}};
 assert.equal(f.run("auditActor(unknown.actor_id,unknown)"),"Unattributed (no user recorded)");
 assert.equal(f.run("auditActor(automation.actor_id,automation)"),"System (automated)");
});

test("resolves missing employee names through read-only profiles lookup without changing audit rows",async()=>{
 const f=fixture();
 const calls=[];
 f.ctx.client={from(table){assert.equal(table,"profiles");return{
  select(cols){calls.push(["select",cols]);return this},
  async in(field,ids){calls.push(["in",field,Array.from(ids)]);
   return {data:[{id:"historic-user",full_name:"Kabelo Ndlovu",username:"kn"}],error:null}
  }
 }}};
 f.run("db=client");
 f.ctx.events=[{actor_id:"historic-user",details:{}}];
 await f.run("loadAuditActorNames(events)");
 assert.equal(f.run("auditActor(events[0].actor_id,events[0])"),"Kabelo Ndlovu");
 await f.run("loadAuditActorNames(events)");
 assert.equal(calls.filter(a=>a[0]==="in").length,1);
});

test("complete CSV/PDF audits use real employee names and do not falsely attribute missing actors",()=>{
 const f=fixture();
 f.run('S.people=[{id:"worker-1",full_name:"Thabo Mokoena",username:"tm"}]');
 f.ctx.events=[
  {id:1,actor_id:"worker-1",actor_name:"System",action:"machine_updated",entity_type:"machine",
   entity_id:"active-uuid",details:{before:{status:"working"},after:{status:"breakdown"}}},
  {id:2,actor_id:null,actor_name:"System",action:"machine_updated",entity_type:"machine",
   entity_id:"active-uuid",details:{reason:"No reliable actor"}}
 ];
 const csv=f.run("auditExportCSV(events)");
 assert.match(csv,/Thabo Mokoena/);
 assert.match(csv,/Unattributed \(no user recorded\)/);
 assert.doesNotMatch(csv,/,System,/);
 const html=f.run("auditFullPrintHTML(events,{entry_count:2,snapshot_max_id:2})");
 assert.match(html,/Thabo Mokoena/);
 assert.match(html,/Unattributed \(no user recorded\)/);
});
