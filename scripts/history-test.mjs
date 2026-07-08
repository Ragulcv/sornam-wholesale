import { neon } from "@neondatabase/serverless";
import { sealData } from "iron-session";

const BASE = process.argv[2] || "http://localhost:3940";
const sql = neon(process.env.DATABASE_URL);
const results = [];
const check = (n, ok) => { results.push(ok); console.log(`  ${ok ? "✓" : "✗"} ${n}`); };

const op = (await sql`select id, name from operators where name='Ravi'`)[0];
const cookie = "sw_session=" + (await sealData({ authed: true, operatorId: op.id, operatorName: op.name, since: 1 }, { password: process.env.SESSION_SECRET }));
const g = (p) => fetch(BASE + p, { headers: { cookie } }).then((r) => r.text());

const txnCount = (await sql`select count(*)::int n from transactions`)[0].n;
const salesCount = (await sql`select count(*)::int n from transactions where trn_type='sales'`)[0].n;

// 1. all rows
const all = await g("/history");
const viewLinks = (all.match(/>View</g) || []).length;
check(`history shows all ${txnCount} transactions`, viewLinks === txnCount);

// 2. filter by type=sales
const sales = await g("/history?type=sales");
const salesLinks = (sales.match(/>View</g) || []).length;
check(`type=sales filter shows ${salesCount}`, salesLinks === salesCount);

// 3. CSV export all
const csv = await (await fetch(BASE + "/api/export/transactions", { headers: { cookie } })).text();
const csvRows = csv.trim().split("\n");
check("CSV export has header + all rows", csvRows[0].includes("Outward Wg") && csvRows.length === txnCount + 1);

// 4. CSV sales filter
const csvSales = (await (await fetch(BASE + "/api/export/transactions?type=sales", { headers: { cookie } })).text()).trim().split("\n");
check("CSV type=sales filter", csvSales.length === salesCount + 1);

// 5. aggregate correctness — Karthik gold sale (value 1088000, outward wg 150)
const karthikRow = csvRows.find((l) => l.includes("Karthik"));
const cols = karthikRow ? karthikRow.split(",") : [];
// header: No,Type,Date,Party,Metal,Outward Wg,Inward Wg,Outward Pure,...,Value(17),...
check("Karthik sale outward Wg = 150", cols[5] === "150");
check("Karthik sale value = 1088000", cols[17] === "1088000");

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
