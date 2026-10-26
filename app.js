const SUPABASE_URL="https://fduccizawxtqnqtuxmjl.supabase.co",KEY="sb_publishable_BzL4VuUfWGSLOHY-9vsnuw_d5nQp0dx";

function initTheme(){const saved=localStorage.getItem("phatsema-theme");const dark=saved==="dark";document.body.classList.toggle("dark",dark);const b=document.getElementById("themeBtn");if(b)b.textContent=dark?"☀️ Light":"🌙 Dark"}
function toggleTheme(){const dark=!document.body.classList.contains("dark");document.body.classList.toggle("dark",dark);localStorage.setItem("phatsema-theme",dark?"dark":"light");const b=document.getElementById("themeBtn");if(b)b.textContent=dark?"☀️ Light":"🌙 Dark"}
document.addEventListener("DOMContentLoaded",()=>{initTheme();const b=document.getElementById("themeBtn");if(b)b.addEventListener("click",toggleTheme)});let db=null;function initSupabase(){if(!window.supabase||typeof window.supabase.createClient!=="function"){let m=document.getElementById("loginMsg");if(m)m.textContent="The Supabase connection library did not load. Please refresh the page.";return false}try{db=window.supabase.createClient(SUPABASE_URL,KEY);return true}catch(e){let m=document.getElementById("loginMsg");if(m)m.textContent="Could not initialize the secure login connection. Check the browser console for the exact error.";showFatal(e.message||String(e));return false}}let S={user:null,p:null,m:[],b:[],s:[],photos:[],breakdownPhotos:[],people:[],settings:[],audit:[],grants:[],accessReady:false,view:"dashboard",fleetSearch:"",breakdownSearch:"",serviceSearch:"",reportDays:30,lastLoadedAt:null,loadErrors:[]};const $=id=>document.getElementById(id),esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));const toast=(x,e)=>{let t=document.createElement("div");t.className="toast"+(e?" error":"");t.textContent=x;$("toastRoot").append(t);setTimeout(()=>t.remove(),3000)},fmt=x=>x?new Date(x).toLocaleString():"—",mgr=()=>["foreman","operations_manager","head_of_operations"].includes(S.p?.role)||S.p?.full_access===true,headOps=()=>S.p?.role==="head_of_operations"||S.p?.full_access===true,
realHead=()=>S.p?.active!==false&&S.p?.role==="head_of_operations",
activeGrants=id=>(S.grants||[]).filter(g=>g.user_id===id&&!g.revoked_at&&Date.parse(g.expires_at)>Date.now()),
hasDelegated=scope=>activeGrants(S.user?.id).some(g=>g.permission===scope),
canFleetManage=()=>mgr()||hasDelegated("manage_fleet"),
canNextService=()=>realHead()||hasDelegated("next_service"),
canCorrectHours=()=>realHead()||hasDelegated("correct_hours"),
accessLabel=scope=>({manage_fleet:"Manage Fleet",next_service:"Set Next Service",correct_hours:"Correct Machine Hours"}[scope]||scope),
name=id=>S.people.find(p=>p.id===id)?.full_name||S.people.find(p=>p.id===id)?.username||"Unassigned";function go(v){S.view=v;if(v!=="machines")S.fleetFilter=null;render()}
function showFatal(message){console.error(message);let e=$("loadErr");if(e)e.textContent="⚠ "+message;else if($("loginMsg"))$("loginMsg").textContent=message}
function norm(s){return String(s||"").trim().toLowerCase()}
function metrics(){let m=S.m||[],total=m.length,c=k=>m.filter(x=>norm(x.status)===k).length,working=c("working"),available=c("available"),breakdown=c("breakdown"),maintenance=c("maintenance"),offline=c("offline"),pct=n=>total?Math.round(n/total*1000)/10:0;return{total,working,available,breakdown,maintenance,offline,workingPct:pct(working),operationalPct:pct(working+available),availabilityPct:pct(total-breakdown)}}
function openBreakdowns(){S.view="machines";S.fleetFilter={status:"breakdown"};S.fleetSearch="";render()}function render(){let nav=[["dashboard","Dashboard"],["machines","Fleet"],["breakdowns","Breakdowns"],["services","Service"],["service_due","Service Due"],["reports","Reports"],["people","People"],["settings","Settings"],["audit","Audit"],["guide","Guide"]];$("nav").innerHTML=nav.filter(x=>["dashboard","machines","breakdowns","services","guide"].includes(x[0])||(x[0]==="service_due"&&canNextService())||mgr()).map(x=>'<button data-v="'+x[0]+'" class="'+(S.view===x[0]?"active":"")+'">'+x[1]+"</button>").join("");$("nav").querySelectorAll("button").forEach(b=>b.onclick=()=>go(b.dataset.v));$("main").innerHTML=({dashboard:dash,machines:machines,breakdowns:breakdowns,services:services,people:people,settings:settings,audit:audit,service_due:serviceDue,reports:reports,guide:guide}[S.view]||dash)();bind()}
function serviceSchedule(m){
 const current=Number(m.hours||0);
 const remaining=m.next_service_hours==null?null:Number(m.next_service_hours)-current;
 const rawDate=m.next_service_date?new Date(m.next_service_date+"T00:00:00"):null;
 const validDate=rawDate&&Number.isFinite(rawDate.getTime())?rawDate:null;
 const today=new Date();today.setHours(0,0,0,0);
 const days=validDate?Math.round((validDate.getTime()-today.getTime())/86400000):null;
 const warning=Math.max(0,Number(m.service_warning_hours??50));
 const due=(remaining!=null&&remaining<=0)||(days!=null&&days<=0);
 const soon=due||(remaining!=null&&remaining<=warning)||(days!=null&&days<=7);
 const priority=Math.min(remaining==null?999999:remaining,days==null?999999:days*8);
 const text=due?"Due now":(remaining!=null&&days!=null?(remaining+" h / "+days+" days left"):
   remaining!=null?(Math.max(0,remaining).toLocaleString(undefined,{maximumFractionDigits:1})+" h left"):
   days!=null?(days+" days left"):"Not scheduled");
 return {due:!!due,soon:!!soon,priority,text,remaining,days};
}
function dashboardMetric(title,value,detail,kind,action){
 return '<button type="button" class="ops-kpi ops-kpi-'+kind+'" '+action+'>'+
  '<span class="ops-kpi-top"><span>'+esc(title)+'</span><span aria-hidden="true" class="ops-kpi-chevron">↗</span></span>'+
  '<strong class="ops-kpi-value">'+esc(value)+'</strong><span class="ops-kpi-detail">'+esc(detail)+'</span></button>';
}
function dash(){
 const x=metrics();
 const open=S.b.filter(b=>!b.resolved_at);
 const dueNow=S.m.filter(m=>serviceSchedule(m).due).length;
 const approaching=S.m.filter(m=>m.next_service_hours!=null||m.next_service_date).map(m=>({m,service:serviceSchedule(m)}))
  .sort((a,b)=>a.service.priority-b.service.priority).slice(0,5);
 const displayStates=[
  ["working","Working",x.working],
  ["available","Available",x.available],
  ["breakdown","Breakdown",x.breakdown],
  ["maintenance","Maintenance",x.maintenance],
  ["offline","Offline",x.offline]
 ];
 const distribution=displayStates.map(([state,title,count])=>{
  const percentage=x.total?Number((100*count/x.total).toFixed(2)):0;
  return '<span class="ops-distribution-segment ops-state-'+state+'" style="width:'+percentage+'%" role="presentation" title="'+esc(title)+': '+count+'"></span>';
 }).join("");
 const breakdownDetails=open.slice(0,4).map(b=>
   '<div class="ops-action-row"><span class="ops-alert-symbol" aria-hidden="true">!</span>'+
   '<div><strong>'+esc(getMachine(b.machine_id))+'</strong><small>'+esc(b.reason||"Breakdown reported")+' · '+esc(fmt(b.started_at))+'</small></div>'+
   '<button type="button" class="secondary ops-mini-btn" data-go="breakdowns">View</button></div>'
 ).join("");
 const upcomingDetails=approaching.map(({m,service})=>
   '<div class="ops-service-row"><span class="ops-service-icon '+(service.due?'due':service.soon?'soon':'')+'">◷</span>'+
   '<div><strong>'+esc(m.name)+'</strong><small>'+esc(m.fleet_id)+' · Current '+Number(m.hours||0).toLocaleString()+' h</small></div>'+
   '<span class="ops-service-count '+(service.due?'urgent':service.soon?'soon':'')+'">'+esc(service.text)+'</span></div>'
 ).join("");
 const recentServices=S.s.slice(0,3).map(item=>
   '<div class="ops-activity-row"><span class="ops-activity-mark" aria-hidden="true">✓</span>'+
   '<div><strong>'+esc(getMachine(item.machine_id))+'</strong><small>'+esc(item.work_completed||"Service completed")+'</small></div>'+
   '<time>'+esc(fmt(item.service_date))+'</time></div>'
 ).join("");
 return '<div class="ops-dashboard">'+
  '<section class="ops-hero"><div class="ops-hero-copy"><div class="ops-overline"><span class="ops-pulse"></span> LIVE FLEET OVERVIEW</div>'+
  '<h1>Fleet command centre</h1><p>Know what is working, what needs attention, and what comes next.</p>'+
  '<div class="ops-hero-footer"><span>'+x.total+' active machines</span><span aria-hidden="true">•</span>'+
  '<span id="lastSyncLabel">Updated '+esc(S.lastLoadedAt?new Date(S.lastLoadedAt).toLocaleTimeString():"on refresh")+'</span></div></div>'+
  '<div class="ops-hero-side"><div class="ops-ring" role="img" aria-label="'+x.workingPct.toFixed(1)+'% of machines working" style="background:conic-gradient(#57b7ed 0% '+x.workingPct+'%,rgba(255,255,255,.12) '+x.workingPct+'% 100%)"><div class="ops-ring-centre"><strong>'+x.workingPct.toFixed(1)+'%</strong><small>WORKING</small></div></div></div>'+
  '<button id="refresh" type="button" class="ops-refresh" aria-label="Refresh fleet overview">↻ Refresh</button></section>'+
  '<section class="ops-kpis" aria-label="Fleet key figures">'+
  dashboardMetric("Working now",x.workingPct.toFixed(1)+"%",x.working+" of "+x.total+" machines","working",'data-state="working"')+
  dashboardMetric("Operational",x.operationalPct.toFixed(1)+"%",(x.working+x.available)+" working or available","operational",'data-go="machines"')+
  dashboardMetric("Breakdowns",String(x.breakdown),open.length+" open reports","breakdown",'data-filter-breakdowns="true"')+
  dashboardMetric("Service due",String(dueNow),dueNow?"Requires attention":"All schedules on track","service",'data-go="service_due"')+
  '</section>'+
  '<div class="ops-overview-grid"><section class="panel ops-status-card"><div class="ops-section-heading"><div><h2>Fleet status</h2><p>Real-time status distribution</p></div><span class="ops-section-tag">'+x.total+' total</span></div>'+
  '<div class="ops-distribution" role="img" aria-label="'+displayStates.map(row=>row[1]+': '+row[2]).join(', ')+'">'+distribution+'</div>'+
  '<div class="ops-state-list">'+displayStates.map(([state,title,count])=>
    '<button type="button" data-state="'+state+'" class="ops-state-button"><span class="ops-state-dot ops-state-'+state+'"></span><span>'+title+'</span><strong>'+count+'</strong></button>'
  ).join("")+'</div></section>'+
  '<section class="panel ops-attention-card"><div class="ops-section-heading"><div><h2>Needs attention</h2><p>Open machine breakdowns</p></div><button type="button" class="ops-text-action" data-filter-breakdowns="true">View all</button></div>'+
  (breakdownDetails||(x.breakdown?'<div class="ops-empty-state">A machine is in Breakdown status but has no open breakdown report.</div>':'<div class="ops-empty-state"><span aria-hidden="true">✓</span> No open breakdowns. Fleet is running smoothly.</div>'))+
  '</section></div>'+
  '<div class="ops-overview-grid"><section class="panel ops-upcoming-card"><div class="ops-section-heading"><div><h2>Next services</h2><p>Closest scheduled maintenance</p></div><button type="button" class="ops-text-action" data-go="service_due">Service due</button></div>'+
  (upcomingDetails||'<div class="ops-empty-state">No service schedules configured yet.</div>')+
  '</section><section class="panel ops-actions-card"><div class="ops-section-heading"><div><h2>Quick actions</h2><p>Get the work done in fewer taps</p></div></div>'+
  '<div class="ops-quick-actions"><button class="ops-quick-action" type="button" id="quickBreakdown"><span aria-hidden="true">!</span><strong>Report breakdown</strong><small>Log a machine issue</small></button>'+
  '<button class="ops-quick-action" type="button" id="quickService"><span aria-hidden="true">＋</span><strong>Log service</strong><small>Record maintenance work</small></button>'+
  '<button class="ops-quick-action" type="button" data-go="machines"><span aria-hidden="true">⌕</span><strong>Find machine</strong><small>View fleet and hours</small></button></div>'+
  '<div class="ops-recent"><h3>Recent services</h3>'+(recentServices||'<p class="muted">No services recorded yet.</p>')+'</div>'+
  '</section></div></div>';
}
function serviceDue(){let today=new Date();today.setHours(0,0,0,0);let a=(S.m||[]).filter(m=>{let byHours=m.next_service_hours!=null&&Number(m.hours||0)>=Number(m.next_service_hours);let byDate=m.next_service_date&&new Date(m.next_service_date+"T00:00:00")<=today;return byHours||byDate}).sort((x,y)=>Number(y.hours||0)-Number(x.hours||0));return '<div class="page-head"><div><h1>Service Due</h1><div class="muted">Machines that have reached or passed their next scheduled service</div></div><button id="refresh" class="secondary">Refresh</button></div><div class="panel table-wrap"><table class="table ops-cards-table ops-due-table"><thead><tr><th>Machine</th><th>Current Hours</th><th>Next Service</th><th>Status</th><th>Action</th></tr></thead><tbody>'+(a.map(m=>'<tr><td><b>'+esc(m.name)+'</b><br>'+esc(m.fleet_id)+'</td><td>'+Number(m.hours||0).toLocaleString()+'</td><td>'+serviceDueLabel(m)+'</td><td><span class="status breakdown">Due</span></td><td>'+ (canNextService()?'<button class="primary nextService" data-id="'+m.id+'">Set next service</button>':'View')+'</td></tr>').join("")||'<tr><td colspan="5" class="empty">No machines are currently due for service.</td></tr>')+'</tbody></table></div>'}
function serviceDueLabel(m){let parts=[];if(m.next_service_hours!=null)parts.push(Number(m.next_service_hours).toLocaleString()+" h");if(m.next_service_date)parts.push(new Date(m.next_service_date+"T00:00:00").toLocaleDateString());return parts.join(" / ")||"Not set"}
function machines(){let q=((S.fleetSearch??$("mq")?.value)||"").toLowerCase(),filter=S.fleetFilter?.status,a=S.m.filter(m=>(!filter||norm(m.status)===filter)&&((m.name+" "+m.fleet_id+" "+(m.model||"")+" "+(m.site||"")).toLowerCase().includes(q)));return '<div class="page-head"><div><h1>Machines</h1><div class="muted">Status, hours and fleet service schedule</div></div>'+(canFleetManage()?'<button id="addM" class="primary">+ Add machine</button>':"")+'</div><div class="toolbar"><input type="search" id="mq" aria-label="Search machines" placeholder="Search machines" value="'+esc(S.fleetSearch||"")+'"></div><div class="panel table-wrap"><table class="table ops-cards-table ops-fleet-table"><thead><tr><th>Machine</th><th>Status</th><th>Hours</th><th>Live Production</th><th>Next Service Due</th><th>Site</th><th>Actions</th></tr></thead><tbody>'+(a.map(m=>{let due=(m.next_service_hours!=null&&Number(m.hours||0)>=Number(m.next_service_hours))||(m.next_service_date&&new Date(m.next_service_date+"T00:00:00")<=new Date(new Date().toISOString().slice(0,10)+"T00:00:00"));return '<tr><td><b>'+esc(m.name)+'</b><br>'+esc(m.fleet_id)+'</td><td><span class="status '+esc(m.status)+'">'+esc(m.status)+'</span></td><td>'+Number(m.hours||0).toLocaleString()+'</td><td><span class="production-clock" data-production-machine="'+esc(m.id)+'">'+productionClockText(m)+'</span></td><td><span class="status '+(due?"breakdown":"available")+'">'+esc(serviceDueLabel(m))+(due?" · DUE":"")+'</span></td><td>'+esc(m.site||"—")+'</td><td>'+((canFleetManage()||canCorrectHours()||canNextService())?
 (canFleetManage()||canCorrectHours()?'<button class="secondary editHours" data-id="'+m.id+'">Edit hours</button> ':"")+
 (canFleetManage()?'<button class="secondary st" data-id="'+m.id+'">Status</button> ':"")+
 (canNextService()?'<button class="secondary nextService" data-id="'+m.id+'">Next service</button> ':"")+
 (canFleetManage()?'<button class="danger rm" data-id="'+m.id+'">Remove</button>':"")
 :"View")+"</td></tr>"}).join("")||'<tr><td colspan="7" class="empty">No machines.</td></tr>')+"</tbody></table></div>"}
function canFinishBreakdown(b){
 return !b.resolved_at&&(mgr()||(S.p?.active!==false&&b.assigned_to===S.user?.id));
}
function canUploadBreakdownPhoto(b){
 return S.p?.active!==false&&(mgr()||b.reported_by===S.user?.id||b.assigned_to===S.user?.id);
}
function breakdowns(){
 const q=(S.breakdownSearch||"").toLowerCase();
 const items=S.b.filter(b=>(getMachine(b.machine_id)+" "+(b.reason||"")).toLowerCase().includes(q));
 const rows=items.map(b=>{
  const photos=(S.breakdownPhotos||[]).filter(p=>p.breakdown_id===b.id);
  const photoLinks=photos.map((p,i)=>'<a href="'+esc(p.url)+'" target="_blank" rel="noopener noreferrer">Photo '+(i+1)+'</a>').join(" · ");
  const controls=[
    !b.resolved_at&&mgr()?'<button type="button" class="secondary assignBreakdown" data-id="'+esc(b.id)+'">Assign technician</button>':"",
    canFinishBreakdown(b)?'<button type="button" class="primary repair" data-id="'+esc(b.id)+'">Repair complete</button>':"",
    canUploadBreakdownPhoto(b)?'<button type="button" class="secondary breakdownEvidence" data-id="'+esc(b.id)+'">Attach photos</button>':""
  ].filter(Boolean).join(" ");
  const state=b.resolved_at?"Resolved":b.repair_completed_at?"Repair recorded / not ready":"Open";
  return '<tr><td>'+esc(getMachine(b.machine_id))+'</td>'+
    '<td>'+esc(b.reason)+(b.notes?'<small>'+esc(b.notes)+'</small>':"")+'</td>'+
    '<td>'+esc(fmt(b.started_at))+'</td>'+
    '<td>'+esc(state)+(b.not_ready_reason?'<small>Still down: '+esc(b.not_ready_reason)+'</small>':"")+'</td>'+
    '<td>'+esc(name(b.assigned_to))+'</td>'+
    '<td class="breakdown-action-cell">'+(photoLinks?'<div class="breakdown-photo-links">'+photoLinks+'</div>':"")+
      (controls||photoLinks?"":"—")+(controls?'<div class="breakdown-actions">'+controls+'</div>':"")+
    '</td></tr>';
 }).join("");
 return '<div class="page-head"><div><h1>Breakdowns</h1><div class="muted">Report faults, assign a technician, document repairs and attach photographic evidence</div></div>'+
 '<button id="addB" class="primary">+ Report issue</button></div>'+
 '<div class="toolbar"><input type="search" id="bq" aria-label="Search breakdowns" placeholder="Search breakdowns" value="'+esc(S.breakdownSearch||"")+'"></div>'+
 '<div class="panel table-wrap"><table class="table ops-cards-table ops-breakdown-table"><thead><tr>'+
 '<th>Machine</th><th>Problem</th><th>Started</th><th>Status</th><th>Assigned</th><th>Actions / photos</th>'+
 '</tr></thead><tbody>'+(rows||'<tr><td colspan="6" class="empty">No breakdowns.</td></tr>')+
 '</tbody></table></div>';
}
function services(){let q=(S.serviceSearch||"").toLowerCase(),a=S.s.filter(x=>(getMachine(x.machine_id)+" "+(x.work_completed||"")).toLowerCase().includes(q));return '<div class="page-head"><div><h1>Service history</h1><div class="muted">Maintenance records</div></div><button id="addS" class="primary">+ Log service</button></div><div class="toolbar"><input type="search" id="sq" aria-label="Search service history" placeholder="Search services" value="'+esc(S.serviceSearch||"")+'"></div><div class="panel table-wrap"><table class="table ops-cards-table ops-service-table"><thead><tr><th>Date</th><th>Machine</th><th>Work</th><th>Hours</th><th>Photos</th><th>By</th></tr></thead><tbody>'+a.map(x=>{let photos=S.photos.filter(p=>p.service_id===x.id);return '<tr><td>'+fmt(x.service_date)+'</td><td>'+esc(getMachine(x.machine_id))+'</td><td>'+esc(x.work_completed)+'</td><td>'+Number(x.hour_reading||0)+'</td><td>'+(photos.length?photos.map((p,i)=>'<a href="'+esc(p.url)+'" target="_blank" rel="noopener">View '+(i+1)+'</a>').join(" · "):"—")+'</td><td>'+esc(name(x.recorded_by))+'</td></tr>'}).join("")+'</tbody></table></div>'}
// Management reporting reflects recorded events and a CURRENT fleet snapshot.
// It must never mislabel current status as historical fleet availability.
function reportModel(days=S.reportDays||30,now=Date.now()){
 const from=now-days*86400000;
 const active=S.m||[];
 const breakdowns=(S.b||[]).filter(b=>{
   const started=Date.parse(b.started_at);
   const resolved=b.resolved_at?Date.parse(b.resolved_at):now;
   return Number.isFinite(started)&&Number.isFinite(resolved)&&started<=now&&resolved>=from;
 });
 const services=(S.s||[]).filter(x=>{
   const when=Date.parse(x.service_date||x.created_at);
   return Number.isFinite(when)&&when>=from&&when<=now;
 });
 const downtimeMinutes=b=>{
   const start=Date.parse(b.started_at);
   const stop=b.resolved_at?Date.parse(b.resolved_at):now;
   if(!Number.isFinite(start)||!Number.isFinite(stop))return 0;
   return Math.max(0,Math.min(stop,now)-Math.max(start,from))/60000;
 };
 const rows=active.map(m=>{
   const breaks=breakdowns.filter(b=>b.machine_id===m.id);
   const serviced=services.filter(x=>x.machine_id===m.id);
   const minutes=breaks.reduce((n,b)=>n+downtimeMinutes(b),0);
   return {
     machine:m.name||m.fleet_id||"Unknown",fleet_id:m.fleet_id||"",
     site:m.site||"Not specified",status:norm(m.status)||"unknown",
     hours:Number(m.hours||0),
     breakdowns:breaks.filter(b=>Date.parse(b.started_at)>=from).length,
     open:breaks.filter(b=>!b.resolved_at).length,
     downtime_minutes:Math.round(minutes),
     services:serviced.length,
     service_due:serviceSchedule(m).due?"Due":"Not due"
   };
 });
 const totalDowntime=rows.reduce((sum,r)=>sum+r.downtime_minutes,0);
 const summary={
   machines:rows.length,
   working:rows.filter(r=>r.status==="working").length,
   breakdown:rows.filter(r=>r.status==="breakdown").length,
   open:breakdowns.filter(b=>!b.resolved_at).length,
   breakdowns:breakdowns.filter(b=>Date.parse(b.started_at)>=from).length,
   serviceCount:services.length,
   due:rows.filter(r=>r.service_due==="Due").length,
   downtimeHours:Number((totalDowntime/60).toFixed(1))
 };
 return {days,from,now,rows,breakdowns,services,summary,downtimeMinutes};
}
function reports(){
 if(!mgr())return '<div class="panel"><h2>Management access required</h2></div>';
 const r=reportModel(),summary=r.summary;
 const start=new Date(r.from).toLocaleDateString();
 const end=new Date(r.now).toLocaleDateString();
 const kpi=(label,value,small)=>'<div class="report-stat"><small>'+esc(label)+'</small><strong>'+esc(value)+'</strong><span>'+esc(small)+'</span></div>';
 const table=r.rows.slice().sort((a,b)=>b.downtime_minutes-a.downtime_minutes).map(m=>
  '<tr><td>'+esc(m.machine)+'<small>'+esc(m.fleet_id)+'</small></td>'+
  '<td>'+esc(m.site)+'</td><td>'+esc(m.status)+'</td>'+
  '<td>'+m.breakdowns+'</td><td>'+m.open+'</td>'+
  '<td>'+Number(m.downtime_minutes/60).toFixed(1)+'</td><td>'+m.services+'</td>'+
  '<td>'+esc(m.service_due)+'</td></tr>').join("");
 return '<div class="report-page">'+
 '<div class="page-head"><div><h1>Management reports</h1><p class="muted">Recorded maintenance and breakdowns · Current fleet snapshot</p></div></div>'+
 '<div class="report-toolbar"><div><label for="reportPeriod">Reporting period</label><select id="reportPeriod">'+
 [7,30,90].map(n=>'<option value="'+n+'" '+(r.days===n?'selected':'')+'>Last '+n+' days</option>').join("")+
 '</select></div><button id="reportPrint" type="button" class="primary">Print / Save as PDF</button></div>'+
 '<div class="report-print-title"><strong>Phatsema Fleet Operations</strong><span>Management report · '+esc(start)+' — '+esc(end)+'</span></div>'+
 '<div class="report-stats">'+
 kpi("Fleet online now",summary.working+"/"+summary.machines,"Current working status")+
 kpi("Open breakdowns",summary.open,"Currently unresolved")+
 kpi("Reported breakdowns",summary.breakdowns,"Started within selected period")+
 kpi("Recorded downtime",summary.downtimeHours+" h","Overlapping selected period")+
 kpi("Services logged",summary.serviceCount,"Within selected period")+
 kpi("Service overdue",summary.due,"Current service schedule")+
 '</div>'+
 '<div class="panel report-table-panel"><div class="report-table-title"><div><h2>Machine performance summary</h2><p class="muted">Breakdown hours cover recorded periods only. Current machine status is not a historical availability percentage.</p></div>'+
 '<button type="button" class="secondary reportExport" data-report="summary">Export summary CSV</button></div>'+
 '<div class="table-wrap"><table class="table report-table"><thead><tr><th>Machine</th><th>Site</th><th>Current status</th><th>New breakdowns</th><th>Open</th><th>Downtime (h)</th><th>Services</th><th>Due</th></tr></thead><tbody>'+
 (table||'<tr><td colspan="8" class="empty">No machines found.</td></tr>')+
 '</tbody></table></div></div>'+
 '<div class="report-export-grid">'+ '<div class="panel"><h3>Breakdown history</h3><p class="muted">Export date, machine, problem, assignment, repair outcome and time recorded in this period.</p><button class="secondary reportExport" data-report="breakdowns">Export breakdown CSV</button></div>'+
 '<div class="panel"><h3>Service history</h3><p class="muted">Export service date, machine, meter reading and work completed in this period.</p><button class="secondary reportExport" data-report="services">Export service CSV</button></div></div>'+
 '<p class="report-disclaimer">Generated '+esc(new Date(r.now).toLocaleString())+
 '. Source: recorded machine, breakdown and service data. Production time is estimated from recorded machine status, not physical machine telemetry. Downtime and fleet counts require operational verification.</p>'+
 '</div>';
}
// Neutralizes CSV formula injection in spreadsheets without corrupting numbers.
function reportCsvCell(value){
 let t=String(value==null?"":value);
 if(/^[\s\x00-\x1f]*[=+\-@]/.test(t))t="'"+t;
 return '"'+t.replace(/"/g,'""')+'"';
}
function reportCSV(rows){
 return "\ufeff"+rows.map(row=>row.map(reportCsvCell).join(",")).join("\r\n")+"\r\n";
}
function reportExportData(type,period=reportModel()){
 const {rows,breakdowns,services,downtimeMinutes}=period;
 if(type==="summary")return [
  ["Machine","Fleet ID","Site","Current status","Hour reading","Breakdowns started","Open breakdowns","Recorded downtime hours","Services","Service due"],
  ...rows.map(x=>[x.machine,x.fleet_id,x.site,x.status,x.hours,x.breakdowns,x.open,
    (x.downtime_minutes/60).toFixed(1),x.services,x.service_due])
 ];
 if(type==="breakdowns")return [
  ["Machine","Started","Resolved","Status","Reason","Assigned to","Reported by","Downtime hours in period","Repair notes","Not ready reason"],
  ...breakdowns.map(b=>[getMachine(b.machine_id),b.started_at,b.resolved_at||"",
    b.resolved_at?"Resolved":"Open",b.reason||"",name(b.assigned_to),
    name(b.reported_by),(downtimeMinutes(b)/60).toFixed(2),b.repair_notes||"",b.not_ready_reason||""])
 ];
 if(type==="services")return [
  ["Machine","Date","Meter reading","Work completed","Notes","Logged by"],
  ...services.map(s=>[getMachine(s.machine_id),s.service_date||s.created_at,
    s.hour_reading,s.work_completed||"",s.notes||"",name(s.recorded_by)])
 ];
 throw new Error("Unknown report type.");
}
function exportFleetReport(event){
 if(!mgr())return toast("Management access required",true);
 const type=event?.currentTarget?.dataset?.report||"summary";
 try{
  const content=reportCSV(reportExportData(type));
  const file=new Blob([content],{type:"text/csv;charset=utf-8"});
  const url=URL.createObjectURL(file);
  const anchor=document.createElement("a");
  anchor.href=url;
  anchor.download="phatsema-"+type+"-last-"+(S.reportDays||30)+"-days.csv";
  anchor.style.display="none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(()=>URL.revokeObjectURL(url),5000);
  toast("CSV report downloaded");
 }catch(e){toast("Report export failed: "+(e.message||String(e)),true)}
}
function people(){
 const isHead=realHead();
 const rows=(S.people||[]).map(p=>{
   const grants=activeGrants(p.id);
   const role=String(p.role||"").replaceAll("_"," ");
   const chips=isHead&&grants.length?grants.map(g=>'<span class="access-chip">'+esc(accessLabel(g.permission))+' until '+esc(new Date(g.expires_at).toLocaleString())+'</span>').join(" "):'<span class="muted">Standard role</span>';
   const action=isHead&&p.active&&p.role!=="head_of_operations"
     ?'<button class="primary manageAccess" type="button" data-id="'+esc(p.id)+'">Manage access</button>'
     :(isHead?'<span class="muted">—</span>':"");
   return '<tr><td data-label="Name"><strong>'+esc(p.full_name||((p.first_name||"")+" "+(p.surname||"")).trim()||p.username)+'</strong></td><td data-label="Username">'+esc(p.username||"—")+'</td><td data-label="Role">'+esc(role)+'</td><td data-label="Status">'+(p.active?"Active":"Disabled")+'</td>'+
    (isHead?'<td data-label="Temporary access"><div class="access-pills">'+chips+'</div></td><td data-label="Actions">'+action+'</td>':"")+'</tr>';
 }).join("");
 return '<div class="page-head"><div><h1>People</h1><div class="muted">Employees, roles'+(isHead?' and temporary task access':"")+' · '+(S.people||[]).length+' registered</div></div>'+ '<div class="people-actions">'+(isHead?'<button id="addEmployee" class="primary" type="button">＋ Add employee</button>':'')+'<button id="peopleRefresh" class="secondary" type="button">↻ Refresh</button></div></div>'+
  (isHead?'<div class="panel access-help"><h3>Temporary access delegation</h3><p>Choose exactly what another employee may do while you are unavailable. Their normal role stays unchanged. Access expires automatically and you can revoke it immediately.</p><p class="muted">Only the Head of Operations can grant or revoke access. Access to users, roles and permanent permissions cannot be delegated here.</p></div>':"")+
  (isHead&&!S.accessReady?'<div class="notice">Temporary access controls are unavailable. Refresh the page to retry; no permission changes can be made.</div>':"")+
  '<div class="panel table-wrap people-table-wrap"><table class="table people-table"><thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Status</th>'+
  (isHead?'<th>Temporary access</th><th>Actions</th>':"")+'</tr></thead><tbody>'+rows+'</tbody></table></div>';
}

function addEmployee(){
  if(!realHead()){toast("Only Head of Operations can add employees.",true);return}
  const html='<div class="employee-form">'+
    '<p class="muted">Add an employee and choose their role. Head of Operations access is not assigned through this form.</p>'+
    '<div class="form-grid">'+
    '<div><label for="newFirst">First name</label><input id="newFirst" name="first_name" maxlength="80" required></div>'+
    '<div><label for="newSurname">Surname</label><input id="newSurname" name="surname" maxlength="80" required></div>'+
    '<div><label for="newUsername">Username</label><input id="newUsername" name="username" minlength="3" maxlength="32" pattern="[A-Za-z0-9][A-Za-z0-9._-]{2,31}" autocapitalize="off" autocomplete="off" placeholder="e.g. thabo.m" required></div>'+
    '<div><label for="newEmail">Employee email</label><input id="newEmail" name="email" type="email" autocomplete="off" maxlength="254" required></div>'+
    '<div><label for="newWhatsapp">WhatsApp (optional)</label><input id="newWhatsapp" name="whatsapp_number" type="tel" maxlength="25" placeholder="+27 82 123 4567"></div>'+
    '<div><label for="newRole">Employee role</label><select id="newRole" name="role" required>'+
    '<option value="assistant_mechanic">Assistant / Mechanic</option>'+
    '<option value="foreman">Foreman</option>'+
    '<option value="operations_manager">Operations Manager</option></select></div></div>'+
    '<div class="employee-method"><label for="newMode">Account setup</label>'+
    '<select id="newMode" name="mode"><option value="invite">Email invitation (recommended)</option><option value="temporary_password">Temporary password</option></select>'+
    '<p class="muted" id="newModeHelp">The employee receives an invitation and sets their own password.</p></div>'+
    '<div class="employee-temp hidden" id="newPasswordFields"><label for="newPassword">Temporary password</label>'+
    '<div class="employee-password-row"><input id="newPassword" name="password" type="password" minlength="12" maxlength="128" autocomplete="new-password">'+
    '<button id="newGenerate" type="button" class="secondary">Generate</button>'+
    '<button id="newReveal" type="button" class="secondary">Show</button></div>'+
    '<p class="muted">Share this password privately and ask the employee to change it.</p></div></div>';
  modal("Add employee",html,async form=>{
    if(!realHead())throw new Error("Only Head of Operations can add employees.");
    const first=String(form.get("first_name")||"").trim();
    const surname=String(form.get("surname")||"").trim();
    const email=String(form.get("email")||"").trim().toLowerCase();
    const username=String(form.get("username")||"").trim().toLowerCase();
    const role=String(form.get("role")||"");
    const mode=String(form.get("mode")||"invite");
    const password=String(form.get("password")||"");
    const whatsapp=String(form.get("whatsapp_number")||"").trim();
    if(!first||!surname)throw new Error("Enter a first name and surname.");
    if(!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username))throw new Error("Username must be 3–32 characters.");
    if(!["assistant_mechanic","foreman","operations_manager"].includes(role))throw new Error("Select a valid employee role.");
    if(!["invite","temporary_password"].includes(mode))throw new Error("Invalid account setup method.");
    if(mode==="temporary_password"&&password.length<12)throw new Error("Temporary password must be at least 12 characters.");
    const body={first_name:first,surname,email,username,role,mode,whatsapp_number:whatsapp};
    if(mode==="temporary_password")body.password=password;
    const {data,error}=await db.functions.invoke("employee-management-v1",{body});
    if(error){
      let message=error.message||"Employee creation failed.";
      if(error.context&&typeof error.context.json==="function"){
        try{const details=await error.context.json();message=details.error||message}catch(_){}
      }
      throw new Error(message);
    }
    if(!data?.ok)throw new Error(data?.error||"Employee creation failed.");
    await load();
    showEmployeeCreated({...data,first_name:first,surname,password:mode==="temporary_password"?password:""});
  });
  const mode=$("newMode"),fields=$("newPasswordFields"),password=$("newPassword"),help=$("newModeHelp");
  const sync=()=>{
    const temp=mode.value==="temporary_password";
    fields.classList.toggle("hidden",!temp);
    password.required=temp;
    help.textContent=temp?"The employee can sign in immediately. Share their temporary password privately.":"The employee receives an invitation and sets their own password.";
    const submit=$("mf")?.querySelector('button[type="submit"]');
    if(submit)submit.textContent=temp?"Create employee":"Send invitation";
  };
  mode.onchange=sync;sync();
  $("newGenerate").onclick=()=>{
    const alphabet="ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#%&";
    const bytes=crypto.getRandomValues(new Uint8Array(20));
    password.value=Array.from(bytes,b=>alphabet[b%alphabet.length]).join("");
    password.type="text";$("newReveal").textContent="Hide";
  };
  $("newReveal").onclick=()=>{
    const visible=password.type==="text";
    password.type=visible?"password":"text";
    $("newReveal").textContent=visible?"Show":"Hide";
  };
}
function showEmployeeCreated(employee){
  const invited=employee.mode==="invite";
  const details=invited
    ?'<p class="muted">The employee should check their email (including spam), accept the invitation and create a password. Delivery depends on Supabase email settings.</p>'
    :'<p class="muted">Share the temporary password privately. After signing in, the employee can change it under Guide → Change my password. It will not be shown again after closing this window.</p>'+
     '<label for="employeeCreatedPassword">Temporary password</label>'+
     '<div class="employee-password-row"><input type="text" id="employeeCreatedPassword" value="'+esc(employee.password)+'" readonly>'+
     '<button id="employeeCopyPassword" class="secondary" type="button">Copy</button></div>';
  $("modalRoot").innerHTML='<div class="modal-backdrop"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="employeeCreatedTitle">'+
    '<div class="employee-success-mark">✓</div><h2 id="employeeCreatedTitle">'+(invited?"Invitation requested":"Employee created")+'</h2>'+
    '<p><strong>'+esc(employee.first_name+" "+employee.surname)+'</strong></p>'+
    '<p>Username: <strong>'+esc(employee.username)+'</strong></p>'+
    '<p>Email: <strong>'+esc(employee.email)+'</strong></p>'+
    details+'<div class="modal-actions"><button id="employeeCreatedDone" class="primary" type="button">Done</button></div></div></div>';
  $("employeeCreatedDone").onclick=()=>$("modalRoot").innerHTML="";
  if(!invited)$("employeeCopyPassword").onclick=async()=>{
    try{await navigator.clipboard.writeText(employee.password);toast("Password copied")}
    catch(_){$("employeeCreatedPassword").select();toast("Select and copy the password manually.",true)}
  };
}
function manageAccess(userId){
 if(!realHead()||!S.accessReady)return;
 const person=S.people.find(p=>p.id===userId);
 if(!person||!person.active||person.role==="head_of_operations")return;
 const granted=activeGrants(userId);
 const current=granted.length?
 granted.map(g=>'<div class="access-current"><div><strong>'+esc(accessLabel(g.permission))+'</strong><div class="muted">Expires '+esc(new Date(g.expires_at).toLocaleString())+'</div><div class="muted">Reason: '+esc(g.reason||"—")+'</div></div><button type="button" class="danger revokeAccess" data-grant-id="'+esc(g.id)+'">Revoke</button></div>').join("")
 :'<p class="muted">No active temporary permissions.</p>';
 const body='<div class="muted">Employee: <strong>'+esc(person.full_name||person.username)+'</strong> · '+esc(String(person.role||"").replaceAll("_"," "))+'</div>'+
 '<h3>Currently granted</h3><div class="access-current-list">'+current+'</div><h3>Grant permissions</h3>'+
 '<div class="access-permission-list">'+
 '<label class="access-choice"><input type="checkbox" name="permission" value="manage_fleet"><span><strong>Manage Fleet</strong><small>Add/remove machines, change status and increase machine hours</small></span></label>'+
 '<label class="access-choice"><input type="checkbox" name="permission" value="next_service"><span><strong>Set Next Service</strong><small>Change the next scheduled service hour reading or date</small></span></label>'+
 '<label class="access-choice"><input type="checkbox" name="permission" value="correct_hours"><span><strong>Correct Machine Hours</strong><small>Increase or decrease hours with an audit reason</small></span></label></div>'+
 '<label>Access duration</label><select name="duration" required><option value="1">1 hour</option><option value="4" selected>4 hours</option><option value="8">8 hours</option><option value="24">24 hours</option><option value="72">3 days</option><option value="168">7 days</option></select>'+
 '<label>Reason for temporary access</label><textarea name="reason" minlength="5" maxlength="500" rows="3" required placeholder="e.g. Covering urgent maintenance approvals while I am unavailable"></textarea>'+
 '<p class="muted">Temporary access never changes their permanent role. You may turn it off here at any time.</p>';
 modal("Temporary access — "+person.full_name,body,async form=>{
   const scopes=form.getAll("permission").map(String);
   const duration=Number(form.get("duration"));
   const reason=String(form.get("reason")||"").trim();
   if(!scopes.length)throw new Error("Choose at least one permission.");
   if(![1,4,8,24,72,168].includes(duration))throw new Error("Choose a valid duration.");
   if(reason.length<5||reason.length>500)throw new Error("Provide a reason between 5 and 500 characters.");
   const {error}=await db.rpc("grant_temporary_access",{
     p_user_id:userId,p_permissions:scopes,p_duration_hours:duration,p_reason:reason
   });
   if(error)throw error;
   $("modalRoot").innerHTML="";
   toast("Temporary access granted to "+(person.full_name||person.username));
   await load();
 });
 document.querySelectorAll(".revokeAccess").forEach(button=>button.onclick=async()=>{
   if(!realHead())return;
   const id=button.dataset.grantId;
   if(!confirm("Revoke this employee's temporary permission immediately?"))return;
   button.disabled=true;
   try{
     const {data,error}=await db.rpc("revoke_temporary_access",{p_grant_id:id});
     if(error)throw error;
     if(!data)throw new Error("Access is already revoked.");
     $("modalRoot").innerHTML="";
     toast("Temporary access revoked");
     await load();
     if(S.view==="people")manageAccess(userId);
   }catch(err){button.disabled=false;toast(err.message||String(err),true)}
 });
}
function settings(){let g=k=>S.settings.find(x=>x.key===k)?.value,enabled=g("whatsapp_alerts_enabled")!==false;return '<div class="page-head"><div><h1>Settings</h1><div class="muted">Fleet control & automatic service alerts</div></div><div>'+'<button id="save" class="primary">Save settings</button></div></div><div class="panel"><div class="form-grid"><div><label>Service interval (hours)</label><input id="si" type="number" min="1" value="'+esc(g("service_interval_hours")??500)+'"></div><div><label>WhatsApp alert threshold (hours before service)</label><input id="sw" type="number" min="0" value="'+esc(g("service_warning_hours")??50)+'"></div><div><label>WhatsApp recipient number</label><input id="wn" inputmode="tel" placeholder="e.g. 27821234567" value="'+esc(g("whatsapp_alert_number")??"")+'"></div><div><label>Automatic WhatsApp alerts</label><select id="we"><option value="true" '+(enabled?'selected':'')+'>Enabled</option><option value="false" '+(!enabled?'selected':'')+'>Disabled</option></select></div></div><p class="muted">When a machine reaches the configured warning threshold, Phatsema sends the service alert to the WhatsApp number entered above. The same machine will not be alerted again until a new service record starts the next service cycle.</p></div>'}function audit(){return '<div class="page-head"><div><h1>Audit log</h1><div class="muted">A clear history of changes and actions across the fleet</div></div><button id="ar" class="secondary">↻ Refresh</button></div><div class="audit-toolbar"><div class="audit-search"><span>⌕</span><input id="auditSearch" placeholder="Search audit history…"></div><select id="auditAction"><option value="">All actions</option></select><div class="audit-count" id="auditCount">Loading…</div></div><div id="aud" class="audit-list"><div class="audit-loading">Loading audit history…</div></div>'}function guide(){
 return '<div class="page-head"><div><h1>Training guide</h1><p class="muted">A quick reference for the Phatsema team</p></div></div>'+
 '<div class="ops-training-grid">'+
 '<section class="panel"><h2>Reporting a breakdown</h2><p>Open <strong>Breakdowns → Report issue</strong>, choose the machine, describe the problem and assign a technician where appropriate. A machine marked Breakdown stops accumulating Live Production Time.</p></section>'+
 '<section class="panel"><h2>Repair completed</h2><p>The assigned technician or management uses <strong>Repair complete</strong>, adds repair notes and confirms whether the machine can return to Working. Otherwise it remains on Breakdown with a reason.</p></section><section class="panel"><h2>Breakdown photos and assignment</h2><p>Report issues with optional photo evidence, or use <strong>Attach photos</strong> later. A foreman or manager assigns or reassigns a technician.</p></section><section class="panel"><h2>Management reports</h2><p>Managers open <strong>Reports</strong>, choose a 7, 30 or 90-day window, download machine/breakdown/service CSV reports, or use <strong>Print / Save as PDF</strong>. Current fleet status is a snapshot, not historical availability.</p></section>'+
 '<section class="panel"><h2>Log service</h2><p>Select <strong>Service → Log service</strong>, provide the physical meter reading and the maintenance performed. Attach photos as evidence where available. Engine hours are separate from Live Production Time.</p></section>'+
 '<section class="panel"><h2>Set next service</h2><p>Head of Operations or an employee with temporary <strong>Set Next Service</strong> access can adjust due hours or the due date. This does not modify Current Hours.</p></section>'+
 '<section class="panel"><h2>Correct machine hours</h2><p>The Head of Operations or a temporarily authorized employee can correct a meter reading up or down and must provide a reason. Each correction is recorded in Audit.</p></section>'+
 '<section class="panel"><h2>Temporary access</h2><p>The Head opens <strong>People → Manage access</strong>, selects the permissions, sets an expiry and records a reason. Access can be revoked immediately and otherwise ends automatically at expiry. Permanent roles remain unchanged.</p></section>'+
 '<section class="panel"><h2>Employee onboarding</h2><p>Head of Operations: open <strong>People → Add employee</strong>, choose the role, and invite by email or create a temporary password. Invitations let employees choose their own password. Temporary passwords must be shared privately.</p></section>'+
 '<section class="panel"><h2>Your password</h2><p>Change the temporary password after signing in. Use a unique password of at least 12 characters.</p><button type="button" class="primary" id="changeMyPassword">Change my password</button></section>'+
 '</div>';
}
function getMachine(id){return S.m.find(x=>x.id===id)?.name||"Unknown"}function modal(title,body,fn){
 const root=$("modalRoot");
 root.innerHTML='<div class="modal-backdrop" id="mb"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle">'+
 '<h2 id="modalTitle">'+esc(title)+'</h2><form id="mf">'+body+
 '<p id="modalFeedback" class="message" role="alert" aria-live="polite"></p>'+
 '<div class="modal-actions"><button type="button" class="secondary" id="cancel">Cancel</button>'+
 '<button type="submit" class="primary">Save</button></div></form></div></div>';
 const form=$("mf"),save=form.querySelector('button[type="submit"]'),feedback=$("modalFeedback");
 $("cancel").onclick=()=>{if(!save.disabled)root.innerHTML=""};
 root.querySelector(".modal-backdrop").addEventListener("keydown",e=>{
  if(e.key==="Escape"&&!save.disabled){e.preventDefault();root.innerHTML=""}
 });
 form.onsubmit=async e=>{
  e.preventDefault();
  if(save.disabled)return;
  save.disabled=true;
  save.textContent="Saving…";
  feedback.textContent="";
  try{await fn(new FormData(form))}
  catch(error){const message=error?.message||String(error);feedback.textContent=message;toast(message,true)}
  finally{save.disabled=false;save.textContent="Save"}
 };
 const first=form.querySelector('input:not([disabled]),select,textarea');
 if(first&&typeof first.focus==="function")first.focus({preventScroll:true});
}
async function load(){
 const errEl=$("loadErr");
 if(errEl){errEl.textContent="Updating fleet data…";errEl.setAttribute("role","status")}
 const results=await Promise.allSettled([
  db.from("machines").select("*").eq("active",true).order("name"),
  db.from("breakdowns").select("*").order("started_at",{ascending:false}),
  db.from("services").select("*").order("service_date",{ascending:false}),
  db.from("service_photos").select("*").order("created_at",{ascending:true}),
  db.from("breakdown_photos").select("*").order("created_at",{ascending:true}),
  db.from("profiles").select("*").order("full_name"),
  db.from("app_settings").select("*"),
  db.from("machine_production_clocks").select("machine_id,accumulated_seconds,running_since"),
  db.from("temporary_access_grants").select("id,user_id,permission,granted_at,expires_at,revoked_at,granted_by,reason")
 ]);
 const [m,b,s,ph,bph,pe,se,cl,gr]=results,failed=[];
 function rows(r,label,fallback){
   if(r.status!=="fulfilled"){failed.push(label+": "+(r.reason?.message||"connection failed"));return fallback}
   if(!r.value){failed.push(label+": no database response received");return fallback}
   if(r.value.error){failed.push(label+": "+r.value.error.message);return fallback}
   return r.value.data||[];
 }
 const machines=rows(m,"machines",S.m);
 const existingClocks=new Map((S.m||[]).map(v=>[v.id,{accumulated_seconds:v.production_seconds,running_since:v.production_started_at}]));
 const clocks=rows(cl,"production clocks",null);
 const clockMap=new Map((clocks||[]).map(c=>[c.machine_id,c]));
 S.m=machines.map(machine=>{
   const clock=clockMap.get(machine.id)||existingClocks.get(machine.id);
   return {...machine,production_seconds:clock?Number(clock.accumulated_seconds):undefined,
     production_started_at:clock?.running_since||null};
 });
 S.b=rows(b,"breakdowns",S.b);
 S.s=rows(s,"services",S.s);
 S.people=rows(pe,"people",S.people);
 S.settings=rows(se,"settings",S.settings);
 const grants=rows(gr,"temporary access",null);
 S.accessReady=grants!==null;
 if(S.accessReady)S.grants=grants;
 const photoRows=rows(ph,"service photos",null);
 if(photoRows!==null){
   const signed=await Promise.allSettled(photoRows.map(async photo=>{
     const result=await db.storage.from("fleet-evidence").createSignedUrl(photo.storage_path,3600);
     if(result.error)throw result.error;
     return {...photo,url:result.data.signedUrl};
   }));
   S.photos=signed.filter(r=>r.status==="fulfilled").map(r=>r.value);
   const missed=signed.filter(r=>r.status==="rejected");
   if(missed.length)failed.push(missed.length+" service photo(s) unavailable");
 }
 const breakdownPhotoRows=rows(bph,"breakdown photos",null);
 if(breakdownPhotoRows!==null){
   const signed=await Promise.allSettled(breakdownPhotoRows.map(async photo=>{
     const result=await db.storage.from("fleet-evidence").createSignedUrl(photo.storage_path,3600);
     if(result.error)throw result.error;
     return {...photo,url:result.data.signedUrl};
   }));
   S.breakdownPhotos=signed.filter(p=>p.status==="fulfilled").map(p=>p.value);
   const failedPhotos=signed.filter(p=>p.status==="rejected");
   if(failedPhotos.length)failed.push(failedPhotos.length+" breakdown photo(s) unavailable");
 }
 if(m.status==="fulfilled"&&!m.value.error)S.lastLoadedAt=new Date().toISOString();
 S.loadErrors=failed;
 if(errEl){
   errEl.textContent=failed.length?"⚠ Some data could not refresh: "+failed.join(" | "):"";
   errEl.setAttribute("role",failed.length?"alert":"status");
 }
 render();
}
function bind(){
 const refresh=$("refresh");
 if(refresh)refresh.onclick=load;
 document.querySelectorAll("[data-go]").forEach(element=>element.onclick=()=>go(element.dataset.go));
 document.querySelectorAll("[data-state]").forEach(element=>element.onclick=()=>{
  S.fleetFilter={status:element.dataset.state};S.fleetSearch="";go("machines");
 });
 document.querySelectorAll("[data-filter-breakdowns]").forEach(element=>element.onclick=openBreakdowns);
 const searches=[["mq","fleetSearch"],["bq","breakdownSearch"],["sq","serviceSearch"]];
 searches.forEach(([id,key])=>{
  const input=$(id);if(!input)return;
  input.oninput=()=>{
   S[key]=input.value;
   const start=input.selectionStart,end=input.selectionEnd;
   render();
   const next=$(id);
   if(next){
    next.focus({preventScroll:true});
    if(start!==null&&end!==null)try{next.setSelectionRange(start,end)}catch(_){}
   }
  };
 });
 if($("quickBreakdown"))$("quickBreakdown").onclick=addBreakdown;
 if($("quickService"))$("quickService").onclick=addService;if($("changeMyPassword"))$("changeMyPassword").onclick=()=>showPasswordReset(false);
 if($("peopleRefresh"))$("peopleRefresh").onclick=load;if($("addEmployee"))$("addEmployee").onclick=addEmployee;
 document.querySelectorAll(".manageAccess").forEach(element=>element.onclick=()=>manageAccess(element.dataset.id));
 if($("addM"))$("addM").onclick=addMachine;
 if($("addB"))$("addB").onclick=addBreakdown;
 if($("addS"))$("addS").onclick=addService;
 if($("save"))$("save").onclick=saveSettings;
 if($("ar"))$("ar").onclick=loadAudit;
 if($("reportPeriod"))$("reportPeriod").onchange=event=>{S.reportDays=Number(event.target.value)||30;render()};
 document.querySelectorAll(".reportExport").forEach(btn=>btn.onclick=exportFleetReport);
 if($("reportPrint"))$("reportPrint").onclick=()=>window.print();
 if($("auditSearch"))$("auditSearch").oninput=renderAudit;
 if($("auditAction"))$("auditAction").onchange=renderAudit;
 document.querySelectorAll(".editHours").forEach(element=>element.onclick=()=>editMachine(element.dataset.id));
 document.querySelectorAll(".nextService").forEach(element=>element.onclick=()=>setNextService(element.dataset.id));
 document.querySelectorAll(".st").forEach(element=>element.onclick=()=>status(element.dataset.id));
 document.querySelectorAll(".rm").forEach(element=>element.onclick=()=>removeMachine(element.dataset.id));
 document.querySelectorAll(".repair").forEach(element=>element.onclick=()=>repair(element.dataset.id));
 document.querySelectorAll(".assignBreakdown").forEach(element=>element.onclick=()=>assignBreakdown(element.dataset.id));
 document.querySelectorAll(".breakdownEvidence").forEach(element=>element.onclick=()=>attachBreakdownEvidence(element.dataset.id));
 if(S.view==="audit")loadAudit();
}
function addMachine(){modal("Add machine",'<div class="form-grid"><div><label>Name</label><input name="name" required></div><div><label>Fleet ID</label><input name="fleet_id" required></div><div><label>Model</label><input name="model"></div><div><label>Site</label><input name="site"></div><div><label>Hours</label><input name="hours" type="number" value="0"></div><div><label>Status</label><select name="status"><option>working</option><option>available</option><option>maintenance</option><option>offline</option></select></div></div>',async f=>{let {error}=await db.rpc("create_machine",{p_name:f.get("name"),p_fleet_id:f.get("fleet_id"),p_model:f.get("model"),p_site:f.get("site"),p_hours:Number(f.get("hours")||0),p_status:f.get("status"),p_service_interval_hours:500,p_service_warning_hours:50});if(error)throw error;$("modalRoot").innerHTML="";toast("Machine added");load()})}function validPhotoFiles(files){
 const selected=Array.from(files||[]).filter(x=>x&&x.size);
 if(selected.length>5)throw new Error("Select no more than 5 photos per upload.");
 const types=["image/jpeg","image/png","image/webp","image/heic","image/gif"];
 for(const file of selected){
  if(!types.includes(file.type))throw new Error("Only JPG, PNG, WebP, HEIC or GIF photos are supported.");
  if(file.size>8*1024*1024)throw new Error("Each photo must be 8 MB or smaller.");
 }
 return selected;
}
async function uploadBreakdownPhotos(id,files){
 const selected=validPhotoFiles(files);
 let uploaded=0,failed=0;
 for(const file of selected){
   const cleaned=(file.name||"photo").replace(/[^a-zA-Z0-9._-]/g,"_").slice(0,95);
   const path="breakdowns/"+id+"/"+crypto.randomUUID()+"_"+cleaned;
   const result=await db.storage.from("fleet-evidence").upload(path,file,{contentType:file.type,upsert:false});
   if(result.error){failed++;continue}
   const linked=await db.from("breakdown_photos").insert({breakdown_id:id,storage_path:path});
   if(linked.error){
     failed++;
     await db.storage.from("fleet-evidence").remove([path]).catch(()=>{});
   }else uploaded++;
 }
 return {uploaded,failed};
}
function breakdownUploadText(result){
 if(!result)return "Breakdown recorded.";
 return result.failed
  ?result.uploaded+" photo(s) saved; "+result.failed+" could not upload. Use Attach photos to retry missing evidence."
  :result.uploaded+" breakdown photo(s) saved.";
}
function addBreakdown(){
 const mo=S.m.map(m=>'<option value="'+esc(m.id)+'">'+esc(m.name)+" · "+esc(m.fleet_id)+"</option>").join("");
 const people=S.people.filter(p=>p.active).map(p=>'<option value="'+esc(p.id)+'">'+esc(p.full_name||p.username)+" · "+esc(p.role)+"</option>").join("");
 const assign=mgr()?'<label>Assigned technician</label><select name="assigned_to"><option value="">Unassigned</option>'+people+'</select>'
 :'<p class="muted">A foreman or manager can assign the technician after you report the issue.</p>';
 modal("Report breakdown",
  '<label>Machine</label><select name="machine_id" required>'+mo+'</select>'+
  '<label>Problem</label><select name="reason"><option>Engine</option><option>Hydraulic</option><option>Electrical</option><option>Tyre / Track</option><option>Cooling system</option><option>Transmission</option><option>Other</option></select>'+
  assign+'<label>Notes</label><textarea name="notes" rows="4" placeholder="Symptoms, location and safety concerns"></textarea>'+
  '<label>Photo evidence (optional)</label><input name="photos" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/gif" multiple>'+
  '<p class="muted">Up to 5 photos, maximum 8 MB each. You can also attach photos later.</p>',
  async form=>{
   const files=validPhotoFiles(form.getAll("photos"));
   const {data,error}=await db.rpc("report_breakdown",{
     p_machine_id:form.get("machine_id"),p_reason:form.get("reason"),
     p_notes:form.get("notes"),p_assigned_to:mgr()?(form.get("assigned_to")||null):null
   });
   if(error)throw error;
   // Do not re-submit the successful breakdown if some evidence uploads fail.
   let evidence={uploaded:0,failed:0};
   if(files.length){
     try{evidence=await uploadBreakdownPhotos(data,files)}
     catch(_){evidence={uploaded:0,failed:files.length}}
   }
   $("modalRoot").innerHTML="";
   toast(files.length?("Breakdown reported. "+breakdownUploadText(evidence)):"Breakdown reported");
   await load();
  });
}
function assignBreakdown(id){
 if(!mgr())return toast("Management permission required to assign a repair.",true);
 const b=S.b.find(x=>x.id===id);
 if(!b||b.resolved_at)return toast("This breakdown is no longer open.",true);
 const employees=S.people.filter(p=>p.active).map(p=>
  '<option value="'+esc(p.id)+'"'+(b.assigned_to===p.id?' selected':'')+'>'+esc(p.full_name||p.username)+' · '+esc(p.role)+'</option>').join("");
 modal("Assign technician",'<p class="muted">'+esc(getMachine(b.machine_id))+' — '+esc(b.reason)+'</p>'+
 '<label>Employee responsible for repair</label><select name="technician"><option value="">Unassigned</option>'+employees+'</select>',
 async form=>{
  const {error}=await db.rpc("assign_breakdown",{p_breakdown_id:id,p_assigned_to:form.get("technician")||null});
  if(error)throw error;
  $("modalRoot").innerHTML="";
  toast("Technician assignment saved");
  await load();
 });
}
function attachBreakdownEvidence(id){
 const b=S.b.find(x=>x.id===id);
 if(!b||!canUploadBreakdownPhoto(b))return toast("You cannot attach evidence to this breakdown.",true);
 modal("Attach breakdown photos",
  '<p class="muted">'+esc(getMachine(b.machine_id))+' — '+esc(b.reason)+'</p>'+
  '<label>Choose photos</label><input type="file" name="photos" accept="image/jpeg,image/png,image/webp,image/heic,image/gif" multiple required>'+
  '<p class="muted">Up to 5 photos per upload, maximum 8 MB each. Originals remain in private storage.</p>',
  async form=>{
   const files=validPhotoFiles(form.getAll("photos"));
   if(!files.length)throw new Error("Choose at least one photo.");
   const result=await uploadBreakdownPhotos(id,files);
   $("modalRoot").innerHTML="";
   toast(breakdownUploadText(result),result.failed>0);
   await load();
  });
}
function addService(){let mo=S.m.map(m=>'<option value="'+m.id+'">'+esc(m.name)+" · "+Number(m.hours||0)+"h</option>").join("");modal("Log service",'<label>Machine</label><select name="machine_id" required>'+mo+'</select><label>Hour reading</label><input name="hours" type="number" min="0" step=".1" required><label>Work completed</label><textarea name="work" rows="4" required></textarea><label>Notes</label><textarea name="notes" rows="3"></textarea><label>Photos of work done <span class="muted">(optional)</span></label><input name="photos" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/gif" multiple><div class="muted">Add up to 8 photos. These are stored with the service record.</div>',async f=>{let files=Array.from(f.getAll("photos")||[]).filter(x=>x&&x.size).slice(0,8);let {data,error}=await db.rpc("log_service",{p_machine_id:f.get("machine_id"),p_work_completed:f.get("work"),p_hour_reading:Number(f.get("hours")),p_notes:f.get("notes")});if(error)throw error;let serviceId=data?.id||data;if(!serviceId)throw new Error("Service was logged but no service ID was returned, so photos could not be attached.");for(let file of files){let safe=(file.name||"photo").replace(/[^a-zA-Z0-9._-]/g,"_"),path="services/"+serviceId+"/"+crypto.randomUUID()+"_"+safe;let up=await db.storage.from("fleet-evidence").upload(path,file,{contentType:file.type,upsert:false});if(up.error)throw up.error;let ins=await db.from("service_photos").insert({service_id:serviceId,storage_path:path});if(ins.error)throw ins.error}$("modalRoot").innerHTML="";toast(files.length?"Service logged with "+files.length+" photo"+(files.length===1?"":"s"):"Service logged");load()})}function editMachine(id){
  const m=S.m.find(x=>x.id===id);
  if(!m)return;
  const current=Number(m.hours||0);
  const isHead=canCorrectHours();
  const minimum=isHead?0:current;
  const reasonField=isHead
    ?'<label>Reason for changing hours</label><textarea name="reason" rows="3" minlength="5" maxlength="500" placeholder="Explain the meter correction (required)" required></textarea><p class="muted">Head of Operations can increase or decrease hours. Every correction is recorded in the audit log. Existing service history, next-service settings and Live Production Time are not overwritten.</p>'
    :'<p class="muted">Hours can only be increased. Only someone with temporary Correct Hours access or the Head of Operations can decrease them.</p>';
  modal("Edit machine hours",
    '<label>Machine</label><input value="'+esc(m.name)+'" disabled>'+
    '<label>Current hours</label><input value="'+current.toLocaleString()+' h" disabled>'+
    '<label>Corrected hour reading</label><input name="hours" type="number" min="'+minimum+'" step=".1" value="'+current+'" required>'+
    reasonField,
    async form=>{
      const raw=String(form.get("hours")??"").trim();
      const hours=Number(raw);
      if(!raw||!Number.isFinite(hours)||hours<0)throw new Error("Enter a valid non-negative machine hour reading.");
      if(hours===current)throw new Error("Enter a different hour reading.");
      if(isHead){
        const reason=String(form.get("reason")||"").trim();
        if(reason.length<5||reason.length>500)throw new Error("Provide a correction reason between 5 and 500 characters.");
        const {error}=await db.rpc("correct_machine_hours",{
          p_machine_id:id,
          p_new_hours:hours,
          p_expected_hours:current,
          p_reason:reason
        });
        if(error)throw error;
      }else{
        if(hours<current)throw new Error("You need temporary Correct Hours access to reduce machine hours.");
        const {error}=await db.rpc("update_machine",{
          p_machine_id:id,p_name:m.name,p_fleet_id:m.fleet_id,
          p_model:m.model||"",p_site:m.site||"",p_hours:hours,p_status:m.status,
          p_service_interval_hours:m.service_interval_hours,
          p_service_warning_hours:m.service_warning_hours
        });
        if(error)throw error;
      }
      $("modalRoot").innerHTML="";
      toast("Machine hours updated and saved");
      await load();
    }
  );
}
function setNextService(id){let m=S.m.find(x=>x.id===id);if(!m)return;modal("Set next service for "+m.name,'<div class="form-grid"><div><label>Next service at machine hours</label><input name="hours" type="number" min="0" step=".1" value="'+(m.next_service_hours!=null?Number(m.next_service_hours):Number(m.hours||0)+Number(m.service_interval_hours||500))+'"></div><div><label>Next service date <span class="muted">(optional)</span></label><input name="date" type="date" value="'+esc(m.next_service_date||"")+'"></div></div><p class="muted">Only the Head of Operations or a temporarily authorized employee can change this schedule. You can set hours, a date, or both.</p>',async f=>{let hours=f.get("hours"),date=f.get("date"),h=hours===""?null:Number(hours);if(h!==null&&(!Number.isFinite(h)||h<0))throw new Error("Enter a valid next service hour reading.");if(h===null&&!date)throw new Error("Set a next service hour reading or service date.");let{error}=await db.rpc("set_machine_next_service",{p_machine_id:id,p_next_service_hours:h,p_next_service_date:date||null});if(error)throw error;$("modalRoot").innerHTML="";toast("Next service updated");load()})}
function status(id){modal("Change status",'<label>Status</label><select name="status"><option>working</option><option>available</option><option>breakdown</option><option>maintenance</option><option>offline</option></select><label>Reason</label><textarea name="reason"></textarea>',async f=>{let {error}=await db.rpc("set_machine_status",{p_machine_id:id,p_status:f.get("status"),p_reason:f.get("reason")||null});if(error)throw error;$("modalRoot").innerHTML="";toast("Status updated");load()})}async function removeMachine(id){let m=S.m.find(x=>x.id===id);if(!confirm("Remove "+m.name+" from the active fleet?"))return;let {error}=await db.rpc("retire_machine",{p_machine_id:id});if(error){toast(error.message,true);return}toast("Machine removed");load()}function repair(id){
 const b=S.b.find(x=>x.id===id);
 if(!b||!canFinishBreakdown(b))return toast("Only the assigned technician or management can complete this repair.",true);
 modal("Complete breakdown repair",
 '<p class="muted">'+esc(getMachine(b.machine_id))+' — '+esc(b.reason)+'</p>'+
 '<label for="repairReady">Is the machine ready to return to work?</label>'+
 '<select id="repairReady" name="ready"><option value="yes">Yes — return to Working</option><option value="no">No — keep on Breakdown</option></select>'+
 '<div id="repairNotReady" class="hidden"><label for="repairReason">Why is the machine not ready?</label>'+
 '<textarea id="repairReason" name="reason" rows="3" minlength="5" maxlength="500" placeholder="Explain remaining issue"></textarea></div>'+
 '<label for="repairNotes">Work performed / repair notes</label>'+
 '<textarea id="repairNotes" name="notes" rows="4" minlength="5" maxlength="1200" placeholder="Summarize inspection, work done and verification" required></textarea>',
 async form=>{
  const ready=form.get("ready")==="yes",reason=String(form.get("reason")||"").trim();
  const notes=String(form.get("notes")||"").trim();
  if(notes.length<5)throw new Error("Add at least 5 characters describing the repair.");
  if(!ready&&reason.length<5)throw new Error("Explain why the machine cannot return to work.");
  const {error}=await db.rpc("complete_breakdown",{
    p_breakdown_id:id,p_ready:ready,p_reason:ready?null:reason,p_notes:notes
  });
  if(error)throw error;
  $("modalRoot").innerHTML="";
  toast(ready?"Breakdown resolved; machine returned to Working":"Repair notes recorded; machine remains on Breakdown");
  await load();
 });
 const ready=$("repairReady"),reason=$("repairReason"),section=$("repairNotReady");
 const update=()=>{const no=ready.value==="no";section.classList.toggle("hidden",!no);reason.required=no;};
 ready.onchange=update;update();
}
async function saveSettings(){for(let [key,value] of [["service_interval_hours",Number($("si").value)],["service_warning_hours",Number($("sw").value)],["whatsapp_alert_number",$("wn").value.trim()],["whatsapp_alerts_enabled",$("we").value==="true"]]){let {error}=await db.from("app_settings").upsert({key,value,updated_by:S.user.id},{onConflict:"key"});if(error){toast(error.message,true);return}}toast("Settings saved");load()}function auditLabel(a){return String(a||"").replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase())}
function auditActor(id){return S.people.find(p=>p.id===id)?.full_name||S.people.find(p=>p.id===id)?.username||"System"}
function auditMachine(x){return S.m.find(m=>m.id===x.entity_id)?.name||x.details?.after?.name||x.details?.before?.name||null}
function auditDetail(x){let d=x.details||{};if(x.action==="temporary_access_granted"||x.action==="temporary_access_revoked")return accessLabel(d.permission||"access")+" · "+(x.action==="temporary_access_granted"?"Granted until "+(d.expires_at?fmt(d.expires_at):"expiry"):"Revoked")+(d.reason?" · Reason: "+d.reason:"");let from=d.from??d.before_status??d.before?.status,to=d.to??d.after_status??d.after?.status,h1=d.before_hours??d.before?.hours,h2=d.after_hours??d.after?.hours;if(x.action==="machine_hours_corrected")return "Current hours "+(d.before_hours??"—")+" → "+(d.after_hours??"—")+" · Reason: "+(d.reason||"not supplied");if(x.action==="machine_status_changed"&&from!==undefined)return "Status "+auditLabel(from)+" → "+auditLabel(to)+(d.reason?" · "+d.reason:"");if((x.action==="update_machine"||x.action==="machine_updated")&&(h1!==undefined||h2!==undefined||from!==undefined||to!==undefined)){let parts=[];if(h1!==undefined||h2!==undefined)parts.push("Hours "+(h1??"—")+" → "+(h2??"—"));if(from!==undefined||to!==undefined)parts.push("Status "+auditLabel(from??"—")+" → "+auditLabel(to??"—"));return parts.join(" · ")}let parts=[];Object.entries(d).forEach(([k,v])=>{if(k==="before"||k==="after"||v===null||v===undefined||v==="")return;let val=typeof v==="object"?JSON.stringify(v):String(v);parts.push(auditLabel(k)+": "+val)});return parts.join(" · ")||"Action recorded"}
function renderAudit(){let root=$("aud");if(!root)return;let q=norm($("auditSearch")?.value||""),action=$("auditAction")?.value||"",rows=S.audit.filter(x=>(!action||x.action===action)&&(!q||(auditLabel(x.action)+" "+x.entity_type+" "+auditActor(x.actor_id)+" "+auditDetail(x)).toLowerCase().includes(q)));let c=$("auditCount");if(c)c.textContent=rows.length+" entr"+(rows.length===1?"y":"ies");if(!rows.length){root.innerHTML='<div class="audit-empty"><div class="audit-empty-icon">✓</div><strong>No audit entries found</strong><span>Try a different search or action filter.</span></div>';return}root.innerHTML=rows.map(x=>{let machine=auditMachine(x),actor=auditActor(x),entity=machine||auditLabel(x.entity_type||"system"),initial=(actor==="System"?"S":actor.trim().charAt(0).toUpperCase());return '<article class="audit-item"><div class="audit-icon">'+initial+'</div><div class="audit-main"><div class="audit-top"><div><strong>'+esc(auditLabel(x.action))+'</strong><span class="audit-entity">'+esc(entity)+'</span></div><time>'+esc(fmt(x.created_at))+'</time></div><div class="audit-detail">'+esc(auditDetail(x))+'</div><div class="audit-meta"><span>By '+esc(actor)+'</span><span>•</span><span>'+esc(auditLabel(x.entity_type||"system"))+'</span></div></div></article>'}).join("")}
async function loadAudit(){let {data,error}=await db.from("audit_log").select("*").order("created_at",{ascending:false}).limit(100);if(error){$("aud").innerHTML='<div class="audit-empty"><strong>Could not load audit history</strong><span>'+esc(error.message)+"</span></div>";return}S.audit=data||[];let sel=$("auditAction");if(sel){let current=sel.value,actions=[...new Set(S.audit.map(x=>x.action).filter(Boolean))].sort();sel.innerHTML='<option value="">All actions</option>'+actions.map(a=>'<option value="'+esc(a)+'">'+esc(auditLabel(a))+'</option>').join("");sel.value=actions.includes(current)?current:""}renderAudit()}
let resumingUser=null;
async function login(e){if(e&&e.preventDefault)e.preventDefault();let btn=$("loginBtn"),msg=$("loginMsg");if(!db){if(msg)msg.textContent="Secure login is still loading. Please wait a moment and try again.";return}let email=$("loginEmail")?.value.trim()||"",password=$("loginPassword")?.value||"";if(!email||!password){if(msg)msg.textContent="Enter your email and password.";return}if(btn){btn.disabled=true;btn.textContent="Signing in…"}if(msg){msg.textContent="Connecting to Phatsema…";msg.classList.remove("error")}try{let result=await Promise.race([db.auth.signInWithPassword({email,password}),new Promise((_,reject)=>setTimeout(()=>reject(new Error("Login timed out. Please check your connection and try again.")),15000))]);let{data,error}=result;if(error){if(msg)msg.textContent=error.message;return}if(data?.user){if(msg)msg.textContent="Login successful. Loading your fleet…";await resume(data.user)}else if(msg)msg.textContent="Login did not return a user session. Please try again."}catch(err){if(msg)msg.textContent=err?.message||String(err);console.error("Phatsema login error",err)}finally{if(btn){btn.disabled=false;btn.textContent="Log in"}}}
async function resume(user){if(resumingUser===user.id)return;resumingUser=user.id;try{S.user=user;let{data,error}=await db.from("profiles").select("*").eq("id",user.id).maybeSingle();if(error){$("loginMsg").textContent="Profile lookup failed: "+error.message;return}if(!data){await db.auth.signOut();$("loginMsg").textContent="No Phatsema profile exists for this account.";return}S.p=data;$("userBadge").textContent=(S.p.full_name||user.email)+" · "+S.p.role;$("login").classList.add("hidden");$("app").classList.remove("hidden");try{await load()}catch(err){showFatal("Load failed: "+(err.message||String(err)))}}finally{resumingUser=null}}
function showRecovery(){return showPasswordReset()}
function showPasswordReset(invited=false){modal(invited?"Set your Phatsema password":"Set a new password",'<label>New password</label><input name="password" type="password" minlength="8" autocomplete="new-password" required><label>Confirm password</label><input name="confirm" type="password" minlength="8" autocomplete="new-password" required><p class="muted">Use at least 8 characters.</p>',async form=>{let password=String(form.get("password")||""),confirm=String(form.get("confirm")||"");if(password.length<8)throw new Error("Password must be at least 8 characters.");if(password!==confirm)throw new Error("Passwords do not match.");let{error}=await db.auth.updateUser({password});if(error)throw error;$("modalRoot").innerHTML="";await db.auth.signOut();$("login").classList.remove("hidden");$("app").classList.add("hidden");$("loginMsg").textContent="Password changed successfully. You can now log in with your new password."})}
function recoveryMessage(error){let m=error?.message||String(error||"");if(/rate limit|429|over_email_send_rate_limit/i.test(m))return"Password reset emails are temporarily rate-limited. Please wait a while before trying again.";return m}
async function requestPasswordReset(){let e=$("loginEmail").value.trim(),msg=$("loginMsg"),btn=$("forgotBtn");if(!e){msg.textContent="Enter your email first.";return}let key="phatsema-reset-last-"+e.toLowerCase(),last=Number(localStorage.getItem(key)||0),wait=Math.ceil((60000-(Date.now()-last))/1000);if(wait>0){msg.textContent=`Please wait ${wait}s before requesting another reset email.`;return}if(btn)btn.disabled=true;msg.textContent="Sending password reset email…";let{error}=await db.auth.resetPasswordForEmail(e,{redirectTo:new URL(location.href).href.split("#")[0]});if(error){msg.textContent=recoveryMessage(error);if(btn)btn.disabled=false;return}localStorage.setItem(key,String(Date.now()));msg.textContent="Password reset email sent. Check your inbox and spam folder.";setTimeout(()=>{if(btn)btn.disabled=false},60000)}
function boot(){const invited=/(?:[?#&])type=invite(?:[&#]|$)/.test(location.href);let inviteShown=false;const openInvite=()=>{if(!inviteShown){inviteShown=true;showPasswordReset(true)}};initTheme();const themeBtn=$("themeBtn");if(themeBtn){themeBtn.onclick=toggleTheme}if(!initSupabase())return;let f=$("loginForm");if(f)f.onsubmit=login;let fb=$("forgotBtn");if(fb)fb.onclick=requestPasswordReset;let lo=$("logoutBtn");if(lo)lo.onclick=async()=>{await db.auth.signOut();location.reload()};db.auth.onAuthStateChange(async(event,session)=>{if(event==="PASSWORD_RECOVERY"){showRecovery();return}if(event==="SIGNED_OUT"){S.user=null;S.p=null;$("login")?.classList.remove("hidden");$("app")?.classList.add("hidden");return}if(event==="SIGNED_IN"&&session?.user){if(invited){openInvite();return}await resume(session.user)}});db.auth.getSession().then(async({data})=>{if(location.hash.includes("type=recovery")){showRecovery();return}if(data?.session?.user){if(invited)openInvite();else await resume(data.session.user)}else $("login")?.classList.remove("hidden")}).catch(err=>showFatal(err.message||String(err)))}
window.addEventListener("error",e=>showFatal(e.message||"Unexpected error"));
window.addEventListener("unhandledrejection",e=>showFatal(e.reason?.message||String(e.reason||"Unhandled promise rejection")));
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);else boot();

// Live display is derived from server timestamps; no per-second database writes.
function productionClockSeconds(m){let base=Number(m.production_seconds||0);if(m.active&&norm(m.status)==='working'&&m.production_started_at){let start=Date.parse(m.production_started_at);if(Number.isFinite(start))base+=Math.max(0,(Date.now()-start)/1000)}return Math.max(0,base)}
function productionClockText(m){if(m.production_seconds===undefined)return 'Not configured';let secs=Math.floor(productionClockSeconds(m));let h=Math.floor(secs/3600),min=Math.floor(secs%3600/60),sec=secs%60;return h.toLocaleString()+'h '+String(min).padStart(2,'0')+'m '+String(sec).padStart(2,'0')+'s'+(m.active&&norm(m.status)==='working'&&m.production_started_at?' ●':'')}
setInterval(()=>{document.querySelectorAll('[data-production-machine]').forEach(el=>{let m=S.m?.find(x=>x.id===el.dataset.productionMachine);if(m)el.textContent=productionClockText(m)})},1000);

let productionClockRefreshing=false;
async function refreshProductionClocks(){
  if(productionClockRefreshing||!db||!S.user||!S.m.length||document.hidden)return;
  productionClockRefreshing=true;
  try{
    const [clockResult,machineResult]=await Promise.all([
      db.from("machine_production_clocks").select("machine_id,accumulated_seconds,running_since"),
      db.from("machines").select("id,status,active").eq("active",true)
    ]);
    if(clockResult.error||machineResult.error)return;
    const clocks=new Map((clockResult.data||[]).map(c=>[c.machine_id,c]));
    const machines=new Map((machineResult.data||[]).map(m=>[m.id,m]));
    let changed=S.m.some(m=>!machines.has(m.id));
    S.m=S.m.filter(m=>machines.has(m.id)).map(m=>{
      const updated=machines.get(m.id),c=clocks.get(m.id);
      if(norm(updated.status)!==norm(m.status)||updated.active!==m.active)changed=true;
      return {...m,status:updated.status,active:updated.active,
        production_seconds:c?Number(c.accumulated_seconds):undefined,
        production_started_at:c?.running_since||null};
    });
    if(changed&&(S.view==="machines"||S.view==="dashboard"))render();
  }catch(e){/* retain last known counters if temporarily offline */}
  finally{productionClockRefreshing=false}
}
setInterval(refreshProductionClocks,15000);

let accessRefreshPending=false;
// Grant/revoke changes become visible to signed-in employees without a page reload.
// Server-side permissions always take effect immediately, independent of this UI poll.
async function refreshTemporaryAccess(){
 if(accessRefreshPending||!db||!S.user||document.hidden)return;
 accessRefreshPending=true;
 try{
   const {data,error}=await db.from("temporary_access_grants")
     .select("id,user_id,permission,granted_at,expires_at,revoked_at,granted_by,reason");
   if(error)return;
   const prior=JSON.stringify((S.grants||[]).map(g=>[g.id,g.revoked_at,g.expires_at]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))));
   const current=JSON.stringify((data||[]).map(g=>[g.id,g.revoked_at,g.expires_at]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))));
   const wasReady=S.accessReady;
   S.grants=data||[];
   S.accessReady=true;
   if(prior!==current||!wasReady)render();
   else if(S.view==="people"&&realHead())render();
 }catch(_error){/* permissions remain enforced by Supabase even when temporarily offline */}
 finally{accessRefreshPending=false}
}
setInterval(refreshTemporaryAccess,20000);
document.addEventListener("visibilitychange",()=>{if(!document.hidden)refreshTemporaryAccess()});
