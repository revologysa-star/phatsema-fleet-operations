"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const sql=fs.readFileSync(path.join(__dirname,"..","supabase","migrations","20261026_whatsapp_overdue_candidates.sql"),"utf8");
const code=fs.readFileSync(path.join(__dirname,"..","supabase","functions","send-service-hours-whatsapp-alert","index.ts"),"utf8");
test("Overdue service reminders use per-machine service hours and never expire after the due hour",()=>{
 assert.match(sql,/m\.next_service_hours IS NOT NULL/);
 assert.match(sql,/m\.hours >= greatest\(0,m\.next_service_hours/);
 assert.match(sql,/m\.service_warning_hours/);
 assert.doesNotMatch(sql,/m\.hours < /);
 assert.match(sql,/REVOKE EXECUTE ON FUNCTION public\.get_whatsapp_service_alert_candidates/);
});
test("WhatsApp service alert dedupe handles machines that have never been serviced",()=>{
 assert.match(code,/previousAlert&&\(!latestService\?\.created_at\|\|/);
 assert.match(code,/previousAlert\.created_at/);
 assert.match(code,/whatsapp_service_hours_alert_sent/);
 assert.match(code,/authorize_fleet_service_alert_cron/);
});
