// 커뮤니티 반응·점수·제출·제안 순수 로직 테스트
// 실행: node --experimental-strip-types src/lib/community/community-core.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateReactionRequest, reactionState, communityScore, compareRanked,
  precheckSubmission, countScheduledPlaces, canResubmit, validateSuggestion,
  PLACE_FEEDBACK_REASONS, STORY_FEEDBACK_REASONS, COMMUNITY_NEW_CATEGORIES,
  USAGE_WEIGHT, MIN_STORY_PLACES, type RankInput,
} from "./community-core.ts";

const DEV = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const TRIP = "11111111-2222-4333-8444-555555555555";

test("반응 검증 — 대상·행동·기기", () => {
  assert.ok(validateReactionRequest({ target_type: "city_spot", target_key: "776", action: "like" }, DEV).ok);
  assert.ok(validateReactionRequest({ target_type: "story", target_key: TRIP, action: "dislike" }, DEV).ok);
  assert.ok(validateReactionRequest({ target_type: "story", target_key: TRIP, action: "clear" }, DEV).ok);
  assert.equal((validateReactionRequest({ target_type: "story", target_key: "776", action: "like" }, DEV) as { error: string }).error, "invalid_target");
  assert.equal((validateReactionRequest({ target_type: "city_spot", target_key: TRIP, action: "like" }, DEV) as { error: string }).error, "invalid_target");
  assert.equal((validateReactionRequest({ target_type: "city_spot", target_key: "776", action: "boost" }, DEV) as { error: string }).error, "invalid_action");
  assert.equal((validateReactionRequest({ target_type: "city_spot", target_key: "776", action: "like" }, "nope") as { error: string }).error, "invalid_device");
});

test("공개 응답에는 좋아요 수와 내 상태뿐 — 싫어요 수 필드 자체가 없다", () => {
  const s = reactionState(3, "dislike");
  assert.deepEqual(Object.keys(s).sort(), ["likeCount", "myReaction"]);
  assert.equal(reactionState(-2, null).likeCount, 0); // 음수 방어
});

test("점수 — like +1 · dislike −1 · 고유 활용 ×3, 그 밖의 축 없음", () => {
  assert.equal(USAGE_WEIGHT, 3);
  assert.equal(communityScore({ likes: 5, dislikes: 2, usage: 4 }), 5 - 2 + 12);
  assert.equal(communityScore({ likes: 0, dislikes: 0, usage: 0 }), 0);
});

test("동점 정렬 — 활용 → 좋아요 → 최근 승인 → 안정 ID", () => {
  const base = { dislikes: 0 };
  const rows: RankInput[] = [
    { id: "b", likes: 3, usage: 1, approvedAt: "2026-09-01T00:00:00Z", ...base }, // score 6
    { id: "a", likes: 0, usage: 2, approvedAt: "2026-09-01T00:00:00Z", ...base }, // score 6, usage 우선
    { id: "d", likes: 3, usage: 1, approvedAt: "2026-09-02T00:00:00Z", ...base }, // score 6, b 와 like·usage 동일 → 최근 승인
    { id: "c", likes: 9, usage: 0, ...base },                                     // score 9 최상위
  ];
  assert.deepEqual([...rows].sort(compareRanked).map(r => r.id), ["c", "a", "d", "b"]);
  // 전부 동일하면 ID 안정 정렬
  const same: RankInput[] = [
    { id: "z", likes: 1, dislikes: 0, usage: 0 }, { id: "y", likes: 1, dislikes: 0, usage: 0 }];
  assert.deepEqual([...same].sort(compareRanked).map(r => r.id), ["y", "z"]);
});

test("제출 사전검사 — 비공개·가림·미지원 도시·장소 부족·공개 moment 없음 전부 거절", () => {
  const good = { isPublic: true, moderationHidden: false, city: "busan", placeCount: 5, hasPublicMoment: true };
  assert.deepEqual(precheckSubmission(good), { ok: true, city: "busan" });
  assert.equal((precheckSubmission({ ...good, isPublic: false }) as { error: string }).error, "not_public");
  assert.equal((precheckSubmission({ ...good, moderationHidden: true }) as { error: string }).error, "moderation_hidden");
  assert.equal((precheckSubmission({ ...good, city: "tokyo" }) as { error: string }).error, "unsupported_city");
  assert.equal((precheckSubmission({ ...good, placeCount: MIN_STORY_PLACES - 1 }) as { error: string }).error, "too_few_places");
  assert.equal((precheckSubmission({ ...good, hasPublicMoment: false }) as { error: string }).error, "no_public_moment");
  // 표시명 저장값도 canonical 로 해석된다
  assert.deepEqual(precheckSubmission({ ...good, city: "부산" }), { ok: true, city: "busan" });
});

test("days 장소 수 — v1 배열·v2 {__v:2,scheduled} 모두", () => {
  assert.equal(countScheduledPlaces([{ places: [1, 2] }, { places: [3] }]), 3);
  assert.equal(countScheduledPlaces({ __v: 2, scheduled: [{ places: [1] }, { places: [] }] }), 1);
  assert.equal(countScheduledPlaces(null), 0);
  assert.equal(countScheduledPlaces({ __v: 3, scheduled: [{ places: [1] }] }), 0);
});

test("재제출 — rejected/withdrawn 만, pending/approved 는 중복", () => {
  assert.ok(canResubmit(null));
  assert.ok(canResubmit("rejected"));
  assert.ok(canResubmit("withdrawn"));
  assert.ok(!canResubmit("pending"));
  assert.ok(!canResubmit("approved"));
});

test("장소 제안 검증 — 필수 필드·길이·링크 형식·도시 canonical", () => {
  const good = { city: "전주", name: "메르밀진미집 본점", category: "restaurant",
    address: "전북 전주시 완산구 전주천동로 94", reason: "국수가 맛있어요" };
  const r = validateSuggestion(good);
  assert.ok(r.ok && r.value.city === "jeonju" && r.value.official_link === null);
  assert.equal((validateSuggestion({ ...good, city: "osaka" }) as { error: string }).error, "invalid_city");
  assert.equal((validateSuggestion({ ...good, name: "" }) as { error: string }).error, "invalid_name");
  assert.equal((validateSuggestion({ ...good, reason: "x".repeat(501) }) as { error: string }).error, "invalid_reason");
  assert.equal((validateSuggestion({ ...good, official_link: "javascript:alert(1)" }) as { error: string }).error, "invalid_link");
  const withLink = validateSuggestion({ ...good, official_link: "https://example.com/place" });
  assert.ok(withLink.ok && withLink.value.official_link === "https://example.com/place");
});

test("피드백 사유 세트 — 시트 조합과 068 신규 값의 정합", () => {
  // 두 시트 모두 마지막은 '기타'
  assert.equal(PLACE_FEEDBACK_REASONS[PLACE_FEEDBACK_REASONS.length - 1], "other");
  assert.equal(STORY_FEEDBACK_REASONS[STORY_FEEDBACK_REASONS.length - 1], "other");
  // 신규 값은 전부 어느 한 시트에서 실제로 노출된다(죽은 enum 없음)
  for (const c of COMMUNITY_NEW_CATEGORIES) {
    assert.ok(
      (PLACE_FEEDBACK_REASONS as readonly string[]).includes(c)
        || (STORY_FEEDBACK_REASONS as readonly string[]).includes(c), c);
  }
});
