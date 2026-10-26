"use strict";
// Static assets only. NEVER intercept, cache, or queue authenticated Supabase
// requests, sessions, uploaded photos, API responses, or user fleet records.
const CACHE="phatsema-static-v20261026-pwa1";
const CORE=["./","./index.html","./styles.css","./app.js","./pwa-install.js",
            "./manifest.webmanifest","./icons/icon-192.png","./icons/icon-512.png"];
const CORE_PATHS=new Set(["","index.html","styles.css","app.js",
                           "pwa-install.js","manifest.webmanifest",
                           "icons/icon-192.png","icons/icon-512.png"]);
const prefix=self.registration.scope;
const base=new URL(prefix);
function relativePath(url){
 if(url.origin!==base.origin||!url.pathname.startsWith(base.pathname))return null;
 return url.pathname.slice(base.pathname.length);
}
function validAssetResponse(response,relative){
 if(!response.ok||response.redirected||response.type==="opaque")return false;
 const type=(response.headers.get("content-type")||"").toLowerCase();
 if(relative===""||relative==="index.html")return type.includes("text/html");
 if(relative.endsWith(".js"))return type.includes("javascript");
 if(relative.endsWith(".css"))return type.includes("text/css");
 if(relative.endsWith(".webmanifest"))return type.includes("json")||type.includes("manifest");
 if(relative.endsWith(".png"))return type.includes("image/png");
 return false;
}
self.addEventListener("install",event=>{
 event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  // Installation must not fail just because a protected preview URL or
  // temporary asset/CDN failure prevents precaching.
  await Promise.allSettled(CORE.map(async asset=>{
   const request=new Request(new URL(asset,prefix).href,{cache:"reload"});
   const response=await fetch(request);
   const relative=relativePath(new URL(request.url));
   if(validAssetResponse(response,relative))await cache.put(request,response);
  }));
  await self.skipWaiting();
 })());
});
self.addEventListener("activate",event=>{
 event.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(key=>key.startsWith("phatsema-static-")&&key!==CACHE)
    .map(key=>caches.delete(key)));
  await self.clients.claim();
 })());
});
self.addEventListener("fetch",event=>{
 const request=event.request;
 if(request.method!=="GET")return;
 const url=new URL(request.url);
 const relative=relativePath(url);
 if(relative===null||!CORE_PATHS.has(relative))return;
 // Always fetch a fresh app and always bypass private API/user-data requests.
 event.respondWith((async()=>{
  try{
   const response=await fetch(request);
   if(validAssetResponse(response,relative)){
    const cache=await caches.open(CACHE);
    await cache.put(request,response.clone());
   }
   return response;
  }catch(_error){
   const cache=await caches.open(CACHE);
   const cached=await cache.match(request,{ignoreSearch:true});
   if(cached)return cached;
   if(request.mode==="navigate"){
    const shell=await cache.match(new URL("./index.html",prefix).href);
    if(shell)return shell;
    return new Response(
      "<!doctype html><html lang=\"en\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Offline – Phatsema Fleet</title><main style=\"font:16px system-ui;padding:28px\"><h1>You are offline</h1><p>Reconnect to the internet and reload Phatsema Fleet Operations. Fleet data requires a secure connection.</p></main></html>",
      {status:503,headers:{"content-type":"text/html; charset=utf-8"}}
    );
   }
   return Response.error();
  }
 })());
});
