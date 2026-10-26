"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const src=fs.readFileSync(path.join(__dirname,"..","supabase","functions","head-audit-export","index.ts"),"utf8");
const tick=String.fromCharCode(96);
const a=src.indexOf("const PAGE=String.raw"+tick);
const b=src.indexOf(tick+";\nconst SUPABASE_URL=",a);
const html=a>=0&&b>a?src.slice(a+("const PAGE=String.raw"+tick).length,b):"";
test("standalone audit export embeds public keys and secure headers",()=>{
 assert.ok(a>=0&&b>a);
 assert.doesNotMatch(src,/SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY/);
 assert.match(src,/Content-Security-Policy/);
 assert.match(src,/frame-ancestors 'none'/);
 assert.match(src,/no-store, private/);
 assert.match(html,/__PUBLISHABLE_KEY__/);
 assert.match(html,/__SUPABASE_URL__/);
});
test("Head portal signs in to Supabase and calls Head-only audit RPCs",()=>{
 assert.match(html,/\/auth\/v1\/token\?grant_type=password/);
 assert.match(html,/audit_export_snapshot/);
 assert.match(html,/audit_export_page/);
 assert.match(html,/record_audit_export/);
 assert.match(html,/Bearer /);
 assert.doesNotMatch(html,/localStorage/);
});
test("Head portal offers complete history CSV and PDF with fail-closed pagination",()=>{
 assert.match(html,/Download all records \(CSV \/ Excel\)/);
 assert.match(html,/Print \/ Save full report as PDF/);
 assert.match(html,/p_after_id:last/);
 assert.match(html,/p_limit:500/);
 assert.match(html,/rows.length!==expected/);
 assert.match(html,/No partial file was downloaded/);
 assert.match(html,/escapeHTML/);
 assert.match(html,/@media print/);
});
test("client-side JavaScript parses, without external scripts or template interpolation",()=>{
 const m=html.match(/<script nonce="__NONCE__">([\s\S]*?)<\/script>/);
 assert.ok(m);
 assert.doesNotThrow(()=>new vm.Script(m[1],{filename:"audit-portal.js"}));
 assert.doesNotMatch(html,/src="https?:\/\//);
 assert.doesNotMatch(src,/\$\{/);
});
