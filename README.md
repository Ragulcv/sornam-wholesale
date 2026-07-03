# Sornam Wholesale

Bullion wholesale operations — **bookings, partial collections, billing slips, and a unified cash/bank/UPI ledger**, in one clean, fast, desk-optimized app. A separate product from Sornam AI (the retail Jewellery OS).

Built for a pilot with a large bullion manufacturer. Next.js 16 (App Router) · Neon Postgres · Drizzle · Tailwind v4 · Vercel.

## What it does (V1)

- **Booking register** — log a bullion booking in seconds (gold/silver, purity, weight, rate locked-now or float-at-collection, advance).
- **Partial collections** — record each collection against a booking; weight & money balances update automatically. No more editing Excel cells.
- **Print slip** — a minimal quick-print document (GST *or* plain, chosen per transaction). No logo, no header/footer — intentionally confidential.
- **Unified ledger** — every collection in one place, tagged Cash / Bank / UPI, with per-mode totals and filters. Replaces the two old systems.
- **Customers** — directory with pending balances and history.
- **WhatsApp** — one-tap prefilled confirmation message on booking (no paid API).
- **Security** — single shared PIN, auto-logoff when idle, lockout after repeated wrong PINs, one-tap privacy/panic screen, encryption at rest. A wrong PIN produces a **full lockout** — nobody sees anything until the real PIN is entered.

## Setup

1. **Database** — create a Neon Postgres project and copy the **pooled** connection string (host contains `-pooler`).
2. **Env** — copy `.env.example` to `.env.local` and fill in:
   - `DATABASE_URL` — the Neon pooled string.
   - `SESSION_SECRET` — a random 32+ char string.
3. **Schema** — `npm run db:push` (creates the tables).
4. **Demo data** — `npm run db:seed` (optional; demo PIN is `1234`).
5. **Run** — `npm run dev`, open http://localhost:3000. First run asks you to create a shop PIN (unless seeded).

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Local dev server |
| `npm run build` | Production build |
| `npm run db:generate` | Regenerate migration SQL after a schema change |
| `npm run db:push` | Apply the schema to the database |
| `npm run db:seed` | Load demo tenant + data (PIN `1234`) |

## Deploy

Deploys to Vercel. Set `DATABASE_URL` and `SESSION_SECRET` as Vercel environment variables; the Neon integration can provision and inject `DATABASE_URL` automatically.

## Not included (by design)

Any mechanism to selectively hide or destroy records to defeat a tax inspection is **not** part of this system. Security here protects against theft, hacking, and bystanders — not auditors.
