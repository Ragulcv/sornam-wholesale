// Starts `next dev` against the STAGING database.
// Sourcing .env.staging from zsh breaks on the & in the connection string and
// silently falls back to .env.local (production), so the env is loaded here and
// passed explicitly to the child process.
import { config } from "dotenv";
import { spawn } from "node:child_process";

const parsed = config({ path: ".env.staging", override: true }).parsed ?? {};
const host = (parsed.DATABASE_URL ?? "").match(/ep-[a-z0-9-]+/)?.[0] ?? "unknown";
if (!host.startsWith("ep-aged-wave")) {
  console.error(`Refusing to start: .env.staging points at ${host}, not the staging branch.`);
  process.exit(1);
}
console.log(`dev server → staging DB (${host}) on port ${process.env.PORT ?? 3941}`);
spawn("npx", ["next", "dev"], {
  stdio: "inherit",
  env: { ...process.env, ...parsed, PORT: process.env.PORT ?? "3941" },
});
