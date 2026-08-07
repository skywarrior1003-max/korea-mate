// 부산 P1 restaurant dry-run importer 계약 고정.
//
// 이 테스트가 지키는 것은 두 가지다.
//   ① 기존 manual 86건은 어떤 경로로도 바뀌지 않는다
//   ② dry-run 에는 Production 에 쓸 수 있는 경로가 아예 없다
//
// 그리고 identity 판정이 이름 하나·좌표 하나로 무너지지 않는지 고정한다.
// 실제로 `Gwangalli Beach` / `Gwangalli Beach & Bridge` 는 같은 장소이고,
// 한 건물 안에 MOZU·SUSHI IRUKA·MUG Dessert LAB 이 같은 좌표로 함께 있다.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  selectP1Restaurants, findDuplicateIds, gradeCandidate, inBusan,
  type ReleaseItem, type EnrichedCandidate,
} from "./p1-selector.ts";
import {
  classifyCandidate, classifyAll, detectIntraSetConflicts, coordinateClusters,
  normalizeKo, tokensEn, tokenOverlap, districtKey, nameSignalBetween,
  type ExistingSpot, type MatchCandidateInput,
} from "./identity-matcher.ts";
import {
  mapToCitySpot, validatePreview, classifyImageRights, toRomanDistrict,
  findNameCollisions, displayName, IMPORT_SOURCE_TYPE, CITY_KEY,
} from "./city-spots-mapping.ts";

const ROOT = process.cwd();
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8");

// ── fixture ─────────────────────────────────────────────────────────────────

function rel(id: string, category: string, cls = "RELEASE_READY_OPTIONAL_MISSING"): ReleaseItem {
  return { candidate_id: id, category, release_class: cls };
}
function enr(id: string, category: string, pv: Record<string, unknown>, curated = 1): EnrichedCandidate {
  return {
    candidate_id: id, category,
    proposed_values: { lat: 35.15, lng: 129.05, ...pv },
    image_assessment: { curated_count: curated, image_status: "image_sufficient", rights_status: "operational_assumed" },
    validation: { confidence: "medium" },
    source_summary: { primary_source_type: "kto_tourapi" },
  };
}
const FULL = { name_ko: "가게", name_en: "Shop", address: "부산광역시 수영구 광안로 1", district: "수영구", description_en: "A place." };

function existing(over: Partial<ExistingSpot> = {}): ExistingSpot {
  return { id: 1, name: "Existing", category: "restaurant", district: "Suyeong-gu",
           lat: 35.15, lng: 129.05, source_type: "manual", external_id: null, ...over };
}
function cand(over: Partial<MatchCandidateInput> = {}): MatchCandidateInput {
  return { candidate_id: "busan-F-00001", name_ko: "가게", name_en: "Shop",
           district: "수영구", address: "부산광역시 수영구 광안로 1", lat: 35.15, lng: 129.05, ...over };
}

// ── 1~4. 선별 ────────────────────────────────────────────────────────────────

test("★1 P1 restaurant 만 정확히 선별한다", () => {
  const release = [rel("busan-F-1", "restaurant"), rel("busan-F-2", "restaurant"), rel("busan-A-1", "attraction")];
  const enriched = [
    enr("busan-F-1", "restaurant", FULL),                                  // P1
    enr("busan-F-2", "restaurant", { ...FULL, description_en: null }),     // P2 — 보강 부족
    enr("busan-A-1", "attraction", FULL),                                  // P1 이지만 restaurant 아님
  ];
  const got = selectP1Restaurants(release, enriched);
  assert.deepEqual(got.map(r => r.candidate_id), ["busan-F-1"]);
});

test("★2 restaurant 이외 category 는 결과에 없다", () => {
  const release = [rel("a", "attraction"), rel("n", "nature"), rel("e", "event"), rel("ac", "accommodation")];
  const enriched = release.map(r => enr(r.candidate_id, r.category, FULL));
  assert.equal(selectP1Restaurants(release, enriched).length, 0);
});

test("★3 release manifest 에 없는 candidate 는 애초에 후보가 아니다 (HOLD/EXCLUDE 차단)", () => {
  // 37 EXCLUDE_DUPLICATE_SIBLING · 4 HOLD_STRUCTURAL_REVIEW 는 manifest 에 없다
  const enriched = [enr("busan-F-held", "restaurant", FULL)];
  assert.equal(selectP1Restaurants([], enriched).length, 0);
});

test("★4 candidate_id 중복을 검출한다", () => {
  assert.deepEqual(findDuplicateIds([{ candidate_id: "a" }, { candidate_id: "b" }, { candidate_id: "a" }]), ["a"]);
  assert.deepEqual(findDuplicateIds([{ candidate_id: "a" }]), []);
});

test("★등급 규칙 — 좌표가 부산 밖이면 P4, 핵심만 있으면 P2", () => {
  assert.equal(gradeCandidate(rel("x", "restaurant"), enr("x", "restaurant", { ...FULL, lat: 37.5, lng: 127.0 })), "P4");
  assert.equal(gradeCandidate(rel("x", "restaurant"), enr("x", "restaurant", { ...FULL, name_en: null })), "P2");
  assert.equal(gradeCandidate(rel("x", "restaurant"), enr("x", "restaurant", { ...FULL, district: "" })), "P3");
  assert.equal(gradeCandidate(rel("x", "event"), enr("x", "event", FULL)), "EVENT");
  // RELEASE_READY_COMPLETE 는 보강 필드가 없어도 P1
  assert.equal(gradeCandidate(rel("x", "restaurant", "RELEASE_READY_COMPLETE"),
                              enr("x", "restaurant", { ...FULL, name_en: null, description_en: null }, 0)), "P1");
  assert.equal(inBusan(35.15, 129.05), true);
  assert.equal(inBusan(37.5, 127.0), false);
});

// ── 5~10. identity 판정 ──────────────────────────────────────────────────────

test("★5 이름 동일 + 근접 + 구·category 일치 → EXACT", () => {
  const r = classifyCandidate(cand(), [existing({ name: "가게" })]);
  assert.equal(r.klass, "MATCH_EXISTING_MANUAL_EXACT");
  assert.equal(r.existing_id, 1);
});

test("★6 이름 변형 + 근접 → 신규가 아니라 match 로 떨어진다", () => {
  // 실제 사례: `Gwangalli Beach` 와 `Gwangalli Beach & Bridge` 는 같은 장소다.
  // 토큰이 완전히 포함되므로 exact 로 잡히고, 어느 쪽이든 **넣지 않는다** 가 핵심이다.
  const same = classifyCandidate(
    cand({ name_ko: "광안리해수욕장", name_en: "Gwangalli Beach" }),
    [existing({ name: "Gwangalli Beach & Bridge", lat: 35.1512, lng: 129.0503 })],
  );
  assert.notEqual(same.klass, "NEW_INSERT_SAFE");
  assert.equal(same.existing_id, 1);

  // 부분적으로만 겹치는 진짜 변형(60~89%) → LIKELY
  const likely = classifyCandidate(
    cand({ name_ko: "옛골국수본점", name_en: "Old Town Noodle House Main" }),
    [existing({ name: "Old Town Noodle Bar Annex", lat: 35.1512, lng: 129.0503 })],
  );
  assert.equal(likely.klass, "MATCH_EXISTING_MANUAL_LIKELY");
  assert.equal(tokenOverlap(tokensEn("Old Town Noodle House Main"), tokensEn("Old Town Noodle Bar Annex")), 0.6);
});

test("★7 같은 상호라도 멀면 자동 병합하지 않는다 — 다른 지점", () => {
  // 12km 떨어진 동일 상호 → EXACT/LIKELY 금지
  const r = classifyCandidate(cand(), [existing({ name: "가게", lat: 35.26, lng: 128.98, district: "Sasang-gu" })]);
  assert.notEqual(r.klass, "MATCH_EXISTING_MANUAL_EXACT");
  assert.notEqual(r.klass, "MATCH_EXISTING_MANUAL_LIKELY");
});

test("★8 좌표만 가까울 뿐 이름이 다르면 자동 EXACT 를 만들지 않는다", () => {
  const r = classifyCandidate(cand({ name_ko: "전혀다른집", name_en: "Totally Other" }),
                              [existing({ name: "Something Else", lat: 35.1501, lng: 129.0501 })]);
  assert.notEqual(r.klass, "MATCH_EXISTING_MANUAL_EXACT");
  assert.notEqual(r.klass, "MATCH_EXISTING_MANUAL_LIKELY");
});

test("★9 구 불일치 또는 category 불일치면 EXACT 가 아니다", () => {
  const otherDistrict = classifyCandidate(cand(), [existing({ name: "가게", district: "Haeundae-gu" })]);
  assert.notEqual(otherDistrict.klass, "MATCH_EXISTING_MANUAL_EXACT");

  const otherCategory = classifyCandidate(cand(), [existing({ name: "가게", category: "attraction" })]);
  assert.equal(otherCategory.klass, "AMBIGUOUS_REVIEW");
  assert.match(otherCategory.reason, /category/);
});

test("★10 애매하면 넣지 않는다 — 이름 신호 있으나 이격", () => {
  const r = classifyCandidate(cand(), [existing({ name: "가게", lat: 35.157, lng: 129.055 })]);
  assert.equal(r.klass, "AMBIGUOUS_REVIEW");
});

test("★기존 비교 대상이 없으면 신규로 본다", () => {
  assert.equal(classifyCandidate(cand(), []).klass, "NEW_INSERT_SAFE");
});

// ── 11~13. 기존 보호 · lineage ──────────────────────────────────────────────

test("★11 기존 manual row 를 덮어쓰는 출력이 없다", () => {
  const results = classifyAll([cand()], [existing({ name: "가게" })]);
  // 결과는 판정과 참조뿐 — 기존 row 를 바꾸라는 지시가 어떤 형태로도 없다
  for (const r of results) {
    assert.deepEqual(Object.keys(r).sort(),
      ["candidate_id", "distance_m", "existing_id", "existing_name", "klass", "reason"]);
  }
  const src = read("src", "lib", "busan-import", "identity-matcher.ts")
            + read("src", "lib", "busan-import", "city-spots-mapping.ts")
            + read("src", "lib", "busan-import", "p1-selector.ts");
  assert.doesNotMatch(src, /\.(insert|upsert|delete)\s*\(/);
  assert.doesNotMatch(src, /\bfetch\s*\(|createClient|SERVICE_ROLE/);   // 순수 계층 — 네트워크 없음
});

test("★12·13 신규 row 만 lineage 를 받는다", () => {
  const p1 = selectP1Restaurants([rel("busan-F-77", "restaurant")], [enr("busan-F-77", "restaurant", FULL)]);
  const m = mapToCitySpot(p1[0]);
  assert.equal(m.row.source_type, IMPORT_SOURCE_TYPE);
  assert.equal(m.row.source_type, "busan_enrichment_v1");
  assert.equal(m.row.external_id, "busan-F-77");
  assert.equal(m.row.city, CITY_KEY);
  assert.equal(m.row.category, "restaurant");
  assert.deepEqual(validatePreview(m.row), []);
  // 기존 manual 은 source_type='manual' 이라 이 표식과 겹치지 않는다
  assert.notEqual(IMPORT_SOURCE_TYPE, "manual");
});

// ── 14~15. 지어내지 않기 ────────────────────────────────────────────────────

test("★14 raw 영업시간 문자열을 JSONB 자리에 넣지 않는다", () => {
  const p1 = selectP1Restaurants([rel("h", "restaurant")],
                                 [enr("h", "restaurant", { ...FULL, hours: "월-토 : 10:30-18:00" })]);
  const m = mapToCitySpot(p1[0]);
  assert.equal(m.source_raw_hours_available, true);   // 원천에 있다는 사실은 남기고
  assert.equal(m.row.opening_hours, null);            // DB 필드에는 쓰지 않는다
  // 없는 값을 만들지도 않는다
  assert.equal(m.row.duration_minutes, null);
  assert.equal(m.row.subcategory, null);
  assert.equal(m.row.tags, null);
  assert.equal(m.row.best_time_slot, null);
});

test("★15 이미지 권리가 불명확해도 장소를 버리지 않는다", () => {
  const p1 = selectP1Restaurants([rel("i", "restaurant")], [enr("i", "restaurant", FULL)]);
  const m = mapToCitySpot(p1[0]);
  assert.equal(m.image_rights, "IMAGE_RIGHTS_REVIEW");   // operational_assumed → 명시 허가 아님
  assert.equal(m.row.image_url, null);                    // 이미지만 비우고
  assert.equal(m.row.name.length > 0, true);              // 장소는 살아 있다
  assert.equal(classifyImageRights({ ...p1[0], curated_count: 0 }), "NO_IMAGE");
});

// ── 16·20. write 경로 부재 ──────────────────────────────────────────────────

test("★16 dry-run 스크립트에 DB write 수단이 없다", () => {
  const s = read("scripts", "busan-p1-restaurant-dryrun.ts");
  assert.doesNotMatch(s, /method:\s*["'](POST|PUT|PATCH|DELETE)["']/i);
  // DB write 호출 형태만 본다 — createHash().update() 같은 무관한 .update 는 제외
  assert.doesNotMatch(s, /\.(insert|upsert)\s*\(/);
  assert.doesNotMatch(s, /\.delete\s*\(/);
  assert.doesNotMatch(s, /from\s*\([^)]*\)\s*\.\s*(update|insert|upsert|delete)/);
  assert.doesNotMatch(s, /SERVICE_ROLE/);
  // 네트워크 호출은 GET 하나뿐이다
  assert.equal((s.match(/\bfetch\s*\(/g) ?? []).length, 1);
  assert.match(s, /method:\s*"GET"/);
});

test("★20 apply/write 플래그 자체가 존재하지 않는다", () => {
  const s = read("scripts", "busan-p1-restaurant-dryrun.ts");
  for (const flag of ["--apply", "--write", "--upsert", "--production", "--commit"]) {
    assert.doesNotMatch(s, new RegExp(flag.replace(/-/g, "\\-")), flag);
  }
});

// ── 17. 결정론 ──────────────────────────────────────────────────────────────

test("★17 같은 입력이면 분류가 항상 같다", () => {
  const cands = [cand(), cand({ candidate_id: "b", name_ko: "다른집", name_en: "Other House", lat: 35.20, lng: 129.10 })];
  const ex = [existing({ name: "가게" })];
  assert.deepEqual(classifyAll(cands, ex), classifyAll(cands, ex));
  const p1a = selectP1Restaurants([rel("z", "restaurant"), rel("a", "restaurant")],
                                  [enr("z", "restaurant", FULL), enr("a", "restaurant", FULL)]);
  // 정렬까지 결정론적이어야 한다
  assert.deepEqual(p1a.map(r => r.candidate_id), ["a", "z"]);
});

// ── 18~19. 방어 ─────────────────────────────────────────────────────────────

test("★18 필수 필드가 깨진 row 는 INVALID_SKIP", () => {
  assert.equal(classifyCandidate(cand({ name_ko: "" }), []).klass, "INVALID_SKIP");
  assert.equal(classifyCandidate(cand({ lat: NaN }), []).klass, "INVALID_SKIP");
});

test("★19 기존 86건은 판정 입력일 뿐 결과에서 변경 대상이 되지 않는다", () => {
  const ex = [existing({ id: 3, name: "가게" })];
  const before = JSON.stringify(ex);
  classifyAll([cand()], ex);
  assert.equal(JSON.stringify(ex), before);   // 입력 배열이 변형되지 않는다
});

// ── 집합 내부 충돌 ──────────────────────────────────────────────────────────

test("★집합 내부 — 표시명이 같으면 UNIQUE(city,name) 위반이므로 잡는다", () => {
  const rows = [
    { candidate_id: "F-1", display_name: "Woobong Shabu", name_ko: "우봉샤브", name_en: "Woobong Shabu", lat: 35.16071, lng: 129.19269 },
    { candidate_id: "F-2", display_name: "Woobong Shabu", name_ko: "우봉샤브샤브", name_en: "Woobong Shabu", lat: 35.16070, lng: 129.19267 },
  ];
  const c = detectIntraSetConflicts(rows);
  assert.equal(c.size, 2);
  assert.equal(c.get("F-1")!.conflict, "DUPLICATE_SAME_PLACE");
});

test("★집합 내부 — 같은 상호 다른 지점은 이름 충돌로만 잡고 동일 장소로 부르지 않는다", () => {
  const rows = [
    { candidate_id: "F-26",  display_name: "Halmae Jaecheopguk", name_ko: "할매재첩국", name_en: "Halmae Jaecheopguk", lat: 35.19336, lng: 128.98607 },
    { candidate_id: "F-232", display_name: "Halmae Jaecheopguk", name_ko: "할매재첩국", name_en: "Halmae Jaecheopguk", lat: 35.15187, lng: 129.11638 },
  ];
  const c = detectIntraSetConflicts(rows);
  assert.equal(c.get("F-26")!.conflict, "NAME_COLLISION_DIFFERENT_PLACE");
  assert.ok(c.get("F-26")!.distance_m > 5000);
});

test("★집합 내부 — 좌표만 같고 이름이 다르면 충돌이 아니다 (한 건물 안 다른 가게)", () => {
  const rows = [
    { candidate_id: "F-271", display_name: "MOZU",            name_ko: "모즈",      name_en: "MOZU",            lat: 35.1600, lng: 129.1600 },
    { candidate_id: "F-274", display_name: "SUSHI IRUKA",     name_ko: "스시이루카", name_en: "SUSHI IRUKA",     lat: 35.1600, lng: 129.1600 },
    { candidate_id: "F-339", display_name: "MUG Dessert LAB", name_ko: "머그디저트랩", name_en: "MUG Dessert LAB", lat: 35.1600, lng: 129.1600 },
  ];
  const c = detectIntraSetConflicts(rows);
  assert.equal(c.size, 0, "좌표만으로 동일 장소 판정하면 멀쩡한 가게가 사라진다");
  // 대신 정보성 묶음으로는 보고된다
  assert.equal(coordinateClusters(rows, c).length, 3);
});

test("★집합 내부 — 본점/지점 표기 차이는 같은 좌표에서 동일 장소로 잡는다", () => {
  const rows = [
    { candidate_id: "F-39",  display_name: "Ssangdungi Dwaejigukbap Main Store", name_ko: "쌍둥이돼지국밥 본점", name_en: "Ssangdungi Dwaejigukbap Main Store", lat: 35.1570, lng: 129.0590 },
    { candidate_id: "F-254", display_name: "Ssangdungi dwaejigukbap",            name_ko: "쌍둥이돼지국밥",     name_en: "Ssangdungi dwaejigukbap",            lat: 35.1570, lng: 129.0590 },
  ];
  const c = detectIntraSetConflicts(rows);
  assert.equal(c.size, 2);
  assert.equal(c.get("F-39")!.conflict, "DUPLICATE_SAME_PLACE");
});

// ── 보조 helper ─────────────────────────────────────────────────────────────

test("★정규화 helper", () => {
  assert.equal(normalizeKo("홍성방 (본점)"), "홍성방");
  assert.equal(tokenOverlap(tokensEn("Gwangalli Beach"), tokensEn("Gwangalli Beach & Bridge")), 1);
  assert.equal(nameSignalBetween("가게", "Shop", "가게", "Shop"), "exact");
  assert.equal(nameSignalBetween("가게", "A B C", "전혀다름", "X Y Z"), "none");
  // 한글 구 ↔ 로마자 구가 같은 키로 접힌다
  assert.equal(districtKey("해운대구"), districtKey("Haeundae-gu"));
  assert.equal(districtKey("수영구"), districtKey("Suyeong-gu"));
  assert.equal(toRomanDistrict("기장군"), "Gijang-gun");
  assert.equal(toRomanDistrict("없는구"), null);
});

test("★표시명 · 이름 충돌 검사", () => {
  assert.equal(displayName({ name_en: "Shop", name_ko: "가게" }), "Shop");
  assert.equal(displayName({ name_en: null, name_ko: "가게" }), "가게");
  const p1 = selectP1Restaurants([rel("a", "restaurant")], [enr("a", "restaurant", FULL)]);
  const m = [mapToCitySpot(p1[0])];
  assert.deepEqual(findNameCollisions(m, []).withExisting, []);
  assert.deepEqual(findNameCollisions(m, ["Shop"]).withExisting, ["Shop"]);
});
