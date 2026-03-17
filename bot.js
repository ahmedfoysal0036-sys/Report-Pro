const { Telegraf } = require('telegraf');
const admin = require('firebase-admin');
const ExcelJS = require('exceljs');
const http = require('http');

const serviceAccount = require("./serviceAccountKey.json");
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: "https://infinite-v1-default-rtdb.firebaseio.com/"
    });
}

const db = admin.database();
const bot = new Telegraf('8589894169:AAFNWCOr2EDzqGkEvH-6CL9Iw6QJGdGjKTc');

const port = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Phoenix System is Online!');
}).listen(port);

bot.on('text', async (ctx) => {
    const query = ctx.message.text.trim().replace(/\//g, '-');
    if (!/^\d{4}-\d{2}(-\d{2})?$/.test(query)) return;

    ctx.reply(`📊 Generating Report for: ${query}...`);

    try {
        // --- optimization: query path exact match check ---
        const snapshot = await db.ref('reports').orderByChild('date').startAt(query).endAt(query + "\uf8ff").once('value');
        const allData = snapshot.val();
        
        if (!allData) return ctx.reply("❌ No data found for this date.");

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

        // Styling
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

bot.launch().then(() => console.log("✅ Bot Online - Phoenix Optimized!"));