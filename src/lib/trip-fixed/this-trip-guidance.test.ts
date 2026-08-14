// This Trip 의 안내와 넘침 처리.
//
// 무엇을 지키는가
//   ① 안내가 기능을 막지 않는다 — 처음 온 사람이 안내를 무시하고 바로 버튼을
//      눌러도 원래 동작이 일어나야 한다.
//   ② 안내는 한 번이다. 두 걸음을 마치면 다시 나타나지 않는다.
//   ③ 사용자에게 "Fixed" 라는 내부 용어를 보여주지 않는다.
//   ④ 고른 장소가 조용히 사라지지 않는다. 들어갔거나, 못 들어갔다고 말하거나
//      둘 중 하나다.
//   ⑤ This Trip 에서 빼는 것은 Saved·My Places 에서 지우는 것이 아니다.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  validateFixedRange, toRangeDraft, fixedEndTime, tripDates,
} from "./fixed-core.ts";
import { readCoachStep, writeCoachStep, nextCoachStep, dismissCoach, THIS_TRIP_COACH_KEY }
  from "../onboarding.ts";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8");
/** 주석을 걷어낸 실행부만 본다. */
const code = (...p: string[]) =>
  read(...p).replace(/\/\*[\s\S]*?\*\//g, "")
            .split(/\r?\n/).map(l => l.replace(/(^|\s)\/\/.*/, "")).join("\n");

const LOCALES = ["en", "ko", "ja", "zh"] as const;
const msgs = Object.fromEntries(
  LOCALES.map(l => [l, JSON.parse(read("src/messages", `${l}.json`)) as { picks: Record<string, string> }]),
) as Record<string, { picks: Record<string, string> }>;

const DAYS = tripDates("2026-10-16", 3);

// ── A. CTA ───────────────────────────────────────────────────────────────────

test("A CTA 는 Plan My Trip 이고 예전 문구는 남아 있지 않다", () => {
  assert.equal(msgs.en!.picks.build, "Plan My Trip");
  for (const l of LOCALES) {
    const all = JSON.stringify(msgs[l]!.picks);
    assert.ok(!/Build My Trip with AI/.test(all), `${l}: 예전 CTA 문구가 남아 있다`);
  }
  // 버튼에 AI 를 다시 설명하지 않는다 — 첫 안내에서 한 번이면 충분하다.
  assert.ok(!/\bAI\b/.test(msgs.en!.picks.build!));
  assert.ok(!/AI/.test(msgs.ko!.picks.build!));
});

test("A 네 언어 모두 CTA 가 짧다", () => {
  for (const l of LOCALES) {
    const v = msgs[l]!.picks.build!;
    assert.ok(v.length > 0 && v.length <= 20, `${l}: "${v}" 가 모바일에 길다`);
  }
});

// ── B. onboarding 순서와 1회성 ───────────────────────────────────────────────

test("B 두 걸음을 순서대로 지나 끝난다", () => {
  assert.equal(nextCoachStep("plan"), "time");
  assert.equal(nextCoachStep("time"), "done");
  assert.equal(nextCoachStep("done"), "done", "끝난 뒤에는 되돌아가지 않는다");
  assert.equal(dismissCoach(), "done", "닫아도 완료다 — 다시 붙잡지 않는다");
});

test("B 저장된 값에 따라 시작 지점이 정해진다", () => {
  const store = new Map<string, string>();
  const g = globalThis as { window?: unknown; localStorage?: unknown };
  const hadWindow = "window" in g;
  g.window = g.window ?? {};
  g.localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, v); },
  };
  try {
    assert.equal(readCoachStep(), "plan", "처음 온 사람은 1단계부터");
    writeCoachStep("time");
    assert.equal(store.get(THIS_TRIP_COACH_KEY), "time");
    assert.equal(readCoachStep(), "time");
    writeCoachStep("done");
    assert.equal(readCoachStep(), "done", "끝낸 사람에게는 다시 나오지 않는다");
    store.set(THIS_TRIP_COACH_KEY, "무슨값");
    assert.equal(readCoachStep(), "done", "알 수 없는 값이면 보여주지 않는 쪽으로");
  } finally {
    delete (g as Record<string, unknown>).localStorage;
    if (!hadWindow) delete (g as Record<string, unknown>).window;
  }
});

test("B 안내 문구가 네 언어에 모두 있다", () => {
  for (const k of ["coachPlanTitle", "coachPlanBody", "coachTimeTitle", "coachTimeBody", "coachGotIt"]) {
    for (const l of LOCALES) {
      const v = msgs[l]!.picks[k];
      assert.ok(v && v.trim().length > 0, `${l}.picks.${k} 가 비어 있다`);
    }
  }
});

// ── C. 안내가 실제 버튼을 막지 않는다 ────────────────────────────────────────

test("C 안내는 버튼 옆에 놓일 뿐 클릭을 가로채지 않는다", () => {
  const picks = code("src/app/picks/PicksClient.tsx");
  // CTA 의 onClick 은 그대로 handleBuild 다
  assert.match(picks, /onClick=\{handleBuild\}/, "원래 동작이 유지되어야 한다");
  // 화면을 덮는 오버레이를 만들지 않는다
  const coach = code("src/components/Coachmark.tsx");
  for (const bad of ["fixed inset-0", "pointer-events-none", "z-50", "backdrop"]) {
    assert.ok(!coach.includes(bad), `Coachmark 에 ${bad} 가 있으면 대상을 가릴 수 있다`);
  }
  // 안내가 떠 있어도 버튼이 disabled 가 되지 않는다
  assert.ok(!/disabled=\{coach/.test(picks), "안내 때문에 버튼을 잠그지 않는다");
});

// ── D. 사용자-facing 용어 ────────────────────────────────────────────────────

test("D 사용자에게 Fixed 라는 내부 용어를 보여주지 않는다", () => {
  const banned = [/\bFixed Schedule\b/i, /\bHard Constraint\b/i, /\bFixed\b/];
  for (const l of LOCALES) {
    for (const [k, v] of Object.entries(msgs[l]!.picks)) {
      for (const re of banned) {
        assert.ok(!re.test(v), `${l}.picks.${k} = "${v}" 에 내부 용어가 있다`);
      }
    }
  }
});

test("D 시간 UI 라벨은 Date / Start / End 다", () => {
  assert.equal(msgs.en!.picks.timeDate,  "Date");
  assert.equal(msgs.en!.picks.timeStart, "Start");
  assert.equal(msgs.en!.picks.timeEnd,   "End");
  // duration 을 사용자에게 묻지 않는다
  const fields = code("src/components/FixedScheduleFields.tsx");
  assert.ok(!/timeDuration|fixedDuration/.test(fields), "소요시간을 직접 묻지 않는다");
  assert.ok(!/\bFixed\b/.test(JSON.stringify(msgs.en!.picks.timeAction)));
});

// ── E. Start/End → durationMinutes ───────────────────────────────────────────

test("E 시작과 끝에서 소요시간을 정확히 계산한다", () => {
  const r = validateFixedRange({ date: DAYS[1]!, startTime: "19:00", endTime: "22:00" }, DAYS);
  assert.ok(r.ok);
  assert.equal(r.value.durationMinutes, 180);
  assert.equal(r.value.startTime, "19:00");
  assert.equal(fixedEndTime(r.value), "22:00", "왕복 변환이 어긋나지 않는다");
});

test("E 끝이 시작보다 이르거나 없으면 고쳐 주지 않고 거절한다", () => {
  const cases: [string, string, string][] = [
    ["19:00", "18:00", "endBeforeStart"],
    ["19:00", "19:00", "endBeforeStart"],
    ["19:00", "",      "missingEnd"],
    ["",      "22:00", "missingTime"],
  ];
  for (const [s, e, expected] of cases) {
    const r = validateFixedRange({ date: DAYS[1]!, startTime: s, endTime: e }, DAYS);
    assert.equal(r.ok, false, `${s}~${e} 는 거부되어야 한다`);
    assert.equal((r as { error: string }).error, expected);
  }
});

test("E 여행 기간 밖 날짜와 자정 넘김은 그대로 막힌다", () => {
  const out = validateFixedRange({ date: "2026-12-25", startTime: "19:00", endTime: "20:00" }, DAYS);
  assert.equal((out as { error: string }).error, "dateOutOfTrip");
});

test("E 저장값을 화면 형태로 되돌릴 수 있다", () => {
  const draft = toRangeDraft({ date: DAYS[1]!, startTime: "09:05", durationMinutes: 25 });
  assert.deepEqual(draft, { date: DAYS[1]!, startTime: "09:05", endTime: "09:30" });
});

// ── F. 설정한 카드만 요약을 갖는다 ───────────────────────────────────────────

test("F 설정하지 않은 카드는 아무것도 덧붙이지 않는다", () => {
  const fields = code("src/components/FixedScheduleFields.tsx");
  // 닫혀 있고 값이 없으면 null 을 돌려준다 — 카드가 그대로다
  assert.match(fields, /if \(!open\) \{[\s\S]{0,120}if \(!value\) return null;/,
    "미설정 카드에는 아무 줄도 생기지 않아야 한다");
});

test("F 모든 카드에 텍스트 버튼을 반복하지 않는다", () => {
  const picks = code("src/app/picks/PicksClient.tsx");
  // 카드마다 "Set date & time" 같은 텍스트 버튼을 깔지 않는다 — 아이콘 하나다
  assert.ok(!/>\s*\{t\("timeAction"\)\}\s*</.test(picks),
    "카드 본문에 텍스트 라벨을 반복하지 않는다");
  assert.match(picks, /aria-label=\{`\$\{t\("timeAction"\)\}: \$\{item\.name\}`\}/,
    "아이콘에는 읽을 수 있는 라벨이 있어야 한다");
});

// ── H·I·J. 넘침 추적 ─────────────────────────────────────────────────────────

test("H·I 미배치는 사용자가 고른 것에서 배치된 것을 뺀 값이다", () => {
  const page = code("src/app/itinerary/page.tsx");
  assert.match(page, /const placedKeys = new Set\(usedPlaceIds\.map\(String\)\)/);
  assert.match(page, /cartHints[\s\S]{0,120}!placedKeys\.has\(String\(h\.place_id\)\)/,
    "고른 것 - 배치된 것 = 못 들어간 것");
  assert.match(page, /unplacedPicks/, "결과가 화면까지 전달되어야 한다");
});

test("J 일반 추천이 안 들어간 것은 사용자 목록에 넣지 않는다", () => {
  const page = code("src/app/itinerary/page.tsx");
  // 출처가 cartHints 뿐이다. NearMe/city_spots 후보는 여기 없다.
  const block = page.slice(page.indexOf("const placedKeys"), page.indexOf("const elapsed"));
  assert.ok(block.includes("cartHints"), "cartHints 에서만 뽑는다");
  for (const bad of ["baseCandidates", "nearMeResults", "dedupedBaseCandidates"]) {
    assert.ok(!block.includes(bad), `${bad} 가 섞이면 추천 미배치가 사용자 문제로 보인다`);
  }
});

test("H 안내에 순위·필수 선택 같은 해결 메뉴를 만들지 않는다", () => {
  for (const l of LOCALES) {
    const all = JSON.stringify(msgs[l]!.picks);
    for (const bad of ["Must include", "Prioritize", "priority", "HC-5", "HC-9"]) {
      assert.ok(!all.includes(bad), `${l}: "${bad}" 가 사용자 문구에 있다`);
    }
  }
  // 넘침 안내의 행동은 하나뿐이다
  assert.ok(msgs.en!.picks.overflowAction, "Review This Trip 하나면 된다");
});

test("M 못 들어간 My Place 의 identity 가 유지된다", () => {
  const page = code("src/app/itinerary/page.tsx");
  assert.match(page, /key:\s*h\.source_key/,
    "source_key 를 그대로 쓴다 — user_spot:{uuid} 가 보존된다");
});

// ── K·L. This Trip 에서 빼는 것 ≠ 지우는 것 ──────────────────────────────────

test("K·L This Trip 제거는 cart 만 건드린다", () => {
  const picks = code("src/app/picks/PicksClient.tsx");
  // 카드의 제거 버튼은 이번 여행에서 빼기만 한다 — 장소를 지우지 않는다.
  // 한국어에서 "삭제" 로 부르지 않도록 전용 문구를 쓴다.
  assert.match(picks, /aria-label=\{`\$\{t\("removeFromTrip"\)\}: \$\{item\.name\}`\}[\s\S]{0,90}removePlaceFromThisTrip\(item, tripCity\)/);
  const cart = code("src/lib/cart.ts");
  // cart 모듈이 favorites/user-spots 를 지우지 않는다
  for (const bad of ["removeFavorite", "apiDeleteUserSpot", "favorites", "user-spots"]) {
    assert.ok(!cart.includes(bad), `cart.ts 가 ${bad} 를 건드리면 원본이 사라진다`);
  }
});

// ── O. 접근성 ────────────────────────────────────────────────────────────────

test("O 강조는 무한 반복하지 않고 reduced-motion 을 존중한다", () => {
  const css = read("src/app/globals.css");
  const rule = css.slice(css.indexOf(".gkm-coach-pulse"));
  assert.ok(!/infinite/.test(rule), "무한 반복 금지");
  assert.match(css, /animation: gkm-coach-pulse [^;]*\s3;/, "정해진 횟수만 반복한다");
  assert.match(css, /prefers-reduced-motion: reduce\)[\s\S]{0,120}\.gkm-coach-pulse \{ animation: none/,
    "움직임을 줄여 달라고 한 사람에게는 멈춘다");
});

test("O 강조가 클릭 가능성을 해치지 않는다", () => {
  const coach = code("src/components/Coachmark.tsx");
  assert.ok(!/pointer-events/.test(coach));
  assert.match(coach, /motion-reduce:animate-none/);
});
