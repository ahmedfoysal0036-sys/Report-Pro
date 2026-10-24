const express = require('express');
const TelegramBotLib = require('node-telegram-bot-api');

// Express Keep-Alive Server (For Render 24/7 Deployment)
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('🤖 Telegram Form-based AI Bot is Active and Running 24/7!');
});

app.listen(PORT, () => {
  console.log(`🌐 Keep-alive HTTP server running on port ${PORT}`);
});

// Self-Ping Mechanism to prevent Render Sleep Mode
const RENDER_URL = process.env.RENDER_EXTERNAL_URL;
if (RENDER_URL) {
  setInterval(async () => {
    try {
      await fetch(RENDER_URL);
      console.log('⏰ Self-ping successful! Keeping bot alive.');
    } catch (err) {
      console.error('❌ Self-ping error:', err.message);
    }
  }, 10 * 60 * 1000); // Ping every 10 minutes
}

// TelegramBot Constructor Resolver
const TelegramBot = typeof TelegramBotLib === 'function' 
  ? TelegramBotLib 
  : (TelegramBotLib.default || TelegramBotLib.TelegramBot || Object.values(TelegramBotLib).find(v => typeof v === 'function'));

if (typeof TelegramBot !== 'function') {
  console.error("❌ Error: Could not resolve TelegramBot constructor.");
  process.exit(1);
}

// Bot Credentials & Firebase Configuration
const TOKEN = '8684300697:AAFMHJpvfLdROY7b7Xk0TWaxtYT6QVx2FmU';
const FIREBASE_DB_URL = 'https://infinite-v1-default-rtdb.firebaseio.com';
const bot = new TelegramBot(TOKEN, { polling: true });

// Active user report frames
const activeFrames = {};

// Helper: Today date string (YYYY-MM-DD)
const todayStr = () => {
  const d = new Date();
  return new Date(d - d.getTimezoneOffset() * 60000).toISOString().split('T')[0];
};

// Helper: Normalize Time to 24-Hour "HH:mm" Format for Web App Compatibility
function normalizeTime(timeInput) {
  if (!timeInput) return '09:00';
  let str = timeInput.trim().toUpperCase();
  
  // Check for AM/PM
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

// Firebase REST API Push
async function saveToFirebase(reportData) {
  const id = reportData.id || (Date.now().toString() + Math.floor(100 + Math.random() * 900));
  reportData.id = id;
  reportData.updatedAt = Date.now();
  reportData.schemaVersion = 2;

  const url = `${FIREBASE_DB_URL}/reports/${id}.json`;
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

// Telegram Message Listener
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = (msg.text || '').trim();
  if (!text) return;

  const lowerText = text.toLowerCase();

  // 1. START COMMAND
  if (lowerText === '/start' || lowerText === 'start') {
    activeFrames[chatId] = {
      step: 'WAITING_FOR_START_TIME',
      date: todayStr(),
      startTime: '',
      endTime: '',
      rows: []
    };

    bot.sendMessage(chatId, `📋 *NEW REPORT FRAME STARTED*

Date: ${todayStr()}
From: [Enter Start Time, e.g. 09:00]

Please reply with your duty *Start Time* (e.g. 09:00):`);
    return;
  }

  let frame = activeFrames[chatId];
  if (!frame) {
    bot.sendMessage(chatId, `💡 Direct frame-wise report shuru korte *"start"* likhun.`);
    return;
  }

  // 2. SET START TIME (FROM)
  if (frame.step === 'WAITING_FOR_START_TIME') {
    frame.startTime = normalizeTime(text);
    frame.step = 'READY_FOR_ACTIVITY';

    bot.sendMessage(chatId, `✅ *Start Time Set: ${frame.startTime}*

Aro activity jog korte template puron kore pathan ba *"add"* command din.

*Activity Format:*
Client: 
Site code: 
Category: 
Activity details: 
Assigned by: 
Team person: `);
    return;
  }

  // 3. ADD NEW ACTIVITY LOG FRAME
  if (lowerText === 'add') {
    bot.sendMessage(chatId, `📌 *ADD ACTIVITY LOG*

Pura structure copy kore fill-up kore pathan:

Client: 
Site code: 
Category: 
Activity details: 
Assigned by: 
Team person: `);
    return;
  }

  // 4. PARSE FILLED ACTIVITY FORM
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

    bot.sendMessage(chatId, `✅ *Activity ${frame.rows.length} Added!*

🏢 Client: ${rowObj.c || 'N/A'}
📍 Site Code: ${rowObj.s || 'N/A'}
🏷 Category: ${rowObj.cat}
📝 Details: ${rowObj.w}
👤 Assigned By: ${rowObj.ab}
👥 Team: ${rowObj.t}

Aro activity jog korte *"add"* likhun ba format fill-up korun.
Report sesh korte *"end"* likhun.`);
    return;
  }

  // 5. END COMMAND / COMPLETE REPORT
  if (lowerText === 'end' || lowerText === '/end') {
    if (frame.rows.length === 0) {
      bot.sendMessage(chatId, `⚠️ Kono activity add kora hoy ni. Age structure fill-up korun ba *"add"* likhun.`);
      return;
    }

    frame.step = 'WAITING_FOR_END_TIME';
    bot.sendMessage(chatId, `⏹ *FINISHING REPORT*

Please enter your duty *End Time / To* (e.g. 18:00 or 11:00):`);
    return;
  }

  // 6. SET END TIME (TO) & SAVE TO FIREBASE
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

    bot.sendMessage(chatId, `⏳ Syncing final report to Firebase...`);
    const saved = await saveToFirebase(finalReport);

    if (saved) {
      delete activeFrames[chatId];
      let summaryText = finalReport.rows.map((r, i) => `*Activity ${i+1}:*\nClient: ${r.c}\nSite: ${r.s}\nCategory: ${r.cat}\nDetails: ${r.w}`).join('\n\n');

      bot.sendMessage(chatId, `✅ *REPORT SUCCESSFULLY SUBMITTED!*

📅 *Date:* ${finalReport.date}
⏰ *From:* ${finalReport.startTime}
⏱ *To:* ${finalReport.endTime}
⌛ *Total OT:* ${finalReport.ot}

--- *SUMMARY* ---
${summaryText}`);
    } else {
      bot.sendMessage(chatId, `❌ Firebase save failed! Check connection and try typing end time again.`);
    }
    return;
  }
});

console.log('🤖 Dynamic Form-based Telegram Bot is running...');