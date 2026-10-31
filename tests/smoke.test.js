'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');

// Exercise the exact pure calculation helpers in personal.js without needing Firebase or a browser.
const windowStub = { addEventListener() {} };
const documentStub = { addEventListener() {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'personal.js'), 'utf8'), {
  window: windowStub, document: documentStub, console, Date, Math, JSON, Map, Set,
  Intl, Number, String, Array, Object, Promise, FormData: function FormData() {}
});
const core = windowStub.PersonalFinanceCore;
assert.ok(core, 'finance calculation helpers exported');
assert.equal(core.parseOT('1 hrs 30 mins'), 90);
assert.equal(core.monthShift('2026-10', -2), '2026-08');
assert.equal(core.monthShift('2027-01', -2), '2026-11');

const profiles = [
  {id:'legacy', effectiveFrom:'2000-01-01', monthlySalary:0, otRate:235, updatedAt:1},
  {id:'appraisal', effectiveFrom:'2026-10-01', monthlySalary:30000, otRate:260, updatedAt:2}
];
assert.equal(core.getProfileFromProfiles(profiles, '2026-08-12').otRate, 235);
assert.equal(core.getProfileFromProfiles(profiles, '2026-10-12').otRate, 260);
assert.equal(core.getOTAmountForProfiles({date:'2026-08-20', ot:'3 hrs 30 mins'}, profiles), 822.5);

const reports = [
  {id:'aug-duty', date:'2026-08-12', ot:'1 hrs', shift:'DAY', governmentHolidayDuty:true},
  // A government-holiday off-day is not itself proof of performed duty.
  {id:'aug-off', date:'2026-08-13', ot:'0 hrs', shift:'Goverment Holiday', governmentHolidayDuty:true},
  {id:'oct-duty', date:'2026-10-12', ot:'2 hrs', shift:'NIGHT'}
];
const finance = {
  profiles,
  foodAllowances:[
    {id:'paid', date:'2026-10-15', amount:1500, status:'paid'},
    {id:'pending', date:'2026-10-16', amount:800, status:'pending'}
  ],
  foodExpenses:[{id:'expense', date:'2026-10-16', amount:500}],
  journeys:[], expectedWeekdays:[]
};
const payout = core.buildPayoutSummary(reports, finance, '2026-10');
assert.equal(payout.workMonth, '2026-08');
assert.equal(payout.otMinutes, 60);
assert.equal(payout.otAmount, 235);
assert.equal(payout.holidayDays, 1);
assert.equal(payout.holidayAmount, 900);
assert.equal(payout.salary, 30000);
assert.equal(payout.foodReceived, 1500);
assert.equal(payout.foodExpense, 500);
assert.equal(payout.totalIncome, 32635);
assert.equal(payout.net, 32135);

// Exercise the exact time helpers embedded in bot.js.
const botSource = fs.readFileSync(path.join(root, 'bot.js'), 'utf8');
const botStart = botSource.indexOf('function normalizeTime(');
const botEnd = botSource.indexOf('// Firebase save (Admin SDK)', botStart);
assert.ok(botStart >= 0 && botEnd > botStart, 'bot time helper block found');
const botHelpers = new Function(`${botSource.slice(botStart, botEnd)}; return {normalizeTime, calculateOT};`)();
assert.equal(botHelpers.normalizeTime('9:30 PM'), '21:30');
assert.equal(botHelpers.normalizeTime('12 AM'), '00:00');
assert.equal(botHelpers.normalizeTime('18'), '18:00');
assert.equal(botHelpers.normalizeTime('25:00'), '');
assert.equal(botHelpers.normalizeTime('09:75'), '');
assert.equal(botHelpers.calculateOT('09:00', '18:00'), '0 hrs');
assert.equal(botHelpers.calculateOT('09:00', '19:00'), '1 hrs');
assert.equal(botHelpers.calculateOT('09:00', '19:30'), '1 hrs 30 mins');
assert.equal(botHelpers.calculateOT('21:00', '08:00'), '2 hrs');
assert.equal(botHelpers.calculateOT('09:00', '09:00'), 'Check shift time');

// Check that the report merge helper preserves non-conflicting IDs and chooses the newer copy.
const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const mergeStart = appSource.indexOf('function mergeInitialRows(');
const mergeEnd = appSource.indexOf('async function flushPending()', mergeStart);
assert.ok(mergeStart >= 0 && mergeEnd > mergeStart, 'report merge helper found');
const mergeContext = {
  Map,
  normalize(r) { const c={...r}; c.rows=Array.isArray(c.rows)?c.rows:[]; c.shift=c.shift||'DAY'; return c; },
  cloneNormalized(r) { const c=JSON.parse(JSON.stringify(r)); c.rows=Array.isArray(c.rows)?c.rows:[]; c.shift=c.shift||'DAY'; return c; },
  byDate(a,b) { return (a.date||'').localeCompare(b.date||'') || String(a.id).localeCompare(String(b.id)); }
};
vm.createContext(mergeContext);
vm.runInContext(`${appSource.slice(mergeStart, mergeEnd)}; this.mergeInitialRows = mergeInitialRows;`, mergeContext);
const merged = mergeContext.mergeInitialRows(
  [{id:'one',date:'2026-08-01',updatedAt:200,rows:[{c:'local'}]},{id:'two',date:'2026-08-02',updatedAt:10,rows:[]}],
  [{id:'one',date:'2026-08-01',updatedAt:100,rows:[{c:'old cloud'}]},{id:'three',date:'2026-08-03',updatedAt:50,rows:[]}]
);
assert.equal(JSON.stringify(merged.map(r=>r.id).sort()), JSON.stringify(['one','three','two']));
assert.equal(merged.find(r=>r.id==='one').rows[0].c, 'local');

// Data safety invariants: keep the existing local keys and avoid replacing the reports root.
assert.match(appSource, /const DB_KEY='prof_stable_v30_ot_hm'/);
assert.match(appSource, /const PENDING_KEY='activity_tracker_pending_v1'/);
assert.doesNotMatch(appSource, /dbRef\.set\(/);

console.log('All smoke tests passed (27 assertions).');
