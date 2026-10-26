"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const os=require("node:os");
const path=require("node:path");
const {execFileSync}=require("node:child_process");
const root=path.join(__dirname,"..");

test("Static-only commercial hosting bundle contains PWA but not backend/private files",()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"phatsema-static-"));
 try{
  execFileSync("bash",[path.join(root,"scripts","build-static.sh"),tmp],{cwd:root,timeout:12000});
  for(const file of ["index.html","app.js","styles.css","pwa-install.js","sw.js",
      "manifest.webmanifest","icons/icon-192.png","icons/icon-512.png","_headers"]){
    assert.ok(fs.statSync(path.join(tmp,file)).size>0,file+" must be in public bundle");
  }
  for(const file of ["supabase",".github","tests",".env","README.md","docs"]){
    assert.equal(fs.existsSync(path.join(tmp,file)),false,file+" must NOT be public");
  }
  const html=fs.readFileSync(path.join(tmp,"index.html"),"utf8");
  assert.match(html,/rel="manifest"/);
  assert.match(html,/data-pwa-install/);
  const headers=fs.readFileSync(path.join(tmp,"_headers"),"utf8");
  assert.match(headers,/X-Content-Type-Options: nosniff/);
  assert.match(headers,/\/sw\.js[\s\S]*Cache-Control: no-cache/);
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});

test("Project README records creator claim without claiming client marks or data",()=>{
 const readme=fs.readFileSync(path.join(root,"README.md"),"utf8");
 const legal=fs.readFileSync(path.join(root,"docs","free-hosting-and-ownership.md"),"utf8");
 assert.match(readme,/Created and developed by Revology/);
 assert.match(legal,/Phatsema name, logo, and operational data/);
 assert.match(legal,/does not by itself grant an open-source licence/);
});
