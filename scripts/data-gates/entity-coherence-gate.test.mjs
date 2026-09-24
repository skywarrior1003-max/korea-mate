// Entity Coherence Gate 회귀 테스트 (OFF-17463 사건 fixture 기반)
// 실행: node --test scripts/data-gates/entity-coherence-gate.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkCandidate, GOVERNMENT_PHONES, distMeters } from "./entity-coherence-gate.mjs";

const read = p => JSON.parse(readFileSync(p, "utf8"));
const NEG = read("data/quality-gates/off-17463/negative-fixture.json");
const POS = read("data/quality-gates/off-17463/positive-fixture.json");
const CATALOG = read("data/jeonju-raw-collection-v1/jeonju-final-service-catalog-v1.json");

test("negative fixture — 실사건 재현이 전 게이트에 걸린다", () => {
  const r = checkCandidate(NEG);
  assert.equal(r.quarantine, true, "Final 승격이 차단돼야 한다");
  const kinds = r.verdicts.join("\n");
  assert.match(kinds, /AMBIGUOUS_UNREVIEWED/);
  assert.match(kinds, /CATEGORY_MISMATCH/, "FOOD↔숙박 불일치");
  assert.match(kinds, /COORD_ENTITY_CONFLICT|NEAR_BUT_DIFFERENT_NAME/, "77.6m·이름 불일치");
  assert.match(kinds, /GOVERNMENT_PHONE/, "전주시청 대표번호");
  assert.ok(r.fieldExclusions.includes("image"), "침대 이미지 배제");
  assert.ok(r.fieldExclusions.includes("phone"), "기관 번호 배제");
  assert.match(kinds, /IMAGE_NOT_ELIGIBLE/, "display_eligible:false hard gate");
});

test("positive fixture — 단일 entity·이미지 없음은 승격 가능", () => {
  const r = checkCandidate(POS);
  assert.equal(r.quarantine, false, r.verdicts.join(" | "));
  assert.deepEqual(r.fieldExclusions, [], "이미지 없음은 정상값 — 배제 목록 없음");
});

test("교정된 Final catalog OFF-17463 — 게이트 통과·오염값 0", () => {
  const row = CATALOG.all_candidates.find(c => c.candidate_id === "OFF-17463");
  assert.ok(row, "OFF-17463 존재");
  const r = checkCandidate(row);
  assert.equal(r.quarantine, false, r.verdicts.join(" | "));
  assert.equal(row.match_type, "OFFICIAL_ONLY");
  assert.equal(row.phone, "063-288-4020");
  assert.equal(row.kto_cid, "");
  const s = JSON.stringify(row);
  assert.ok(!s.includes("향교길"), "숙소 주소 잔존");
  assert.ok(!s.includes("2570942"), "침대 이미지 잔존");
  assert.ok(!s.includes("다나하루"), "숙소 identity 잔존");
  assert.ok(!s.includes("063-222-1000"), "기관 번호 잔존");
});

test("교정 row 재오염 시나리오 — kto 숙박 결합을 되살리면 즉시 quarantine", () => {
  const row = CATALOG.all_candidates.find(c => c.candidate_id === "OFF-17463");
  const relapse = { ...row, match_type: "AMBIGUOUS", identity_review: false,
    kto_cid: "2571938", kto_type: "숙박", kto_title: "다나하루(다나하루 게스트하우스)",
    kto_lat: "35.8117868380", kto_lng: "127.1502588720" };
  const r = checkCandidate(relapse);
  assert.equal(r.quarantine, true);
});

test("거리 함수·기관 번호 목록 sanity", () => {
  const m = distMeters("35.8111035497203", "127.150406207841", "35.8117868380", "127.1502588720");
  assert.ok(m > 70 && m < 85, `실사건 거리 ${m.toFixed(1)}m ≈ 77.6m`);
  assert.ok(GOVERNMENT_PHONES.has("063-222-1000"));
});

test("catalog 전수 — AMBIGUOUS 미해소 후보는 전부 quarantine 로 표면화된다", () => {
  const list = CATALOG.all_candidates;
  const ambiguous = list.filter(c => c.match_type === "AMBIGUOUS" && c.identity_review !== true);
  for (const c of ambiguous) {
    assert.equal(checkCandidate(c).quarantine, true, c.candidate_id);
  }
  // OFF-17463 은 더 이상 그 목록에 없다
  assert.ok(!ambiguous.some(c => c.candidate_id === "OFF-17463"));
});
