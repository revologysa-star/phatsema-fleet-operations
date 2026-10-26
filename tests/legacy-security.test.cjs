"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.join(__dirname,"..","supabase","functions");
const read=name=>fs.readFileSync(path.join(root,name,"index.ts"),"utf8");
test("legacy employee management endpoints require Head of Operations",()=>{
 const old=read("admin-user-management");
 const newer=read("admin-user-management-v2");
 assert.match(old,/actor\.role!=='head_of_operations'/);
 assert.match(newer,/a\.role!=='head_of_operations'/);
 assert.match(old,/Head role cannot be changed in legacy endpoint/);
 assert.match(newer,/Head role cannot be edited from this legacy endpoint/);
 assert.doesNotMatch(old,/\[['"]foreman['"],['"]operations_manager['"],['"]head_of_operations['"]\]\.includes\(actor\.role\)/);
 assert.doesNotMatch(newer,/a\.full_access===true/);
});
test("legacy username login does not expose email addresses without passwords",()=>{
 const login=read("username-login-v1");
 assert.match(login,/typeof password!=='string'/);
 assert.match(login,/Username and password required/);
 assert.doesNotMatch(login,/return out\(\{email\}\)/);
 assert.match(login,/Invalid username or password/);
});
