// The version lives once, in Resources/Info.plist (CFBundleShortVersionString), the file the Mac
// release steps already change. This copies it to where Windows tooling looks for it.
//
//   npm run sync-version     write it
//   npm run check-version    fail if any copy is out of step (CI runs this)
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const plist = readFileSync(join(root, "..", "Resources", "Info.plist"), "utf8");
const version = plist.match(/<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/)?.[1];
if (!version) throw new Error("Could not find CFBundleShortVersionString in Resources/Info.plist");

// Each pattern captures what comes before the version, the version, and what comes after.
const targets = [
  { file: "package.json", pattern: /("version":\s*")([^"]+)(")/ },
  { file: "src-tauri/tauri.conf.json", pattern: /("version":\s*")([^"]+)(")/ },
  { file: "src-tauri/Cargo.toml", pattern: /^(version\s*=\s*")([^"]+)(")/m },
];

const check = process.argv.includes("--check");
let stale = false;
for (const { file, pattern } of targets) {
  const path = join(root, file);
  const text = readFileSync(path, "utf8");
  const found = text.match(pattern)?.[2];
  if (found === undefined) throw new Error(`No version found in ${file}`);
  if (found === version) continue;
  if (check) {
    console.error(`${file} says ${found}, but Resources/Info.plist says ${version}. Run: npm run sync-version`);
    stale = true;
  } else {
    writeFileSync(path, text.replace(pattern, `$1${version}$3`));
    console.log(`${file}: ${found} -> ${version}`);
  }
}
if (stale) process.exit(1);
if (check) console.log(`Versions agree: ${version}`);
