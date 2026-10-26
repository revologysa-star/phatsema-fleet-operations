"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const source=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");
const sql=fs.readFileSync(path.join(__dirname,"..","supabase","migrations","20261026_operations_workflow_hardening.sql"),"utf8");
const styles=fs.readFileSync(path.join(__dirname,"..","styles.css"),"utf8");
function app(){
 const document={readyState:"loading",addEventListener(){},getElementById(){return null},querySelectorAll(){return []}};
 const context={window:{addEventListener(){}},document,Date,Promise,console,
 localStorage:{getItem(){return null},setItem(){}},setTimeout(){},setInterval(){},clearInterval(){}};
 vm.createContext(context);
 vm.runInContext(source,context,{timeout:3000});
 return {run:s=>vm.runInContext(s,context,{timeout:3000})};
}
test("management report separates current status from recorded period downtime",()=>{
 const a=app();
 a.run('S.p={role:"head_of_operations",active:true};S.user={id:"boss"};'+
 'S.m=[{id:"A",name:"Excavator 1",fleet_id:"EX-1",hours:125,status:"working",active:true},'+
 '{id:"B",name:"Truck 2",fleet_id:"DT-2",hours:800,status:"breakdown",active:true}];'+
 'S.b=[{id:"one",machine_id:"A",started_at:"2026-10-01T08:00:00Z",resolved_at:"2026-10-01T10:00:00Z",reason:"Engine"},'+
 '{id:"two",machine_id:"B",started_at:"2026-10-25T08:00:00Z",resolved_at:null,reason:"Hydraulic"}];'+
 'S.s=[{machine_id:"A",service_date:"2026-10-10T11:00:00Z",work_completed:"Inspection"}];');
 const info=JSON.parse(a.run('JSON.stringify(reportModel(30,Date.parse("2026-10-26T12:00:00Z")))'));
 assert.equal(info.summary.machines,2);
 assert.equal(info.summary.working,1);
 assert.equal(info.summary.open,1);
 assert.equal(info.summary.breakdowns,2);
 assert.equal(info.summary.serviceCount,1);
 assert.equal(info.summary.downtimeHours,30);
 assert.equal(info.rows[0].downtime_minutes,120);
 assert.equal(info.rows[1].downtime_minutes,1680);
 assert.equal(info.rows[1].status,"breakdown");
 assert.equal(info.rows[0].status,"working");
});
test("report time windows clip downtime to selected period rather than counting an entire prior breakdown",()=>{
 const a=app();
 a.run('S.m=[{id:"X",name:"Loader",hours:5,status:"working",active:true}];'+
 'S.b=[{machine_id:"X",started_at:"2026-10-01T08:00:00Z",resolved_at:"2026-10-24T08:00:00Z"}];'+
 'S.s=[];');
 const info=JSON.parse(a.run('JSON.stringify(reportModel(7,Date.parse("2026-10-26T08:00:00Z")))'));
 assert.equal(info.summary.breakdowns,0);
 assert.equal(info.summary.downtimeHours,120);
 assert.equal(info.rows[0].breakdowns,0);
});
test("CSV escaping protects spreadsheet formulas and quotes",()=>{
 const a=app();
 assert.equal(a.run('reportCsvCell("=HYPERLINK(1)")'),'"\'=HYPERLINK(1)"');
 assert.equal(a.run('reportCsvCell("  +1+2")'),'"\'  +1+2"');
 assert.equal(a.run('reportCsvCell("normal"+String.fromCharCode(34)+"value")'),'"normal""value"');
 const csv=a.run('reportCSV([["Name","Notes"],["EX-1","=2+3"]])');
 assert.ok(csv.startsWith("\ufeff"));
 assert.ok(csv.includes('"\'=2+3"'));
});
test("only assigned repairer or management sees the completion action",()=>{
 const a=app();
 a.run('S.user={id:"mechanic-A"};S.p={role:"assistant_mechanic",active:true};');
 assert.equal(a.run('canFinishBreakdown({assigned_to:"mechanic-A",resolved_at:null})'),true);
 assert.equal(a.run('canFinishBreakdown({assigned_to:"mechanic-B",resolved_at:null})'),false);
 assert.equal(a.run('canFinishBreakdown({assigned_to:null,resolved_at:null})'),false);
 a.run('S.p={role:"foreman",active:true};');
 assert.equal(a.run('canFinishBreakdown({assigned_to:null,resolved_at:null})'),true);
 assert.equal(a.run('canFinishBreakdown({assigned_to:null,resolved_at:"2026-10-26"})'),false);
});
test("breakdown attachments check type, count and size before any upload",()=>{
 const a=app();
 assert.equal(a.run('validPhotoFiles([{type:"image/jpeg",size:20000,name:"a.jpg"}]).length'),1);
 assert.throws(()=>a.run('validPhotoFiles([{type:"application/pdf",size:20000}])'),/Only JPG/);
 assert.throws(()=>a.run('validPhotoFiles([{type:"image/jpeg",size:9000000}])'),/8 MB/);
 assert.throws(()=>a.run('validPhotoFiles(Array.from({length:6},()=>({type:"image/jpeg",size:20})))'),/5 photos/);
});
test("workflow migration blocks direct table writes and preserves breakdown status when services are logged",()=>{
 assert.match(sql,/REVOKE INSERT,UPDATE,DELETE ON public\.machines,public\.breakdowns,public\.services,public\.audit_log/i);
 assert.match(sql,/Service logging is NOT a repair completion/i);
 assert.doesNotMatch(sql,/status\s*=\s*case\s+when status='breakdown'/i);
 assert.match(sql,/Only assigned technician or management can complete this repair/i);
 assert.match(sql,/Only management can assign a technician/i);
 assert.match(sql,/CREATE POLICY breakdown_photos_permitted_uploader/i);
 assert.match(sql,/CREATE POLICY fleet_evidence_active_guard/i);
});
test("report export and photo UX has mobile and print styling",()=>{
 assert.match(source,/function exportFleetReport\(/);
 assert.match(source,/function attachBreakdownEvidence\(/);
 assert.match(source,/function uploadBreakdownPhotos\(/);
 assert.match(source,/window\.print\(\)/);
 assert.match(styles,/@media print/);
 assert.match(styles,/\.report-stats/);
 assert.match(styles,/\.breakdown-actions/);
});
