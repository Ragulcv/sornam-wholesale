# Sornam Wholesale — Design Spec (V1 / POC)

**Date:** 2026-07-04
**Owner:** Lynky AI (Ragul)
**For:** A large bullion wholesale manufacturer + its network (pilot / proof-of-concept)
**Relationship:** Separate product from Sornam AI (the retail Jewellery OS). Shares brand language, not codebase.

## 1. Problem

The client is a bullion (gold/silver bar) wholesaler, not a retailer. Their process is scattered:

- **Bookings** are jotted in Excel. When a customer collects part of an order (books 2,000g, collects 1,000g), the Excel cell is hand-edited — error-prone, no history.
- **Billing** is a separate legacy tool where customer, weight, and live rate are re-typed by hand to print a slip.
- Records are split across **two systems** (Tally for bank transactions; a second tool for cash), so there is no single view of a customer or the day.

They are switching vendors mainly because the incumbent dev team is unresponsive. They want something **fast, clean, extremely easy to use**, that structures the scatter into one place.

## 2. Scope (V1)

In:

1. **Booking register** — log a booking in seconds (fast keypad entry).
2. **Partial-collection tracking** — record collections against a booking; running weight & money balances update automatically. No more hand-editing.
3. **Print slip** — a quick print-preview document (not a formal invoice). GST slip **or** plain slip, selectable per transaction. **No logo, no header text, no footer text** (client wants it confidential/minimal).
4. **Unified ledger** — one place replacing the two old systems; every transaction tagged **Cash / Bank / UPI**, with per-mode totals and filters.
5. **Customer directory** — history and pending balances per customer.
6. **WhatsApp confirmation** — tap-to-send prefilled message on booking (no paid API).
7. **Security** — single shared PIN, auto-logoff on inactivity, lockout after repeated wrong PINs, one-tap privacy/panic screen, encryption at rest.

Explicitly **out of scope (will not build):** any duress-triggered mechanism that selectively hides or destroys the cash ledger to defeat a tax inspection (triggered by wrong PIN, keyword, or otherwise). Refused on principle — it exists to conceal records from authorities. The owner handles that separately, outside this system. What *is* built: a wrong PIN produces a **full lockout** (nobody sees anything until the real PIN is entered) — stronger and legitimate.

Also out (post-POC): buy-back / two-way trade, automatic WhatsApp API send, multi-user roles, silver-beyond-basics, voice entry.

## 3. Tech & architecture

- **Framework:** Next.js (App Router, TypeScript), deployed on **Vercel** — for autoscaling and zero-downtime rolling deploys.
- **Database:** **Neon Postgres** (serverless, autoscaling, branching), accessed over the pooled connection string for high concurrency from serverless functions.
- **ORM:** Drizzle (typed schema + migrations).
- **Styling:** Tailwind CSS. Brand language borrowed from Sornam AI — gold (`#C9A227`) / onyx (`#0E0E10`) / ivory, Cormorant Garamond + Inter. Clean, dense, desk-optimized.
- **Auth/security:** single shared PIN (Argon2/bcrypt hash stored in DB); httpOnly session cookie with short idle timeout; server-enforced lockout counter; encryption at rest via Neon storage encryption plus app-level encryption of sensitive numeric fields.

## 4. Data model (initial)

- **customers** — `id, name, phone, gstin (nullable), notes, created_at`
- **bookings** — `id, customer_id, metal ('gold'|'silver'), purity, weight_booked_g, rate_mode ('locked'|'float'), locked_rate (nullable), rate_unit ('per_10g'|'per_kg'), advance_amount, status ('open'|'partial'|'completed'), notes, created_at`
- **collections** — `id, booking_id, weight_collected_g, rate_applied, payment_mode ('cash'|'bank'|'upi'), amount, slip_type ('gst'|'plain'), bill_no, created_at`
- **settings** — `id, pin_hash, auto_logoff_minutes, failed_attempts, locked_until, gstin, default_gold_rate, default_silver_rate`

Derived: pending weight = `weight_booked_g − Σ weight_collected_g`; money balance tracks advance vs collected amounts. Amount = `weight × rate ÷ unit`.

## 5. Screens

1. **Lock screen** — PIN pad; lockout state; privacy screen reuses this.
2. **Today / Dashboard** — day totals by payment mode, open bookings, quick actions.
3. **New booking** — keypad-first: customer, metal, purity, weight, rate mode + rate, advance → save → WhatsApp tap-to-send.
4. **Booking detail** — booking summary, collection history, "Record collection", pending balance.
5. **Record collection** — weight, rate (auto from mode), payment mode, slip type → generates print slip.
6. **Print slip** — minimal print-preview (GST or plain), no logo/header/footer.
7. **Ledger** — filterable transaction list, per-mode totals.
8. **Customers** — directory + per-customer history.
9. **Settings** — PIN, auto-logoff minutes, GSTIN, default rates.

## 6. Slip fields

Plain slip: `Date · Bill No · Customer · Metal · Purity · Weight (g) · Rate · Amount · Advance · Balance`.
GST slip: adds `GSTIN · HSN · CGST · SGST · Total`. Selectable per transaction. No logo/header/footer.

## 7. Success criteria

- Book → partially collect → print slip → see updated balance, in under a minute, on a real keyboard.
- Two old systems replaced by one filterable ledger with correct per-mode totals.
- Locks itself when idle; wrong PIN locks out; data encrypted at rest.
- Deployed on Vercel + Neon, stable under the manufacturer's network load.
