// 운영 반영 스크립트의 안전 계약 고정.
//
// 이 저장소에서 운영 데이터를 쓰는 코드는 하나뿐이다. 그 하나가 잘못 열리면
// 되돌리기 어려운 손상이 난다. 그래서 "쓸 수 있는 조건" 을 여기서 못 박는다.
//
//   기본은 읽기 전용이다. --apply 만으로도 안 된다. 토큰까지 있어야 한다.
//   allowlist 가 정확히 326 이고 해시가 맞아야 한다.
//   운영 pre-state 가 예상과 같아야 한다.
//   정정 대상은 5개 id 로 고정이며 넓힐 수 없다.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  PRODUCTION_REF, CONFIRM_TOKEN, EXPECTED_ALLOWLIST_N, EXPECTED_ALLOWLIST_SHA256,
  MANUAL_CORRECTION, EXPECTED_PRESTATE, EXPECTED_POSTSTATE,
  allowlistSha256, isWriteAuthorized, writeGate,
} from "../../../scripts/busan-p1-restaurant-production-apply.ts";
import { IMPORT_SOURCE_TYPE, mapToCitySpot } from "./city-spots-mapping.ts";
import { selectP1Restaurants, type ReleaseItem, type EnrichedCandidate } from "./p1-selector.ts";
import { classifyAllSemantics, buildAllowlist, type SemanticInput } from "./restaurant-semantics.ts";

const ROOT = process.cwd();
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8");
const SCRIPT = () => read("scripts", "busan-p1-restaurant-production-apply.ts");

const OK = {
  ref: PRODUCTION_REF, allowlistCount: EXPECTED_ALLOWLIST_N, allowlistSha: EXPECTED_ALLOWLIST_SHA256,
  excludedOverlap: 0, prestateOk: true, targetsOk: true, authorized: true,
};

// ── 1~3. allowlist ───────────────────────────────────────────────────────────

test("★1 실제 source 에서 allowlist 가 정확히 326 으로 재현된다", () => {
  const release: ReleaseItem[] = JSON.parse(
    read("data", "tourapi", "reports", "busan", "busan-final-place-event-release-manifest.json")).items;
  const enriched: EnrichedCandidate[] = read("data", "tourapi", "enriched", "busan", "busan-enriched-candidates-v1.jsonl")
    .split(/\r?\n/).filter(l => l.trim()).map(l => JSON.parse(l));
  const byId = new Map(enriched.map(e => [e.candidate_id, e]));
  const p1 = selectP1Restaurants(release, enriched);
  assert.equal(p1.length, 371);

  // NEW_INSERT_SAFE 를 거치지 않은 P1 전체에 의미 판정을 걸면 상위집합이 나온다.
  // allowlist 는 그 교집합이므로 326 이하여야 하고, 계약 상수와 일치해야 한다.
  const sem = classifyAllSemantics(p1.map(r => {
    const ss = (byId.get(r.candidate_id)!.source_summary ?? {}) as Record<string, unknown>;
    return { candidate_id: r.candidate_id, name_ko: r.name_ko, name_en: r.name_en,
             description_ko: r.description_ko, description_en: r.description_en, address: r.address,
             source_keys: (ss.source_keys as string[] | undefined) ?? [], primary_source: r.primary_source } as SemanticInput;
  }));
  assert.ok(buildAllowlist(sem).length >= EXPECTED_ALLOWLIST_N);
  assert.equal(EXPECTED_ALLOWLIST_N, 326);
});

test("★2 count 가 326 이 아니면 write 로 진입하지 못한다", () => {
  assert.equal(writeGate({ ...OK, allowlistCount: 325 }).ok, false);
  assert.equal(writeGate({ ...OK, allowlistCount: 327 }).ok, false);
  assert.equal(writeGate({ ...OK, allowlistCount: 332 }).ok, false);
  assert.equal(writeGate(OK).ok, true);
});

test("★3 제외 대상이 하나라도 섞이면 진입 불가", () => {
  assert.equal(writeGate({ ...OK, excludedOverlap: 1 }).ok, false);
  // source 가 바뀌면 해시가 달라지고, 그 즉시 막힌다
  assert.equal(writeGate({ ...OK, allowlistSha: "deadbeef" }).ok, false);
  assert.equal(allowlistSha256(["b", "a"]), allowlistSha256(["a", "b"]));   // 정렬 무관 = 결정론
});

// ── 4~8. 실행 자격 ───────────────────────────────────────────────────────────

test("★4 운영 project ref 가 다르면 진입 불가", () => {
  assert.equal(writeGate({ ...OK, ref: "someotherref" }).ok, false);
  assert.equal(PRODUCTION_REF, "tfulaxxtorbxhlgupktc");
});

test("★5 기본 실행은 읽기 전용이다", () => {
  assert.equal(isWriteAuthorized([]), false);
  assert.equal(writeGate({ ...OK, authorized: false }).ok, false);
});

test("★6 --apply 만으로는 쓰지 못한다", () => {
  assert.equal(isWriteAuthorized(["--apply"]), false);
  assert.equal(isWriteAuthorized(["--apply", "--confirm-batch=WRONG"]), false);
});

test("★7 토큰까지 있어야 쓴다", () => {
  assert.equal(isWriteAuthorized(["--apply", `--confirm-batch=${CONFIRM_TOKEN}`]), true);
  assert.equal(isWriteAuthorized([`--confirm-batch=${CONFIRM_TOKEN}`]), false);  // --apply 없이도 불가
  assert.equal(CONFIRM_TOKEN, "BUSAN-P1-RESTAURANT-326");
});

test("★8 운영 pre-state 가 다르면 진입 불가", () => {
  assert.equal(writeGate({ ...OK, prestateOk: false }).ok, false);
  assert.deepEqual({ ...EXPECTED_PRESTATE },
    { total: 86, restaurant: 6, attraction: 43, nature: 37, manual: 86, enrichment: 0, external_id_non_null: 0 });
  assert.deepEqual({ ...EXPECTED_POSTSTATE },
    { total: 412, restaurant: 327, attraction: 48, nature: 37, manual: 86, enrichment: 326 });
  // 86 + 326 = 412 · 6 - 5 + 326 = 327 · 43 + 5 = 48
  assert.equal(EXPECTED_PRESTATE.total + EXPECTED_ALLOWLIST_N, EXPECTED_POSTSTATE.total);
  assert.equal(EXPECTED_PRESTATE.restaurant - MANUAL_CORRECTION.length + EXPECTED_ALLOWLIST_N, EXPECTED_POSTSTATE.restaurant);
  assert.equal(EXPECTED_PRESTATE.attraction + MANUAL_CORRECTION.length, EXPECTED_POSTSTATE.attraction);
});

// ── 9~10. 기존 manual 보호 ───────────────────────────────────────────────────

test("★9 정정 대상은 5개 id 로 고정이다", () => {
  assert.deepEqual(MANUAL_CORRECTION.map(m => m.id), [3, 21, 22, 41, 54]);
  assert.deepEqual(MANUAL_CORRECTION.map(m => m.name),
    ["Jagalchi Fish Market", "Jagalchi Market", "Gukje Market", "Dalmaji Hill", "Jeonpo Cafe Street"]);
  assert.equal(writeGate({ ...OK, targetsOk: false }).ok, false);
});

test("★10 UPDATE 는 id·city·source_type·현재 category 를 모두 걸고 category 만 바꾼다", () => {
  const s = SCRIPT();
  assert.match(s, /city_spots\?id=in\.\(\$\{MANUAL_CORRECTION\.map\(m => m\.id\)\.join\(","\)\}\)&city=eq\.busan&source_type=eq\.manual&category=eq\.restaurant/);
  assert.match(s, /\{ category: "attraction" \}/);
  // 이름·좌표·출처·external_id 를 쓰는 PATCH 본문이 없어야 한다
  assert.doesNotMatch(s, /\{\s*name:|\{\s*lat:|\{\s*source_type:|\{\s*external_id:/);
});

// ── 11~14. 신규 row 계약 ────────────────────────────────────────────────────

test("★11~14 신규 row 는 이미지·영업시간을 비우고 lineage 를 채운다", () => {
  const release: ReleaseItem[] = JSON.parse(
    read("data", "tourapi", "reports", "busan", "busan-final-place-event-release-manifest.json")).items;
  const enriched: EnrichedCandidate[] = read("data", "tourapi", "enriched", "busan", "busan-enriched-candidates-v1.jsonl")
    .split(/\r?\n/).filter(l => l.trim()).map(l => JSON.parse(l));
  const sample = selectP1Restaurants(release, enriched).slice(0, 50).map(mapToCitySpot);
  for (const m of sample) {
    assert.equal(m.row.image_url, null);              // 권리 미확정 — 넣지 않는다
    assert.equal(m.row.opening_hours, null);          // parser 없음 — raw 를 JSONB 로 포장하지 않는다
    assert.equal(m.row.subcategory, null);
    assert.equal(m.row.duration_minutes, null);
    assert.equal(m.row.best_time_slot, null);
    assert.equal(m.row.tags, null);
    assert.equal(m.row.source_type, IMPORT_SOURCE_TYPE);
    assert.equal(m.row.external_id, m.candidate_id);
    assert.equal(m.row.city, "busan");
    assert.equal(m.row.category, "restaurant");
  }
  // 원천에 hours 가 있어도 DB 로 넘어가지 않는다
  assert.ok(sample.some(m => m.source_raw_hours_available), "raw hours 보유 샘플이 있어야 의미 있는 검증이다");
});

// ── 15~20. 스크립트 자체의 안전성 ───────────────────────────────────────────

test("★15·16 allowlist 밖 insert 와 기존 row overwrite 경로가 없다", () => {
  const s = SCRIPT();
  // INSERT 본문은 allowlist 로 필터된 rows 하나뿐이다
  assert.equal((s.match(/rest\(c, "POST"/g) ?? []).length, 1);
  assert.match(s, /rest\(c, "POST", "city_spots", sets\.rows, "return=representation"\)/);
  assert.match(s, /safe\.filter\(r => allowSet\.has\(r\.candidate_id\)\)/);
  // PATCH 는 정정 1곳 + rollback 1곳뿐
  assert.equal((s.match(/rest\(c, "PATCH"/g) ?? []).length, 2);
});

test("★17 rollback 은 실제 inserted id 를 3중 조건으로만 지운다", () => {
  const s = SCRIPT();
  assert.match(s, /city_spots\?id=in\.\(\$\{ids\.join\(","\)\}\)&source_type=eq\.\$\{IMPORT_SOURCE_TYPE\}&external_id=not\.is\.null/);
  assert.equal((s.match(/rest\(c, "DELETE"/g) ?? []).length, 1);
  // 도시 전체·날짜 범위·wildcard 삭제가 없다
  assert.doesNotMatch(s, /DELETE",\s*`city_spots\?city=/);
  assert.doesNotMatch(s, /created_at=(gte|lte)/);
});

test("★18·19 이미 반영돼 있으면 다시 넣지 않는다", () => {
  const s = SCRIPT();
  assert.match(s, /pre\.enrichment === EXPECTED_ALLOWLIST_N/);
  assert.match(s, /ALREADY_APPLIED/);
  // 그 분기가 write 보다 앞에 있어야 의미가 있다
  assert.ok(s.indexOf("ALREADY_APPLIED") < s.indexOf('rest(c, "POST"'));
});

test("★20 자격증명을 출력하지 않는다 — anon 으로 쓰지도 않는다", () => {
  const s = SCRIPT();
  assert.doesNotMatch(s, /console\.(log|error)\([^)]*\b(admin|anon|SERVICE_ROLE|apikey)\b/);
  assert.doesNotMatch(s, /\.slice\(0,\s*\d+\)[^\n]*key/i);
  // 읽기만 anon, 쓰기는 service-role
  assert.match(s, /const key = method === "GET" \? c\.anon : c\.admin;/);
  // 하드코딩된 키가 없다
  assert.doesNotMatch(s, /eyJ[A-Za-z0-9_-]{20,}|sbp_[a-f0-9]{20,}/);
});
