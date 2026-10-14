// The adhan lives once, in ../Resources, shared with the Mac app. This puts a copy where the web
// build can serve it. The copy is not committed.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
mkdirSync(join(root, "public"), { recursive: true });
copyFileSync(join(root, "..", "Resources", "Adhan.m4a"), join(root, "public", "Adhan.m4a"));

// An Ogg Opus copy, for web views without an AAC decoder (WebKitGTK on Linux). Made from the
// .m4a by hand (ffmpeg -i Resources/Adhan.m4a -c:a libopus Resources/Adhan.ogg), so optional here.
const ogg = join(root, "..", "Resources", "Adhan.ogg");
if (existsSync(ogg)) {
  copyFileSync(ogg, join(root, "public", "Adhan.ogg"));
} else if (process.env.CI) {
  console.error("Resources/Adhan.ogg is missing; Linux needs it to play the adhan. Make it with:");
  console.error("  ffmpeg -i Resources/Adhan.m4a -c:a libopus Resources/Adhan.ogg");
  process.exit(1);
}
