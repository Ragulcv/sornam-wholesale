// Operator commands, run inside the container:
//   docker exec sornam-backup node cli.mjs run              back up now, wait for it
//   docker exec sornam-backup node cli.mjs list             what is kept
//   docker exec sornam-backup node cli.mjs decrypt <file> <out.dump>
import { loadConfig } from "./config.mjs";
import { buildDestinations } from "./destinations/index.mjs";
import { runBackup } from "./backup.mjs";
import { spawnSync } from "node:child_process";

const cfg = loadConfig();
const [cmd, a, b] = process.argv.slice(2);

if (cmd === "run") {
  const r = await runBackup(cfg, buildDestinations(cfg), "cli");
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.ok ? 0 : 1);
} else if (cmd === "list") {
  for (const d of buildDestinations(cfg)) {
    console.log(`== ${d.name}`);
    for (const kind of ["daily", "monthly"]) for (const f of await d.list(kind)) console.log(`${kind}\t${f.name}\t${f.size}`);
  }
} else if (cmd === "decrypt" && a && b) {
  const r = spawnSync("openssl", ["enc", "-d", "-aes-256-cbc", "-pbkdf2", "-iter", "200000", "-in", a, "-out", b, "-pass", "env:BACKUP_PASSPHRASE"], { stdio: "inherit", env: { ...process.env, BACKUP_PASSPHRASE: cfg.passphrase } });
  process.exit(r.status ?? 1);
} else {
  console.log("usage: node cli.mjs run | list | decrypt <file.dump.enc> <out.dump>");
  process.exit(2);
}
