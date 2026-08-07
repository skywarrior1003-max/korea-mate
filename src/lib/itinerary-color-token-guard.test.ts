// 일정 화면 색상 토큰 계약 고정.
//
// src/app/itinerary/page.tsx 는 저장소에서 마지막까지 raw hex 로 남아 있던
// 화면이었다. 값이 정확히 같은 6종만 토큰으로 옮겼고, 나머지는 이유가 있어
// 남겼다. 그 "이유"를 코드로 붙들지 않으면 다음 사람이 둘을 구분하지 못한다.
//
// 이 파일이 막는 것은 두 방향이다.
//   ① 옮긴 6종이 raw hex 로 되돌아오는 것
//   ② 남긴 색이 조용히 사라지거나 늘어나는 것 (allowlist 와 실제가 어긋남)
//
// 특히 #FF4A2D 는 --gkm-accent-coral 이지 --gkm-action-primary 가 아니다.
// action primary 는 #0041c8(파랑)이다. 이 화면이 코랄을 주요 행동색처럼 쓰는
// 것은 별도 제품 결정 사안이고, 이번 작업은 색을 바꾸지 않았다.

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8");

const PAGE   = read("src", "app", "itinerary", "page.tsx");
const GLOBAL = read("src", "app", "globals.css");

/** 블록 주석을 먼저 떼고 줄 주석을 뗀다 — 순서가 바뀌면 파일 본문을 삼킨다 */
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "")
   .split("\n").filter(l => !l.trimStart().startsWith("//")).join("\n");

const BODY = strip(PAGE);

/** 토큰으로 옮긴 색 — 값이 정확히 같아서 화면이 변하지 않는 것만 골랐다 */
const MIGRATED: Record<string, { cls: string; cssVar: string; value: string }> = {
  "191C21": { cls: "ink",          cssVar: "--gkm-ink",          value: "#191C21" },
  "565D66": { cls: "sub",          cssVar: "--gkm-text-sub",     value: "#565D66" },
  "E5E7EA": { cls: "line",         cssVar: "--gkm-line",         value: "#E5E7EA" },
  "F6F7F8": { cls: "surface-dim",  cssVar: "--gkm-surface-dim",  value: "#F6F7F8" },
  "8A919B": { cls: "faint",        cssVar: "--gkm-text-faint",   value: "#8A919B" },
  "FF4A2D": { cls: "accent-coral", cssVar: "--gkm-accent-coral", value: "#FF4A2D" },
};

/**
 * 남긴 raw color — 값·개수·이유를 여기에 못 박는다.
 * 개수가 어긋나면 실패한다. 색을 새로 들이거나 조용히 지우는 것 둘 다 잡힌다.
 */
const ALLOW: Record<string, { n: number; kind: string; why: string }> = {
  "#7C3AED": { n: 4, kind: "map/data + external", why: "museum 카테고리 색 · 보라 그라디언트. Viator 카드는 S2-B2 에서 제거됐다" },
  "#1A1F36": { n: 4, kind: "map/data + ui",       why: "카테고리 기본색 · 어두운 패널. --gkm-ink(#191C21)와 값이 다르다" },
  "#FF4A2D": { n: 2, kind: "concat/gradient",     why: "그라디언트 문자열 2. 제휴 카드 색은 S2-B2 에서 카드와 함께 제거됐다" },
  "#D93317": { n: 3, kind: "gradient pair",       why: "코랄 그라디언트의 짝. accent-coral-hover 토큰이 없다" },
  "#16A34A": { n: 2, kind: "map/data + external", why: "nature 카테고리 색 · compact 토글. --gkm-status-ok(#1D9A6C)와 값이 다르다" },
  "#003580": { n: 1, kind: "external brand",      why: "Booking.com 브랜드색 — 죽은 커머스 블록에만 남았다" },
  "#D97706": { n: 1, kind: "map/data + external", why: "cafe 카테고리 색. Michelin 카드는 S2-B2 에서 제거됐다" },
  "#1A1A2E": { n: 2, kind: "ui",                  why: "어두운 히어로 패널. 대응 토큰 없음" },
  "#FFFFFF": { n: 1, kind: "plain",               why: "평범한 흰색. 이 파일은 다른 곳에서 text-white/bg-white 를 쓴다" },
  "#FFF":    { n: 1, kind: "plain",               why: "위와 같음(3자리 표기)" },
  "#FFF1EC": { n: 1, kind: "near-token",          why: "--gkm-accent-coral-tint 는 #FFF0EC 로 G 채널이 1 다르다. 바꾸면 색이 변한다" },
  "#B33A22": { n: 1, kind: "ui",                  why: "코랄 계열 짙은 글자색. 대응 토큰 없음" },
  "#FEF9C3": { n: 1, kind: "ui status",           why: "노랑 경고 배경. --gkm-status-warn-tint(#FDF3E0)와 값이 다르다" },
  "#FDE047": { n: 1, kind: "ui status",           why: "노랑 경고 테두리. 대응 토큰 없음" },
  "#854D0E": { n: 1, kind: "ui status",           why: "노랑 경고 글자. --gkm-status-warn(#B97A12)과 값이 다르다" },
  "#F3F4F6": { n: 1, kind: "ui",                  why: "비활성 토글 배경. --gkm-surface-dim(#F6F7F8)과 값이 다르다" },
  "#374151": { n: 1, kind: "ui",                  why: "비활성 토글 글자. --gkm-text-sub(#565D66)와 값이 다르다" },
  "#F3EEE3": { n: 1, kind: "ui",                  why: "베이지 배경. 대응 토큰 없음" },
  "#DC2626": { n: 1, kind: "map/data",            why: "market 카테고리 색. --gkm-status-error(#D23B2E)와 값이 다르다" },
  "#DB2777": { n: 1, kind: "map/data",            why: "shopping 카테고리 색" },
  "#9333EA": { n: 1, kind: "map/data",            why: "k-pop 카테고리 색" },
  "#6D28D9": { n: 1, kind: "gradient pair",       why: "보라 그라디언트의 짝" },
  "#22C55E": { n: 1, kind: "ui",                  why: "상태 점. --gkm-status-ok(#1D9A6C)와 값이 다르다" },
  "#131B2E": { n: 1, kind: "ui",                  why: "짙은 제목 글자. --gkm-ink(#191C21)와 값이 다르다" },
};

const found = (PAGE.match(/#[0-9A-Fa-f]{3,8}/g) ?? []).map(h => h.toUpperCase());
const tally: Record<string, number> = {};
for (const h of found) tally[h] = (tally[h] ?? 0) + 1;

// ── 1·4. 옮긴 6종은 지정된 자리 밖에서 raw hex 로 돌아오지 않는다 ────────────
test("★토큰으로 옮긴 6종이 일반 UI raw hex 로 되살아나지 않았다", () => {
  for (const [hex, m] of Object.entries(MIGRATED)) {
    const allowed = ALLOW["#" + hex]?.n ?? 0;
    assert.equal(tally["#" + hex] ?? 0, allowed,
      `#${hex} 는 ${m.cls} 토큰으로 옮겼다. allowlist 허용 ${allowed}건을 넘었다`);
  }
});

test("★옮긴 6종이 Tailwind 임의값 클래스로 남아 있지 않다", () => {
  for (const hex of Object.keys(MIGRATED)) {
    assert.doesNotMatch(PAGE, new RegExp(`[a-z]-\\[#${hex}\\]`, "i"), `#${hex} 임의값 클래스`);
  }
});

test("★토큰 클래스가 실제로 쓰이고 있다 — 치환이 사라지지 않았다", () => {
  for (const [, m] of Object.entries(MIGRATED)) {
    assert.match(BODY, new RegExp(`-${m.cls}\\b`), `${m.cls} 클래스 미사용`);
  }
  assert.match(BODY, /var\(--gkm-ink\)/);
  assert.match(BODY, /var\(--gkm-accent-coral\)/);
});

// ── 2·3. allowlist 가 실제와 정확히 일치한다 ─────────────────────────────────
test("★남은 raw color 가 allowlist 와 정확히 일치한다 — 몰래 늘거나 줄지 않았다", () => {
  const extra = Object.keys(tally).filter(h => !ALLOW[h]);
  assert.deepEqual(extra, [], "allowlist 에 없는 색: " + extra.join(","));
  for (const [hex, spec] of Object.entries(ALLOW)) {
    assert.equal(tally[hex] ?? 0, spec.n, `${hex} 개수`);
  }
});

test("★allowlist 의 모든 항목에 분류와 이유가 적혀 있다", () => {
  for (const [hex, spec] of Object.entries(ALLOW)) {
    assert.ok(spec.kind.length >= 2, hex + " 분류 없음");
    assert.ok(spec.why.length > 8, hex + " 이유 없음");
  }
});

test("★#FF4A2D 를 action primary 로 착각하지 않는다 — action 은 파랑이다", () => {
  assert.match(GLOBAL, /--gkm-action-primary:\s*#0041c8/i);
  assert.match(GLOBAL, /--gkm-accent-coral:\s*#FF4A2D/i);
  // 이 화면은 coral 을 accent 토큰으로만 쓴다. action 토큰으로 바꾸면 색이 변한다.
  assert.doesNotMatch(BODY, /\b(bg|text|border|from|to)-action\b/);
});

// ── 옮긴 값이 토큰 값과 정확히 같다 ──────────────────────────────────────────
test("★토큰 정의값이 옮기기 전 hex 와 정확히 같다 — 색이 변하면 치환이 아니다", () => {
  for (const [, m] of Object.entries(MIGRATED)) {
    assert.match(GLOBAL, new RegExp(`${m.cssVar}:\\s*${m.value}\\s*;`, "i"), m.cssVar);
  }
});

// ── 5·6. 새 토큰·변수를 만들지 않았다 ────────────────────────────────────────
test("★신규 CSS variable·토큰을 만들지 않았다", () => {
  const vars = (GLOBAL.match(/--gkm-[a-z0-9-]+:/g) ?? []).length;
  assert.equal(vars, 46, "globals.css 의 --gkm-* 정의 수가 달라졌다");
  const colors = (GLOBAL.match(/--color-[a-z0-9-]+:/g) ?? []).length;
  assert.equal(colors, 27, "@theme inline 의 --color-* 수가 달라졌다");
  assert.doesNotMatch(PAGE, /--gkm-[a-z-]+\s*:/, "page.tsx 에서 변수를 새로 정의했다");
});

// ── 7·8·9. 구조·동작·문구 무변경 ─────────────────────────────────────────────
test("★주요 handler 이름이 그대로다", () => {
  for (const fn of ["handleCopyShareLink", "handleTogglePublic", "toggleVisited",
                    "addCitySpotToDay", "getCategoryColor", "generateWithNewApi"]) {
    assert.match(BODY, new RegExp(`\\b${fn}\\b`), fn);
  }
});

test("★Day 탐색·지도·타임라인 구조가 그대로다", () => {
  assert.match(BODY, /<PlannerDayNav/);
  assert.match(BODY, /<ItineraryDayMap/);
  assert.match(BODY, /showDayTabs=\{false\}/);
  assert.match(BODY, /buildTimeline\(/);
  assert.match(BODY, /<PlannerCoverHeader/);
});

test("★카드↔마커 연결을 새로 만들지 않았다", () => {
  // NaverMap 의 선택 상태 prop 은 Explore 에서만 쓴다. 여기 붙이면 신규 상호작용이다.
  assert.doesNotMatch(BODY, /selectedKey=/);
  const map = strip(read("src", "components", "ItineraryDayMap.tsx"));
  assert.doesNotMatch(map, /selectedKey/);
});

test("★색 작업이 사용자 문구를 없애지 않았다", () => {
  // 원래 이 검사는 page.tsx 안에 영어 원문이 그대로 있는지를 봤다. 그건 그
  // 시점의 상태였지 불변식이 아니다 — S2-B 가 같은 문구를 en.json 의 itin
  // 네임스페이스로 옮겼고, 그건 정당한 변경이다.
  //
  // 지켜야 할 것은 "색을 만지다가 문구가 사라지지 않는다" 이므로, 문구가
  // page.tsx 든 locale 파일이든 **어딘가에 살아 있는지**를 본다.
  const en = readFileSync(join(ROOT, "src", "messages", "en.json"), "utf8");
  const alive = (s: string) => PAGE.includes(s) || en.includes(s);
  for (const s of ["Copy Share Link", "Tips for Foreigners", "Google Maps", "Naver Maps",
                   "Kept light", "scheduling conflict", "visited", "places)"]) {
    assert.ok(alive(s), "사라진 문구: " + s);
  }
});

test("★지도 카테고리 색 함수가 그대로 값을 돌려준다", () => {
  // getCategoryColor 는 4곳의 style={{backgroundColor}} 로만 간다. 지도 SDK 로
  // 넘어가지 않으므로 var() 도 안전하지만, 카테고리 색값 자체는 건드리지 않았다.
  for (const hex of ["#d97706", "#dc2626", "#7c3aed", "#16a34a", "#9333ea", "#db2777", "#1a1f36"]) {
    assert.ok(PAGE.toLowerCase().includes(hex), "카테고리 색 누락: " + hex);
  }
  assert.equal((PAGE.match(/getCategoryColor\(/g) ?? []).length, 5);
});

// ── 10·11. migration 무변경 ──────────────────────────────────────────────────
test("★migration 을 건드리지 않았다 — 041 이 마지막이고 042 는 없다", () => {
  const dir = join(ROOT, "supabase", "migrations");
  const files = readdirSync(dir).filter(f => f.endsWith(".sql")).sort();
  assert.equal(files.length, 43);   // 042 place_reports · 043 place_likes 추가됨
  assert.ok(files.includes("041_lock_down_legacy_spots_select.sql"));
  // 이 가드의 뜻은 "이 작업이 DB 를 건드리지 않았다" 이다.
  // 042(place_reports)·043(place_likes)는 피드백 작업이 추가한 것으로 이 작업과 무관하다.
  // 그 밖의 migration 이 생기면 여기서 걸린다.
  for (const f of files.filter(f => f.slice(0, 3) > "041")) {
    assert.match(f, /^04[23]_(place_reports|place_likes)\.sql$/, `예상치 못한 migration: ${f}`);
  }
});
