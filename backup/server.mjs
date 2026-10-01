// Runs the nightly backup and answers the Wholesale app's Settings card.
//   GET  /health   no auth, for uptime checks
//   GET  /status   Bearer BACKUP_API_KEY
//   POST /run      Bearer BACKUP_API_KEY  ("Back up now")
import http from "node:http";
import { timingSafeEqual } from "node:crypto";
import { loadConfig, dbHost } from "./config.mjs";
import { buildDestinations } from "./destinations/index.mjs";
import { runBackup, readStatus, localDate } from "./backup.mjs";

const cfg = loadConfig();
const destinations = buildDestinations(cfg);
let running = null; // the in-flight run's promise
let lastManualAt = 0;
let memLast = null; // last result, kept even if the status file cannot be written
const MANUAL_COOLDOWN_MS = 60_000;

function start(trigger) {
  if (running) return false;
  running = runBackup(cfg, destinations, trigger)
    .then((r) => { memLast = r; return r; })
    .then((r) => console.log(`[backup] ${trigger} ${r.ok ? "OK" : "FAILED"} ${r.day} ${r.sizeBytes}B ${r.error ?? ""}`))
    .catch((e) => {
      memLast = { trigger, day: localDate(), ok: false, error: String(e.message ?? e).slice(0, 300), startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), sizeBytes: 0 };
      console.error("[backup] crashed", e);
    })
    .finally(() => { running = null; });
  return true;
}

// ---- scheduler: check once a minute ----------------------------------------
// Runs at BACKUP_TIME local, and catches up if the server was down then: any
// time today is past the run time and today has no good backup, it runs.
function minutesNow() {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: process.env.TZ || "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  return Number(p.find((x) => x.type === "hour").value) * 60 + Number(p.find((x) => x.type === "minute").value);
}
async function tick() {
  if (running) return;
  const due = minutesNow() >= cfg.runAt.hh * 60 + cfg.runAt.mm;
  if (!due) return;
  const st = await readStatus(cfg.root);
  if (memLast && (!st.lastRun || memLast.startedAt > st.lastRun.startedAt)) st.lastRun = memLast;
  if (st.lastSuccess?.day === localDate()) return;
  // do not hammer a failing database: after a failure today, retry hourly
  if (st.lastRun && !st.lastRun.ok && st.lastRun.day === localDate() &&
      Date.now() - new Date(st.lastRun.finishedAt).getTime() < 60 * 60_000) return;
  start("schedule");
}
setInterval(() => tick().catch((e) => console.error("[tick]", e)), 60_000);
setTimeout(() => tick().catch(() => {}), 5_000);

// ---- http ------------------------------------------------------------------
function authed(req) {
  const got = Buffer.from((req.headers.authorization ?? "").replace(/^Bearer /, ""));
  const want = Buffer.from(cfg.apiKey);
  return got.length === want.length && timingSafeEqual(got, want);
}
function send(res, code, body) {
  res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://x");
    if (url.pathname === "/health") return send(res, 200, { ok: true });
    if (!authed(req)) return send(res, 401, { error: "unauthorized" });

    if (req.method === "GET" && url.pathname === "/status") {
      const st = await readStatus(cfg.root);
      // a newer in-memory result wins (the status file may be the thing failing)
      if (memLast && (!st.lastRun || memLast.startedAt > st.lastRun.startedAt)) st.lastRun = memLast;
      const kept = {};
      for (const d of destinations) {
        try { kept[d.name] = { daily: (await d.list("daily")).length, monthly: (await d.list("monthly")).length }; }
        catch (e) { kept[d.name] = { error: String(e.message ?? e) }; }
      }
      return send(res, 200, {
        running: !!running,
        schedule: `${String(cfg.runAt.hh).padStart(2, "0")}:${String(cfg.runAt.mm).padStart(2, "0")} IST daily`,
        retention: { daily: cfg.keepDaily, monthly: cfg.keepMonthly },
        database: dbHost(cfg.databaseUrl),
        destinations: destinations.map((d) => d.name),
        kept,
        lastRun: st.lastRun,
        lastSuccess: st.lastSuccess,
        history: (st.history ?? []).slice(0, 10).map(({ day, trigger, ok, sizeBytes, startedAt, error }) => ({ day, trigger, ok, sizeBytes, startedAt, error })),
      });
    }

    if (req.method === "POST" && url.pathname === "/run") {
      if (running) return send(res, 409, { error: "A backup is already running." });
      if (Date.now() - lastManualAt < MANUAL_COOLDOWN_MS) return send(res, 429, { error: "Please wait a minute before running another backup." });
      lastManualAt = Date.now();
      start("manual");
      return send(res, 202, { started: true });
    }
    return send(res, 404, { error: "not found" });
  } catch (e) {
    return send(res, 500, { error: "internal error" });
  }
}).listen(cfg.port, () => {
  console.log(`[backup] listening on ${cfg.port}; db ${dbHost(cfg.databaseUrl)}; daily at ${cfg.runAt.hh}:${String(cfg.runAt.mm).padStart(2, "0")} ${process.env.TZ}; destinations ${destinations.map((d) => d.name).join(",")}`);
});
