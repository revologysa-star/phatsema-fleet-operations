"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const root=path.join(__dirname,"..");
const source=fs.readFileSync(path.join(root,"app.js"),"utf8");
const sql=fs.readFileSync(path.join(root,"supabase","migrations","20261026_head_full_audit_export.sql"),"utf8");
const styles=fs.readFileSync(path.join(root,"styles.css"),"utf8");
function sandbox(){
 const context={
  document:{readyState:"loading",addEventListener(){},getElementById(){return null},querySelectorAll(){return []}},
  window:{addEventListener(){}},localStorage:{getItem(){return null},setItem(){}},
  Date,Promise,console,setTimeout(){},setInterval(){},clearInterval(){}
 };
 vm.createContext(context);
 vm.runInContext(source,context,{filename:"app.js",timeout:3000});
 const run=code=>vm.runInContext(code,context,{timeout:3000});
 run("S.p={role:'head_of_operations',active:true};S.user={id:'head'}");
 return {run,context};
}
const makeRow=i=>({id:i,actor_id:"employee-"+(i%4),actor_name:"Operator "+i,actor_role:"assistant_mechanic",
 action:"machine_updated",entity_type:"machine",entity_id:"machine-"+i,
 details:{hours:i,change:"reading corrected"},created_at:"2026-10-26T12:00:00Z"});
test("audit download actions appear only for the active Head of Operations",()=>{
 const e=sandbox();
 const head=e.run("audit()");
 assert.match(head,/Download full audit log \(CSV\)/);
 assert.match(head,/Print full report \/ Save PDF/);
 assert.match(head,/entire available history/);
 e.run("S.p={role:'foreman',active:true}");
 assert.doesNotMatch(e.run("audit()"),/auditExportCSV/);
 e.run("S.p={role:'head_of_operations',active:false}");
 assert.doesNotMatch(e.run("audit()"),/auditExportCSV/);
});
test("full audit export fetches all rows over three cursor pages without truncating at 100",async()=>{
 const e=sandbox(),all=Array.from({length:1123},(_,i)=>makeRow(i+1)),calls=[];
 e.context.stub={
  rpc:async(name,args)=>{
   calls.push({name,args});
   if(name==="audit_export_snapshot")return {data:[{entry_count:1123,snapshot_max_id:1123}],error:null};
   if(name==="audit_export_page"){
    const after=args.p_after_id;
    return {data:all.filter(x=>x.id>after&&x.id<=args.p_snapshot_max_id).slice(0,args.p_limit),error:null};
   }
   throw Error("Unexpected RPC: "+name);
  }
 };
 e.run("db=stub");
 const result=await e.run("fetchCompleteAuditHistory()");
 assert.equal(result.rows.length,1123);
 assert.equal(result.rows[0].id,1);
 assert.equal(result.rows[1122].id,1123);
 assert.deepEqual(calls.filter(c=>c.name==="audit_export_page").map(c=>c.args.p_after_id),[0,500,1000]);
 assert.equal(calls.some(c=>c.name==="audit_export_snapshot"),true);
});
test("partial pagination errors abort and cannot create a partial report",async()=>{
 const e=sandbox();let n=0;
 e.context.stub={rpc:async name=>{
   if(name==="audit_export_snapshot")return {data:[{entry_count:600,snapshot_max_id:600}],error:null};
   n++;
   if(n===1)return {data:Array.from({length:500},(_,i)=>makeRow(i+1)),error:null};
   return {data:null,error:{message:"Network interrupted"}};
 }};
 e.run("db=stub");
 await assert.rejects(e.run("fetchCompleteAuditHistory()"),/Network interrupted/);
});
test("foreman and disabled Head cannot request full audit export from app",async()=>{
 const e=sandbox();
 e.run("S.p={role:'foreman',active:true}");
 await assert.rejects(e.run("fetchCompleteAuditHistory()"),/Only the Head of Operations/);
 e.run("S.p={role:'head_of_operations',active:false}");
 await assert.rejects(e.run("fetchCompleteAuditHistory()"),/Only the Head of Operations/);
});
test("CSV export contains all details and protects Excel formulas",()=>{
 const e=sandbox();
 const line={...makeRow(1),actor_name:"=HYPERLINK(1)",action:"manual_status",details:{notes:"<img src=x onerror=alert(1)>",before:{hours:12},after:{hours:15}}};
 e.context.rowToExport=line;
 const csv=e.run("auditExportCSV([rowToExport])");
 assert.match(csv,/Audit ID/);
 assert.match(csv,/"'=HYPERLINK\(1\)"/);
 assert.match(csv,/onerror=alert\(1\)/);
 assert.match(csv,/before/);
 assert.match(csv,/after/);
 assert.ok(csv.charCodeAt(0)===65279);
});
test("printable complete PDF report escapes HTML/script in audit details",()=>{
 const e=sandbox();
 e.context.rowToPrint={...makeRow(2),actor_name:"<script>alert(1)</script>",details:{bad:"<img src=x onerror=alert(1)>"}};
 const page=e.run("auditFullPrintHTML([rowToPrint],{entry_count:1,snapshot_max_id:2})");
 assert.match(page,/Complete audit log report/);
 assert.match(page,/&lt;script&gt;/);
 assert.match(page,/&lt;img src=x/);
 assert.doesNotMatch(page,/<script>alert\(1\)<\/script>/);
 assert.match(page,/Snapshot through record/);
});
test("backend export and export-event RPCs independently verify active Head role",()=>{
 assert.equal((sql.match(/role::text\s*=\s*'head_of_operations'/g)||[]).length,3);
 assert.equal((sql.match(/p\.active IS TRUE/g)||[]).length,3);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.audit_export_snapshot\(\) FROM PUBLIC, anon/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.audit_export_page\(bigint,bigint,integer\) FROM PUBLIC, anon/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.record_audit_export\(text,bigint,bigint\)/);
 assert.match(sql,/a\.id > p_after_id[\s\S]+a\.id <= p_snapshot_max_id/);
 assert.match(sql,/audit_export_prepared/);
});
test("audit report has mobile-friendly controls and print-only full table",()=>{
 assert.match(styles,/\.audit-top-actions/);
 assert.match(styles,/\.audit-print-container/);
 assert.match(styles,/@media print/);
 assert.match(styles,/\.audit-print-table thead\{display:table-header-group\}/);
});
