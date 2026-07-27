/**
 * Trip Cover V1B — 커버 상태 로직 테스트
 * Run: node --experimental-strip-types src/lib/trip-cover/cover-state-core.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CONSENT_VERSION, parseCoverRequest, buildCoverPatch, buildResetPatch,
  verifyPersonalCover, needsMomentLookup, coverETag, etagMatches, coverVersion,
  coverWriteBlock,
} from "./cover-state-core.ts";
import type { ItineraryCoverRow, MomentRow } from "./cover-state-core.ts";

const ITIN_ID = "11111111-1111-4111-8111-111111111111";
const DEV_ID  = "22222222-2222-4222-8222-222222222222";
const MOM_ID  = "33333333-3333-4333-8333-333333333333";
const NOW     = "2026-07-27T00:00:00.000Z";

function itin(over: Partial<ItineraryCoverRow> = {}): ItineraryCoverRow {
  return {
    id: ITIN_ID, device_id: DEV_ID, is_public: true, updated_at: NOW,
    cover_kind: "moment", cover_asset_id: null, cover_moment_id: MOM_ID,
    cover_consent_at: NOW, cover_consent_version: CONSENT_VERSION, ...over,
  };
}
function moment(over: Partial<MomentRow> = {}): MomentRow {
  return { moment_id: MOM_ID, itinerary_id: ITIN_ID, device_id: DEV_ID,
           storage_path: "a/b/c.jpg", ...over };
}

/** valid=false 를 단언하고 reason 을 반환 (판별 유니온 좁히기) */
function reasonOf(v: ReturnType<typeof verifyPersonalCover>): string {
  assert.strictEqual(v.valid, false);
  return v.valid ? "" : v.reason;
}

// ── 요청 파싱 ────────────────────────────────────────────────────────────────

test("auto 요청 정상", () => {
  const r = parseCoverRequest({ kind: "auto" });
  assert.ok(r.ok); assert.strictEqual(r.kind, "auto");
});

test("asset 요청 정상", () => {
  const r = parseCoverRequest({ kind: "asset", assetId: "busan-v1-beach_ocean-002" });
  assert.ok(r.ok); assert.strictEqual(r.assetId, "busan-v1-beach_ocean-002");
});

test("moment 요청 정상", () => {
  const r = parseCoverRequest({ kind: "moment", momentId: MOM_ID, consent: true,
                                consentVersion: CONSENT_VERSION });
  assert.ok(r.ok); assert.strictEqual(r.momentId, MOM_ID);
});

test("동의 없는 moment 거부", () => {
  const r = parseCoverRequest({ kind: "moment", momentId: MOM_ID, consentVersion: CONSENT_VERSION });
  assert.strictEqual(r.ok, false); assert.strictEqual(r.status, 400);
});

test("consent=false 거부", () => {
  const r = parseCoverRequest({ kind: "moment", momentId: MOM_ID, consent: false,
                                consentVersion: CONSENT_VERSION });
  assert.strictEqual(r.ok, false);
});

test("잘못된 consentVersion 거부", () => {
  const r = parseCoverRequest({ kind: "moment", momentId: MOM_ID, consent: true,
                                consentVersion: "trip-cover-v0" });
  assert.strictEqual(r.ok, false);
});

test("momentId 가 UUID 가 아니면 거부", () => {
  for (const bad of ["", "abc", "../../etc/passwd", "a".repeat(40)]) {
    const r = parseCoverRequest({ kind: "moment", momentId: bad, consent: true,
                                  consentVersion: CONSENT_VERSION });
    assert.strictEqual(r.ok, false, `허용됨: ${bad}`);
  }
});

test("URL·storage_path 주입 필드는 무시된다", () => {
  const r = parseCoverRequest({
    kind: "asset", assetId: "busan-v1-night_view-023",
    imageUrl: "https://evil.com/x.jpg", storage_path: "other/user/secret.jpg",
    storagePath: "../../", url: "http://evil",
  });
  assert.ok(r.ok);
  assert.deepStrictEqual(Object.keys(r).sort(), ["assetId", "kind", "ok", "status"]);
});

test("알 수 없는 kind·비객체 body 거부", () => {
  for (const b of [{ kind: "url" }, {}, null, "x", 3, []]) {
    assert.strictEqual(parseCoverRequest(b).ok, false, JSON.stringify(b));
  }
});

// ── 전환 patch ───────────────────────────────────────────────────────────────

test("auto 전환은 모든 커버 필드를 NULL 로 초기화", () => {
  const p = buildCoverPatch("auto", { now: NOW });
  assert.deepStrictEqual(p, { cover_kind: "auto", cover_asset_id: null, cover_moment_id: null,
    cover_consent_at: null, cover_consent_version: null, updated_at: NOW });
});

test("asset 전환은 moment·동의를 비운다", () => {
  const p = buildCoverPatch("asset", { assetId: "A1", now: NOW });
  assert.strictEqual(p.cover_asset_id, "A1");
  assert.strictEqual(p.cover_moment_id, null);
  assert.strictEqual(p.cover_consent_at, null);
  assert.strictEqual(p.cover_consent_version, null);
});

test("moment 전환은 asset 을 비우고 동의를 채운다", () => {
  const p = buildCoverPatch("moment", { momentId: MOM_ID, now: NOW });
  assert.strictEqual(p.cover_asset_id, null);
  assert.strictEqual(p.cover_moment_id, MOM_ID);
  assert.strictEqual(p.cover_consent_at, NOW);
  assert.strictEqual(p.cover_consent_version, CONSENT_VERSION);
});

test("모든 전환이 updated_at 을 갱신한다", () => {
  for (const k of ["auto", "asset", "moment"] as const) {
    assert.strictEqual(buildCoverPatch(k, { assetId: "A", momentId: MOM_ID, now: NOW }).updated_at, NOW);
  }
});

test("전환 patch 는 항상 5개 커버 필드를 모두 포함한다 (부분 갱신 금지)", () => {
  const keys = ["cover_kind","cover_asset_id","cover_moment_id","cover_consent_at","cover_consent_version"];
  for (const k of ["auto", "asset", "moment"] as const) {
    const p = buildCoverPatch(k, { assetId: "A", momentId: MOM_ID, now: NOW }) as Record<string, unknown>;
    for (const key of keys) assert.ok(key in p, `${k}: ${key} 누락`);
  }
});

test("삭제 후 reset patch 는 auto 와 동일", () => {
  assert.deepStrictEqual(buildResetPatch(NOW), buildCoverPatch("auto", { now: NOW }));
});

test("migration CHECK 3분기를 patch 가 모두 만족한다", () => {
  const ok = (p: ReturnType<typeof buildCoverPatch>) =>
    (p.cover_kind === "auto"   && !p.cover_asset_id && !p.cover_moment_id && !p.cover_consent_at && !p.cover_consent_version) ||
    (p.cover_kind === "asset"  && !!p.cover_asset_id && !p.cover_moment_id && !p.cover_consent_at && !p.cover_consent_version) ||
    (p.cover_kind === "moment" && !p.cover_asset_id && !!p.cover_consent_at && !!p.cover_consent_version);
  assert.ok(ok(buildCoverPatch("auto",   { now: NOW })));
  assert.ok(ok(buildCoverPatch("asset",  { assetId: "A", now: NOW })));
  assert.ok(ok(buildCoverPatch("moment", { momentId: MOM_ID, now: NOW })));
});

// ── 개인 커버 유효성 ─────────────────────────────────────────────────────────

test("정상 개인 커버 → valid + storagePath", () => {
  const v = verifyPersonalCover(itin(), moment());
  assert.ok(v.valid); assert.strictEqual(v.storagePath, "a/b/c.jpg");
});

test("비공개 일정은 개인 사진 차단", () => {
  const v = verifyPersonalCover(itin({ is_public: false }), moment());
  assert.strictEqual(reasonOf(v), "not_public");
});

test("cover_kind 가 auto·asset 이면 개인 사진 아님", () => {
  for (const k of ["auto", "asset"]) {
    assert.strictEqual(verifyPersonalCover(itin({ cover_kind: k }), moment()).valid, false);
  }
});

test("사진 삭제 직후(moment_id=NULL) → 무효 → 관광 fallback", () => {
  const v = verifyPersonalCover(itin({ cover_moment_id: null }), null);
  assert.strictEqual(reasonOf(v), "no_moment_id");
});

test("동의 누락·버전 불일치 차단", () => {
  assert.strictEqual(reasonOf(verifyPersonalCover(itin({ cover_consent_at: null }), moment())), "no_consent");
  assert.strictEqual(reasonOf(verifyPersonalCover(itin({ cover_consent_version: "old" }), moment())), "bad_consent_version");
});

test("다른 일정의 moment 차단", () => {
  const v = verifyPersonalCover(itin(), moment({ itinerary_id: "99999999-9999-4999-8999-999999999999" }));
  assert.strictEqual(reasonOf(v), "itinerary_mismatch");
});

test("다른 기기의 moment 차단", () => {
  const v = verifyPersonalCover(itin(), moment({ device_id: "88888888-8888-4888-8888-888888888888" }));
  assert.strictEqual(reasonOf(v), "device_mismatch");
});

test("moment 행이 없거나 ID 가 다르면 차단", () => {
  assert.strictEqual(reasonOf(verifyPersonalCover(itin(), null)), "moment_missing");
  assert.strictEqual(reasonOf(verifyPersonalCover(itin(), moment({ moment_id: "other" }))), "moment_missing");
});

test("사진 파일이 없으면 차단", () => {
  assert.strictEqual(reasonOf(verifyPersonalCover(itin(), moment({ storage_path: null }))), "no_photo");
});

test("moment 조회는 cover_kind=moment 일 때만 필요", () => {
  assert.strictEqual(needsMomentLookup(itin()), true);
  assert.strictEqual(needsMomentLookup(itin({ cover_kind: "auto" })), false);
  assert.strictEqual(needsMomentLookup(itin({ cover_kind: "asset", cover_asset_id: "A", cover_moment_id: null })), false);
  assert.strictEqual(needsMomentLookup(itin({ cover_moment_id: null })), false);
});

// ── ETag ─────────────────────────────────────────────────────────────────────

test("동일 상태 → 동일 ETag, 상태 변화 → 다른 ETag", () => {
  const a = coverETag(itin(), "a/b/c.jpg");
  assert.strictEqual(a, coverETag(itin(), "a/b/c.jpg"));
  assert.notStrictEqual(a, coverETag(itin({ is_public: false }), "a/b/c.jpg"));
  assert.notStrictEqual(a, coverETag(itin({ cover_kind: "auto" }), "a/b/c.jpg"));
  assert.notStrictEqual(a, coverETag(itin({ updated_at: "2026-07-28T00:00:00.000Z" }), "a/b/c.jpg"));
  assert.notStrictEqual(a, coverETag(itin(), "different/path.jpg"));
});

test("공개 취소가 ETag 를 반드시 무효화한다", () => {
  assert.notStrictEqual(coverETag(itin({ is_public: true }), "p.jpg"),
                        coverETag(itin({ is_public: false }), "p.jpg"));
});

test("ETag 에 storage_path 원문이 노출되지 않는다", () => {
  const e = coverETag(itin(), "moments/secret-user/private-photo.jpg");
  assert.ok(!e.includes("secret-user"));
  assert.ok(!e.includes("private-photo"));
  assert.ok(!e.includes("moments/"));
});

test("If-None-Match 매칭 (W/ 접두·다중값 포함)", () => {
  const e = coverETag(itin(), "p.jpg");
  assert.strictEqual(etagMatches(e, e), true);
  assert.strictEqual(etagMatches(`W/${e}`, e), true);
  assert.strictEqual(etagMatches(`"other", ${e}`, e), true);
  assert.strictEqual(etagMatches(`"other"`, e), false);
  assert.strictEqual(etagMatches(null, e), false);
});

// ── 캐시 버전 ────────────────────────────────────────────────────────────────

test("coverVersion 은 updated_at 사용, 누락 시 0 (Date.now 금지)", () => {
  assert.strictEqual(coverVersion(NOW), NOW);
  assert.strictEqual(coverVersion(null), "0");
  assert.strictEqual(coverVersion(undefined), "0");
  assert.strictEqual(coverVersion("   "), "0");
  // 같은 입력이면 항상 같은 결과여야 캐시가 성립한다
  assert.strictEqual(coverVersion(NOW), coverVersion(NOW));
});

// ── resolveEffectiveCover — 프록시·cover-kind API 공용 판정 ──────────────────

import { resolveEffectiveCover, type CoverAdminLike } from "./cover-state-core.ts";

/** itineraries → trip_moments 순서로 응답하는 mock. coverColsError 로 migration 미적용 재현 */
function mockAdmin(opts: {
  itin?: Record<string, unknown> | null;
  moment?: Record<string, unknown> | null;
  coverColsError?: boolean;
  itinMissing?: boolean;
} = {}): CoverAdminLike {
  const base = {
    id: ITIN_ID, device_id: DEV_ID, is_public: true, updated_at: NOW, days: [],
  };
  return {
    from(table: string) {
      return {
        select(cols: string) {
          return {
            eq() {
              return {
                async maybeSingle() {
                  if (table === "trip_moments") {
                    return { data: opts.moment ?? null, error: null };
                  }
                  // migration 미적용: cover_* 를 포함한 select 만 실패
                  if (opts.coverColsError && cols.includes("cover_kind")) {
                    return { data: null, error: { code: "42703" } };
                  }
                  if (opts.itinMissing) return { data: null, error: null };
                  return {
                    data: opts.coverColsError ? base : { ...base, ...(opts.itin ?? {}) },
                    error: null,
                  };
                },
              };
            },
          };
        },
      };
    },
  };
}

test("resolve: auto → tourism", async () => {
  const r = await resolveEffectiveCover(ITIN_ID, mockAdmin({ itin: { cover_kind: "auto" } }));
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.status === 200 && r.kind, "tourism");
});

test("resolve: asset → tourism", async () => {
  const r = await resolveEffectiveCover(ITIN_ID,
    mockAdmin({ itin: { cover_kind: "asset", cover_asset_id: "busan-v1-night_view-023" } }));
  assert.strictEqual(r.status === 200 && r.kind, "tourism");
});

test("resolve: 유효한 moment → personal", async () => {
  const r = await resolveEffectiveCover(ITIN_ID, mockAdmin({
    itin: { cover_kind: "moment", cover_moment_id: MOM_ID,
            cover_consent_at: NOW, cover_consent_version: CONSENT_VERSION },
    moment: { moment_id: MOM_ID, itinerary_id: ITIN_ID, device_id: DEV_ID, storage_path: "a/b.jpg" },
  }));
  assert.strictEqual(r.status === 200 && r.kind, "personal");
  assert.strictEqual(r.status === 200 && r.kind === "personal" && r.storagePath, "a/b.jpg");
});

test("resolve: moment_id NULL(사진 삭제 직후) → tourism", async () => {
  const r = await resolveEffectiveCover(ITIN_ID, mockAdmin({
    itin: { cover_kind: "moment", cover_moment_id: null,
            cover_consent_at: NOW, cover_consent_version: CONSENT_VERSION },
  }));
  assert.strictEqual(r.status === 200 && r.kind, "tourism");
});

test("resolve: 동의 누락·버전 불일치 → tourism", async () => {
  const m = { moment_id: MOM_ID, itinerary_id: ITIN_ID, device_id: DEV_ID, storage_path: "a/b.jpg" };
  for (const bad of [{ cover_consent_at: null }, { cover_consent_version: "trip-cover-v0" }]) {
    const r = await resolveEffectiveCover(ITIN_ID, mockAdmin({
      itin: { cover_kind: "moment", cover_moment_id: MOM_ID,
              cover_consent_at: NOW, cover_consent_version: CONSENT_VERSION, ...bad },
      moment: m,
    }));
    assert.strictEqual(r.status === 200 && r.kind, "tourism", JSON.stringify(bad));
  }
});

test("resolve: 관계 불일치(타 일정·타 기기·사진 없음) → tourism", async () => {
  const itinState = { cover_kind: "moment", cover_moment_id: MOM_ID,
                      cover_consent_at: NOW, cover_consent_version: CONSENT_VERSION };
  const variants = [
    { moment_id: MOM_ID, itinerary_id: "99999999-9999-4999-8999-999999999999", device_id: DEV_ID, storage_path: "a.jpg" },
    { moment_id: MOM_ID, itinerary_id: ITIN_ID, device_id: "88888888-8888-4888-8888-888888888888", storage_path: "a.jpg" },
    { moment_id: MOM_ID, itinerary_id: ITIN_ID, device_id: DEV_ID, storage_path: null },
  ];
  for (const mm of variants) {
    const r = await resolveEffectiveCover(ITIN_ID, mockAdmin({ itin: itinState, moment: mm }));
    assert.strictEqual(r.status === 200 && r.kind, "tourism");
  }
  // moment 행 자체가 없는 경우
  const gone = await resolveEffectiveCover(ITIN_ID, mockAdmin({ itin: itinState, moment: null }));
  assert.strictEqual(gone.status === 200 && gone.kind, "tourism");
});

test("resolve: 비공개 일정 → 404", async () => {
  const r = await resolveEffectiveCover(ITIN_ID, mockAdmin({ itin: { is_public: false } }));
  assert.strictEqual(r.status, 404);
});

test("resolve: 미존재 일정 → 404", async () => {
  const r = await resolveEffectiveCover(ITIN_ID, mockAdmin({ itinMissing: true }));
  assert.strictEqual(r.status, 404);
});

test("resolve: migration 미적용(cover_* 컬럼 없음) → tourism 으로 안전 fallback", async () => {
  const r = await resolveEffectiveCover(ITIN_ID, mockAdmin({ coverColsError: true }));
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.status === 200 && r.kind, "tourism");
});

test("resolve: 응답에 storage_path·device_id 원문이 담기지 않는 형태인지 (API 계약)", async () => {
  const r = await resolveEffectiveCover(ITIN_ID, mockAdmin({ itin: { cover_kind: "auto" } }));
  // cover-kind API 는 result.kind 만 직렬화한다 — 그 형태를 고정한다
  const body = JSON.stringify({ kind: r.status === 200 ? r.kind : undefined });
  assert.ok(!body.includes("storage"));
  assert.ok(!body.includes(DEV_ID));
  assert.ok(!body.includes(MOM_ID));
});

// ── 쓰기 게이트: 비공개 일정에는 개인 커버를 새로 지정할 수 없다 ──────────────

test("gate: 비공개 + moment → 409", () => {
  const b = coverWriteBlock("moment", { is_public: false });
  assert.strictEqual(b?.status, 409);
  assert.strictEqual(typeof b?.error, "string");
});

test("gate: 공개 + moment → 통과", () => {
  assert.strictEqual(coverWriteBlock("moment", { is_public: true }), null);
});

test("gate: auto 해제는 공개 여부와 무관하게 통과", () => {
  assert.strictEqual(coverWriteBlock("auto", { is_public: false }), null);
  assert.strictEqual(coverWriteBlock("auto", { is_public: true }), null);
});

test("gate: asset 은 기존 동작 유지 — 게이트가 막지 않는다", () => {
  assert.strictEqual(coverWriteBlock("asset", { is_public: false }), null);
  assert.strictEqual(coverWriteBlock("asset", { is_public: true }), null);
});

test("gate: 409 문구에 내부 정보가 담기지 않는다", () => {
  const b = coverWriteBlock("moment", { is_public: false });
  const body = JSON.stringify(b);
  for (const leak of ["storage", "device", "path", "consent", "service_role"]) {
    assert.ok(!body.toLowerCase().includes(leak), `${leak} 노출`);
  }
});

test("gate: moment 만 차단한다 (전수)", () => {
  for (const k of ["auto", "asset", "moment"] as const)
    for (const pub of [true, false]) {
      const blocked = coverWriteBlock(k, { is_public: pub }) !== null;
      assert.strictEqual(blocked, k === "moment" && !pub, `${k}/${pub}`);
    }
});
