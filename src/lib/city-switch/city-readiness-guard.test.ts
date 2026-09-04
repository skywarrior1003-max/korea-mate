// 도시를 여는 스위치를 잘못 켜면 여기서 걸린다.
//
// `planningReady: true` 한 줄만 바꿔도 도시가 열린다. 그런데 도착지 프리셋이
// 없으면 화면은 빈 목록이 아니라 **부산 프리셋으로 떨어진다**(HomeClient 의
// `?? CITY_ARRIVAL_OPTIONS["Busan"]`). 경주를 골랐는데 부산역이 뜨는 종류의
// 사고라, 값 하나가 아니라 "켜도 되는 상태인가" 를 검사한다.
//
// 실제 값은 만들어 주지 않는다. 도착지와 숙박 지역은 그 도시에 실재하는
// 장소라 사람이 정확히 넣어야 한다 — 이 테스트는 빠졌다는 사실만 알린다.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  missingForPlanning, missingLabels, canActivate, readinessGaps,
  STAY_AREA_TYPES, REQUIRED_LOCALES, type CityReadinessInput,
} from "./city-readiness-core.ts";
import { CITY_ARRIVAL_OPTIONS, CITY_ARRIVAL_DEFAULTS } from "../../data/city-presets.ts";

const ROOT = process.cwd();
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8");

/** `CITY_CONFIGS` 는 확장자 없는 import 라 node 로 못 읽는다 — 원문에서 읽는다. */
const SLUGS = ["busan", "seoul", "jeju", "gyeongju", "jeonju"] as const;
const configOf = (slug: string) => {
  const src = read("src", "data", "cities", `${slug}.ts`);
  return {
    name:          src.match(/name:\s*"([^"]+)"/)?.[1] ?? "",
    planningReady: /planningReady:\s*true/.test(src),
  };
};
const messages = Object.fromEntries(
  REQUIRED_LOCALES.map(l => [l, JSON.parse(read("src", "messages", `${l}.json`))]),
) as Record<string, { tripForm: Record<string, string>; cityLinks: Record<string, string> }>;

/** 일정 생성이 쓰는 도시 중심 좌표 — 페이지 안의 지도라 원문에서 확인한다. */
const CENTER_SRC = read("src", "app", "itinerary", "page.tsx");
const centerBlock = CENTER_SRC.slice(
  CENTER_SRC.indexOf("const CITY_CENTER_COORDS"),
  CENTER_SRC.indexOf("};", CENTER_SRC.indexOf("const CITY_CENTER_COORDS")),
);

const inputFor = (slug: string): CityReadinessInput => {
  const { name, planningReady } = configOf(slug);
  return {
    name, planningReady,
    arrivalOptions: CITY_ARRIVAL_OPTIONS[name] ?? [],
    arrivalDefault: CITY_ARRIVAL_DEFAULTS[name],
    label:       Object.fromEntries(REQUIRED_LOCALES.map(l => [l, messages[l]!.tripForm[`city_${name}`]])),
    description: Object.fromEntries(REQUIRED_LOCALES.map(l => [l, messages[l]!.cityLinks[`desc${name}`]])),
    hasCenterCoord: new RegExp(`\\b${slug}\\s*:`).test(centerBlock),
  };
};

// ── 지금 열려 있는 도시 ──────────────────────────────────────────────────────
test("★열려 있는 도시는 필요한 것을 모두 갖추고 있다", () => {
  const open = SLUGS.filter(s => configOf(s).planningReady);
  assert.ok(open.length > 0, "열린 도시가 하나도 없다");
  for (const slug of open) {
    assert.deepEqual(missingForPlanning(inputFor(slug)), [], `${slug} 가 빠뜨린 것`);
  }
});

test("★도시 이름과 소개는 준비 중이든 아니든 네 언어에 있어야 한다", () => {
  for (const slug of SLUGS) {
    assert.deepEqual(missingLabels(inputFor(slug)), [], `${slug} 문구`);
  }
});

test("★아직 열지 않은 도시는 프리셋이 없어도 정상이다", () => {
  for (const slug of SLUGS.filter(s => !configOf(s).planningReady)) {
    assert.deepEqual(missingForPlanning(inputFor(slug)), [], `${slug} 는 닫혀 있으므로 통과해야 한다`);
  }
});

// ── 잘못 켜면 걸린다 ─────────────────────────────────────────────────────────
test("★프리셋 없는 도시를 열면 무엇이 없는지 알려 준다", () => {
  // 저장소 데이터에 기대지 않는다. 예전에는 "빈 도시가 실재한다" 를 전제로 했는데,
  // 전주 프리셋이 채워지자 검사할 대상이 사라져 이 테스트가 스스로 무너졌다.
  // 새 도시가 막 등록된 순간의 모습을 직접 만든다.
  const fresh: CityReadinessInput = {
    name: "Newtown", planningReady: true,
    arrivalOptions: [], arrivalDefault: undefined,
    label:       Object.fromEntries(REQUIRED_LOCALES.map(l => [l, "N"])),
    description: Object.fromEntries(REQUIRED_LOCALES.map(l => [l, "d"])),
    hasCenterCoord: false,
  };
  const gaps = missingForPlanning(fresh);
  assert.ok(gaps.includes("arrival_options"), gaps.join(","));
  assert.ok(gaps.includes("stay_area"),       gaps.join(","));
  assert.ok(gaps.includes("arrival_default"), gaps.join(","));
  assert.ok(gaps.includes("center_coord"),    gaps.join(","));
  assert.equal(canActivate(fresh), false);
});

test("★등록만 하고 프리셋을 넣지 않은 도시가 남아 있는지 알려 준다", () => {
  // 실패가 아니다 — 아직 열지 않은 도시는 비어 있어도 정상이다.
  // 다만 지금 어느 도시가 열 준비가 됐는지는 기록해 둔다.
  const notYet = SLUGS.filter(s => !canActivate(inputFor(s)));
  assert.deepEqual(notYet, [], `프리셋이 아직 없는 도시: ${notYet.join(", ")}`);
});

// ── 오너 활성화 스냅숏 ───────────────────────────────────────────────────────
// planningReady 는 도시별 명시적 Activation task 로만 바뀐다. 이 스냅숏이
// 현재 오너가 승인한 활성 집합이다 — 의도 없는 스위치 변경은 여기서 걸린다.
// (JEJU-PLANNER-PRODUCTION-ACTIVATION-V1: jeju true 승격)
test("★활성화 스위치는 오너 승인 집합 그대로다 — busan·gyeongju·jeju ON / seoul·jeonju OFF", () => {
  const state = Object.fromEntries(SLUGS.map(s => [s, configOf(s).planningReady]));
  assert.deepEqual(state, { busan: true, seoul: false, jeju: true, gyeongju: true, jeonju: false });
});

// ── 규칙 자체 ────────────────────────────────────────────────────────────────
const base: CityReadinessInput = {
  name: "Testville", planningReady: true,
  arrivalOptions: [{ value: "Testville Station", type: "train_station" },
                   { value: "Old Town", type: "downtown" }],
  arrivalDefault: "Testville Station",
  label:       Object.fromEntries(REQUIRED_LOCALES.map(l => [l, "T"])),
  description: Object.fromEntries(REQUIRED_LOCALES.map(l => [l, "d"])),
  hasCenterCoord: true,
};

test("★필요한 것을 다 주면 열 수 있다", () => {
  assert.deepEqual(readinessGaps(base), []);
  assert.equal(canActivate(base), true);
});

test("★도착지가 없으면 열 수 없다", () => {
  assert.deepEqual(missingForPlanning({ ...base, arrivalOptions: [] }).sort(),
    ["arrival_default_not_in_options", "arrival_options", "stay_area"]);
});

test("★잘 자리가 없으면 열 수 없다 — 역·공항만으로는 안 된다", () => {
  const onlyStations = [{ value: "A", type: "train_station" }, { value: "B", type: "airport" }];
  assert.deepEqual(missingForPlanning({ ...base, arrivalOptions: onlyStations, arrivalDefault: "A" }),
    ["stay_area"]);
});

test("★기본 도착지가 없거나 목록에 없으면 열 수 없다", () => {
  assert.deepEqual(missingForPlanning({ ...base, arrivalDefault: undefined }), ["arrival_default"]);
  assert.deepEqual(missingForPlanning({ ...base, arrivalDefault: "어디에도 없는 값" }),
    ["arrival_default_not_in_options"]);
});

test("★도시 중심 좌표가 없으면 열 수 없다 — 다른 도시로 조용히 떨어진다", () => {
  assert.deepEqual(missingForPlanning({ ...base, hasCenterCoord: false }), ["center_coord"]);
});

test("★문구가 빠지면 언어까지 짚어 준다", () => {
  const g = missingLabels({ ...base, label: { ...base.label, ja: "" }, description: { ...base.description, zh: undefined } });
  assert.deepEqual(g, ["label_ja", "description_zh"]);
});

test("★닫혀 있으면 프리셋을 묻지 않는다", () => {
  assert.deepEqual(missingForPlanning({ ...base, planningReady: false, arrivalOptions: [], arrivalDefault: undefined }), []);
});

// ── 도시 이름을 코드가 알지 않는다 ───────────────────────────────────────────
test("★판정 규칙에 도시 이름이 없다", () => {
  const core = read("src", "lib", "city-switch", "city-readiness-core.ts")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n").filter(l => !l.trimStart().startsWith("//")).join("\n");
  for (const n of ["busan", "seoul", "jeju", "gyeongju", "jeonju"]) {
    assert.doesNotMatch(core, new RegExp(n, "i"), n);
  }
});

test("★숙박 지역 종류가 stay-core 와 어긋나지 않는다", () => {
  const src = read("src", "lib", "trip-stay", "stay-core.ts");
  const listed = src.match(/STAY_AREA_TYPES = \[([^\]]+)\]/)?.[1] ?? "";
  for (const t of STAY_AREA_TYPES) assert.ok(listed.includes(`"${t}"`), t);
});
