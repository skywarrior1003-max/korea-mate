import test from "node:test";
import assert from "node:assert/strict";
import { parseMapLinkCoordinate, isShortMapLink, chooseSeed } from "./location-seed.ts";

// ── 짧은 링크는 열어 보지 않는다 ─────────────────────────────────────────────
test("★짧은 링크는 좌표를 지어내지 않고 모른다고 답한다", () => {
  for (const u of [
    "https://naver.me/xAbCdEfG",
    "https://maps.app.goo.gl/AbCdEfGhIjK",
    "https://goo.gl/maps/abcdef",
  ]) {
    assert.equal(isShortMapLink(u), true, u);
    assert.equal(parseMapLinkCoordinate(u), null, u);
  }
});

test("★일반 지도 도메인은 짧은 링크가 아니다", () => {
  assert.equal(isShortMapLink("https://map.naver.com/p/entry/place/123"), false);
  assert.equal(isShortMapLink("https://www.google.com/maps/place/x"), false);
});

// ── Google ───────────────────────────────────────────────────────────────────
test("★Google !3d!4d 를 읽는다 — 위도가 먼저다", () => {
  const r = parseMapLinkCoordinate(
    "https://www.google.com/maps/place/Haeundae/data=!3m1!4b1!4m5!3m4!1s0x0!8m2!3d35.1587!4d129.1604",
  );
  assert.deepEqual(r, { lat: 35.1587, lng: 129.1604 });
});

test("★Google /@lat,lng,zoom 중심을 읽는다", () => {
  const r = parseMapLinkCoordinate("https://www.google.com/maps/@35.1595,129.1614,17z");
  assert.deepEqual(r, { lat: 35.1595, lng: 129.1614 });
});

test("★Google ?q=lat,lng 를 읽는다", () => {
  assert.deepEqual(
    parseMapLinkCoordinate("https://maps.google.com/?q=37.5666103,126.9783882"),
    { lat: 37.5666103, lng: 126.9783882 },
  );
});

// ── Naver ────────────────────────────────────────────────────────────────────
test("★Naver c= 는 경도가 먼저다 — 뒤집어 읽지 않는다", () => {
  const r = parseMapLinkCoordinate("https://map.naver.com/p/entry/place/11576297?c=129.1604,35.1587,15,0,0,0,dh");
  assert.deepEqual(r, { lat: 35.1587, lng: 129.1604 });
});

test("★Naver 의 옛 미터 좌표계 c= 는 범위 밖이라 걸러진다", () => {
  assert.equal(
    parseMapLinkCoordinate("https://map.naver.com/v5/?c=14374000.0,4187000.0,15,0,0,0,dh"),
    null,
  );
});

test("★lat/lng 이름이 붙은 값을 읽는다", () => {
  assert.deepEqual(
    parseMapLinkCoordinate("https://map.naver.com/v5/search/x?lat=35.1587&lng=129.1604"),
    { lat: 35.1587, lng: 129.1604 },
  );
});

// ── 읽을 수 없는 것 ──────────────────────────────────────────────────────────
test("★좌표가 없는 링크·빈 값·주소 문자열은 null 이다", () => {
  for (const u of [
    "",
    "   ",
    "부산광역시 해운대구 우동 1394",
    "https://map.naver.com/p/entry/place/11576297",
    "https://www.google.com/maps/place/Haeundae+Beach",
  ]) {
    assert.equal(parseMapLinkCoordinate(u), null, JSON.stringify(u));
  }
});

test("★범위를 벗어난 값과 (0,0) 은 좌표로 인정하지 않는다", () => {
  assert.equal(parseMapLinkCoordinate("https://maps.google.com/?q=95.0,129.0"), null);
  assert.equal(parseMapLinkCoordinate("https://maps.google.com/?q=35.0,200.0"), null);
  assert.equal(parseMapLinkCoordinate("https://maps.google.com/?q=0,0"), null);
});

// ── seed 우선순위 ────────────────────────────────────────────────────────────
const BUSAN = { lat: 35.1148, lng: 129.0420 };
const HERE  = { lat: 35.1587, lng: 129.1604 };

test("★링크 좌표가 가장 앞선다", () => {
  const r = chooseSeed({ link: HERE, address: BUSAN, gps: BUSAN, city: BUSAN });
  assert.equal(r.source, "link");
  assert.deepEqual(r.coordinate, HERE);
});

test("★링크가 없으면 주소, 그다음 현재 위치, 그다음 도시 중심", () => {
  assert.equal(chooseSeed({ address: HERE, gps: BUSAN, city: BUSAN }).source, "address");
  assert.equal(chooseSeed({ gps: HERE, city: BUSAN }).source,                 "gps");
  assert.equal(chooseSeed({ city: BUSAN }).source,                            "city");
});

test("★아무것도 없으면 none — 그래도 지도는 열 수 있다", () => {
  const r = chooseSeed({});
  assert.equal(r.source, "none");
  assert.equal(r.coordinate, null);
});

test("★망가진 좌표는 건너뛰고 다음 근거를 쓴다", () => {
  const broken = { lat: Number.NaN, lng: 129 };
  const r = chooseSeed({ link: broken, address: HERE });
  assert.equal(r.source, "address");
  assert.deepEqual(r.coordinate, HERE);
});
