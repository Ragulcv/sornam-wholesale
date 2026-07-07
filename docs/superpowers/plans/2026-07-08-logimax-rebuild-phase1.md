# Logimax-style Rebuild — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development or superpowers:executing-plans to implement task-by-task. Steps use `- [ ]` checkboxes.

**Goal:** Rebuild Sornam Wholesale's core into a Logimax-style bullion trading ledger — transaction-centric with parallel metal (touch/pure) + cash/bank accounting — reusing all existing infra.

**Architecture:** New transaction-centric schema (parties, transactions + lines + metal_movements + settlements, bookings, stock, operators) replacing customer→booking→collection. Server components fetch; client components handle the dense grid-entry screens; server actions do all writes with server-computed money/metal math. Familiar Logimax layout (toolbar per screen, blue-header grids).

**Tech Stack:** Next.js 16 (App Router) · Neon Postgres · Drizzle · Tailwind v4 · iron-session · exceljs · deployed sin1 Vercel + keep-warm.

## Global Constraints

- Rate is **per gram** everywhere. No /10g or /kg selectors.
- **Pure = Weight × Touch ÷ 100.** Line **Total = Weight × Rate** (bill on weight; pure tracked for metal ledger only).
- **One metal (gold|silver) per transaction**, chosen in the header.
- Money math (amounts, pure, balances, TDS) computed **server-side**; never trust client totals.
- Every write stamps `created_by`/`modified_by` from the **current operator** (single shop PIN + operator pick).
- Reuse existing infra unchanged: PIN lock/auto-logoff/lockout, proxy auth gate, WhatsApp tap-to-send, exceljs import, bulk-select, `/api/health` keep-warm, sin1 region.
- Test method for this repo: `npm run build` must pass; behaviour verified with Puppeteer-core (real Chrome) + direct Neon SQL assertions in `scripts/*.mjs`; deploy via `VERCEL_CLI_VERSION=50.22.1 vercel deploy --prod --yes`.
- DB is currently blank; PIN `1234`. Reseed helper will change (see Task 2).

---

## File Structure

- `lib/db/schema.ts` — REWRITE: new tables (operators, parties, transactions, transaction_lines, metal_movements, settlements, bookings, stock, settings extended).
- `lib/bullion.ts` — NEW: pure/amount/balance math + shared types.
- `lib/format.ts` — TRIM: per-gram rate only; touch/pure/weight formatters.
- `lib/queries/*.ts` — NEW split by domain: `parties.ts`, `transactions.ts`, `bookings.ts`, `stock.ts`, `operators.ts`, `history.ts`.
- `lib/session.ts` / `lib/auth.ts` — extend session with `operatorId`.
- `app/actions.ts` — REWRITE around new domain actions.
- `components/Toolbar.tsx` — NEW: Logimax `Add/Save/Cancel/Edit/Delete/Find/Print/Report` bar.
- `app/(app)/entry/*` — NEW: Sales/Purchase entry screen + client grid.
- `app/(app)/bookings/*` — REWORK: booking (metal|amount) + delivery.
- `app/(app)/history/*` — NEW: transaction history grid.
- `app/(app)/stock/*` — NEW: stock/balances.
- `app/(app)/parties/*` — REWORK from customers (keep bulk-select + import).
- `scripts/seed.ts` + `scripts/*.mjs` — update for new model + new test suites.

Old files removed/replaced: `bookings/[id]/*` collection flow, `slip/[collectionId]`, `transactions/` (→ `history/`), `customers/` (→ `parties/`), `new/` (→ `entry/`), `components/BookingRowActions|TransactionRowActions|BookingsList|TransactionsList|RecordCollectionForm|DashboardCollections`.

---

## Task 1: New data model + migration

**Files:** Rewrite `lib/db/schema.ts`; Create `drizzle/` migration; Test `scripts/schema-check.mjs`.

**Interfaces — Produces:** Drizzle tables & inferred types: `operators, parties, transactions, transactionLines, metalMovements, settlements, bookings, stock, settings`. Enums: `metalEnum(gold|silver)`, `trnTypeEnum(booking|sales|purchase|expense)`, `lineKindEnum(sale|sale_return|purchase|purchase_return)`, `moveDirEnum(received|paid)`, `payModeEnum(cash|bank)`, `bookModeEnum(metal|amount)`, `bookingStatusEnum(open|partial|delivered|cancelled)`.

- [ ] **Step 1: Write the new schema.** Full column set:
  - `operators`: id uuid pk, name text notNull, active boolean default true, createdAt.
  - `parties`: id uuid pk, name notNull, phone, gstin, type text default 'customer', openingPureGold numeric(14,3) default 0, openingPureSilver numeric(14,3) default 0, openingCash numeric(14,2) default 0, notes, createdAt.
  - `transactions`: id uuid pk, serialNo integer identity, trnType trnTypeEnum, partyId fk→parties, metal metalEnum, txnDate date notNull, barRate numeric(12,2) (per g), refNo text, thru text, narration text, tdsAmount numeric(14,2) default 0, createdBy text, createdAt, modifiedBy text, modifiedAt.
  - `transactionLines`: id uuid pk, transactionId fk→transactions cascade, kind lineKindEnum, particulars text, weight numeric(12,3), touch numeric(6,3), pure numeric(12,3), rate numeric(12,2), amount numeric(14,2), sortOrder int.
  - `metalMovements`: id uuid pk, transactionId fk cascade, direction moveDirEnum, particulars, weight numeric(12,3), touch numeric(6,3), aTouch numeric(6,3), pure numeric(12,3).
  - `settlements`: id uuid pk, transactionId fk cascade, mode payModeEnum, direction moveDirEnum, amount numeric(14,2), bankName text.
  - `bookings`: id uuid pk, serialNo identity, partyId fk, metal metalEnum, bookMode bookModeEnum, weightBooked numeric(12,3) null, lockedRate numeric(12,2) null, amount numeric(14,2) null, advancePaid numeric(14,2) default 0, status bookingStatusEnum default 'open', deliveredTxnId uuid null, createdBy, createdAt, notes.
  - `stock`: id int pk default 1, openingPureGold numeric(14,3) default 0, openingPureSilver numeric(14,3) default 0, openingCash numeric(14,2) default 0, openingBank numeric(14,2) default 0, updatedAt.
  - `settings`: keep (pinHash, autoLogoffMinutes, failedAttempts, lockedUntil, gstin, defaultGoldRate, defaultSilverRate, priceUpdatedAt) + add `tdsPercent numeric(5,2) default 0`.
- [ ] **Step 2:** `npm run db:generate -- --name logimax_core` → migration SQL emitted.
- [ ] **Step 3:** `npm run db:push` against blank Neon → applies. Expected: "Changes applied".
- [ ] **Step 4: Verify** — `node --env-file=.env.local scripts/schema-check.mjs` inserts one operator + party + transaction + line + settlement, reads them back, asserts FK cascade on transaction delete removes lines. Expected: all asserts pass.
- [ ] **Step 5: Commit** `feat(schema): transaction-centric bullion ledger model`.

## Task 2: Bullion math lib + seed rewrite

**Files:** Create `lib/bullion.ts`; Trim `lib/format.ts`; Rewrite `scripts/seed.ts`; Test `scripts/bullion-math.test.mjs`.

**Interfaces — Produces:**
- `pure(weightG:number, touch:number):number` = round3(weight*touch/100).
- `lineAmount(weightG:number, rate:number):number` = round2(weight*rate).
- `tdsAmount(taxable:number, pct:number):number` = round2(taxable*pct/100).
- `sumSettlements(settlements, mode, dir):number`.
- Types: `TxnType`, `Metal`, `LineKind`, `PayMode`, `BookMode`.

- [ ] **Step 1:** Write `lib/bullion.ts` with the functions above (pure/round helpers).
- [ ] **Step 2:** Trim `lib/format.ts` — drop RateUnit/unitLabel/unitDivisor; keep fmtMoney, fmtWeight(3dp g), fmtRate(/g), fmtTouch, fmtPure, fmtDate, PAYMENT modes (cash/bank).
- [ ] **Step 3:** Rewrite `scripts/seed.ts` — 3 operators (Ravi, Suresh, Meena), 4 parties, stock opening balances, 2 sample sales + 1 purchase transaction with lines/settlements, 2 bookings (1 metal 1 amount). PIN 1234, tdsPercent 0.1.
- [ ] **Step 4: Verify** — `node scripts/bullion-math.test.mjs`: assert pure(100,91.6)===91.6, lineAmount(100,7240)===724000, tdsAmount(100000,0.1)===100. Expected pass.
- [ ] **Step 5:** `npm run db:seed` → "Seed complete". Commit `feat(bullion): metal/cash math + new seed`.

## Task 3: Operator select at login + session

**Files:** Modify `lib/session.ts` (SessionData += operatorId, operatorName), `lib/auth.ts`, `app/actions.ts` (login returns need operator), `app/lock/LockClient.tsx` (after PIN → pick operator), Create `lib/queries/operators.ts`, `components/OperatorSwitch.tsx` (topbar). Test `scripts/operator-test.mjs`.

**Interfaces — Produces:** `listOperators()`, `getCurrentOperator()`, session `{authed, operatorId, operatorName}`. `loginAction` returns `{ok, operators}`; new `setOperatorAction(id)` sets session operator.

- [ ] **Step 1:** Extend SessionData + session-config. `loginAction` on success returns `{ok:true, operators:[{id,name}]}` (no redirect).
- [ ] **Step 2:** LockClient — after correct PIN, show operator picker (buttons of names). Selecting one calls `setOperatorAction(id)` (sets session.operatorId/Name) then `router.replace('/')`.
- [ ] **Step 3:** OperatorSwitch in topbar shows current operator + lets them switch (re-pick).
- [ ] **Step 4:** `requireSession()` also loads operator; helper `currentOperatorName()` for stamping created_by.
- [ ] **Step 5: Verify** `scripts/operator-test.mjs` (Puppeteer): PIN 1234 → operator list appears → pick Ravi → dashboard; topbar shows "Ravi". Expected pass.
- [ ] **Step 6: Commit** `feat(auth): operator selection for created-by audit`.

## Task 4: Logimax toolbar + parties master

**Files:** Create `components/Toolbar.tsx`; Rework `app/(app)/parties/page.tsx` (from customers) + `components/PartiesList.tsx`, `PartyForm.tsx`; keep `ImportCustomers`→`ImportParties`, bulk-select. Server actions: party CRUD. Test `scripts/parties-test.mjs`.

**Interfaces — Produces:** `<Toolbar actions={{onAdd,onSave,onCancel,onEdit,onDelete,onFind,onPrint,onReport}} state/>`. `createPartyAction`, `updatePartyAction`, `deletePartyAction`, `bulkDeletePartiesAction`, `importPartiesAction`, `listParties()`.

- [ ] **Step 1:** Build `Toolbar` — button row (Add/Save/Cancel/Edit/Delete/Find/Print/Report), disabled states via props, Logimax flat style.
- [ ] **Step 2:** Parties page: dense form (Name, Address→notes, Phone, E-Mail→gstin? keep gstin+phone) + list with bulk-select + Excel import (reuse exceljs). Opening balances fields (pure gold/silver, cash).
- [ ] **Step 3:** Wire actions (reuse bulk-delete pattern; block delete if party has transactions/bookings).
- [ ] **Step 4: Verify** `scripts/parties-test.mjs`: add party, edit, bulk-delete, import xlsx → counts in DB. Expected pass.
- [ ] **Step 5: Commit** `feat(parties): party master in Logimax layout`.

## Task 5: Sales/Purchase entry screen (core)

**Files:** Create `app/(app)/entry/page.tsx` (server: loads parties, operators, current stock, rate), `components/EntryForm.tsx` (client, the grid screen), `lib/queries/transactions.ts`. Server actions in `app/actions.ts`. Test `scripts/entry-test.mjs`.

**Interfaces — Produces:**
- `createTransaction(input)` where input = `{trnType, partyId, metal, txnDate, barRate, refNo, thru, narration, tdsAmount, lines:[{kind,particulars,weight,touch,rate}], movements:[{direction,particulars,weight,touch,aTouch}], settlements:[{mode,direction,amount,bankName}], operatorName}` → server computes pure & amount per line, inserts txn+lines+movements+settlements, returns `{id, serialNo}`.
- `getTransaction(id)`, `updateTransaction(id,input)`, `deleteTransaction(id)`.
- Returned view model `TransactionDetail` (header + lines + movements + settlements + computed totals + closing balances).

- [ ] **Step 1:** `lib/queries/transactions.ts` — createTransaction: for each line compute `pure=pure(w,touch)`, `amount=lineAmount(w,rate)`; for each movement compute pure; insert all in order; stamp created_by=operatorName. Recompute nothing client-trusted.
- [ ] **Step 2:** `EntryForm.tsx` layout (matches screenshot): header row (Party dropdown [searchable, reuse combobox], Trn type toggle Sales/Purchase, Date, No auto, Bar Rate /g, Ref, Thru, OpgPure/OpgCash read-only from party); line grid (Particulars, Weight, Touch, Pure=auto, Rate, Amount=auto, Add-row, Del/Edit, running Total); Metal Receipts/Payments grid (Particulars, Weight, Touch, A.Touch, Pure=auto, Recd/Paid); settlement block (Cash Recd/Paid, Bank Recd/Paid + bank name — split allowed); TDS line (auto from settings.tdsPercent on total, editable); Totals (Pure / Cash) + Closing Balance (Pure & Cash) read-only.
- [ ] **Step 3:** Save via `createTransactionAction` → on success WhatsApp tap-to-send for Sales (message: bar + weight + rate, no purity), then reset/print.
- [ ] **Step 4:** Toolbar wired (Add=new blank, Save, Edit existing via Find, Delete, Print slip, Report→history).
- [ ] **Step 5: Verify** `scripts/entry-test.mjs` (Puppeteer + SQL): create a Sales entry with 2 lines (diff rates) + split cash/bank settlement + TDS; assert DB line amounts = weight×rate, pure = weight×touch/100, settlement rows correct, tds stored; WhatsApp button present. Expected pass.
- [ ] **Step 6: Commit** `feat(entry): Sales/Purchase entry with metal+cash ledger`.

## Task 6: Booking flow (metal or amount) + delivery

**Files:** Create `app/(app)/bookings/page.tsx` (rework), `components/BookingForm.tsx`, `components/DeliverBooking.tsx`, `lib/queries/bookings.ts`. Actions. Test `scripts/booking-test.mjs`.

**Interfaces — Produces:** `createBooking({partyId, metal, bookMode, weightBooked?, lockedRate?, amount?, advancePaid, operatorName})`, `listBookings(filter)`, `deliverBooking(id, {lines w/ touch, settlements})` → creates a Sales transaction, sets booking.status=delivered, links deliveredTxnId. WhatsApp on both.

- [ ] **Step 1:** BookingForm — party, metal, mode toggle (By grams: weight + locked rate/g; By amount: ₹ amount), advance. No touch/purity field. Save → WhatsApp booking confirmation (grams-mode message: "Gold bar, {weight} g @ {rate}/g locked"; amount-mode: "Booking for ₹{amount} received").
- [ ] **Step 2:** Bookings list (Logimax toolbar) with status; each row → Deliver.
- [ ] **Step 3:** DeliverBooking — now enter touch/purity + finalize lines/settlement → `deliverBooking` creates the linked Sales txn → WhatsApp delivered confirmation.
- [ ] **Step 4: Verify** `scripts/booking-test.mjs`: create grams booking + amount booking; deliver the grams one → asserts a sales txn created & linked, booking status delivered, WhatsApp present both times. Expected pass.
- [ ] **Step 5: Commit** `feat(booking): metal/amount booking + delivery→sales`.

## Task 7: Transaction history grid

**Files:** Create `app/(app)/history/page.tsx`, `components/HistoryGrid.tsx`, `lib/queries/history.ts`. Reuse Excel import. Test `scripts/history-test.mjs`.

**Interfaces — Produces:** `listHistory({from,to,trnTypes,search})` → rows with per-txn aggregates: No(serialNo), TrnType, Date, Party, OutwardWg, InwardWg, OutwardPure, InwardPure, MC Cash(O), MC Cash(R), MetalWgRecd/Paid, MetalPureRecd/Paid, CashRecd/Paid, BankRecd/Paid, CreatedBy, CreatedDate, ModifiedBy, ModifiedDt, Total, txnId(for View).

- [ ] **Step 1:** `listHistory` — join transactions + aggregate lines (outward/inward by kind), metal_movements (recd/paid wg+pure), settlements (cash/bank recd/paid); date-range + type filter + party search.
- [ ] **Step 2:** HistoryGrid — From/To date + duration presets (Today/Week/Month), Trn_Type multi-check (Sales/Purchase/Expense/Booking/All), search box, blue-header wide table (horizontal scroll), View→entry, Excel import button (reuse), CSV export (reuse bank pattern → full export).
- [ ] **Step 3: Verify** `scripts/history-test.mjs`: seed txns, filter by date + type, assert row counts & the outward/inward/cash/bank aggregate columns match SQL. Expected pass.
- [ ] **Step 4: Commit** `feat(history): full transaction history grid`.

## Task 8: Stock / availability

**Files:** Create `app/(app)/stock/page.tsx`, `components/StockForm.tsx`, `lib/queries/stock.ts`. Test `scripts/stock-test.mjs`.

**Interfaces — Produces:** `getStock()` → `{openingPureGold, openingPureSilver, openingCash, openingBank, currentPureGold, currentPureSilver, currentCash, currentBank}` (current = opening + Σ movements/settlements across transactions). `updateStockOpening(input)`.

- [ ] **Step 1:** `getStock` computes current balances by summing metal_movements (pure recd−paid per metal) and settlements (cash/bank recd−paid) over all transactions, added to opening.
- [ ] **Step 2:** StockForm — editable opening balances; read-only live current metal (gold/silver pure) + cash + bank; Logimax toolbar.
- [ ] **Step 3: Verify** `scripts/stock-test.mjs`: set opening, record a purchase (metal in) + a sale (metal out, cash in), assert current balances = opening + movements. Expected pass.
- [ ] **Step 4: Commit** `feat(stock): live metal & cash availability`.

## Task 9: Nav shell + dashboard + cleanup + deploy

**Files:** Modify `components/AppShell.tsx` (nav: Today, Entry, Bookings, History, Stock, Parties, Settings), `app/(app)/page.tsx` (dashboard → today's txns + balances snapshot), delete obsolete files, update `app/(app)/settings/*` (add tdsPercent). Full regression + deploy.

- [ ] **Step 1:** Update nav + OperatorSwitch in topbar; remove Privacy button already gone.
- [ ] **Step 2:** Dashboard: today's transactions (by type), live stock snapshot (gold/silver pure, cash, bank), live price strip (keep).
- [ ] **Step 3:** Delete obsolete components/pages listed in File Structure; fix imports; `npm run build` green.
- [ ] **Step 4: Verify** — run all `scripts/*-test.mjs` suites; then `npm run db:seed`; full Puppeteer smoke (login→operator→entry→booking→history→stock).
- [ ] **Step 5: Deploy** `VERCEL_CLI_VERSION=50.22.1 vercel deploy --prod --yes`; verify live; wipe or seed per demo need.
- [ ] **Step 6: Commit** `feat: Logimax Phase 1 — nav, dashboard, cleanup`.

---

## Self-Review notes
- Spec coverage: #1 split payment→Task5 settlements; #2 TDS→Task5+settings; #3 purity-at-delivery→Task6; #4 per-gram→Global+Task2; #5 no locked/market→Task5 (no toggle); #6 WhatsApp text→Task5/6; #7 book metal/amount→Task6; #8/#9 history grid→Task7; #10 stock→Task8; #11 delivery WhatsApp→Task6; #12 Logimax layout→Task4 Toolbar + all screens. All covered.
- Metal model: Pure=Wt×Touch/100 (Task2), amount=Wt×Rate (Task5) — matches confirmed decisions.
- Types consistent: createTransaction input shape used identically in Task5 & referenced by Task6 deliverBooking.
