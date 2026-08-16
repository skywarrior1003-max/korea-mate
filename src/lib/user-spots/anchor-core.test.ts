// Anchor 저장 조건과 생성 경로 계약 테스트.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { hasCompleteGps, canCreate, canEdit, decideCreateRoute } from "./anchor-core.ts";
import { runCreateFlow, type CreateFlowDeps } from "./create-flow.ts";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const LIST = readFileSync(join(ROOT, "functions/api/user-spots.ts"), "utf8");
const FORM = readFileSync(join(ROOT, "src/components/UserSpotForm.tsx"), "utf8");

// ── 좌표 짝 ───────────────────────────────────────────────────────────────────

test("좌표는 짝일 때만 위치다", () => {
  assert.equal(hasCompleteGps({ lat: 35, lng: 129 }), true);
  assert.equal(hasCompleteGps({ lat: 35, lng: null }), false);
  assert.equal(hasCompleteGps({ lat: null, lng: 129 }), false);
  assert.equal(hasCompleteGps({ lat: null, lng: null }), false);
});

// ── 생성 조건 ─────────────────────────────────────────────────────────────────

test("좌표만 있어도 만들 수 있다", () => {
  assert.equal(canCreate({ lat: 35, lng: 129, hasPhoto: false }), true);
});

test("사진만 있어도 만들 수 있다", () => {
  assert.equal(canCreate({ lat: null, lng: null, hasPhoto: true }), true);
});

test("좌표와 사진이 함께여도 만들 수 있다", () => {
  assert.equal(canCreate({ lat: 35, lng: 129, hasPhoto: true }), true);
});

test("근거가 없으면 만들 수 없다", () => {
  assert.equal(canCreate({ lat: null, lng: null, hasPhoto: false }), false);
});

test("canCreate 는 이름을 보지 않는다", () => {
  // 인자에 name 자리가 아예 없다 — 이름으로 저장 여부가 바뀔 길이 없다.
  assert.equal(canCreate.length, 1);
  const noAnchor = { lat: null, lng: null, hasPhoto: false };
  assert.equal(canCreate({ ...noAnchor, name: "적어 봤자" } as never), false);
});

// ── 수정 조건 ─────────────────────────────────────────────────────────────────

test("이름만으로 만들어진 예전 행도 고칠 수 있다", () => {
  assert.equal(canEdit({
    lat: null, lng: null, hasPhoto: false, name: "Legacy place", hasExistingPhoto: false,
  }), true);
});

test("이미 저장된 사진도 수정의 근거가 된다", () => {
  assert.equal(canEdit({
    lat: null, lng: null, hasPhoto: false, name: "", hasExistingPhoto: true,
  }), true);
});

test("근거도 이름도 없으면 수정도 막는다", () => {
  assert.equal(canEdit({
    lat: null, lng: null, hasPhoto: false, name: "   ", hasExistingPhoto: false,
  }), false);
});

// ── 생성 경로 ─────────────────────────────────────────────────────────────────

test("좌표만 → 기존 JSON 생성", () => {
  assert.equal(decideCreateRoute({ lat: 35, lng: 129, hasPhoto: false }), "json");
});

test("좌표 + 사진 → 장소를 먼저 만들고 사진을 붙인다", () => {
  assert.equal(decideCreateRoute({ lat: 35, lng: 129, hasPhoto: true }), "json-then-photo");
});

test("사진만 → 한 요청으로 만든다", () => {
  assert.equal(decideCreateRoute({ lat: null, lng: null, hasPhoto: true }), "with-photo");
});

test("근거 없음 → 아무것도 보내지 않는다", () => {
  assert.equal(decideCreateRoute({ lat: null, lng: null, hasPhoto: false }), "blocked");
});

// ── 생성 흐름 ─────────────────────────────────────────────────────────────────

function deps(over: Partial<CreateFlowDeps> = {}) {
  const calls: string[] = [];
  const d: CreateFlowDeps = {
    compress:        async () => { calls.push("compress"); return new Blob(["x"]); },
    createJson:      async () => { calls.push("createJson"); return "spot-1"; },
    createWithPhoto: async () => { calls.push("createWithPhoto"); return { ok: true, id: "spot-2" }; },
    uploadPhoto:     async () => { calls.push("uploadPhoto"); return { ok: true }; },
    ...over,
  };
  return { d, calls };
}
const FAKE_FILE = { name: "x.jpg" } as unknown as File;

test("근거 없으면 네트워크를 전혀 쓰지 않는다", async () => {
  const { d, calls } = deps();
  const r = await runCreateFlow({ lat: null, lng: null }, null, d);
  assert.equal(r.created, false);
  assert.equal(r.errorKey, "needAnchor");
  assert.deepEqual(calls, [], "요청 0건");
});

test("좌표만이면 JSON 생성 한 번", async () => {
  const { d, calls } = deps();
  const r = await runCreateFlow({ lat: 35, lng: 129 }, null, d);
  assert.equal(r.created, true);
  assert.equal(r.spotId, "spot-1");
  assert.deepEqual(calls, ["createJson"]);
});

test("사진만이면 with-photo 로 한 번에", async () => {
  const { d, calls } = deps();
  const r = await runCreateFlow({ lat: null, lng: null }, FAKE_FILE, d);
  assert.equal(r.created, true);
  assert.equal(r.spotId, "spot-2");
  assert.deepEqual(calls, ["compress", "createWithPhoto"]);
});

test("좌표 + 사진이면 장소를 먼저 만들고 사진을 붙인다", async () => {
  const { d, calls } = deps();
  const r = await runCreateFlow({ lat: 35, lng: 129 }, FAKE_FILE, d);
  assert.equal(r.created, true);
  assert.equal(r.notice, undefined);
  assert.deepEqual(calls, ["compress", "createJson", "uploadPhoto"]);
});

test("사진만 실패해도 만들어진 장소를 되돌리지 않는다", async () => {
  const { d, calls } = deps({ uploadPhoto: async () => ({ ok: false }) });
  const r = await runCreateFlow({ lat: 35, lng: 129 }, FAKE_FILE, d);
  assert.equal(r.created, true, "장소는 저장된 것이다");
  assert.equal(r.spotId, "spot-1");
  assert.equal(r.notice, "savedPhotoFailed");
  assert.ok(!calls.includes("deleteSpot"), "삭제 같은 되돌리기가 없다");
  // deps 에 삭제 수단 자체가 없다 — 되돌릴 방법이 구조적으로 없다.
  assert.ok(!("deleteSpot" in d), "흐름이 장소를 지울 수단을 갖지 않는다");
});

test("사진 업로드가 throw 해도 장소는 살아 있다", async () => {
  const { d } = deps({ uploadPhoto: async () => { throw new Error("network"); } });
  const r = await runCreateFlow({ lat: 35, lng: 129 }, FAKE_FILE, d);
  assert.equal(r.created, true);
  assert.equal(r.notice, "savedPhotoFailed");
});

test("사진만인데 서버가 실패하면 아무것도 만들지 않는다", async () => {
  const { d } = deps({ createWithPhoto: async () => ({ ok: false }) });
  const r = await runCreateFlow({ lat: null, lng: null }, FAKE_FILE, d);
  assert.equal(r.created, false, "성공처럼 보이면 안 된다");
  assert.equal(r.spotId, undefined);
  assert.equal(r.errorKey, "saveFailed");
});

test("읽을 수 없는 이미지는 네트워크를 쓰기 전에 멈춘다", async () => {
  const { d, calls } = deps({ compress: async () => { throw new Error("decode"); } });
  const r = await runCreateFlow({ lat: 35, lng: 129 }, FAKE_FILE, d);
  assert.equal(r.created, false);
  assert.equal(r.notice, "photoUnreadable");
  assert.deepEqual(calls, [], "장소도 만들지 않는다");
});

// ── 서버·폼 계약 ──────────────────────────────────────────────────────────────

test("JSON create 는 좌표를 요구하고 안정적인 code 를 준다", () => {
  assert.ok(LIST.includes("ANCHOR_REQUIRED"), "error code 필요");
  assert.match(LIST, /if \(!\(hasLat && hasLng\)\)/, "좌표가 유일한 근거다");
  assert.ok(!LIST.includes('Provide a name, or a location'), "이름을 대안으로 안내하지 않는다");
});

test("폼은 저장 조건을 anchor-core 에서 가져다 쓴다", () => {
  assert.ok(FORM.includes('from "@/lib/user-spots/anchor-core"'), "단일 출처 사용");
  // 만들기는 지도에서 확인한 좌표만 본다. 예전에는 `canCreate`(좌표 또는 사진)
  // 였고, 사진만 붙이면 지도를 열지 않고 좌표 없는 장소가 만들어졌다.
  // `canCreate` 자체는 서버·legacy 계약으로 남아 있고 폼이 쓰지 않을 뿐이다.
  assert.match(FORM, /mode === "create"[\s\S]{0,80}hasCompleteGps/, "만들기는 확인된 좌표");
  assert.ok(!FORM.includes("canCreate("), "만들기 버튼에 사진 대안을 다시 연결하지 않는다");
  assert.match(FORM, /canEdit\(/, "고치기는 canEdit");
  assert.ok(!FORM.includes("hasMinimumIdentity"), "이름 기반 옛 조건 제거");
});

test("폼은 고른 사진의 Object URL 을 반드시 되돌려준다", () => {
  assert.match(FORM, /URL\.createObjectURL\(photoFile\)[\s\S]{0,200}revokeObjectURL/);
});

test("사진 삭제는 이름을 해결책으로 안내하지 않는다", () => {
  // photoOnlyAnchor 문구에 이름을 넣으라는 안내가 없어야 한다
  const msgs = JSON.parse(readFileSync(join(ROOT, "src/messages/en.json"), "utf8")) as
    { picks: Record<string, string> };
  const s = msgs.picks.photoOnlyAnchor ?? "";
  assert.ok(s.length > 0, "문구 필요");
  assert.ok(!/\bname\b/i.test(s), "이름 입력을 해결책으로 제시하지 않는다");
  assert.ok(/location/i.test(s) && /delete/i.test(s), "위치 추가 또는 장소 삭제를 안내한다");
});
