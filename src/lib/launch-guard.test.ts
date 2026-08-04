// 공개 차단 결함 회귀 방어.
//
// 여기 있는 항목은 전부 "운영에 올라간 뒤에야 사람 눈으로 발견됐던" 종류다.
// 브랜드 오표기·번역 키 누락·사라진 route 는 빌드도 타입체크도 잡아주지
// 않는다. 파일만 읽어 확인할 수 있는 것들이므로 테스트로 고정한다.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const MESSAGES = join(ROOT, "src", "messages");
const LOCALES = ["en", "ko", "ja", "zh"] as const;

type Json = { [k: string]: string | Json };
const load = (l: string): Json => JSON.parse(readFileSync(join(MESSAGES, `${l}.json`), "utf8"));

function flatten(o: Json, p = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(o)) {
    if (typeof v === "string") out[p + k] = v;
    else Object.assign(out, flatten(v, p + k + "."));
  }
  return out;
}

// ── 번역 키 계약 ─────────────────────────────────────────────────────────────
test("★4개 언어의 키 집합이 완전히 같다", () => {
  const base = Object.keys(flatten(load("en"))).sort();
  for (const l of LOCALES.slice(1)) {
    const keys = Object.keys(flatten(load(l))).sort();
    const missing = base.filter(k => !keys.includes(k));
    const extra = keys.filter(k => !base.includes(k));
    assert.deepEqual(missing, [], `${l} 누락 키`);
    assert.deepEqual(extra, [], `${l} 잉여 키`);
  }
});

test("★빈 번역 값이 없다 — 화면에 빈칸이 뜬다", () => {
  for (const l of LOCALES) {
    const empty = Object.entries(flatten(load(l))).filter(([, v]) => v.trim() === "");
    assert.deepEqual(empty.map(([k]) => k), [], `${l} 빈 값`);
  }
});

test("★번역 값이 키 이름 그대로이지 않다 — fallback 이 새는 신호", () => {
  for (const l of LOCALES) {
    // 값이 키 전체와 같거나 점 경로처럼 생겼을 때만 본다.
    // story.helpful = "helpful" 처럼 마지막 조각이 그대로 보통 단어인 경우가
    // 있어 그것까지 잡으면 정상 번역을 오탐한다.
    const leaked = Object.entries(flatten(load(l)))
      .filter(([k, v]) => v === k || /^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9]+)+$/.test(v.trim()));
    assert.deepEqual(leaked.map(([k]) => k), [], `${l} 키 노출`);
  }
});

test("ICU 자리표시자가 언어마다 어긋나지 않는다", () => {
  const en = flatten(load("en"));
  const ph = (s: string) => (s.match(/\{(\w+)\}/g) || []).sort().join(",");
  for (const l of LOCALES.slice(1)) {
    const other = flatten(load(l));
    for (const [k, v] of Object.entries(en)) {
      if (!(k in other)) continue;
      assert.equal(ph(other[k]), ph(v), `${l}.${k} 자리표시자 불일치`);
    }
  }
});

// ── 브랜드 표기 ──────────────────────────────────────────────────────────────
const FORBIDDEN_BRAND = /GoKoreaMate|Go Korea Mate|Korea Mate|KoreaMate|Gokoreamate|KOREAMATE/;

test("★사용자 문구에 금지된 브랜드 표기가 없다 — 소문자 gokoreamate 만 쓴다", () => {
  for (const l of LOCALES) {
    const bad = Object.entries(flatten(load(l))).filter(([, v]) => FORBIDDEN_BRAND.test(v));
    assert.deepEqual(bad.map(([k, v]) => `${k}=${v}`), [], `${l} 금지 표기`);
  }
});

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === ".next" || e === "out") continue;
    const f = join(dir, e);
    if (statSync(f).isDirectory()) walk(f, out);
    else if (/\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f)) out.push(f);
  }
  return out;
}

test("★화면 컴포넌트의 JSX 텍스트에 금지 브랜드 표기가 없다", () => {
  const files = [...walk(join(ROOT, "src", "app")), ...walk(join(ROOT, "src", "components"))]
    .filter(f => !f.includes("korea-mate-admin"));
  const hits: string[] = [];
  for (const f of files) {
    for (const [i, line] of readFileSync(f, "utf8").split("\n").entries()) {
      // 주석·import·경로는 제외 — 사용자에게 보이는 문자열만 본다
      const s = line.trim();
      // 주석(JS·JSX)·import·경로는 사용자에게 보이지 않는다
      if (s.startsWith("//") || s.startsWith("*") || s.startsWith("/*") || s.startsWith("import")) continue;
      if (s.startsWith("{/*") || (s.includes("{/*") && s.includes("*/}"))) continue;
      if (/from\s+["']|require\(|\/korea-mate|korea-mate\.pages|github|package/.test(s)) continue;
      if (FORBIDDEN_BRAND.test(s)) hits.push(`${f.replace(ROOT, "")}:${i + 1} ${s.slice(0, 70)}`);
    }
  }
  assert.deepEqual(hits, []);
});

// ── route 존재 ───────────────────────────────────────────────────────────────
const REQUIRED_ROUTES: [string, string][] = [
  ["Home", "src/app/page.tsx"],
  ["City Entry (Busan)", "src/app/busan/page.tsx"],
  ["City Entry (Seoul)", "src/app/seoul/page.tsx"],
  ["City Entry (Jeju)", "src/app/jeju/page.tsx"],
  ["Explore", "src/app/explore/[city]/page.tsx"],
  ["Place Detail", "src/app/place/[id]/page.tsx"],
  ["Picks", "src/app/picks/page.tsx"],
  ["Trips", "src/app/my-trips/page.tsx"],
  ["Itinerary", "src/app/itinerary/page.tsx"],
  ["Shared", "src/app/shared/page.tsx"],
  ["About", "src/app/about/page.tsx"],
];

test("★주요 route 파일이 존재한다", () => {
  const missing = REQUIRED_ROUTES.filter(([, p]) => !existsSync(join(ROOT, p)));
  assert.deepEqual(missing.map(([n, p]) => `${n} (${p})`), []);
});

test("사용자 화면에서 관리자 route 로 가는 링크가 없다", () => {
  const files = [...walk(join(ROOT, "src", "app")), ...walk(join(ROOT, "src", "components"))]
    .filter(f => !f.includes("korea-mate-admin"));
  const hits: string[] = [];
  for (const f of files)
    for (const [i, line] of readFileSync(f, "utf8").split("\n").entries())
      if (/href=["'`{][^"'`]*korea-mate-admin/.test(line)) hits.push(`${f.replace(ROOT, "")}:${i + 1}`);
  assert.deepEqual(hits, []);
});

test("빈 href 나 '#' 링크가 없다 — 눌러도 아무 일이 없는 CTA", () => {
  const files = [...walk(join(ROOT, "src", "app")), ...walk(join(ROOT, "src", "components"))]
    .filter(f => !f.includes("korea-mate-admin"));
  const hits: string[] = [];
  for (const f of files)
    for (const [i, line] of readFileSync(f, "utf8").split("\n").entries())
      if (/<(a|Link)\b[^>]*href=(""|'#'|"#")/.test(line)) hits.push(`${f.replace(ROOT, "")}:${i + 1}`);
  assert.deepEqual(hits, []);
});

// ── 가짜 데이터 금지 ─────────────────────────────────────────────────────────
// 미쉐린 스타는 실존하는 외부 인증이라 표기해도 된다. 금지 대상은 우리가
// 지어낸 소수점 평점(4.8 / ★4.8 / rating: 4.5)이다.
test("★조작된 수치 평점(4.8 / 5 형태)이 화면 코드에 없다", () => {
  const files = [...walk(join(ROOT, "src", "app")), ...walk(join(ROOT, "src", "components"))]
    .filter(f => !f.includes("korea-mate-admin"));
  const hits: string[] = [];
  for (const f of files)
    for (const [i, line] of readFileSync(f, "utf8").split("\n").entries()) {
      const s = line.trim();
      if (s.startsWith("//") || s.startsWith("*")) continue;
      if (/[★⭐]\s*\{?\s*\d+\.\d|rating[^a-zA-Z]{0,3}[:=]\s*\d\.\d|\d\.\d\s*\/\s*5/.test(s))
        hits.push(`${f.replace(ROOT, "")}:${i + 1} ${s.slice(0, 60)}`);
    }
  assert.deepEqual(hits, []);
});

test("★'mins away' 류 조작된 거리 문구가 번역 파일에 없다", () => {
  const FAKE_DIST = /mins away|분 거리|walk from you|분 도보 거리/i;
  for (const l of LOCALES) {
    const bad = Object.entries(flatten(load(l))).filter(([, v]) => FAKE_DIST.test(v));
    assert.deepEqual(bad.map(([k]) => k), [], `${l}`);
  }
});

test("사용자 문구에 TODO·Lorem ipsum 같은 미완성 표시가 없다", () => {
  const WIP = /\bTODO\b|\bFIXME\b|Lorem ipsum|\bplaceholder\b|\bXXX\b/i;
  for (const l of LOCALES) {
    const bad = Object.entries(flatten(load(l))).filter(([, v]) => WIP.test(v));
    assert.deepEqual(bad.map(([k, v]) => `${k}=${v}`), [], `${l}`);
  }
});

// ── 부산 전용 하드코딩 ───────────────────────────────────────────────────────
test("공통 번역 문구가 부산에 고정돼 있지 않다 (도시 인자를 쓴다)", () => {
  const en = flatten(load("en"));
  // 도시별 화면에서 재사용되는 공통 네임스페이스만 본다
  const shared = Object.entries(en).filter(([k]) => /^(explore|discovery|nav|place|modal|map)\./.test(k));
  const hard = shared.filter(([, v]) => /\bBusan\b/i.test(v));
  assert.deepEqual(hard.map(([k, v]) => `${k}=${v}`), []);
});
