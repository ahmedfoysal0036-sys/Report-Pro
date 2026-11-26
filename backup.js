// Daily backup: reads /reports from Firebase Realtime Database and sends the
// app-compatible JSON file to Telegram. Never prints report data or secrets.
const admin = require('firebase-admin');

const DATABASE_URL = 'https://infinite-v1-default-rtdb.firebaseio.com';

function need(name) {
  const v = process.env[name];
  if (!v) { console.error('Missing secret: ' + name); process.exit(1); }
  return v;
}

async function main() {
  const token = need('TELEGRAM_BOT_TOKEN');
  const chatId = need('TELEGRAM_CHAT_ID');
  let sa;
  try { sa = JSON.parse(need('FIREBASE_SERVICE_ACCOUNT')); }
  catch (e) { console.error('FIREBASE_SERVICE_ACCOUNT is not valid JSON'); process.exit(1); }

  admin.initializeApp({ credential: admin.credential.cert(sa), databaseURL: DATABASE_URL });
  const snap = await admin.database().ref('reports').once('value');
  const reports = Object.values(snap.val() || {})
    .filter(Boolean)
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));

  const dates = reports.map(r => r.date).filter(Boolean);
  const dupDates = dates.length - new Set(dates).size;
  const bdDate = new Date(Date.now() + 6 * 3600 * 1000).toISOString().slice(0, 10);   // Bangladesh date

  const bundle = {
    backupType: 'activity-tracker-full-backup',   // same format as the app's "Backup to JSON"
    backupVersion: 2,
    createdAt: new Date().toISOString(),
    source: 'daily-bot',
    reports,
    personalFinance: null
  };
  const name = 'activity_backup_' + bdDate + '.json';

  const lines = [
    (reports.length ? '✅ Daily backup ' : '⚠️ EMPTY backup ') + bdDate,
    'Reports: ' + reports.length,
    dates.length ? 'Range: ' + dates[0] + ' → ' + dates[dates.length - 1] : 'No reports found, check the database!',
  ];
  if (dupDates) lines.push('Duplicate dates: ' + dupDates + ' (the app merges these automatically)');

  const form = new FormData();
  form.append('chat_id', chatId);
  form.append('caption', lines.join('\n'));
  form.append('document', new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' }), name);

  const res = await fetch('https://api.telegram.org/bot' + token + '/sendDocument', { method: 'POST', body: form });
  const out = await res.json().catch(() => ({}));
  if (!res.ok || !out.ok) {
    console.error('Telegram error: ' + (out.description || res.status));
    process.exit(1);
  }
  console.log('Backup sent: ' + reports.length + ' reports');
  process.exit(0);
}

main().catch(e => { console.error('Backup failed: ' + (e && e.message ? e.message : e)); process.exit(1); });
