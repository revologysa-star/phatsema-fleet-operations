"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const sql=fs.readFileSync(path.join(__dirname,"..","supabase","migrations","20261026_fix_unassigned_repair_auth.sql"),"utf8");

test("Unassigned breakdown completion is explicitly denied on NULL authorization",()=>{
 assert.match(sql,/b\.assigned_to IS NOT NULL/);
 assert.match(sql,/\)\s*IS DISTINCT FROM TRUE\s+THEN RAISE EXCEPTION 'Only assigned technician or management/);
 assert.match(sql,/coalesce\(public\.can_manage\(\),false\)/);
 assert.match(sql,/coalesce\(public\.is_active_fleet_user\(\),false\)/);
});
test("Authorized completion retains ready and not-ready audit branches",()=>{
 assert.match(sql,/IF p_ready THEN/);
 assert.match(sql,/status='working'/);
 assert.match(sql,/repair_completed_not_ready/);
 assert.match(sql,/not_ready_reason=trim\(p_reason\)/);
});
