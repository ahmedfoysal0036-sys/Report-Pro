const express = require('express');
const TelegramBotLib = require('node-telegram-bot-api');

// Express Server & Webhook Configuration for Render 24/7 Stability
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const TOKEN = process.env.TOKEN || '8684300697:AAFMHJpvfLdROY7b7Xk0TWaxtYT6QVx2FmU';
const FIREBASE_DB_URL = process.env.FIREBASE_DB_URL || 'https://infinite-v1-default-rtdb.firebaseio.com';
const RENDER_URL = process.env.RENDER_EXTERNAL_URL || 'https://report-pro-m2b2.onrender.com';

app.get('/', (req, res) => {
  res.send('🤖 Telegram Form-based AI Bot is Active and Running 24/7 via Webhook!');
});

const server = app.listen(PORT, () => {
  console.log(`🌐 HTTP server running on port ${PORT}`);
});

// TelegramBot Constructor Resolver
const TelegramBot = typeof TelegramBotLib === 'function' 
  ? TelegramBotLib 
  : (TelegramBotLib.default || TelegramBotLib.TelegramBot || Object.values(TelegramBotLib).find(v => typeof v === 'function'));

if (typeof TelegramBot !== 'function') {
  console.error("❌ Error: Could not resolve TelegramBot constructor.");
  process.exit(1);
}

// Initialize Bot without Polling (Using Webhook for 100% Stability & No 409 Conflicts)
const bot = new TelegramBot(TOKEN);

// Set Telegram Webhook
const webhookUrl = `${RENDER_URL.replace(/\/$/, '')}/bot${TOKEN}`;
bot.setWebHook(webhookUrl).then(() => {
  console.log(`🔗 Webhook successfully set to: ${webhookUrl}`);
}).catch(err => {
  console.error('❌ Failed to set webhook:', err.message);
});

// Express Endpoint to Receive Telegram Updates
app.post(`/bot${TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Cache processed message IDs & Active Chat Locks
const processedMsgIds = new Set();
const processingChats = new Set();

// Active user report & edit frames
const activeFrames = {};
const editFrames = {};

// Helper: Today date string (YYYY-MM-DD)
const todayStr = () => {
  const d = new Date();
  return new Date(d - d.getTimezoneOffset() * 60000).toISOString().split('T')[0];
};

// Helper: Normalize Time to 24-Hour "HH:mm" Format
function normalizeTime(timeInput) {
  if (!timeInput) return '09:00';
  let str = timeInput.trim().toUpperCase();
  
  const isPM = str.includes('PM');
  const isAM = str.includes('AM');
  str = str.replace(/(AM|PM)/g, '').trim();

  let [hours, minutes] = str.split(':').map(Number);
  if (isNaN(hours)) hours = 9;
  if (isNaN(minutes)) minutes = 0;

  if (isPM && hours < 12) hours += 12;
  if (isAM && hours === 12) hours = 0;

  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  return `${hh}:${mm}`;
}

// Helper: Overtime Calculation (9 Hours Basic Duty = 540 Mins)
function calculateOT(startTime, endTime) {
  if (!startTime || !endTime) return '0 hrs';
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  const startMins = sh * 60 + sm;
  let endMins = eh * 60 + em;
  if (endMins < startMins) endMins += 1440;
  const duration = endMins - startMins;
  const otMins = Math.max(0, duration - 540);
  
  const h = Math.floor(otMins / 60);
  const mm = otMins % 60;
  if (h && mm) return `${h} hrs ${mm} mins`;
  if (h) return `${h} hrs`;
  return `${mm} mins`;
}

// Firebase REST API Push/Update
async function saveToFirebase(reportData) {
  const id = reportData.id || (Date.now().toString() + Math.floor(100 + Math.random() * 900));
  reportData.id = id;
  reportData.updatedAt = Date.now();
  reportData.schemaVersion = 4;

  const url = `${FIREBASE_DB_URL.replace(/\/$/, '')}/reports/${id}.json`;
  try {
    const response = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reportData)
    });
    return response.ok ? reportData : null;
  } catch (err) {
    console.error('❌ Firebase Error:', err);
    return null;
  }
}

// Escape text for Telegram legacy Markdown (prevents "can't parse entities" errors)
const mdEsc = (v) => String(v === undefined || v === null || v === '' ? 'N/A' : v).replace(/([_*`\[])/g, '\\$1');

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

// Convert many date formats into "YYYY-MM-DD". Returns '' if not understood.
function toISODate(input) {
  if (input === undefined || input === null) return '';
  // Bangla digits -> English digits
  const s = String(input).trim().replace(/[০-৯]/g, d => '০১২৩৪৫৬৭৮৯'.indexOf(d));
  if (!s) return '';
  const pad = (n) => String(n).padStart(2, '0');
  let m;

  // 2026-10-24 | 2026/10/24 | 2026.10.24 (optionally followed by time)
  if ((m = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/))) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;

  // 24-10-2026 | 24/10/2026 | 24.10.2026  (assumed DD-MM-YYYY)
  if ((m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})/))) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;

  // 24 Oct 2026 | 24-Oct-2026
  if ((m = s.match(/^(\d{1,2})[\s-]+([A-Za-z]{3,})[\s,.-]+(\d{4})/))) {
    const mon = MONTHS[m[2].slice(0, 3).toLowerCase()];
    if (mon) return `${m[3]}-${pad(mon)}-${pad(m[1])}`;
  }

  // Oct 24, 2026
  if ((m = s.match(/^([A-Za-z]{3,})\s+(\d{1,2}),?\s+(\d{4})/))) {
    const mon = MONTHS[m[1].slice(0, 3).toLowerCase()];
    if (mon) return `${m[3]}-${pad(mon)}-${pad(m[2])}`;
  }
  return '';
}

// Fetch report by date from Firebase.
// Returns { match: {key, data} | null, dates: [recent stored dates], error: string | null }
async function findReportByDate(targetDate) {
  const url = `${FIREBASE_DB_URL.replace(/\/$/, '')}/reports.json`;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      console.error(`❌ Firebase read failed: HTTP ${response.status} ${body}`);
      return { match: null, dates: [], error: `Firebase theke data read kora jachchhe na (HTTP ${response.status}). Database rules check korun.` };
    }

    const data = await response.json();
    if (!data) return { match: null, dates: [], error: null };

    // Firebase can return an object OR an array
    const entries = Array.isArray(data)
      ? data.map((v, i) => [String(i), v])
      : Object.entries(data);

    const valid = entries.filter(([, r]) => r && typeof r === 'object' && r.date !== undefined && r.date !== null);

    const clean = String(targetDate).trim();
    const targetIso = toISODate(clean);

    // 1) exact string match, 2) match after normalizing date formats
    let matches = valid.filter(([, r]) => String(r.date).trim() === clean);
    if (matches.length === 0 && targetIso) {
      matches = valid.filter(([, r]) => toISODate(r.date) === targetIso);
    }

    const recentDates = valid.slice(-10).map(([, r]) => String(r.date).trim());
    console.log(`🔎 Edit search | input="${clean}" iso="${targetIso}" | total=${entries.length} valid=${valid.length} | recent dates:`, recentDates);

    if (matches.length === 0) return { match: null, dates: recentDates, error: null };

    // If multiple reports share the same date, take the most recently updated one
    matches.sort((a, b) => (b[1].updatedAt || 0) - (a[1].updatedAt || 0));
    const [key, report] = matches[0];
    return { match: { key, data: report }, dates: recentDates, error: null };
  } catch (err) {
    console.error('❌ Firebase Fetch Error:', err);
    return { match: null, dates: [], error: `Firebase connection error: ${err.message}` };
  }
}

// Telegram Message Listener with Chat-Level Concurrency Lock
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const msgId = msg.message_id;

  if (processedMsgIds.has(msgId)) return;
  processedMsgIds.add(msgId);
  if (processedMsgIds.size > 200) processedMsgIds.clear();

  if (processingChats.has(chatId)) return;
  processingChats.add(chatId);

  try {
    const text = (msg.text || '').trim();
    if (!text) return;

    const lowerText = text.toLowerCase();

    // 1. CANCEL / RESET COMMANDS
    if (lowerText === '/cancel' || lowerText === 'cancel') {
      delete activeFrames[chatId];
      delete editFrames[chatId];
      await bot.sendMessage(chatId, `❌ Current operation cancelled.`);
      return;
    }

    // 2. EDIT COMMAND INITIATION
    if (lowerText === '/edit' || lowerText === 'edit') {
      delete activeFrames[chatId]; // Clear regular frame if any
      editFrames[chatId] = { step: 'WAITING_FOR_EDIT_DATE', newRows: [] };
      await bot.sendMessage(chatId, `✏️ *EDIT REPORT MODE*\n\nJe tarikh er report edit korte chan, sei tarikh ti din (e.g., \`${todayStr()}\`):`, { parse_mode: 'Markdown' });
      return;
    }

    // 3. HANDLE ACTIVE EDIT FLOW
    if (editFrames[chatId]) {
      let editFrame = editFrames[chatId];

      if (editFrame.step === 'WAITING_FOR_EDIT_DATE') {
        const targetDate = text;
        await bot.sendMessage(chatId, `⏳ Searching report for date: ${targetDate} ...`);

        const { match, dates, error } = await findReportByDate(targetDate);

        if (error) {
          delete editFrames[chatId];
          await bot.sendMessage(chatId, `❌ ${error}`);
          return;
        }

        if (!match) {
          // Keep edit mode open so user can retry without typing /edit again
          const list = dates.length ? dates.map(d => `• ${d}`).join('\n') : '(Firebase e kono report nai)';
          await bot.sendMessage(chatId, `❌ "${targetDate}" tarikh er kono report pawa jayni.\n\nFirebase e ei date gulo ache:\n${list}\n\nUporer moto exact format e date din, ba /cancel likhun.`);
          return;
        }

        const found = match;
        const existingRows = Array.isArray(found.data.rows) ? found.data.rows : Object.values(found.data.rows || {});

        editFrame.step = 'READY_TO_MODIFY';
        editFrame.reportKey = found.key;
        editFrame.report = found.data;
        editFrame.newRows = []; // Fresh array for updated activities

        const summaryText = existingRows.map((r, i) => `*Activity ${i + 1}:*\nClient: ${mdEsc(r.c)}\nSite: ${mdEsc(r.s)}\nCategory: ${mdEsc(r.cat)}\nDetails: ${mdEsc(r.w)}`).join('\n\n');

        await bot.sendMessage(chatId, `✅ *Report Found!*\n\n📅 Date: ${mdEsc(found.data.date)}\n⏰ From: ${mdEsc(found.data.startTime)} | To: ${mdEsc(found.data.endTime)}\n\n--- *EXISTING ACTIVITIES* ---\n${summaryText || 'N/A'}\n\nNotun kore activities add ba change korte format fill-up kore pathan, ebong seshe *"commit"* likhun.`, { parse_mode: 'Markdown' });
        return;
      }

      if (editFrame.step === 'READY_TO_MODIFY') {
        if (lowerText.includes('client:') || lowerText.includes('site code:')) {
          const lines = text.split('\n');
          const getVal = (prefix) => {
            const line = lines.find(l => l.toLowerCase().startsWith(prefix.toLowerCase()));
            return line ? line.split(':').slice(1).join(':').trim() : '';
          };

          const rowObj = {
            c: getVal('Client'),
            s: getVal('Site code').toUpperCase(),
            cat: getVal('Category') || 'Implementation',
            w: getVal('Activity details'),
            ab: getVal('Assigned by') || 'MD Azmir Hossain',
            t: getVal('Team person') || 'N/A'
          };

          editFrame.newRows.push(rowObj);
          await bot.sendMessage(chatId, `✅ Modified Activity Added (${editFrame.newRows.length})\nAro add korte format din ba save korte **"commit"** likhun.`);
          return;
        }

        if (lowerText === 'commit' || lowerText === '/commit') {
          if (!editFrame.newRows || editFrame.newRows.length === 0) {
            await bot.sendMessage(chatId, `⚠️ Kono notun/modified activity add kora hoyni! Format fill-up kore pathan.`);
            return;
          }

          let reportToUpdate = editFrame.report;
          reportToUpdate.id = editFrame.reportKey;
          reportToUpdate.rows = editFrame.newRows;
          reportToUpdate.ot = calculateOT(reportToUpdate.startTime, reportToUpdate.endTime);

          await bot.sendMessage(chatId, `⏳ Updating report in Firebase...`);
          const saved = await saveToFirebase(reportToUpdate);

          if (saved) {
            delete editFrames[chatId];
            await bot.sendMessage(chatId, `✅ *REPORT SUCCESSFULLY COMMITTED & UPDATED!* 🚀\n\n📅 Date: ${reportToUpdate.date}\n⌛ Total OT: ${reportToUpdate.ot}`, { parse_mode: 'Markdown' });
          } else {
            await bot.sendMessage(chatId, `❌ Update failed! Please try again.`);
          }
          return;
        }
      }
      if (editFrame.step === 'READY_TO_MODIFY') {
        await bot.sendMessage(chatId, `💡 Format fill-up kore pathan (Client: / Site code: ...), save korte "commit" likhun, ba bondho korte /cancel likhun.`);
      }
      return; // Stop further processing if inside edit flow
    }

    // 4. START NEW REPORT COMMAND
    if (lowerText === '/start' || lowerText === 'start') {
      delete editFrames[chatId]; // Clear edit frame if any
      activeFrames[chatId] = {
        step: 'WAITING_FOR_DATE',
        date: todayStr(),
        startTime: '',
        endTime: '',
        rows: []
      };

      await bot.sendMessage(chatId, `📋 *NEW REPORT FRAME STARTED*\n\nDefault Date: ${todayStr()}\n\nReply with your report date (e.g., \`${todayStr()}\` or custom date like \`2026-10-23\`), or type \`today\` to use today:`, { parse_mode: 'Markdown' });
      return;
    }

    let frame = activeFrames[chatId];
    if (!frame) {
      await bot.sendMessage(chatId, `💡 Direct frame-wise report shuru korte *"start"* likhun ba edit korte *"edit"* likhun.`);
      return;
    }

    // 5. SET DATE (CUSTOM OR TODAY)
    if (frame.step === 'WAITING_FOR_DATE') {
      if (lowerText !== 'today' && text.length >= 8) {
        frame.date = text;
      } else {
        frame.date = todayStr();
      }
      frame.step = 'WAITING_FOR_START_TIME';

      await bot.sendMessage(chatId, `✅ *Date Set: ${frame.date}*\n\nPlease reply with your duty *Start Time* (e.g. 09:00):`, { parse_mode: 'Markdown' });
      return;
    }

    // 6. SET START TIME (FROM)
    if (frame.step === 'WAITING_FOR_START_TIME') {
      frame.startTime = normalizeTime(text);
      frame.step = 'READY_FOR_ACTIVITY';

      await bot.sendMessage(chatId, `✅ *Start Time Set: ${frame.startTime}*\n\nAro activity jog korte template puron kore pathan ba *"add"* command din.\n\n*Activity Format:*\nClient: \nSite code: \nCategory: \nActivity details: \nAssigned by: \nTeam person: `, { parse_mode: 'Markdown' });
      return;
    }

    // 7. ADD NEW ACTIVITY LOG FRAME
    if (lowerText === 'add') {
      await bot.sendMessage(chatId, `📌 *ADD ACTIVITY LOG*\n\nPura structure copy kore fill-up kore pathan:\n\nClient: \nSite code: \nCategory: \nActivity details: \nAssigned by: \nTeam person: `, { parse_mode: 'Markdown' });
      return;
    }

    // 8. PARSE FILLED ACTIVITY FORM
    if (lowerText.includes('client:') || lowerText.includes('site code:')) {
      const lines = text.split('\n');
      const getVal = (prefix) => {
        const line = lines.find(l => l.toLowerCase().startsWith(prefix.toLowerCase()));
        return line ? line.split(':').slice(1).join(':').trim() : '';
      };

      const rowObj = {
        c: getVal('Client'),
        s: getVal('Site code').toUpperCase(),
        cat: getVal('Category') || 'Implementation',
        w: getVal('Activity details'),
        ab: getVal('Assigned by') || 'MD Azmir Hossain',
        t: getVal('Team person') || 'N/A'
      };

      frame.rows.push(rowObj);

      await bot.sendMessage(chatId, `✅ *Activity ${frame.rows.length} Added!*\n\n🏢 Client: ${rowObj.c || 'N/A'}\n📍 Site Code: ${rowObj.s || 'N/A'}\n🏷 Category: ${rowObj.cat}\n📝 Details: ${rowObj.w}\n👤 Assigned By: ${rowObj.ab}\n👥 Team: ${rowObj.t}\n\nAro activity jog korte *"add"* likhun ba format fill-up korun.\nReport sesh korte *"end"* likhun.`, { parse_mode: 'Markdown' });
      return;
    }

    // 9. END COMMAND / COMPLETE REPORT
    if (lowerText === 'end' || lowerText === '/end') {
      if (frame.rows.length === 0) {
        await bot.sendMessage(chatId, `⚠️ Kono activity add kora hoy ni. Age structure fill-up korun ba *"add"* likhun.`);
        return;
      }

      frame.step = 'WAITING_FOR_END_TIME';
      await bot.sendMessage(chatId, `⏹ *FINISHING REPORT*\n\nPlease enter your duty *End Time / To* (e.g. 18:00 or 11:00):`, { parse_mode: 'Markdown' });
      return;
    }

    // 10. SET END TIME (TO) & SAVE TO FIREBASE
    if (frame.step === 'WAITING_FOR_END_TIME') {
      frame.endTime = normalizeTime(text);
      const totalOT = calculateOT(frame.startTime, frame.endTime);
      const mainAssigned = frame.rows[0]?.ab || 'MD Azmir Hossain';

      const finalReport = {
        id: Date.now().toString(),
        date: frame.date,
        startTime: frame.startTime,
        endTime: frame.endTime,
        ot: totalOT,
        hr: '0036',
        assigned: mainAssigned,
        name: 'S.M.Faisal Ahmed',
        desig: 'Sr Supervisor',
        shift: 'DAY',
        rows: frame.rows
      };

	  // If updating existing via normal flow or saving new
      await bot.sendMessage(chatId, `⏳ Syncing final report to Firebase...`);
      const saved = await saveToFirebase(finalReport);

      if (saved) {
        delete activeFrames[chatId];
        let summaryText = finalReport.rows.map((r, i) => `*Activity ${i+1}:*\nClient: ${r.c}\nSite: ${r.s}\nCategory: ${r.cat}\nDetails: ${r.w}`).join('\n\n');

        await bot.sendMessage(chatId, `✅ *REPORT SUCCESSFULLY SUBMITTED!*\n\n📅 *Date:* ${finalReport.date}\n⏰ *From:* ${finalReport.startTime}\n⏱ *To:* ${finalReport.endTime}\n⌛ *Total OT:* ${finalReport.ot}\n\n--- *SUMMARY* ---\n${summaryText}`, { parse_mode: 'Markdown' });
      } else {
        await bot.sendMessage(chatId, `❌ Firebase save failed! Check connection and try typing end time again.`);
      }
      return;
    }

  } catch (err) {
    console.error('❌ Bot Error:', err);
  } finally {
    processingChats.delete(chatId);
  }
});

// Graceful Shutdown for Render
process.on('SIGTERM', () => {
  console.log('👋 SIGTERM received, closing server...');
  server.close(() => process.exit(0));
});

console.log('🤖 Webhook-based Telegram Bot is running...');