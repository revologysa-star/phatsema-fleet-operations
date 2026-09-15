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
.brand{min-width:0;flex:1 1 180px;}
.brand div{min-width:0;overflow:hidden;}
.brand b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:13px;}
.top>div:last-child{display:flex;align-items:center;gap:6px;flex:0 0 auto;}
.layout{min-height:calc(100vh - 70px);width:100%;}
aside{width:100%;padding:8px;position:sticky;top:0;z-index:4;background:#090b0df2;}
nav{display:flex;gap:6px;overflow-x:auto;overflow-y:hidden;scrollbar-width:none;-webkit-overflow-scrolling:touch;padding-bottom:2px;}
nav::-webkit-scrollbar{display:none;}
nav button{flex:0 0 auto;white-space:nowrap;min-height:44px;padding:10px 12px;}
main{width:100%;min-width:0;padding:10px;overflow-x:hidden;}
.hero{padding:16px;min-height:130px;background-size:cover;}
.hero h1{font-size:24px;margin:0 0 6px;}
.grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;}
.card{padding:12px;min-width:0;}
.metric{font-size:26px;}
.panel{padding:12px;margin-top:10px;min-width:0;}
.head{align-items:flex-start;flex-wrap:wrap;}
.head>b{padding-top:10px;}
.tablewrap{width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch;border-radius:8px;}
.table{min-width:700px;}
.modal{padding:0;align-items:stretch;}
.modalbox{width:100%;height:100%;max-height:none;border-radius:0;padding:14px;}
.field{width:100%;}
.field input,.field select,.field textarea{min-width:0;}
.toast{left:10px;right:10px;bottom:10px;text-align:center;}
@media(max-width:600px){.top{padding:8px 10px}.brand img{width:38px;height:38px}.brand span{font-size:10px}.top .pill{display:none!important}.top>div:last-child .btn{min-height:42px;padding:9px 11px}.grid{grid-template-columns:1fr 1fr}.card{font-size:12px}.metric{font-size:23px}.hero{min-height:115px}.hero h1{font-size:21px}}
@media(max-width:380px){.grid{grid-template-columns:1fr}.brand b{font-size:12px}nav button{font-size:12px;padding:9px 10px}}
`;

let patched = source.includes(marker) ? source : source.replace('</style>', `${css}</style>`);

const diagnosticMarker = 'PHATSEMA_RUNTIME_DIAGNOSTICS_V2';
if (!patched.includes(diagnosticMarker)) {
  const diagnostic = `<script>
(function(){
  const MARKER='${diagnosticMarker}';
  window.__phatsemaDiagnostics={marker:MARKER,startedAt:new Date().toISOString(),errors:[]};
  function showError(message){
    const text=String(message||'Unknown error');
    window.__phatsemaDiagnostics.errors.push(text);
    const msg=document.getElementById('loginMsg');
    if(msg) msg.textContent='Application error: '+text.slice(0,240);
    if(document.getElementById('app')&&!document.getElementById('app').classList.contains('hidden')){
      let t=document.querySelector('.toast.err');
      if(!t){t=document.createElement('div');t.className='toast err';document.body.appendChild(t)}
      t.textContent='Application error: '+text.slice(0,240);
      setTimeout(()=>t.remove(),6000);
    }
  }
  window.addEventListener('error',e=>showError(e.error?.message||e.message||'JavaScript error'));
  window.addEventListener('unhandledrejection',e=>showError(e.reason?.message||e.reason||'Unhandled promise rejection'));
  function call(name){
    const args=[].slice.call(arguments,1);
    try{
      if(typeof window[name]!=='function') throw new Error(name+' is not available');
      const result=window[name].apply(window,args);
      if(result&&typeof result.catch==='function') result.catch(showError);
    }catch(e){showError(e.message||e)}
  }
  function wire(){
    const map={loginBtn:'login',forgotBtn:'forgot',refresh:'refresh',auditRefresh:'renderAudit',addMachine:'machineForm',addBreakdown:'breakdownForm',addService:'serviceForm',addPerson:'personForm',saveSettings:'saveSettings'};
    Object.entries(map).forEach(([id,name])=>{
      const el=document.getElementById(id);
      if(el && !el.onclick && !el.dataset.runtimeWired){
        el.addEventListener('click',()=>call(name));
        el.dataset.runtimeWired='1';
      }
    });
    const nav=document.getElementById('nav');
    if(nav && typeof window.show!=='function'){
      nav.addEventListener('click',e=>{const b=e.target.closest('button[data-view]');if(b)showError('Navigation handler is unavailable; main application script did not initialize.')});
    }
    const state={
      supabaseLoaded:typeof window.supabase!=='undefined',
      appFunctions:['login','forgot','refresh','machineForm','breakdownForm','serviceForm','saveSettings','boot'].filter(n=>typeof window[n]==='function'),
      pageReady:!!document.getElementById('loginBtn')&&!!document.getElementById('app')
    };
    window.__phatsemaDiagnostics.state=state;
    document.documentElement.dataset.phatsemaDiagnostics=state.supabaseLoaded?'ready':'supabase-missing';
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',wire,{once:true});else wire();
})();
</script>`;
  patched=patched.replace('</body>',diagnostic+'</body>');
}

mkdirSync('dist', { recursive: true });
writeFileSync('dist/index.html', patched, 'utf8');
console.log('Built mobile-optimized index.html with runtime diagnostics');
