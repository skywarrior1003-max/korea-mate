import test from "node:test";
import assert from "node:assert/strict";
import {
  resolvePlannerCover, canUsePersonalCover, personalCoverPath,
  type CityVisualLike,
} from "./cover-source-core.ts";

// 실제 resolver 와 같은 모양의 테스트용 도시 표
const CITIES: Record<string, CityVisualLike> = {
  busan:    { src: "/images/home/city-busan-hero.jpg", w: 1408, h: 768,  objectPosition: "center 45%" },
  seoul:    { src: "/images/cities/city-seoul-v1.webp",    w: 1024, h: 1024, objectPosition: "center 42%" },
  gyeongju: { src: "/images/cities/city-gyeongju-v1.webp", w: 1024, h: 1024, objectPosition: "center 52%" },
  jeju:     { src: "/images/cities/city-jeju-v1.webp",     w: 1024, h: 1024, objectPosition: "center 40%" },
  jeonju:   { src: "/images/cities/city-jeonju-v1.webp",   w: 1024, h: 1024, objectPosition: "center 58%" },
};
const resolve = (s?: string | null) =>
  (typeof s === "string" ? CITIES[s.trim().toLowerCase()] ?? null : null);

// ── 도시가 섞이지 않는다 ─────────────────────────────────────────────────────
test("★각 도시는 자기 이미지만 받는다 — 교차 노출 0", () => {
  for (const [city, v] of Object.entries(CITIES)) {
    const r = resolvePlannerCover({ city }, resolve);
    assert.equal(r.kind, "city", city);
    assert.equal(r.kind === "city" && r.src, v.src, city);
    // 다른 도시 파일명이 절대 들어오면 안 된다
    for (const [other, ov] of Object.entries(CITIES)) {
      if (other === city) continue;
      assert.notEqual(r.kind === "city" && r.src, ov.src, `${city} 에 ${other} 이미지`);
    }
  }
});

test("★지원하지 않는 도시는 gradient — 아무 도시 사진이나 돌려쓰지 않는다", () => {
  for (const c of ["daegu", "incheon", "", "   ", null, undefined]) {
    assert.equal(resolvePlannerCover({ city: c as string }, resolve).kind, "gradient", String(c));
  }
});

test("도시 키는 대소문자·공백을 가리지 않는다", () => {
  for (const c of ["Seoul", " SEOUL ", "seoul"]) {
    const r = resolvePlannerCover({ city: c }, resolve);
    assert.equal(r.kind === "city" && r.src, CITIES.seoul.src, c);
  }
});

// ── 개인 사진 보안 게이트 ────────────────────────────────────────────────────
test("★비공개 일정에서는 개인 사진을 쓰지 않는다 — is_public 게이트 유지", () => {
  const base = { coverKind: "moment", coverMomentId: "m1", itineraryId: "i1", city: "busan" };
  assert.equal(canUsePersonalCover({ ...base, isPublic: false }), false);
  const r = resolvePlannerCover({ ...base, isPublic: false }, resolve);
  assert.equal(r.kind, "city", "비공개면 도시 대표 비주얼로 내려간다");
});

test("★공개 + 개인 커버일 때만 개인 사진", () => {
  const r = resolvePlannerCover(
    { coverKind: "moment", coverMomentId: "m1", itineraryId: "i1", isPublic: true, city: "busan" },
    resolve,
  );
  assert.equal(r.kind, "personal");
  assert.equal(r.kind === "personal" && r.src, "/img/trip-cover/i1");
});

test("★cover_kind 가 moment 가 아니면 개인 사진이 아니다 — 관광 자산 경로를 타지 않는다", () => {
  // auto/asset 은 KTO 관광 자산으로 떨어지는 종류다. 그 풀은 부산 전용이라
  // 공개된 서울 일정에 부산 사진이 뜨게 된다. 아예 쓰지 않는다.
  for (const kind of ["auto", "asset", null, undefined, ""]) {
    const r = resolvePlannerCover(
      { coverKind: kind as string, coverMomentId: "m1", itineraryId: "i1", isPublic: true, city: "seoul" },
      resolve,
    );
    assert.equal(r.kind, "city", String(kind));
    assert.equal(r.kind === "city" && r.src, CITIES.seoul.src, "서울 일정엔 서울 이미지");
  }
});

test("moment 인데 moment_id 가 비면 개인 사진이 아니다", () => {
  assert.equal(canUsePersonalCover({
    coverKind: "moment", coverMomentId: "", itineraryId: "i1", isPublic: true,
  }), false);
});

test("경로에 id 를 그대로 붙이지 않는다 — 인코딩", () => {
  assert.equal(personalCoverPath("a/b c"), "/img/trip-cover/a%2Fb%20c");
});

// ── 저장 전후 안정성 ─────────────────────────────────────────────────────────
test("★저장 전(id 없음)과 저장 후가 같은 이미지다 — 사진이 갑자기 바뀌지 않는다", () => {
  const before = resolvePlannerCover({ city: "jeju", itineraryId: null }, resolve);
  const after1 = resolvePlannerCover({ city: "jeju", itineraryId: "abc-123" }, resolve);
  const after2 = resolvePlannerCover({ city: "jeju", itineraryId: "zzz-999" }, resolve);
  assert.deepEqual(before, after1);
  assert.deepEqual(before, after2, "itineraryId 해시로 고르지 않는다");
});

test("★공개 전환만으로 도시 이미지가 바뀌지 않는다", () => {
  const priv = resolvePlannerCover({ city: "jeonju", isPublic: false }, resolve);
  const pub  = resolvePlannerCover({ city: "jeonju", isPublic: true },  resolve);
  assert.deepEqual(priv, pub);
});

// ── 로드 실패 ────────────────────────────────────────────────────────────────
test("★이미지 로드 실패는 gradient — 깨진 이미지 자리를 남기지 않는다", () => {
  assert.equal(resolvePlannerCover({ city: "seoul", imageFailed: true }, resolve).kind, "gradient");
  assert.equal(resolvePlannerCover({
    coverKind: "moment", coverMomentId: "m", itineraryId: "i", isPublic: true, imageFailed: true,
  }, resolve).kind, "gradient");
});

// ── KTO 자산과의 분리 ────────────────────────────────────────────────────────
test("★도시 대표 비주얼은 KTO 프록시 경로를 쓰지 않는다", () => {
  for (const city of Object.keys(CITIES)) {
    const r = resolvePlannerCover({ city }, resolve);
    const src = r.kind === "city" ? r.src : "";
    assert.ok(!src.includes("/img/cover/"), `${city}: KTO 프록시 경로`);
    assert.ok(!src.includes("visitkorea"), `${city}: KTO 호스트`);
    assert.ok(src.startsWith("/images/"), `${city}: 정적 경로여야 한다`);
  }
});
