"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const read=slug=>fs.readFileSync(path.join(__dirname,"..","supabase","functions",slug,"index.ts"),"utf8");
test("bulk WhatsApp alerts require active management and server-side audit",()=>{
 const src=read("send-whatsapp-alert");
 assert.match(src,/profile\?\.active/);
 assert.match(src,/\['foreman','operations_manager','head_of_operations'\]\.includes\(profile\.role\)/);
 assert.match(src,/adminClient\.from\('audit_log'\)\.insert/);
 assert.doesNotMatch(src,/userClient\.from\('audit_log'\)\.insert/);
});
test("assigned-technician WhatsApp alerts also enforce management role",()=>{
 const src=read("send-whatsapp-alert-v2");
 assert.match(src,/actor\?\.active/);
 assert.match(src,/\['foreman','operations_manager','head_of_operations'\]\.includes\(actor\.role\)/);
 assert.match(src,/admin\.from\('audit_log'\)\.insert/);
});
