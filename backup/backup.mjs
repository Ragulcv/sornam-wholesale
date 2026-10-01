// One backup run: dump -> verify -> encrypt -> ship to every destination ->
// prune -> record. Each step must pass before the next one starts; a backup is
// only ever reported OK once it has been proven restorable.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, rm, stat, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";

const KEY_TABLES = ["transactions", "transaction_lines", "settlements", "parties", "bookings", "stock"];

function run(cmd, args, env = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { env: { ...process.env, ...env } });
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", reject);
    p.on("close", (code) =>
      code === 0 ? resolve(out) : reject(new Error(`${cmd} exited ${code}: ${err.trim().slice(0, 400)}`)),
    );
  });
}

function sha256(file) {
  return new Promise((resolve, reject) => {
    const h = createHash("sha256");
    createReadStream(file).on("data", (d) => h.update(d)).on("end", () => resolve(h.digest("hex"))).on("error", reject);
  });
}

/** Local calendar date in the container's TZ (Asia/Kolkata). */
export function localDate(d = new Date()) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: process.env.TZ || "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const g = (t) => p.find((x) => x.type === t).value;
  return `${g("year")}-${g("month")}-${g("day")}`;
}

// ---- status file -----------------------------------------------------------

export async function readStatus(root) {
  try {
    return JSON.parse(await readFile(path.join(root, "status.json"), "utf8"));
  } catch {
    return { lastRun: null, lastSuccess: null, history: [] };
  }
}

async function writeStatus(root, status) {
  const f = path.join(root, "status.json");
  await writeFile(`${f}.tmp`, JSON.stringify(status, null, 2));
  await rename(`${f}.tmp`, f);
}

// ---- the run ---------------------------------------------------------------

export async function runBackup(cfg, destinations, trigger = "schedule") {
  const startedAt = new Date();
  const day = localDate(startedAt);
  const work = path.join(cfg.root, "work");
  const dumpFile = path.join(work, `sornam-${day}.dump`);
  const encFile = `${dumpFile}.enc`;
  const result = {
    trigger, day,
    startedAt: startedAt.toISOString(),
    finishedAt: null, ok: false, error: null,
    sizeBytes: 0, sha256: null, tocEntries: 0, rowCounts: {},
    destinations: {},
  };

  try {
    await mkdir(work, { recursive: true });
    // 1. dump — custom format so a single table can be restored on its own
    await run("pg_dump", ["--format=custom", "--no-owner", "--no-privileges", "--compress=6", `--file=${dumpFile}`, cfg.databaseUrl]);

    // 2. verify — the archive must list, and must contain the data that matters
    const toc = await run("pg_restore", ["--list", dumpFile]);
    result.tocEntries = toc.split("\n").filter((l) => l.trim() && !l.startsWith(";")).length;
    const missing = KEY_TABLES.filter((t) => !new RegExp(`TABLE DATA public ${t} `).test(toc));
    if (missing.length) throw new Error(`dump is missing table data for: ${missing.join(", ")}`);

    // row counts, so the status card shows real business data was captured
    const counts = await run("psql", [cfg.databaseUrl, "-At", "-F", "\t", "-c",
      KEY_TABLES.map((t) => `select '${t}', count(*) from public.${t}`).join(" union all ")]);
    for (const line of counts.trim().split("\n")) {
      const [t, n] = line.split("\t");
      if (t) result.rowCounts[t] = Number(n);
    }

    // 3. encrypt — plain openssl so the file can be opened without this code
    await run("openssl", ["enc", "-aes-256-cbc", "-pbkdf2", "-iter", "200000", "-salt",
      "-in", dumpFile, "-out", encFile, "-pass", "env:BACKUP_PASSPHRASE"],
      { BACKUP_PASSPHRASE: cfg.passphrase });

    // 4. prove the encrypted file decrypts back to a readable archive
    const check = `${dumpFile}.check`;
    await run("openssl", ["enc", "-d", "-aes-256-cbc", "-pbkdf2", "-iter", "200000",
      "-in", encFile, "-out", check, "-pass", "env:BACKUP_PASSPHRASE"],
      { BACKUP_PASSPHRASE: cfg.passphrase });
    await run("pg_restore", ["--list", check]);
    await rm(check, { force: true });

    result.sizeBytes = (await stat(encFile)).size;
    result.sha256 = await sha256(encFile);

    // 5. ship to every destination; one failing does not stop the others
    const dailyName = `sornam-${day}.dump.enc`;
    const monthName = `sornam-${day.slice(0, 7)}.dump.enc`;
    for (const d of destinations) {
      try {
        await d.put("daily", dailyName, encFile);
        // the first good backup of each month is kept as that month's copy
        const monthly = await d.list("monthly");
        if (!monthly.some((m) => m.name === monthName)) await d.put("monthly", monthName, encFile);
        // 6. retention
        const daily = await d.list("daily");
        for (const old of daily.slice(cfg.keepDaily)) await d.remove("daily", old.name);
        const months = await d.list("monthly");
        for (const old of months.slice(cfg.keepMonthly)) await d.remove("monthly", old.name);
        result.destinations[d.name] = { ok: true, daily: Math.min(daily.length, cfg.keepDaily), monthly: Math.min(months.length, cfg.keepMonthly) };
      } catch (e) {
        result.destinations[d.name] = { ok: false, error: String(e.message ?? e).slice(0, 300) };
      }
    }
    const shipped = Object.values(result.destinations).filter((x) => x.ok).length;
    if (shipped === 0) throw new Error("no destination accepted the backup");
    result.ok = true;
  } catch (e) {
    // never echo the connection string back into the status
    result.error = String(e.message ?? e).replaceAll(cfg.databaseUrl, "<database>").slice(0, 500);
  } finally {
    await rm(dumpFile, { force: true });
    await rm(encFile, { force: true });
    result.finishedAt = new Date().toISOString();
    try {
      const status = await readStatus(cfg.root);
      status.lastRun = result;
      if (result.ok) status.lastSuccess = result;
      status.history = [result, ...(status.history ?? [])].slice(0, 20);
      await writeStatus(cfg.root, status);
    } catch (e) {
      // the disk itself is the problem; the server keeps this result in memory
      // so the Settings card still shows the failure instead of "never run"
      result.ok = false;
      result.error = result.error ?? `could not write status: ${String(e.message ?? e).slice(0, 200)}`;
    }
  }
  return result;
}
