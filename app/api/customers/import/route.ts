import ExcelJS from "exceljs";
import { bulkAddCustomers } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Row {
  name: string;
  phone: string;
  gstin: string;
  notes: string;
}

const cellStr = (v: unknown): string => {
  if (v == null) return "";
  if (typeof v === "object") {
    const o = v as { text?: unknown; result?: unknown; richText?: { text: string }[] };
    if (Array.isArray(o.richText)) return o.richText.map((t) => t.text).join("");
    if (o.text != null) return String(o.text);
    if (o.result != null) return String(o.result);
    return "";
  }
  return String(v);
};

// Map a header label to one of our fields.
function fieldFor(header: string): keyof Row | null {
  const s = header.trim().toLowerCase();
  if (!s) return null;
  if (s.includes("name") || s.includes("customer")) return "name";
  if (s.includes("phone") || s.includes("mobile") || s.includes("contact") || s.includes("number"))
    return "phone";
  if (s.includes("gst")) return "gstin";
  if (s.includes("note") || s.includes("remark")) return "notes";
  return null;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function rowsFromMatrix(matrix: (string | unknown)[][]): Row[] {
  if (matrix.length < 2) return [];
  const header = matrix[0].map((h) => cellStr(h));
  const colField: (keyof Row | null)[] = header.map(fieldFor);
  const out: Row[] = [];
  for (let r = 1; r < matrix.length; r++) {
    const line = matrix[r];
    const rec: Row = { name: "", phone: "", gstin: "", notes: "" };
    colField.forEach((f, c) => {
      if (f && !rec[f]) rec[f] = cellStr(line[c]).trim();
    });
    if (rec.name || rec.phone || rec.gstin || rec.notes) out.push(rec);
  }
  return out;
}

export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "No file uploaded." }, { status: 400 });
  }
  const buf = Buffer.from(await file.arrayBuffer());

  let rows: Row[] = [];
  try {
    if (file.name.toLowerCase().endsWith(".csv")) {
      rows = rowsFromMatrix(parseCsv(buf.toString("utf8")));
    } else {
      const wb = new ExcelJS.Workbook();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await wb.xlsx.load(buf as any);
      const ws = wb.worksheets[0];
      if (!ws) return Response.json({ error: "Empty file." }, { status: 400 });
      const matrix: unknown[][] = [];
      ws.eachRow((row) => {
        const vals = row.values as unknown[]; // 1-indexed
        matrix.push(vals.slice(1));
      });
      rows = rowsFromMatrix(matrix);
    }
  } catch {
    return Response.json(
      { error: "Could not read the file. Use the provided template." },
      { status: 400 },
    );
  }

  if (rows.length === 0) {
    return Response.json({ error: "No contact rows found." }, { status: 400 });
  }

  const res = await bulkAddCustomers(rows);
  return Response.json({ ok: true, total: rows.length, ...res });
}
