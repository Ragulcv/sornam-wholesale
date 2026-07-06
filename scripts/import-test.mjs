import ExcelJS from "exceljs";
import { neon } from "@neondatabase/serverless";
import { sealData } from "iron-session";

const BASE = process.argv[2] || "http://localhost:3940";
const sql = neon(process.env.DATABASE_URL);
const results = [];
const check = (n, ok) => { results.push(ok); console.log(`  ${ok ? "✓" : "✗"} ${n}`); };

const cookie =
  "sw_session=" + (await sealData({ authed: true, since: 1 }, { password: process.env.SESSION_SECRET }));

// 1. Template download
{
  const r = await fetch(`${BASE}/api/customers/template`, { headers: { cookie } });
  const buf = Buffer.from(await r.arrayBuffer());
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const header = wb.worksheets[0].getRow(1).values.join("|");
  check("template downloads as valid xlsx with Name header", r.status === 200 && header.includes("Name"));
}

// 2. XLSX import with new + duplicate + blank-name rows
{
  const before = (await sql`select count(*)::int n from customers`)[0].n;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Contacts");
  ws.addRow(["Name (required)", "Phone", "GSTIN", "Note"]);
  ws.addRow(["Import One", "9000000001", "", "test"]);
  ws.addRow(["Import Two", "9000000002", "", ""]);
  ws.addRow(["Import Three", "9000000003", "", ""]);
  ws.addRow(["Karthik Bullion", "9842010101", "", ""]); // duplicate of seed
  ws.addRow(["", "9999999999", "", "no name"]); // invalid
  const buf = await wb.xlsx.writeBuffer();

  const fd = new FormData();
  fd.set("file", new File([buf], "contacts.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const r = await fetch(`${BASE}/api/customers/import`, { method: "POST", body: fd, headers: { cookie } });
  const d = await r.json();
  const after = (await sql`select count(*)::int n from customers`)[0].n;
  console.log("   xlsx summary:", JSON.stringify(d));
  check("xlsx import: added 3", d.added === 3);
  check("xlsx import: 1 duplicate skipped", d.duplicates === 1);
  check("xlsx import: 1 invalid skipped", d.invalid === 1);
  check("xlsx import: DB grew by 3", after === before + 3);
}

// 3. CSV import
{
  const before = (await sql`select count(*)::int n from customers`)[0].n;
  const csv = 'Name,Phone,GSTIN,Note\nCsv Contact A,9000000010,,\nCsv Contact B,9000000011,,\nImport One,9000000001,,\n';
  const fd = new FormData();
  fd.set("file", new File([csv], "contacts.csv", { type: "text/csv" }));
  const r = await fetch(`${BASE}/api/customers/import`, { method: "POST", body: fd, headers: { cookie } });
  const d = await r.json();
  const after = (await sql`select count(*)::int n from customers`)[0].n;
  console.log("   csv summary:", JSON.stringify(d));
  check("csv import: added 2 (1 dup from xlsx)", d.added === 2 && d.duplicates === 1);
  check("csv import: DB grew by 2", after === before + 2);
}

// 4. Auth gate
{
  const r = await fetch(`${BASE}/api/customers/import`, { method: "POST", body: new FormData() });
  check("import blocked without session", r.redirected || r.url.includes("/lock") || r.status === 401 || r.status === 307);
}

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exitCode = passed === results.length ? 0 : 1;
