// Destination 1: the server's own disk (a Docker volume on the Contabo box).
import { mkdir, copyFile, readdir, rm, stat, rename } from "node:fs/promises";
import path from "node:path";

export function localDestination(root) {
  const dir = (kind) => path.join(root, kind);
  return {
    name: "local",
    /** kind is "daily" or "monthly"; name is the file name. Atomic via rename. */
    async put(kind, name, srcPath) {
      await mkdir(dir(kind), { recursive: true });
      const final = path.join(dir(kind), name);
      const tmp = `${final}.partial`;
      await copyFile(srcPath, tmp);
      await rename(tmp, final);
    },
    async list(kind) {
      await mkdir(dir(kind), { recursive: true });
      const names = (await readdir(dir(kind))).filter((n) => n.endsWith(".dump.enc"));
      const out = [];
      for (const n of names) {
        const s = await stat(path.join(dir(kind), n));
        out.push({ name: n, size: s.size, mtime: s.mtime.toISOString() });
      }
      return out.sort((a, b) => b.name.localeCompare(a.name)); // newest first (names are dated)
    },
    async remove(kind, name) {
      await rm(path.join(dir(kind), name), { force: true });
    },
  };
}
