// 조회수 서버 경유 계약 회귀 방어.
//
// Pages Function 과 브라우저 코드, 그리고 037 권한 회수는 하나의 계약이다.
// 셋 중 하나만 되돌아가도 조작 경로가 다시 열린다(브라우저가 직접 RPC 를 부르거나,
// raw device id 가 DB 로 흘러가거나, 옛 RPC 가 다시 공개되거나).
//
// Function 을 실제로 실행하려면 Cloudflare 런타임과 service_role 이 필요하므로,
// 여기서는 소스 계약을 고정하고 SHA-256 구현만 Node WebCrypto 로 실제 검증한다.
// DB 동작은 운영에서 transaction rollback 으로 확인했다.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const FN_PATH = join(ROOT, "functions", "api", "itinerary", "view", "[id].ts");
const FN = readFileSync(FN_PATH, "utf8");
// 주석을 뺀 실행 코드 — 설명 주석에 'User-Agent'·'view_count' 같은 단어가
// 나오므로, 금지 항목 검사는 반드시 코드 본문만 대상으로 한다.
const FN_CODE = FN.split("\n").filter(l => !l.trimStart().startsWith("//")).join("\n");
const SHARED = readFileSync(join(ROOT, "src", "app", "shared", "page.tsx"), "utf8");
const M037 = readFileSync(join(ROOT, "supabase", "migrations",
  "037_revoke_public_increment_trip_view_execute.sql"), "utf8");
const M037_SQL = M037.split("\n").filter(l => !l.trimStart().startsWith("--")).join("\n");

// ── Pages Function ───────────────────────────────────────────────────────────
test("★endpoint 가 존재한다", () => {
  assert.ok(existsSync(FN_PATH));
});

test("★POST 만 허용한다", () => {
  assert.match(FN, /export async function onRequestPost/);
  assert.match(FN, /ctx\.request\.method === "POST"/);
  assert.match(FN, /status: 405/);
});

test("★UUID 형식을 검증한다", () => {
  assert.match(FN, /UUID_RE\s*=\s*\/\^\[0-9a-f\]\{8\}-/);
  assert.match(FN, /if \(!UUID_RE\.test\(itineraryId\)\) return json\(\{ error: "Invalid itinerary id" \}, 400\)/);
});

test("★기존 x-device-id 계약을 쓴다 — 새 식별 체계를 만들지 않는다", () => {
  assert.match(FN_CODE, /headers\.get\("x-device-id"\)/);
  assert.doesNotMatch(FN_CODE, /cf-connecting-ip|x-forwarded-for|user-agent/i);
});

test("★IP·User-Agent·fingerprint 를 읽거나 저장하지 않는다", () => {
  assert.doesNotMatch(FN, /\brequest\.cf\b|cf-connecting-ip|x-real-ip|navigator\./i);
});

test("★★raw device id 를 DB 로 넘기지 않는다 — hash 만 전달", () => {
  assert.match(FN, /p_viewer_hash:\s*viewerHash/);
  assert.doesNotMatch(FN, /p_viewer_hash:\s*deviceId/);
  assert.doesNotMatch(FN, /device_id:\s*deviceId/);
});

test("★★raw device id 를 로그에 남기지 않는다", () => {
  const logs = [...FN.matchAll(/console\.\w+\(([^)]*)\)/g)].map(m => m[1]);
  for (const l of logs) assert.doesNotMatch(l, /deviceId/);
  // 이 Function 은 아예 콘솔 출력을 하지 않는다
  assert.equal(logs.length, 0);
});

test("★SHA-256 소문자 64 hex 를 Web Crypto 로 만든다", () => {
  assert.match(FN, /crypto\.subtle\.digest\("SHA-256"/);
  assert.match(FN, /toString\(16\)\.padStart\(2, "0"\)/);
});

test("★★SHA-256 구현이 실제로 소문자 64 hex 를 낸다", async () => {
  const sha256Hex = async (input: string) => {
    const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
    return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, "0")).join("");
  };
  const out = await sha256Hex("3f0d1c5a-9b2e-4a77-8c31-1e6d5f0a2b44");
  assert.match(out, /^[0-9a-f]{64}$/);
  // 결정적이어야 dedup 이 성립한다
  assert.equal(out, await sha256Hex("3f0d1c5a-9b2e-4a77-8c31-1e6d5f0a2b44"));
  assert.notEqual(out, await sha256Hex("other-device-id"));
});

test("★service_role 은 서버에서만 읽는다 — 클라이언트 번들 유입 없음", () => {
  assert.match(FN, /ctx\.env\.SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(FN, /NEXT_PUBLIC_SUPABASE_SERVICE|process\.env\.SUPABASE_SERVICE/);
  // 브라우저 코드에는 service_role 이 없어야 한다
  assert.doesNotMatch(SHARED, /SERVICE_ROLE/i);
});

test("★응답이 일정 존재·공개·중복 여부를 구분하지 않는다", () => {
  // 정상 형식이면 결과와 무관하게 204
  assert.match(FN_CODE, /return noContent\(\);/);
  // 응답 본문에 집계 결과나 일정 상태가 실리지 않는다
  assert.doesNotMatch(FN_CODE, /view_count|is_public|counted/);
  assert.doesNotMatch(FN_CODE, /return json\(\{[^}]*(counted|result|data|viewerHash)/);
  // RPC 반환값을 받아 두지 않는다
  assert.doesNotMatch(FN_CODE, /(const|let)\s+\w+\s*=\s*await admin\.rpc/);
});

test("★DB 오류가 화면을 막지 않는다", () => {
  assert.match(FN, /catch \{[\s\S]{0,200}\}/);
  assert.match(FN, /await admin\.rpc\("record_public_itinerary_view"/);
});

test("★device id 길이 상한이 있다", () => {
  assert.match(FN, /DEVICE_ID_MAX\s*=\s*\d+/);
  assert.match(FN, /deviceId\.length > DEVICE_ID_MAX/);
});

// ── 브라우저 ─────────────────────────────────────────────────────────────────
test("★★브라우저가 Supabase RPC 를 직접 부르지 않는다", () => {
  assert.doesNotMatch(SHARED, /rest\/v1\/rpc\/increment_trip_view/);
  assert.doesNotMatch(SHARED, /trip_id_param/);
});

test("★★저장소 전체에서 브라우저 직접 increment_trip_view 호출 0", () => {
  const walk = (dir: string, out: string[] = []): string[] => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name === ".next" || e.name === "out") continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p, out);
      else if (/\.tsx?$/.test(p) && !/\.test\.tsx?$/.test(p)) out.push(p);
    }
    return out;
  };
  const hits: string[] = [];
  for (const f of walk(join(ROOT, "src"))) {
    for (const [i, line] of readFileSync(f, "utf8").split("\n").entries()) {
      if (line.trimStart().startsWith("//")) continue;
      if (/rpc\/increment_trip_view|rpc\(\s*["']increment_trip_view/.test(line))
        hits.push(`${f.replace(ROOT, "")}:${i + 1}`);
    }
  }
  assert.deepEqual(hits, []);
});

test("★새 서버 route 를 device id 헤더와 함께 호출한다", () => {
  assert.match(SHARED, /fetch\(`\/api\/itinerary\/view\/\$\{trip\.id\}`/);
  assert.match(SHARED, /"x-device-id": getDeviceId\(\)/);
  assert.match(SHARED, /method:\s*"POST"/);
});

test("★공개 조회 성공 후에만 호출한다 — 비공개·미존재에서는 호출 0", () => {
  const eff = SHARED.slice(SHARED.indexOf("const key = `viewed_${trip.id}`") - 200,
                           SHARED.indexOf("}, [trip?.id]);") + 20);
  assert.match(eff, /if \(!trip\?\.id\) return;/);
  assert.match(eff, /\[trip\?\.id\]/);
});

test("★반환값을 UI 렌더링 조건으로 쓰지 않는다", () => {
  const eff = SHARED.slice(SHARED.indexOf("fetch(`/api/itinerary/view/"),
                           SHARED.indexOf("}, [trip?.id]);"));
  assert.doesNotMatch(eff, /\.then\(|await |setState|set[A-Z]/);
  assert.match(eff, /\.catch\(/);
});

test("sessionStorage 는 네트워크 절감용 보조 최적화로만 남는다", () => {
  assert.match(SHARED, /sessionStorage\.getItem\(key\)/);
  assert.match(SHARED, /중복 방지의 책임은 서버·DB/);
});

// ── 037 ──────────────────────────────────────────────────────────────────────
test("★037 이 anon·authenticated·PUBLIC EXECUTE 를 회수한다", () => {
  for (const role of ["anon", "authenticated", "PUBLIC"])
    assert.match(M037_SQL, new RegExp(`REVOKE EXECUTE ON FUNCTION public\\.increment_trip_view\\(uuid\\) FROM ${role};`));
});

test("★037 이 service_role EXECUTE 를 유지한다", () => {
  assert.match(M037_SQL, /GRANT EXECUTE ON FUNCTION public\.increment_trip_view\(uuid\) TO service_role;/);
});

test("★037 은 함수 본문·signature 를 바꾸지 않고 DROP 하지 않는다", () => {
  assert.doesNotMatch(M037_SQL, /CREATE OR REPLACE FUNCTION/i);
  assert.doesNotMatch(M037_SQL, /DROP FUNCTION/i);
  assert.doesNotMatch(M037_SQL, /ALTER FUNCTION[^;]*RENAME/i);
});

test("★037 은 다른 함수·테이블·정책을 바꾸지 않는다", () => {
  const grants = [...M037_SQL.matchAll(/(?:GRANT|REVOKE)[^;]*ON FUNCTION\s+([a-zA-Z_.]+\([^)]*\))/gi)]
    .map(m => m[1].replace(/\s+/g, ""));
  assert.deepEqual([...new Set(grants)], ["public.increment_trip_view(uuid)"]);
  assert.doesNotMatch(M037_SQL, /CREATE POLICY|DROP POLICY|ALTER TABLE|ENABLE ROW LEVEL/i);
});

test("★037 은 036 적용을 전제로 검증한다", () => {
  assert.match(M037_SQL, /itinerary_view_dedup/);
  assert.match(M037_SQL, /record_public_itinerary_view/);
});

test("★migration 번호가 겹치지 않는다", () => {
  const dir = join(ROOT, "supabase", "migrations");
  assert.deepEqual(readdirSync(dir).filter(f => f.startsWith("037")),
                   ["037_revoke_public_increment_trip_view_execute.sql"]);
});
