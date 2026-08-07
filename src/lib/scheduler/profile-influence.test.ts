// AI 프로필이 실제 일정에 영향을 준다는 증거 — 그리고 안전 규칙은 그대로라는 증거.
//
// 이 파일이 없으면 "AI 붙였다"는 말이 검증되지 않는다. 설명만 덧붙이고 배치는
// 하나도 안 바뀌는 구현은 통과시키면 안 된다.
//
// 그래서 두 방향을 동시에 못 박는다.
//   ① 프로필이 없으면 기존과 **완전히 같은** 결과 (회귀 0)
//   ② 프로필이 있으면 안전한 후보들 사이에서 **순서가 실제로 바뀐다**
//   ③ 그러면서 hard constraint·Selected·날짜 수는 그대로

import test from "node:test";
import assert from "node:assert/strict";
import { runScheduler } from "./engine.ts";
import { profileBias, PROFILE_MAX_BONUS, slotOfMinutes } from "./profile-bias.ts";
import type { PersonalizationProfile } from "./ai/personalization-profile.ts";
import { PROFILE_VERSION } from "./ai/personalization-profile.ts";

// ── 동일 조건의 후보 두 개. 좌표·체류시간이 같아 규칙만으로는 우열이 없다. ──
const BASE = { lat: 35.1587, lng: 129.1603 };
const near = (n: number) => ({ lat: BASE.lat + n * 0.001, lng: BASE.lng + n * 0.001 });

function candidate(id: string, category: string, score = 100) {
  return {
    place_id: id, category, coordinate: near(1),
    zone_id: 1 as const, distance_m: 300, score,
  };
}

function input(extra: Record<string, unknown> = {}) {
  return {
    trip_date: "2026-09-01",
    start_time: "09:00",
    end_time: "18:00",
    base_coordinate: BASE,
    pace: "normal" as const,
    candidates: [
      candidate("cafe-1", "cafe"),
      candidate("rest-1", "restaurant"),
      candidate("nat-1",  "nature"),
    ],
    ...extra,
  } as never;
}

const profile = (over: Partial<PersonalizationProfile> = {}): PersonalizationProfile => ({
  profile_version:        PROFILE_VERSION,
  category_weights:       {},
  preferred_place_ids:    [],
  time_preferences:       {},
  pace_bias:              0,
  day_density_preference: "balanced",
  cluster_preference:     "balanced",
  meal_preference:        "flexible",
  preference_summary:     "",
  source:                 "ai",
  ...over,
});

function placedIds(r: ReturnType<typeof runScheduler>): string[] {
  if (!r.success) return [];
  return r.data.items
    .filter((i: { item_type: string }) => i.item_type === "place")
    .map((i: { place_id?: string }) => String(i.place_id));
}

// ── ① 프로필 없음 = 기존 그대로 ──────────────────────────────────────────────
test("★프로필이 없으면 결과가 기존과 완전히 같다 — 회귀 0", () => {
  // generated_at 은 호출 시각이라 ms 단위로 달라진다. 그건 프로필과 무관하므로
  // 비교에서 뺀다. 나머지(배치·시간·버전)가 모두 같아야 한다.
  const strip = (r: ReturnType<typeof runScheduler>) =>
    r.success ? { ...r, data: { ...r.data, generated_at: "" } } : r;

  const a = strip(runScheduler(input()));
  const b = strip(runScheduler(input({ personalization_profile: null })));
  const c = strip(runScheduler(input({ personalization_profile: undefined })));
  assert.deepEqual(b, a);
  assert.deepEqual(c, a);

  // 빈 프로필(신호 없음)도 배치를 바꾸지 않는다
  const d = strip(runScheduler(input({ personalization_profile: profile() })));
  assert.deepEqual(d, a, "빈 프로필이 배치를 바꿨다");
});

test("★보정 함수는 프로필이 없으면 항상 0", () => {
  for (const p of [null, undefined]) {
    assert.equal(profileBias(p, { place_id: "x", category: "cafe", startMinutes: 600 }), 0);
  }
});

// ── ② 프로필이 실제로 순서를 바꾼다 ─────────────────────────────────────────
test("★★프로필이 안전한 후보들 사이의 배치 순서를 실제로 바꾼다", () => {
  const noProfile = runScheduler(input());
  const withCafe  = runScheduler(input({
    personalization_profile: profile({ category_weights: { cafe: 1, restaurant: 0, nature: 0 } }),
  }));
  const withNature = runScheduler(input({
    personalization_profile: profile({ category_weights: { nature: 1, cafe: 0, restaurant: 0 } }),
  }));

  assert.ok(noProfile.success && withCafe.success && withNature.success);

  const a = placedIds(withCafe);
  const b = placedIds(withNature);
  assert.ok(a.length > 0 && b.length > 0, "아무것도 배치되지 않았다");

  // 선호가 정반대인 두 프로필이 같은 순서를 낸다면 보정이 실제로 먹지 않은 것이다.
  assert.notDeepEqual(a, b,
    `프로필이 배치에 전혀 영향을 주지 못했다 (cafe=${a.join(",")} nature=${b.join(",")})`);

  // 각 프로필이 자기가 선호한 카테고리를 먼저 놓는다
  assert.equal(a[0], "cafe-1", "cafe 선호인데 cafe 가 먼저 오지 않았다");
  assert.equal(b[0], "nat-1",  "nature 선호인데 nature 가 먼저 오지 않았다");
});

test("★같은 장소 집합은 유지된다 — 선호는 순서만 바꾼다", () => {
  const a = placedIds(runScheduler(input({
    personalization_profile: profile({ category_weights: { cafe: 1 } }) })));
  const b = placedIds(runScheduler(input({
    personalization_profile: profile({ category_weights: { nature: 1 } }) })));
  assert.deepEqual([...a].sort(), [...b].sort(), "장소 집합이 달라졌다");
});

// ── ③ 안전 규칙은 그대로 ────────────────────────────────────────────────────
test("★보정은 항상 상한 안에 있다 — Selected 보호 계약을 넘을 수 없다", () => {
  const extreme = profile({
    category_weights:    { cafe: 1 },
    time_preferences:    { cafe: "morning" },
    preferred_place_ids: ["cafe-1"],
  });
  const bonus = profileBias(extreme, { place_id: "cafe-1", category: "cafe", startMinutes: 9 * 60 });
  assert.ok(bonus <= PROFILE_MAX_BONUS, `보정 ${bonus} 가 상한 ${PROFILE_MAX_BONUS} 초과`);
  assert.ok(bonus >= -PROFILE_MAX_BONUS);

  // Selected(999, 최대 페널티 후 909) vs NearMe(최대 205 + 보정)
  assert.ok(205 + PROFILE_MAX_BONUS < 909,
    "보정이 NearMe 를 Selected 위로 올릴 수 있다 — Selected 보호가 깨진다");
});

test("★Selected(score 999)는 프로필과 무관하게 항상 먼저 배치된다", () => {
  const withSelected = input({
    candidates: [
      candidate("cafe-1", "cafe", 100),
      candidate("picked", "restaurant", 999),   // Selected 표식
    ],
    personalization_profile: profile({ category_weights: { cafe: 1, restaurant: 0 } }),
  });
  const ids = placedIds(runScheduler(withSelected));
  assert.equal(ids[0], "picked", "cafe 선호가 Selected 를 밀어냈다");
});

test("★프로필이 없는 장소를 만들어 내지 않는다", () => {
  const ids = placedIds(runScheduler(input({
    personalization_profile: profile({ preferred_place_ids: ["ghost-1", "ghost-2"] }),
  })));
  for (const id of ids) {
    assert.ok(["cafe-1", "rest-1", "nat-1"].includes(id), "없던 장소가 생겼다: " + id);
  }
});

test("★프로필이 날짜·시간 창을 바꾸지 않는다", () => {
  const r = runScheduler(input({
    personalization_profile: profile({ category_weights: { cafe: 1 }, pace_bias: 1,
                                       day_density_preference: "fuller" }),
  }));
  assert.ok(r.success);
  assert.equal(r.data.trip_date, "2026-09-01");
  for (const it of r.data.items) {
    assert.ok(it.start_time >= "09:00", `${it.start_time} 이 시작 시각보다 이르다`);
    assert.ok(it.end_time   <= "18:00", `${it.end_time} 이 종료 시각보다 늦다`);
  }
});

test("★중복 장소가 생기지 않는다", () => {
  const ids = placedIds(runScheduler(input({
    personalization_profile: profile({ category_weights: { cafe: 1 },
                                       preferred_place_ids: ["cafe-1"] }),
  })));
  assert.equal(new Set(ids).size, ids.length);
});

// ── 보정 함수 단위 ──────────────────────────────────────────────────────────
test("★시간대 판정", () => {
  assert.equal(slotOfMinutes(9 * 60),  "morning");
  assert.equal(slotOfMinutes(13 * 60), "afternoon");
  assert.equal(slotOfMinutes(19 * 60), "evening");
});

test("★선호 시간대가 맞을 때만 시간 보너스가 붙는다", () => {
  const p = profile({ time_preferences: { restaurant: "evening" } });
  const evening = profileBias(p, { place_id: "r", category: "restaurant", startMinutes: 19 * 60 });
  const morning = profileBias(p, { place_id: "r", category: "restaurant", startMinutes: 9 * 60 });
  assert.ok(evening > morning, "저녁 선호인데 저녁 보정이 더 크지 않다");
});

test("★flexible 시간 선호는 어느 시간대에도 보너스를 주지 않는다", () => {
  const p = profile({ time_preferences: { cafe: "flexible" } });
  for (const m of [9, 13, 19]) {
    assert.equal(profileBias(p, { place_id: "c", category: "cafe", startMinutes: m * 60 }), 0);
  }
});
