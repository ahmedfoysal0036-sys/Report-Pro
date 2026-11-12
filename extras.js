/* Extras module — additive. Does not modify existing files; reads reports from localStorage.
   Features: calendar-first report flow (day sheet Edit/Delete/Add + Back), monthly OT target, missing-report alert, weekly view,
   duty stats, Excel export, calendar OT badges + legend, early duplicate-date warning. */
(() => {
  'use strict';
  if (window.__extrasLoaded) return;
  window.__extrasLoaded = true;

  const REPORTS_KEY = 'prof_stable_v30_ot_hm';
  const TARGET_KEY = 'extras_ot_target_v1';
  const DUTY_MIN = 540;
  const HOLIDAY_RATE = 900;
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pad = n => String(n).padStart(2, '0');
  const dstr = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = () => dstr(new Date());
  const parseD = s => new Date(s + 'T12:00:00');
  const addDays = (s, n) => { const d = parseD(s); d.setDate(d.getDate() + n); return dstr(d); };
  const money = v => '৳' + (Number(v) || 0).toLocaleString('en-BD', {minimumFractionDigits: 0, maximumFractionDigits: 2});
  const fmt = m => {
    m = Math.max(0, Math.round(m || 0));
    const h = Math.floor(m / 60), mm = m % 60;
    return h && mm ? `${h} hrs ${mm} mins` : h ? `${h} hrs` : mm ? `${mm} mins` : '0 hrs';
  };
  const fmtS = m => {
    m = Math.max(0, Math.round(m || 0));
    const h = Math.floor(m / 60), mm = m % 60;
    return h && mm ? `${h}h ${pad(mm)}m` : h ? `${h}h` : mm ? `${mm}m` : '0h';
  };
  const jget = (k, fb) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? fb : v; } catch (_) { return fb; } };
  const jset = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (_) { return false; } };

  /* ---------- Data ---------- */
  function parseOT(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.round(value));
    const s = String(value || '');
    const h = s.match(/(\d+)\s*hrs?/i), m = s.match(/(\d+)\s*mins?/i);
    return (h ? Number(h[1]) * 60 : 0) + (m ? Number(m[1]) : 0);
  }
  function reports() {
    const list = jget(REPORTS_KEY, []);
    return Array.isArray(list) ? list.filter(r => r && r.date) : [];
  }
  const isDuty = r => r && (r.shift === 'DAY' || r.shift === 'NIGHT');
  const isHolidayDuty = r => !!(r && (r.governmentHolidayDuty === true || r.holidayDuty === true) && isDuty(r));
  function kindOf(r) {
    if (!r) return 'blank';
    const s = String(r.shift || 'DAY');
    if (s === 'DAY') return 'day';
    if (s === 'NIGHT') return 'night';
    if (/leave/i.test(s)) return 'leave';
    if (/holiday/i.test(s)) return 'holiday';
    return 'off';
  }
  const KIND_LABEL = {day:'Day', night:'Night', leave:'Leave', holiday:'Holiday', off:'Off', blank:'—'};

  let pfCache = null, pfAt = 0;
  function finance() {
    if (pfCache && Date.now() - pfAt < 1500) return pfCache;
    try { pfCache = (window.exportPersonalFinanceBackup && window.exportPersonalFinanceBackup()) || {}; } catch (_) { pfCache = {}; }
    pfAt = Date.now();
    return pfCache;
  }
  function rateFor(date) {
    try {
      const C = window.PersonalFinanceCore;
      const p = C.getProfileFromProfiles(finance().profiles || [], date);
      return Number(p.otRate) || 0;
    } catch (_) { return 235; }
  }
  const otAmount = r => parseOT(r.ot) / 60 * rateFor(r.date);
  const roster = () => (finance().expectedWeekdays || []).map(Number);

  function longestStreak(list) {
    const dates = [...new Set(list.filter(isDuty).map(r => r.date))].sort();
    let best = 0, cur = 0, last = null;
    dates.forEach(d => {
      const t = parseD(d).getTime();
      cur = last !== null && t - last === 86400000 ? cur + 1 : 1;
      best = Math.max(best, cur); last = t;
    });
    return best;
  }
  function currentStreak(list) {
    const set = new Set(list.filter(isDuty).map(r => r.date));
    let d = today();
    if (!set.has(d)) d = addDays(d, -1);
    let n = 0;
    while (set.has(d)) { n++; d = addDays(d, -1); }
    return n;
  }

  /* ---------- Styles ---------- */
  function injectCSS() {
    if ($('extrasCss')) return;
    const st = document.createElement('style');
    st.id = 'extrasCss';
    st.textContent = `
.x-root{display:grid;gap:16px;margin:16px 0}
.x-grid2{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(300px,1fr))}
.x-card{display:flex;flex-direction:column;gap:12px;min-width:0}
.x-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap}
.x-timer{font-size:34px;font-weight:800;letter-spacing:-.03em;font-variant-numeric:tabular-nums;line-height:1.1}
.x-sub{font-size:12.5px;color:var(--muted);line-height:1.4}
.x-big{font-size:20px;font-weight:800;font-variant-numeric:tabular-nums}
.x-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.x-input{min-width:0;max-width:150px;padding:9px 11px;border:1px solid var(--border);border-radius:12px;background:var(--surface-2);color:var(--text);font:inherit}
.x-bar{height:12px;border-radius:999px;background:var(--surface-3);overflow:hidden}
.x-bar>i{display:block;height:100%;border-radius:inherit;background:var(--primary);transition:width .4s}
.x-bar.done>i{background:var(--success)}
.x-kv{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px}
.x-kv>div{padding:11px 13px;border:1px solid var(--border);border-radius:14px;background:var(--surface-2);min-width:0}
.x-kv small{display:block;font-size:11px;font-weight:600;color:var(--muted);margin-bottom:3px}
.x-kv b{font-size:16px;font-weight:800;letter-spacing:-.02em;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.x-chips{display:flex;flex-wrap:wrap;gap:6px}
.x-chip{padding:6px 10px;border-radius:999px;border:1px solid color-mix(in srgb,var(--danger) 32%,var(--border));background:var(--danger-soft);color:var(--danger);font-size:12px;font-weight:700;cursor:pointer;font-family:inherit}
.x-ok{color:var(--success);font-weight:700;font-size:13px}
.x-warnbox{padding:10px 12px;border-radius:12px;background:var(--warn-soft);color:var(--warn);font-size:12.5px;font-weight:600}
.x-week{display:grid;grid-template-columns:repeat(auto-fit,minmax(92px,1fr));gap:8px}
.x-wk{padding:9px 8px;border:1px solid var(--border);border-radius:14px;display:flex;flex-direction:column;gap:2px;min-width:0}
.x-wk strong{font-size:12px}
.x-wk span{font-size:11px;color:var(--text-2)}
.x-wk b{font-size:13px;font-weight:800;font-variant-numeric:tabular-nums}
.x-wk em{font-style:normal;font-size:10.5px;font-weight:700;color:var(--primary)}
.x-wk.is-today{box-shadow:0 0 0 2px var(--primary)}
[data-act="tab"][data-tab="report"]{display:none!important}
.x-back{margin:0 0 12px}
.x-day-actions{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 14px}
.x-dupe{margin-top:4px;color:var(--danger);font-size:12px;font-weight:700}
.x-legend{display:flex;flex-wrap:wrap;gap:6px 12px;font-size:11.5px;color:var(--text-2);align-items:center}
.x-legend span.x-sw{display:inline-block;width:12px;height:12px;border-radius:4px;border:1px solid var(--border);vertical-align:-1px;margin-right:4px}
.x-cal-ot{display:block;font-style:normal;font-size:10px;font-weight:800;color:var(--primary);margin-top:2px}
.x-cal-amt{display:block;font-style:normal;font-size:10px;font-weight:700;color:var(--success)}
#calendarGrid .cal-cell.x-today{position:relative}
.x-today-tag{position:absolute;top:6px;right:6px;padding:1px 6px;border-radius:999px;background:var(--primary);color:var(--on-primary);font-style:normal;font-size:9px;font-weight:800;letter-spacing:.02em}
@media(max-width:480px){.x-cal-ot,.x-cal-amt{font-size:8.5px}.x-today-tag{top:4px;right:3px;padding:1px 4px;font-size:7.5px}}
/* 3 states: no report = plain, report entered = tint + bold border, holiday = holiday tint + bold border */
#view-calendar #calendarGrid .cal-cell{box-shadow:none;border:1px solid var(--border);background:var(--surface)}
#view-calendar #calendarGrid .cal-cell.x-has{border:2px solid var(--primary);background:var(--primary-soft)}
#view-calendar #calendarGrid .cal-cell.x-has.x-hol{border-color:var(--warn);background:var(--warn-soft)}
.x-wk{background:var(--surface)}
.x-wk.x-has{border:2px solid var(--primary);background:var(--primary-soft)}
.x-wk.x-has.x-hol{border-color:var(--warn);background:var(--warn-soft)}
#view-calendar .calendar-legend>span:not(#xCalLegend){display:none}
#xCalLegend{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center}
#xCalLegend .x-sw{display:inline-block;width:14px;height:14px;border-radius:5px;vertical-align:-2px;margin-right:5px;box-sizing:border-box}
`;
    document.head.appendChild(st);
  }

  /* ---------- Mount ---------- */
  function mount() {
    if ($('extrasRoot')) return true;
    const host = $('personalDashboard');
    if (!host || !host.parentNode) return false;
    const root = document.createElement('div');
    root.id = 'extrasRoot';
    root.className = 'x-root';
    root.innerHTML = `
      <div class="x-grid2">
        <div class="card x-card" id="xTarget"><div class="x-head"><div><p class="page-kicker">Goal</p><h2 class="card-title">Monthly OT target</h2></div></div>
          <div class="x-row"><input class="x-input" id="xTargetInput" type="number" min="0" step="1" inputmode="numeric" placeholder="Hours, e.g. 40" aria-label="Monthly OT target in hours"><button class="btn btn-sm" type="button" data-x="target-save">Set target</button><button class="btn btn-sm" type="button" data-x="target-clear">Clear</button></div>
          <div id="xTargetBody"></div></div>
      <div class="card x-card" id="xMissing"><div class="x-head"><div><p class="page-kicker">Alert</p><h2 class="card-title">Missing reports (last 14 days)</h2></div></div><div id="xMissingBody"></div></div>
      </div>
      <div class="card x-card" id="xWeek"><div class="x-head"><div><p class="page-kicker">Weekly view</p><h2 class="card-title" id="xWeekTitle">This week</h2></div><div class="x-row"><button class="btn btn-icon" type="button" data-x="wk-prev" aria-label="Previous week">‹</button><button class="btn btn-sm" type="button" data-x="wk-now">This week</button><button class="btn btn-icon" type="button" data-x="wk-next" aria-label="Next week">›</button></div></div><div id="xWeekBody"></div></div>
      <div class="card x-card" id="xStats"><div class="x-head"><div><p class="page-kicker">Insights</p><h2 class="card-title" id="xStatsTitle">Duty stats</h2></div></div><div id="xStatsBody"></div></div>
      <div class="card x-card" id="xExport"><div class="x-head"><div><p class="page-kicker">Export</p><h2 class="card-title">OT &amp; payable Excel report</h2></div></div>
        <div class="x-row"><input class="x-input" id="xExpMonth" type="month" aria-label="Month to export"><button class="btn btn-sm" type="button" data-x="export">Download .xlsx</button></div>
        <p class="x-sub">Includes a day-by-day sheet for the chosen month and a month-by-month summary for that year (OT hours, OT taka, holiday allowance).</p></div>`;
    host.parentNode.insertBefore(root, host.nextSibling);
    $('xExpMonth').value = today().slice(0, 7);
    return true;
  }

  /* ---------- Report form as a sheet (calendar-first flow) ---------- */
  const hhmm = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  function setField(id, v) {
    const el = $(id); if (!el) return;
    el.value = v;
    el.dispatchEvent(new Event('input', {bubbles: true}));
    el.dispatchEvent(new Event('change', {bubbles: true}));
  }
  function openReport(opts) {
    const nb = document.querySelector('[data-act="new"]');
    if (!nb) return false;
    nb.click();
    const view = $('view-report');
    if (view && view.hidden) return false; // user cancelled the "discard changes" prompt
    setField('reportDate', opts.date);
    if (opts.start) setField('startTime', opts.start);
    if (opts.end) setField('endTime', opts.end);
    if (opts.start) {
      const r = $(opts.night ? 'shiftNight' : 'shiftDay');
      if (r) { r.checked = true; r.dispatchEvent(new Event('change', {bubbles: true})); }
    }
    return true;
  }
  let lastTab = 'dashboard', saveFlag = 0;
  const TAB_NAMES = {dashboard: 'Dashboard', history: 'History', analytics: 'Analytics', calendar: 'Calendar', money: 'Money'};
  const goTab = t => { const b = document.querySelector(`[data-act="tab"][data-tab="${t}"]`); if (b) b.click(); };
  function triggerAct(act, id) {
    const b = document.createElement('button');
    b.hidden = true; b.dataset.act = act; if (id) b.dataset.id = String(id);
    document.body.appendChild(b); b.click(); b.remove();
  }
  function updateBackLabel() {
    const b = document.querySelector('#xBackBar button');
    if (b) b.textContent = '← Back to ' + (TAB_NAMES[lastTab] || 'Calendar');
  }
  function installBackBar() {
    const v = $('view-report');
    if (!v || $('xBackBar')) return;
    const bar = document.createElement('div');
    bar.id = 'xBackBar'; bar.className = 'x-back';
    bar.innerHTML = '<button class="btn btn-sm" type="button" data-x="back">← Back</button>';
    v.insertBefore(bar, v.firstChild);
    updateBackLabel();
  }
  function afterSave() {
    const v = $('view-report'), chip = $('dirtyChip');
    if (saveFlag && Date.now() - saveFlag < 20000 && v && !v.hidden && chip && chip.hidden) { saveFlag = 0; goTab(lastTab); }
  }
  function decorateDayModal(modal) {
    if (modal.querySelector('.x-day-actions')) return;
    const head = modal.querySelector('.calendar-day-header'), h = modal.querySelector('.calendar-day-header h2');
    if (!head || !h) return;
    const date = h.textContent.trim();
    const rec = reports().find(r => r.date === date);
    const bar = document.createElement('div');
    bar.className = 'x-day-actions';
    bar.dataset.date = date;
    if (rec) bar.dataset.id = String(rec.id);
    bar.innerHTML = rec
      ? '<button class="btn btn-sm" type="button" data-x="day-edit">Edit report</button><button class="btn btn-sm" type="button" data-x="day-del">Delete</button>'
      : '<select class="x-input" id="xHolType" aria-label="Holiday type"><option value="Weekly Holiday">Weekly holiday</option><option value="Goverment Holiday">Government holiday</option><option value="Off day">Off day</option></select>'
        + '<button class="btn btn-sm" type="button" data-x="day-hol">Set holiday</button>'
        + '<button class="btn btn-sm" type="button" data-x="day-add">Add report</button>';
    head.after(bar);
  }
  function setHoliday(date, type) {
    // Uses the app's own form + save, so it syncs to the cloud and shows in History like any off-day report.
    if (!openReport({date})) return;
    const off = $('shiftOff'); if (!off) return;
    off.checked = true; off.dispatchEvent(new Event('change', {bubbles: true}));
    const sel = $('offType');
    if (sel) { sel.value = type; sel.dispatchEvent(new Event('change', {bubbles: true})); }
    const sv = document.querySelector('[data-act="save"]');
    if (sv) sv.click();
  }
  function dayAction(a, bar) {
    const date = bar.dataset.date, id = bar.dataset.id;
    const close = () => { const c = document.querySelector('.calendar-day-close'); if (c) c.click(); };
    lastTab = 'calendar'; updateBackLabel();
    if (a === 'day-add') { close(); openReport({date}); }
    else if (a === 'day-hol') {
      const type = ($('xHolType') && $('xHolType').value) || 'Weekly Holiday';
      close(); setHoliday(date, type);
    }
    else if (a === 'day-edit') { close(); triggerAct('edit', id); }
    else if (a === 'day-del') {
      triggerAct('del', id); // app asks "Delete this report?"
      if (!reports().some(r => String(r.id) === String(id))) {
        close();
        if (window.renderPersonalCalendar) window.renderPersonalCalendar();
      }
    }
  }

  /* ---------- 2. Monthly OT target ---------- */
  function renderTarget() {
    const body = $('xTargetBody'); if (!body) return;
    const inp = $('xTargetInput');
    const t = jget(TARGET_KEY, null);
    const targetH = t && Number(t.hours) > 0 ? Number(t.hours) : 0;
    if (inp && document.activeElement !== inp) inp.value = targetH || '';
    const ym = today().slice(0, 7);
    const rows = reports().filter(r => r.date.startsWith(ym));
    const mins = rows.reduce((n, r) => n + parseOT(r.ot), 0);
    const amount = rows.reduce((n, r) => n + otAmount(r), 0);
    if (!targetH) {
      body.innerHTML = `<div class="x-kv"><div><small>${esc(MONTHS[Number(ym.slice(5)) - 1])} OT so far</small><b>${esc(fmt(mins))}</b></div><div><small>OT amount</small><b>${money(amount)}</b></div></div><p class="x-sub">Upore ekta monthly OT target (hours) set koro, progress ekhane dekhabe.</p>`;
      return;
    }
    const targetMin = targetH * 60;
    const pct = Math.min(100, Math.round(mins / targetMin * 100));
    const left = Math.max(0, targetMin - mins);
    const now = new Date();
    const daysLeft = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate() + 1;
    const pace = left > 0 && daysLeft > 0 ? `Target dhorte protidin ~${fmt(Math.ceil(left / daysLeft))} lagbe (baki ${daysLeft} din).` : '';
    body.innerHTML = `<div class="x-bar ${left === 0 ? 'done' : ''}" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct}%"></i></div>
      <div class="x-kv"><div><small>Done</small><b>${esc(fmt(mins))}</b></div><div><small>Target</small><b>${esc(fmt(targetMin))}</b></div><div><small>${left ? 'Remaining' : 'Status'}</small><b>${left ? esc(fmt(left)) : 'Target done 🎉'}</b></div><div><small>OT amount so far</small><b>${money(amount)}</b></div></div>
      <p class="x-sub">${pct}% complete. ${esc(pace)}</p>`;
  }
  function targetSave() {
    const v = Number($('xTargetInput').value);
    if (!(v > 0)) { alert('Hours er ekta positive number dao.'); return; }
    jset(TARGET_KEY, {hours: v});
    renderTarget();
  }
  function targetClear() {
    try { localStorage.removeItem(TARGET_KEY); } catch (_) {}
    $('xTargetInput').value = '';
    renderTarget();
  }

  /* ---------- 8. Missing-report alert ---------- */
  function renderMissing() {
    const body = $('xMissingBody'); if (!body) return;
    const list = reports();
    const ros = roster();
    if (!ros.length) {
      body.innerHTML = '<p class="x-sub">Calendar tab e “expected weekdays” (roster) set korle ekhane missing report alert cholbe.</p>';
      return;
    }
    const have = new Set(list.map(r => r.date));
    const first = list.map(r => r.date).sort()[0] || today();
    const miss = [];
    for (let i = 1; i <= 14; i++) {
      const d = addDays(today(), -i);
      if (d < first) continue;
      if (ros.includes(parseD(d).getDay()) && !have.has(d)) miss.push(d);
    }
    body.innerHTML = miss.length
      ? `<div class="x-chips">${miss.map(d => `<button type="button" class="x-chip" data-x="missing-open" data-date="${d}">${esc(d)} · ${DAYS[parseD(d).getDay()]}</button>`).join('')}</div><p class="x-sub">Date e click korle oi date er notun report khulbe.</p>`
      : '<p class="x-ok">✓ Last 14 din e kono missing report nai.</p>';
  }

  /* ---------- 12. Weekly view ---------- */
  let weekOff = 0;
  function renderWeek() {
    const body = $('xWeekBody'); if (!body) return;
    const t = today();
    const toSat = (parseD(t).getDay() + 1) % 7; // week starts Saturday
    const start = addDays(t, -toSat + weekOff * 7);
    const map = new Map(reports().map(r => [r.date, r]));
    let mins = 0, amount = 0, duty = 0;
    const cells = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(start, i), r = map.get(d), k = kindOf(r);
      const m = r ? parseOT(r.ot) : 0;
      if (r) {
        mins += m; amount += otAmount(r);
        if (isDuty(r)) duty++;
        if (isHolidayDuty(r)) amount += HOLIDAY_RATE;
      }
      cells.push(`<div class="x-wk${r ? ' x-has' : ''}${k === 'holiday' || k === 'off' ? ' x-hol' : ''}${d === t ? ' is-today' : ''}"><strong>${DAYS[parseD(d).getDay()]} ${d.slice(8)}/${d.slice(5, 7)}</strong><span>${KIND_LABEL[k]}${r && isHolidayDuty(r) ? ' + Gov' : ''}</span><b>${m ? esc(fmtS(m)) : '—'}</b>${m ? `<em>${money(otAmount(r))}</em>` : ''}</div>`);
    }
    const end = addDays(start, 6);
    $('xWeekTitle').textContent = weekOff === 0 ? 'This week' : `${start} → ${end}`;
    body.innerHTML = `<div class="x-week">${cells.join('')}</div>
      <div class="x-kv"><div><small>Week OT</small><b>${esc(fmt(mins))}</b></div><div><small>Week payable (OT + holiday)</small><b>${money(amount)}</b></div><div><small>Duty days</small><b>${duty}</b></div></div>
      <p class="x-sub">${esc(start)} to ${esc(end)} (Saturday–Friday)</p>`;
  }

  /* ---------- 11. Stats ---------- */
  function renderStats() {
    const body = $('xStatsBody'); if (!body) return;
    const sel = ($('dashYear') && $('dashYear').value) || today().slice(0, 4);
    const all = reports();
    const rows = all.filter(r => r.date.startsWith(sel + '-'));
    const duty = rows.filter(isDuty);
    const total = rows.reduce((n, r) => n + parseOT(r.ot), 0);
    const amount = rows.reduce((n, r) => n + otAmount(r), 0);
    const perMonth = Array(12).fill(0);
    rows.forEach(r => { perMonth[Number(r.date.slice(5, 7)) - 1] += parseOT(r.ot); });
    const bestIdx = perMonth.reduce((b, v, i) => v > perMonth[b] ? i : b, 0);
    const peak = rows.reduce((b, r) => parseOT(r.ot) > (b ? parseOT(b.ot) : 0) ? r : b, null);
    $('xStatsTitle').textContent = `Duty stats · ${sel}`;
    const cell = (l, v) => `<div><small>${esc(l)}</small><b>${esc(v)}</b></div>`;
    body.innerHTML = `<div class="x-kv">${[
      cell('Total duty days', String(duty.length)),
      cell('Total OT', fmt(total)),
      cell('Total OT amount', money(amount)),
      cell('Avg OT / duty day', duty.length ? fmt(Math.round(total / duty.length)) : '0 hrs'),
      cell('Best OT month', perMonth[bestIdx] > 0 ? `${MONTHS[bestIdx]} · ${fmt(perMonth[bestIdx])}` : '—'),
      cell('Highest OT day', peak && parseOT(peak.ot) > 0 ? `${peak.date} · ${fmt(parseOT(peak.ot))}` : '—'),
      cell('Current duty streak', `${currentStreak(all)} days`),
      cell('Longest duty streak', `${longestStreak(rows)} days`)
    ].join('')}</div>`;
  }

  /* ---------- 9. Excel export ---------- */
  function exportXlsx() {
    if (!window.XLSX) { alert('Excel tools load hoyni. Page refresh kore abar try koro.'); return; }
    const ym = ($('xExpMonth') && $('xExpMonth').value) || today().slice(0, 7);
    const year = ym.slice(0, 4);
    const all = reports();
    const r2 = n => Math.round((Number(n) || 0) * 100) / 100;

    const monthRows = all.filter(r => r.date.startsWith(ym)).sort((a, b) => a.date.localeCompare(b.date));
    const daily = [['Date', 'Day', 'Shift', 'From', 'To', 'OT', 'OT (mins)', 'OT rate / hr', 'OT amount', 'Gov holiday duty', 'Holiday amount']];
    let tm = 0, ta = 0, th = 0;
    monthRows.forEach(r => {
      const m = parseOT(r.ot), a = r2(otAmount(r)), h = isHolidayDuty(r) ? HOLIDAY_RATE : 0;
      tm += m; ta += a; th += h;
      daily.push([r.date, DAYS[parseD(r.date).getDay()], r.shift || '', r.startTime || '', r.endTime || '', fmt(m), m, r2(rateFor(r.date)), a, h ? 'Yes' : '', h]);
    });
    daily.push([]);
    daily.push(['TOTAL', '', '', '', '', fmt(tm), tm, '', r2(ta), '', th]);
    daily.push(['Payable (OT + holiday)', '', '', '', '', '', '', '', r2(ta + th)]);

    const summary = [['Month', 'Duty days', 'OT', 'OT (mins)', 'OT amount', 'Holiday days', 'Holiday amount', 'Total']];
    let ym2 = 0, ya = 0, yh = 0, yd = 0;
    MONTHS.forEach((name, i) => {
      const key = `${year}-${pad(i + 1)}`;
      const rows = all.filter(r => r.date.startsWith(key));
      const m = rows.reduce((n, r) => n + parseOT(r.ot), 0);
      const a = r2(rows.reduce((n, r) => n + otAmount(r), 0));
      const hd = rows.filter(isHolidayDuty).length;
      const duty = rows.filter(isDuty).length;
      ym2 += m; ya += a; yh += hd * HOLIDAY_RATE; yd += duty;
      summary.push([name, duty, fmt(m), m, a, hd, hd * HOLIDAY_RATE, r2(a + hd * HOLIDAY_RATE)]);
    });
    summary.push([]);
    summary.push([`${year} TOTAL`, yd, fmt(ym2), ym2, r2(ya), '', yh, r2(ya + yh)]);

    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.aoa_to_sheet(daily);
    ws1['!cols'] = [12, 7, 10, 8, 8, 14, 10, 12, 12, 16, 15].map(wch => ({wch}));
    const ws2 = XLSX.utils.aoa_to_sheet(summary);
    ws2['!cols'] = [14, 10, 14, 10, 12, 12, 15, 12].map(wch => ({wch}));
    XLSX.utils.book_append_sheet(wb, ws1, `Daily ${ym}`);
    XLSX.utils.book_append_sheet(wb, ws2, `Year ${year}`);
    XLSX.writeFile(wb, `OT_Report_${ym}.xlsx`);
  }

  /* ---------- 7. Early duplicate-date warning (save logic unchanged) ---------- */
  function checkDupe() {
    const inp = $('reportDate'); if (!inp || !inp.parentElement) return;
    let w = $('xDupeWarn');
    if (!w) { w = document.createElement('div'); w.id = 'xDupeWarn'; w.className = 'x-dupe'; w.hidden = true; inp.parentElement.appendChild(w); }
    const d = inp.value, eid = $('editingId') ? $('editingId').value : '';
    const clash = d && reports().find(r => r.date === d && String(r.id) !== String(eid));
    w.hidden = !clash;
    if (clash) w.textContent = `⚠ ${d} date e already ekta report ache. Save korle replace korar jiggesh korbe.`;
  }

  /* ---------- 10. Calendar: OT badge + legend ---------- */
  function decorateCalendar() {
    const grid = $('calendarGrid'); if (!grid) return;
    const legend = document.querySelector('#view-calendar .calendar-legend');
    if (legend && !$('xCalLegend')) {
      const sp = document.createElement('span');
      sp.id = 'xCalLegend';
      sp.innerHTML = '<span><i class="x-sw" style="background:var(--surface);border:1px solid var(--border)"></i>No report</span>'
        + '<span><i class="x-sw" style="background:var(--primary-soft);border:2px solid var(--primary)"></i>Report entered</span>'
        + '<span><i class="x-sw" style="background:var(--warn-soft);border:2px solid var(--warn)"></i>Holiday</span>'
        + '<span><b style="color:var(--primary)">5h</b> / ৳ = OT time and taka</span>';
      legend.appendChild(sp);
    }
    const all = reports();
    const map = new Map(all.map(r => [r.date, r]));
    const t = today();
    grid.querySelectorAll('.cal-cell[data-date]').forEach(c => {
      const r = map.get(c.dataset.date);
      if (r) {
        c.classList.add('x-has');
        const k = kindOf(r);
        if (k === 'holiday' || k === 'off') c.classList.add('x-hol');
      }
      if (c.dataset.date === t && !c.querySelector('.x-today-tag')) {
        const tag = document.createElement('em');
        tag.className = 'x-today-tag'; tag.textContent = 'Today';
        c.classList.add('x-today'); c.appendChild(tag);
      }
      if (c.querySelector('.x-cal-ot') || !r) return;
      const m = parseOT(r.ot); if (m <= 0) return;
      const amt = otAmount(r);
      const em = document.createElement('em');
      em.className = 'x-cal-ot'; em.textContent = fmtS(m);
      c.appendChild(em);
      const am = document.createElement('em');
      am.className = 'x-cal-amt'; am.textContent = '৳' + Math.round(amt).toLocaleString('en-BD');
      am.title = money(amt);
      c.appendChild(am);
    });
    renderCalOT(all);
  }
  /* 2 OT boxes placed inside the existing calendar summary grid (fills the empty slots) */
  function renderCalOT(all) {
    const sum = $('calendarSummary'); if (!sum) return;
    const old = $('xCalOT'); if (old) old.remove();
    const mi = $('calMonth'), ym = (mi && mi.value) || today().slice(0, 7);
    const rows = all.filter(r => r.date.startsWith(ym));
    const mins = rows.reduce((n, r) => n + parseOT(r.ot), 0);
    const otAmt = rows.reduce((n, r) => n + otAmount(r), 0);
    const hol = rows.filter(isHolidayDuty).length * HOLIDAY_RATE;
    const put = (id, v, l) => {
      let el = $(id);
      if (!el) { el = document.createElement('div'); el.id = id; el.className = 'stat'; sum.appendChild(el); }
      el.innerHTML = `<b>${esc(v)}</b><span>${esc(l)}</span>`;
    };
    put('xStatOT', fmt(mins), 'Total OT hours (this month)');
    put('xStatPay', money(otAmt + hol), hol ? 'Payable OT (incl. holiday allowance)' : 'Payable OT amount');
  }
  function watchCalendar() {
    const grid = $('calendarGrid'); if (!grid) return;
    new MutationObserver(decorateCalendar).observe(grid, {childList: true});
    decorateCalendar();
  }

  /* ---------- Wiring ---------- */
  function renderAll() {
    if (!$('extrasRoot') && !mount()) return;
    pfCache = null;
    renderTarget(); renderMissing(); renderWeek(); renderStats();
    installBackBar();
    decorateCalendar();
    checkDupe();
  }

  document.addEventListener('click', e => {
    const tb = e.target.closest('[data-act="tab"][data-tab]');
    if (tb && tb.dataset.tab !== 'report') { lastTab = tb.dataset.tab; updateBackLabel(); }
    if (e.target.closest('[data-act="save"]')) saveFlag = Date.now();
    const b = e.target.closest('[data-x]');
    if (b) {
      const a = b.dataset.x;
      if (a === 'back') {
        const chip = $('dirtyChip');
        if (chip && !chip.hidden && !confirm('Unsaved change ache. Discard kore back jabe?')) return;
        goTab(lastTab);
      }
      else if (a === 'day-edit' || a === 'day-del' || a === 'day-add' || a === 'day-hol') dayAction(a, b.closest('.x-day-actions'));
      else if (a === 'target-save') targetSave();
      else if (a === 'target-clear') targetClear();
      else if (a === 'wk-prev') { weekOff--; renderWeek(); }
      else if (a === 'wk-next') { weekOff++; renderWeek(); }
      else if (a === 'wk-now') { weekOff = 0; renderWeek(); }
      else if (a === 'export') exportXlsx();
      else if (a === 'missing-open') { updateBackLabel(); openReport({date: b.dataset.date}); }
      return;
    }
    if (e.target.closest('[data-tab],[data-act]')) setTimeout(() => { checkDupe(); decorateCalendar(); renderAll(); }, 80);
  });
  document.addEventListener('keydown', e => {
    const v = $('view-report');
    if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === 's' && v && !v.hidden) saveFlag = Date.now();
  });
  document.addEventListener('input', e => { if (e.target && e.target.id === 'reportDate') checkDupe(); });
  document.addEventListener('change', e => {
    if (e.target && e.target.id === 'reportDate') checkDupe();
    if (e.target && e.target.id === 'dashYear') renderStats();
  });
  window.addEventListener('activity-data-updated', () => { renderAll(); afterSave(); });
  window.addEventListener('activity-auth-changed', () => setTimeout(renderAll, 300));
  window.addEventListener('storage', renderAll);
  new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => {
    if (n.nodeType === 1 && n.classList.contains('calendar-day-backdrop')) decorateDayModal(n);
  }))).observe(document.body, {childList: true});

  function boot() {
    injectCSS();
    renderAll();
    watchCalendar();
    setTimeout(renderAll, 1200);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();