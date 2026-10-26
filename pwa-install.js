"use strict";
(function(){
 let installEvent=null;
 let installed=false;
 const buttons=()=>document.querySelectorAll("[data-pwa-install]");
 const standalone=()=>window.matchMedia("(display-mode: standalone)").matches
                      ||navigator.standalone===true;
 function syncButtons(){
  buttons().forEach(button=>{button.hidden=(standalone()||installed);button.disabled=false;});
 }
 async function install(){
  if(standalone())return;
  if(installEvent){
   const event=installEvent;
   installEvent=null;
   try{
    await event.prompt();
    await event.userChoice;
   }catch(error){
    console.warn("PWA installation prompt unavailable",error);
   }
   syncButtons();
   return;
  }
  window.alert("To install Phatsema Fleet Operations on Android:\n\n1. Open this website directly in Google Chrome (not inside ChatGPT or WhatsApp).\n2. Tap Chrome's three-dot menu (⋮).\n3. Choose Add to Home screen or Install app.\n4. Select Install.\n\nThe install option may require Chrome to recognize the app after refreshing the page.");
 }
 window.addEventListener("beforeinstallprompt",event=>{
  event.preventDefault();
  installEvent=event;
  syncButtons();
 });
 window.addEventListener("appinstalled",()=>{
  installed=true;
  installEvent=null;
  syncButtons();
 });
 document.addEventListener("click",event=>{
  const target=event.target.closest?.("[data-pwa-install]");
  if(target){event.preventDefault();install();}
 });
 if("serviceWorker" in navigator && window.isSecureContext){
  window.addEventListener("load",()=>{
   navigator.serviceWorker.register("./sw.js",{scope:"./"})
    .catch(error=>console.warn("App installation support unavailable",error));
  });
 }
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",syncButtons);
 else syncButtons();
})();
