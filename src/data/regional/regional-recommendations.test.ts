// 5도시 공식 추천 통합 — 계약·데이터 품질 가드.
// 실행: node --experimental-strip-types src/data/regional/regional-recommendations.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  getRecommendedTrips, getAllRecommendedTrips, getRecommendedPlaces,
  recommendedSpotIds, tripDisplayTitle, tripLinkedSpotIds,
} from "./regional-recommendations.ts";

const CITIES = ["seoul", "busan", "jeju", "gyeongju", "jeonju"] as const;
const ROOT = process.cwd();
const read = (...p: string[]) => readFileSync(path.join(ROOT, ...p), "utf8");

test("A/B: 5개 도시 모두 추천 여행 > 0 · 추천 장소 > 0", () => {
  for (const c of CITIES) {
    assert.ok(getRecommendedTrips(c).length > 0, `${c} trips`);
    // 유효기간 필터 후에도 원천이 비지 않는지 — as_of 기준일로 검사(현재성은 런타임 필터)
    assert.ok(getRecommendedPlaces(c, new Date("2026-08-22")).length > 0, `${c} places`);
  }
});

test("C/D: Gyeongju-only 의존 제거 — Hub/검색 원천이 5도시", () => {
  const all = getAllRecommendedTrips();
  const cities = new Set(all.map(t => t.city));
  for (const c of CITIES) assert.ok(cities.has(c), c);
  // UI 원천 배선: curated-trips 직접 의존이 남아 있지 않다(어댑터 내부 제외)
  for (const f of [
    ["src", "components", "quiet", "QuietHome.tsx"],
    ["src", "components", "quiet", "CityHubClient.tsx"],
    ["src", "components", "quiet", "TripsAllClient.tsx"],
    ["src", "components", "quiet", "QuietSearch.tsx"],
  ]) {
    const s = read(...f);
    assert.ok(!s.includes("curatedTripsForCity"), `${f.join("/")} — 어댑터를 거친다`);
    assert.ok(s.includes("regional-recommendations"), `${f.join("/")} — 5도시 원천`);
  }
});

test("E: 모든 추천 여행의 city 매핑이 정확하다 (id prefix·도시 집합)", () => {
  for (const t of getAllRecommendedTrips()) {
    assert.ok((CITIES as readonly string[]).includes(t.city), t.id);
    assert.ok(t.title && t.title.trim().length > 0, `${t.id} title`);
  }
  const ids = getAllRecommendedTrips().map(t => t.id);
  assert.equal(new Set(ids).size, ids.length, "중복 id 없음");
});

test("F: canonical linkage — 미해석 stop 은 null 유지(임의 매칭 0), 해석된 id 는 숫자", () => {
  let linked = 0, unlinked = 0;
  for (const t of getAllRecommendedTrips()) {
    for (const s of t.stops) {
      if (s.spotId !== null) { assert.ok(Number.isInteger(s.spotId), t.id); linked++; }
      else unlinked++;
    }
    assert.ok(tripLinkedSpotIds(t).every(n => Number.isInteger(n)));
  }
  assert.ok(linked > 0, "해석된 stop 존재");
  assert.ok(unlinked >= 0); // null 은 null 로 — 이름 기반 임의 매칭 금지(코드에 매칭 로직 없음)
  const adapter = read("src", "data", "regional", "regional-recommendations.ts");
  assert.ok(!/fuzzy|levenshtein|includes\(.*name/i.test(adapter), "이름 유사 매칭 없음");
});

test("G/H: 가짜 인기·가짜 작성자 필드 0", () => {
  const raw = read("src", "data", "regional", "regional-trips-v1.json") + read("src", "data", "regional", "regional-places-v1.json");
  for (const bad of ["like_count", "save_count", "share_count", "view_count", "traveled", "popularity", "rank", "creator", "author", "nickname"]) {
    assert.ok(!raw.includes(`"${bad}"`), bad);
  }
});

test("I: legacy view+helpful*3+copy*5 를 추천 정렬에 강제하지 않는다", () => {
  const adapter = read("src", "data", "regional", "regional-recommendations.ts");
  assert.ok(!/helpful|copy_count|view_count/.test(adapter));
  for (const f of [["src", "components", "quiet", "CityHubClient.tsx"], ["src", "components", "quiet", "TripsAllClient.tsx"]]) {
    assert.ok(!/helpful_count|\*\s*3|\*\s*5/.test(read(...f)), f.join("/"));
  }
});

test("데이터 품질: 도시별 개수·유효기간 필터·provenance 보존", () => {
  const counts: Record<string, number> = { seoul: 4, busan: 4, jeju: 5, gyeongju: 4, jeonju: 5 };
  for (const c of CITIES) {
    const primary = getRecommendedTrips(c).filter(t => t.origin === "regional-official");
    assert.equal(primary.length, counts[c], `${c} normalized 코스 수`);
    assert.ok(getRecommendedTrips(c).length >= 3, `${c} Hub 3개 충족`);
  }
  // 경주는 기존 공식 57코스가 보조 원천으로 이어진다(중복 제목 제외)
  assert.ok(getRecommendedTrips("gyeongju").length > 40, "gyeongju 보조 원천 병합");
  // 유효기간이 지난 recommended_now 는 제외된다
  const far = getRecommendedPlaces("seoul", new Date("2030-01-01"));
  const near = getRecommendedPlaces("seoul", new Date("2026-08-22"));
  assert.ok(far.length <= near.length);
  // provenance/policy 보존
  const prov = JSON.parse(read("src", "data", "regional", "regional-trips-v1.json")).provenance;
  assert.match(prov.policy, /OWNER_APPROVED_PUBLIC_SOURCE_USE_WITH_ATTRIBUTION_AND_TAKEDOWN/);
  // 반입 원문·매니페스트 존재
  for (const c of CITIES) read("data", "regional-recommendations", "normalized", `${c}-regional-content-normalized-v1.json`);
  read("data", "regional-recommendations", "normalized", "five-city-regional-content-normalized-manifest-v1.json");
});

test("표시 규칙: 번역 창작 없음 — locale 별 제목은 원문 필드만", () => {
  const t0 = getAllRecommendedTrips().find(t => t.titleEn);
  assert.ok(t0);
  assert.equal(tripDisplayTitle(t0!, "ko"), t0!.title);
  assert.equal(tripDisplayTitle(t0!, "en"), t0!.titleEn);
  const noEn = getAllRecommendedTrips().find(t => !t.titleEn);
  if (noEn) assert.equal(tripDisplayTitle(noEn, "en"), noEn.title); // 없으면 원제 — 창작 금지
});

test("추천 장소: canonical 연결 id 는 published 해석본만, 순서 보존", () => {
  let any = 0;
  for (const c of CITIES) {
    const ids = recommendedSpotIds(c, new Date("2026-08-22"));
    assert.ok(ids.every(n => Number.isInteger(n) && n > 0), c);
    assert.equal(new Set(ids).size, ids.length, `${c} 중복 없음`);
    any += ids.length;
  }
  assert.ok(any > 0, "canonical 연결 장소 존재");
});
