import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

// Fall back to a dummy URL so module import never throws during build
// (dynamic pages don't run queries at build time). Real queries fail loudly
// at request time if DATABASE_URL is missing.
const connectionString =
  process.env.DATABASE_URL ?? "postgresql://build:build@localhost:5432/build";

// Neon's stateless HTTP driver — ideal for Vercel serverless functions:
// no connection to keep warm, scales to zero, and autoscales under load.
const sql = neon(connectionString);

export const db = drizzle(sql, { schema });
export { schema };
