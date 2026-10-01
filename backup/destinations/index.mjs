// Registry of backup destinations. Every destination gets the same encrypted
// file and applies the same retention, so adding the second one later is one
// new file here plus a name in BACKUP_DESTINATIONS. See README.md.
import { localDestination } from "./local.mjs";

export function buildDestinations(cfg) {
  return cfg.destinations.map((name) => {
    switch (name) {
      case "local":
        return localDestination(cfg.root);
      default:
        throw new Error(`Unknown backup destination "${name}". Known: local`);
    }
  });
}
