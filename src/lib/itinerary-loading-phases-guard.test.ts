// 일정 생성 대기 화면 계약 고정.
//
// 여기는 사용자가 일정을 기다리는 몇 초 동안 보는 유일한 화면이다. 예전에는
// 그 자리에 제휴사 카드가 두 장씩 떴고 문구가 이랬다.
//
//   "[Step 1] Matching Michelin & top restaurants in Busan..."
//   "Free cancellation options — Haeundae & Centum"
//   "Fixed-price pickup from Gimhae Airport"
//   "Unlimited 5G data — active before you land"
//
// 세 가지가 동시에 잘못됐다. ① 우리가 확인해 줄 수 없는 상업적 주장이고,
// ② 부산 지명이 박혀 있어 다른 도시에서는 거짓이 되며, ③ 기다리는 화면에서
// 팔 이유가 없다. 커머스는 일정이 나온 뒤 별도 영역에서 다룬다.
//
// 이 테스트는 그게 돌아오지 못하게 한다. 단계 문구는 "지금 무엇을 하고
// 있는가"만 말해야 하고, 4개 언어에 다 있어야 하며, 커머스 플래그는 꺼진
// 채로 있어야 한다.

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8");
const LOCALES = ["en", "ko", "ja", "zh"] as const;
const msg = (l: string) => JSON.parse(read("src", "messages", `${l}.json`)) as Record<string, Record<string, string>>;

const PAGE = read("src", "app", "itinerary", "page.tsx");
/** 블록 주석을 먼저 떼고 줄 주석을 뗀다 — 순서가 바뀌면 파일 본문을 삼킨다 */
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "")
   .split("\n").filter(l => !l.trimStart().startsWith("//")).join("\n");
const BODY = strip(PAGE);

const PHASE_KEYS = ["loadPhase1", "loadPhase2", "loadPhase3"] as const;

/** 로딩 화면 본문 — 커머스 검사는 이 범위로 한정한다 */
function loadingBlock(): string {
  const s = BODY.indexOf("if (loading) {");
  const e = BODY.indexOf("if (error) {", s > 0 ? s : 0);
  assert.ok(s > 0, "로딩 블록 시작을 못 찾았다");
  return e > s ? BODY.slice(s, e) : BODY.slice(s);
}
const LOADING = loadingBlock();

// ── 1. 단계 정의 ────────────────────────────────────────────────────────────
test("★LOAD_PHASES 는 정확히 3개이고 locale 키만 담는다", () => {
  const m = BODY.match(/const LOAD_PHASES = \[([^\]]*)\] as const;/);
  assert.ok(m, "LOAD_PHASES 정의를 못 찾았다");
  const items = m[1].split(",").map(x => x.trim().replace(/^"|"$/g, "")).filter(Boolean);
  assert.deepEqual(items, [...PHASE_KEYS]);
  // 제휴 카드 데이터가 다시 붙지 않았다
  assert.doesNotMatch(m[1], /cards|desc|color|emoji|name/);
});

test("★단계 수 3 은 진행바·타이머와 묶인 계약이다", () => {
  assert.match(BODY, /\(loadPhase \+ 1\) \/ LOAD_PHASES\.length/);
  assert.match(BODY, /setLoadPhase\(1\), 1200/);
  assert.match(BODY, /setLoadPhase\(2\), 2500/);
  assert.match(BODY, /LOAD_PHASES\[Math\.min\(loadPhase, LOAD_PHASES\.length - 1\)\]/);
});

test("★단계 문구는 하드코딩이 아니라 t(phaseKey) 로 나간다", () => {
  assert.match(BODY, /\{shareId \? t\("loadingShared"\) : t\(phaseKey\)\}/);
  assert.doesNotMatch(BODY, /\[Step \d\]/);
});

// ── 2·3·4·5. locale ────────────────────────────────────────────────────────
test("★3단계 문구가 4개 언어에 모두 있다", () => {
  for (const l of LOCALES) {
    for (const k of PHASE_KEYS) {
      const v = msg(l).itin[k];
      assert.equal(typeof v, "string", `${l}.itin.${k}`);
      assert.ok(v.trim().length > 0, `${l}.itin.${k} 가 비었다`);
    }
  }
});

test("★itin 키 집합이 4개 언어에서 완전히 같다", () => {
  const base = Object.keys(msg("en").itin).sort();
  for (const l of LOCALES.slice(1)) assert.deepEqual(Object.keys(msg(l).itin).sort(), base, l);
});

test("★KO·JA·ZH 단계 문구에 영어 원문이 남지 않았다", () => {
  const en = msg("en").itin;
  for (const l of ["ko", "ja", "zh"] as const) {
    for (const k of PHASE_KEYS) {
      assert.notEqual(msg(l).itin[k], en[k], `${l}.itin.${k}`);
      assert.doesNotMatch(msg(l).itin[k], /[A-Za-z]{4}/, `${l}.itin.${k} 에 영어 단어가 남았다`);
    }
  }
});

test("★단계 문구가 자리표시자를 쓰지 않는다 — 문자열 연결이 필요 없다", () => {
  for (const l of LOCALES) {
    for (const k of PHASE_KEYS) assert.doesNotMatch(msg(l).itin[k], /\{\w+\}/, `${l}.${k}`);
  }
});

// ── 6·7. 로딩 화면 상업 표현 0 ──────────────────────────────────────────────
const FORBIDDEN = ["Michelin", "Booking", "Klook", "Viator", "eSIM", "hotel", "Hotel",
                   "airport transfer", "Airport Transfer", "limousine", "Limousine",
                   "free cancellation", "Free cancellation", "fixed-price", "Fixed-price",
                   "discount", "% off", "₩", "Busan", "Haeundae", "Gamcheon", "Gimhae"];

test("★로딩 화면에 제휴·가격·할인·도시 고정 표현이 없다", () => {
  for (const w of FORBIDDEN) {
    assert.ok(!LOADING.includes(w), `로딩 화면에 남아 있다: "${w}"`);
  }
});

test("★4개 언어 단계 문구에도 상업·도시 표현이 없다", () => {
  for (const l of LOCALES) {
    for (const k of PHASE_KEYS) {
      const v = msg(l).itin[k];
      for (const w of ["Michelin", "Booking", "Klook", "Viator", "eSIM", "₩", "%",
                       "부산", "釜山", "호텔", "ホテル", "酒店", "항공", "할인", "割引", "折扣"]) {
        assert.ok(!v.includes(w), `${l}.itin.${k} 에 "${w}"`);
      }
    }
  }
});

test("★로딩 화면에 파트너 URL·제휴 ID·커머스 CTA 가 없다", () => {
  for (const re of [/affiliate\./i, /klook\.com/i, /booking\.com/i, /viator\.com/i,
                    /aff_adid/i, /NEXT_PUBLIC_\w*(KLOOK|BOOKING|VIATOR|ESIM)/i,
                    /card\.color/, /card\.desc/, /card\.name/]) {
    assert.doesNotMatch(LOADING, re, String(re));
  }
});

// ── 8. commerce flag ───────────────────────────────────────────────────────
test("★커머스 플래그 두 개가 모두 false 로 유지된다", () => {
  const c = read("src", "config", "commerce-surfaces.ts");
  assert.match(c, /export const POST_PLAN_COMMERCE_ENABLED = false/);
  assert.match(c, /export const TRIP_FLOW_COMMERCE_ENABLED = false/);
});

// ── 9. 생성 로직 무변경 ─────────────────────────────────────────────────────
test("★일정 생성 경로·handler 를 바꾸지 않았다", () => {
  assert.match(BODY, /fetch\("\/api\/trip\/plan"/);
  assert.match(BODY, /async function generateWithNewApi\(/);
  const plan = read("functions", "api", "trip", "plan.ts");
  assert.match(plan, /with_ai is ALWAYS forced to false/);
  assert.match(plan, /runScheduler\(/);
  // 원래는 "plan.ts 가 scheduler/ai/ 를 import 하지 않는다"로 적었다. 그건 그
  // 시점의 상태였지 불변식이 아니다 — 이후 whole-trip 개인화 프로필이 들어오면서
  // 순수 타입·검증기(personalization-profile.ts)를 정당하게 import 한다.
  //
  // 지켜야 할 진짜 계약은 "날짜별 plan endpoint 가 provider 를 직접 부르지 않는다"
  // 이다. provider 를 부르는 모듈(gemini-client·personalizer)은 여전히 금지다.
  assert.doesNotMatch(strip(plan), /from\s+"[^"]*scheduler\/ai\/(gemini-client|personalizer|prompt-builder|response-parser)/);
  assert.doesNotMatch(strip(plan), /generativelanguage|callGemini/);
});

// ── 14. provider attribution ───────────────────────────────────────────────
test("★검증되지 않은 provider 고유명사를 사용자 문구에 쓰지 않는다", () => {
  // 실제로 배포된 생성 경로는 /api/trip/plan 하나뿐이고 with_ai=false 다.
  // Gemini 를 쓰는 functions/api/generate-itinerary.ts 는 클라이언트 호출처가 0 이다.
  for (const l of LOCALES) {
    const s = JSON.stringify(msg(l));
    assert.ok(!s.includes("Gemini"), `${l} 번역에 Gemini 표기가 남았다`);
  }
  assert.doesNotMatch(BODY, /Gemini/);
});

test("★생성 경로에서 Gemini 를 부르는 코드가 클라이언트에 없다", () => {
  // 이 사실이 깨지면 위 attribution 판단의 근거가 바뀐다.
  const walk = (dir: string, out: string[] = []): string[] => {
    for (const d of readdirSync(dir, { withFileTypes: true })) {
      if (d.name === "node_modules") continue;
      const p = join(dir, d.name);
      if (d.isDirectory()) walk(p, out);
      else if (/\.tsx?$/.test(d.name) && !/\.test\.tsx?$/.test(d.name)) out.push(p);
    }
    return out;
  };
  const clientFiles = walk(join(ROOT, "src", "app")).concat(walk(join(ROOT, "src", "components")));
  for (const f of clientFiles) {
    assert.doesNotMatch(readFileSync(f, "utf8"), /fetch\([^)]*generate-itinerary/, f);
  }
});

test("★한국관광공사 데이터 출처 표기는 유지된다 — 실제 사용 근거가 있다", () => {
  assert.match(read("src", "lib", "tourapi-images.ts"), /TOUR_API_KEY/);
  for (const l of LOCALES) {
    const a = msg(l).itin.attribution;
    assert.ok(/Korea Tourism Organization|한국관광공사|韓国観光公社|韩国旅游发展局/.test(a), `${l}: ${a}`);
  }
});

// ── 10·11·13. 기존 작업 회귀 ───────────────────────────────────────────────
test("★S2-A semantic token 을 건드리지 않았다", () => {
  const g = read("src", "app", "globals.css");
  assert.equal((g.match(/--gkm-[a-z0-9-]+:/g) ?? []).length, 46);
  assert.equal((g.match(/--color-[a-z0-9-]+:/g) ?? []).length, 27);
  for (const hex of ["191C21", "565D66", "E5E7EA", "F6F7F8", "8A919B"]) {
    assert.doesNotMatch(PAGE, new RegExp(`[a-z]-\\[#${hex}\\]`, "i"), hex);
  }
});

test("★카드↔마커 연결을 새로 만들지 않았다", () => {
  assert.doesNotMatch(BODY, /selectedKey=/);
  assert.doesNotMatch(strip(read("src", "components", "ItineraryDayMap.tsx")), /selectedKey/);
});

test("★S2-B 에서 번역한 일반 화면 키가 그대로 남아 있다", () => {
  const en = msg("en").itin;
  for (const k of ["copyShareLink", "copied", "visibilityPublic", "editTrip", "viewFull",
                   "placesCount", "conflictNotice", "departureNotice", "unscheduledTitle",
                   "moveUp", "removePlace", "somethingWrong", "loadingItinerary", "loadingShared"]) {
    assert.equal(typeof en[k], "string", k);
  }
  assert.equal((BODY.match(/useTranslations\("itin"\)/g) ?? []).length, 3);
});

// ── 12. migration ──────────────────────────────────────────────────────────
test("★migration 을 건드리지 않았다 — 041 이 마지막이고 042 는 없다", () => {
  const dir = join(ROOT, "supabase", "migrations");
  const files = readdirSync(dir).filter(f => f.endsWith(".sql")).sort();
  assert.equal(files.length, 42);   // 042 place_reports 추가됨
  assert.ok(files.includes("041_lock_down_legacy_spots_select.sql"));
  // 이 가드의 뜻은 "이 작업이 DB 를 건드리지 않았다" 이다.
  // 042 는 장소 제보(place_reports) 작업이 추가한 것으로 이 작업과 무관하다.
  // 그 밖의 migration 이 생기면 여기서 걸린다.
  for (const f of files.filter(f => f.slice(0, 3) > "041")) {
    assert.match(f, /^042_place_reports\.sql$/, `예상치 못한 migration: ${f}`);
  }
});
