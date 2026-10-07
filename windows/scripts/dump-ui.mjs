// Saves a PNG of every view in every state it can show, the way the Mac app's NAMAZ_DUMP_UI does,
// by drawing each scene of src/dump on a fixed day and taking a picture of it.
//
//   npm run dump-ui                    pictures go to ./ui-dump
//   npm run dump-ui -- --out some/dir  somewhere else
//   npm run dump-ui -- --url http://localhost:1420   use a dev server that is already running
//   npm run dump-ui -- --channel chrome              use the installed Chrome instead of Playwright's
//   npm run dump-ui -- --only cover                  only scenes whose name contains this
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const option = (name) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : undefined;
};
const out = resolve(option("out") ?? join(root, "ui-dump"));
const only = option("only");
mkdirSync(out, { recursive: true });

let server;
let base = option("url");
if (!base) {
  const port = 1431;
  server = spawn("npx", ["vite", "--port", String(port), "--strictPort"], { cwd: root, stdio: "ignore" });
  base = `http://localhost:${port}`;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base)).ok) break;
    } catch {
      /* not up yet */
    }
    await new Promise((done) => setTimeout(done, 200));
  }
}

const browser = await chromium.launch({ channel: option("channel") });
try {
  const context = await browser.newContext({ deviceScaleFactor: 2, viewport: { width: 1500, height: 960 } });
  const page = await context.newPage();
  page.on("pageerror", (error) => console.error("page error:", error.message));

  await page.goto(`${base}/?w=dump`);
  await page.waitForFunction(() => Array.isArray(window.__scenes));
  const scenes = (await page.evaluate(() => window.__scenes)).filter((name) => !only || name.includes(only));

  for (const name of scenes) {
    await page.goto(`${base}/?w=dump&scene=${name}`);
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 15_000 });
    // Let fonts and the entrance transitions settle.
    await page.waitForTimeout(150);
    await page.locator("#shot").screenshot({ path: join(out, `${name}.png`) });
    console.log(name);
  }
  console.log(`Saved ${scenes.length} pictures to ${out}`);
} finally {
  await browser.close();
  server?.kill();
}
