// design-only renderer: 각 보드 HTML 의 [data-name] 아트보드를 PNG 로 캡처한다. runtime 무관.
import { createRequire } from "node:module"; const { chromium } = createRequire(process.cwd() + "/package.json")("playwright");
import { mkdirSync } from "node:fs"; import path from "node:path";
const DIR = "docs/design/home-continuous-flow-v1"; const OUT = path.join(DIR, "shots"); mkdirSync(OUT, { recursive: true });
const boards = ["directions", "mobile-flow", "desktop-flow", "storyboards", "search-states", "l10n-board"];
const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1560, height: 1200 }, deviceScaleFactor: 2 });
for (const b of boards) {
  const url = "file:///" + path.resolve(DIR, "proto", b + ".html").split(path.sep).join("/");
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  const shots = await page.$$("[data-name]");
  for (const el of shots) { const name = await el.getAttribute("data-name"); await el.screenshot({ path: path.join(OUT, `${b}--${name}.png`) }); }
  console.log(b, shots.length, "shots");
}
await browser.close(); console.log("done");
