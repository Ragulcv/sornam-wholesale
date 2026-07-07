import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);
const results = [];
const check = (n, ok) => { results.push(ok); console.log(`  ${ok ? "✓" : "✗"} ${n}`); };

const op = (await sql`insert into operators (name) values ('Schema Op') returning id, name`)[0];
check("operator inserted", !!op?.id);

const p = (await sql`insert into parties (name, phone, opening_pure_gold, opening_cash) values ('Schema Party','9000000000', 12.500, 50000) returning id`)[0];
check("party inserted with opening balances", !!p?.id);

const t = (await sql`insert into transactions (trn_type, party_id, metal, bar_rate, created_by)
  values ('sales', ${p.id}, 'gold', 7240, ${op.name}) returning id, serial_no`)[0];
check("transaction inserted, serial_no auto-assigned", !!t?.id && t.serial_no > 0);

await sql`insert into transaction_lines (transaction_id, kind, particulars, weight, touch, pure, rate, amount)
  values (${t.id}, 'sale', 'Gold bar', 100, 99.5, 99.5, 7240, 724000)`;
await sql`insert into metal_movements (transaction_id, direction, weight, touch, pure)
  values (${t.id}, 'received', 50, 91.6, 45.8)`;
await sql`insert into settlements (transaction_id, mode, direction, amount)
  values (${t.id}, 'cash', 'received', 500000)`;
await sql`insert into settlements (transaction_id, mode, direction, amount, bank_name)
  values (${t.id}, 'bank', 'received', 224000, 'HDFC')`;

const lineCount = (await sql`select count(*)::int n from transaction_lines where transaction_id=${t.id}`)[0].n;
const setlCount = (await sql`select count(*)::int n from settlements where transaction_id=${t.id}`)[0].n;
check("lines + split settlements attach to txn", lineCount === 1 && setlCount === 2);

const bk = (await sql`insert into bookings (party_id, metal, book_mode, weight_booked, locked_rate, advance_paid)
  values (${p.id}, 'gold', 'metal', 500, 7240, 100000) returning id, serial_no`)[0];
check("booking inserted", !!bk?.id && bk.serial_no > 0);

await sql`insert into stock (id, opening_pure_gold, opening_cash) values (1, 1000, 500000)
  on conflict (id) do update set opening_pure_gold = 1000`;
const st = (await sql`select opening_pure_gold::float g from stock where id=1`)[0];
check("stock opening balances stored", st.g === 1000);

// FK cascade: deleting the transaction removes its lines/movements/settlements
await sql`delete from transactions where id=${t.id}`;
const after = (await sql`select
  (select count(*) from transaction_lines where transaction_id=${t.id})::int l,
  (select count(*) from metal_movements where transaction_id=${t.id})::int m,
  (select count(*) from settlements where transaction_id=${t.id})::int s`)[0];
check("FK cascade removes lines/movements/settlements", after.l === 0 && after.m === 0 && after.s === 0);

// cleanup
await sql`delete from bookings where id=${bk.id}`;
await sql`delete from parties where id=${p.id}`;
await sql`delete from operators where id=${op.id}`;

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} schema checks passed`);
process.exit(passed === results.length ? 0 : 1);
