// 여행 도시 키·표시 — 같은 도시는 한 값, 언어별 표시, 모르는 이름은 그대로
// 실행: node --experimental-strip-types --test src/data/cities/trip-city.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { tripCityKey, tripCityLabel, resolveOtherCityKey, KR_OTHER_CITIES } from "./trip-city.ts";

test("강릉·gangneung·강릉시·Gangneung-si·江陵市 → 한 key", () => {
  for (const v of ["강릉", "gangneung", "Gangneung", "강릉시", "Gangneung-si", "Gangneung City", "江陵市", "  강릉 "]) {
    assert.equal(tripCityKey(v), "gangneung", v);
  }
});

test("5개 서비스 도시는 기존 slug 그대로(접미사 포함)", () => {
  assert.equal(tripCityKey("Busan"), "busan");
  assert.equal(tripCityKey("부산"), "busan");
  assert.equal(tripCityKey("부산시"), "busan");
  assert.equal(tripCityKey("제주도"), "jeju");
});

test("표에 없거나 겹치는 이름은 추정하지 않고 그대로", () => {
  assert.equal(tripCityKey("광주"), "광주");   // 광주광역시·경기 광주시 — 넣지 않음
  assert.equal(tripCityKey("동해"), "동해");   // 바다 이름과 같음 — 넣지 않음
  assert.equal(tripCityKey("고성"), "고성");   // 강원·경남 두 곳 — 넣지 않음
  assert.equal(tripCityKey("Some Town"), "Some Town");
  assert.equal(tripCityKey(""), "");
  assert.equal(resolveOtherCityKey(null), null);
});

test("표시 — 언어별 공식 이름, 기존 저장값(강릉)도 같은 표시", () => {
  assert.equal(tripCityLabel("gangneung", "ko"), "강릉");
  assert.equal(tripCityLabel("강릉", "en"), "Gangneung");
  assert.equal(tripCityLabel("강릉", "ja"), "江陵");
  assert.equal(tripCityLabel("gangneung", "zh"), "江陵");
  assert.equal(tripCityLabel("busan", "ja"), "釜山");
  assert.equal(tripCityLabel("광주", "en"), "광주");
});

test("표는 4개 언어 이름을 모두 갖고 key 는 소문자 로마자", () => {
  for (const [key, names] of Object.entries(KR_OTHER_CITIES)) {
    assert.match(key, /^[a-z]+$/, key);
    for (const l of ["ko", "en", "ja", "zh"] as const) assert.ok(names[l]?.trim(), `${key}.${l}`);
    assert.equal(tripCityKey(names.en), key);
    assert.equal(tripCityKey(names.ko), key);
  }
});
