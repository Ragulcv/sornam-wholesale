import ExcelJS from "exceljs";
import { requireSession, currentOperatorName } from "@/lib/auth";
import { findOrCreateParty } from "@/lib/queries/parties";
import { createBooking, saveLotPosition } from "@/lib/queries/bookings";
import { saveMcxTrade } from "@/lib/queries/mcx";
import { todayKey } from "@/lib/dates";
import type { BookType, BookSide } from "@/lib/lkb";

export const dynamic = "force-dynamic";

// Reads the client's own booking workbook back in. Sheet names drive the book
// type and side; columns are read by position because their live file has junk
// typed over some headers ("4re ", "15" where DATE should be).

interface ParsedBooking {
  sheet: string;
  bookType: BookType;
  side: BookSide;
  date: string | null;
  name: string;
  weight: number;
  rate: number | null;
  delivered: number;
  mcxRate: number | null;
  remarks: string | null;
}
interface ParsedLot {
  block: "customer" | "account";
  name: string;
  sellLots: number;
  buyLots: number;
}

const SHEET_MAP: Record<string, { bookType: BookType; side: BookSide }> = {
  "R SELL": { bookType: "ready", side: "sell" },
  "R BUY": { bookType: "ready", side: "buy" },
  "F SELL": { bookType: "forward", side: "sell" },
  "F BUY": { bookType: "forward", side: "buy" },
};

const numOf = (v: unknown): number => {
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "object" && v !== null && "result" in v) return numOf((v as { result: unknown }).result);
  const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const textOf = (v: unknown): string => {
  if (v == null) return "";
  if (typeof v === "object" && v !== null) {
    if ("result" in v) return textOf((v as { result: unknown }).result);
    if ("text" in v) return String((v as { text: unknown }).text);
    if ("richText" in v) return (v as { richText: { text: string }[] }).richText.map((r) => r.text).join("");
  }
  return String(v).trim();
};
const dateOf = (v: unknown): string | null => {
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  const s = textOf(v);
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};

function parseWorkbook(wb: ExcelJS.Workbook): { bookings: ParsedBooking[]; lots: ParsedLot[]; notes: string[] } {
  const bookings: ParsedBooking[] = [];
  const lots: ParsedLot[] = [];
  const notes: string[] = [];

  for (const ws of wb.worksheets) {
    const title = ws.name.trim().toUpperCase();

    // ---- fixed-rate sheets ----
    const map = SHEET_MAP[title];
    if (map) {
      let taken = 0;
      ws.eachRow((row, n) => {
        if (n === 1) return; // header
        const name = textOf(row.getCell(2).value);
        const wt = numOf(row.getCell(3).value);
        if (!name || wt <= 0) return; // blank filler or the SUM row
        bookings.push({
          sheet: ws.name,
          bookType: map.bookType,
          side: map.side,
          date: dateOf(row.getCell(1).value),
          name,
          weight: wt,
          rate: numOf(row.getCell(4).value) || null,
          delivered: numOf(row.getCell(5).value),
          mcxRate: numOf(row.getCell(7).value) || null,
          remarks: textOf(row.getCell(9).value) || null,
        });
        taken++;
      });
      notes.push(`${ws.name}: ${taken} row(s)`);
      continue;
    }

    // ---- UF CUS: two blocks keyed off their own header rows ----
    if (title.startsWith("UF")) {
      let side: BookSide | null = null;
      let taken = 0;
      ws.eachRow((row) => {
        const b = textOf(row.getCell(2).value).toUpperCase();
        if (b.includes("UF SELL")) { side = "sell"; return; }
        if (b.includes("UF BUY")) { side = "buy"; return; }
        if (!side) return;
        const name = textOf(row.getCell(2).value);
        const wt = numOf(row.getCell(3).value);
        if (!name || wt <= 0) return;
        bookings.push({
          sheet: `${ws.name} (${side.toUpperCase()})`,
          bookType: "unfixed",
          side,
          date: dateOf(row.getCell(1).value),
          name,
          weight: wt,
          // UF block order is DATE | NAME | WT | MCX | RATE | PREMIUM
          rate: numOf(row.getCell(5).value) || null,
          delivered: 0,
          mcxRate: numOf(row.getCell(4).value) || null,
          remarks: null,
        });
        taken++;
      });
      notes.push(`${ws.name}: ${taken} row(s)`);
      continue;
    }

    // ---- the position sheet: two lot blocks ----
    if (title.includes("OR") && title.includes("-")) {
      for (let n = 2; n <= 20; n++) {
        const name = textOf(ws.getCell(`A${n}`).value);
        if (!name) continue;
        const sell = numOf(ws.getCell(`B${n}`).value);
        const buy = numOf(ws.getCell(`C${n}`).value);
        if (!sell && !buy) continue;
        lots.push({ block: "customer", name, sellLots: sell, buyLots: buy });
      }
      for (let n = 2; n <= 10; n++) {
        const name = textOf(ws.getCell(`F${n}`).value);
        if (!name) continue;
        const sell = numOf(ws.getCell(`G${n}`).value);
        const buy = numOf(ws.getCell(`H${n}`).value);
        if (!sell && !buy) continue;
        lots.push({ block: "account", name, sellLots: sell, buyLots: buy });
      }
      notes.push(`${ws.name}: ${lots.length} lot position(s)`);
    }
  }

  return { bookings, lots, notes };
}

export async function POST(req: Request) {
  await requireSession();
  const form = await req.formData();
  const file = form.get("file") as File | null;
  const dryRun = form.get("dryRun") === "1";
  if (!file) return Response.json({ ok: false, error: "Choose a file." }, { status: 400 });

  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(await file.arrayBuffer());
  } catch {
    return Response.json({ ok: false, error: "That file could not be read as an Excel workbook." }, { status: 400 });
  }

  const { bookings, lots, notes } = parseWorkbook(wb);
  if (bookings.length === 0 && lots.length === 0)
    return Response.json({
      ok: false,
      error: "Nothing to import. Expected sheets named R SELL, R BUY, F SELL, F BUY, UF CUS or - OR +.",
      sheets: wb.worksheets.map((w) => w.name),
    });

  if (dryRun)
    return Response.json({ ok: true, dryRun: true, notes, bookings: bookings.slice(0, 200), lots, counts: { bookings: bookings.length, lots: lots.length } });

  const operatorName = await currentOperatorName();
  let imported = 0;
  const failed: string[] = [];
  for (const b of bookings) {
    try {
      const partyId = await findOrCreateParty(b.name);
      await createBooking({
        partyId,
        bookType: b.bookType,
        side: b.side,
        metal: "gold",
        bookDate: b.date ?? undefined,
        weight: b.weight,
        rate: b.rate,
        delivered: b.delivered,
        mcxRate: b.mcxRate,
        remarks: b.remarks,
        operatorName,
      });
      imported++;
    } catch {
      failed.push(`${b.sheet}: ${b.name}`);
    }
  }
  let mcxOpening = 0;
  for (const l of lots) {
    try {
      if (l.block === "customer") await saveLotPosition(l);
      else {
        // An MCX id's lots go into the trade register as opening positions.
        // Their workbook carries no trade price, so these are flagged "no
        // price" until someone adds it; the hedge counts them straight away.
        const net = l.buyLots - l.sellLots;
        if (Math.abs(net) > 0.0005) {
          await saveMcxTrade({ day: todayKey(), account: l.name, side: net > 0 ? "buy" : "sell", lots: Math.abs(net), price: null, remarks: "opening position from Excel (add the price)", operatorName });
          mcxOpening++;
        }
      }
    } catch {
      failed.push(`lots: ${l.name}`);
    }
  }

  return Response.json({ ok: true, imported, lots: lots.length, mcxOpening, failed, notes });
}
