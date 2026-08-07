// 부산 restaurant 의미 판정 + 이미지 없음 UI 계약 고정.
//
// 이 테스트가 막는 것
//   ① 시장·거리·쿠킹클래스가 `restaurant` 로 운영에 들어가는 것
//      (실제로 운영 6건 중 5건이 그렇게 들어가 있다 — Jagalchi Market · Jeonpo Cafe Street …)
//   ② 사진이 없는 가게에 **아무 스톡 사진이나 붙여** 그 가게 사진인 척하는 것
//      (실제로 일정 화면이 Unsplash 를 하드코딩하고 있었다)

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  classifySemantics, classifyAllSemantics, buildAllowlist,
  hasFoodProviderSignal, isActivityVenue, isCollectiveVenue, isArticleTitle,
  hasIndividualDiningText, type SemanticInput,
} from "./restaurant-semantics.ts";
import { selectP1Restaurants, type ReleaseItem, type EnrichedCandidate } from "./p1-selector.ts";
import {
  PLACEHOLDER_SPOT_IMAGE, resolveSpotImageSrc, hasRealSpotImage, swapToPlaceholderOnError,
} from "../place-image.ts";

const ROOT = process.cwd();
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8");

function si(over: Partial<SemanticInput> = {}): SemanticInput {
  return {
    candidate_id: "busan-F-00001", name_ko: "쌍둥이돼지국밥", name_en: "Ssangdungi Dwaejigukbap",
    description_ko: null, description_en: "A local pork soup place.",
    address: "부산광역시 부산진구 서면로 1",
    source_keys: ["VisitBusanContent:food:70:ko", "FoodService:70:ko"],
    primary_source: "visitbusan_web", ...over,
  };
}

// ── 1~3. 집합 재현 ───────────────────────────────────────────────────────────

test("★1 P1 restaurant 선별이 실제 source 에서 재현된다", () => {
  const release: ReleaseItem[] = JSON.parse(
    read("data", "tourapi", "reports", "busan", "busan-final-place-event-release-manifest.json")).items;
  const enriched: EnrichedCandidate[] = read("data", "tourapi", "enriched", "busan", "busan-enriched-candidates-v1.jsonl")
    .split(/\r?\n/).filter(l => l.trim()).map(l => JSON.parse(l));
  assert.equal(release.length, 1533);
  assert.equal(selectP1Restaurants(release, enriched).length, 371);
});

test("★2·3 전수 분류되고 합계가 보존된다", () => {
  const rows = [si(), si({ candidate_id: "b", source_keys: [] }), si({ candidate_id: "c", name_ko: "부산 로컬푸드 쿠킹클래스" })];
  const out = classifyAllSemantics(rows);
  assert.equal(out.length, rows.length);
  assert.equal(new Set(out.map(o => o.candidate_id)).size, rows.length);
  for (const o of out) assert.ok(o.klass.startsWith("SEMANTIC_"));
});

// ── 4~9. 의미 판정 ───────────────────────────────────────────────────────────

test("★4 음식점 provider 등록 + 부정 신호 없음 → CONFIRMED", () => {
  assert.equal(classifySemantics(si()).klass, "SEMANTIC_RESTAURANT_CONFIRMED");
  assert.equal(hasFoodProviderSignal(["FoodService:70:ko"]), true);
  assert.equal(hasFoodProviderSignal(["VisitBusanContent:food:70:ko"]), true);
  assert.equal(hasFoodProviderSignal(["VisitBusanContent:shopping:1:ko"]), false);
});

test("★5 시장/복합 전체는 restaurant 가 아니다", () => {
  const market = si({ name_ko: "텔레비전에 나온 시장맛집 해운대시장",
                      name_en: "Must-eat places in Haeundae Market as seen on TV shows",
                      description_en: "Haeundae Market is a paradise where people can try out various types of food." });
  assert.equal(classifySemantics(market).klass, "SEMANTIC_NOT_RESTAURANT");

  const hoetown = si({ name_ko: "광안리 바다의 참맛 민락회타운", name_en: "Millak Hoe Town" });
  assert.equal(classifySemantics(hoetown).klass, "SEMANTIC_NOT_RESTAURANT");
  assert.equal(isCollectiveVenue(hoetown), true);
});

test("★6 거리·체험 공간은 restaurant 가 아니다", () => {
  const street = si({ name_ko: "전포 맛집거리", name_en: "Jeonpo Restaurant Street" });
  assert.equal(classifySemantics(street).klass, "SEMANTIC_NOT_RESTAURANT");

  const cls = si({ name_ko: "부산 로컬푸드 쿠킹클래스", name_en: "Busan Local Food Cooking Class" });
  assert.equal(classifySemantics(cls).klass, "SEMANTIC_NOT_RESTAURANT");
  assert.equal(isActivityVenue(cls), true);

  const house = si({ name_ko: "부산 오키친 쿠킹하우스", name_en: "Busan O’Kitchen Cooking House" });
  assert.equal(classifySemantics(house).klass, "SEMANTIC_NOT_RESTAURANT");
});

test("★7 같은 브랜드의 실제 지점은 그대로 통과한다", () => {
  for (const n of ["쌍둥이돼지국밥 본점", "쌍둥이돼지국밥 서면점", "톤쇼우 부산대점"]) {
    assert.equal(classifySemantics(si({ name_ko: n })).klass, "SEMANTIC_RESTAURANT_CONFIRMED", n);
  }
});

test("★8 근거가 부족하면 REVIEW_REQUIRED — 자동 반영하지 않는다", () => {
  // 장소명이 아니라 기사 제목
  const article = si({ name_ko: "달콤한 부산의 매력,", name_en: "Sweet Charm of Busan", source_keys: [] });
  assert.equal(classifySemantics(article).klass, "SEMANTIC_REVIEW_REQUIRED");
  assert.equal(isArticleTitle(article), true);
  // provider 신호도 식음 근거도 없음
  const bare = si({ source_keys: [], description_en: "A place in Busan.", description_ko: null, name_ko: "무언가", name_en: "Something" });
  assert.equal(classifySemantics(bare).klass, "SEMANTIC_REVIEW_REQUIRED");
});

test("★9 이름 keyword 단독으로 판정하지 않는다 — 실측 오탐 방지", () => {
  // '부산' 의 '산', 상호 안의 Street/Park 은 제외 사유가 아니다
  for (const [ko, en] of [["부산족발", "Busan Jokbal"], ["스톤스트리트", "Stone Street"],
                          ["박해윤통영해물밥상", "Park Hae-yun Tongyeong Bapsang"],
                          ["평산옥", "Pyeongsanok"], ["골목포차", "Golmokpocha"]]) {
    assert.equal(classifySemantics(si({ name_ko: ko, name_en: en })).klass,
                 "SEMANTIC_RESTAURANT_CONFIRMED", ko);
  }
  // 반대로 'Cafe' 가 이름에 있다고 무조건 포함하지 않는다 — 거리는 거리다
  assert.equal(classifySemantics(si({ name_ko: "전포 카페거리 맛집거리", name_en: "Jeonpo Cafe Street" })).klass,
               "SEMANTIC_NOT_RESTAURANT");
  // provider 신호가 없어도 개별 카페면 LIKELY 까지는 간다 (CONFIRMED 는 아님)
  const cafe = si({ source_keys: ["VisitBusanContent:experience:1853:ko"],
                    name_ko: "캠핑 컨셉 카페 클래식 캠퍼", name_en: "Classic Camper, camping-theme café" });
  assert.equal(classifySemantics(cafe).klass, "SEMANTIC_RESTAURANT_LIKELY");
  assert.equal(hasIndividualDiningText(cafe), true);
});

test("★10 allowlist 에는 CONFIRMED 만 들어간다", () => {
  const out = classifyAllSemantics([
    si({ candidate_id: "ok" }),
    si({ candidate_id: "cls", name_ko: "쿠킹클래스", name_en: "Cooking Class" }),
    si({ candidate_id: "cafe", source_keys: ["VisitBusanContent:experience:1:ko"], name_ko: "카페 하나", name_en: "One Cafe" }),
    si({ candidate_id: "art", name_ko: "무엇의 매력,", source_keys: [] }),
  ]);
  assert.deepEqual(buildAllowlist(out), ["ok"]);
});

// ── 11~16, 19~20, 22. 이미지 없음 계약 ──────────────────────────────────────

test("★11 정상 이미지는 그대로 쓴다", () => {
  const url = "https://images.unsplash.com/photo-1?w=800";
  assert.equal(resolveSpotImageSrc(url), url);
  assert.equal(hasRealSpotImage(url), true);
});

test("★12·13 null·undefined·빈 문자열·공백은 placeholder 로 간다", () => {
  for (const v of [null, undefined, "", "   ", "\n\t"]) {
    assert.equal(resolveSpotImageSrc(v), PLACEHOLDER_SPOT_IMAGE, JSON.stringify(v));
    assert.equal(hasRealSpotImage(v), false, JSON.stringify(v));
  }
});

test("★14 잘못된 URL·죽은 호스트도 placeholder 로 간다", () => {
  assert.equal(resolveSpotImageSrc("not-a-url"), PLACEHOLDER_SPOT_IMAGE);
  // 실측으로 죽은 것이 확인된 호스트 (운영 86건 중 79건)
  assert.equal(resolveSpotImageSrc("https://source.unsplash.com/800x600/?busan"), PLACEHOLDER_SPOT_IMAGE);
  // 로드 실패 시 교체되고, 무한 루프에 빠지지 않는다
  const el = { currentTarget: { src: "https://dead.example/x.jpg" } };
  swapToPlaceholderOnError(el);
  assert.equal(el.currentTarget.src, PLACEHOLDER_SPOT_IMAGE);
  swapToPlaceholderOnError(el);
  assert.equal(el.currentTarget.src, PLACEHOLDER_SPOT_IMAGE);
});

test("★15·16 'null'·'undefined' 문자열이 src 로 나가지 않는다", () => {
  for (const v of [null, undefined, ""]) {
    const src = resolveSpotImageSrc(v);
    assert.doesNotMatch(src, /null|undefined/);
    assert.equal(src.startsWith("/"), true, "로컬 자산이어야 한다");
  }
});

test("★22 fallback 이 외부 URL 을 쓰지 않는다", () => {
  assert.equal(PLACEHOLDER_SPOT_IMAGE.startsWith("/"), true);
  const mod = read("src", "lib", "place-image.ts");
  assert.doesNotMatch(mod, /https?:\/\//);
  // 일정 화면에서 스톡 사진 날조가 사라졌는지 고정한다
  const page = read("src", "app", "itinerary", "page.tsx");
  assert.doesNotMatch(page, /unsplash\.com/, "카테고리로 스톡 사진을 고르는 코드가 되살아났다");
  assert.doesNotMatch(page, /getCategoryImage/);
});

test("★19·20 optional 필드가 NULL 이어도 표시가 깨지지 않는다", () => {
  // dry-run mapping 이 내보내는 값들: subcategory·duration·hours·tags·image 전부 NULL
  const row = { subcategory: null, category: "restaurant", district: null,
                duration_minutes: null, opening_hours: null, tags: null, image_url: null };
  // 화면이 쓰는 폴백 규칙과 동일한 형태로 확인
  assert.equal(row.subcategory || row.category, "restaurant");
  assert.equal(resolveSpotImageSrc(row.image_url), PLACEHOLDER_SPOT_IMAGE);
  const chips = [row.category, row.subcategory, row.district].filter(Boolean);
  assert.deepEqual(chips, ["restaurant"]);   // 빈 칩을 만들지 않는다
});

// ── 23~25. 안전 ─────────────────────────────────────────────────────────────

test("★23·24 의미 게이트 스크립트에 DB write 경로가 없다", () => {
  const s = read("scripts", "busan-p1-restaurant-semantic-gate.ts");
  assert.doesNotMatch(s, /method:\s*["'](POST|PUT|PATCH|DELETE)["']/i);
  assert.doesNotMatch(s, /\.(insert|upsert)\s*\(/);
  assert.doesNotMatch(s, /\.delete\s*\(/);
  assert.doesNotMatch(s, /SERVICE_ROLE/);
  assert.match(s, /method:\s*"GET"/);
  for (const f of ["--apply", "--write", "--upsert", "--production"]) {
    assert.doesNotMatch(s, new RegExp(f.replace(/-/g, "\\-")), f);
  }
});

test("★25 의미 판정 모듈은 순수하다 — 네트워크·DB 없음", () => {
  const s = read("src", "lib", "busan-import", "restaurant-semantics.ts")
          + read("src", "lib", "place-image.ts");
  assert.doesNotMatch(s, /\bfetch\s*\(|createClient|supabase/i);
});
