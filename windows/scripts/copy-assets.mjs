// The adhan lives once, in ../Resources, shared with the Mac app. This puts a copy where the web
// build can serve it. The copy is not committed.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
mkdirSync(join(root, "public"), { recursive: true });
copyFileSync(join(root, "..", "Resources", "Adhan.m4a"), join(root, "public", "Adhan.m4a"));
