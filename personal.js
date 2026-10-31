/* Personal Duty & Finance module — additive storage, existing reports remain untouched. */
(() => {
  'use strict';

  const REPORTS_KEY = 'prof_stable_v30_ot_hm';
  const LOCAL_FINANCE_KEY = 'personal_finance_v1';
  const HOLIDAY_RATE = 900;
  const DEFAULT_OT_RATE = 235;
  const $ = id => document.getElementById(id);
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const money = value => '৳' + (Number(value) || 0).toLocaleString('en-BD', {minimumFractionDigits: 0, maximumFractionDigits: 2});
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  };
  const monthNow = () => today().slice(0,7);
  const id = () => `${Date.now()}-${Math.random().toString(36).slice(2,9)}`;
  const parseJSON = (raw, fallback) => { try { const v = JSON.parse(raw); return v == null ? fallback : v; } catch (_) { return fallback; } };
  const monthShift = (ym, delta) => {
    const [y,m] = ym.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  };
  const lastDateOfMonth = ym => {
    const [y,m] = ym.split('-').map(Number);
    return `${ym}-${String(new Date(y,m,0).getDate()).padStart(2,'0')}`;
  };
  const blankData = () => ({version:1, profiles:[], foodAllowances:[], foodExpenses:[], journeys:[], expectedWeekdays:[], updatedAt:0});
  const defaultData = () => blankData();
  let finance = defaultData();
  let activeUid = null;
  let financeRef = null;
  let financeListener = null;
  let selectedCalendarMonth = monthNow();
  let selectedMoneyMonth = monthNow();
  let localOnlyReason = 'Sign in to enable finance cloud sync.';

  function notice(message, type='info') {
    const host = $('toasts');
    if (!host) { console.warn(message); return; }
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    host.appendChild(el);
    setTimeout(() => el.remove(), 4500);
  }

  function financeKey() { return activeUid ? `${LOCAL_FINANCE_KEY}_${activeUid}` : LOCAL_FINANCE_KEY; }
  function normalizeFinance(raw) {
    const d = raw && typeof raw === 'object' ? raw : blankData();
    return {
      version: 1,
      profiles: Array.isArray(d.profiles) ? d.profiles : [],
      foodAllowances: Array.isArray(d.foodAllowances) ? d.foodAllowances : [],
      foodExpenses: Array.isArray(d.foodExpenses) ? d.foodExpenses : [],
      journeys: Array.isArray(d.journeys) ? d.journeys : [],
      expectedWeekdays: Array.isArray(d.expectedWeekdays) ? d.expectedWeekdays.map(Number).filter(n => n>=0 && n<=6) : [],
      updatedAt: Number(d.updatedAt) || 0
    };
  }
  function loadLocalFinance() {
    const raw = localStorage.getItem(financeKey());
    if (!raw) return blankData();
    try { return normalizeFinance(JSON.parse(raw)); }
    catch (err) {
      // Preserve corrupt bytes for manual recovery; never overwrite them on load.
      try { localStorage.setItem(`${financeKey()}_corrupt_${Date.now()}`, raw); } catch (_) {}
      notice('Finance data could not be read. A recovery copy was preserved; no automatic overwrite was made.', 'error');
      return blankData();
    }
  }
  function saveLocalFinance(next) {
    const raw = JSON.stringify(next);
    try {
      localStorage.setItem(financeKey(), raw);
      return localStorage.getItem(financeKey()) === raw;
    } catch (err) {
      console.error('Finance local save failed:', err);
      notice('Finance save failed on this device. Existing data was not replaced. Export a backup and check storage.', 'error');
      return false;
    }
  }
  function saveFinance(mutator) {
    const previous = finance;
    const next = normalizeFinance(JSON.parse(JSON.stringify(finance)));
    mutator(next);
    next.updatedAt = Date.now();
    if (!saveLocalFinance(next)) return false;
    finance = next;
    renderAll();
    syncFinanceCloud();
    return true;
  }
  function readReports() {
    try {
      const raw = localStorage.getItem(REPORTS_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter(r => r && r.date) : [];
    } catch (err) {
      console.error('Could not read activity reports for finance calculations:', err);
      return [];
    }
  }
  function parseOT(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.round(value));
    const s = String(value || '');
    const h = s.match(/(\d+)\s*hrs?/i), m = s.match(/(\d+)\s*mins?/i);
    return (h ? Number(h[1])*60 : 0) + (m ? Number(m[1]) : 0);
  }
  function isDuty(r) { return r && (r.shift === 'DAY' || r.shift === 'NIGHT'); }
  function shiftKind(r) {
    const s = String((r && r.shift) || 'DAY');
    if (s === 'DAY') return 'Day';
    if (s === 'NIGHT') return 'Night';
    if (/leave/i.test(s)) return 'Leave';
    if (/holiday/i.test(s)) return 'Holiday';
    return 'Off';
  }
  function liveProfiles() { return finance.profiles.filter(p => p && !p.deleted && p.effectiveFrom); }
  function getProfileFromProfiles(profiles, date) {
    const match = (profiles || []).filter(p => p && !p.deleted && p.effectiveFrom && p.effectiveFrom <= date)
      .sort((a,b) => a.effectiveFrom.localeCompare(b.effectiveFrom) || (a.updatedAt||0)-(b.updatedAt||0)).pop();
    return match || {monthlySalary:0, otRate:DEFAULT_OT_RATE, effectiveFrom:'0001-01-01'};
  }
  function profileFor(date) { return getProfileFromProfiles(finance.profiles, date); }
  function reportIsHolidayDuty(report) {
    return !!(report && (report.governmentHolidayDuty === true || report.holidayDuty === true));
  }
  function getOTAmountForProfiles(report, profiles) {
    const hours = parseOT(report.ot) / 60;
    const rate = Number(getProfileFromProfiles(profiles, report.date).otRate) || 0;
    return hours * rate;
  }
  function getOTAmount(report) { return getOTAmountForProfiles(report, finance.profiles); }
  function buildPayoutSummary(allReports, data, salaryMonth) {
    const d = normalizeFinance(data);
    const workMonth = monthShift(salaryMonth, -2);
    const reports = (allReports || []).filter(r => r && String(r.date).startsWith(workMonth));
    let otMinutes = 0, otAmount = 0, holidayDays = 0;
    reports.forEach(r => {
      otMinutes += parseOT(r.ot);
      otAmount += getOTAmountForProfiles(r, d.profiles);
      if (reportIsHolidayDuty(r) && isDuty(r)) holidayDays++;
    });
    const salaryProfile = getProfileFromProfiles(d.profiles, lastDateOfMonth(salaryMonth));
    const salary = Number(salaryProfile.monthlySalary) || 0;
    const holidayAmount = holidayDays * HOLIDAY_RATE;
    const foodReceived = d.foodAllowances.filter(x => !x.deleted && x.date && x.date.startsWith(salaryMonth) && x.status === 'paid').reduce((n,x)=>n+(Number(x.amount)||0),0);
    const foodExpense = d.foodExpenses.filter(x => !x.deleted && x.date && x.date.startsWith(salaryMonth)).reduce((n,x)=>n+(Number(x.amount)||0),0);
    const totalIncome = salary + otAmount + holidayAmount + foodReceived;
    return {salaryMonth,workMonth,reports,otMinutes,otAmount,holidayDays,holidayAmount,salary,foodReceived,foodExpense,totalIncome,net:totalIncome-foodExpense};
  }
  function payoutForMonth(salaryMonth) { return buildPayoutSummary(readReports(), finance, salaryMonth); }
  function runningWorkMonth(ym) {
    const reports = readReports().filter(r => String(r.date).startsWith(ym));
    return reports.reduce((a,r)=>{
      a.minutes += parseOT(r.ot); a.otAmount += getOTAmount(r);
      if (reportIsHolidayDuty(r) && isDuty(r)) a.holidayDays++;
      return a;
    }, {minutes:0,otAmount:0,holidayDays:0});
  }
  function maxOTDay(reports) {
    return reports.reduce((best,r)=>parseOT(r.ot) > (best ? parseOT(best.ot) : 0) ? r : best, null);
  }
  function barHTML(items, key, formatter, maxValue) {
    const max = Math.max(1, ...items.map(x => Number(x[key])||0));
    return items.map(x => {
      const value = Number(x[key])||0;
      const height = Math.max(3, Math.round(value / max * 150));
      return `<div class="bar-col" title="${esc(x.label)}: ${esc(formatter(value))}"><div class="bar-val">${esc(formatter(value))}</div><div class="bar${x.current?' bar-current':''}" style="height:${height}px"></div><div class="bar-lbl">${esc(x.short||x.label.slice(0,3))}</div></div>`;
    }).join('');
  }

  function renderPersonalDashboard() {
    const mount = $('personalDashboard');
    if (!mount) return;
    const reports = readReports();
    const now = today(), ym = monthNow(), y = now.slice(0,4);
    const todays = reports.filter(r => r.date === now);
    const monthRows = reports.filter(r => r.date.startsWith(ym));
    const yearRows = reports.filter(r => r.date.startsWith(y+'-'));
    const todayMins = todays.reduce((n,r)=>n+parseOT(r.ot),0);
    const monthMins = monthRows.reduce((n,r)=>n+parseOT(r.ot),0);
    const yearMins = yearRows.reduce((n,r)=>n+parseOT(r.ot),0);
    const holidayMonthDays = monthRows.filter(r=>reportIsHolidayDuty(r)&&isDuty(r)).length;
    const workMonthAmount = runningWorkMonth(ym);
    const due = payoutForMonth(ym);
    const dutyDays = yearRows.filter(isDuty).length;
    const offDays = yearRows.filter(r=>!isDuty(r)&&shiftKind(r)!=='Leave').length;
    const peak = maxOTDay(yearRows);
    const currentYear = $('dashYear')?.value || y;
    const salaryBars = months.map((name,i)=>{
      const salaryMonth = `${currentYear}-${String(i+1).padStart(2,'0')}`;
      const summary = payoutForMonth(salaryMonth);
      return {label:name,short:name.slice(0,3),value:summary.totalIncome,current:salaryMonth===ym};
    });
    const topCards = [
      [money(getOTAmount({date:now,ot:formatOT(todayMins)})), 'Today OT amount'],
      [fmtOTText(todayMins), 'Today OT hours'],
      [fmtOTText(monthMins), `${months[new Date().getMonth()]} OT hours`],
      [money(monthRows.reduce((n,r)=>n+getOTAmount(r),0)), 'Current work-month OT value'],
      [fmtOTText(yearMins), `${y} total OT hours`],
      [money(yearRows.reduce((n,r)=>n+getOTAmount(r),0)), `${y} total OT value`],
      [dutyDays, 'Recorded duty days this year'],
      [offDays, 'Recorded off days this year'],
      [peak ? `${peak.date} · ${fmtOTText(parseOT(peak.ot))}` : '—', 'Highest OT day']
    ];
    mount.innerHTML = `
      <div class="card stack">
        <div class="toolbar"><h2 class="card-title">Salary &amp; payable OT overview</h2><span class="spacer"></span><span class="badge b-day">Salary month: ${esc(months[Number(ym.slice(5))-1])}</span></div>
        <div class="payroll-hero"><span>Payable for ${esc(due.workMonth)} work-month</span><strong>${money(due.otAmount + due.holidayAmount)}</strong><small>Regular OT ${money(due.otAmount)} + Government holiday ${money(due.holidayAmount)} (${due.holidayDays} day)</small></div>
        <div class="stats personal-stats">${topCards.map(([v,l])=>`<div class="stat"><b>${esc(String(v))}</b><span>${esc(l)}</span></div>`).join('')}</div>
        <div class="payroll-grid">
          <div><small>Monthly salary</small><b>${money(due.salary)}</b></div>
          <div><small>Food allowance received</small><b>${money(due.foodReceived)}</b></div>
          <div><small>Food expense</small><b>${money(due.foodExpense)}</b></div>
          <div><small>Estimated total income</small><b>${money(due.totalIncome)}</b></div>
          <div><small>Net after food expense</small><b>${money(due.net)}</b></div>
          <div><small>Running ${esc(ym)} OT (not yet payable)</small><b>${money(workMonthAmount.otAmount + workMonthAmount.holidayDays*HOLIDAY_RATE)}</b></div>
        </div>
      </div>
      <div class="card stack"><div class="toolbar"><h2 class="card-title">Salary-month income graph</h2><span class="spacer"></span><span class="muted">${esc(currentYear)}</span></div><div class="bars" id="incomeBars">${barHTML(salaryBars,'value',money)}</div><p class="muted small-note">Each month shows salary + OT from two months earlier + government holiday allowance + food allowance marked Paid. The current salary month is highlighted.</p></div>`;
  }
  function fmtOTText(mins) {
    const h=Math.floor(mins/60), m=mins%60;
    return h && m ? `${h} hrs ${m} mins` : h ? `${h} hrs` : m ? `${m} mins` : '0 hrs';
  }
  function formatOT(mins) { return fmtOTText(mins); }

  function renderPersonalCalendar() {
    const monthInput = $('calMonth');
    const grid = $('calendarGrid');
    if (!monthInput || !grid) return;
    monthInput.value = selectedCalendarMonth;
    const [year,month] = selectedCalendarMonth.split('-').map(Number);
    const first = new Date(year,month-1,1), count = new Date(year,month,0).getDate();
    const records = readReports().filter(r=>r.date.startsWith(selectedCalendarMonth));
    const recordMap = new Map(records.map(r=>[r.date,r]));
    const scheduled = finance.expectedWeekdays;
    const cells = [];
    days.forEach(d=>cells.push(`<div class="cal-weekday">${d}</div>`));
    for(let i=0;i<first.getDay();i++)cells.push('<div class="cal-cell cal-empty"></div>');
    let duty=0, leave=0, off=0, missing=0, scheduledCount=0;
    for(let d=1;d<=count;d++){
      const date=`${selectedCalendarMonth}-${String(d).padStart(2,'0')}`;
      const r=recordMap.get(date);
      const weekday=new Date(year,month-1,d).getDay();
      const expected=scheduled.includes(weekday);
      if(expected)scheduledCount++;
      let kind='blank', label='No report';
      if(r){
        kind=shiftKind(r).toLowerCase(); label=shiftKind(r);
        if(isDuty(r))duty++; else if(kind==='leave')leave++; else off++;
        if(reportIsHolidayDuty(r))label += ' + Gov duty';
      } else if(expected){kind='missing';label='Missing report';missing++;}
      cells.push(`<div class="cal-cell cal-${kind}" title="${date} — ${esc(label)}"><strong>${d}</strong><span>${esc(label)}</span>${r&&reportIsHolidayDuty(r)?'<i>৳900</i>':''}</div>`);
    }
    const attendance = scheduledCount ? Math.round(duty/scheduledCount*100) : null;
    const maxStreak = consecutiveDutyStreak(readReports());
    $('calendarSummary').innerHTML = [
      [duty,'Duty days'],[off,'Off / holiday'],[leave,'Leave days'],[missing,scheduled.length?'Missing reports':'No report records'],[attendance===null?'Set roster':attendance+'%','Attendance among scheduled days'],[maxStreak,'Current longest duty streak']
    ].map(([v,l])=>`<div class="stat"><b>${esc(String(v))}</b><span>${esc(l)}</span></div>`).join('');
    grid.innerHTML = cells.join('');
    const roster = $('expectedWeekdays');
    if(roster)roster.querySelectorAll('input[type=checkbox]').forEach(cb=>cb.checked=scheduled.includes(Number(cb.value)));
    const missingEl=$('missingDates');
    if(missingEl)missingEl.textContent=scheduled.length ? (missing ? `${missing} scheduled day(s) have no report: ${Array.from({length:count},(_,i)=>`${selectedCalendarMonth}-${String(i+1).padStart(2,'0')}`).filter(date=>!recordMap.has(date)&&scheduled.includes(new Date(date+'T12:00:00').getDay())).join(', ')}` : 'No missing reports in this month.') : 'Choose your expected duty weekdays to identify missing reports.';
  }
  function consecutiveDutyStreak(reports) {
    const dates = [...new Set(reports.filter(isDuty).map(r=>r.date))].sort();
    let best=0,current=0,last=null;
    dates.forEach(date=>{
      const t=new Date(date+'T12:00:00').getTime();
      if(last!==null && t-last===86400000)current++; else current=1;
      best=Math.max(best,current);last=t;
    });
    return best;
  }

  function renderProfiles() {
    const host=$('profileList');if(!host)return;
    const rows=liveProfiles().slice().sort((a,b)=>b.effectiveFrom.localeCompare(a.effectiveFrom));
    host.innerHTML=rows.length?rows.map(p=>`<div class="finance-row"><div><b>${esc(p.effectiveFrom)}</b><small>Salary ${money(p.monthlySalary)} · OT ${money(p.otRate)}/hour</small></div><button type="button" class="btn btn-ghost btn-sm btn-danger" data-finance-delete="profiles" data-id="${esc(p.id)}">Remove</button></div>`).join(''):'<p class="muted">No appraisal profile set yet. Until then OT uses ৳235/hour and Salary displays ৳0.</p>';
  }
  function renderCollection(hostId, collection, renderRow) {
    const host=$(hostId);if(!host)return;
    const rows=finance[collection].filter(x=>x&&!x.deleted).slice().sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')) || (b.updatedAt||0)-(a.updatedAt||0));
    host.innerHTML=rows.length?rows.map(renderRow).join(''):'<p class="muted">No entries yet.</p>';
  }
  function renderMoneyTables() {
    renderProfiles();
    renderCollection('allowanceList','foodAllowances',x=>`<div class="finance-row"><div><b>${esc(x.date)} · ${money(x.amount)}</b><small>${esc(x.location||'Location not set')} · ${esc(x.distanceKm||'—')} km · Ref: ${esc(x.referenceNo||'Not entered')} · ${esc(x.status||'pending')}</small><small>${esc(x.remarks||'')}</small></div><button class="btn btn-ghost btn-sm btn-danger" data-finance-delete="foodAllowances" data-id="${esc(x.id)}">Remove</button></div>`);
    renderCollection('expenseList','foodExpenses',x=>`<div class="finance-row"><div><b>${esc(x.date)} · ${money(x.amount)}</b><small>${esc(x.location||'')} · ${esc(x.details||'')}</small><small>${esc(x.remarks||'')}</small></div><button class="btn btn-ghost btn-sm btn-danger" data-finance-delete="foodExpenses" data-id="${esc(x.id)}">Remove</button></div>`);
    renderCollection('journeyList','journeys',x=>`<div class="finance-row"><div><b>${esc(x.date)} · ${esc(x.from||'?')} → ${esc(x.to||'?')}</b><small>${esc(x.client||'')} · ${esc(x.distanceKm||'—')} km · ${esc(x.purpose||'')}</small><small>${esc(x.transport||'')} ${esc(x.remarks||'')}</small></div><button class="btn btn-ghost btn-sm btn-danger" data-finance-delete="journeys" data-id="${esc(x.id)}">Remove</button></div>`);
    const status=$('financeSyncStatus'); if(status)status.textContent=activeUid?(financeRef?'Cloud sync enabled':'Cloud sync unavailable'):localOnlyReason;
  }
  function renderPersonalMoney() {
    const month=$('moneyMonth');if(month)month.value=selectedMoneyMonth;
    const summary=payoutForMonth(selectedMoneyMonth);
    const headline=$('moneyPayoutSummary');
    if(headline)headline.innerHTML=`<div class="payroll-hero"><span>${esc(selectedMoneyMonth)} Salary Month · OT work month ${esc(summary.workMonth)}</span><strong>${money(summary.totalIncome)}</strong><small>Salary ${money(summary.salary)} + Regular OT ${money(summary.otAmount)} + Holiday ${money(summary.holidayAmount)} + Food allowance received ${money(summary.foodReceived)}</small></div><div class="payroll-grid"><div><small>Payable OT</small><b>${money(summary.otAmount)}</b></div><div><small>Holiday allowance</small><b>${money(summary.holidayAmount)}</b></div><div><small>Food expense</small><b>${money(summary.foodExpense)}</b></div><div><small>Net after food expense</small><b>${money(summary.net)}</b></div></div>`;
    renderMoneyTables();
  }
  function renderAll() { renderPersonalDashboard(); renderPersonalCalendar(); renderPersonalMoney(); }

  function addItem(collection, item) {
    item.id=id(); item.updatedAt=Date.now(); item.deleted=false;
    return saveFinance(next=>{next[collection].push(item);});
  }
  function removeItem(collection, itemId) {
    return saveFinance(next=>{const item=next[collection].find(x=>x.id===itemId);if(item){item.deleted=true;item.updatedAt=Date.now();}});
  }

  function mergeArray(remote, local) {
    const map=new Map();
    [...(Array.isArray(remote)?remote:[]),...(Array.isArray(local)?local:[])].filter(Boolean).forEach(x=>{
      if(!x.id)return;
      const prev=map.get(String(x.id));
      if(!prev || (Number(x.updatedAt)||0)>=(Number(prev.updatedAt)||0))map.set(String(x.id),x);
    });
    return [...map.values()];
  }
  function mergeFinance(remote, local) {
    const a=normalizeFinance(remote),b=normalizeFinance(local);
    return {
      version:1,
      profiles:mergeArray(a.profiles,b.profiles),
      foodAllowances:mergeArray(a.foodAllowances,b.foodAllowances),
      foodExpenses:mergeArray(a.foodExpenses,b.foodExpenses),
      journeys:mergeArray(a.journeys,b.journeys),
      expectedWeekdays:(b.updatedAt||0)>=(a.updatedAt||0)?b.expectedWeekdays:a.expectedWeekdays,
      updatedAt:Math.max(a.updatedAt||0,b.updatedAt||0)
    };
  }
  function financeFingerprint(d) {
    const n=normalizeFinance(d);
    const sort=a=>a.slice().sort((x,y)=>String(x.id).localeCompare(String(y.id)));
    return JSON.stringify({...n,profiles:sort(n.profiles),foodAllowances:sort(n.foodAllowances),foodExpenses:sort(n.foodExpenses),journeys:sort(n.journeys)});
  }
  async function pushFinanceMerge() {
    if(!financeRef || !activeUid)return;
    const desired=finance;
    try {
      const result=await financeRef.transaction(current=>mergeFinance(current||blankData(),desired), undefined, false);
      if(result && result.committed) {
        finance=mergeFinance(result.snapshot.val(),finance);
        saveLocalFinance(finance);
        localOnlyReason='Finance records synced to your account.';
        renderMoneyTables();
      }
    } catch(err) {
      localOnlyReason='Local save is active; Firebase personalFinance permission/rules need to be enabled.';
      console.warn('Personal finance cloud sync failed:',err);
      const status=$('financeSyncStatus');if(status)status.textContent=localOnlyReason;
    }
  }
  function syncFinanceCloud() { if(financeRef)pushFinanceMerge(); }
  async function onAuthChanged(uid) {
    if(financeRef && financeListener)financeRef.off('value',financeListener);
    activeUid=uid||null; financeRef=null; financeListener=null;
    finance=loadLocalFinance();
    if(!uid){localOnlyReason='Sign in to enable finance cloud sync.';renderAll();return;}
    try {
      if(!window.firebase || !firebase.apps || !firebase.apps.length)throw new Error('Firebase is not initialized');
      financeRef=firebase.database().ref('personalFinance').child(uid);
      const transaction=await financeRef.transaction(current=>mergeFinance(current||blankData(),finance),undefined,false);
      if(transaction && transaction.committed) {
        const merged=mergeFinance(transaction.snapshot.val(),finance);
        finance=merged;
        if(!saveLocalFinance(finance))notice('Cloud finance records loaded, but this device could not update local storage. Export the data from a signed-in device.', 'error');
        else localOnlyReason='Finance records are synced to your account.';
      }
      financeListener=snap=>{
        const remote=normalizeFinance(snap.val());
        const merged=mergeFinance(remote,finance);
        if(financeFingerprint(merged)!==financeFingerprint(finance)){
          if(saveLocalFinance(merged)){finance=merged;renderAll();}
        }
        if(financeFingerprint(merged)!==financeFingerprint(remote))pushFinanceMerge();
      };
      financeRef.on('value',financeListener,err=>{
        localOnlyReason='Local save active; Firebase rules did not allow personal finance sync.';
        console.warn('Finance listener failed:',err);
        const status=$('financeSyncStatus');if(status)status.textContent=localOnlyReason;
      });
    } catch(err) {
      financeRef=null;
      localOnlyReason='Finance data is safely stored on this device; enable personalFinance Firebase rules for cloud sync.';
      console.warn('Could not start finance cloud sync:',err);
    }
    renderAll();
  }

  function onFormSubmit(e) {
    const form=e.target;
    if(!(form instanceof HTMLFormElement))return;
    e.preventDefault();
    const fd=new FormData(form), v=Object.fromEntries(fd.entries());
    const n=x=>Number(x)||0;
    if(form.id==='profileForm') {
      if(!v.effectiveFrom || n(v.otRate)<0 || n(v.salary)<0){notice('Enter a valid effective date, salary and OT rate.','warn');return;}
      if(addItem('profiles',{effectiveFrom:v.effectiveFrom,monthlySalary:n(v.salary),otRate:n(v.otRate)})){form.reset();$('profileDate').value=today();$('profileOtRate').value=String(n(v.otRate));notice('Appraisal salary and OT rate saved.','success');}
    } else if(form.id==='allowanceForm') {
      if(!v.date || n(v.amount)<=0){notice('Food allowance date and amount are required.','warn');return;}
      if(addItem('foodAllowances',{date:v.date,location:v.location||'',distanceKm:n(v.distanceKm),amount:n(v.amount),referenceNo:v.referenceNo||'',status:v.status||'pending',remarks:v.remarks||''})){form.reset();$('allowanceDate').value=today();notice('Food allowance entry saved.','success');}
    } else if(form.id==='expenseForm') {
      if(!v.date || n(v.amount)<=0){notice('Food expense date and amount are required.','warn');return;}
      if(addItem('foodExpenses',{date:v.date,amount:n(v.amount),location:v.location||'',details:v.details||'',remarks:v.remarks||''})){form.reset();$('expenseDate').value=today();notice('Food expense saved.','success');}
    } else if(form.id==='journeyForm') {
      if(!v.date || !v.from || !v.to){notice('Journey date, From and To are required.','warn');return;}
      if(addItem('journeys',{date:v.date,from:v.from,to:v.to,client:v.client||'',distanceKm:n(v.distanceKm),purpose:v.purpose||'',transport:v.transport||'',remarks:v.remarks||''})){form.reset();$('journeyDate').value=today();notice('Journey entry saved.','success');}
    }
  }

  function bindUI() {
    ['profileForm','allowanceForm','expenseForm','journeyForm'].forEach(id=>$(id)?.addEventListener('submit',onFormSubmit));
    $('calMonth')?.addEventListener('change',e=>{selectedCalendarMonth=e.target.value||monthNow();renderPersonalCalendar();});
    $('moneyMonth')?.addEventListener('change',e=>{selectedMoneyMonth=e.target.value||monthNow();renderPersonalMoney();});
    $('calPrev')?.addEventListener('click',()=>{selectedCalendarMonth=monthShift(selectedCalendarMonth,-1);renderPersonalCalendar();});
    $('calNext')?.addEventListener('click',()=>{selectedCalendarMonth=monthShift(selectedCalendarMonth,1);renderPersonalCalendar();});
    $('moneyPrev')?.addEventListener('click',()=>{selectedMoneyMonth=monthShift(selectedMoneyMonth,-1);renderPersonalMoney();});
    $('moneyNext')?.addEventListener('click',()=>{selectedMoneyMonth=monthShift(selectedMoneyMonth,1);renderPersonalMoney();});
    $('expectedWeekdays')?.addEventListener('change',()=>{
      const values=[...$('expectedWeekdays').querySelectorAll('input:checked')].map(x=>Number(x.value));
      saveFinance(next=>{next.expectedWeekdays=values;});
    });
    document.addEventListener('click',e=>{
      const b=e.target.closest('[data-finance-delete]');if(!b)return;
      const collection=b.dataset.financeDelete;
      if(!['profiles','foodAllowances','foodExpenses','journeys'].includes(collection))return;
      if(!confirm('Remove this entry? It will remain in backup history as a deleted record.'))return;
      removeItem(collection,b.dataset.id);
    });
    // Existing app notifies this module whenever the report array is reloaded or changed.
    window.addEventListener('activity-data-updated',renderPersonalDashboard);
    $('profileDate').value=today();
    $('allowanceDate').value=today();$('expenseDate').value=today();$('journeyDate').value=today();
  }

  window.addEventListener('activity-auth-changed',e=>onAuthChanged(e.detail?.uid||null));
  window.renderPersonalDashboard=renderPersonalDashboard;
  window.renderPersonalCalendar=renderPersonalCalendar;
  window.renderPersonalMoney=renderPersonalMoney;
  window.importPersonalFinanceBackup=payload=>{
    try {
      const incoming=normalizeFinance(payload);
      const merged=mergeFinance(finance,incoming);
      if(!saveLocalFinance(merged))return false;
      finance=merged;renderAll();syncFinanceCloud();return true;
    } catch(err) { console.error(err);return false; }
  };
  window.exportPersonalFinanceBackup=()=>JSON.parse(JSON.stringify(finance));
  window.PersonalFinanceCore={parseOT,monthShift,getProfileFromProfiles,getOTAmountForProfiles,buildPayoutSummary};
  document.addEventListener('DOMContentLoaded',()=>{
    bindUI();
    if(window.currentActivityUid)onAuthChanged(window.currentActivityUid);
    else renderAll();
  });
})();
