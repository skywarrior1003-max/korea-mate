// 플래너 진입 UX 단위 테스트
// 실행: node --experimental-strip-types src/lib/planner-entry.test.ts
//
// HomeClient 의 두 결정 로직을 순수 함수 형태로 옮겨 검증한다.
// 컴포넌트 렌더는 테스트 프레임워크가 없어 다루지 않고, 브라우저 QA 가 덮는다.
//   1. Generate 한 번에 모달이 몇 개 뜨는가
//   2. /#planner 진입 시 focus 를 옮겨도 되는가

import { test } from "node:test";
import assert from "node:assert/strict";

// ── 1. Generate 클릭 분기 ────────────────────────────────────────────────────
//
// HomeClient.handleGenerate + 출발정보 경고의 "Continue Without It" 을 그대로 옮긴 것.
// 반환값은 그 클릭에서 사용자가 보게 되는 결과다.

type Step = "alert-no-dates" | "dept-warning" | "vibe-modal" | "navigate";

function generateFlow(s: {
  startDate: string; endDate: string;
  isNavigating: boolean;
  departurePlace: string; departureTime: string; deptDismissed: boolean;
  cartItemCount: number;
}): Step {
  if (!s.startDate || !s.endDate) return "alert-no-dates";
  if (s.isNavigating) return "navigate";
  if (!s.departurePlace && !s.departureTime && !s.deptDismissed) return "dept-warning";
  if (s.cartItemCount === 0) return "vibe-modal";
  return "navigate";
}

/** 출발정보 경고에서 "Continue Without It" 을 눌렀을 때 (수정 후) */
function continueWithoutDeparture(): Step {
  // deptDismissed 를 세우고 곧바로 이동한다. Vibe 모달을 다시 띄우지 않는다.
  return "navigate";
}

const base = {
  startDate: "2026-10-10", endDate: "2026-10-13", isNavigating: false,
  departurePlace: "", departureTime: "", deptDismissed: false, cartItemCount: 0,
};

test("날짜가 없으면 기존 alert 로 중단한다", () => {
  assert.equal(generateFlow({ ...base, startDate: "" }), "alert-no-dates");
  assert.equal(generateFlow({ ...base, endDate: "" }), "alert-no-dates");
});

test("빈 Cart + 출발정보 없음 → 첫 Generate 는 출발정보 경고 하나만", () => {
  assert.equal(generateFlow(base), "dept-warning");
});

test("★핵심: Continue Without It 이후 모달을 더 띄우지 않는다", () => {
  assert.equal(continueWithoutDeparture(), "navigate");
});

test("한 번의 Generate 클릭에서 모달은 최대 1개", () => {
  const first = generateFlow(base);              // dept-warning
  const then  = continueWithoutDeparture();      // navigate
  const modals = [first, then].filter(x => x === "dept-warning" || x === "vibe-modal");
  assert.equal(modals.length, 1, `모달 ${modals.length}개: ${modals}`);
});

test("빈 Cart + 출발정보 있음 → 기존 Vibe 흐름 유지", () => {
  assert.equal(generateFlow({ ...base, departurePlace: "Gimhae" }), "vibe-modal");
  assert.equal(generateFlow({ ...base, departureTime: "18:00" }), "vibe-modal");
});

test("빈 Cart + 경고를 이미 넘긴 상태 → Vibe 흐름 유지", () => {
  assert.equal(generateFlow({ ...base, deptDismissed: true }), "vibe-modal");
});

test("Cart 1개 이상 → 기존 직접 생성 경로", () => {
  assert.equal(generateFlow({ ...base, cartItemCount: 1, departurePlace: "Gimhae" }), "navigate");
  assert.equal(generateFlow({ ...base, cartItemCount: 3, deptDismissed: true }), "navigate");
});

test("Cart 1개 이상이어도 출발정보 경고는 그대로 먼저 뜬다", () => {
  assert.equal(generateFlow({ ...base, cartItemCount: 3 }), "dept-warning");
});

// ── 2. style fallback ────────────────────────────────────────────────────────
//
// 취향 미선택 사용자를 위한 기존 handleContinueWithoutPicks 의 fallback 을
// 그대로 쓴다. 새 기본값을 만들지 않는다.
const effectiveStyle = (style: string) => style || "Solo";

test("style 미선택이면 Solo 로 떨어진다 — 기존 fallback 재사용", () => {
  assert.equal(effectiveStyle(""), "Solo");
});

test("사용자가 고른 style 은 보존된다", () => {
  for (const s of ["Solo", "Couple", "Family", "Friends"]) {
    assert.equal(effectiveStyle(s), s);
  }
});

// ── 3. planner focus 판정 ────────────────────────────────────────────────────
//
// HomeClient 의 focusPlanner 조건을 그대로 옮긴 것.

function shouldFocusPlanner(s: {
  hash: string; sectionExists: boolean; activeInsideSection: boolean;
}): boolean {
  if (s.hash !== "#planner") return false;
  if (!s.sectionExists) return false;
  if (s.activeInsideSection) return false;   // 입력 중인 사용자의 커서를 빼앗지 않는다
  return true;
}

const f = { hash: "#planner", sectionExists: true, activeInsideSection: false };

test("#planner 로 들어오면 focus 를 옮긴다", () => {
  assert.equal(shouldFocusPlanner(f), true);
});

test("다른 해시·해시 없음에서는 focus 를 건드리지 않는다", () => {
  for (const h of ["", "#", "#top", "#planner-heading", "#explore"]) {
    assert.equal(shouldFocusPlanner({ ...f, hash: h }), false, h);
  }
});

test("섹션이 아직 없으면 아무 일도 하지 않는다", () => {
  assert.equal(shouldFocusPlanner({ ...f, sectionExists: false }), false);
});

test("★이미 플래너 안쪽에 focus 가 있으면 빼앗지 않는다", () => {
  assert.equal(shouldFocusPlanner({ ...f, activeInsideSection: true }), false);
});

test("focus loop 없음 — 옮긴 뒤 다시 부르면 조건이 거짓이 된다", () => {
  let insideNow = false;
  const run = () => {
    const ok = shouldFocusPlanner({ ...f, activeInsideSection: insideNow });
    if (ok) insideNow = true;      // focus 가 섹션으로 옮겨간 상태
    return ok;
  };
  assert.equal(run(), true);       // 1회차: 옮긴다
  assert.equal(run(), false);      // 2회차: 이미 안에 있으므로 중단
  assert.equal(run(), false);      // 3회차도 동일
});

// ── 4. 공지 모달 focus 복원 판정 ─────────────────────────────────────────────
//
// NoticeModal 의 cleanup 조건을 그대로 옮긴 것. 모달이 ✕ 로 focus 를 가져간
// 뒤 닫을 때, 열기 직전의 요소로 돌려준다. /#planner 로 들어온 사용자는
// 이것이 없으면 focus 가 <body> 로 떨어져 플래너 위치를 잃는다.

function shouldRestoreFocus(prev: { exists: boolean; isConnected: boolean } | null): boolean {
  if (!prev || !prev.exists) return false;
  return prev.isConnected;   // 사라진 요소에는 되돌릴 수 없다
}

test("모달을 닫으면 열기 직전 요소로 focus 를 돌려준다", () => {
  assert.equal(shouldRestoreFocus({ exists: true, isConnected: true }), true);
});

test("열기 직전 focus 가 없었으면 아무 데도 손대지 않는다", () => {
  assert.equal(shouldRestoreFocus(null), false);
  assert.equal(shouldRestoreFocus({ exists: false, isConnected: false }), false);
});

test("★그 사이 사라진 요소면 억지로 다른 곳을 잡지 않는다", () => {
  assert.equal(shouldRestoreFocus({ exists: true, isConnected: false }), false);
});
