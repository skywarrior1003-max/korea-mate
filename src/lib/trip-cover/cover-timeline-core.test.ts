/**
 * Timeline 커버 액션 노출 조건 — TripMomentTimeline 이 쓰는 판정식과 동일 규칙
 * Run: node --experimental-strip-types src/lib/trip-cover/cover-timeline-core.test.ts
 *
 * 컴포넌트를 렌더하지 않고 판정 규칙만 고정한다. 규칙이 바뀌면 여기서 잡힌다.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

interface M { moment_id: string; synced: boolean; has_photo?: boolean; photo_data: string | null }

/** TripMomentTimeline 내부와 동일한 판정 */
function decide(m: M, isPublic: boolean, currentCoverMomentId: string | null) {
  const isCover = currentCoverMomentId !== null && currentCoverMomentId === m.moment_id;
  const canBeCover =
    !isCover && isPublic && m.synced && m.has_photo === true && Boolean(m.photo_data);
  return { isCover, canBeCover };
}

const MID = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const synced = (o: Partial<M> = {}): M =>
  ({ moment_id: MID, synced: true, has_photo: true, photo_data: "data:image/jpeg;base64,AA", ...o });

// ── 선택 가능 조건 ───────────────────────────────────────────────────────────

test("공개 + 동기화 완료 사진 → 선택 액션 표시", () => {
  const r = decide(synced(), true, null);
  assert.strictEqual(r.canBeCover, true);
  assert.strictEqual(r.isCover, false);
});

test("비공개 일정 → 새 커버 선택 불가", () => {
  assert.strictEqual(decide(synced(), false, null).canBeCover, false);
});

test("has_photo=false(사진 동기화 대기) → 선택 불가", () => {
  assert.strictEqual(decide(synced({ has_photo: false }), true, null).canBeCover, false);
  assert.strictEqual(decide(synced({ has_photo: undefined }), true, null).canBeCover, false);
});

test("synced=false(메타 동기화 대기) → 선택 불가", () => {
  assert.strictEqual(decide(synced({ synced: false }), true, null).canBeCover, false);
});

test("photo_data 없는 텍스트 Memory → 선택 불가", () => {
  assert.strictEqual(decide(synced({ photo_data: null }), true, null).canBeCover, false);
});

// ── 현재 커버 ────────────────────────────────────────────────────────────────

test("현재 커버 사진은 재설정 대신 Current 상태", () => {
  const r = decide(synced(), true, MID);
  assert.strictEqual(r.isCover, true);
  assert.strictEqual(r.canBeCover, false, "현재 커버에 재설정 액션이 뜨면 안 된다");
});

test("현재 커버 판정은 moment_id 일치로만 결정된다", () => {
  assert.strictEqual(decide(synced(), true, "other-id").isCover, false);
  assert.strictEqual(decide(synced(), true, null).isCover, false);
});

test("비공개 일정에서도 현재 커버는 표시된다 (해제 진입점 유지)", () => {
  const r = decide(synced(), false, MID);
  assert.strictEqual(r.isCover, true, "비공개라고 현재 커버를 숨기면 해제할 방법이 없다");
  assert.strictEqual(r.canBeCover, false);
});

test("현재 커버가 동기화 대기 상태여도 Current 표시는 유지된다", () => {
  // 사진이 지워져 has_photo=false 가 되어도 cover_moment_id 는 남을 수 있다
  const r = decide(synced({ has_photo: false }), true, MID);
  assert.strictEqual(r.isCover, true);
  assert.strictEqual(r.canBeCover, false);
});

test("isCover 와 canBeCover 는 동시에 참일 수 없다", () => {
  for (const pub of [true, false])
    for (const cur of [null, MID, "x"])
      for (const m of [synced(), synced({ synced: false }), synced({ has_photo: false }), synced({ photo_data: null })]) {
        const r = decide(m, pub, cur);
        assert.ok(!(r.isCover && r.canBeCover), "상호 배타 위반");
      }
});
