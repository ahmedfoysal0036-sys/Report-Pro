const { Telegraf } = require('telegraf');
const admin = require('firebase-admin');
const ExcelJS = require('exceljs');
const http = require('http');

// Environment Variable থেকে ক্রেডেনশিয়াল নেওয়া
let serviceAccount;
try {
    const rawData = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (rawData) {
        serviceAccount = JSON.parse(rawData.trim());
    } else {
        throw new Error("Env Var not found");
    }
} catch (e) {
    console.error("Firebase Credentials missing or invalid!");
    serviceAccount = require("./serviceAccountKey.json");
}

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: "https://infinite-v1-default-rtdb.firebaseio.com/"
    });
}

const db = admin.database();
db.ref('.info/connected').on('value', (s) => {
    if (s.val() === true) console.log("📡 Connected to Firebase Realtime DB");
});

const bot = new Telegraf('8589894169:AAFNWCOr2EDzqGkEvH-6CL9Iw6QJGdGjKTc');

const port = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Phoenix System is Online!');
}).listen(port);

bot.on('text', async (ctx) => {
    const query = ctx.message.text.trim().replace(/\//g, '-');
    
    // সাপোর্ট করবে: 2026, 2026-03, 2026-03-11
    if (!/^\d{4}(-\d{2})?(-\d{2})?$/.test(query)) return;

    ctx.reply(`📊 Generating Report for: ${query}...`);

    try {
        let startAt = query;
        let endAt = query + "\uf8ff";

        // যদি ইউজার শুধু ৪ ডিজিটের বছর দেয় (যেমন 2026)
        if (query.length === 4) {
            startAt = `${query}-01-01`;
            endAt = `${query}-12-31\uf8ff`;
        }

        const snapshot = await db.ref('reports')
            .orderByChild('date')
            .startAt(startAt)
            .endAt(endAt)
            .once('value');
            
        const allData = snapshot.val();
        
        if (!allData) return ctx.reply("❌ No data found for this period.");

        const results = Object.values(allData)
            .sort((a, b) => new Date(a.date) - new Date(b.date));

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('DAR Report');

        worksheet.columns = [
            { header: 'SL', key: 'sl', width: 5 },
            { header: 'Date', key: 'date', width: 12 },
            { header: 'Client', key: 'client', width: 20 },
            { header: 'Site Code', key: 'site', width: 25 },
            { header: 'Work Details', key: 'work', width: 60 },
            { header: 'Category', key: 'cat', width: 18 },      
            { header: 'Assign By', key: 'assign', width: 25 },   
            { header: 'Team/Person', key: 'team', width: 15 }    
        ];

        let slCount = 1;
        results.forEach(report => {
            const rows = Array.isArray(report.rows) ? report.rows : (report.rows ? Object.values(report.rows) : []);
            const validRows = rows.filter(row => row && (row.s || row.w));

            validRows.forEach(row => {
                worksheet.addRow({
                    sl: slCount++,
                    date: report.date || 'N/A',
                    client: row.c || '',
                    site: row.s || '',
                    work: row.w || '',
                    cat: row.cat || "-",
                    assign: row.ab || "N/A",
                    team: row.t || "N/A"
                });
            });
        });

        worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
        worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '0F172A' } };
        worksheet.eachRow((row) => {
            row.eachCell((cell) => {
                cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
            });
        });

        const buffer = await workbook.xlsx.writeBuffer();
        await ctx.replyWithDocument({
            source: buffer,
            filename: `DAR_Report_${query}.xlsx`
        });

    } catch (e) {
        console.error("Error Log:", e);
        ctx.reply("❌ Error: " + e.message);
    }
});

bot.catch((err) => console.error("Telegraf Error:", err));

bot.launch().then(() => console.log("✅ Bot Online - Phoenix Cloud Ready!"));