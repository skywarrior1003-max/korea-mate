/**
 * build-static.mjs — Cross-platform static export build
 * Usage: node scripts/build-static.mjs
 *
 * Sets STATIC_EXPORT=true and runs `next build`.
 * Exits with the child process exit code so npm && chaining works correctly.
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
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

// ── TASK-FIVE-CITY-CORE-FINAL-PRODUCTION-RELEASE-V1: Cloudflare Pages 20,000-file 한도 ──────────────
// Next 16 정적 export 는 라우트마다 index.html + index.txt(RSC) 외에 클라이언트 segment-prefetch 용
// `__next.*` 파일 7개를 더 내보낸다(설정으로 끌 수 없음). /place 5,005 라우트 × 9 = 45,045 파일이 되어
// Cloudflare Pages 의 배포당 20,000 파일 한도를 넘겨 Production 빌드가 실패했다(deployment 23dc4178).
// /place/<id>/ 아래의 `__next.*` segment-prefetch 파일만 제거한다. 페이지 HTML·index.txt(전체 RSC payload)는
// 그대로이므로 직접 접근·SEO·클라이언트 내비게이션은 유지되고, segment 단위 prefetch 만 전체 payload fetch 로
// 대체된다(로컬 Playwright 로 Explore→/place 클라이언트 내비게이션 검증). 다른 라우트는 건드리지 않는다.
const PAGES_FILE_LIMIT = 20_000;

function countFiles(dir) {
  let n = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) n += e.isDirectory() ? countFiles(join(dir, e.name)) : 1;
  return n;
}

function pruneSegmentPrefetch(routeDir) {
  let removed = 0;
  if (!existsSync(routeDir)) return removed;
  for (const id of readdirSync(routeDir)) {
    const dir = join(routeDir, id);
    if (!statSync(dir).isDirectory()) continue;
    for (const e of readdirSync(dir)) {
      if (!e.startsWith("__next.")) continue;
      const p = join(dir, e);
      removed += statSync(p).isDirectory() ? countFiles(p) : 1;
      rmSync(p, { recursive: true, force: true });
    }
  }
  return removed;
}

const before = countFiles("out");
const pruned = pruneSegmentPrefetch(join("out", "place"));
const after = countFiles("out");
console.log(`[build-static] out/ files: ${before} → ${after} (pruned /place segment-prefetch files: ${pruned}; Pages limit ${PAGES_FILE_LIMIT})`);
if (after > PAGES_FILE_LIMIT) {
  console.error(`[build-static] out/ has ${after} files > Cloudflare Pages limit ${PAGES_FILE_LIMIT} — deployment would fail; refusing to continue`);
  process.exit(1);
}

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
