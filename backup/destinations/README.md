# Adding a backup destination

A destination is an object with four members:

```js
{
  name: "s3",                                   // shown in the status card
  async put(kind, name, srcPath) {},            // kind = "daily" | "monthly"
  async list(kind) { return [{ name, size, mtime }] }, // newest first
  async remove(kind, name) {},
}
```

1. Write it in this folder (e.g. `s3.mjs`), reading its credentials from env.
2. Register it in `index.mjs`.
3. Set `BACKUP_DESTINATIONS=local,s3` in `.env` and `docker compose up -d --build`.

Files arrive already encrypted, so a destination never needs the passphrase.
A failure in one destination is reported in the status but does not stop the
others from receiving the file.
