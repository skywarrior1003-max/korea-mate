// Social Actions Foundation — 순수 로직 단위 테스트.
// 실행: node --experimental-strip-types src/lib/social/social-actions-core.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  validateContentLikeRequest, validateSaveSignalRequest, validateShareEventRequest,
  actorKey, actorKeyInput, likeState, isValidContentLikeTargetKey,
} from "./social-actions-core.ts";

const DEV = "9f1c2b3a-0000-4000-8000-1234567890ab";
const TRIP = "0e0e0e0e-1111-4222-8333-444455556666";

test("content like: 유효 요청 / 잘못된 대상·행동·기기 거부", () => {
  const ok = validateContentLikeRequest({ target_type: "itinerary", target_key: TRIP, action: "like" }, DEV);
  assert.ok(ok.ok && ok.value.target_type === "itinerary" && ok.value.action === "like");
  const st = validateContentLikeRequest({ target_type: "story", target_key: TRIP.toUpperCase(), action: "unlike" }, DEV);
  assert.ok(st.ok && st.value.target_key === TRIP); // UUID 는 소문자로 정규화
  assert.deepEqual(validateContentLikeRequest({ target_type: "city_spot", target_key: "99", action: "like" }, DEV), { ok: false, error: "invalid_target" });
  assert.deepEqual(validateContentLikeRequest({ target_type: "itinerary", target_key: "99", action: "like" }, DEV), { ok: false, error: "invalid_target" });
  assert.deepEqual(validateContentLikeRequest({ target_type: "itinerary", target_key: TRIP, action: "toggle" }, DEV), { ok: false, error: "invalid_action" });
  assert.deepEqual(validateContentLikeRequest({ target_type: "itinerary", target_key: TRIP, action: "like" }, "raw-device"), { ok: false, error: "invalid_device" });
  assert.ok(!isValidContentLikeTargetKey("1; drop table"));
});

test("save signal: city_spot 숫자 키만 / save·unsave 만", () => {
  const ok = validateSaveSignalRequest({ target_type: "city_spot", target_key: "789", action: "save" }, DEV);
  assert.ok(ok.ok && ok.value.action === "save");
  assert.deepEqual(validateSaveSignalRequest({ target_type: "city_spot", target_key: TRIP, action: "save" }, DEV), { ok: false, error: "invalid_target" });
  assert.deepEqual(validateSaveSignalRequest({ target_type: "story", target_key: "789", action: "save" }, DEV), { ok: false, error: "invalid_target" });
  assert.deepEqual(validateSaveSignalRequest({ target_type: "city_spot", target_key: "789", action: "like" }, DEV), { ok: false, error: "invalid_action" });
});

test("share event: 대상별 키 형식 / 방법 제한", () => {
  assert.ok(validateShareEventRequest({ target_type: "city_spot", target_key: "28", method: "copy_link" }, DEV).ok);
  assert.ok(validateShareEventRequest({ target_type: "story", target_key: TRIP, method: "web_share" }, DEV).ok);
  assert.ok(validateShareEventRequest({ target_type: "itinerary", target_key: TRIP, method: "web_share" }, DEV).ok);
  assert.deepEqual(validateShareEventRequest({ target_type: "itinerary", target_key: "28", method: "web_share" }, DEV), { ok: false, error: "invalid_target" });
  assert.deepEqual(validateShareEventRequest({ target_type: "city_spot", target_key: "28", method: "email" }, DEV), { ok: false, error: "invalid_action" });
});

test("actor key: 행동·대상별로 다른 64자 hex — raw device 불포함", async () => {
  const like = await actorKey("like", DEV, "itinerary", TRIP);
  const save = await actorKey("save", DEV, "itinerary", TRIP);
  const other = await actorKey("like", DEV, "story", TRIP);
  assert.match(like, /^[0-9a-f]{64}$/);
  assert.notEqual(like, save);    // 행동이 다르면 키가 다르다 — 행동 간 연결 불가
  assert.notEqual(like, other);   // 대상이 다르면 키가 다르다 — 취향 재구성 불가
  assert.equal(like, await actorKey("like", DEV.toUpperCase(), "itinerary", TRIP)); // 안정적
  assert.ok(!actorKeyInput("like", DEV, "itinerary", TRIP).includes("sha")); // 입력은 평문 조합일 뿐
});

test("공개 응답은 숫자와 내 상태뿐", () => {
  assert.deepEqual(likeState(-3, true), { count: 0, liked: true });
  assert.deepEqual(Object.keys(likeState(2, false)).sort(), ["count", "liked"]);
});
