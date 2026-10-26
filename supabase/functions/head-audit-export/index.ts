import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
const PAGE=String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#0e467d">
<title>Full Audit Report | Phatsema Fleet Operations</title>
<style nonce="__NONCE__">
:root{color-scheme:light;font-family:system-ui,-apple-system,"Segoe UI",Arial,sans-serif}
*{box-sizing:border-box}
body{margin:0;background:#edf3fa;color:#102841;font-size:15px}
header{background:linear-gradient(105deg,#093960,#146ca9);border-bottom:5px solid #eab84b;color:white;padding:24px clamp(16px,4vw,42px)}
header h1{font-size:24px;line-height:1.2;margin:0 0 4px;font-weight:850}
header p{font-size:13px;margin:0;opacity:.92}
main{max-width:900px;margin:30px auto;padding:0 16px}
.card{background:#fff;border:1px solid #d4e0ed;border-radius:16px;box-shadow:0 8px 35px #1e5a9210;padding:clamp(16px,3vw,28px);margin-bottom:15px}
h2{font-size:20px;margin:0 0 10px}
p{line-height:1.65}
.muted{color:#567083;font-size:13px}
label{display:block;font-size:13px;font-weight:750;margin:15px 0 6px}
input{border:1px solid #bccfe0;border-radius:9px;width:100%;padding:12px;font-size:16px;background:white;color:#102841}
button{appearance:none;border:0;border-radius:9px;background:#156cab;color:white;font-size:14px;font-weight:800;padding:12px 16px;min-height:44px;cursor:pointer}
button.secondary{background:#e7eff7;color:#173b5b;border:1px solid #bfcfe0}
button:disabled{opacity:.5;cursor:wait}
.actions{display:flex;flex-wrap:wrap;gap:9px;margin:15px 0}
.actions button{flex:1}
.note{background:#fff9eb;border-left:3px solid #eab84b;color:#73520d;padding:11px 13px;border-radius:7px;font-size:12px;line-height:1.6}
.status{font-size:13px;line-height:1.5;min-height:18px;margin:12px 0;color:#17486e}
.status.error{color:#9a2222}
.hidden{display:none!important}
footer{text-align:center;padding:14px 16px;color:#486174;font-size:12px}
#reportPrintable{display:none}
@media(max-width:560px){header h1{font-size:21px}main{margin:15px auto}.actions button{flex:1 1 100%}}
@media print{
@page{size:A4 landscape;margin:11mm}
header,main,footer{display:none!important}
body{background:white!important;color:black!important;margin:0!important}
#reportPrintable{display:block!important;font:9px Arial,sans-serif;color:#111!important}
#reportPrintable h1{font-size:18px;margin:0 0 4px}
#reportPrintable h2{font-size:15px;margin:0 0 8px}
#reportPrintable p{font-size:10px;line-height:1.4}
#reportPrintable .top{border-bottom:2px solid #155a9c;padding-bottom:9px;margin-bottom:14px}
#reportPrintable table{width:100%;border-collapse:collapse;table-layout:fixed}
#reportPrintable th,#reportPrintable td{border:1px solid #ccc;padding:5px;vertical-align:top;text-align:left;overflow-wrap:anywhere;word-break:break-word}
#reportPrintable th{background:#eee!important}
#reportPrintable td small{display:block;font-size:8px}
#reportPrintable thead{display:table-header-group}
#reportPrintable tr{break-inside:avoid}
#reportPrintable th:nth-child(1){width:5%}
#reportPrintable th:nth-child(2){width:15%}
#reportPrintable th:nth-child(3){width:17%}
#reportPrintable th:nth-child(4){width:15%}
#reportPrintable th:nth-child(5){width:14%}
#reportPrintable th:nth-child(6){width:34%}
}
</style>
</head>
<body>
<header>
<h1>PHATSEMA | Fleet Operations</h1>
<p>Head of Operations • Complete Audit Report</p>
</header>
<main>
<section class="card" id="loginBox">
<h2>Secure sign in</h2>
<p class="muted">Sign in with your Phatsema account. Only the active Head of Operations can access the complete audit history.</p>
<form id="loginForm">
<label for="email">Work email</label><input type="email" id="email" autocomplete="username" required>
<label for="password">Password</label><input type="password" id="password" autocomplete="current-password" required>
<div class="actions"><button id="loginButton" type="submit">Sign in securely</button></div>
</form>
<div id="loginStatus" role="status" aria-live="polite" class="status"></div>
</section>
<section class="card hidden" id="exportBox">
<h2>Download complete audit history</h2>
<p class="muted" id="snapshotInfo">Checking permitted audit records…</p>
<div class="actions">
<button id="downloadCSV" type="button">Download all records (CSV / Excel)</button>
<button id="preparePDF" class="secondary" type="button">Prepare complete PDF report</button>
<button id="logout" class="secondary" type="button">Sign out</button>
</div>
<p class="note">Confidential operational information. The export contains employee details and a full record of changes. Keep files secure and share only with authorised recipients.</p>
<div id="exportStatus" role="status" aria-live="polite" class="status"></div>
<div class="actions hidden" id="printReady"><button id="printNow" type="button">Print / Save full report as PDF</button></div>
</section>
</main>
<div id="reportPrintable"></div>
<footer>Secure audit access powered by your existing Phatsema Supabase accounts. No employee password is stored by this page.</footer>
<script nonce="__NONCE__">
"use strict";
const ROOT="__SUPABASE_URL__";
const KEY="__PUBLISHABLE_KEY__";
let token=null, activeSnapshot=null, busy=false;
const byId=id=>document.getElementById(id);
function setStatus(id,msg,isError){
 const el=byId(id);el.textContent=msg;el.classList.toggle("error",!!isError);
}
function escapeHTML(x){
 return String(x==null?"":x).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function csvCell(value){
 let text=String(value==null?"":value);
 if(/^[\s\x00-\x1f]*[=+\-@]/.test(text))text="'"+text;
 return '"'+text.replace(/"/g,'""')+'"';
}
function csv(rows){return "\ufeff"+rows.map(row=>row.map(csvCell).join(",")).join("\r\n")+"\r\n";}
function setBusy(value){
 busy=value;
 for(const id of ["downloadCSV","preparePDF","logout"])byId(id).disabled=value;
}
async function requestJSON(url,body,headers){
 const response=await fetch(url,{
  method:"POST",headers:{"Content-Type":"application/json","apikey":KEY,...headers},
  body:JSON.stringify(body||{}),cache:"no-store"
 });
 let result;
 try{result=await response.json()}catch{result=null}
 if(!response.ok){
  const message=result&&typeof result.message==="string"?result.message:
    result&&typeof result.msg==="string"?result.msg:"Request failed with status "+response.status;
  throw new Error(message);
 }
 return result;
}
async function rpc(name,args){
 if(!token)throw new Error("Your session has ended. Sign in again.");
 return requestJSON(ROOT+"/rest/v1/rpc/"+name,args,{"Authorization":"Bearer "+token});
}
function logout(){
 token=null;activeSnapshot=null;
 byId("exportBox").classList.add("hidden");
 byId("loginBox").classList.remove("hidden");
 byId("reportPrintable").textContent="";
 byId("printReady").classList.add("hidden");
 byId("password").value="";
 byId("loginStatus").textContent="";
 setStatus("exportStatus","");
}
async function signIn(event){
 event.preventDefault();
 const button=byId("loginButton");
 button.disabled=true;
 setStatus("loginStatus","Checking credentials…");
 try{
  const result=await requestJSON(ROOT+"/auth/v1/token?grant_type=password",{
   email:byId("email").value.trim(),password:byId("password").value
  });
  if(!result||!result.access_token)throw new Error("Login did not return a secure session.");
  token=result.access_token;
  byId("password").value="";
  const meta=await rpc("audit_export_snapshot",{});
  activeSnapshot=Array.isArray(meta)?meta[0]:meta;
  if(!activeSnapshot)throw new Error("No audit export metadata available.");
  const n=Number(activeSnapshot.entry_count);
  byId("snapshotInfo").textContent="Full available history: "+n.toLocaleString()+
   " recorded events. Export includes every entry, not just the last 100 shown in Fleet Operations.";
  byId("loginBox").classList.add("hidden");
  byId("exportBox").classList.remove("hidden");
  setStatus("exportStatus","Head of Operations access verified.");
 }catch(error){
  token=null;
  setStatus("loginStatus",error.message||String(error),true);
 }finally{button.disabled=false;}
}
async function allAuditRows(update){
 const meta=await rpc("audit_export_snapshot",{});
 const snap=Array.isArray(meta)?meta[0]:meta;
 if(!snap)throw new Error("Audit export metadata is unavailable.");
 const expected=Number(snap.entry_count),maximum=Number(snap.snapshot_max_id);
 if(!Number.isSafeInteger(expected)||expected<0||!Number.isSafeInteger(maximum)||maximum<0)
  throw new Error("Invalid audit record count.");
 let last=0;const rows=[];
 while(rows.length<expected){
  const page=await rpc("audit_export_page",{p_snapshot_max_id:maximum,p_after_id:last,p_limit:500});
  if(!Array.isArray(page)||page.length===0)throw new Error("Export interrupted. No partial file was downloaded.");
  const next=Number(page[page.length-1].id);
  if(!Number.isSafeInteger(next)||next<=last||next>maximum)throw new Error("Invalid audit export record sequence.");
  rows.push(...page);
  if(rows.length>expected)throw new Error("Audit records changed while exporting. Please retry.");
  last=next;
  if(update)update(rows.length+" of "+expected+" audit records retrieved…");
 }
 if(rows.length!==expected)throw new Error("Audit history incomplete; please retry.");
 return {rows,snapshot:snap};
}
function buildCsv(rows){
 return csv([["Audit ID","Recorded at (UTC / ISO)","Actor name","Role","Actor ID",
 "Action","Entity type","Entity ID","Complete JSON event details"],...rows.map(r=>[
 r.id,r.created_at,r.actor_name||"System",r.actor_role||"",r.actor_id||"",
 r.action||"",r.entity_type||"",r.entity_id||"",JSON.stringify(r.details??{})])]);
}
function printMarkup(rows,snap){
 const tr=rows.map(r=>"<tr>"+
  "<td>"+escapeHTML(r.id)+"</td>"+
  "<td>"+escapeHTML(r.created_at)+"</td>"+
  "<td>"+escapeHTML(r.actor_name||"System")+"<small>"+escapeHTML(r.actor_role||"")+"</small></td>"+
  "<td>"+escapeHTML(r.action||"")+"</td>"+
  "<td>"+escapeHTML(r.entity_type||"")+"<small>"+escapeHTML(r.entity_id||"")+"</small></td>"+
  "<td>"+escapeHTML(JSON.stringify(r.details??{}))+"</td></tr>").join("");
 return '<div class="top"><h1>Phatsema Fleet Operations</h1><h2>Complete audit log</h2>'+
  "<p>Confidential • Head of Operations • Generated "+escapeHTML(new Date().toLocaleString())+"</p>"+
  "<p>"+escapeHTML(rows.length)+" recorded entries • Snapshot through audit #"+
  escapeHTML(snap.snapshot_max_id)+"</p></div>"+
  "<table><thead><tr><th>ID</th><th>Timestamp (UTC)</th><th>Employee</th>"+
  "<th>Action</th><th>Entity</th><th>Full event details</th></tr></thead><tbody>"+
  (tr||'<tr><td colspan="6">No audit records available.</td></tr>')+"</tbody></table>"+
  "<p>This report is based on recorded system events and does not independently verify physical operations.</p>";
}
async function recordPreparation(type,rows,snapshot){
 try{
  await rpc("record_audit_export",{
   p_format:type,p_record_count:rows.length,p_snapshot_max_id:Number(snapshot.snapshot_max_id)
  });
 }catch(err){setStatus("exportStatus","Report prepared, but export activity tracking failed: "+(err.message||String(err)),true);}
}
async function downloadCsv(){
 if(busy||!token)return;
 setBusy(true);
 setStatus("exportStatus","Retrieving all audit records…");
 try{
  const {rows,snapshot}=await allAuditRows(msg=>setStatus("exportStatus",msg));
  const blob=new Blob([buildCsv(rows)],{type:"text/csv;charset=utf-8"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;
  a.download="phatsema-full-audit-log-"+new Date().toISOString().slice(0,10)+".csv";
  a.style.display="none";
  document.body.appendChild(a);
  try{a.click()}finally{a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);}
  setStatus("exportStatus","Complete CSV report prepared: "+rows.length+" entries.");
  await recordPreparation("csv",rows,snapshot);
 }catch(err){setStatus("exportStatus",err.message||String(err),true);}
 finally{setBusy(false);}
}
async function preparePdf(){
 if(busy||!token)return;
 setBusy(true);
 byId("printReady").classList.add("hidden");
 setStatus("exportStatus","Preparing all records for printing…");
 try{
  const {rows,snapshot}=await allAuditRows(msg=>setStatus("exportStatus",msg));
  byId("reportPrintable").innerHTML=printMarkup(rows,snapshot);
  byId("printReady").classList.remove("hidden");
  setStatus("exportStatus","Printable report is ready: "+rows.length+
   " entries. Tap Print / Save full report as PDF.");
  await recordPreparation("pdf",rows,snapshot);
 }catch(err){setStatus("exportStatus",err.message||String(err),true);}
 finally{setBusy(false);}
}
byId("loginForm").addEventListener("submit",signIn);
byId("logout").addEventListener("click",logout);
byId("downloadCSV").addEventListener("click",downloadCsv);
byId("preparePDF").addEventListener("click",preparePdf);
byId("printNow").addEventListener("click",()=>window.print());
</script>
</body>
</html>`;
const SUPABASE_URL="https://fduccizawxtqnqtuxmjl.supabase.co";
const PUBLISHABLE_KEY="sb_publishable_BzL4VuUfWGSLOHY-9vsnuw_d5nQp0dx";
function makeNonce(){
 const bytes=crypto.getRandomValues(new Uint8Array(24));
 return btoa(String.fromCharCode(...bytes)).replace(/=+$/g,"");
}
Deno.serve((request)=>{
 if(request.method!=="GET"&&request.method!=="HEAD")
  return new Response("Method not allowed",{status:405,headers:{"Allow":"GET, HEAD"}});
 const nonce=makeNonce();
 const html=PAGE.replaceAll("__NONCE__",nonce)
  .replaceAll("__SUPABASE_URL__",SUPABASE_URL)
  .replaceAll("__PUBLISHABLE_KEY__",PUBLISHABLE_KEY);
 return new Response(request.method==="HEAD"?null:html,{
  status:200,
  headers:{
   "Content-Type":"text/html; charset=utf-8",
   "Cache-Control":"no-store, private, max-age=0",
   "Referrer-Policy":"no-referrer",
   "X-Content-Type-Options":"nosniff",
   "X-Frame-Options":"DENY",
   "Cross-Origin-Opener-Policy":"same-origin",
   "Content-Security-Policy":"default-src 'none'; script-src 'nonce-"+nonce+
     "'; style-src 'nonce-"+nonce+
     "'; connect-src "+SUPABASE_URL+
     "; form-action 'self'; base-uri 'none'; frame-ancestors 'none';"
  }
 });
});
