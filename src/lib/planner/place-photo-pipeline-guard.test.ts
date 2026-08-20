/**
 * TASK-TRIP-PLACE-PHOTO-PIPELINE-RESTORE-01 — 장소 사진 pipeline 계약 가드
 * Run: node --experimental-strip-types --test src/lib/planner/place-photo-pipeline-guard.test.ts
 *
 * 계약:
 *  - planner 표시 조회(buildPlaceMap)는 city_spots.image_url 을 가져와
 *    PlaceDisplay.image 로 전달한다. 빈 값이면 필드를 내보내지 않는다.
 *  - 스케줄링 후보 조회는 image 를 모른다 — 사진 추가가 일정 선택/순서를
 *    바꿀 수 없음을 select 문 자체로 보증한다.
 *  - 일정 Place 는 optional image 를 보존한다 (생성·수동 추가·저장·재열기).
 *  - 공개/복사 serializer 는 이번 TASK 에서 image 를 내보내지 않는다
 *    (공개 계약 확장은 후속 공개 화면 TASK — Case B).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { publicPlace, serializePublicDays } from "../share/public-story.ts";
import { buildCopiedItinerary } from "../share/copied-itinerary.ts";
import { isValidDays } from "../itinerary-validate.ts";

const ROOT = new URL("../../../", import.meta.url);
const read = (p: string) => readFileSync(new URL(p, ROOT), "utf8");

const planSrc = read("functions/api/trip/plan.ts");
const pageSrc = read("src/app/itinerary/page.tsx");
const validateSrc = read("src/lib/itinerary-validate.ts");

// ── planner 서버 ──────────────────────────────────────────────────────────────

test("P1: buildPlaceMap select 에 image_url 이 포함된다", () => {
  assert.ok(
    planSrc.includes('"id, name, subcategory, category, description, district, lat, lng, image_url"'),
    "표시 조회 select 에 image_url 이 있어야 한다",
  );
});

test("P2: PlaceDisplay 매핑이 image_url 을 image 로 전달하고 빈 값은 버린다", () => {
  assert.match(planSrc, /image:\s*typeof row\.image_url === "string" && row\.image_url\.trim\(\) !== ""/);
  assert.match(planSrc, /image\?:\s*string/);
});

test("P3: 스케줄링 후보 select 는 image 를 모른다 — 일정 선택에 영향 불가", () => {
  assert.ok(
    planSrc.includes('.select("id, category, lat, lng, district, tags")'),
    "후보 조회 select 가 기존 그대로여야 한다",
  );
  const candidateSelect = planSrc.indexOf('.select("id, category, lat, lng, district, tags")');
  assert.ok(candidateSelect >= 0);
  assert.ok(
    !planSrc.slice(candidateSelect, candidateSelect + 60).includes("image"),
    "후보 조회에 image 가 섞이면 안 된다",
  );
});

// ── 클라이언트 일정 ───────────────────────────────────────────────────────────

test("C1: 클라이언트 Place/PlaceDisplay 가 optional image 를 선언한다", () => {
  const placeDisplayCount = (pageSrc.match(/image\?:\s+string/g) ?? []).length;
  assert.ok(placeDisplayCount >= 2, "Place 와 PlaceDisplay 양쪽에 image?: string 이 있어야 한다");
});

test("C2: planner 생성 Place 가 display.image 를 보존한다", () => {
  assert.match(pageSrc, /image:\s+display\.image,/);
});

test("C3: 수동 추가(addCitySpotToDay)도 spot.image 를 보존한다", () => {
  assert.match(pageSrc, /image:\s+spot\.image,/);
});

test("C4: ItineraryPlace 문서 계약에 image 가 있다", () => {
  assert.match(validateSrc, /image\?:\s+string/);
});

// ── 저장 계약 ────────────────────────────────────────────────────────────────

const V2_DAYS = {
  __v: 2,
  scheduled: [{
    date: "2026-07-01", dayNumber: 1,
    places: [
      { name: "Haeundae Beach", category: "beach", location: "Haeundae", time: "10:00",
        duration: "90m", tips: "t", slot: "Morning", googleMapsUrl: "https://maps.example",
        source: "city_spot", place_id: "42", image: "https://img.example/haeundae.jpg" },
      { name: "No Image Spot", category: "food", location: "Jung-gu", time: "12:00",
        duration: "60m", tips: "", slot: "Lunch", googleMapsUrl: "" },
    ],
  }],
  unscheduled: [],
};

test("S1: image 가 있는 places 를 담은 v2 days 도 저장 검증을 통과한다", () => {
  assert.equal(isValidDays(V2_DAYS), true);
  assert.equal(isValidDays(V2_DAYS.scheduled), true); // legacy 배열 형식
});

test("S2: image 없는 legacy place 와 섞여 있어도 유효하다 (하위 호환)", () => {
  const legacyOnly = [{ date: "2026-07-01", dayNumber: 1, places: [{ name: "Old Spot" }] }];
  assert.equal(isValidDays(legacyOnly), true);
});

// ── 공개/복사 경계 (Case B — 이번 TASK 에서 확장하지 않음) ────────────────────

test("B1: 공개 serializer 는 place image 를 내보내지 않는다", () => {
  const out = publicPlace(V2_DAYS.scheduled[0].places[0]);
  assert.equal("image" in out, false, "공개 place 에 image 가 나가면 공개 계약 무단 확장이다");
  assert.equal(out.name, "Haeundae Beach");
});

test("B2: 공개 days 전체 직렬화에도 image 가 없다", () => {
  const s = JSON.stringify(serializePublicDays(V2_DAYS));
  assert.ok(!s.includes("img.example"), "공개 days 에 image 값이 새면 안 된다");
});

test("B3: 복사본 days 에도 image 가 새지 않는다 (기존 복사 계약 유지)", () => {
  const s = JSON.stringify(buildCopiedItinerary(V2_DAYS));
  assert.ok(!s.includes("img.example"));
});
