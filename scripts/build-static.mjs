/**
 * build-static.mjs — Cross-platform static export build
 * Usage: node scripts/build-static.mjs
 *
 * Sets STATIC_EXPORT=true and runs `next build`.
 * Exits with the child process exit code so npm && chaining works correctly.
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

process.env.STATIC_EXPORT = "true";

const result = spawnSync("npx", ["next", "build"], {
  stdio: "inherit",
  shell: true,
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

if ((result.status ?? 1) !== 0) process.exit(result.status ?? 1);

// ── TASK-OG-FALLBACK-404-FIX-01: OG 이미지 .png 별칭 생성 ─────────────────────
// Next 정적 export 는 opengraph-image.tsx 를 **확장자 없는** 파일로 내보낸다
// (out/opengraph-image, out/og/<city>/opengraph-image). 그런데 수동 metadata
// (layout.tsx·도시 페이지·blog)와 functions/shared/[id].ts 의 FALLBACK_OG 는
// `/…/opengraph-image.png` 를 참조해 Production 에서 404 가 났다.
// 실제 산출물은 진짜 PNG 이므로, 같은 bytes 를 .png 이름으로 복사해
// 두 경로 모두에서 서빙한다. 참조 URL·metadata 계약은 바꾸지 않는다.
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function aliasOgPng(src) {
  if (!existsSync(src)) {
    console.error(`[build-static] OG image missing: ${src} — Next 출력 규약이 바뀌었는지 확인 필요`);
    process.exit(1);
  }
  const head = readFileSync(src).subarray(0, 8);
  if (!head.equals(PNG_SIG)) {
    console.error(`[build-static] OG image is not a PNG: ${src} — .png 별칭을 만들 수 없다`);
    process.exit(1);
  }
  copyFileSync(src, `${src}.png`);
}

aliasOgPng(join("out", "opengraph-image"));

const ogDir = join("out", "og");
const cities = existsSync(ogDir)
  ? readdirSync(ogDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
  : [];
for (const city of cities) {
  aliasOgPng(join(ogDir, city, "opengraph-image"));
}
console.log(`[build-static] OG .png aliases created: root + ${cities.length} cities (${cities.join(", ")})`);

process.exit(0);
