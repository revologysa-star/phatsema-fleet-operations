// PHATSEMA Fleet dashboard reliability fix
(function(){
  async function loadFleetReliable(){
    try{
      const m=await db.from('machines').select('*').eq('active',true).order('name');
      if(m.error){ notify(m.error.message||'Unable to load machines',true); return false; }
      machines=m.data||[];
      // Load breakdowns separately so a profile relationship/query failure cannot blank the dashboard.
      const b=await db.from('breakdowns').select('*').order('started_at',{ascending:false});
      breakdowns=b.error?[]:(b.data||[]);
      renderDashboard();
      renderMachines();
      renderBreakdowns();
      return true;
    }catch(e){ notify(e?.message||'Unable to load fleet data',true); return false; }
  }
  window.loadFleetReliable=loadFleetReliable;
  // Keep the dashboard populated even if the original combined relationship query fails.
  const originalLoadUser=window.loadUser;
  window.loadUser=async function(){
    if(originalLoadUser) await originalLoadUser();
    if(window.profile) await loadFleetReliable();
  };
  setInterval(function(){ if(window.profile) loadFleetReliable(); },15000);
  setTimeout(function(){ if(window.profile) loadFleetReliable(); },2000);
})();
