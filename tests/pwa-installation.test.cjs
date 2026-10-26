"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const root=path.join(__dirname,"..");
const read=file=>fs.readFileSync(path.join(root,file),"utf8");
const manifest=JSON.parse(read("manifest.webmanifest"));
const html=read("index.html");
const worker=read("sw.js");
const installer=read("pwa-install.js");

test("Android install manifest declares name, standalone mode, scope and HTTPS-safe relative start URL",()=>{
 assert.equal(manifest.name,"Phatsema Fleet Operations");
 assert.ok(manifest.short_name);
 assert.equal(manifest.display,"standalone");
 assert.equal(manifest.start_url,"./");
 assert.equal(manifest.scope,"./");
 assert.equal(manifest.id,"./");
 assert.equal(manifest.theme_color,"#1267a8");
 assert.ok(!manifest.prefer_related_applications);
 assert.ok(manifest.icons.some(icon=>icon.sizes==="192x192"&&icon.type==="image/png"));
 assert.ok(manifest.icons.some(icon=>icon.sizes==="512x512"&&icon.type==="image/png"&&icon.purpose.includes("maskable")));
});

test("PWA PNG icons are real raster images at both required dimensions",()=>{
 for(const pixels of [192,512]){
  const icon=fs.readFileSync(path.join(root,"icons","icon-"+pixels+".png"));
  assert.equal(icon.subarray(0,8).toString("hex"),"89504e470d0a1a0a");
  assert.equal(icon.readUInt32BE(16),pixels);
  assert.equal(icon.readUInt32BE(20),pixels);
  assert.ok(icon.length>200);
 }
});

test("Login and authenticated headers both expose a non-submitting install control",()=>{
 assert.match(html,/<link rel="manifest" href="\.\/manifest\.webmanifest">/);
 assert.match(html,/<link rel="apple-touch-icon"/);
 assert.equal((html.match(/data-pwa-install hidden/g)||[]).length,2);
 assert.match(html,/<script src="\.\/pwa-install\.js\?v=/);
 assert.doesNotMatch(html,/<button[^>]*data-pwa-install[^>]*type="submit"/);
});

test("PWA worker is valid JavaScript and caches only public same-origin app shell assets",()=>{
 assert.doesNotThrow(()=>new vm.Script(worker,{filename:"sw.js"}));
 assert.match(worker,/url\.origin!==base\.origin/);
 assert.match(worker,/request\.method!=="GET"/);
 assert.match(worker,/CORE_PATHS\.has\(relative\)/);
 assert.match(worker,/validAssetResponse/);
 assert.match(worker,/await fetch\(request\)/);
 assert.match(worker,/caches\.open\(CACHE\)/);
 assert.doesNotMatch(worker,/\.from\("machines"\)|\/rest\/v1|Authorization|sessionStorage|localStorage|service_role/i);
});

test("Install button prompts on Chrome install event and hides after installation",async()=>{
 const callbacks=new Map(),buttons=[{hidden:true,disabled:false},{hidden:true,disabled:false}];
 let prompted=0,prevented=0;
 const page={
  window:{isSecureContext:false,matchMedia:()=>({matches:false}),
   addEventListener:(name,cb)=>callbacks.set(name,cb),alert:()=>{}},
  navigator:{standalone:false},
  document:{readyState:"complete",querySelectorAll:()=>buttons,
   addEventListener:(name,cb)=>callbacks.set(name,cb)},
  console
 };
 vm.runInNewContext(installer,page,{filename:"pwa-install.js"});
 assert.equal(buttons[0].hidden,false);
 const event={
  preventDefault(){prevented++},
  prompt(){prompted++;return Promise.resolve()},
  userChoice:Promise.resolve({outcome:"accepted"})
 };
 callbacks.get("beforeinstallprompt")(event);
 callbacks.get("click")({target:{closest:()=>({})},preventDefault(){}});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(prevented,1);
 assert.equal(prompted,1);
 callbacks.get("appinstalled")();
 assert.equal(buttons[0].hidden,true);
 assert.equal(buttons[1].hidden,true);
});

test("Standalone installed application has no visible Install button",()=>{
 const buttons=[{hidden:false,disabled:false}];
 const page={window:{isSecureContext:false,matchMedia:()=>({matches:true}),addEventListener(){}},
  navigator:{standalone:false},document:{readyState:"complete",querySelectorAll:()=>buttons,addEventListener(){}},console};
 vm.runInNewContext(installer,page,{filename:"pwa-install.js"});
 assert.equal(buttons[0].hidden,true);
});
