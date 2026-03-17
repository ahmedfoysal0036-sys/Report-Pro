const { Telegraf } = require('telegraf');
const admin = require('firebase-admin');
const ExcelJS = require('exceljs');
const http = require('http'); // 1. HTTP module add kora holo

const serviceAccount = require("./serviceAccountKey.json");
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: "https://infinite-v1-default-rtdb.firebaseio.com/"
    });
}

const db = admin.database();
const bot = new Telegraf('8589894169:AAFNWCOr2EDzqGkEvH-6CL9Iw6QJGdGjKTc');

// 2. Render-er jonno ekti simple server jeta bot-ke "Live" thakte help korbe
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
        const snapshot = await db.ref('reports').once('value');
        const allData = snapshot.val();
        if (!allData) return ctx.reply("No data found.");

        const results = Object.values(allData)
            .filter(r => r && r.date && r.date.startsWith(query))
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
            const rows = report.rows || [];
            const validRows = rows.filter(row => row && (row.s || row.w));

            validRows.forEach(row => {
                let category = row.cat || "-";
                let assignedBy = row.ab || "N/A";
                let teamPerson = row.t || "N/A";

                worksheet.addRow({
                    sl: slCount++,
                    date: report.date || 'N/A',
                    client: row.c || '',
                    site: row.s || '',
                    work: row.w || '',
                    cat: category,
                    assign: assignedBy,
                    team: teamPerson
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
        console.error(e);
        ctx.reply("Error: " + e.message);
    }
});

bot.launch().then(() => console.log("✅ Bot Online - Phoenix System, Professor!"));