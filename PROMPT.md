# Activity Tracker – Dhanmondi SC: Full Build Prompt

Build a mobile-first, installable-feeling web app called "Activity Tracker – Dhanmondi SC": a daily work-report and overtime (OT) tracker for a telecom field-operations supervisor, plus a companion Telegram bot that writes reports into the same database.

## 1. Tech stack and constraints
- Frontend: plain HTML + CSS + vanilla JavaScript only. No framework, no build step. Three files: index.html, style.css, app.js (app.js wrapped in one IIFE with 'use strict').
- Libraries via CDN `<script>` tags: html2canvas 1.4.1, jsPDF 2.5.1 (UMD), SheetJS xlsx 0.18.5, Firebase 9.23 compat (app, auth, database). Font: Inter (Google Fonts).
- Hosting: Firebase Hosting. Database: Firebase Realtime Database, path `/reports/{id}`. Auth: Firebase Authentication, email + password only, NO public sign-up (admin creates accounts in the console).
- Bot: Node.js + Express + node-telegram-bot-api (legacy 0.x API: `bot.sendMessage(chatId, text, opts)`, `bot.processUpdate`), deployed on Render using a webhook (not polling), with a keep-alive self-ping every 13 minutes and graceful SIGTERM shutdown. Do NOT upgrade to node-telegram-bot-api 2.x (different API); optionally replace the library with direct `fetch` calls to the Telegram Bot API.
- The bot talks to Firebase with the **Firebase Admin SDK** (`firebase-admin/app` + `firebase-admin/database`, modular imports; the namespaced `admin.credential.cert` style no longer works in v14), authenticated with a service account from the `FIREBASE_SERVICE_ACCOUNT` env var (raw JSON or base64 JSON). Admin SDK bypasses database rules.
- All secrets must come from environment variables and never be hardcoded: `TOKEN` (Telegram bot token, no default value; exit if missing), `FIREBASE_SERVICE_ACCOUNT`, optionally `FIREBASE_DB_URL`, `RENDER_EXTERNAL_URL`.
- Never log secrets. The webhook URL contains the bot token, so log only "Webhook successfully set".

## 2. Data model
One record per report/day:

```json
{
  "id": "", "date": "YYYY-MM-DD", "startTime": "HH:MM", "endTime": "HH:MM",
  "ot": "2 hrs 30 mins", "hr": "", "assigned": "", "name": "", "desig": "",
  "shift": "DAY",
  "rows": [ { "c": "client", "s": "site code", "cat": "category", "w": "activity details", "ab": "assigned by", "t": "team/person" } ],
  "updatedAt": 0, "updatedBy": "", "schemaVersion": 2
}
```

- shift values: "DAY", "NIGHT", or an off type: "Off day", "Goverment Holiday" (keep this spelling, display as "Government holiday"), "Shifting", "Sick Leave", "Plan leave", "Casual leave".
- shiftKind(): DAY -> day, NIGHT -> night, anything matching /leave/i -> leave, other off types -> off.
- Max 20 activity rows per report. Firebase may return rows as an object, so normalize() must convert rows to an array.
- OT is stored as text and parsed back with parseOT(): regex for `(\d+) hrs?` and `(\d+) mins?` -> total minutes.

## 3. Business rules (OT)
- Standard duty = 540 minutes (9 hours).
- OT = max(0, duration - 540). If end < start, add 1440 (overnight shift). If duration <= 0 or > 1440, show "Check shift time".
- Off-duty shift: OT = "0 hrs", times saved as "0:00".
- fmtOT(minutes) -> "X hrs Y mins" | "X hrs" | "Y mins" | "0 hrs".
- fmtOTShort(minutes) -> "11h 22m" (compact, used ONLY for chart bar labels; real hours + minutes, never decimals like 11.4h).
- Color class by OT: none (0), low (< 2 hrs), mid (2-5 hrs), high (> 5 hrs).
- Defaults: SC head "Md Azmir Hossain", name "S.M.Faisal Ahmed", HR ID "0036", designation "Sr Supervisor".

## 4. Screens
**Auth gate:** centered card, email + password, Sign in, Reset password, error line, note "No public sign-up".

**Top bar:** brand, desktop tabs (Dashboard, Report, History, Analytics), sync pill (Connecting / Synced / Offline / Sync error / Sync pending), signed-in email, Sign out, "Export & backup" dropdown, dark/light theme toggle. On mobile, replace tabs with a fixed bottom nav with icons.

**Dashboard:** year selector; stat cards (total OT, duty days, average OT per duty day, etc.); "Monthly overtime" bar chart (12 bars, current month highlighted); "Recent reports" table (Date, Shift, Activities, OT).

**Report (default tab):** toolbar with prev/next report, go-to-date picker, "Unsaved changes" chip, New report, Copy last, Save (Ctrl+S). Form: SC head, name, HR ID, designation, date, From, To, read-only "Overtime today" (auto-calculated live), shift segmented control (Day / Night / Off duty) and an off-type dropdown that appears when Off duty is chosen. Then repeatable activity cards (Client, Site code, Category dropdown, Activity details textarea, Assigned by, Team/person) with Remove button and a "+ Add activity" button. Client, site, assigned-by and team inputs use `<datalist>` autocomplete from built-in lists (clients like Grameen Phone, Robi, Banglalink, Teletalk, SCOMM etc.; categories like Implementation, DWDM Activity, Capacity upgrade, Device Change, Client Connectivity...; team member names). Auto-save a draft to localStorage while typing and restore it.

**History:** filters (search text, shift type, date from/to) with a stats strip (reports found, total OT, date range); list of saved report cards (click to edit, per-row Delete, checkbox multi-select, Select all, Delete selected) with Undo toast after delete; skeleton loading state.

**Analytics:** year selector, stat cards, "Monthly overtime" bar chart, and a table by month: Month, Day, Night, Leave, Off counts and Overtime total (formatted "X hrs Y mins").

## 5. Bar chart (custom, no chart library)
Flexbox bars. Height = minutes / max * 170px, min-height 3px, rounded top, gradient cyan -> primary, current month brighter. Label above each bar uses fmtOTShort. Month label below (3 letters). On screens <= 720px the value labels are rotated vertical (`writing-mode: vertical-rl` + `rotate(180deg)`, 10px font) so 12 bars never overlap.

## 6. Data, sync and offline
- localStorage is the primary working copy; Firebase is the cloud copy. Realtime listener updates the UI when the cloud changes.
- Offline-first: failed writes go into a pending queue (localStorage) and are flushed when back online; the pill shows "Sync pending".
- On first cloud snapshot, merge local + cloud by id, newest updatedAt wins.
- Manual "Sync from cloud now" action.
- Unsaved-changes guard (confirm before discarding).

## 7. Export / import
- PDF (jsPDF + html2canvas): one landscape A4 page per report, formatted like an official activity report (header with name/HR ID/designation/SC head/date/from/to/OT, then the activities table). Support selected reports or all.
- Excel (SheetJS) download; Print view; JSON full backup.
- Restore from .xlsx / .json (parse sheet rows back into records, normalize dates, import with merge).

## 8. Design system
- Style: clean, modern, iOS-like. Indigo primary (#4f46e5), cyan accent, soft rounded cards (14px), subtle shadows, Inter font, glassy "liquid" buttons, animated focus ring, page-in transition, toasts, full-screen loader.
- Full light + dark theme via CSS variables on `[data-theme]` (light bg #f0f2f8, dark bg #080c1a), with semantic colors for success/warn/danger/purple. Theme choice persisted. Respect prefers-reduced-motion.
- Responsive: desktop top tabs; mobile bottom nav; tables inside scroll wrappers; print stylesheet for reports.
- Accessibility: labels on all inputs, aria-selected on tabs, role="img" + aria-label on charts, aria-live on toasts, role="alert" on auth error.
- Escape all user text with an esc() helper before inserting into innerHTML.

## 9. Telegram bot (bot.js)
Conversation-state machine per chat (with a processing lock and duplicate-message-ID cache), replies in Markdown, mixed Bangla-English (Banglish) tone.
- `/start`: ask date (default today) -> start time -> user sends "add" to get an activity template (Client, Site code, Category, Activity details, Assigned by, Team / person) -> pastes the filled form, bot parses it (site code uppercased; defaults: category "Implementation", assigned by "MD Azmir Hossain", team "N/A") and confirms each activity -> user sends "end" -> asks end time -> calculates OT with the same 540-minute rule -> saves the full report with the Admin SDK (`db.ref('reports/'+id).set(report)`) in the exact same data model as the website -> sends a summary.
- `/edit`: ask date, look up the report via the Admin SDK (`db.ref('reports').once('value')`; if not found, list available dates), then accept edit commands to change fields or remove activities by number.
- `/cancel` at any time. Normalize time input (e.g. "9:00", "18"), accept dates like 27 Oct / 2026-10-27.
- Express `GET /` health route, `POST /bot<TOKEN>` webhook route.

## 10. Security requirements
- `database.rules.json`: only authenticated users may read/write `/reports`, and each report must have `id`, `date`, `shift`:
  ```json
  { "rules": { "reports": {
      ".read": "auth != null", ".write": "auth != null",
      "$reportId": { ".validate": "newData.hasChildren(['id','date','shift'])" } } } }
  ```
  Rules are deployed separately from hosting with `firebase deploy --only database`. Verify with `curl https://<project>-default-rtdb.firebaseio.com/reports.json` -> `{"error":"Permission denied"}`.
- No secrets in client or bot source; use env vars; `.gitignore` must contain `node_modules/`, `.env`, `.firebase/`.
- Render: set `TOKEN` and `FIREBASE_SERVICE_ACCOUNT` under **Environment Variables** (not "Secret Files", which `process.env` cannot read).
- Firebase Hosting must not publish server files. In `firebase.json` use `"public": "."` with `ignore`: `firebase.json`, `**/.*`, `**/node_modules/**`, `README.md`, `PROMPT.md`, `bot.js`, `package.json`, `package-lock.json`, `database.rules.json`. Verify `/bot.js` and `/PROMPT.md` are not served.
- Headers: images `max-age=31536000`; css/js/html `no-cache` so deploys show up immediately.
- GitHub Pages must be disabled (it would publish bot.js). Deploy only through the Firebase Hosting GitHub Action (`FirebaseExtended/action-hosting-deploy`, channel `live`).
- If a token is ever pasted in chat, logs or commits, revoke it via @BotFather `/revoke` and set the new one in Render.
- No innerHTML with unescaped user data.

## 11. Deliverables
Complete index.html, style.css, app.js, bot.js, package.json (with `firebase-admin`), firebase.json, database.rules.json, .gitignore, `.github/workflows/firebase-hosting-merge.yml` (deploy on push to main), and a short README with deploy steps (Firebase Hosting + `firebase deploy --only database` + Render env vars + webhook). Hosting caching: `no-cache` for js/css/html.
