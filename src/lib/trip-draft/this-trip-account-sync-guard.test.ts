// THIS-TRIP-ACCOUNT-SYNC-CLOSEOUT-V1 §9 — This Trip 계정 동기화 계약 가드
// 실행: node --experimental-strip-types src/lib/trip-draft/this-trip-account-sync-guard.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { mergeDraftItems } from "../../../functions/_lib/trip-draft-merge.ts";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("①②③④ — draft API 는 공통 판정기 경유(계정=user 축·guest=현 device 하나)", () => {
  const s = strip(read("functions/api/trip-draft.ts"));
  assert.ok(s.includes("resolveOwnership("), "공통 판정기 필수");
  assert.ok(!/headers\.get\("x-device-id"\)/.test(s), "판정기 밖 raw device 파싱 금지");
  assert.match(s, /own\.mode === "account"[\s\S]*owner_type: "user"/);
  assert.match(s, /owner_type: "device", owner_id: own\.currentDevice/);
  // 계정 조회가 current device 하나로 제한되지 않음 — user 축 row 를 읽는다
  assert.match(s, /owner_id=eq\.\$\{o\.owner_id\}/);
});

test("⑤⑥ — raw device 목록 클라 미반환·클라 다중 device 반복 호출 없음", () => {
  const api = strip(read("functions/api/trip-draft.ts"));
  assert.ok(!/own\.devices/.test(api), "draft API 는 scope 목록 자체를 쓰지 않는다(owner 축 단일 행)");
  const sync = strip(read("src/lib/trip-draft-sync.ts"));
  assert.ok(!/devices|account_devices/.test(sync), "클라이언트에 device 목록 개념 없음");
  assert.equal((sync.match(/fetch\("\/api\/trip-draft"/g) ?? []).length, 1, "GET 1곳");
  assert.equal((sync.match(/fetch\("\/api\/trip-draft\/ops"/g) ?? []).length, 1, "op 전송 1곳 — 반복/다중 device 호출 없음");
});

test("⑦ — 로그아웃 rotation 이 This Trip 캐시(koreamate_cart)를 제거", () => {
  // rotation 은 koreamate_* 개인 키를 지운다 — cart 키가 보존 목록에 없어야 한다
  const d = read("src/lib/deviceId.ts");
  assert.match(d, /koreamate_/);
  assert.ok(!/ROTATION_PRESERVE[\s\S]{0,200}koreamate_cart/.test(d), "cart 는 보존 금지");
  const pi = read("src/lib/place-identity.ts");
  assert.match(pi, /cart:\s*"koreamate_cart"/);
});

test("⑧⑪ — 병합은 identity 합집합: 중복 0·타 도시 공존·무손실", () => {
  const acc = [
    { sourceKey: "kto-1", id: "a", tripCity: "busan", sortOrder: 1, name: "A" },
    { sourceKey: "kto-2", id: "b", tripCity: "busan", sortOrder: 2, name: "B" },
  ];
  const guest = [
    { sourceKey: "kto-2", id: "b2", tripCity: "busan", sortOrder: 1, name: "B-dup" },
    { sourceKey: "kto-9", id: "g", tripCity: "gyeongju", sortOrder: 2, name: "G" },
  ];
  const m = mergeDraftItems(acc as never, guest as never);
  assert.equal(m.length, 3, "중복 1 제거·타 도시 1 보존");
  assert.deepEqual(m.map(x => x.sourceKey), ["kto-1", "kto-2", "kto-9"]);
  assert.equal(m[0].name, "A"); // account 순서·내용 우선
  assert.equal((m[2] as { tripCity?: string }).tripCity, "gyeongju"); // 타 도시 무손실 공존
  assert.ok(Number(m[2].sortOrder) > Number(m[1].sortOrder), "guest 신규는 뒤에");
  // 재병합 멱등(이미 흡수된 guest 를 다시 넣어도 불변)
  assert.equal(mergeDraftItems(m as never, guest as never).length, 3);
});

test("병합 배선 — activate 가 link 성공 후 병합·실패 시 active 미반환", () => {
  const a = strip(read("functions/api/auth/activate.ts"));
  const link = a.indexOf("linkCurrentDevice(");
  const merge = a.indexOf("mergeGuestDraftIntoAccount(");
  assert.ok(link > 0 && merge > link, "link → merge 순서");
  assert.match(a, /if \(!merged\) return json\(\{ error: "ownership_unavailable" \}, 503\)/);
  const lib = strip(read("functions/_lib/trip-draft-merge.ts"));
  assert.ok(!/console\./.test(lib), "로그 금지");
  assert.match(lib, /rpc\/trip_draft_merge_guest/); // 병합은 DB 원자 RPC(잠금·revision) 하나로
});

test("⑩ — AI/plan 입력은 카트에서 온다(별도 축 없음) + hydrate 표면 3곳", () => {
  // 카트가 서버 draft 와 동기화되므로 plan 입력도 계정 범위 데이터가 된다
  const planner = read("src/app/planner/PlannerClient.tsx");
  assert.match(planner, /getCityCart|getCart/);
  for (const p of ["src/app/picks/PicksClient.tsx", "src/components/CartDrawer.tsx", "src/app/planner/PlannerClient.tsx"]) {
    assert.match(read(p), /hydrateCartFromServer\(\)/, p + ": 진입 hydrate 필요");
  }
  // 카트 쓰기는 전부 서버 push 로 흐른다(단일 깔때기)
  assert.match(read("src/lib/cart.ts"), /recordCartChange/); // 스냅숏 push 폐기 — diff→op
});

test("⑨⑫⑬⑭⑮ — 079 잠금·기존 계약 무변경", () => {
  const files = readdirSync(join(ROOT, "supabase/migrations")).filter(f => f.endsWith(".sql"));
  assert.ok(files.length >= 79); // 080(durability) 추가는 전용 가드가 고정
  assert.equal(files.filter(f => f.startsWith("079")).length, 1);
  const s = read("supabase/migrations/079_trip_drafts.sql");
  assert.match(s, /PRIMARY KEY \(owner_type, owner_id\)/);
  assert.match(s, /ENABLE ROW LEVEL SECURITY/);
  assert.match(s, /REVOKE ALL ON TABLE public\.trip_drafts FROM PUBLIC, anon, authenticated/);
  assert.ok(!/CASCADE/.test(s), "FK/CASCADE 없음(다형 owner)");
  // Legal DRAFT 유지·연결 선택 UI 없음
  assert.match(read("src/lib/legal/privacy-content.ts"), /effectiveDate: null/);
  const sheet = strip(read("src/components/auth/ConsentSheet.tsx"));
  assert.equal((sheet.match(/<CheckRow /g) ?? []).length, 3, "연결 checkbox 추가 금지");
});
