// 5도시 공식 추천 통합 — 계약·데이터 품질 가드.
// 실행: node --experimental-strip-types src/data/regional/regional-recommendations.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  getRecommendedTrips, getAllRecommendedTrips, getRecommendedPlaces,
  recommendedSpotIds, tripDisplayTitle, tripLinkedSpotIds,
  getCityEvents, getCityEventById, getTravelEssentials, essentialSummary,
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

// ── P0-4: 코스 상세 라우트 안전 — id 가 곧 URL 세그먼트다 ────────────────────

test("코스 id 는 도시 안에서 유일하고 URL-safe 하다 (정적 상세 라우트 전제)", () => {
  for (const c of CITIES) {
    const trips = getRecommendedTrips(c);
    const ids = trips.map(t => t.id);
    assert.equal(new Set(ids).size, ids.length, `${c} 중복 id`);
    for (const id of ids) assert.match(id, /^[A-Za-z0-9-]+$/, `${c}:${id}`);
  }
});

// ── P0-2: City Hub Events + Travel Essentials ───────────────────────────────

test("Events: 기간 명시 콘텐츠만 · 종료분 제외 · 상태는 ISO 날짜에서만 계산", () => {
  // as_of(2026-08-22) 기준 — 5도시 전부 이벤트가 존재한다
  for (const c of CITIES) assert.ok(getCityEvents(c, new Date("2026-08-22")).length > 0, `${c} events`);
  const busan = getCityEvents("busan", new Date("2026-09-06"));
  assert.ok(!busan.some(e => e.id === "busan-RN-002"), "8/31 종료 행사 제외");
  const ongoing = getCityEvents("seoul", new Date("2026-09-06")).find(e => e.id === "seoul-RN-001");
  assert.equal(ongoing?.status, "ongoing");
  const upcoming = getCityEvents("seoul", new Date("2026-07-01")).find(e => e.id === "seoul-RN-001");
  assert.equal(upcoming?.status, "upcoming");
  // 원문이 ISO 가 아닌 기간("… TBC")은 상태를 지어내지 않는다
  const tbc = getCityEvents("jeju", new Date("2026-09-06")).find(e => e.id === "jeju-RN-R01");
  assert.ok(tbc);
  assert.equal(tbc!.status, null);
  // 모든 이벤트는 상세 이동 경로(내부 place 또는 공식 URL)를 가진다
  for (const c of CITIES) for (const e of getCityEvents(c, new Date("2026-08-22"))) {
    assert.ok(e.spotId !== null || Boolean(e.source && (e.source as { source_url?: string | null }).source_url), `${e.id} detail path`);
  }
});

test("Event 상세 단건 조회: 종료분도 찾되 지난 행사에 상태를 붙이지 않는다", () => {
  // busan-RN-002 는 8/31 종료 — 목록에선 빠지지만 상세는 열린다
  const ended = getCityEventById("busan", "busan-RN-002", new Date("2026-09-06"));
  assert.ok(ended);
  assert.equal(ended!.status, null);
  const live = getCityEventById("seoul", "seoul-RN-001", new Date("2026-09-06"));
  assert.equal(live?.status, "ongoing");
  assert.equal(getCityEventById("seoul", "no-such-id"), null);
});

test("Travel Essentials: Final 기준 수치 그대로(부산7·서울13·제주12·경주8·전주10)", () => {
  const expected: Record<string, number> = { busan: 7, seoul: 13, jeju: 12, gyeongju: 8, jeonju: 10 };
  for (const c of CITIES) {
    const es = getTravelEssentials(c);
    assert.equal(es.length, expected[c], `${c} essentials`);
    for (const e of es) {
      assert.ok(e.title && e.title.trim(), `${e.id} title`);
      assert.equal(e.city, c);
      // summary 는 문자열이든 l10n 객체든 렌더 가능한 문자열(또는 null)로만 해석된다
      for (const loc of ["ko", "en", "ja", "zh"]) {
        const v = essentialSummary(e, loc);
        assert.ok(v === null || typeof v === "string", `${e.id} summary ${loc}`);
      }
    }
  }
  // 제주 원문 summary 는 l10n 객체 — ko 해석이 실제 문자열로 나온다(객체 렌더 사고 방지)
  const jejuFirst = getTravelEssentials("jeju")[0];
  assert.equal(typeof essentialSummary(jejuFirst, "ko"), "string");
  assert.equal(typeof essentialSummary(jejuFirst, "en"), "string"); // en 없으면 ko fallback — 창작 없음
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

// ── FOUR-CITY-REGIONAL-DATA-INTAKE-V1: 경주 linkage 수리 고정 ────────────────
//
// 근거: 패키지 canonical(0c3a45e) × Main city_spot_sources.source_key 정확 브리지
// (월정교=454 · 대릉원=436 · 오릉=475 · 삼릉=473, 2026-09-14 READ-ONLY 실측).
// 스왑/밀림이 되돌아오면 코스 화면이 다른 장소의 이름·사진을 다시 보여주게 된다.
test("경주 linkage 수리 스냅숏 — 스왑 복귀 금지(identity 브리지 근거)", () => {
  const byId = new Map(getRecommendedTrips("gyeongju").map(t => [t.id, t]));
  const stop = (tripId: string, i: number) => byId.get(tripId)!.stops[i]!;
  // 월정교 ↔ 대릉원 스왑 해소
  assert.equal(stop("gyeongju-C-001", 1).spotId, 454, "C-001 월정교=454");
  assert.equal(stop("gyeongju-C-001", 3).spotId, 436, "C-001 대릉원=436");
  assert.equal(stop("gyeongju-C-002", 1).spotId, 436, "C-002 대릉원=436");
  assert.equal(stop("gyeongju-C-002", 4).spotId, 454, "C-002 월정교=454");
  assert.equal(stop("gyeongju-C-003", 0).spotId, 454, "C-003 월정교=454");
  // 오프셋 해소
  assert.equal(stop("gyeongju-C-003", 1).spotId, 475, "C-003 오릉=475");
  assert.equal(stop("gyeongju-C-003", 5).spotId, 473, "C-003 삼릉=473");
  // V2: 월성 발굴현장 — 경주 월성(427) 실존 확인으로 unlink 를 재연결로 승격
  assert.equal(stop("gyeongju-C-001", 5).spotId, 427, "C-001 월성=427");
  // V2: 배동석조여래삼존입상 — 정확 명칭 행(672) 실존 확인(665 배동 삼릉과 별개 실체)
  assert.equal(stop("gyeongju-C-003", 4).spotId, 672, "C-003 삼존입상=672");
  // 정합 확인 유지분(브리지 일치): 계림·첨성대·나정·포석정·분황사·동궁·박물관·보문
  assert.equal(stop("gyeongju-C-002", 3).spotId, 425);
  assert.equal(stop("gyeongju-C-001", 2).spotId, 457);
  assert.equal(stop("gyeongju-C-003", 2).spotId, 468);
  assert.equal(stop("gyeongju-C-003", 3).spotId, 481);
});

// ── SECONDARY-CONFLICT-RESOLUTION-V2: 부산·전주 identity 수리 고정 ───────────
//
// 근거: 공식 주소·좌표·정체성 실측(docs/data-collection/four-city-regional-main-intake-v1.md §10).
// 원칙 — 코스 stop 은 '관광지 본체' 행에 연결한다(내부 시설·인접 별개 시설 행 금지).
test("부산·전주 identity 수리 스냅숏 — 본체 행 연결 복귀 금지", () => {
  const trips = new Map(getAllRecommendedTrips().map(t => [t.id, t]));
  const stop = (tripId: string, i: number) => trips.get(tripId)!.stops[i]!;
  // 부산: 본체 행(구 연결은 내부시설/인접 별개 행이었다)
  assert.equal(stop("busan-C-001", 0).spotId, 26, "범어사=사찰 본체(박물관 1073 아님)");
  assert.equal(stop("busan-C-001", 6).spotId, 28, "오륙도스카이워크=28(섬 961 아님)");
  assert.equal(stop("busan-C-002", 10).spotId, 28);
  assert.equal(stop("busan-C-001", 8).spotId, 990, "영도대교=990(해돋이전망대 950 아님)");
  assert.equal(stop("busan-C-002", 0).spotId, 990);
  assert.equal(stop("busan-C-001", 10).spotId, 2, "감천문화마을=마을 본체(어린왕자 1081 아님)");
  assert.equal(stop("busan-C-001", 12).spotId, 19, "다대포해수욕장=19(바다누리길 1054 아님)");
  assert.equal(stop("busan-C-003", 10).spotId, 19);
  assert.equal(stop("busan-C-002", 5).spotId, 1319, "부평깡통시장=1319(남포지하상가 954 아님)");
  assert.equal(stop("busan-C-002", 12).spotId, 16, "광안리=16(공연장 1061 아님)");
  assert.equal(stop("busan-C-003", 7).spotId, 16);
  assert.equal(stop("busan-C-R01", 3).spotId, 16);
  // 송도는 963 이 해수욕장 본체 기사 — 의심 해소·유지
  assert.equal(stop("busan-C-001", 11).spotId, 963, "송도=963 유지");
  // 전주: 오목대·이목대 — 정확 명칭 행(778). 764 는 이름(전주천)·좌표(오목대) 불일치 twin 의심(보고)
  assert.equal(stop("jeonju-C-002", 2).spotId, 778, "오목대·이목대=778");
});

// ── CONTENT-RECOVERY-V1: 미연결 stop 연결 복구 고정 ─────────────────────────
//
// 근거: 명칭+공식 주소·좌표 identity 실측(intake 문서 §15). 이름 유사도 단독 매칭 0.
test("연결 복구 스냅숏 — 26 occurrence(부산17·제주4·경주5), 복귀 금지", () => {
  const trips = new Map(getAllRecommendedTrips().map(t => [t.id, t]));
  const stop = (tripId: string, i: number) => trips.get(tripId)!.stops[i]!;
  const expect: Array<[string, number, number]> = [
    ["busan-C-001", 1, 58], ["busan-C-001", 2, 993], ["busan-C-001", 4, 17], ["busan-C-001", 13, 980], ["busan-C-001", 14, 65],
    ["busan-C-002", 2, 48], ["busan-C-002", 4, 22], ["busan-C-002", 8, 1645], ["busan-C-002", 9, 38],
    // #5(해리단길)의 1633 연결은 오연결로 판명(1633=기프트샵 '바다처럼') — RETRACTED, 아래 별도 테스트
    ["busan-C-003", 2, 54], ["busan-C-003", 3, 985], ["busan-C-003", 5, 40], ["busan-C-003", 8, 980], ["busan-C-003", 9, 1360],
    ["busan-C-R01", 1, 43], ["busan-C-R01", 2, 1273],
    ["jeju-C-001", 2, 1690], ["jeju-C-001", 3, 1684], ["jeju-C-002", 1, 1810], ["jeju-C-002", 2, 1698],
    ["gyeongju-C-002", 6, 455], ["gyeongju-C-003", 6, 1617],
    ["gyeongju-C-R01", 5, 507], ["gyeongju-C-R01", 6, 504], ["gyeongju-C-R01", 7, 528],
  ];
  for (const [tid, i, id] of expect) assert.equal(stop(tid, i).spotId, id, `${tid}#${i + 1}`);
  // 의도적 미연결 유지(대응 행 부재/unpublished/맥락형) — 억지 연결 금지
  for (const [tid, i] of [["busan-C-002", 11], ["busan-C-003", 0], ["busan-C-003", 1], ["busan-C-003", 6]] as const) {
    assert.equal(stop(tid, i).spotId, null, `${tid}#${i + 1} 미연결 유지`);
  }
});

// ── REMAINING-DATA-CLOSEOUT-V1: 기존 행 재발견 연결 고정 ─────────────────────
//
// 중복 실사에서 "행 부재 후보"로 분류했던 2곳이 기존 공개 행으로 실존 판명(intake 문서 §17):
// 밀락더마켓=1332(KTO 2862152 와 10m)·서빈백사해수욕장=2797 산호해수욕장(KTO 598558 과 64m, 동일 해변 병기명).
test("연결 복구 V2 스냅숏 — 기존 행 재발견 2건, 복귀 금지", () => {
  const trips = new Map(getAllRecommendedTrips().map(t => [t.id, t]));
  const stop = (tripId: string, i: number) => trips.get(tripId)!.stops[i]!;
  assert.equal(stop("busan-C-R01", 0).spotId, 1332, "밀락더마켓=1332");
  assert.equal(stop("busan-C-R01", 0).linkage, "IDENTITY_LINK_RECOVERY_V2");
  assert.equal(stop("jeju-C-R02", 1).spotId, 2797, "서빈백사=2797 산호해수욕장");
  assert.equal(stop("jeju-C-R02", 1).linkage, "IDENTITY_LINK_RECOVERY_V2");
});

// ── DISCOVERY-COMMERCE-AND-CONTENT-REPAIR-V1 (2026-09-17) ────────────────────
//
// 1633 은 해리단길 '거리'가 아니라 거리 내 기프트샵 '바다처럼'(visitbusan VB-2581)으로
// 판명 — 코스 연결을 철회한다. 매장 행 자체는 보존(카탈로그 무접촉 — 데이터 패치는 별도).
test("1633 오연결 철회 — 해리단길 stop 은 미연결 유지, 재연결 금지", () => {
  const trips = new Map(getAllRecommendedTrips().map(t => [t.id, t]));
  const s = trips.get("busan-C-003")!.stops[4]!;
  assert.equal(s.name, "해리단길");
  assert.equal(s.spotId, null, "1633(바다처럼) 재연결 금지 — 거리 본체는 신규 insert 트랙");
  assert.equal(s.linkage, "IDENTITY_LINK_RETRACTED_V1");
});

// 낙산 야간 코스(seoul-C-R01) — STO 공식 원문(KON000645 도보코스)의 방문 순서 복구.
// 창작 0: 흥인지문→한양도성박물관→이화마을→낙산공원→혜화문. 카탈로그 본체 부재라
// 전부 name-only(TRUE_NEW_PLACE_CANDIDATE) — 임의 매칭 금지.
test("seoul-C-R01 낙산 stops 원문 복구 스냅숏", () => {
  const trips = new Map(getAllRecommendedTrips().map(t => [t.id, t]));
  const stops = trips.get("seoul-C-R01")!.stops;
  assert.equal(stops.length, 5);
  assert.deepEqual(stops.map(s => s.name), ["흥인지문 (동대문)", "한양도성박물관", "이화마을", "낙산공원", "혜화문"]);
  for (const s of stops) { assert.equal(s.spotId, null); assert.equal(s.linkage, "TRUE_NEW_PLACE_CANDIDATE"); }
  assert.equal(stops[0]!.nameEn, "Dongdaemun (Heunginjimun Gate)", "EN 은 STO EN 페이지 verbatim 만");
});
