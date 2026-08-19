// 서버가 알려준 Memory 공개 상태가 화면까지 도달하는가.
//
// 왜 이 테스트가 있는가
//   서버 GET 은 처음부터 `is_public` 을 내보내고 있었는데 클라이언트 변환기가
//   그 값을 버리고 있었다. 그래서 이미 공개된 Memory 에도 계속 "공개하기" 가
//   보였고, 재공개 정리(reconciliation)는 지난 상태를 볼 수 없었다.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ITIN = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const DEV  = "11111111-2222-3333-4444-555555555555";

/** localStorage 흉내 — 이 모듈이 쓰는 네 가지만 */
function installStorage(): void {
  const map = new Map<string, string>();
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  };
}

function installFetch(rows: unknown[]): void {
  (globalThis as Record<string, unknown>).fetch = async () =>
    ({ ok: true, json: async () => rows }) as unknown as Response;
}

const row = (id: string, isPublic: boolean) => ({
  moment_id: id, itinerary_id: ITIN, memo: "m", category: "food",
  lat: null, lng: null, location_label: "", captured_at: "2026-08-01T00:00:00Z",
  day_number: 1, has_photo: true, is_public: isPublic,
});

test("M1 서버가 공개라고 하면 화면도 공개로 본다", async () => {
  installStorage();
  installFetch([row("a", true), row("b", false)]);
  const { loadMomentsFromServer } = await import("./storage.ts");
  const out = await loadMomentsFromServer(ITIN, DEV);
  assert.equal(out.find(m => m.moment_id === "a")?.is_public, true);
  assert.equal(out.find(m => m.moment_id === "b")?.is_public, false);
});

test("M2 값이 없으면 공개가 아니다 — 기본은 비공개다", async () => {
  installStorage();
  const { is_public: _drop, ...noField } = row("c", true);
  installFetch([noField]);
  const { loadMomentsFromServer } = await import("./storage.ts");
  const out = await loadMomentsFromServer(ITIN, DEV);
  assert.equal(out[0]!.is_public, false);
});

test("M3 이상한 값을 참으로 읽지 않는다", async () => {
  installStorage();
  installFetch([{ ...row("d", false), is_public: "true" }]);
  const { loadMomentsFromServer } = await import("./storage.ts");
  const out = await loadMomentsFromServer(ITIN, DEV);
  assert.equal(out[0]!.is_public, false, "문자열 'true' 를 공개로 읽으면 안 된다");
});

test("M4 저장 경로는 여전히 나오지 않는다 — 기존 계약 회귀 없음", async () => {
  installStorage();
  installFetch([row("e", true)]);
  const { loadMomentsFromServer } = await import("./storage.ts");
  const out = await loadMomentsFromServer(ITIN, DEV);
  assert.ok(!("storage_path" in out[0]!));
  assert.equal(out[0]!.photo_data, null, "사진은 서버에서 오지 않는다");
  assert.equal(out[0]!.has_photo, true);
});

// ── 선택 기본값 ──────────────────────────────────────────────────────────────

const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const MODAL = code(readFileSync("src/components/PublishPreviewModal.tsx", "utf8"));
const PAGE  = code(readFileSync("src/app/itinerary/page.tsx", "utf8"));

test("O1 처음 선택은 서버의 지금 공개 상태뿐이다 — 전체 자동선택 없음", () => {
  assert.match(MODAL, /new Set\(memories\.filter\(m => m\.selectable && m\.isPublic\)\.map\(m => m\.momentId\)\)/);
  assert.ok(!/memories\.map\(m => m\.momentId\)\)/.test(MODAL), "전부 고른 상태로 시작하면 opt-in 이 아니다");
});

test("O2 아직 동기화되지 않은 Memory 는 고를 수 없다", () => {
  assert.match(MODAL, /const pickable\s+= memories\.filter\(m => m\.selectable\)/);
  assert.match(PAGE, /selectable: m\.synced === true/);
});

test("O3 고른 것이 있을 때만 동의를 요구하고, 동의 전에는 Publish 를 막는다", () => {
  assert.match(MODAL, /const consentNeeded = chosen\.length > 0/);
  assert.match(MODAL, /const consentDone\s+= !consentNeeded \|\| \(okRights && okUnderstand\)/);
  assert.match(MODAL, /disabled=\{phase === "publishing" \|\| !consentDone\}/);
});

test("O4 동의 문구는 기존 Memory 동의 문구를 그대로 쓴다 — 새 모델을 만들지 않는다", () => {
  assert.match(MODAL, /tMemo\("consentCheckRights"\)/);
  assert.match(MODAL, /tMemo\("consentCheckUnderstand"\)/);
  assert.match(MODAL, /summarizeSelection\(/);
});

test("O5 실패는 '아직 비공개' 와 '카드 실패' 를 구분한다", () => {
  assert.match(MODAL, /failNotPublished/);
  assert.match(MODAL, /cardFailed/);
  // 카드 실패가 공개를 되돌리지 않는다
  const card = MODAL.slice(MODAL.indexOf("handleOpenStoryCard"), MODAL.indexOf("handleOpenStoryCard") + 320);
  assert.ok(!/setPhase\("preview"\)/.test(card), "카드 실패로 공개 상태를 되돌리면 안 된다");
});

// ── 공유 CTA 중복 ────────────────────────────────────────────────────────────
//
// 같은 화면에 "공유 카드 만들기"(정본 TripStoryExport)와 "공유 이미지
// 만들기"(예전 renderShareCard)가 나란히 서 있었다. 이름이 한 단어만 다르고
// 결과물도 똑같이 세로 이미지라 무엇을 눌러야 하는지 알 수 없었다.

test("C1 정본 카드가 있는 화면에서는 예전 이미지 버튼을 그리지 않는다", () => {
  const legacy = MODAL.indexOf("void createCard()");
  assert.ok(legacy > 0, "예전 버튼을 찾지 못했다 — 테스트가 낡았다");
  const before = MODAL.slice(Math.max(0, legacy - 300), legacy);
  assert.match(before, /\{!onOpenStoryCard && \(/);
});

test("C2 정본을 주지 않는 호출부에서는 예전 버튼이 그대로 남는다", () => {
  // 조건이 `!onOpenStoryCard` 이므로 미제공 화면에서는 계속 그려진다.
  // 코드를 지우거나 renderShareCard 를 건드리지 않았음을 함께 확인한다.
  assert.match(MODAL, /createCard\(\)/);
  assert.match(MODAL, /renderShareCard\(/);
});

test("C3 두 CTA 가 동시에 보일 수 있는 조건이 없다", () => {
  const canonical = MODAL.indexOf('t("openStoryCard")');
  const legacy    = MODAL.indexOf("void createCard()");
  const cGuard = MODAL.slice(Math.max(0, canonical - 700), canonical);
  const lGuard = MODAL.slice(Math.max(0, legacy - 300), legacy);
  assert.match(cGuard, /\{onOpenStoryCard && \(/);
  assert.match(lGuard, /\{!onOpenStoryCard && \(/);
});

test("C4 세 번째 렌더러를 만들지 않았다", () => {
  const renderers = (MODAL.match(/renderShareCard|TripStoryExport/g) ?? []);
  assert.ok(!/canvas\.width\s*=/.test(MODAL), "이 화면이 직접 캔버스를 그리기 시작했다");
  assert.ok(renderers.length > 0);
});
