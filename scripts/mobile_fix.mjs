import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';

const source = readFileSync('index.html', 'utf8');
const marker = '/* PHATSEMA MOBILE FIX v2 */';
const css = `
${marker}
html{width:100%;overflow-x:hidden;-webkit-text-size-adjust:100%;}
body{width:100%;min-width:0;overflow-x:hidden;}
img,video{max-width:100%;}
button,input,select,textarea{min-height:44px;}
.top{min-height:70px;height:auto;flex-wrap:wrap;gap:8px;padding:10px 14px;}
.brand{min-width:0;flex:1 1 180px}.brand div{min-width:0;overflow:hidden}.brand b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:13px}
.top>div:last-child{display:flex;align-items:center;gap:6px;flex:0 0 auto}.layout{min-height:calc(100vh - 70px);width:100%}
aside{width:100%;padding:8px;position:sticky;top:0;z-index:4;background:#090b0df2}
nav{display:flex;gap:6px;overflow-x:auto;overflow-y:hidden;scrollbar-width:none;-webkit-overflow-scrolling:touch;padding-bottom:2px}nav::-webkit-scrollbar{display:none}nav button{flex:0 0 auto;white-space:nowrap;min-height:44px;padding:10px 12px}
main{width:100%;min-width:0;padding:10px;overflow-x:hidden}.hero{padding:16px;min-height:130px;background-size:cover}.hero h1{font-size:24px;margin:0 0 6px}.grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.card{padding:12px;min-width:0}.metric{font-size:26px}.panel{padding:12px;margin-top:10px;min-width:0}.head{align-items:flex-start;flex-wrap:wrap}.head>b{padding-top:10px}.tablewrap{width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch;border-radius:8px}.table{min-width:700px}.modal{padding:0;align-items:stretch}.modalbox{width:100%;height:100%;max-height:none;border-radius:0;padding:14px}.field{width:100%}.field input,.field select,.field textarea{min-width:0}.toast{left:10px;right:10px;bottom:10px;text-align:center}
@media(max-width:600px){.top{padding:8px 10px}.brand img{width:38px;height:38px}.brand span{font-size:10px}.top .pill{display:none!important}.top>div:last-child .btn{min-height:42px;padding:9px 11px}.grid{grid-template-columns:1fr 1fr}.card{font-size:12px}.metric{font-size:23px}.hero{min-height:115px}.hero h1{font-size:21px}}
@media(max-width:380px){.grid{grid-template-columns:1fr}.brand b{font-size:12px}nav button{font-size:12px;padding:9px 10px}}
`;
let patched = source.includes(marker) ? source : source.replace('</style>', `${css}</style>`);

const diagnosticMarker='PHATSEMA_RUNTIME_DIAGNOSTICS_V3';
if(!patched.includes(diagnosticMarker)){
 const diagnostic=`<script>
(function(){
 const URL='https://fduccizawxtqnqtuxmjl.supabase.co';
 const KEY='sb_publishable_BzL4VuUfWGSLOHY-9vsnuw_d5nQp0dx';
 let client=null;
 function msg(t,err){const e=document.getElementById('loginMsg');if(e)e.textContent=t; if(err){let x=document.querySelector('.toast.err');if(!x){x=document.createElement('div');x.className='toast err';document.body.appendChild(x)}x.textContent=t;setTimeout(()=>x.remove(),5000)}}
 function show(v){document.querySelectorAll('.view').forEach(x=>x.classList.toggle('active',x.id===v));document.querySelectorAll('#nav button').forEach(x=>x.classList.toggle('active',x.dataset.view===v));}
 async function login(){
  try{
   if(typeof window.supabase==='undefined') throw new Error('Supabase client did not load.');
   client=client||window.supabase.createClient(URL,KEY);
   const id=(document.getElementById('li')||{}).value?.trim(); const pw=(document.getElementById('lp')||{}).value||'';
   if(!id||!pw){msg('Enter your username/email and password.');return}
   let email=id;
   if(!id.includes('@')){
    const r=await client.functions.invoke('username-login-v1',{body:{username:id}});
    if(r.error)throw r.error;
    if(!r.data?.email)throw new Error(r.data?.error||'Username could not be resolved.');
    email=r.data.email;
   }
   const r=await client.auth.signInWithPassword({email,password:pw});
   if(r.error)throw r.error;
   msg('Signed in. Loading fleet…');
   setTimeout(()=>location.reload(),150);
  }catch(e){msg('Sign in failed: '+(e?.message||e),true)}
 }
 async function forgot(){try{if(typeof window.supabase==='undefined')throw new Error('Supabase client did not load.');client=client||window.supabase.createClient(URL,KEY);const id=(document.getElementById('li')||{}).value?.trim();if(!id||!id.includes('@')){msg('Enter your email address first.');return}const r=await client.auth.resetPasswordForEmail(id,{redirectTo:location.origin});if(r.error)throw r.error;msg('Password reset email sent.')}catch(e){msg('Reset failed: '+(e?.message||e),true)}}
 async function logout(){try{client=client||window.supabase.createClient(URL,KEY);await client.auth.signOut()}finally{location.reload()}}
 function call(name){try{if(typeof window[name]!=='function')throw new Error(name+' is unavailable');const r=window[name]();if(r?.catch)r.catch(e=>msg(name+': '+(e?.message||e),true))}catch(e){msg(name+': '+(e?.message||e),true)}}
 function wire(){
  const direct={loginBtn:login,forgotBtn:forgot,logout:logout,refresh:()=>call('refresh'),auditRefresh:()=>call('renderAudit'),addMachine:()=>call('machineForm'),addBreakdown:()=>call('breakdownForm'),addService:()=>call('serviceForm'),addPerson:()=>call('personForm'),saveSettings:()=>call('saveSettings'),close:()=>{const m=document.getElementById('modal');if(m)m.classList.add('hidden')}};
  Object.entries(direct).forEach(([id,fn])=>{const el=document.getElementById(id);if(el&&!el.dataset.v3wired){el.addEventListener('click',fn);el.dataset.v3wired='1'}});
  const nav=document.getElementById('nav');if(nav&&!nav.dataset.v3wired){nav.addEventListener('click',e=>{const b=e.target.closest('button[data-view]');if(!b)return;show(b.dataset.view);const fn={machines:'renderMachines',breakdowns:'renderBreakdowns',services:'renderServices',people:'renderPeople',settings:'renderSettings',audit:'renderAudit'}[b.dataset.view];if(fn&&typeof window[fn]==='function')call(fn)});nav.dataset.v3wired='1'}
  document.querySelectorAll('#login input').forEach(e=>e.addEventListener('keydown',ev=>{if(ev.key==='Enter')login()}));
  window.__phatsemaDiagnostics={version:'V3',ready:true,supabaseLoaded:typeof window.supabase!=='undefined',wired:true};
 }
 window.addEventListener('error',e=>msg('Application error: '+(e.error?.message||e.message||'JavaScript error'),true));
 window.addEventListener('unhandledrejection',e=>msg('Application error: '+(e.reason?.message||e.reason||'Promise error'),true));
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',wire,{once:true});else wire();
})();
</script>`;
 patched=patched.replace('</body>',diagnostic+'</body>');
}
mkdirSync('dist',{recursive:true});writeFileSync('dist/index.html',patched,'utf8');console.log('Built Phatsema mobile frontend with independent V3 controls and diagnostics');
