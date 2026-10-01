// One-off: hand-typed "MCX accounts (lots)" rows -> opening trades in the MCX
// trade register (no price; flagged until one is added). Customer lot rows are
// left alone. Dry run by default; pass --apply to write. Prints the DB host so
// it is obvious which database it is about to touch.
import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
const host = process.env.DATABASE_URL.match(/ep-[a-z0-9-]+/)[0];
const apply = process.argv.includes("--apply");
const rows = await sql`select id, name, sell_lots::float s, buy_lots::float b, created_at from mcx_positions where block = 'account'`;
console.log(`${host}: ${rows.length} hand-typed MCX account row(s)${apply ? "" : " (dry run)"}`);
for (const r of rows) {
  const net = r.b - r.s;
  console.log(`  ${r.name}: sell ${r.s} buy ${r.b} -> opening ${net > 0 ? "BUY" : "SELL"} ${Math.abs(net)} lot(s), no price`);
  if (!apply) continue;
  if (Math.abs(net) > 0.0005)
    await sql`insert into mcx_trades (trade_date, account, side, lots, price, remarks, created_by)
              values (${r.created_at}, ${r.name}, ${net > 0 ? "buy" : "sell"}, ${Math.abs(net)}, null, 'opening position moved from the hedge sheet (add the price)', 'migration')`;
  await sql`delete from mcx_positions where id = ${r.id}`;
}
if (apply) console.log("done:", (await sql`select account, side, lots::float, price from mcx_trades order by serial_no`));
