(() => {
  'use strict';
  const KEY = 'reportpro-theme';
  const THEMES = [
    { id: 'light-white', name: 'White', note: 'Light', dot: '#ffffff', meta: '#f3f5f9' },
    { id: 'light-mint',  name: 'Mint',  note: 'Light', dot: '#26745d', meta: '#eaf6f0' },
    { id: 'dark-neon',   name: 'Dark',  note: 'Dark',  dot: '#45ead7', meta: '#071214' }
  ];
  const ids = THEMES.map(t => t.id);
  const saved = () => { try { return localStorage.getItem(KEY); } catch (e) { return null; } };
  // Removed light themes (lemon, olive, peach, orange) fall back to White
  const norm = v => ids.includes(v) ? v : (/dark/i.test(v || '') ? 'dark-neon' : 'light-white');
  let menu = null;

  function setMeta(id) {
    const m = document.querySelector('meta[name="theme-color"]');
    const t = THEMES.find(x => x.id === id);
    if (m && t) m.setAttribute('content', t.meta);
  }
  function syncMenu() {
    if (!menu) return;
    const cur = document.documentElement.getAttribute('data-theme');
    menu.querySelectorAll('.theme-choice').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.themeChoice === cur)));
  }
  function apply(id) {
    id = norm(id);
    document.documentElement.setAttribute('data-theme', id);
    try { localStorage.setItem(KEY, id); } catch (e) {}
    setMeta(id); syncMenu();
    return id;
  }
  function applySaved() { return apply(saved()); }

  function onKey(e) { if (e.key === 'Escape') closeMenu(); }
  function closeMenu() {
    if (!menu) return;
    menu.remove(); menu = null;
    document.removeEventListener('keydown', onKey, true);
  }
  function toggleMenu(btn) {
    if (menu) { closeMenu(); return; }
    menu = document.createElement('div');
    menu.className = 'menu-pop theme-menu';
    menu.setAttribute('role', 'menu');
    menu.innerHTML = THEMES.map(t =>
      '<button type="button" class="theme-choice" role="menuitemradio" data-theme-choice="' + t.id + '" aria-pressed="false">' +
      '<span class="theme-dot" style="--dot-color:' + t.dot + '"></span><span>' + t.name + '</span><small>' + t.note + '</small></button>'
    ).join('');
    document.body.appendChild(menu);
    const r = (btn || document.body).getBoundingClientRect();
    menu.style.cssText = 'position:fixed;z-index:99990;min-width:190px;left:auto;top:' + (r.bottom + 8) + 'px;right:' + Math.max(12, window.innerWidth - r.right) + 'px';
    syncMenu();
    menu.addEventListener('click', e => {
      const c = e.target.closest('.theme-choice');
      if (c) { apply(c.dataset.themeChoice); closeMenu(); }
    });
    document.addEventListener('keydown', onKey, true);
  }
  document.addEventListener('click', e => {
    if (menu && !menu.contains(e.target) && !e.target.closest('[data-act="theme"]')) closeMenu();
  });

  window.ReportProTheme = { apply, applySaved, toggleMenu, themes: THEMES };
})();