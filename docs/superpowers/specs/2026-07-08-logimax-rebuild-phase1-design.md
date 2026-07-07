# Sornam Wholesale — Logimax-style Rebuild, Phase 1 Design

**Date:** 2026-07-08
**Product:** Sornam Wholesale (bullion wholesale — Kuberan Bullion). NOT retail Sornam AI.
**Context:** Staff are old-school and trust their current ERP (**Logimax Solutions**). We're rebuilding a familiar-feeling replacement: their layout + depth, plus our custom features. This is a **core re-architecture** (transaction-centric metal+cash ledger) **reusing existing infra** (PIN auth/lock, Singapore-fast Vercel+Neon deploy, WhatsApp, Excel import, bulk-select, security).

> Decisions locked with Ragul: rebuild core + reuse infra · Phase-1 scope below · Pure = Weight × Touch, dual metal+cash balances.

## 1. Domain model (bullion dual-ledger)

Every transaction moves **metal** (tracked in weight *and* pure content) and **cash** (cash/bank) in parallel, and both sides carry running balances.

- **Touch** = fineness. **Pure = Weight × Touch ÷ 100** (e.g. 100g @ 91.6 touch = 91.6g pure). *(confirm ÷100 vs ×touch convention)*
- **Rate** = **per gram** (feedback #4). One **Bar Rate / Rate-Gm** per entry header; each line can still carry its own rate.
- **Outward** = metal/value given by us; **Inward** = received by us.
- Money settles as **Cash / Bank**, optionally **split** across both (feedback #1).
- **Balances** kept in both **Pure (metal)** and **Cash/Bank**, per metal (gold/silver), at org level (stock, #10) and per party (OpgPure/OpgCash).

## 2. Transaction types (Trn_Type)

`Booking` · `Sales` · `Purchase` · `Expense` (matches Logimax's Sales/Purchase/Expense + our Booking, which Logimax lacks and Kuberan needs).

## 3. Data model (new tables; old customer/booking/collection replaced)

- **parties** — id, name, phone, gstin, type (customer/vendor/both), opening_pure (per metal), opening_cash, notes, created_at. Current party balance = opening + Σ transactions.
- **transactions** (header) — id, serial_no (auto), trn_type, party_id, txn_date, metal (gold/silver), bar_rate (per g), ref_no, thru, narration, tds_amount, status, created_by, created_at, modified_by, modified_at.
- **transaction_lines** — id, transaction_id, kind (purchase / purchase_return / sale / sale_return), particulars, weight, touch, pure (=wt×touch/100), rate (per g), amount, booking_id (nullable link).
- **metal_movements** — id, transaction_id, direction (received/paid), particulars, weight, touch, a_touch, pure. (Logimax "Metal Receipts / Payments".)
- **settlements** — id, transaction_id, mode (cash/bank), direction (received/paid), amount, bank_name. (Enables single or split payment, and the Cash/Bank Recd/Paid columns.)
- **bookings** — id, party_id, metal, book_mode (metal | amount), weight_booked (nullable), locked_rate (per g, nullable), amount (nullable), advance_paid, status (open/partial/delivered), delivered_txn_id (nullable), created_at. **Purity/touch NOT captured at booking — only at delivery** (#3).
- **stock** (single row per metal + org cash) — opening_pure(gold), opening_pure(silver), opening_cash, opening_bank, updated_at. Live availability = opening + Σ movements/settlements (#10).
- **settings** (existing, extended) — pin, auto-logoff, gstin, **tds_percent**, rates, price fields.

Amounts computed server-side. Audit (created/modified by) needs an operator identity — see Open Questions.

## 4. Screens (Logimax-familiar layout)

Shared chrome: dense forms, one **Add / Save / Cancel / Edit / Delete / Find / Print / Report** toolbar per screen; blue-header data grids; keyboard-first entry.

1. **Sales / Purchase Entry** (the core). Header (Party, Date, No, Bar Rate, Rate/Gm, Ref, OpgPure, OpgCash) → line-item grid (Particulars, Weight, Touch, Pure, Rate, Tot.Amt, Del/Edit) with add-row + running Total → Metal Receipts/Payments grid → settlement (Cash/Bank recd/paid, split) → **TDS** line → Totals (Pure / Cash) and **Closing Balance** (Pure & Cash). WhatsApp confirmation after a Sales entry (#feedback).
2. **Booking Entry** (ours, not in Logimax). Party, metal, **book by metal (grams @ locked per-g rate) or by amount (₹)** (#7), advance. No purity. Save → **WhatsApp booking confirmation** (message = gold bar + weight + locked rate, **no purity**, #6; amount-booking → amount-style message, #7). On **delivery**: enter purity/touch, create the Sales entry, **WhatsApp delivered confirmation** (#11).
3. **Transaction History** (#8, #9) — From/To date + duration, Trn_Type filter (Sales/Purchase/Expense/All), text search, **Excel import**. Wide grid: No, Trn_Type, Date, Party, Outward Wg, Inward Wg, Outward Pure, Inward Pure, MC Cash(O), MC Cash(R), Metal Wg Recd/Paid, Metal Pure Recd/Paid, Cash Recd/Paid, Bank Recd/Paid, Created By, Created Date, Modified By, Modified Dt, Total, View.
4. **Stock / Availability** (#10) — set & view live metal (pure, gold/silver) + cash + bank balances.
5. **Parties** (Purchaser/Vendor master) — reuse current customers UI in Logimax toolbar style; keeps bulk-select + Excel import.

Dropped per feedback: rate-unit selector → per-gram only (#4); locked-vs-market toggle removed (#5); purity at booking removed (#3).

## 5. Reused infra (unchanged)

PIN lock + auto-logoff + lockout · Singapore (sin1) Vercel + Neon + keep-warm · WhatsApp tap-to-send · Excel/CSV import (exceljs) · bulk multi-select delete · print slips.

## 6. Out of scope (later phases)

Purchase Return / Sale Return grids (structure reserved), Expense entry screen polish, multi-metal-per-entry, per-party statement/print, reports/analytics beyond the history grid, Tally export refinements.

## 7. Decisions (confirmed 2026-07-08)

1. **Booking type (#7):** **both** — book by metal (grams @ locked per-g rate) *or* by ₹ amount; WhatsApp message adapts.
2. **Settlement (#1):** **single or split** (Cash + Bank on one entry); multiple lines each at their own rate.
3. **TDS (#2):** **configurable % auto-calculated + manual override**, shown as a deduction line.
4. **Stock (#10):** **live balances per metal** (opening + auto-adjusted by every transaction).
5. **Amount basis:** **line Total = Weight × Rate** (rate per gram). Touch → **Pure = Wt×Touch/100** is still computed and tracked for the **metal (pure) balance ledger**, but billing is on weight.
6. **Created/Modified By (#9):** **single shop PIN login + operator (staff) select per entry.** Add an `operators` list (staff names); each entry stamps created-by/modified-by from the picked operator. No separate credentials yet.
7. **Metal per entry:** **one metal (gold or silver) per transaction**, chosen in the header.

### Data-model deltas from these decisions
- `transaction_lines.amount = weight × rate`; keep `pure` column for the metal ledger.
- New **`operators`** table (id, name, active). `transactions.created_by` / `modified_by` = operator id/name. A "current operator" is picked at login or per entry.
- `transactions.metal` (gold|silver) at header; all lines inherit it.
