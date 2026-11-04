(()=>{
  'use strict';
  const KEY='reportpro-theme';
  const themes=[
    ['light-lemon','Light Lemon'],['light-olive','Light Olive'],['light-peach','Light Peach'],
    ['light-orange','Light Orange'],['light-mint','Light Mint'],['dark-neon','Dark Neon']
  ];
  const valid=new Set(themes.map(([id])=>id));
  let menu, anchor;
  function updateMeta(){const value=getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();const meta=document.querySelector('meta[name="theme-color"]');if(meta&&value)meta.setAttribute('content',value)}
  function apply(theme, persist=true){const selected=valid.has(theme)?theme:'light-mint';document.documentElement.setAttribute('data-theme',selected);if(persist){try{localStorage.setItem(KEY,selected)}catch(_){}}if(menu)menu.querySelectorAll('[data-theme-choice]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.themeChoice===selected)));requestAnimationFrame(updateMeta);return selected}
  function applySaved(){let theme='light-mint';try{const saved=localStorage.getItem(KEY);if(valid.has(saved))theme=saved;else{const legacy=localStorage.getItem('theme');theme=legacy==='dark'?'dark-neon':'light-mint';localStorage.setItem(KEY,theme);localStorage.removeItem('theme')}}catch(_){}return apply(theme,false)}
  function build(){if(menu)return;menu=document.createElement('div');menu.className='theme-picker';menu.hidden=true;menu.setAttribute('role','dialog');menu.setAttribute('aria-label','Choose a color theme');menu.innerHTML='<p class="theme-picker-title">Choose theme</p><div class="theme-picker-list">'+themes.map(([id,label])=>'<button type="button" class="theme-choice" data-theme-choice="'+id+'" aria-pressed="false"><span class="theme-dot" aria-hidden="true"></span><span>'+label+'</span><small>'+(id==='dark-neon'?'DARK':'LIGHT')+'</small></button>').join('')+'</div>';menu.addEventListener('click',e=>{const choice=e.target.closest('[data-theme-choice]');if(!choice)return;apply(choice.dataset.themeChoice);close()});document.body.appendChild(menu);document.addEventListener('pointerdown',e=>{if(!menu.hidden&&!menu.contains(e.target)&&!anchor?.contains(e.target))close()});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!menu.hidden){close();anchor?.focus()}})}
  function close(){if(!menu)return;menu.hidden=true;anchor?.setAttribute('aria-expanded','false')}
  function toggleMenu(button){build();if(!menu.hidden&&anchor===button){close();return}anchor=button;const r=button.getBoundingClientRect();menu.hidden=false;menu.querySelectorAll('[data-theme-choice]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.themeChoice===document.documentElement.dataset.theme)));const width=menu.offsetWidth;const left=Math.max(12,Math.min(r.right-width,innerWidth-width-12));const top=r.bottom+8+menu.offsetHeight<innerHeight?r.bottom+8:Math.max(12,r.top-menu.offsetHeight-8);menu.style.left=left+'px';menu.style.top=top+'px';button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-expanded','true')}
  window.ReportProTheme={apply,applySaved,toggleMenu,themes:themes.map(([id,label])=>({id,label}))};
  document.addEventListener('DOMContentLoaded',()=>{applySaved();document.querySelectorAll('[data-act="theme"]').forEach(b=>{b.setAttribute('aria-haspopup','dialog');b.setAttribute('aria-expanded','false');b.setAttribute('aria-label','Choose theme');b.title='Choose theme'})});
})();
