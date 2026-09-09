// Sharing visual 계약 — 실제 제목 우선·비광고 설명·5도시 fallback·소스 가드.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  shareTitle, isActualTitle, shareDescription, cardTitleFontPx,
  cityShareFallback, CITY_SHARE_FALLBACK, countDaysPlaces, BRAND_OG,
} from "./sharing-visual-core.ts";

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");

test("실제 Trip title 이 있으면 그대로 — generic 으로 덮어쓰지 않는다", () => {
  assert.equal(shareTitle("Busan: Three Meals Deep", "busan", 2), "Busan: Three Meals Deep");
  assert.equal(isActualTitle("Busan: Three Meals Deep"), true);
});

test("title 이 없을 때만 도시·일수 fallback", () => {
  assert.equal(shareTitle("", "busan", 2), "2-Day Busan Trip");
  assert.equal(shareTitle(null, "jeonju", 3), "3-Day Jeonju Trip");
  assert.equal(isActualTitle("  "), false);
});

test("description 은 광고가 아니라 사실 요약이다", () => {
  const d = shareDescription({ city: "busan", dayCount: 2, placeCount: 13, startDate: "2026-09-06", endDate: "2026-09-08" });
  assert.equal(d, "Busan · 2 days · 13 places · 2026-09-06 – 2026-09-08");
  for (const bad of [/plan yours/i, /free/i, /AI-generated/i, /sign.?up/i]) {
    assert.doesNotMatch(d, bad);
  }
  assert.equal(shareDescription({ city: "jeju", dayCount: 1, placeCount: 1 }), "Jeju · 1 day · 1 place");
});

test("5도시 fallback 전부 존재 — jeonju 누락(과거 known issue) 재발 금지", () => {
  for (const c of ["busan", "seoul", "jeju", "gyeongju", "jeonju"]) {
    const p = cityShareFallback(c);
    assert.ok(p, `${c} fallback 없음`);
    // 실제 권리확인 자산이 repo 에 존재해야 한다 — 죽은 경로 금지
    assert.doesNotThrow(() => readFileSync(join(process.cwd(), "public", p!)), `${c}: public${p} 가 없다`);
  }
  assert.equal(cityShareFallback("tokyo"), null);
  assert.equal(Object.keys(CITY_SHARE_FALLBACK).length, 5);
});

test("긴 제목은 교체가 아니라 크기·줄수로 대응한다", () => {
  assert.deepEqual(cardTitleFontPx("Short"), { fontPx: 46, maxLines: 3 });
  assert.equal(cardTitleFontPx("A".repeat(40)).fontPx, 36);
  assert.equal(cardTitleFontPx("あ".repeat(60)).fontPx, 28);
});

test("days 셈법 — 배열·__v:2 모두, Story summary 와 같은 수", () => {
  assert.deepEqual(countDaysPlaces([{ places: [1, 2] }, { places: [3] }]), { dayCount: 2, placeCount: 3 });
  assert.deepEqual(countDaysPlaces({ __v: 2, scheduled: [{ places: [1] }] }), { dayCount: 1, placeCount: 1 });
  assert.deepEqual(countDaysPlaces(null), { dayCount: 0, placeCount: 0 });
});

// ── 소스 가드 ────────────────────────────────────────────────────────────────

test("OG 함수: 실제 제목 사용 + 광고 문구 0 + 대표 이미지 체인", () => {
  const src = read("functions", "shared", "[id].ts");
  assert.match(src, /trip_title/);
  assert.match(src, /shareTitle\(/);
  assert.match(src, /shareDescription\(/);
  assert.match(src, /representativeCoverUrl\(/);
  assert.match(src, /cityShareFallback\(/);
  for (const bad of [/Plan yours free/i, /AI-generated/i, /curated spots/i]) {
    assert.doesNotMatch(src, bad, String(bad));
  }
  // 비공개는 여전히 브랜드 기본 메타 — 여행 데이터 노출 금지
  assert.match(src, /is_public=eq\.true/);
  assert.match(src, /name="description"/);
});

test("9:16 카드: 실제 제목 prop + 카탈로그/도시 fallback 체인 + orange 전면 금지", () => {
  const src = read("src", "components", "TripStoryExport.tsx");
  assert.match(src, /tripTitle/);
  assert.match(src, /fallbackPhotoSrc/);
  assert.match(src, /cityShareFallback\(|cityFallback/);
  assert.match(src, /cardTitleFontPx\(/);
  // 무사진 카드가 orange gradient 포스터가 되던 결함 — PRIMARY 전면 그라디언트 금지
  assert.doesNotMatch(src, /addColorStop\(1, PRIMARY\)/);
});

test("브랜드 기본 메타에 광고 잔재 없음", () => {
  assert.doesNotMatch(BRAND_OG.description, /free|sign.?up/i);
});
