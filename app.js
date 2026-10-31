(function(){
'use strict';

/* ---------- Config ---------- */
const DB_KEY='prof_stable_v30_ot_hm';
const DRAFT_KEY='activity_draft_v1';
const DEFAULTS={assigned:'Md Azmir Hossain',name:'S.M.Faisal Ahmed',hr:'0036',desig:'Sr Supervisor'};
const DUTY_MINUTES=540;
const MAX_ROWS=20;
const OFF_TYPES=['Off day','Goverment Holiday','Shifting','Sick Leave','Plan leave','Casual leave'];
const ASSIGN=["MD Azmir Hossain","Md Zahidur Rahman","Md Mahbub Hossain","Ashik Ahmed Pial","Md Mahatab Uddin","Kamruzzaman Biswas","DS Nipun"];
const TEAM=["MD Azmir Hossain","Md Zahidur Rahman","Md Mahbub Hossain","Ashik Ahmed Pial","Md Mahatab Uddin","DS Nipun","Kamruzzaman Biswas","Milon Chand","Mehedi Hasan Tuhin","Ranjit","Shihab","SM Sohel","Jaman","Nuruzzaman","Solaiman","Poran da","Alomgir","Alim","Khokon","Aziz","Mukter","Sumon STL","Selim STL","SA Team Member","Rejaul Karim","Street Fighers","Red Dragons","Night Riders","Raising Stars","Road Warriors","N/A"];
const CLIENTS=["Grameen Phone Limited","Robi Axiata Limited","Banglalink Digital","Teletalk Bangladesh","SCOMM","SCOMM POP","SCOMM CO-POP","Robi Dark Fiber","Banglalink Dark Fiber","Info Phase-2","Info Phase-3","STL","CCL"];
const CATEGORIES=["BL Dark Fiber","Client Connectivity","Capacity upgrade","Device Change","Device Power Up","Device Upgrade","DWDM Activity","IMP Excel input","Implementation","Info POP PM","Interfacing","Key Related Support","Link Upgrade","Link Visit","Link down","Meeting","NCR Activity","New POP Installation","New Site Onair","ODF Installation","PAT","PM","POP Activity","QA Issue","ROBI Dark Fiber","Roster Support","SFP Dismantle","Site Down","Site Visit","Site Dismantle","STL Support","Survey","Team Mobilizing","Trouble Shooting","Vertical Activity"];
const MONTHS=["January","February","March","April","May","June","July","August","September","October","November","December"];

/* ---------- Helpers ---------- */
const $=id=>document.getElementById(id);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const store={
  get(k){try{return localStorage.getItem(k)}catch(e){return null}},
  set(k,v){try{localStorage.setItem(k,v);return localStorage.getItem(k)===String(v)}catch(e){console.error('Local storage write failed:',e);return false}},
  del(k){try{localStorage.removeItem(k);return true}catch(e){console.error('Local storage delete failed:',e);return false}}
};
const parseJSON=(s,fb)=>{try{const v=JSON.parse(s);return v==null?fb:v}catch(e){return fb}};
const todayStr=()=>{const d=new Date();return new Date(d-d.getTimezoneOffset()*60000).toISOString().split('T')[0]};
const newId=()=>Date.now().toString()+Math.floor(100+Math.random()*900);
const byDate=(a,b)=>(a.date||'').localeCompare(b.date||'')||String(a.id).localeCompare(String(b.id));
const label=s=>s==='Goverment Holiday'?'Government holiday':s;
const isOffShift=s=>s!=='DAY'&&s!=='NIGHT'&&(OFF_TYPES.includes(s)||/leave|holiday|off/i.test(s||''));
function shiftKind(s){
  s=s||'DAY';
  if(s==='DAY')return 'day';if(s==='NIGHT')return 'night';
  if(/leave/i.test(s))return 'leave';
  if(isOffShift(s))return 'off';
  return 'day';
}
const rowFilled=r=>!!(r&&(r.c||r.s||r.cat||r.w||r.ab||r.t));

/* ---- OT formatting: always returns "X hrs Y mins" or sub-values, never raw minutes ---- */
function fmtOT(m){
  if(!m||m<=0)return '0 hrs';
  const h=Math.floor(m/60),mm=m%60;
  if(h&&mm)return `${h} hrs ${mm} mins`;
  if(h)return `${h} hrs`;
  return `${mm} mins`;
}
/* ---- Compact OT for chart labels: "11h 22m" (hours + real minutes, no decimals) ---- */
function fmtOTShort(m){
  m=Math.round(m||0);
  if(m<=0)return '';
  const h=Math.floor(m/60),mm=m%60;
  if(h&&mm)return `${h}h ${String(mm).padStart(2,'0')}m`;
  if(h)return `${h}h`;
  return `${mm}m`;
}
/* ---- OT color class based on hours ---- */
function otClass(mins){
  if(!mins||mins<=0)return 'ot-none';
  if(mins<120)return 'ot-low';   // < 2 hrs
  if(mins<300)return 'ot-mid';   // 2–5 hrs
  return 'ot-high';               // > 5 hrs
}
function parseOT(str){
  if(!str)return 0;let t=0;
  const h=String(str).match(/(\d+)\s*hrs?/i),m=String(str).match(/(\d+)\s*mins?/i);
  if(h)t+=parseInt(h[1],10)*60;if(m)t+=parseInt(m[1],10);
  return t;
}
function normalize(r){
  r=r||{};
  r.rows=Array.isArray(r.rows)?r.rows:(r.rows&&typeof r.rows==='object'?Object.values(r.rows):[]);
  r.shift=r.shift||'DAY';
  return r;
}

/* ---------- State ---------- */
let DB=parseJSON(store.get(DB_KEY),[]); if(!Array.isArray(DB))DB=[];
DB=DB.filter(Boolean).map(normalize).sort(byDate);
let dirty=false, tab='dashboard', undoBuf=null, draftTimer=null;
let currentUser=null, cloudStarted=false, firstCloudSnapshot=true, appInitialized=false;
const selected=new Set();
const PENDING_KEY='activity_tracker_pending_v1';
const persistLocal=()=>{const raw=JSON.stringify(DB);return store.set(DB_KEY,raw)&&store.get(DB_KEY)===raw};
const readPending=()=>parseJSON(store.get(PENDING_KEY),{});
const writePending=q=>store.set(PENDING_KEY,JSON.stringify(q));

/* ---------- Firebase ---------- */
const firebaseConfig={
  apiKey:'AIzaSyDX6cB4VW7xy33wvkYNOqntKNx76l3iJTg',
  authDomain:'infinite-v1.firebaseapp.com',
  databaseURL:'https://infinite-v1-default-rtdb.firebaseio.com',
  projectId:'infinite-v1',
  storageBucket:'infinite-v1.firebasestorage.app',
  messagingSenderId:'651727705210',
  appId:'1:651727705210:web:b5c15ca6642af300cb97c3'
};
const firebaseConfigReady=()=>!Object.values(firebaseConfig).some(v=>String(v).includes('REPLACE_WITH'));
let dbRef=null, auth=null, firebaseReady=false;
try{
  if(firebaseConfigReady()){
    firebase.initializeApp(firebaseConfig);
    auth=firebase.auth();
    dbRef=firebase.database().ref('reports');
    firebaseReady=true;
  }
}catch(e){console.warn('Firebase unavailable',e)}

function setSync(state){
  const p=$('syncPill');if(!p)return;
  p.className='pill '+state;
  p.textContent={online:'Synced',offline:'Offline',error:'Sync error',pending:'Sync pending'}[state]||'Connecting';
}
function timeout(ms,msg){return new Promise((_,rej)=>setTimeout(()=>rej(new Error(msg||'timeout')),ms))}
function cloneNormalized(r){return normalize(JSON.parse(JSON.stringify(r)))}
function rowsObject(rows){const o={};rows.forEach(r=>{if(r&&r.id)o[String(r.id)]=r});return o}
function mergeInitialRows(localRows,cloudRows){
  const map=new Map();
  [...(cloudRows||[]),...(localRows||[])].filter(Boolean).forEach(r=>{
    const c=cloneNormalized(r),id=String(c.id||'');if(!id)return;
    const old=map.get(id);
    if(!old||(Number(c.updatedAt)||0)>=(Number(old.updatedAt)||0))map.set(id,c);
  });
  return [...map.values()].sort(byDate);
}
async function flushPending(){
  if(!dbRef||!currentUser)return;
  const q=readPending();
  for(const id of Object.keys(q)){
    if(q[id]===null)await dbRef.child(id).remove();
    else await dbRef.child(id).set({...q[id],updatedAt:q[id].updatedAt||Date.now(),updatedBy:currentUser.uid,schemaVersion:2});
    delete q[id];writePending(q);
  }
}
function applyCloud(val){
  const cloudRows=val?Object.values(val).filter(Boolean).map(normalize):[];
  if(firstCloudSnapshot){
    firstCloudSnapshot=false;
    const localRows=parseJSON(store.get(DB_KEY),[]);
    if(!cloudRows.length&&localRows.length){
      const previous=DB;
      DB=localRows.filter(Boolean).map(normalize).sort(byDate);
      if(!persistLocal()){DB=previous;setSync('error');toast('Local report storage is full; previous data was preserved. Export a backup before retrying.','error');return;}
      // Cloud is empty, so add each local report without replacing the /reports root.
      dbRef.update(rowsObject(DB)).then(()=>setSync('online')).catch(e=>{console.warn(e);setSync('error')});
      refreshData();toast('Cloud was empty. Existing local reports are being uploaded safely.','warn');return;
    }
    const previous=DB;
    DB=mergeInitialRows(localRows,cloudRows);
    if(!persistLocal()){DB=previous;setSync('error');toast('Cloud data could not be saved locally. Existing local data was kept.','error');return}
    refreshData();
    const merged=rowsObject(DB);
    // Update only known report keys. Never replace the entire /reports branch:
    // another device may have added a record after this snapshot was read.
    if(JSON.stringify(merged)!==JSON.stringify(val||{}))dbRef.update(merged).then(()=>setSync('online')).catch(e=>{console.warn(e);setSync('error')});
    else setSync('online');
    return;
  }
  const pending=readPending();
  if(Object.keys(pending).length){
    const previous=DB;DB=mergeInitialRows(DB,cloudRows);
    if(!persistLocal()){DB=previous;setSync('error');toast('Could not store the cloud snapshot locally; existing data was kept.','error');return;}
    refreshData();setSync('pending');return;
  }
  const previous=DB;
  DB=cloudRows.sort(byDate);
  if(!persistLocal()){DB=previous;setSync('error');toast('Cloud update could not be stored on this device. Existing local data was kept.','error');return}
  refreshData();
}
function stopCloud(){
  if(dbRef)dbRef.off('value');
  try{firebase.database().ref('.info/connected').off('value')}catch(e){}
  cloudStarted=false;
}
function startCloud(){
  if(!dbRef||!currentUser){setSync('offline');return}
  if(cloudStarted)return;cloudStarted=true;firstCloudSnapshot=true;setSync('pending');
  dbRef.on('value',s=>applyCloud(s.val()),err=>{console.warn(err);setSync('error')});
  firebase.database().ref('.info/connected').on('value',async s=>{
    if(s.val())try{await flushPending();setSync('online')}catch(e){console.warn(e);setSync('error')}
    else {firstCloudSnapshot=true;setSync('offline')}
  });
}

/* ---------- UI helpers ---------- */
function toast(msg,type,action){
  const t=document.createElement('div');t.className='toast '+(type||'info');
  const s=document.createElement('span');s.textContent=msg;t.appendChild(s);
  if(action){const b=document.createElement('button');b.textContent=action.label;b.onclick=()=>{action.fn();t.remove()};t.appendChild(b)}
  $('toasts').appendChild(t);setTimeout(()=>t.remove(),action?7000:3500);
}
const showLoader=t=>{$('loaderText').textContent=t||'Working…';$('loader').hidden=false};
const hideLoader=()=>{$('loader').hidden=true};
function setDirty(v){dirty=v;$('dirtyChip').hidden=!v}
function confirmDiscard(){return !dirty||confirm('You have unsaved changes. Discard them?')}
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue=''}});

/* ---- Sticky header shadow on scroll ---- */
window.addEventListener('scroll',()=>{
  const tb=document.querySelector('.topbar');
  if(tb)tb.classList.toggle('scrolled',window.scrollY>8);
},{passive:true});

/* ---- Liquid button ripple ---- */
document.addEventListener('mousemove',e=>{
  const btn=e.target.closest('.btn');
  if(!btn)return;
  const r=btn.getBoundingClientRect();
  btn.style.setProperty('--rx',((e.clientX-r.left)/r.width*100)+'%');
  btn.style.setProperty('--ry',((e.clientY-r.top)/r.height*100)+'%');
});

/* ---- Tab switching with page transition ---- */
function showTab(t){
  tab=t;
  ['dashboard','report','history','analytics','calendar','money'].forEach(n=>{

    const el=$('view-'+n);if(!el)return;
    const active=n===t;
    el.hidden=!active;
    if(active){el.classList.remove('view-section');void el.offsetWidth;el.classList.add('view-section')}
  });
  // Desktop tabs
  document.querySelectorAll('.tabs button').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.tab===t)));
  // Mobile bottom nav
  document.querySelectorAll('.bnav-btn').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.tab===t)));
  if(t==='dashboard')initDashboardYears();
  if(t==='history')renderHistory();
  if(t==='analytics')initYears();
  if(t==='calendar'&&window.renderPersonalCalendar)window.renderPersonalCalendar();
  if(t==='money'&&window.renderPersonalMoney)window.renderPersonalMoney();
  window.scrollTo(0,0);
}
function applyTheme(t){
  document.documentElement.setAttribute('data-theme',t);
  $('themeBtn').textContent=t==='dark'?'☀':'☾';
}

/* ---------- Skeleton loaders ---------- */
function skeletonHistory(){
  return Array(4).fill(0).map(()=>`
    <div class="card" style="display:flex;gap:12px;align-items:center">
      <div class="skeleton" style="width:18px;height:18px;border-radius:4px;flex-shrink:0"></div>
      <div style="flex:1">
        <div class="skeleton skel-line w-60"></div>
        <div class="skeleton skel-line w-40" style="margin-bottom:0"></div>
      </div>
    </div>`).join('');
}

/* ---------- Report form ---------- */
const CAT_HTML='<option value="">Choose a category</option>'+CATEGORIES.map(c=>`<option>${esc(c)}</option>`).join('');

function addRow(v,focus){
  v=v||{};
  if(document.querySelectorAll('.entry').length>=MAX_ROWS){toast(`Maximum ${MAX_ROWS} activities per report`,'warn');return}
  const el=document.createElement('section');el.className='card entry';
  el.style.animation='pageIn .22s ease both';
  el.innerHTML=`
    <div class="entry-head"><span class="badge b-num">Activity</span>
      <button type="button" class="btn btn-ghost btn-sm" data-act="remove-row">Remove</button></div>
    <div class="grid g3">
      <div class="field"><label>Client</label><input class="client" list="dl-client" autocomplete="off"></div>
      <div class="field"><label>Site code</label><input class="site" list="dl-site" autocomplete="off"></div>
      <div class="field"><label>Category</label><select class="category">${CAT_HTML}</select></div>
    </div>
    <div class="field row-top"><label>Activity details</label><textarea class="work" rows="2" placeholder="What was done?"></textarea></div>
    <div class="grid g2 row-top">
      <div class="field"><label>Assigned by</label><input class="assignBy" list="dl-assign" autocomplete="off"></div>
      <div class="field"><label>Team / person</label><input class="team" list="dl-team" autocomplete="off"></div>
    </div>`;
  const q=s=>el.querySelector(s);
  if(v.cat&&!CATEGORIES.includes(v.cat)){const o=document.createElement('option');o.textContent=v.cat;q('.category').appendChild(o)}
  q('.client').value=v.c||'';q('.site').value=v.s||'';q('.category').value=v.cat||'';
  q('.work').value=v.w||'';q('.assignBy').value=v.ab||'';q('.team').value=v.t||'';
  $('entries').appendChild(el);
  renumber();
  if(focus)q('.client').focus();
}
function renumber(){
  document.querySelectorAll('.entry').forEach((el,i)=>{el.querySelector('.badge').textContent='Activity '+(i+1)});
}
function setRows(rows,min){
  $('entries').innerHTML='';
  let last=-1;(rows||[]).forEach((r,i)=>{if(rowFilled(r))last=i});
  const n=Math.max(min||3,last+1);
  for(let i=0;i<n;i++)addRow((rows||[])[i]);
}
function readRows(){
  return [...document.querySelectorAll('.entry')].map(el=>({
    c:el.querySelector('.client').value.trim(),
    s:el.querySelector('.site').value.trim(),
    cat:el.querySelector('.category').value,
    w:el.querySelector('.work').value.trim(),
    ab:el.querySelector('.assignBy').value.trim(),
    t:el.querySelector('.team').value.trim()
  }));
}

function syncShiftUI(){
  const off=$('shiftOff').checked;
  $('offType').hidden=!off;
  const holidayBox=$('governmentHolidayDuty');
  if(holidayBox){holidayBox.disabled=off;if(off)holidayBox.checked=false}
  $('startTime').disabled=off;$('endTime').disabled=off;
  if(off){$('startTime').value='00:00';$('endTime').value='00:00'}
  else if(!$('startTime').value||$('startTime').value==='00:00'){$('startTime').value='09:00';$('endTime').value='18:00'}
  calcOT();
}
function applyShift(shift){
  shift=shift||'DAY';
  const off=isOffShift(shift);
  $('shiftOff').checked=off;$('shiftNight').checked=shift==='NIGHT';$('shiftDay').checked=!off&&shift!=='NIGHT';
  if(off)$('offType').value=OFF_TYPES.includes(shift)?shift:'Off day';
  syncShiftUI();
}
function calcOT(){
  if($('shiftOff').checked){$('otHours').value='0 hrs';return}
  const s=$('startTime').value,e=$('endTime').value;
  if(!s||!e){$('otHours').value='0 hrs';return}
  const mins=v=>{const[h,m]=v.split(':').map(Number);return h*60+m};
  const start=mins(s);let end=mins(e);if(end<start)end+=1440;
  const duration=end-start;
  if(duration<=0||duration>1440){$('otHours').value='Check shift time';return}
  $('otHours').value=fmtOT(Math.max(0,duration-DUTY_MINUTES));
}

function getFormData(){
  const off=$('shiftOff').checked;
  let shift=$('shiftNight').checked?'NIGHT':'DAY';
  if(off)shift=$('offType').value;
  calcOT();
  return {
    id:$('editingId').value||newId(),
    date:$('reportDate').value,
    startTime:off?'0:00':$('startTime').value,
    endTime:off?'0:00':$('endTime').value,
    ot:off?'0 hrs':$('otHours').value,
    hr:$('hrId').value.trim(),
    assigned:$('assignedBy').value.trim(),
    name:$('userName').value.trim(),
    desig:$('userDesig').value.trim(),
    shift,rows:readRows(),
    governmentHolidayDuty:!off&&$('governmentHolidayDuty')?$('governmentHolidayDuty').checked:false,
    holidayAllowance:!off&&$('governmentHolidayDuty')&&$('governmentHolidayDuty').checked?900:0
  };
}
function resetFields(){
  $('editingId').value='';
  $('assignedBy').value=DEFAULTS.assigned;$('userName').value=DEFAULTS.name;
  $('hrId').value=DEFAULTS.hr;$('userDesig').value=DEFAULTS.desig;
  $('reportDate').value=todayStr();
  $('startTime').value='09:00';$('endTime').value='18:00';
  applyShift('DAY');
}
function loadForm(d,min){
  d=normalize(d);resetFields();
  $('editingId').value=d.id||'';
  $('reportDate').value=d.date||todayStr();
  if(d.assigned)$('assignedBy').value=d.assigned;
  if(d.name)$('userName').value=d.name;
  if(d.hr)$('hrId').value=d.hr;
  if(d.desig)$('userDesig').value=d.desig;
  applyShift(d.shift);
  if($('governmentHolidayDuty'))$('governmentHolidayDuty').checked=!$('shiftOff').checked&&!!(d.governmentHolidayDuty||d.holidayDuty);
  if(!$('shiftOff').checked){
    if(d.startTime)$('startTime').value=d.startTime;
    if(d.endTime)$('endTime').value=d.endTime;
    if(d.startTime&&d.endTime)calcOT();else if(d.ot)$('otHours').value=d.ot;
  }
  setRows(d.rows,min);setDirty(false);
}
function openRecord(r){loadForm(r);store.del(DRAFT_KEY);showTab('report')}
function newEntry(force){
  if(!force&&!confirmDiscard())return;
  store.del(DRAFT_KEY);resetFields();setRows([],5);setDirty(false);showTab('report');
}
function scheduleDraft(){
  clearTimeout(draftTimer);
  draftTimer=setTimeout(()=>{const d=getFormData();d._editing=$('editingId').value;store.set(DRAFT_KEY,JSON.stringify(d))},600);
}

/* ---------- Save / delete ---------- */
async function saveData(){
  const data=getFormData();
  if(!data.date){toast('Choose a report date first','warn');return}
  if($('otHours').value==='Check shift time'){toast('Please check the shift start/end time.','warn');return}
  const clash=DB.find(r=>r.date===data.date&&r.id!==data.id);
  if(clash){if(!confirm(`A report for ${data.date} already exists. Replace it?`))return;data.id=clash.id}
  data.updatedAt=Date.now();data.updatedBy=currentUser?currentUser.uid:'local';data.schemaVersion=2;
  showLoader('Saving…');
  data.governmentHolidayDuty=!!data.governmentHolidayDuty;
  data.holidayAllowance=data.governmentHolidayDuty?900:0;
  const before=DB.slice();
  const i=DB.findIndex(r=>r.id===data.id);
  if(i>=0)DB[i]=data;else DB.push(data);
  DB.sort(byDate);
  if(!persistLocal()){DB=before;hideLoader();toast('Could not save to device storage. Your previous report was kept; free storage or export a backup, then retry.','error');return}
  $('editingId').value=data.id;setDirty(false);store.del(DRAFT_KEY);
  const q=readPending();q[String(data.id)]=data;
  if(!writePending(q)){
    if(dbRef&&currentUser){
      try{await Promise.race([dbRef.child(String(data.id)).set(data),timeout(10000,'Cloud write timed out')]);setSync('online');toast('Report saved and synced directly; local queue storage was full.','success');}
      catch(e){setSync('pending');toast('Report is saved locally. Cloud sync is pending; free browser storage and reconnect before switching devices.','warn');}
    } else {setSync('offline');toast('Report saved locally. Cloud queue storage is full; free device storage and sync before switching devices.','warn');}
    hideLoader();refreshData();return;
  }
  if(!dbRef||!currentUser){hideLoader();setSync('offline');toast('Saved locally. Sign in to sync.','warn');return}
  try{await Promise.race([flushPending(),timeout(10000,'Cloud write timed out')]);toast('Report saved and synced','success')}
  catch(e){setSync('pending');toast('Saved on this device. Cloud sync pending.','warn')}
  refreshData();hideLoader();
}
function deleteRecords(ids){
  const recs=DB.filter(r=>ids.includes(r.id));if(!recs.length)return;
  const before=DB.slice();
  DB=DB.filter(r=>!ids.includes(r.id));
  if(!persistLocal()){DB=before;toast('Delete cancelled: device storage could not be updated.','error');return}
  ids.forEach(id=>selected.delete(id));
  if(ids.includes($('editingId').value))$('editingId').value='';
  const q=readPending();ids.forEach(id=>q[String(id)]=null);
  if(!writePending(q)){
    if(dbRef&&currentUser)ids.forEach(id=>dbRef.child(String(id)).remove().catch(e=>{console.warn(e);setSync('error')}));
    else toast('Deleted locally, but delete queue could not be saved. Sync before using another device.','warn');
  } else if(dbRef&&currentUser)flushPending().catch(e=>{console.warn(e);setSync('error')});
  undoBuf=recs;refreshData();
  toast(`${recs.length} report${recs.length>1?'s':''} deleted`,'info',{label:'Undo',fn:undoDelete});
}
function undoDelete(){
  if(!undoBuf)return;
  const before=DB.slice();
  undoBuf.forEach(r=>{if(!DB.some(x=>x.id===r.id))DB.push(r)});
  DB.sort(byDate);
  if(!persistLocal()){DB=before;toast('Undo could not be saved. The deleted state remains unchanged on this device.','error');return}
  const q=readPending();undoBuf.forEach(r=>q[String(r.id)]={...r,updatedAt:Date.now(),updatedBy:currentUser?currentUser.uid:'local',schemaVersion:2});
  if(!writePending(q)){if(dbRef&&currentUser)DB.forEach(r=>dbRef.child(String(r.id)).set(r).catch(e=>{console.warn(e);setSync('error')}));else toast('Restored locally, but cloud queue could not be saved. Sync before using another device.','warn');}
  else if(dbRef&&currentUser)flushPending().catch(e=>{console.warn(e);setSync('error')});
  undoBuf=null;refreshData();toast('Reports restored','success');
}

/* ---------- Navigation ---------- */
function navigate(dir){
  const date=$('reportDate').value,cur=$('editingId').value;
  const list=DB.filter(r=>r.id!==cur);
  const t=dir==='prev'?list.filter(r=>r.date<date).pop():list.find(r=>r.date>date);
  if(!t){toast(dir==='prev'?'No earlier report':'No later report','info');return}
  if(!confirmDiscard())return;openRecord(t);
}
function copyLast(){
  const date=$('reportDate').value,cur=$('editingId').value;
  const list=DB.filter(r=>r.id!==cur);
  const c=list.filter(r=>r.date<=date).pop()||list.pop();
  if(!c){toast('No earlier report to copy from','info');return}
  if(readRows().some(rowFilled)&&!confirm('Replace the activities in this form?'))return;
  setRows(c.rows,3);setDirty(true);scheduleDraft();
  toast(`Copied activities from ${c.date}`,'success');
}

/* ---------- History ---------- */
function filtered(){
  const q=$('hSearch').value.trim().toLowerCase(),sh=$('hShift').value,f=$('dateFrom').value,t=$('dateTo').value;
  return DB.filter(r=>{
    if(f&&r.date<f)return false;if(t&&r.date>t)return false;
    if(sh!=='all'&&shiftKind(r.shift)!==sh)return false;
    if(q){const hay=[r.date,r.shift,r.assigned,...(r.rows||[]).flatMap(x=>[x.c,x.s,x.cat,x.w,x.ab,x.t])].join(' ').toLowerCase();if(!hay.includes(q))return false}
    return true;
  }).sort((a,b)=>byDate(b,a));
}
function renderHistory(skeleton){
  const box=$('historyList');
  if(skeleton){box.innerHTML=skeletonHistory();return}
  const list=filtered(),f=$('dateFrom').value,t=$('dateTo').value;
  $('sCount').textContent=list.length;
  $('sOt').textContent=fmtOT(list.reduce((n,r)=>n+parseOT(r.ot),0));
  $('sRange').textContent=f&&t?`${f} to ${t}`:f?`From ${f}`:t?`Until ${t}`:'All dates';
  if(!list.length){
    box.innerHTML=`<div class="card empty">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
      <p>No reports match. Change the filters or save a report.</p></div>`;
    updateSelUI(list);return;
  }
  box.innerHTML=list.map(r=>{
    const sites=[...new Set((r.rows||[]).map(x=>x.s).filter(Boolean))];
    const n=(r.rows||[]).filter(rowFilled).length;
    const otMins=parseOT(r.ot);
    return `<div class="rec">
      <input type="checkbox" class="chk" data-id="${esc(r.id)}" aria-label="Select report ${esc(r.date)}" ${selected.has(r.id)?'checked':''}>
      <div class="rec-body" data-act="edit" data-id="${esc(r.id)}">
        <div class="rec-title">
          <span>${esc(r.date)}</span>
          <span class="badge b-${shiftKind(r.shift)}">${esc(label(r.shift))}</span>
          <span class="muted" style="font-weight:500">${esc(r.startTime||'--')} to ${esc(r.endTime||'--')}</span>
          <span class="${otClass(otMins)}" style="font-weight:700">OT ${esc(r.ot||'0 hrs')}</span>
        </div>
        <div class="rec-sub">${n} ${n===1?'activity':'activities'}${sites.length?' · '+esc(sites.slice(0,4).join(', ')):''} · SC head: ${esc(r.assigned)}</div>
      </div>
      <button class="btn btn-ghost btn-sm btn-danger" data-act="del" data-id="${esc(r.id)}">Delete</button>
    </div>`;
  }).join('');
  updateSelUI(list);
}
function updateSelUI(list){
  list=list||filtered();
  const valid=[...selected].filter(id=>DB.some(r=>r.id===id));
  valid.length===selected.size||(selected.clear(),valid.forEach(i=>selected.add(i)));
  const all=list.length>0&&list.every(r=>selected.has(r.id));
  $('selBtn').textContent=all?'Unselect all':'Select all';
  $('delSelBtn').disabled=selected.size===0;
  $('delSelBtn').textContent=selected.size?`Delete selected (${selected.size})`:'Delete selected';
}

/* ---------- Dashboard ---------- */
function initDashboardYears(){
  const years=new Set([String(new Date().getFullYear())]);
  DB.forEach(r=>{if(r.date)years.add(r.date.slice(0,4))});
  const list=[...years].sort().reverse(),select=$('dashYear'),old=select.value;
  select.innerHTML=list.map(y=>`<option value="${esc(y)}">${esc(y)}</option>`).join('');
  if(list.includes(old))select.value=old;
  renderDashboard();
}
function renderDashboard(){
  if(!$('dashboardStats'))return;
  const year=$('dashYear').value||String(new Date().getFullYear());
  const records=DB.filter(r=>r.date&&r.date.startsWith(year+'-'));
  const totalOT=records.reduce((n,r)=>n+parseOT(r.ot),0);
  const day=records.filter(r=>shiftKind(r.shift)==='day').length;
  const night=records.filter(r=>shiftKind(r.shift)==='night').length;
  const leave=records.filter(r=>shiftKind(r.shift)==='leave').length;
  const off=records.filter(r=>shiftKind(r.shift)==='off').length;
  const duty=day+night;
  const activities=records.reduce((n,r)=>n+(r.rows||[]).filter(rowFilled).length,0);
  const avgOT=duty?fmtOT(Math.round(totalOT/duty)):'0 hrs';
  const cards=[
    [records.length,'Total reports'],
    [duty,'Duty days'],
    [fmtOT(totalOT),'Total overtime'],
    [avgOT,'Avg OT / duty day'],
    [activities,'Activities recorded'],
    [`${day} / ${night}`,'Day / Night shifts'],
    [leave,'Leave days'],
    [off,'Off / holidays']
  ];
  $('dashboardStats').innerHTML=cards.map(([v,l])=>`<div class="stat"><b>${esc(String(v))}</b><span>${esc(l)}</span></div>`).join('');

  /* Dashboard bars */
  const monthly=MONTHS.map((name,i)=>{
    const prefix=`${year}-${String(i+1).padStart(2,'0')}`;
    const rows=records.filter(r=>r.date.startsWith(prefix));
    return{name,mins:rows.reduce((n,r)=>n+parseOT(r.ot),0)};
  });
  const max=Math.max(60,...monthly.map(m=>m.mins));
  const curMonth=String(new Date().getMonth()+1).padStart(2,'0');
  const curYear=String(new Date().getFullYear());
  $('dashboardBars').innerHTML=monthly.map((m,i)=>{
    const isCur=year===curYear&&String(i+1).padStart(2,'0')===curMonth;
    return `<div class="bar-col" title="${esc(m.name)}: ${esc(fmtOT(m.mins))}">
      <div class="bar-val">${fmtOTShort(m.mins)}</div>
      <div class="bar${isCur?' bar-current':''}" style="height:${Math.round(m.mins/max*170)}px"></div>
      <div class="bar-lbl">${esc(m.name.slice(0,3))}</div>
    </div>`;
  }).join('');

  /* Recent table */
  const recent=[...records].sort((a,b)=>byDate(b,a)).slice(0,10);
  $('dashboardRecent').innerHTML=recent.length
    ?recent.map(r=>`<tr>
        <td>${esc(r.date)}</td>
        <td><span class="badge b-${shiftKind(r.shift)}">${esc(label(r.shift||'DAY'))}</span></td>
        <td>${(r.rows||[]).filter(rowFilled).length}</td>
        <td class="${otClass(parseOT(r.ot))}" style="font-weight:700">${esc(r.ot||'0 hrs')}</td>
      </tr>`).join('')
    :'<tr><td colspan="4" style="text-align:center;color:var(--muted)">No reports found</td></tr>';
}

/* ---------- Analytics ---------- */
function initYears(){
  const ys=new Set([String(new Date().getFullYear())]);
  DB.forEach(r=>{if(r.date)ys.add(r.date.slice(0,4))});
  const years=[...ys].sort().reverse(),cur=$('yearSel').value;
  $('yearSel').innerHTML=years.map(y=>`<option>${y}</option>`).join('');
  if(years.includes(cur))$('yearSel').value=cur;
  renderAnalytics();
}
function renderAnalytics(){
  const y=$('yearSel').value||String(new Date().getFullYear());
  const data=MONTHS.map((name,i)=>{
    const p=`${y}-${String(i+1).padStart(2,'0')}`;
    const recs=DB.filter(r=>r.date&&r.date.startsWith(p));
    const o={name,day:0,night:0,leave:0,off:0,mins:0};
    recs.forEach(r=>{o.mins+=parseOT(r.ot);o[shiftKind(r.shift)]++});
    return o;
  });
  const tot=data.reduce((a,m)=>({mins:a.mins+m.mins,duty:a.duty+m.day+m.night,leave:a.leave+m.leave,off:a.off+m.off}),{mins:0,duty:0,leave:0,off:0});
  $('yearStats').innerHTML=[
    [fmtOT(tot.mins),'Total overtime'],
    [tot.duty,'Duty days'],
    [tot.leave,'Leave days'],
    [tot.off,'Off and holidays'],
    [tot.duty?fmtOT(Math.round(tot.mins/tot.duty)):'0 hrs','Average per duty day']
  ].map(([v,l])=>`<div class="stat"><b class="${typeof v==='string'&&v.includes('hrs')?otClass(parseOT(v)):''}">${esc(String(v))}</b><span>${l}</span></div>`).join('');

  const max=Math.max(...data.map(m=>m.mins),60);
  const curMonth=String(new Date().getMonth()+1).padStart(2,'0');
  const curYear=String(new Date().getFullYear());
  $('bars').innerHTML=data.map((m,i)=>{
    const isCur=y===curYear&&String(i+1).padStart(2,'0')===curMonth;
    return `<div class="bar-col" title="${m.name}: ${esc(fmtOT(m.mins))}">
      <div class="bar-val">${fmtOTShort(m.mins)}</div>
      <div class="bar${isCur?' bar-current':''}" style="height:${Math.round(m.mins/max*170)}px"></div>
      <div class="bar-lbl">${m.name.slice(0,3)}</div>
    </div>`;
  }).join('');

  $('monthRows').innerHTML=data.map(m=>`<tr>
    <td>${m.name}</td><td>${m.day}</td><td>${m.night}</td><td>${m.leave}</td><td>${m.off}</td>
    <td><b class="${otClass(m.mins)}">${esc(fmtOT(m.mins))}</b></td>
  </tr>`).join('');
}

function refreshData(){
  const sites=new Set();DB.forEach(r=>(r.rows||[]).forEach(x=>{if(x.s)sites.add(x.s)}));
  $('dl-site').innerHTML=[...sites].sort().map(s=>`<option value="${esc(s)}">`).join('');
  if(tab==='dashboard')renderDashboard();
  if(tab==='history')renderHistory();
  if(tab==='analytics')renderAnalytics();
  window.dispatchEvent(new CustomEvent('activity-data-updated'));
  if(window.renderPersonalDashboard)window.renderPersonalDashboard();
}

/* ---------- Report paper (print + PDF) ---------- */
function reportHTML(d){
  d=normalize(d);
  const rows=d.rows.filter(rowFilled);
  const body=(rows.length?rows:[{}]).map((r,i)=>`<tr><td>${rows.length?i+1:''}</td><td>${esc(r.c)}</td><td class="site">${esc(r.s)}</td><td>${esc(r.cat)}</td><td class="l">${esc(r.w)}</td><td>${esc(r.ab)}</td><td>${esc(r.t)}</td></tr>`).join('');
  return `<div class="rp">
    <h1>DHANMONDI SC</h1><div class="sub">Daily Activity Report</div>
    <div class="meta">
      <div>SC Head: ${esc(d.assigned)}<br>Name: ${esc(d.name||DEFAULTS.name)}<br>HR ID: ${esc(d.hr)}<br>Designation: ${esc(d.desig||DEFAULTS.desig)}</div>
      <div>Date: ${esc(d.date)}<br>From: ${esc(d.startTime)} To: ${esc(d.endTime)}<br>OT of the day: <span class="red">${esc(d.ot||'0 hrs')}</span><br>Shift: <span class="${isOffShift(d.shift)?'amber':''}">${esc(label(d.shift))}</span></div>
    </div>
    <table><thead><tr><th style="width:4%">SL</th><th style="width:12%">Client</th><th style="width:12%">Site code</th><th style="width:12%">Category</th><th style="width:34%">Activity details</th><th style="width:13%">Assigned by</th><th style="width:13%">Team / person</th></tr></thead><tbody>${body}</tbody></table>
    <div class="sign"><div>SUBMITTED BY</div><div>CHECKED BY</div><div>RECEIVED BY</div></div>
  </div>`;
}
function getTargets(){
  if(tab==='history'){
    const list=DB.filter(r=>selected.has(r.id)).sort(byDate);
    if(!list.length){toast('Select one or more reports in History first','warn');return null}
    return list;
  }
  const d=getFormData();
  if(!d.date){toast('Choose a report date first','warn');return null}
  return [d];
}
function printReports(){
  const list=getTargets();if(!list)return;
  $('printRoot').innerHTML=list.map(reportHTML).join('');
  setTimeout(()=>window.print(),300);
}
window.addEventListener('afterprint',()=>{$('printRoot').innerHTML=''});

async function exportPDF(){
  const list=getTargets();if(!list)return;
  if(!window.jspdf||!window.html2canvas){toast('PDF tools failed to load.','error');return}
  showLoader('Creating PDF…');
  const host=document.createElement('div');
  host.style.cssText='position:fixed;left:-10000px;top:0;background:#fff';
  document.body.appendChild(host);
  try{
    const pdf=new window.jspdf.jsPDF({orientation:'landscape',unit:'mm',format:'a4'});
    for(let i=0;i<list.length;i++){
      host.innerHTML=reportHTML(list[i]);
      const canvas=await html2canvas(host.firstElementChild,{scale:2,backgroundColor:'#ffffff'});
      let w=297,h=canvas.height*297/canvas.width;
      if(h>210){h=210;w=canvas.width*210/canvas.height}
      if(i>0)pdf.addPage();
      pdf.addImage(canvas.toDataURL('image/jpeg',0.95),'JPEG',(297-w)/2,0,w,h);
    }
    const a=list[0].date,b=list[list.length-1].date;
    pdf.save(list.length>1?`Activity_Report_${a}_to_${b}.pdf`:`Activity_Report_${a}.pdf`);
  }catch(e){toast('PDF failed: '+e.message,'error')}
  host.remove();hideLoader();
}

/* ---------- Excel / JSON ---------- */
const XL_HEAD=["SL","Date","Shift","In Time","Out Time","OT","Client","Site Code","Category","Activity Details","Assigned By","Team/Person","Name","HR ID","SC Head","Designation"];
function download(blob,name){
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;
  document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),2000);
}
function exportExcel(){
  const list=getTargets();if(!list)return;
  if(!window.XLSX){toast('Excel tools failed to load.','error');return}
  const out=[XL_HEAD];let sl=1;
  list.forEach(d=>{
    const rows=normalize(d).rows.filter(rowFilled);
    (rows.length?rows:[{}]).forEach(r=>{
      out.push([sl++,d.date,d.shift,d.startTime||'',d.endTime||'',d.ot||'',r.c||'',r.s||'',r.cat||'',r.w||'',r.ab||'',r.t||'',d.name||'',d.hr||'',d.assigned||'',d.desig||'']);
    });
  });
  const ws=XLSX.utils.aoa_to_sheet(out);
  ws['!cols']=[5,12,16,9,9,12,22,14,20,50,20,20,20,8,20,16].map(wch=>({wch}));
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Activity Report');
  XLSX.writeFile(wb,`Dhanmondi_SC_Report_${todayStr()}.xlsx`);
}
function exportJSON(){
  const financePayload=window.exportPersonalFinanceBackup?window.exportPersonalFinanceBackup():parseJSON(store.get('personal_finance_v1'),null);
  const bundle={backupType:'activity-tracker-full-backup',backupVersion:2,createdAt:new Date().toISOString(),reports:DB,personalFinance:financePayload};
  download(new Blob([JSON.stringify(bundle,null,2)],{type:'application/json'}),`activity_backup_${todayStr()}.json`);
  toast(`Backed up ${DB.length} reports${bundle.personalFinance?' plus personal finance records':''}`,'success');
}
function normDate(v){
  if(typeof v==='number')return new Date(Math.round((v-25569)*86400000)).toISOString().split('T')[0];
  const s=String(v||'').trim();
  return /^\d{4}-\d{2}-\d{2}/.test(s)?s.slice(0,10):'';
}
async function importRecords(list){
  const updates={};let n=0,seq=0;
  const before=DB.slice();
  list.forEach(raw=>{
    if(!raw||!raw.date)return;
    const r=normalize(JSON.parse(JSON.stringify(raw)));
    const ex=DB.find(x=>x.date===r.date);
    let id=ex?ex.id:(r.id?String(r.id):'');
    if(!id||DB.some(x=>x.id===id&&x.date!==r.date))id=Date.now().toString()+(1000+seq++);
    r.id=id;
    const i=DB.findIndex(x=>x.id===id);
    if(i>=0)DB[i]=r;else DB.push(r);
    updates[id]=r;n++;
  });
  DB.sort(byDate);
  if(!persistLocal()){DB=before;toast('Restore cancelled: could not write the restored reports to device storage. Existing data was retained.','error');return 0}
  refreshData();
  if(dbRef&&currentUser&&n){
    const q=readPending();Object.entries(updates).forEach(([id,r])=>q[id]=r);
    try{
      if(writePending(q))await Promise.race([flushPending(),timeout(15000)]);
      else await Promise.race([dbRef.update(updates),timeout(15000)]);
    }catch(e){toast('Reports restored locally; cloud sync is pending. Use Sync from cloud when online.','warn')}
  }
  return n;
}
function recordsFromSheet(rows){
  const H=(rows[0]||[]).map(h=>String(h||'').trim().toLowerCase());
  const col=(names,fb)=>{for(const n of names){const i=H.indexOf(n);if(i>=0)return i}return fb};
  const ix={date:col(['date'],1),shift:col(['shift'],2),inT:col(['in time'],3),outT:col(['out time'],4),ot:col(['ot'],5),c:col(['client'],6),s:col(['site code'],7),cat:col(['category'],8),w:col(['activity details'],9),ab:col(['assigned by'],10),t:col(['team/person','remarks'],11),name:col(['name'],-1),hr:col(['hr id'],-1),head:col(['sc head'],-1),desig:col(['designation'],-1)};
  const g=(row,i)=>i>=0&&row[i]!=null?String(row[i]).trim():'';
  const grouped={};
  for(let i=1;i<rows.length;i++){
    const row=rows[i];if(!row||!row.length)continue;
    const date=normDate(row[ix.date]);if(!date)continue;
    const d=grouped[date]||(grouped[date]={date,shift:g(row,ix.shift)||'DAY',startTime:g(row,ix.inT)||'09:00',endTime:g(row,ix.outT)||'18:00',ot:g(row,ix.ot)||'0 hrs',hr:g(row,ix.hr)||DEFAULTS.hr,assigned:g(row,ix.head)||DEFAULTS.assigned,name:g(row,ix.name)||DEFAULTS.name,desig:g(row,ix.desig)||DEFAULTS.desig,rows:[]});
    const r={c:g(row,ix.c),s:g(row,ix.s),cat:g(row,ix.cat),w:g(row,ix.w),ab:g(row,ix.ab),t:g(row,ix.t)};
    if(rowFilled(r))d.rows.push(r);
  }
  return Object.values(grouped);
}
function handleRestore(e){
  const file=e.target.files[0];e.target.value='';if(!file)return;
  showLoader('Restoring…');
  const reader=new FileReader();
  const isJson=/\.json$/i.test(file.name);
  reader.onload=async ev=>{
    try{
      let list;
      let financePayload=null;
      if(isJson){
        const parsed=parseJSON(ev.target.result,null);
        if(Array.isArray(parsed))list=parsed; // legacy report-only backups remain supported
        else if(parsed&&Array.isArray(parsed.reports)){list=parsed.reports;financePayload=parsed.personalFinance||null}
        else throw new Error('Invalid backup file');
      } else {const wb=XLSX.read(new Uint8Array(ev.target.result),{type:'array'});list=recordsFromSheet(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,raw:false}))}
      if(!list.length&&!financePayload)throw new Error('No reports or finance records found in this file');
      const n=list.length?await importRecords(list):0;
      if(financePayload&&window.importPersonalFinanceBackup){const financeOk=window.importPersonalFinanceBackup(financePayload);if(!financeOk)toast('Reports restored, but personal finance records could not be stored. Export current data and check device storage.','warn')}
      toast(`Restored ${n} report${n===1?'':'s'}${financePayload?' and personal finance records':''}`,'success');showTab(n?'history':'money');
    }catch(err){toast('Restore failed: '+err.message,'error')}
    hideLoader();
  };
  isJson?reader.readAsText(file):reader.readAsArrayBuffer(file);
}
async function syncNow(){
  if(!dbRef||!currentUser){toast('Sign in and configure Firebase to sync.','warn');return}
  showLoader('Syncing…');
  try{
    await flushPending();
    const snap=await Promise.race([dbRef.once('value'),timeout(10000,'Cloud request timed out')]);
    const cloud=snap.val()?Object.values(snap.val()).filter(Boolean).map(normalize):[];
    const local=parseJSON(store.get(DB_KEY),[]);
    if(!cloud.length&&local.length){
      const q=readPending();local.forEach(r=>q[String(r.id)]={...r,updatedAt:r.updatedAt||Date.now(),updatedBy:currentUser.uid,schemaVersion:2});
      if(writePending(q))await flushPending();else await dbRef.update(rowsObject(local));
    }
    else{
      const before=DB;
      DB=mergeInitialRows(local,cloud);
      if(!persistLocal()){DB=before;throw new Error('Local storage write failed; existing local reports retained')}
      await dbRef.update(rowsObject(DB));
    }
    refreshData();setSync('online');toast(`Sync complete: ${DB.length} reports`,'success');
  }catch(e){console.warn(e);setSync('error');toast('Sync failed. Local reports preserved.','warn')}
  hideLoader();
}

/* ---------- Events ---------- */
const actions={
  tab:b=>{if(b.dataset.tab!==tab)showTab(b.dataset.tab)},
  new:()=>newEntry(),save:saveData,'copy-last':copyLast,
  prev:()=>navigate('prev'),next:()=>navigate('next'),
  'add-row':()=>{addRow({},true);setDirty(true);scheduleDraft()},
  'remove-row':b=>{
    if(document.querySelectorAll('.entry').length<=1){toast('A report needs at least one activity box','info');return}
    b.closest('.entry').remove();renumber();setDirty(true);scheduleDraft();
  },
  edit:b=>{const r=DB.find(x=>x.id===b.dataset.id);if(r&&confirmDiscard())openRecord(r)},
  del:b=>{if(confirm('Delete this report?'))deleteRecords([b.dataset.id])},
  'del-selected':()=>{if(selected.size&&confirm(`Delete ${selected.size} selected report(s)?`))deleteRecords([...selected])},
  'select-all':()=>{const list=filtered(),all=list.every(r=>selected.has(r.id));list.forEach(r=>all?selected.delete(r.id):selected.add(r.id));renderHistory()},
  'reset-filters':()=>{['hSearch','dateFrom','dateTo'].forEach(i=>$(i).value='');$('hShift').value='all';renderHistory()},
  pdf:exportPDF,excel:exportExcel,print:printReports,
  'json-backup':exportJSON,restore:()=>$('restoreInput').click(),sync:syncNow,
  theme:()=>{const t=document.documentElement.getAttribute('data-theme')==='dark'?'light':'dark';applyTheme(t);store.set('theme',t)}
};
document.addEventListener('click',e=>{
  const b=e.target.closest('[data-act]');
  if(b&&actions[b.dataset.act]){if(e.target.closest('#menu'))$('menu').open=false;actions[b.dataset.act](b,e);return}
  if(!e.target.closest('#menu'))$('menu').open=false;
});
$('historyList').addEventListener('change',e=>{
  if(e.target.classList.contains('chk')){e.target.checked?selected.add(e.target.dataset.id):selected.delete(e.target.dataset.id);updateSelUI()}
});
['hSearch','hShift','dateFrom','dateTo'].forEach(id=>$(id).addEventListener('input',renderHistory));
$('yearSel').addEventListener('change',renderAnalytics);
$('dashYear').addEventListener('change',renderDashboard);
$('restoreInput').addEventListener('change',handleRestore);
$('gotoDate').addEventListener('change',e=>{
  const d=e.target.value;e.target.value='';if(!d)return;
  const r=DB.find(x=>x.date===d);
  if(!r){toast(`No report saved for ${d}`,'info');return}
  if(confirmDiscard())openRecord(r);
});
const form=$('reportForm');
['input','change'].forEach(ev=>form.addEventListener(ev,e=>{
  if(e.target.id==='startTime'||e.target.id==='endTime')calcOT();
  if(e.target.name==='shift')syncShiftUI();
  setDirty(true);scheduleDraft();
}));
form.addEventListener('focusout',e=>{if(e.target.classList.contains('site'))e.target.value=e.target.value.trim().toUpperCase()});
document.addEventListener('keydown',e=>{
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'&&tab==='report'){e.preventDefault();saveData()}
});

/* ---------- Init and authentication ---------- */
function init(){
  if(appInitialized){startCloud();return}
  appInitialized=true;
  applyTheme(store.get('theme')||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'));
  const opts=a=>a.map(x=>`<option value="${esc(x)}">`).join('');
  $('dl-client').innerHTML=opts(CLIENTS);$('dl-assign').innerHTML=opts(ASSIGN);$('dl-team').innerHTML=opts(TEAM);
  refreshData();showTab('dashboard');initDashboardYears();
  const draft=parseJSON(store.get(DRAFT_KEY),null);
  if(draft&&draft.date){draft.id=draft._editing||'';loadForm(draft);setDirty(true);toast('Restored your unsaved draft','info')}
  else newEntry(true);
  startCloud();
}
function showAuthError(message){$('authError').textContent=message||''}
function bootAuthenticatedUser(user){
  currentUser=user;
  window.currentActivityUid=user.uid;
  window.dispatchEvent(new CustomEvent('activity-auth-changed',{detail:{uid:user.uid}}));
  $('authGate').hidden=true;$('app').hidden=false;
  $('currentUser').textContent=user.email||user.uid;$('currentUser').title=user.email||user.uid;
  if(appInitialized)startCloud();else init();
}
function bootSignedOut(){stopCloud();window.currentActivityUid=null;window.dispatchEvent(new CustomEvent('activity-auth-changed',{detail:{uid:null}}));currentUser=null;$('app').hidden=true;$('authGate').hidden=false;setSync('offline')}
$('loginForm').addEventListener('submit',async e=>{
  e.preventDefault();showAuthError('');
  if(!firebaseReady||!auth){showAuthError('Setup required: configure Firebase and enable Email/Password sign-in.');return}
  $('loginBtn').disabled=true;$('loginBtn').textContent='Signing in…';
  try{await auth.signInWithEmailAndPassword($('loginEmail').value.trim(),$('loginPassword').value)}
  catch(err){showAuthError(err.code==='auth/invalid-credential'||err.code==='auth/wrong-password'?'Email or password is incorrect.':err.message)}
  finally{$('loginBtn').disabled=false;$('loginBtn').textContent='Sign in'}
});
$('resetPasswordBtn').addEventListener('click',async()=>{
  showAuthError('');if(!firebaseReady||!auth){showAuthError('Configure Firebase first.');return}
  const email=$('loginEmail').value.trim();if(!email){showAuthError('Enter your work email first.');return}
  try{await auth.sendPasswordResetEmail(email);showAuthError('Password reset email sent if the account exists.')}catch(err){showAuthError(err.message)}
});
$('signOutBtn').addEventListener('click',async()=>{if(dirty&&!confirmDiscard())return;try{await auth.signOut()}catch(err){toast('Could not sign out: '+err.message,'error')}});
if(firebaseReady&&auth)auth.onAuthStateChanged(user=>{if(user)bootAuthenticatedUser(user);else bootSignedOut()});
else{bootSignedOut();showAuthError('Setup required: configure Firebase and enable Email/Password sign-in in Firebase Console.')}
})();