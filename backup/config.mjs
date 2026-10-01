// Everything the service reads from the environment, validated once at start.

function required(name) {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`${name} is not set`);
  return v.trim();
}

/** Neon's pooled host (pgbouncer) is not meant for pg_dump; use the direct one. */
export function directUrl(url) {
  return url.replace(/(ep-[a-z0-9-]+?)-pooler\./, "$1.");
}

export function loadConfig() {
  const [hh, mm] = (process.env.BACKUP_TIME ?? "23:30").split(":").map(Number);
  const passphrase = required("BACKUP_PASSPHRASE");
  if (passphrase.length < 16) throw new Error("BACKUP_PASSPHRASE must be at least 16 characters");
  const apiKey = required("BACKUP_API_KEY");
  if (apiKey.length < 24) throw new Error("BACKUP_API_KEY must be at least 24 characters");
  return {
    databaseUrl: directUrl(required("BACKUP_DATABASE_URL")),
    passphrase,
    apiKey,
    runAt: { hh: hh ?? 23, mm: mm ?? 30 },
    keepDaily: Number(process.env.BACKUP_KEEP_DAILY ?? 30),
    keepMonthly: Number(process.env.BACKUP_KEEP_MONTHLY ?? 12),
    destinations: (process.env.BACKUP_DESTINATIONS ?? "local").split(",").map((s) => s.trim()).filter(Boolean),
    root: process.env.BACKUP_ROOT ?? "/backups",
    port: Number(process.env.PORT ?? 4100),
  };
}

/** Host of the database being backed up, for display only. Never the password. */
export function dbHost(url) {
  return url.match(/@([^/?]+)/)?.[1]?.split(":")[0] ?? "unknown";
}
