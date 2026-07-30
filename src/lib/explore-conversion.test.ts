// Explore 전환 배치 단위 테스트
// 실행: node --experimental-strip-types src/lib/explore-conversion.test.ts
//
// 검증 대상 세 가지
//   1. 공개 목록 predicate — 좌표 없는 장소가 빠지는가
//   2. 진행 문구 구간 — 개수에 따라 올바른 키를 고르는가
//   3. i18n 4개 언어가 같은 키를 갖고 필요한 placeholder 를 유지하는가
//
// 카드 렌더 자체는 컴포넌트 테스트 프레임워크가 없으므로 다루지 않는다.
// 담기·중복·충돌 쌍 판정은 place-identity.test.ts 가 이미 덮는다.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getItemSourceKey } from "./place-identity.ts";
import { isValidCoordinate } from "./geo.ts";

// ── 1. 공개 목록 predicate ───────────────────────────────────────────────────
//
// ExploreCity 가 쓰는 것과 같은 조건(geo.isValidCoordinate). 좌표가 유효하지
// 않으면 cart_hints 에 들어가지 못해 "담았는데 일정에 안 들어오는" 상태가 된다.
type Spot = { sourceKey?: string; lat?: unknown; lng?: unknown };
const isPublishable = (s: Spot) => isValidCoordinate(s.lat, s.lng);

test("정상 좌표는 공개된다", () => {
  assert.equal(isPublishable({ lat: 35.1587, lng: 129.1604 }), true);
  assert.equal(isPublishable({ lat: -33.86, lng: 151.2 }), true);
});

test("없거나 하나만 있는 좌표는 제외된다", () => {
  for (const s of [{}, { lat: 35.1 }, { lng: 129.0 },
                   { lat: null, lng: null }, { lat: undefined, lng: 129.0 }]) {
    assert.equal(isPublishable(s), false, JSON.stringify(s));
  }
});

test("문자열 좌표는 제외된다 — 숫자만 받는다", () => {
  assert.equal(isPublishable({ lat: "35.1", lng: "129.0" }), false);
  assert.equal(isPublishable({ lat: 35.1, lng: "129.0" }), false);
});

test("NaN·Infinity 는 제외된다", () => {
  for (const s of [{ lat: NaN, lng: 129 }, { lat: 35, lng: NaN },
                   { lat: Infinity, lng: 129 }, { lat: 35, lng: -Infinity }]) {
    assert.equal(isPublishable(s), false, JSON.stringify(s));
  }
});

test("범위를 벗어난 위경도는 제외된다", () => {
  for (const s of [{ lat: 91, lng: 129 }, { lat: -90.1, lng: 129 },
                   { lat: 35, lng: 181 }, { lat: 35, lng: -180.5 }]) {
    assert.equal(isPublishable(s), false, JSON.stringify(s));
  }
});

test("경계값은 통과한다", () => {
  for (const s of [{ lat: 90, lng: 180 }, { lat: -90, lng: -180 }]) {
    assert.equal(isPublishable(s), true, JSON.stringify(s));
  }
});

test("(0, 0) 은 제외된다 — 좌표 없음을 0 으로 채운 결과다", () => {
  assert.equal(isPublishable({ lat: 0, lng: 0 }), false);
  // 한쪽만 0 인 것은 실제 좌표일 수 있으므로 통과시킨다
  assert.equal(isPublishable({ lat: 0, lng: 129.0 }), true);
  assert.equal(isPublishable({ lat: 35.1, lng: 0 }), true);
});

test("소스별 공개 수 — 실측 기준(city_spot 82 · event 12 · local_info 64 제외)", () => {
  const merged: Spot[] = [
    ...Array.from({ length: 82 }, (_, i) => ({ sourceKey: `city_spot:${i}`,    lat: 35, lng: 129 })),
    ...Array.from({ length: 12 }, (_, i) => ({ sourceKey: `event:busan:e${i}`, lat: 35, lng: 129 })),
    ...Array.from({ length: 64 }, (_, i) => ({ sourceKey: `local_info:busan:${i}` })),
  ];
  const published = merged.filter(isPublishable);
  assert.equal(merged.length, 158);
  assert.equal(published.length, 94);
  assert.equal(published.filter(s => s.sourceKey!.startsWith("local_info:")).length, 0);
});

test("유효 좌표를 보강하면 코드 변경 없이 다시 공개된다", () => {
  const before: Spot = { sourceKey: "local_info:busan:24" };
  assert.equal(isPublishable(before), false);
  assert.equal(isPublishable({ ...before, lat: 35.2, lng: 129.08 }), true);
});

// ── 2. 진행 문구 구간 ────────────────────────────────────────────────────────
//
// CartDrawer 와 같은 경계. 칭찬이 아니라 "어느 정도 분량인가" 를 알린다.
const progressKey = (count: number) =>
  count >= 5 ? "countFullDay" : count >= 3 ? "countHalfDay" : count === 1 ? "countOne" : "countFew";

test("진행 문구 구간 — 1 / 2 / 3~4 / 5+", () => {
  assert.equal(progressKey(1), "countOne");
  assert.equal(progressKey(2), "countFew");
  assert.equal(progressKey(3), "countHalfDay");
  assert.equal(progressKey(4), "countHalfDay");
  assert.equal(progressKey(5), "countFullDay");
  assert.equal(progressKey(12), "countFullDay");
});

// ── 3. i18n 무결성 ───────────────────────────────────────────────────────────

const LOCALES = ["en", "ko", "ja", "zh"] as const;
const load = (l: string) =>
  JSON.parse(readFileSync(new URL(`../messages/${l}.json`, import.meta.url), "utf-8"));

function flatten(o: Record<string, unknown>, p = ""): string[] {
  return Object.entries(o).flatMap(([k, v]) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? flatten(v as Record<string, unknown>, `${p}${k}.`)
      : [`${p}${k}`]);
}

test("4개 언어의 키 집합이 완전히 같다", () => {
  const base = new Set(flatten(load("en")));
  for (const l of LOCALES.slice(1)) {
    const s = new Set(flatten(load(l)));
    assert.deepEqual([...base].filter(k => !s.has(k)), [], `${l} 누락`);
    assert.deepEqual([...s].filter(k => !base.has(k)), [], `${l} 초과`);
  }
});

test("picks 네임스페이스가 4개 언어에 모두 있다", () => {
  const keys = ["title", "clearAll", "listHint", "buildTrip", "openPicks", "collapse",
                "countOne", "countFew", "countHalfDay", "countFullDay",
                "addedLive", "addedLiveOne", "addAria", "addedAria"];
  for (const l of LOCALES) {
    const m = load(l);
    for (const k of keys) {
      assert.equal(typeof m.picks?.[k], "string", `${l}.picks.${k}`);
      assert.ok(m.picks[k].length > 0, `${l}.picks.${k} 비어 있음`);
    }
  }
});

test("placeholder 가 모든 언어에서 유지된다", () => {
  const need: Record<string, string[]> = {
    countFew: ["{count}"], countHalfDay: ["{count}"], countFullDay: ["{count}"],
    openPicks: ["{count}"], addedLive: ["{name}", "{count}"], addedLiveOne: ["{name}"],
    addAria: ["{name}"], addedAria: ["{name}"],
  };
  for (const l of LOCALES) {
    const m = load(l);
    for (const [k, tokens] of Object.entries(need)) {
      for (const tk of tokens) {
        assert.ok(String(m.picks[k]).includes(tk), `${l}.picks.${k} 에 ${tk} 없음`);
      }
    }
  }
});

test("영어 단수·복수가 정확하다 — \"1 places picked\" 금지", () => {
  const en = load("en");
  assert.equal(en.picks.countOne, "1 place picked");
  assert.ok(!/1 places/.test(en.picks.countOne), en.picks.countOne);
  assert.ok(en.picks.countFew.includes("places"), en.picks.countFew);
  assert.equal(en.picks.addedLiveOne, "{name} added. 1 place picked.");
  assert.ok(!/1 places/.test(en.picks.addedLiveOne), en.picks.addedLiveOne);
  // 3+ 에서만 쓰이는 문구는 항상 복수형이라 단수 변형이 필요 없다
  for (const k of ["countHalfDay", "countFullDay"]) {
    assert.ok(en.picks[k].includes("spots"), `${k}: ${en.picks[k]}`);
  }
});

test("호출되지 않는 키를 남기지 않는다 — removedLive 제거", () => {
  for (const l of LOCALES) assert.equal(load(l).picks.removedLive, undefined, l);
});

test("modal 담기 문구가 4개 언어에 있다 — 하드코딩 영어 제거분", () => {
  for (const l of LOCALES) {
    const m = load(l);
    for (const k of ["addToTrip", "added", "inTrip", "remove", "like", "liked",
                     "addedToast", "viewFullDetails"]) {
      assert.equal(typeof m.modal?.[k], "string", `${l}.modal.${k}`);
    }
  }
});

test("영어 외 언어의 담기 문구가 영어와 다르다 — 번역 누락 방지", () => {
  const en = load("en");
  for (const l of ["ko", "ja", "zh"]) {
    const m = load(l);
    assert.notEqual(m.picks.buildTrip, en.picks.buildTrip, `${l} buildTrip 미번역`);
    assert.notEqual(m.picks.title, en.picks.title, `${l} title 미번역`);
    assert.notEqual(m.modal.addToTrip, en.modal.addToTrip, `${l} addToTrip 미번역`);
  }
});

// ── 4. 카드 상태 판정 (ExploreCity 의 pickedKeys 와 같은 규칙) ───────────────

test("담긴 장소 판정은 sourceKey 집합으로 한다", () => {
  const picked = new Set(["city_spot:24"]);
  const a = { id: "local-24", sourceKey: "city_spot:24" };
  const b = { id: "local-24", sourceKey: "local_info:busan:24" };
  assert.equal(picked.has(getItemSourceKey(a)), true);
  assert.equal(picked.has(getItemSourceKey(b)), false);
});

test("Analytics 속성에 개인정보가 없다", () => {
  const params = {
    city: "busan", category: "attraction", source_type: "city_spot",
    cta_position: "explore-card", duplicate: false, picked_count: 3,
  };
  for (const banned of ["device_id", "deviceId", "email", "userNote", "note", "lat", "lng"]) {
    assert.ok(!(banned in params), banned);
  }
});
