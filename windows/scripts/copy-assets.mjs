// The adhan lives once, in ../Resources, shared with the Mac app. This puts a copy where the web
// build can serve it. The copy is not committed.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
mkdirSync(join(root, "public"), { recursive: true });
copyFileSync(join(root, "..", "Resources", "Adhan.m4a"), join(root, "public", "Adhan.m4a"));

// An Ogg Opus copy, for WebKitGTK on Linux when it has no AAC decoder. Only Linux builds carry it:
// the other web views play the .m4a, and it would add 2.4 MB to their installers for nothing.
// Made from the .m4a by hand (see AGENTS.md), so optional here outside CI.
const ogg = join(root, "..", "Resources", "Adhan.ogg");
if (process.platform !== "linux") {
  // Nothing to copy.
} else if (existsSync(ogg)) {
  copyFileSync(ogg, join(root, "public", "Adhan.ogg"));
} else if (process.env.CI) {
  console.error("Resources/Adhan.ogg is missing; Linux needs it to play the adhan. Make it with:");
  console.error("  ffmpeg -i Resources/Adhan.m4a -c:a libopus -b:a 96k Resources/Adhan.ogg");
  process.exit(1);
}
