# Report-Pro Settings Redesign

## কী পরিবর্তন হয়েছে
- Desktop navigation-এ Settings section যোগ হয়েছে।
- Settings-এর ভিতরে TP-Link router-এর মতো left sidebar এবং আলাদা content page যোগ হয়েছে।
- General, Appearance, Data & Sync, Account & Security এবং System Information আলাদা পেজ।
- Theme switch, JSON backup, restore, PDF/Excel export, print এবং manual cloud sync আগের app.js action ব্যবহার করে।
- Mobile-এ Settings মূল bottom navigation-এ আছে; Settings-এর ভেতরের sub-navigation horizontal scroll করে।

## Data safety
- Existing report, finance, calendar, Firebase data model বা storage key পরিবর্তন করা হয়নি।
- নতুন কোনো database write/schema migration যোগ করা হয়নি।
- Account/security page কেবল বর্তমান authentication setup সম্পর্কে তথ্য দেখায়; Firebase rules পরিবর্তন করে না।

## Deploy
বর্তমান Hosting public directory-তে `index.html`, `style.css`, `app.js`, `personal.js` একসাথে আপলোড/ডিপ্লয় করুন। আগের live version এবং JSON backup রেখে তারপর deploy করুন।
