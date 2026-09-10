import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Staging only (Neon branch ep-aged-wave). Prod pushes still go through
// drizzle.config.ts and need an explicit confirmation.
config({ path: ".env.staging" });

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
  strict: false,
  verbose: false,
});
