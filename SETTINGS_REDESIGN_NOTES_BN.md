# Report-Pro — Full Left Sidebar Redesign

- পুরো অ্যাপের প্রধান নেভিগেশন এখন TP-Link router admin panel-এর মতো বাম পাশের স্থায়ী Sidebar-এ।
- Dashboard, Report, History, Analytics, Calendar, Money এবং Settings আলাদা পেজ হিসেবে Sidebar থেকে খোলা যায়।
- Settings-এর ভেতরে General, Appearance, Data & Sync, Account & Security এবং System Information আলাদা সাব-পেজ হিসেবে রাখা হয়েছে।
- মোবাইলে Sidebar hamburger button দিয়ে off-canvas drawer হিসেবে খোলে।
- বিদ্যমান রিপোর্ট/ফাইন্যান্স ডেটা মডেল, Firebase path, storage key এবং business logic ইচ্ছাকৃতভাবে পরিবর্তন করা হয়নি।
- Deployment-এর আগে JSON backup নিন এবং GitHub Actions ও live Firebase-এ পরীক্ষা করুন।
