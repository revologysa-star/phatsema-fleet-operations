const SUPABASE_URL="https://fduccizawxtqnqtuxmjl.supabase.co",KEY="sb_publishable_BzL4VuUfWGSLOHY-9vsnuw_d5nQp0dx";

function initTheme(){const saved=localStorage.getItem("phatsema-theme");const dark=saved==="dark";document.body.classList.toggle("dark",dark);const b=document.getElementById("themeBtn");if(b)b.textContent=dark?"☀️ Light":"🌙 Dark"}
function toggleTheme(){const dark=!document.body.classList.contains("dark");document.body.classList.toggle("dark",dark);localStorage.setItem("phatsema-theme",dark?"dark":"light");const b=document.getElementById("themeBtn");if(b)b.textContent=dark?"☀️ Light":"🌙 Dark"}
document.addEventListener("DOMContentLoaded",()=>{initTheme();const b=document.getElementById("themeBtn");if(b)b.addEventListener("click",toggleTheme)});let db=null;function initSupabase(){if(!window.supabase||typeof window.supabase.createClient!=="function"){let m=document.getElementById("loginMsg");if(m)m.textContent="The Supabase connection library did not load. Please refresh the page.";return false}try{db=window.supabase.createClient(SUPABASE_URL,KEY);return true}catch(e){let m=document.getElementById("loginMsg");if(m)m.textContent="Could not initialize the secure login connection. Check the browser console for the exact error.";showFatal(e.message||String(e));return false}}let S={user:null,p:null,m:[],b:[],s:[],photos:[],people:[],settings:[],audit:[],grants:[],accessReady:false,view:"dashboard",fleetSearch:"",breakdownSearch:"",serviceSearch:"",lastLoadedAt:null,loadErrors:[]};const $=id=>document.getElementById(id),esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));const toast=(x,e)=>{let t=document.createElement("div");t.className="toast"+(e?" error":"");t.textContent=x;$("toastRoot").append(t);setTimeout(()=>t.remove(),3000)},fmt=x=>x?new Date(x).toLocaleString():"—",mgr=()=>["foreman","operations_manager","head_of_operations"].includes(S.p?.role)||S.p?.full_access===true,headOps=()=>S.p?.role==="head_of_operations"||S.p?.full_access===true,
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
function openBreakdowns(){S.view="machines";S.fleetFilter={status:"breakdown"};S.fleetSearch="";render()}function render(){let nav=[["dashboard","Dashboard"],["machines","Fleet"],["breakdowns","Breakdowns"],["services","Service"],["service_due","Service Due"],["people","People"],["settings","Settings"],["audit","Audit"],["guide","Guide"]];$("nav").innerHTML=nav.filter(x=>["dashboard","machines","breakdowns","services","guide"].includes(x[0])||(x[0]==="service_due"&&canNextService())||mgr()).map(x=>'<button data-v="'+x[0]+'" class="'+(S.view===x[0]?"active":"")+'">'+x[1]+"</button>").join("");$("nav").querySelectorAll("button").forEach(b=>b.onclick=()=>go(b.dataset.v));$("main").innerHTML=({dashboard:dash,machines:machines,breakdowns:breakdowns,services:services,people:people,settings:settings,audit:audit,service_due:serviceDue,guide:guide}[S.view]||dash)();bind()}
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
function serviceDue(){let today=new Date();today.setHours(0,0,0,0);let a=(S.m||[]).filter(m=>{let byHours=m.next_service_hours!=null&&Number(m.hours||0)>=Number(m.next_service_hours);let byDate=m.next_service_date&&new Date(m.next_service_date+"T00:00:00")<=today;return byHours||byDate}).sort((x,y)=>Number(y.hours||0)-Number(x.hours||0));return '<div class="page-head"><div><h1>Service Due</h1><div class="muted">Machines that have reached or passed their next scheduled service</div></div><button id="refresh" class="secondary">Refresh</button></div><div class="panel table-wrap"><table class="table"><thead><tr><th>Machine</th><th>Current Hours</th><th>Next Service</th><th>Status</th><th>Action</th></tr></thead><tbody>'+(a.map(m=>'<tr><td><b>'+esc(m.name)+'</b><br>'+esc(m.fleet_id)+'</td><td>'+Number(m.hours||0).toLocaleString()+'</td><td>'+serviceDueLabel(m)+'</td><td><span class="status breakdown">Due</span></td><td>'+ (canNextService()?'<button class="primary nextService" data-id="'+m.id+'">Set next service</button>':'View')+'</td></tr>').join("")||'<tr><td colspan="5" class="empty">No machines are currently due for service.</td></tr>')+'</tbody></table></div>'}
function serviceDueLabel(m){let parts=[];if(m.next_service_hours!=null)parts.push(Number(m.next_service_hours).toLocaleString()+" h");if(m.next_service_date)parts.push(new Date(m.next_service_date+"T00:00:00").toLocaleDateString());return parts.join(" / ")||"Not set"}
function machines(){let q=((S.fleetSearch??$("mq")?.value)||"").toLowerCase(),filter=S.fleetFilter?.status,a=S.m.filter(m=>(!filter||norm(m.status)===filter)&&((m.name+" "+m.fleet_id+" "+(m.model||"")+" "+(m.site||"")).toLowerCase().includes(q)));return '<div class="page-head"><div><h1>Machines</h1><div class="muted">Status, hours and fleet service schedule</div></div>'+(canFleetManage()?'<button id="addM" class="primary">+ Add machine</button>':"")+'</div><div class="toolbar"><input type="search" id="mq" aria-label="Search machines" placeholder="Search machines" value="'+esc(S.fleetSearch||"")+'>"</div><div class="panel table-wrap"><table class="table"><thead><tr><th>Machine</th><th>Status</th><th>Hours</th><th>Live Production</th><th>Next Service Due</th><th>Site</th><th>Actions</th></tr></thead><tbody>'+(a.map(m=>{let due=(m.next_service_hours!=null&&Number(m.hours||0)>=Number(m.next_service_hours))||(m.next_service_date&&new Date(m.next_service_date+"T00:00:00")<=new Date(new Date().toISOString().slice(0,10)+"T00:00:00"));return '<tr><td><b>'+esc(m.name)+'</b><br>'+esc(m.fleet_id)+'</td><td><span class="status '+esc(m.status)+'">'+esc(m.status)+'</span></td><td>'+Number(m.hours||0).toLocaleString()+'</td><td><span class="production-clock" data-production-machine="'+esc(m.id)+'">'+productionClockText(m)+'</span></td><td><span class="status '+(due?"breakdown":"available")+'">'+esc(serviceDueLabel(m))+(due?" · DUE":"")+'</span></td><td>'+esc(m.site||"—")+'</td><td>'+((canFleetManage()||canCorrectHours()||canNextService())?
 (canFleetManage()||canCorrectHours()?'<button class="secondary editHours" data-id="'+m.id+'">Edit hours</button> ':"")+
 (canFleetManage()?'<button class="secondary st" data-id="'+m.id+'">Status</button> ':"")+
 (canNextService()?'<button class="secondary nextService" data-id="'+m.id+'">Next service</button> ':"")+
 (canFleetManage()?'<button class="danger rm" data-id="'+m.id+'">Remove</button>':"")
 :"View")+"</td></tr>"}).join("")||'<tr><td colspan="7" class="empty">No machines.</td></tr>')+"</tbody></table></div>"}
function breakdowns(){let q=(S.breakdownSearch||"").toLowerCase(),a=S.b.filter(b=>(getMachine(b.machine_id)+" "+(b.reason||"")).toLowerCase().includes(q));return '<div class="page-head"><div><h1>Breakdowns</h1><div class="muted">Report and complete repairs</div></div><button id="addB" class="primary">+ Report issue</button></div><div class="toolbar"><input type="search" id="bq" aria-label="Search breakdowns" placeholder="Search breakdowns" value="'+esc(S.breakdownSearch||"")+'>"</div><div class="panel table-wrap"><table class="table"><thead><tr><th>Machine</th><th>Problem</th><th>Started</th><th>Status</th><th>Assigned</th><th>Action</th></tr></thead><tbody>'+(a.map(b=>'<tr><td>'+esc(getMachine(b.machine_id))+'</td><td>'+esc(b.reason)+'</td><td>'+fmt(b.started_at)+'</td><td>'+ (b.resolved_at?"Resolved":"Open")+'</td><td>'+esc(name(b.assigned_to))+'</td><td>'+(!b.resolved_at?'<button class="primary repair" data-id="'+b.id+'">Repair complete</button>':esc(b.not_ready_reason||"Resolved"))+"</td></tr>").join("")||'<tr><td colspan="6" class="empty">No breakdowns.</td></tr>')+"</tbody></table></div>"}function services(){let q=(S.serviceSearch||"").toLowerCase(),a=S.s.filter(x=>(getMachine(x.machine_id)+" "+(x.work_completed||"")).toLowerCase().includes(q));return '<div class="page-head"><div><h1>Service history</h1><div class="muted">Maintenance records</div></div><button id="addS" class="primary">+ Log service</button></div><div class="toolbar"><input type="search" id="sq" aria-label="Search service history" placeholder="Search services" value="'+esc(S.serviceSearch||"")+'>"</div><div class="panel table-wrap"><table class="table"><thead><tr><th>Date</th><th>Machine</th><th>Work</th><th>Hours</th><th>Photos</th><th>By</th></tr></thead><tbody>'+a.map(x=>{let photos=S.photos.filter(p=>p.service_id===x.id);return '<tr><td>'+fmt(x.service_date)+'</td><td>'+esc(getMachine(x.machine_id))+'</td><td>'+esc(x.work_completed)+'</td><td>'+Number(x.hour_reading||0)+'</td><td>'+(photos.length?photos.map((p,i)=>'<a href="'+esc(p.url)+'" target="_blank" rel="noopener">View '+(i+1)+'</a>').join(" · "):"—")+'</td><td>'+esc(name(x.recorded_by))+'</td></tr>'}).join("")+'</tbody></table></div>'}function people(){
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
 return '<div class="page-head"><div><h1>People</h1><div class="muted">Users, roles'+(isHead?' and temporary task access':"")+'</div></div><button id="peopleRefresh" class="secondary" type="button">Refresh</button></div>'+
  (isHead?'<div class="panel access-help"><h3>Temporary access delegation</h3><p>Choose exactly what another employee may do while you are unavailable. Their normal role stays unchanged. Access expires automatically and you can revoke it immediately.</p><p class="muted">Only the Head of Operations can grant or revoke access. Access to users, roles and permanent permissions cannot be delegated here.</p></div>':"")+
  (isHead&&!S.accessReady?'<div class="notice">Temporary access controls are unavailable. Refresh the page to retry; no permission changes can be made.</div>':"")+
  '<div class="panel table-wrap people-table-wrap"><table class="table people-table"><thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Status</th>'+
  (isHead?'<th>Temporary access</th><th>Actions</th>':"")+'</tr></thead><tbody>'+rows+'</tbody></table></div>';
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
function settings(){let g=k=>S.settings.find(x=>x.key===k)?.value,enabled=g("whatsapp_alerts_enabled")!==false;return '<div class="page-head"><div><h1>Settings</h1><div class="muted">Fleet control & automatic service alerts</div></div><div>'+'<button id="save" class="primary">Save settings</button></div></div><div class="panel"><div class="form-grid"><div><label>Service interval (hours)</label><input id="si" type="number" min="1" value="'+esc(g("service_interval_hours")??500)+'"></div><div><label>WhatsApp alert threshold (hours before service)</label><input id="sw" type="number" min="0" value="'+esc(g("service_warning_hours")??50)+'"></div><div><label>WhatsApp recipient number</label><input id="wn" inputmode="tel" placeholder="e.g. 27821234567" value="'+esc(g("whatsapp_alert_number")??"")+'"></div><div><label>Automatic WhatsApp alerts</label><select id="we"><option value="true" '+(enabled?'selected':'')+'>Enabled</option><option value="false" '+(!enabled?'selected':'')+'>Disabled</option></select></div></div><p class="muted">When a machine reaches the configured warning threshold, Phatsema sends the service alert to the WhatsApp number entered above. The same machine will not be alerted again until a new service record starts the next service cycle.</p></div>'}function audit(){return '<div class="page-head"><div><h1>Audit log</h1><div class="muted">A clear history of changes and actions across the fleet</div></div><button id="ar" class="secondary">↻ Refresh</button></div><div class="audit-toolbar"><div class="audit-search"><span>⌕</span><input id="auditSearch" placeholder="Search audit history…"></div><select id="auditAction"><option value="">All actions</option></select><div class="audit-count" id="auditCount">Loading…</div></div><div id="aud" class="audit-list"><div class="audit-loading">Loading audit history…</div></div>'}function guide(){return '<div class="page-head"><div><h1>Training Guide</h1><div class="muted">How Phatsema works</div></div></div><div class="panel"><h3>Breakdowns</h3><p>Report an issue, assign a technician, then complete the repair. The system asks whether the machine is ready to return to work.</p><h3>Service</h3><p>Record the current hour reading and work completed. Lower readings are rejected.</p><h3>Dashboard</h3><p>Working percentage is working active machines divided by active fleet.</p></div>'}function getMachine(id){return S.m.find(x=>x.id===id)?.name||"Unknown"}function modal(title,body,fn){
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
async function load(){let errEl=$("loadErr");if(errEl)errEl.textContent="Loading…";let results=await Promise.allSettled([db.from("machines").select("*").eq("active",true).order("name"),db.from("breakdowns").select("*").order("started_at",{ascending:false}),db.from("services").select("*").order("service_date",{ascending:false}),db.from("service_photos").select("*").order("created_at",{ascending:true}),db.from("profiles").select("*").order("full_name"),db.from("app_settings").select("*"),db.from("machine_production_clocks").select("machine_id,accumulated_seconds,running_since"),db.from("temporary_access_grants").select("id,user_id,permission,granted_at,expires_at,revoked_at,granted_by,reason")]);let[m,b,s,ph,pe,se,cl,gr]=results,failed=[];S.m=m.status==="fulfilled"?(m.value.data||[]):(failed.push("machines: "+(m.reason?.message||"failed")),[]);S.b=b.status==="fulfilled"?(b.value.data||[]):(failed.push("breakdowns: "+(b.reason?.message||"failed")),[]);S.s=s.status==="fulfilled"?(s.value.data||[]):(failed.push("services: "+(s.reason?.message||"failed")),[]);S.photos=[];if(ph.status==="fulfilled"){let raw=ph.value.data||[];let signed=await Promise.all(raw.map(async p=>{let r=await db.storage.from("fleet-evidence").createSignedUrl(p.storage_path,3600);return r.error?null:{...p,url:r.data.signedUrl}}));S.photos=signed.filter(Boolean)}else failed.push("service photos: "+(ph.reason?.message||"failed"));S.people=pe.status==="fulfilled"?(pe.value.data||[]):(failed.push("profiles: "+(pe.reason?.message||"failed")),[]);S.settings=se.status==="fulfilled"?(se.value.data||[]):[];S.accessReady=gr.status==="fulfilled"&&!gr.value.error;S.grants=S.accessReady?(gr.value.data||[]):[];if(!S.accessReady&&realHead())failed.push("temporary access permissions unavailable");
let clockRows=cl.status==="fulfilled"&&!cl.value.error?(cl.value.data||[]):null;
if(!clockRows)failed.push("live production clocks unavailable");
let clockById=new Map((clockRows||[]).map(c=>[c.machine_id,c]));
S.m=S.m.map(machine=>{let c=clockById.get(machine.id);return {...machine,production_seconds:c?Number(c.accumulated_seconds):undefined,production_started_at:c?.running_since||null}});
if(errEl)errEl.textContent=failed.length?"⚠ "+failed.join(" | "):"";render()}function bind(){let r=$("refresh");if(r)r.onclick=load;document.querySelectorAll("[data-go]").forEach(x=>x.onclick=()=>go(x.dataset.go));let bt=$("breakdownTile");if(bt)bt.onclick=openBreakdowns;let q=[["mq",machines],["bq",breakdowns],["sq",services]];q.forEach(([id,fn])=>{let x=$(id);if(x)x.oninput=()=>{if(id==="mq")S.fleetSearch=x.value;let v=x.value;render();let n=$(id);if(n){n.value=v;n.focus()}}});if($("peopleRefresh"))$("peopleRefresh").onclick=load;document.querySelectorAll(".manageAccess").forEach(x=>x.onclick=()=>manageAccess(x.dataset.id));if($("addM"))$("addM").onclick=addMachine;if($("addB"))$("addB").onclick=addBreakdown;if($("addS"))$("addS").onclick=addService;if($("save"))$("save").onclick=saveSettings;if($("ar"))$("ar").onclick=loadAudit;if($("auditSearch"))$("auditSearch").oninput=renderAudit;if($("auditAction"))$("auditAction").onchange=renderAudit;document.querySelectorAll(".editHours").forEach(x=>x.onclick=()=>editMachine(x.dataset.id));document.querySelectorAll(".nextService").forEach(x=>x.onclick=()=>setNextService(x.dataset.id));document.querySelectorAll(".st").forEach(x=>x.onclick=()=>status(x.dataset.id));document.querySelectorAll(".rm").forEach(x=>x.onclick=()=>removeMachine(x.dataset.id));document.querySelectorAll(".repair").forEach(x=>x.onclick=()=>repair(x.dataset.id));if(S.view==="audit")loadAudit()}function addMachine(){modal("Add machine",'<div class="form-grid"><div><label>Name</label><input name="name" required></div><div><label>Fleet ID</label><input name="fleet_id" required></div><div><label>Model</label><input name="model"></div><div><label>Site</label><input name="site"></div><div><label>Hours</label><input name="hours" type="number" value="0"></div><div><label>Status</label><select name="status"><option>working</option><option>available</option><option>maintenance</option><option>offline</option></select></div></div>',async f=>{let {error}=await db.rpc("create_machine",{p_name:f.get("name"),p_fleet_id:f.get("fleet_id"),p_model:f.get("model"),p_site:f.get("site"),p_hours:Number(f.get("hours")||0),p_status:f.get("status"),p_service_interval_hours:500,p_service_warning_hours:50});if(error)throw error;$("modalRoot").innerHTML="";toast("Machine added");load()})}function addBreakdown(){let mo=S.m.map(m=>'<option value="'+m.id+'">'+esc(m.name)+" · "+esc(m.fleet_id)+"</option>").join(""),pe=S.people.filter(p=>p.active).map(p=>'<option value="'+p.id+'">'+esc(p.full_name||p.username)+" · "+esc(p.role)+"</option>").join("");modal("Report breakdown",'<label>Machine</label><select name="machine_id" required>'+mo+'</select><label>Problem</label><select name="reason"><option>Engine</option><option>Hydraulic</option><option>Electrical</option><option>Tyre / Track</option><option>Cooling system</option><option>Transmission</option><option>Other</option></select><label>Technician</label><select name="assigned_to"><option value="">Unassigned</option>'+pe+'</select><label>Notes</label><textarea name="notes" rows="4"></textarea>',async f=>{let {error}=await db.rpc("report_breakdown",{p_machine_id:f.get("machine_id"),p_reason:f.get("reason"),p_notes:f.get("notes"),p_assigned_to:f.get("assigned_to")||null});if(error)throw error;$("modalRoot").innerHTML="";toast("Breakdown reported");load()})}function addService(){let mo=S.m.map(m=>'<option value="'+m.id+'">'+esc(m.name)+" · "+Number(m.hours||0)+"h</option>").join("");modal("Log service",'<label>Machine</label><select name="machine_id" required>'+mo+'</select><label>Hour reading</label><input name="hours" type="number" min="0" step=".1" required><label>Work completed</label><textarea name="work" rows="4" required></textarea><label>Notes</label><textarea name="notes" rows="3"></textarea><label>Photos of work done <span class="muted">(optional)</span></label><input name="photos" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/gif" multiple><div class="muted">Add up to 8 photos. These are stored with the service record.</div>',async f=>{let files=Array.from(f.getAll("photos")||[]).filter(x=>x&&x.size).slice(0,8);let {data,error}=await db.rpc("log_service",{p_machine_id:f.get("machine_id"),p_work_completed:f.get("work"),p_hour_reading:Number(f.get("hours")),p_notes:f.get("notes")});if(error)throw error;let serviceId=data?.id||data;if(!serviceId)throw new Error("Service was logged but no service ID was returned, so photos could not be attached.");for(let file of files){let safe=(file.name||"photo").replace(/[^a-zA-Z0-9._-]/g,"_"),path="services/"+serviceId+"/"+crypto.randomUUID()+"_"+safe;let up=await db.storage.from("fleet-evidence").upload(path,file,{contentType:file.type,upsert:false});if(up.error)throw up.error;let ins=await db.from("service_photos").insert({service_id:serviceId,storage_path:path});if(ins.error)throw ins.error}$("modalRoot").innerHTML="";toast(files.length?"Service logged with "+files.length+" photo"+(files.length===1?"":"s"):"Service logged");load()})}function editMachine(id){
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
function status(id){modal("Change status",'<label>Status</label><select name="status"><option>working</option><option>available</option><option>breakdown</option><option>maintenance</option><option>offline</option></select><label>Reason</label><textarea name="reason"></textarea>',async f=>{let {error}=await db.rpc("set_machine_status",{p_machine_id:id,p_status:f.get("status"),p_reason:f.get("reason")||null});if(error)throw error;$("modalRoot").innerHTML="";toast("Status updated");load()})}async function removeMachine(id){let m=S.m.find(x=>x.id===id);if(!confirm("Remove "+m.name+" from the active fleet?"))return;let {error}=await db.rpc("retire_machine",{p_machine_id:id});if(error){toast(error.message,true);return}toast("Machine removed");load()}async function repair(id){let ready=confirm("Repair complete. Is the machine ready to go back to work?"),reason=null;if(!ready){reason=prompt("Why is the machine not ready?");if(reason===null||!reason.trim()){toast("A reason is required",true);return}}let {error}=await db.rpc("complete_breakdown",{p_breakdown_id:id,p_ready:ready,p_reason:reason,p_notes:null});if(error){toast(error.message,true);return}toast(ready?"Machine returned to Working":"Breakdown remains open");load()}async function saveSettings(){for(let [key,value] of [["service_interval_hours",Number($("si").value)],["service_warning_hours",Number($("sw").value)],["whatsapp_alert_number",$("wn").value.trim()],["whatsapp_alerts_enabled",$("we").value==="true"]]){let {error}=await db.from("app_settings").upsert({key,value,updated_by:S.user.id},{onConflict:"key"});if(error){toast(error.message,true);return}}toast("Settings saved");load()}function auditLabel(a){return String(a||"").replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase())}
function auditActor(id){return S.people.find(p=>p.id===id)?.full_name||S.people.find(p=>p.id===id)?.username||"System"}
function auditMachine(x){return S.m.find(m=>m.id===x.entity_id)?.name||x.details?.after?.name||x.details?.before?.name||null}
function auditDetail(x){let d=x.details||{};if(x.action==="temporary_access_granted"||x.action==="temporary_access_revoked")return accessLabel(d.permission||"access")+" · "+(x.action==="temporary_access_granted"?"Granted until "+(d.expires_at?fmt(d.expires_at):"expiry"):"Revoked")+(d.reason?" · Reason: "+d.reason:"");let from=d.from??d.before_status??d.before?.status,to=d.to??d.after_status??d.after?.status,h1=d.before_hours??d.before?.hours,h2=d.after_hours??d.after?.hours;if(x.action==="machine_hours_corrected")return "Current hours "+(d.before_hours??"—")+" → "+(d.after_hours??"—")+" · Reason: "+(d.reason||"not supplied");if(x.action==="machine_status_changed"&&from!==undefined)return "Status "+auditLabel(from)+" → "+auditLabel(to)+(d.reason?" · "+d.reason:"");if((x.action==="update_machine"||x.action==="machine_updated")&&(h1!==undefined||h2!==undefined||from!==undefined||to!==undefined)){let parts=[];if(h1!==undefined||h2!==undefined)parts.push("Hours "+(h1??"—")+" → "+(h2??"—"));if(from!==undefined||to!==undefined)parts.push("Status "+auditLabel(from??"—")+" → "+auditLabel(to??"—"));return parts.join(" · ")}let parts=[];Object.entries(d).forEach(([k,v])=>{if(k==="before"||k==="after"||v===null||v===undefined||v==="")return;let val=typeof v==="object"?JSON.stringify(v):String(v);parts.push(auditLabel(k)+": "+val)});return parts.join(" · ")||"Action recorded"}
function renderAudit(){let root=$("aud");if(!root)return;let q=norm($("auditSearch")?.value||""),action=$("auditAction")?.value||"",rows=S.audit.filter(x=>(!action||x.action===action)&&(!q||(auditLabel(x.action)+" "+x.entity_type+" "+auditActor(x.actor_id)+" "+auditDetail(x)).toLowerCase().includes(q)));let c=$("auditCount");if(c)c.textContent=rows.length+" entr"+(rows.length===1?"y":"ies");if(!rows.length){root.innerHTML='<div class="audit-empty"><div class="audit-empty-icon">✓</div><strong>No audit entries found</strong><span>Try a different search or action filter.</span></div>';return}root.innerHTML=rows.map(x=>{let machine=auditMachine(x),actor=auditActor(x),entity=machine||auditLabel(x.entity_type||"system"),initial=(actor==="System"?"S":actor.trim().charAt(0).toUpperCase());return '<article class="audit-item"><div class="audit-icon">'+initial+'</div><div class="audit-main"><div class="audit-top"><div><strong>'+esc(auditLabel(x.action))+'</strong><span class="audit-entity">'+esc(entity)+'</span></div><time>'+esc(fmt(x.created_at))+'</time></div><div class="audit-detail">'+esc(auditDetail(x))+'</div><div class="audit-meta"><span>By '+esc(actor)+'</span><span>•</span><span>'+esc(auditLabel(x.entity_type||"system"))+'</span></div></div></article>'}).join("")}
async function loadAudit(){let {data,error}=await db.from("audit_log").select("*").order("created_at",{ascending:false}).limit(100);if(error){$("aud").innerHTML='<div class="audit-empty"><strong>Could not load audit history</strong><span>'+esc(error.message)+"</span></div>";return}S.audit=data||[];let sel=$("auditAction");if(sel){let current=sel.value,actions=[...new Set(S.audit.map(x=>x.action).filter(Boolean))].sort();sel.innerHTML='<option value="">All actions</option>'+actions.map(a=>'<option value="'+esc(a)+'">'+esc(auditLabel(a))+'</option>').join("");sel.value=actions.includes(current)?current:""}renderAudit()}
let resumingUser=null;
async function login(e){if(e&&e.preventDefault)e.preventDefault();let btn=$("loginBtn"),msg=$("loginMsg");if(!db){if(msg)msg.textContent="Secure login is still loading. Please wait a moment and try again.";return}let email=$("loginEmail")?.value.trim()||"",password=$("loginPassword")?.value||"";if(!email||!password){if(msg)msg.textContent="Enter your email and password.";return}if(btn){btn.disabled=true;btn.textContent="Signing in…"}if(msg){msg.textContent="Connecting to Phatsema…";msg.classList.remove("error")}try{let result=await Promise.race([db.auth.signInWithPassword({email,password}),new Promise((_,reject)=>setTimeout(()=>reject(new Error("Login timed out. Please check your connection and try again.")),15000))]);let{data,error}=result;if(error){if(msg)msg.textContent=error.message;return}if(data?.user){if(msg)msg.textContent="Login successful. Loading your fleet…";await resume(data.user)}else if(msg)msg.textContent="Login did not return a user session. Please try again."}catch(err){if(msg)msg.textContent=err?.message||String(err);console.error("Phatsema login error",err)}finally{if(btn){btn.disabled=false;btn.textContent="Log in"}}}
async function resume(user){if(resumingUser===user.id)return;resumingUser=user.id;try{S.user=user;let{data,error}=await db.from("profiles").select("*").eq("id",user.id).maybeSingle();if(error){$("loginMsg").textContent="Profile lookup failed: "+error.message;return}if(!data){await db.auth.signOut();$("loginMsg").textContent="No Phatsema profile exists for this account.";return}S.p=data;$("userBadge").textContent=(S.p.full_name||user.email)+" · "+S.p.role;$("login").classList.add("hidden");$("app").classList.remove("hidden");try{await load()}catch(err){showFatal("Load failed: "+(err.message||String(err)))}}finally{resumingUser=null}}
function showRecovery(){return showPasswordReset()}
function showPasswordReset(){modal("Set a new password",'<label>New password</label><input name="password" type="password" minlength="8" autocomplete="new-password" required><label>Confirm password</label><input name="confirm" type="password" minlength="8" autocomplete="new-password" required><p class="muted">Use at least 8 characters.</p>',async form=>{let password=String(form.get("password")||""),confirm=String(form.get("confirm")||"");if(password.length<8)throw new Error("Password must be at least 8 characters.");if(password!==confirm)throw new Error("Passwords do not match.");let{error}=await db.auth.updateUser({password});if(error)throw error;$("modalRoot").innerHTML="";await db.auth.signOut();$("login").classList.remove("hidden");$("app").classList.add("hidden");$("loginMsg").textContent="Password changed successfully. You can now log in with your new password."})}
function recoveryMessage(error){let m=error?.message||String(error||"");if(/rate limit|429|over_email_send_rate_limit/i.test(m))return"Password reset emails are temporarily rate-limited. Please wait a while before trying again.";return m}
async function requestPasswordReset(){let e=$("loginEmail").value.trim(),msg=$("loginMsg"),btn=$("forgotBtn");if(!e){msg.textContent="Enter your email first.";return}let key="phatsema-reset-last-"+e.toLowerCase(),last=Number(localStorage.getItem(key)||0),wait=Math.ceil((60000-(Date.now()-last))/1000);if(wait>0){msg.textContent=`Please wait ${wait}s before requesting another reset email.`;return}if(btn)btn.disabled=true;msg.textContent="Sending password reset email…";let{error}=await db.auth.resetPasswordForEmail(e,{redirectTo:new URL(location.href).href.split("#")[0]});if(error){msg.textContent=recoveryMessage(error);if(btn)btn.disabled=false;return}localStorage.setItem(key,String(Date.now()));msg.textContent="Password reset email sent. Check your inbox and spam folder.";setTimeout(()=>{if(btn)btn.disabled=false},60000)}
function boot(){initTheme();const themeBtn=$("themeBtn");if(themeBtn){themeBtn.onclick=toggleTheme}if(!initSupabase())return;let f=$("loginForm");if(f)f.onsubmit=login;let fb=$("forgotBtn");if(fb)fb.onclick=requestPasswordReset;let lo=$("logoutBtn");if(lo)lo.onclick=async()=>{await db.auth.signOut();location.reload()};db.auth.onAuthStateChange(async(event,session)=>{if(event==="PASSWORD_RECOVERY"){showRecovery();return}if(event==="SIGNED_OUT"){S.user=null;S.p=null;$("login")?.classList.remove("hidden");$("app")?.classList.add("hidden");return}if(event==="SIGNED_IN"&&session?.user){await resume(session.user)}});db.auth.getSession().then(async({data})=>{if(location.hash.includes("type=recovery")){showRecovery();return}if(data?.session?.user)await resume(data.session.user);else $("login")?.classList.remove("hidden")}).catch(err=>showFatal(err.message||String(err)))}
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
