# Activity Tracker — Safe Upgrade Notes

## Included files

- `index.html` — new Calendar and Money views, plus Government Holiday Duty checkbox.
- `style.css` — responsive iOS-like styling for the new screens.
- `app.js` — existing report flow retained; safer local writes, safer cloud merge, complete JSON backup bundle, and explicit holiday-duty flag.
- `personal.js` — isolated Salary/Appraisal history, OT rate history, payout calculations, Food Allowance, Food Expense, Journey log, and attendance calendar.
- `bot.js` — stricter time validation, website-compatible zero-OT format, Bangladesh date handling, per-chat message queue, and Telegram allowlist.
- `FIREBASE_RULES_MERGE_SNIPPET.json` — add this path to the existing Realtime Database rules; do not replace your existing rules with this snippet.
- `originals/` — untouched copies of the four uploaded source files and the existing `PROMPT.md`, for rollback/reference.

## Data preservation

- Existing report storage key `prof_stable_v30_ot_hm` remains unchanged.
- Existing report IDs, dates, activity rows, shifts and legacy schema are not migrated or rewritten just to add finance features.
- Existing report Firebase path `/reports/{id}` remains unchanged.
- Finance records are stored separately in LocalStorage, per signed-in Firebase UID, and in `/personalFinance/{uid}` when the Firebase rules permit it.
- A new JSON backup contains both `reports` and `personalFinance`. Old JSON backups that are plain report arrays are still accepted during Restore.
- Delete operations in the new finance collections use soft-delete markers; the record remains in the backup history.

## Firebase rules update required for cloud finance sync

Merge the contents of `FIREBASE_RULES_MERGE_SNIPPET.json` into the existing top-level `rules` object in your Realtime Database rules. Keep your current `/reports` rules unchanged. Then deploy the merged rules. If you do not add this rule, the new finance module remains saved locally on the device and shows a local-only sync notice; it does not erase the existing report data.

## Telegram Render environment variable

The updated bot fails closed unless an authorised Telegram numeric user ID is configured:

`ALLOWED_TELEGRAM_USER_IDS=123456789`

For multiple authorised accounts, use comma-separated IDs. An unauthorised user receives their Telegram user ID in the denial message, so the owner can add the correct ID in Render Environment Variables. Do not put IDs or the bot token in the source code.

## Payroll rules implemented

- Salary Month receives OT from two months earlier. Example: October salary month pays August OT.
- OT uses the hourly rate effective on the actual work date.
- Salary uses the appraisal profile effective by the end of that salary month. Mid-month salary is not prorated in this version.
- Government Holiday Duty is a separate fixed ৳900 allowance, stored as a flag on the duty report and paid with the same two-month OT payout cycle. It is not added to OT hours.
- The Holiday Duty checkbox should be selected only when duty was actually performed on the Government Holiday. Selecting an Off / Holiday shift alone does not create the ৳900 allowance.
- Food Allowance is entered manually with date, location, distance, amount, bill reference and status. Only entries marked `Paid / Received` are counted as received income in the selected salary month.
- Food Expense is separate from Food Allowance and is subtracted from net balance.
- Daily Journey entries are independent of activity report rows and allow multiple journeys per day.
- Calendar Missing flags are generated only for weekdays selected in Expected Duty Weekdays. No work schedule is assumed by default.

## Deployment

1. Keep a copy of your live files and download a JSON backup from the current app before deployment.
2. Upload `index.html`, `style.css`, `app.js`, and the new `personal.js` together to the same Hosting directory. `personal.js` must be served next to `app.js`.
3. Deploy the merged Firebase rules for `/personalFinance/{uid}`.
4. Add `ALLOWED_TELEGRAM_USER_IDS` to Render before deploying the updated `bot.js`.
5. Sign in, verify existing reports, add one test appraisal, and test a Food Allowance / Expense / Journey entry. Export a new JSON backup after verification.

## Test status

- `node --check` passed for `app.js`, `bot.js`, and `personal.js`.
- Financial calculation unit checks passed for two-month payout mapping, historical OT rate, appraisal salary, holiday allowance, food allowance receipt, food expense deduction, and fractional-hour OT.
- Telegram time/OT tests passed for AM/PM conversion, invalid times, overnight shifts, zero OT, and positive OT.
- HTML parser found no duplicate element IDs and all newly required form/view IDs are present.
- A real Firebase/Render integration test was not possible from this local environment. The new finance cloud path requires the rules merge described above. A headless Chromium UI run did not complete in this container, so visual/browser interaction testing remains to be done on the hosted test copy before replacing production files.

## Still pending for a later phase

- iPhone Home Screen PWA installation manifest / service worker and background Web Push notifications are not implemented in this package; the existing Safari Bookmark workflow remains usable.
- Daily scheduled reminders, background Missing Report / high-OT push alerts, and scheduled Telegram daily summary need a notification/push service and server scheduling configuration. The Calendar currently flags missing reports in-app only.
- A full live test against your Firebase project and Render Telegram webhook cannot be performed without your deployed environment, database rules and Render environment variables.
