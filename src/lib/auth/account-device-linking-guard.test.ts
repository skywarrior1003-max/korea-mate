// DEVICE-ACCOUNT-LINKING-SECURITY-V1 §12 — 계정·기기 연결 보안 계약 가드
// 실행: node --experimental-strip-types src/lib/auth/account-device-linking-guard.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { resolveOwnership } from "../../../functions/_lib/ownership.ts";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** §4 감사에서 Account-owned 로 판정된 전 서버 진입점 — 전부 공통 판정기 필수 */
const ACCOUNT_OWNED_APIS = [
  "functions/api/itineraries.ts",
  "functions/api/itinerary.ts",
  "functions/api/itinerary/[id].ts",
  "functions/api/itinerary/[id]/cover.ts",
  "functions/api/trip-moments/index.ts",
  "functions/api/trip-moments/[id].ts",
  "functions/api/trip-moments/[momentId]/photo.ts",
  "functions/api/trip-moments/[momentId]/photos.ts",
  "functions/api/trip-moments/[momentId]/photo-url.ts",
  "functions/api/trip-moments/[momentId]/photos/[photoId].ts",
  "functions/api/trip-moments/[momentId]/public.ts",
  "functions/api/user-spots.ts",
  "functions/api/user-spots/[id].ts",
  "functions/api/user-spots/[id]/canonical-image.ts",
  "functions/api/user-spots/[id]/enrich.ts",
  "functions/api/user-spots/[id]/photo-url.ts",
  "functions/api/user-spots/[id]/photo.ts",
  "functions/api/user-spots/from-canonical.ts",
  "functions/api/user-spots/submit/[id].ts",
  "functions/api/user-spots/with-photo.ts",
  "functions/api/place-save.ts",
  "functions/api/place-suggestion.ts",
  "functions/api/place-suggestion/[id].ts",
];

// ── 판정기 단위(주입 fetch — 네트워크 0) ───────────────────────────────────
const ENV = {
  NEXT_PUBLIC_SUPABASE_URL: "https://qa.example",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "svc",
};
const DEV = "11111111-2222-4333-8444-00000000000a";
const req = (bearer?: string, device: string = DEV) =>
  new Request("https://qa.example/api/x", {
    headers: { "x-device-id": device, ...(bearer ? { authorization: `Bearer ${bearer}` } : {}) },
  });
type FakeOpts = { mappedUser?: string; userOk?: string | null; consent?: boolean | "fail"; allDevices?: string[]; mapFail?: boolean };
const fake = (o: FakeOpts) => (async (input: RequestInfo | URL) => {
  const url = String(input);
  if (url.includes("account_devices?select=user_id")) {
    if (o.mapFail) return new Response("x", { status: 500 });
    return new Response(JSON.stringify(o.mappedUser ? [{ user_id: o.mappedUser }] : []), { status: 200 });
  }
  if (url.includes("account_devices?select=device_id")) {
    return new Response(JSON.stringify((o.allDevices ?? [DEV]).map(d => ({ device_id: d }))), { status: 200 });
  }
  if (url.includes("/auth/v1/user")) {
    return o.userOk ? new Response(JSON.stringify({ id: o.userOk }), { status: 200 }) : new Response("{}", { status: 401 });
  }
  if (url.includes("user_consents")) {
    if (o.consent === "fail") return new Response("x", { status: 500 });
    return new Response(JSON.stringify(o.consent ? [{ id: 1 }] : []), { status: 200 });
  }
  throw new Error("unexpected " + url);
}) as typeof fetch;
const U1 = "00000000-0000-4000-8000-0000000000u1";
const U2 = "00000000-0000-4000-8000-0000000000u2";

test("판정기 — unlinked+무세션=guest(자기 device 하나)", async () => {
  const r = await resolveOwnership(ENV, req(), fake({}));
  assert.ok(r.ok && r.mode === "guest" && r.devices.length === 1 && r.devices[0] === DEV);
});

test("판정기 §3.2 — linked device 무세션 = 401(익명 폴백 금지)", async () => {
  const r = await resolveOwnership(ENV, req(), fake({ mappedUser: U1 }));
  assert.ok(!r.ok);
  if (!r.ok) assert.equal(r.response.status, 401);
});

test("판정기 — linked + 타 계정 세션 = 403", async () => {
  const r = await resolveOwnership(ENV, req("t"), fake({ mappedUser: U1, userOk: U2, consent: true }));
  assert.ok(!r.ok);
  if (!r.ok) assert.equal(r.response.status, 403);
});

test("판정기 — linked + 동일 계정 + 동의 없음 = 403 consent_required", async () => {
  const r = await resolveOwnership(ENV, req("t"), fake({ mappedUser: U1, userOk: U1, consent: false }));
  assert.ok(!r.ok);
  if (!r.ok) {
    assert.equal(r.response.status, 403);
    assert.match(await r.response.text(), /consent_required/);
  }
});

test("판정기 — linked + active 동일 계정 = account(전 기기 scope)", async () => {
  const other = "11111111-2222-4333-8444-00000000000b";
  const r = await resolveOwnership(ENV, req("t"), fake({ mappedUser: U1, userOk: U1, consent: true, allDevices: [DEV, other] }));
  assert.ok(r.ok && r.mode === "account");
  if (r.ok && r.mode === "account") {
    assert.equal(r.userId, U1);
    assert.deepEqual([...r.devices].sort(), [DEV, other].sort());
  }
});

test("판정기 fail-closed — mapping/consent 판정 장애 = 503(게스트 폴백 금지)", async () => {
  const a = await resolveOwnership(ENV, req(), fake({ mapFail: true }));
  assert.ok(!a.ok); if (!a.ok) assert.equal(a.response.status, 503);
  const b = await resolveOwnership(ENV, req("t"), fake({ mappedUser: U1, userOk: U1, consent: "fail" }));
  assert.ok(!b.ok); if (!b.ok) assert.equal(b.response.status, 503);
});

test("판정기 — body/query 의 device·user 를 읽지 않는다(§3.1)", () => {
  const s = strip(read("functions/_lib/ownership.ts"));
  assert.ok(!/request\.(json|formData)\(|searchParams/.test(s), "헤더·세션 외 신원 입력 금지");
  assert.ok(!/console\./.test(s), "로그 금지");
});

test("§12-7·8 — account-owned 전 API 가 공통 판정기 사용·맨 x-device-id 비교 잔존 0", () => {
  for (const p of ACCOUNT_OWNED_APIS) {
    const s = strip(read(p));
    assert.ok(s.includes("resolveOwnership("), p + ": 공통 판정기 필요");
    assert.ok(!/headers\.get\("x-device-id"\)/.test(s), p + ": 판정기 밖 raw device 파싱 금지");
  }
});

test("§12-1 — 소유권 WHERE 의 익명 단일 device 잔존 0(계정 scope 파일)", () => {
  for (const p of ACCOUNT_OWNED_APIS) {
    if (p === "functions/api/itinerary.ts") continue; // This Trip 은 deny-only 계약(현 기기 저장)
    if (p.startsWith("functions/api/place-")) continue; // 해시 축 — 아래 별도 검사
    const s = strip(read(p));
    assert.ok(!/\.eq\("device_id",\s*deviceId\)/.test(s), p + ": eq(device_id, deviceId) 잔존");
  }
  // 해시 축: unsave·제보 목록·철회가 scope 키(in.())를 쓴다
  assert.match(read("functions/api/place-save.ts"), /saver_key=in\./);
  assert.match(read("functions/api/place-suggestion.ts"), /suggester_key=in\./);
  assert.match(read("functions/api/place-suggestion/[id].ts"), /scopeKeys\.includes\(row\.suggester_key\)/);
});

test("078 — RESTRICT·RLS·직접 접근 차단·RPC 계약(§12-3·10)", () => {
  const files = readdirSync(join(ROOT, "supabase/migrations"));
  assert.equal(files.filter(f => f.startsWith("078")).length, 1);
  const s = read("supabase/migrations/078_account_devices.sql");
  assert.match(s, /ON DELETE RESTRICT/);
  assert.ok(!/ON DELETE CASCADE/.test(s.replace(/CASCADE 금지[^\n]*/g, "")), "CASCADE 금지");
  assert.match(s, /device_id\s+UUID\s+PRIMARY KEY/);
  assert.match(s, /ENABLE ROW LEVEL SECURITY/);
  assert.match(s, /REVOKE ALL ON TABLE public\.account_devices FROM PUBLIC, anon, authenticated/);
  assert.match(s, /ON CONFLICT \(device_id\) DO NOTHING/); // overwrite 불가 — UPDATE 문 자체가 없다
  assert.ok(!/UPDATE\s+public\.account_devices/i.test(s), "mapping UPDATE 금지");
  assert.match(s, /REVOKE ALL ON FUNCTION public\.link_device_to_account/);
});

test("§12-5·6 — activate 가 동의 확보 후 링크·409 device_already_linked·클라 실패 signOut", () => {
  const a = strip(read("functions/api/auth/activate.ts"));
  assert.ok(a.includes("linkCurrentDevice("), "activate 에 링크 단계");
  assert.match(a, /device_already_linked/);
  // 링크는 activeOk 안에만 있고, activeOk 는 동의 확인(existing/INSERT) 뒤에서만 호출된다
  assert.ok(a.indexOf("hasCurrentConsent(") < a.indexOf("return activeOk()"), "동의 확인이 링크 호출보다 앞");
  const cb = strip(read("src/app/auth/callback/AuthCallbackClient.tsx"));
  assert.ok(cb.indexOf("activateAccount()") < cb.indexOf("router.replace(back)"), "activate(+link) 후에만 복귀");
  assert.match(cb, /signOut/);
  assert.match(cb, /link_conflict/);
});

test("§12-4 — 로그아웃 rotation 필수·서버 mapping 무접촉", () => {
  const d = read("src/lib/deviceId.ts");
  assert.match(d, /export function rotateDeviceId/);
  assert.match(d, /crypto\.randomUUID\(\)/);
  const a = strip(read("src/lib/auth/auth-client.ts"));
  assert.ok(a.includes("signOutAndReset"), "reset 로그아웃 경로");
  assert.ok(a.indexOf("signOut()") < a.indexOf("rotateDeviceId()"), "세션 종료 성공 후에만 rotation");
  assert.ok(!/account_devices/.test(a), "클라이언트가 mapping 을 만지지 않는다");
  const m = strip(read("src/app/more/MoreClient.tsx"));
  assert.ok(m.includes("signOutAndReset"), "More 로그아웃이 reset 경로 사용");
  assert.ok(!m.includes("signOutUser"), "rotation 없는 로그아웃 잔존 금지");
});

test("§12-9 — 신규 서버 코드 raw id 응답·로그 0(정적)", () => {
  for (const p of ["functions/_lib/ownership.ts", "functions/api/auth/activate.ts"]) {
    const s = strip(read(p));
    assert.ok(!/console\./.test(s), p);
    assert.ok(!/devices\s*[,}]/.test(s.match(/json\(\{[^}]*\}/g)?.join("") ?? ""), p + ": scope 응답 금지");
  }
});

test("§12-15·16·17 — 4locale 안내·선택 UI 없음", () => {
  for (const l of ["ko", "en", "ja", "zh"]) {
    const d = JSON.parse(read(`src/messages/${l}.json`)) as { auth: Record<string, string> };
    assert.ok(d.auth.consentAutoLink?.length > 10, l + " consentAutoLink");
    assert.ok(d.auth.accountLinkedHint?.length > 5, l + " accountLinkedHint");
    assert.ok(d.auth.consentLinkConflict?.length > 5, l + " consentLinkConflict");
  }
  const sheet = strip(read("src/components/auth/ConsentSheet.tsx"));
  assert.ok(sheet.includes("consentAutoLink"), "자동 연결 안내 존재");
  // 안내는 체크박스가 아니다 — 체크박스는 여전히 정확히 3개(연결 선택 박스 금지)
  assert.equal((sheet.match(/<CheckRow /g) ?? []).length, 3); // 렌더 3개 — 연결용 4번째 금지
  assert.ok(!/연결하기|link this device|기기 연결\s*버튼/i.test(sheet), "연결 선택 버튼 금지");
});

test("§12-11·12·13·14 — 기존 계약 무변경", () => {
  const files = readdirSync(join(ROOT, "supabase/migrations")).filter(f => f.endsWith(".sql"));
  assert.equal(files.length, 78);
  // 073~077 무수정은 migration 스냅숏 digest 가드(3파일)가 고정한다 — 여기선 존재만
  for (const n of ["073", "074", "075", "076", "077"]) assert.ok(files.some(f => f.startsWith(n)));
  const rank = read("functions/api/recommendations/[city]/places.ts");
  assert.ok(!/account_devices|resolveOwnership/.test(rank), "ranking 무변경");
  const usage = read("functions/api/place-usage.ts");
  assert.ok(!/resolveOwnership/.test(usage), "usage 신호 계약 무변경(비식별 aggregate)");
  // Legal DRAFT 유지
  assert.match(read("src/lib/legal/privacy-content.ts"), /effectiveDate: null/);
  // 계정 삭제 가능 문구 금지(구현 전)
  for (const l of ["ko", "en", "ja", "zh"]) {
    const auth = (JSON.parse(read(`src/messages/${l}.json`)) as { auth: Record<string, string> }).auth;
    for (const v of Object.values(auth)) assert.ok(!/계정을 삭제|delete your account/i.test(v));
  }
});

test("클라이언트 — private 호출은 공통 헤더 헬퍼 경유(§12-2 주입 금지의 클라 짝)", () => {
  // "x-device-id" 리터럴은 헬퍼 파일과 withAuthHeader(...) 인자 안에서만 허용
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
      const p = `${dir}/${e.name}`;
      if (e.isDirectory()) { if (!/node_modules|\.next|out/.test(e.name)) walk(p); continue; }
      if (!/\.(ts|tsx)$/.test(e.name) || /test\.ts/.test(e.name)) continue;
      if (p.endsWith("device-auth-headers.ts")) continue;
      if (p.endsWith("auth/consent-client.ts")) continue; // activate 자체가 명시 Bearer+device 전송 지점
      const s = read(p);
      let i = -1;
      while ((i = s.indexOf('"x-device-id"', i + 1)) >= 0) {
        const before = s.slice(Math.max(0, i - 400), i);
        if (!/withAuthHeader\(/.test(before)) { offenders.push(p); break; }
      }
    }
  };
  walk("src");
  assert.deepEqual(offenders, []);
});
