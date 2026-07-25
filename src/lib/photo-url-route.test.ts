/**
 * Route-level tests for GET /api/trip-moments/:momentId/photo-url
 * Tests handlePhotoUrlCore with injected mock admin client.
 * Run: node --experimental-strip-types src/lib/photo-url-route.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { handlePhotoUrlCore } from "./photo-url-core.ts";

// ── mock 헬퍼 ─────────────────────────────────────────────────────────────────

const MOMENT_ID    = "00000000-0000-0000-0000-000000000001";
const DEVICE_ID    = "00000000-0000-0000-0000-000000000002";
const ITIN_ID      = "00000000-0000-0000-0000-000000000003";
const STORAGE_PATH = "itin/moment/photo.jpg";
const SIGNED_URL   = "https://example.supabase.co/storage/v1/object/sign/moments/itin/moment/photo.jpg?token=abc";

function makeChain(result: { data: unknown; error: unknown }) {
  const chain: any = {
    select: () => chain,
    eq:     () => chain,
    maybeSingle: async () => result,
  };
  return chain;
}

function mockAdmin({
  momentData  = null as unknown,
  momentErr   = null as unknown,
  itinData    = null as unknown,
  itinErr     = null as unknown,
  signedUrl   = SIGNED_URL as string | null,
  storageErr  = null as string | null,
} = {}) {
  let callCount = 0;
  return {
    from: (_table: string) => {
      callCount++;
      if (callCount === 1) return makeChain({ data: momentData, error: momentErr });
      return makeChain({ data: itinData, error: itinErr });
    },
    storage: {
      from: (_bucket: string) => ({
        createSignedUrl: async (_path: string, _exp: number) =>
          storageErr
            ? { data: null, error: { message: storageErr } }
            : { data: signedUrl ? { signedUrl } : null, error: null },
      }),
    },
  };
}

// ── 테스트 ────────────────────────────────────────────────────────────────────

test("정상 소유자 → 200, signedUrl·expiresAt만 반환", async () => {
  const admin = mockAdmin({
    momentData: { moment_id: MOMENT_ID, itinerary_id: ITIN_ID, storage_path: STORAGE_PATH },
    itinData:   { id: ITIN_ID },
    signedUrl:  SIGNED_URL,
  });
  const res = await handlePhotoUrlCore(MOMENT_ID, DEVICE_ID, admin as any);
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.signedUrl, SIGNED_URL);
  assert.ok(typeof body.expiresAt === "string" && body.expiresAt.length > 0);
  // storage_path·device_id·service key 비노출
  assert.deepStrictEqual(Object.keys(body).sort(), ["expiresAt", "signedUrl"]);
});

test("없는 moment (잘못된 device_id 포함) → 404", async () => {
  const admin = mockAdmin({ momentData: null });
  const res = await handlePhotoUrlCore(MOMENT_ID, DEVICE_ID, admin as any);
  assert.strictEqual(res.status, 404);
  const body = await res.json();
  assert.ok(!body.signedUrl);
  assert.ok(body.error);
});

test("itinerary 소유권 불일치 → 404", async () => {
  const admin = mockAdmin({
    momentData: { moment_id: MOMENT_ID, itinerary_id: ITIN_ID, storage_path: STORAGE_PATH },
    itinData:   null,
  });
  const res = await handlePhotoUrlCore(MOMENT_ID, DEVICE_ID, admin as any);
  assert.strictEqual(res.status, 404);
  const body = await res.json();
  assert.ok(!body.signedUrl);
});

test("storage_path 없는 moment → 404", async () => {
  const admin = mockAdmin({
    momentData: { moment_id: MOMENT_ID, itinerary_id: ITIN_ID, storage_path: null },
    itinData:   { id: ITIN_ID },
  });
  const res = await handlePhotoUrlCore(MOMENT_ID, DEVICE_ID, admin as any);
  assert.strictEqual(res.status, 404);
  const body = await res.json();
  assert.ok(!body.signedUrl);
});

test("moment DB 오류 → 500, 내부 오류 메시지 미노출", async () => {
  const admin = mockAdmin({ momentErr: { message: "connection timeout", code: "PGRST" } });
  const res = await handlePhotoUrlCore(MOMENT_ID, DEVICE_ID, admin as any);
  assert.strictEqual(res.status, 500);
  const body = await res.json();
  assert.ok(!body.signedUrl);
  const bodyStr = JSON.stringify(body);
  assert.ok(!bodyStr.includes("connection timeout"), "DB 오류 메시지 노출됨");
  assert.ok(!bodyStr.includes("PGRST"), "DB 오류 코드 노출됨");
});

test("itinerary DB 오류 → 500, 내부 오류 메시지 미노출", async () => {
  const admin = mockAdmin({
    momentData: { moment_id: MOMENT_ID, itinerary_id: ITIN_ID, storage_path: STORAGE_PATH },
    itinErr: { message: "query timeout", code: "57014" },
  });
  const res = await handlePhotoUrlCore(MOMENT_ID, DEVICE_ID, admin as any);
  assert.strictEqual(res.status, 500);
  const body = await res.json();
  assert.ok(!body.signedUrl);
  const bodyStr = JSON.stringify(body);
  assert.ok(!bodyStr.includes("query timeout"), "DB 오류 메시지 노출됨");
});

test("signed URL 생성 실패 → 500, 안전한 오류 메시지", async () => {
  const admin = mockAdmin({
    momentData: { moment_id: MOMENT_ID, itinerary_id: ITIN_ID, storage_path: STORAGE_PATH },
    itinData:   { id: ITIN_ID },
    storageErr: "Supabase storage internal error",
  });
  const res = await handlePhotoUrlCore(MOMENT_ID, DEVICE_ID, admin as any);
  assert.strictEqual(res.status, 500);
  const body = await res.json();
  assert.ok(!body.signedUrl);
  // 내부 오류 메시지 미노출
  const bodyStr = JSON.stringify(body);
  assert.ok(!bodyStr.includes("Supabase storage internal error"), "내부 오류 메시지 노출됨");
});

test("실패 응답에 민감 정보 없음 (storage_path·device_id·service key)", async () => {
  const admin = mockAdmin({ momentData: null });
  const res = await handlePhotoUrlCore(MOMENT_ID, DEVICE_ID, admin as any);
  const bodyStr = JSON.stringify(await res.json());
  assert.ok(!bodyStr.includes(STORAGE_PATH));
  assert.ok(!bodyStr.includes(DEVICE_ID));
  assert.ok(!bodyStr.includes("service_role"));
});
