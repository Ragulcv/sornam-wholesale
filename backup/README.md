# Sornam Wholesale: nightly backup

Backs up the **production** database every night at 23:30 IST, encrypted,
to the Contabo server. Keeps 30 daily and 12 monthly copies. Status shows in
the app under **Settings → Daily backup**. No download from the app, no alerts.

Each run: `pg_dump` (v18, matches Neon) → `pg_restore --list` must show every
business table → encrypt (AES-256, plain `openssl`) → decrypt it again and
re-check → copy to each destination → prune → write status. A run is only
reported OK after the decrypted copy has been proven readable.

## Deploy on the Contabo box (167.86.87.188)

1. Copy this `backup/` folder to `/opt/sornam-backup/`.
2. `cp .env.example .env` and fill it in:
   - `BACKUP_DATABASE_URL`: the **production** Neon URL (host `ep-dark-silence`).
   - `BACKUP_PASSPHRASE`: long random string. **Also store it outside this
     server** (password manager). Lose it and every backup is unreadable.
   - `BACKUP_API_KEY`: long random string, also set in Vercel (below).
3. `docker compose up -d --build`
4. Caddy, alongside the price feed block in `/etc/caddy/Caddyfile`
   (back the file up first):
   ```
   backup.167.86.87.188.sslip.io {
       reverse_proxy localhost:4100
   }
   ```
   then `systemctl reload caddy`.
5. Vercel, **production** project `sornam-wholesale`:
   `BACKUP_API_ORIGIN=https://backup.167.86.87.188.sslip.io` and
   `BACKUP_API_KEY=<same key>`, then redeploy.
6. Settings → Daily backup → **Back up now**. It should read "Backed up".

## Restore (the part to practise before you need it)

```bash
# 1. pick a file
docker exec sornam-backup node cli.mjs list
# 2. decrypt it (plain openssl works too, without this code:
#    openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in X.dump.enc -out X.dump)
docker exec sornam-backup node cli.mjs decrypt /backups/daily/sornam-2026-10-01.dump.enc /backups/work/restore.dump
# 3. restore into a NEW Neon branch first, never straight over production
docker exec sornam-backup pg_restore --no-owner --no-privileges -d "<new-branch-url>" /backups/work/restore.dump
```

Point the app at the new branch only after checking it.

## Operating

- Logs: `docker logs sornam-backup`
- Back up now from the box: `docker exec sornam-backup node cli.mjs run`
- If the server is down at 23:30 it catches up the same day once it is back;
  after a failure it retries hourly until midnight.
- Second destination: see `destinations/README.md`.
