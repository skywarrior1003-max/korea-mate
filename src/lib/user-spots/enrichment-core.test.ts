// 개인 표시값 생성 계약 테스트.
//
// 지키는 것 셋. 밖으로 나가면 안 되는 것은 타입에 자리조차 없다,
// 사용자가 쓴 값을 덮지 않는다, 그리고 모르는 장소를 아는 척하지 않는다.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import {
  resolveMyPlaceAiMode,
  resolveEnrichLocale,
  buildEnrichmentContext,
  hasEnoughGrounding,
  validateDraftField,
  mockEnrichmentProvider,
  MY_PLACE_AI_MODES,
  ENRICH_LOCALES,
  TITLE_MAX,
  MEMO_MAX,
  type EnrichSourceRow,
  type EnrichCanonicalRow,
} from "./enrichment-core.ts";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .map(l => l.replace(/(^|\s)\/\/.*/, ""))
    .join("\n");
}
const CORE   = read("src/lib/user-spots/enrichment-core.ts");
const ROUTE  = read("functions/api/user-spots/[id]/enrich.ts");
const CLIENT = read("src/lib/user-spots-api.ts");
const C = { core: code(CORE), route: code(ROUTE), client: code(CLIENT) };

const ROW: EnrichSourceRow = {
  name: "My spot", city: "busan", category: "attraction",
  lat: 35.1587401, lng: 129.1603001, hasPhoto: false, note: null,
};
const CANON: EnrichCanonicalRow = {
  name: "Gwangalli Beach", city: "busan", category: "attraction",
  subcategory: "Beach", district: "Suyeong-gu",
};

// ── mode ─────────────────────────────────────────────────────────────────────

test("모르는 mode 값은 전부 off", () => {
  for (const v of ["", "  ", "LIVE!", "on", "true", "gemini", null, undefined]) {
    assert.equal(resolveMyPlaceAiMode(v), "off", `${String(v)} → off`);
  }
});

test("아는 mode 는 셋뿐", () => {
  assert.deepEqual([...MY_PLACE_AI_MODES], ["off", "mock", "live"]);
  for (const v of MY_PLACE_AI_MODES) assert.equal(resolveMyPlaceAiMode(v), v);
  assert.equal(resolveMyPlaceAiMode("MOCK"), "mock", "대소문자 무시");
});

test("Trip 쪽 AI env 와 분리돼 있다", () => {
  assert.ok(C.route.includes("MY_PLACES_AI_MODE"), "전용 env");
  assert.ok(!C.route.includes("AI_PERSONALIZATION_MODE"), "Trip env 를 읽지 않는다");
  assert.ok(!C.core.includes("AI_PERSONALIZATION_MODE"));
});

// ── locale ───────────────────────────────────────────────────────────────────

test("허용 locale 은 넷뿐, 나머지는 en", () => {
  assert.deepEqual([...ENRICH_LOCALES], ["en", "ko", "ja", "zh"]);
  for (const v of ENRICH_LOCALES) assert.equal(resolveEnrichLocale(v), v);
  for (const v of ["fr", "", "  ", 42, null, undefined, {}]) {
    assert.equal(resolveEnrichLocale(v), "en", `${String(v)} → en`);
  }
});

// ── context — 무엇이 나가는가 ────────────────────────────────────────────────

test("raw 좌표는 context 에 자리조차 없다", () => {
  const ctx = buildEnrichmentContext(ROW, null, "ko");
  const json = JSON.stringify(ctx);
  assert.ok(!json.includes("35.15"), "위도 값 미포함");
  assert.ok(!json.includes("129.16"), "경도 값 미포함");
  assert.ok(!("lat" in ctx) && !("lng" in ctx), "필드 자체가 없다");
  assert.equal(ctx.hasLocation, true, "있다는 사실만 남는다");
});

test("사진은 존재 여부만 나간다", () => {
  const ctx = buildEnrichmentContext({ ...ROW, hasPhoto: true }, null, "en");
  assert.equal(ctx.hasPhoto, true);
  const json = JSON.stringify(ctx);
  assert.ok(!json.includes("user-spots/"), "storage path 미포함");
  assert.ok(!json.includes("token="), "signed URL 미포함");
});

test("공개 장소와 연결돼 있으면 그쪽 사실 값을 쓴다", () => {
  const ctx = buildEnrichmentContext(ROW, CANON, "ko");
  assert.equal(ctx.placeName, "Gwangalli Beach", "canonical 이름 우선");
  assert.equal(ctx.subcategory, "Beach");
  assert.equal(ctx.area, "Suyeong-gu");
});

test("연결이 없으면 내가 쓴 이름을 쓴다", () => {
  const ctx = buildEnrichmentContext(ROW, null, "en");
  assert.equal(ctx.placeName, "My spot");
  assert.ok(!("subcategory" in ctx) && !("area" in ctx));
});

test("사용자가 쓴 메모는 그대로 근거가 된다", () => {
  const ctx = buildEnrichmentContext({ ...ROW, note: "  파도 소리  " }, null, "ko");
  assert.equal(ctx.userNote, "파도 소리");
});

test("context 가 가진 키는 정해진 것뿐이다", () => {
  const ctx = buildEnrichmentContext({ ...ROW, note: "x", hasPhoto: true }, CANON, "ja");
  const allowed = new Set(["locale", "placeName", "city", "category", "subcategory",
                           "area", "userNote", "hasPhoto", "hasLocation"]);
  for (const k of Object.keys(ctx)) assert.ok(allowed.has(k), `예상 밖 키: ${k}`);
});

// ── grounding ────────────────────────────────────────────────────────────────

test("이름도 메모도 없으면 만들지 않는다", () => {
  const ctx = buildEnrichmentContext(
    { name: null, city: null, category: null, lat: null, lng: null, hasPhoto: true, note: null },
    null, "en",
  );
  assert.equal(hasEnoughGrounding(ctx), false, "사진만으로는 부족하다");
});

test("이름이 있거나 메모가 있으면 충분하다", () => {
  assert.equal(hasEnoughGrounding(buildEnrichmentContext(ROW, null, "en")), true);
  assert.equal(hasEnoughGrounding(buildEnrichmentContext(
    { ...ROW, name: null, note: "혼자 한참 앉아 있었다" }, null, "ko")), true);
});

// ── 출력 검증 ────────────────────────────────────────────────────────────────

test("빈 값·공백은 저장하지 않는다", () => {
  for (const v of ["", "   ", "\n\t", null, undefined, 42 as unknown as string]) {
    assert.equal(validateDraftField(v, TITLE_MAX), null, `${JSON.stringify(v)} 거부`);
  }
});

test("앞뒤 공백은 다듬는다", () => {
  assert.equal(validateDraftField("  광안리의 밤  ", TITLE_MAX), "광안리의 밤");
});

test("상한을 넘으면 자르지 않고 버린다", () => {
  assert.equal(validateDraftField("a".repeat(TITLE_MAX + 1), TITLE_MAX), null);
  assert.equal(validateDraftField("a".repeat(TITLE_MAX), TITLE_MAX)?.length, TITLE_MAX);
  assert.equal(validateDraftField("a".repeat(MEMO_MAX + 1), MEMO_MAX), null);
});

test("마크업은 받지 않는다", () => {
  assert.equal(validateDraftField("<b>밤</b>", TITLE_MAX), null);
  assert.equal(validateDraftField("a > b", TITLE_MAX), null);
});

test("제어문자는 거르되 줄바꿈·탭은 허용한다", () => {
  assert.equal(validateDraftField("첫 줄\n둘째 줄", MEMO_MAX), "첫 줄\n둘째 줄");
  assert.equal(validateDraftField("탭\t포함", MEMO_MAX), "탭\t포함");
  assert.equal(validateDraftField(`bad${String.fromCharCode(7)}bell`, MEMO_MAX), null);
  assert.equal(validateDraftField(`bad${String.fromCharCode(0x7f)}del`, MEMO_MAX), null);
});

// ── mock provider ────────────────────────────────────────────────────────────

test("mock 은 결정적이고 요청한 것만 만든다", async () => {
  const ctx = buildEnrichmentContext(ROW, CANON, "ko");
  const a = await mockEnrichmentProvider({ context: ctx, needTitle: true, needMemo: false });
  const b = await mockEnrichmentProvider({ context: ctx, needTitle: true, needMemo: false });
  assert.deepEqual(a, b, "같은 입력 같은 출력");
  assert.ok(a.title && !a.memo, "필요한 것만");
  const c = await mockEnrichmentProvider({ context: ctx, needTitle: false, needMemo: true });
  assert.ok(!c.title && c.memo);
});

test("mock 출력에 회사 이름이 없다", async () => {
  const ctx = buildEnrichmentContext(ROW, CANON, "en");
  const d = await mockEnrichmentProvider({ context: ctx, needTitle: true, needMemo: true });
  const s = `${d.title} ${d.memo}`.toLowerCase();
  for (const brand of ["gemini", "openai", "gpt", "claude", "anthropic", "google"]) {
    assert.ok(!s.includes(brand), `${brand} 미포함`);
  }
  assert.ok(s.includes("[mock]"), "mock 임이 드러난다");
});

test("core 는 어떤 provider 도 알지 못한다", () => {
  for (const brand of ["gemini", "openai", "anthropic", "generativelanguage", "api.openai"]) {
    assert.ok(!C.core.toLowerCase().includes(brand), `core 에 ${brand} 없음`);
    assert.ok(!C.route.toLowerCase().includes(brand), `route 에 ${brand} 없음`);
  }
  assert.ok(!C.route.includes("fetch("), "route 는 외부로 나가지 않는다");
});

// ── endpoint 계약 ────────────────────────────────────────────────────────────

test("enrich route 가 생겼다", () => {
  assert.equal(existsSync(join(ROOT, "functions/api/user-spots/[id]/enrich.ts")), true);
});

test("꺼져 있으면 DB 도 읽지 않는다", () => {
  const off  = C.route.indexOf('mode === "off"');
  const read = C.route.indexOf('.from("user_spots")');
  assert.ok(off >= 0 && read >= 0);
  assert.ok(off < read, "mode 확인이 조회보다 앞");
});

test("live 는 아직 아무 provider 도 없다", () => {
  assert.match(C.route, /if \(mode === "mock"\) provider = mockEnrichmentProvider;/);
  assert.match(C.route, /provider_unavailable/, "live 면 안전하게 멈춘다");
  assert.ok(!/mode === "live"[\s\S]{0,80}provider =/.test(C.route), "live 에 붙은 provider 없음");
});

test("이미 값이 있으면 provider 를 부르지 않는다", () => {
  const already = C.route.indexOf("already_enriched");
  const call    = C.route.indexOf("await provider(");
  assert.ok(already >= 0 && call >= 0 && already < call, "먼저 끊는다");
});

test("근거가 부족하면 아무것도 쓰지 않는다", () => {
  const ins = C.route.indexOf("insufficient_context");
  const call = C.route.indexOf("await provider(");
  assert.ok(ins >= 0 && ins < call, "provider 호출 전에 멈춘다");
});

test("저장 순간에도 NULL 조건을 건다", () => {
  assert.match(C.route, /update\(\{ display_title[\s\S]{0,220}\.is\("display_title", null\)/);
  assert.match(C.route, /update\(\{ display_memo[\s\S]{0,220}\.is\("display_memo", null\)/);
});

test("제목과 메모를 따로 저장한다", () => {
  assert.equal((C.route.match(/\.from\("user_spots"\)\s*\n?\s*\.update\(/g) ?? []).length, 2,
    "UPDATE 두 번 — 한쪽이 막혀도 다른 쪽은 저장된다");
  assert.match(C.route, /updated\.title\s*=/);
  assert.match(C.route, /updated\.memo\s*=/);
});

test("영향받은 행 수로 성공을 판정한다", () => {
  // .select("id") 없이 UPDATE 하면 사용자 값을 덮었는지 알 수 없다
  assert.equal((C.route.match(/\.is\("display_(title|memo)", null\)\s*\n?\s*\.select\("id"\)/g) ?? []).length, 2);
});

test("두 컬럼 외에는 쓰지 않는다", () => {
  const updates = [...C.route.matchAll(/\.update\(\{([^}]*)\}/g)].map(m => m[1]!);
  assert.equal(updates.length, 2);
  for (const u of updates) {
    for (const k of ["note", "name", "city_spot_id", "related_city_spot_id",
                     "submission_status", "photo_public", "photo_storage_path", "lat", "lng"]) {
      assert.ok(!u.includes(k), `UPDATE 에 ${k} 없음`);
    }
  }
});

test("user_spots 를 만들지도 지우지도 않는다", () => {
  assert.ok(!C.route.includes(".insert("), "INSERT 0");
  assert.ok(!C.route.includes(".delete("), "DELETE 0");
});

test("provider 실패는 200 으로 끝내고 장소를 건드리지 않는다", () => {
  assert.match(C.route, /provider_failed[\s\S]{0,120}\}, 200\)/, "실패도 200 — 저장은 이미 끝났다");
  // 이 파일 전체에 삭제가 없다는 것이 곧 rollback 이 불가능하다는 뜻이다
  assert.ok(!C.route.includes(".delete("), "rollback 수단 자체가 없다");
});

test("응답에 storage path 가 없다", () => {
  assert.ok(!/json\(\s*\{[^}]*photo_storage_path/.test(C.route));
});

// ── 클라이언트 ───────────────────────────────────────────────────────────────

test("클라이언트는 locale 만 보낸다", () => {
  const fn = C.client.slice(C.client.indexOf("apiEnrichUserSpot"));
  assert.match(fn, /JSON\.stringify\(\{ locale \}\)/);
});

test("저장을 막지 않는다 — 기다리지 않고 부른다", () => {
  for (const p of ["src/app/picks/PicksClient.tsx",
                   "src/components/UserSpotsPanel.tsx",
                   "src/app/place/[id]/PlaceDetailClient.tsx"]) {
    const src = code(read(p));
    assert.match(src, /void apiEnrichUserSpot\(/, `${p}: await 하지 않는다`);
    assert.ok(!/await apiEnrichUserSpot\(/.test(src), `${p}: await 금지`);
  }
});

test("실패해도 되돌리지 않는다", () => {
  // void 로 부르면 결과를 볼 수도, 실패를 잡을 수도 없다. 되돌릴 방법이
  // 구조적으로 없다는 뜻이다 — 나중에 누가 .catch 를 붙여 삭제를 넣으면
  // 이 검사가 걸린다.
  for (const p of ["src/app/picks/PicksClient.tsx",
                   "src/components/UserSpotsPanel.tsx",
                   "src/app/place/[id]/PlaceDetailClient.tsx"]) {
    const src = code(read(p));
    for (const m of src.matchAll(/apiEnrichUserSpot\([^)]*\)([^;\n]*)/g)) {
      assert.equal(m[1]!.trim(), "", `${p}: enrich 호출에 후속 처리를 붙이지 않는다`);
    }
  }
});
