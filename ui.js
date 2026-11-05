(() => {
  'use strict';
  const tabs=[...document.querySelectorAll('.sidebar-tabs [data-act="tab"][data-tab]')];
  const breadcrumb=document.querySelector('.current-view-name');
  const title=document.querySelector('.current-page-title');
  const drawerToggle=document.querySelector('.sidebar-toggle-check');
  const sidebar=document.querySelector('.app-sidebar');
  const syncTitle=()=>{
    const active=tabs.find(button=>button.getAttribute('aria-selected')==='true');
    const label=active?.querySelector('span')?.textContent.trim();
    if(label){if(breadcrumb)breadcrumb.textContent=label;if(title)title.textContent=label;}
  };
  const observer=new MutationObserver(syncTitle);
  tabs.forEach(button=>observer.observe(button,{attributes:true,attributeFilter:['aria-selected']}));
  syncTitle();
  document.addEventListener('click',event=>{
    if(!drawerToggle?.checked)return;
    const target=event.target;
    if(target.closest('.sidebar-tabs [data-act="tab"]')||(!sidebar?.contains(target)&&!target.closest('.sidebar-toggle'))){drawerToggle.checked=false;}
  });
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&drawerToggle?.checked){drawerToggle.checked=false;drawerToggle.focus();}
  });
})();
