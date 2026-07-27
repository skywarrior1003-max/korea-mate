// GoKoreaMate — Trip Cover V1B 상태 로직 (주입형 순수 코어)
//
// Pages Function 은 Supabase 클라이언트만 주입하고, 판정·전환·ETag 계산은
// 전부 여기서 한다. 저장소의 기존 *-core.ts 패턴과 동일하게 Node 에서 바로
// 단위 테스트한다. JSON import 를 하지 않으므로 Node ESM 에서 로드된다.
//
// 보안 계약:
// - trip_moments.is_public 은 읽지도 쓰지도 않는다 (커버 공개의 SSOT 가 아니다)
// - 요청으로 URL·storage_path 를 받지 않는다
// - 소유권·존재 실패는 전부 404 로 통일해 타 사용자 자원을 누출하지 않는다
// - storage_path 는 ETag 해시 입력으로만 쓰고 응답 어디에도 원문을 내보내지 않는다

export const CONSENT_VERSION = "trip-cover-v1";

export type CoverKind = "auto" | "asset" | "moment";

/** itineraries 에서 커버 판정에 필요한 최소 필드 */
export interface ItineraryCoverRow {
  id:                    string;
  device_id:             string | null;
  is_public:             boolean;
  updated_at:            string | null;
  cover_kind:            string | null;
  cover_asset_id:        string | null;
  cover_moment_id:       string | null;
  cover_consent_at:      string | null;
  cover_consent_version: string | null;
}

export interface MomentRow {
  moment_id:    string;
  itinerary_id: string;
  device_id:    string;
  storage_path: string | null;
}

// ── 커버 전환 payload 검증 ────────────────────────────────────────────────────

export type CoverPatch = {
  cover_kind:            CoverKind;
  cover_asset_id:        string | null;
  cover_moment_id:       string | null;
  cover_consent_at:      string | null;
  cover_consent_version: string | null;
  updated_at:            string;
};

export interface ParsedRequest {
  ok:     boolean;
  status: number;
  error?: string;
  kind?:  CoverKind;
  assetId?:  string;
  momentId?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 요청 body 파싱 — 허용된 필드만 읽고 나머지는 무시한다.
 * URL·storage_path 류는 애초에 읽지 않으므로 주입될 여지가 없다.
 */
export function parseCoverRequest(body: unknown): ParsedRequest {
  if (body === null || typeof body !== "object") {
    return { ok: false, status: 400, error: "Invalid body" };
  }
  const b = body as Record<string, unknown>;
  const kind = b.kind;

  if (kind === "auto") return { ok: true, status: 200, kind: "auto" };

  if (kind === "asset") {
    const assetId = typeof b.assetId === "string" ? b.assetId.trim() : "";
    if (!assetId || assetId.length > 80) {
      return { ok: false, status: 400, error: "Invalid assetId" };
    }
    return { ok: true, status: 200, kind: "asset", assetId };
  }

  if (kind === "moment") {
    const momentId = typeof b.momentId === "string" ? b.momentId.trim() : "";
    if (!UUID.test(momentId)) return { ok: false, status: 400, error: "Invalid momentId" };
    if (b.consent !== true) return { ok: false, status: 400, error: "Consent required" };
    if (b.consentVersion !== CONSENT_VERSION) {
      return { ok: false, status: 400, error: "Invalid consent version" };
    }
    return { ok: true, status: 200, kind: "moment", momentId };
  }

  return { ok: false, status: 400, error: "Invalid kind" };
}

/** 전환 시 관련 필드를 한 번에 설정·초기화한다 (부분 갱신 금지 — CHECK 위반 방지) */
export function buildCoverPatch(
  kind: CoverKind,
  opts: { assetId?: string; momentId?: string; now: string },
): CoverPatch {
  if (kind === "asset") {
    return {
      cover_kind: "asset",
      cover_asset_id: opts.assetId ?? null,
      cover_moment_id: null,
      cover_consent_at: null,
      cover_consent_version: null,
      updated_at: opts.now,
    };
  }
  if (kind === "moment") {
    return {
      cover_kind: "moment",
      cover_asset_id: null,
      cover_moment_id: opts.momentId ?? null,
      cover_consent_at: opts.now,
      cover_consent_version: CONSENT_VERSION,
      updated_at: opts.now,
    };
  }
  return {
    cover_kind: "auto",
    cover_asset_id: null,
    cover_moment_id: null,
    cover_consent_at: null,
    cover_consent_version: null,
    updated_at: opts.now,
  };
}

/** 사진 삭제 후 커버를 안전 상태로 되돌리는 patch */
export function buildResetPatch(now: string): CoverPatch {
  return buildCoverPatch("auto", { now });
}

// ── 개인 커버 유효성 ──────────────────────────────────────────────────────────

export type PersonalCoverVerdict =
  | { valid: true;  storagePath: string }
  | { valid: false; reason:
      "not_public" | "not_moment" | "no_moment_id" | "no_consent"
      | "bad_consent_version" | "moment_missing" | "itinerary_mismatch"
      | "device_mismatch" | "no_photo" };

/**
 * 개인 사진을 공개해도 되는지 매 요청 재검증한다.
 * moment 는 cover_kind='moment' 일 때만 조회하므로 null 이 올 수 있다.
 */
export function verifyPersonalCover(
  itin: ItineraryCoverRow,
  moment: MomentRow | null,
): PersonalCoverVerdict {
  if (!itin.is_public)                       return { valid: false, reason: "not_public" };
  if (itin.cover_kind !== "moment")          return { valid: false, reason: "not_moment" };
  if (!itin.cover_moment_id)                 return { valid: false, reason: "no_moment_id" };
  if (!itin.cover_consent_at)                return { valid: false, reason: "no_consent" };
  if (itin.cover_consent_version !== CONSENT_VERSION) {
    return { valid: false, reason: "bad_consent_version" };
  }
  if (!moment || moment.moment_id !== itin.cover_moment_id) {
    return { valid: false, reason: "moment_missing" };
  }
  // itineraries.id 는 uuid, trip_moments.itinerary_id 는 text → 문자열 비교
  if (String(moment.itinerary_id) !== String(itin.id)) {
    return { valid: false, reason: "itinerary_mismatch" };
  }
  // itineraries.device_id 는 uuid, trip_moments.device_id 는 text → 문자열 비교
  if (!itin.device_id || String(moment.device_id) !== String(itin.device_id)) {
    return { valid: false, reason: "device_mismatch" };
  }
  if (!moment.storage_path) return { valid: false, reason: "no_photo" };

  return { valid: true, storagePath: moment.storage_path };
}

/** cover_kind='moment' 일 때만 trip_moments 를 추가 조회한다 */
export function needsMomentLookup(itin: ItineraryCoverRow): boolean {
  return itin.cover_kind === "moment" && Boolean(itin.cover_moment_id);
}

// ── ETag ──────────────────────────────────────────────────────────────────────

function fnv1a(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h >>> 0).toString(36);
}

/**
 * 커버 상태 기반 ETag. storage_path 는 해시 입력으로만 쓰고 원문을 내보내지 않는다.
 * is_public 을 반드시 포함해야 공개 취소가 캐시를 무효화한다.
 */
export function coverETag(itin: ItineraryCoverRow, storagePath: string | null): string {
  const parts = [
    itin.id,
    String(itin.is_public),
    itin.cover_kind ?? "",
    itin.cover_asset_id ?? "",
    itin.cover_moment_id ?? "",
    itin.cover_consent_at ?? "",
    itin.cover_consent_version ?? "",
    itin.updated_at ?? "",
    storagePath ?? "",
  ].join("|");
  return `"tc1-${fnv1a(parts)}-${parts.length.toString(36)}"`;
}

export function etagMatches(ifNoneMatch: string | null, etag: string): boolean {
  if (!ifNoneMatch) return false;
  return ifNoneMatch
    .split(",")
    .map((s) => s.trim().replace(/^W\//, ""))
    .includes(etag);
}

/** OG·Shared 가 쓰는 캐시 버전. Date.now() 를 쓰면 매 요청 URL 이 바뀌어 캐시가 죽는다. */
export function coverVersion(updatedAt: string | null | undefined): string {
  return updatedAt && updatedAt.trim() ? updatedAt.trim() : "0";
}

// ── 실효 커버 판정 (프록시 · cover-kind API 공용) ─────────────────────────────
//
// "DB 에 저장된 cover_kind" 가 아니라 "실제로 표시될 커버 종류"를 돌려준다.
// 사진이 삭제되거나 동의가 무효면 DB 는 여전히 moment 라고 말하지만 화면에는
// 관광 커버가 나가므로, 두 곳이 서로 다른 답을 내지 않도록 판정을 한곳에 둔다.

/** supabase-js 에서 실제로 쓰는 체인만 추린 최소 인터페이스 (주입형 테스트용) */
export interface CoverAdminLike {
  from(table: string): {
    select(cols: string): {
      eq(col: string, val: unknown): {
        maybeSingle(): Promise<{ data: Record<string, unknown> | null; error: unknown }>;
      };
    };
  };
}

export type EffectiveCover =
  | { status: 404 }
  | { status: 200; kind: "personal"; itin: ItineraryCoverRow; storagePath: string; days: unknown }
  | { status: 200; kind: "tourism";  itin: ItineraryCoverRow; days: unknown };

const COVER_COLS =
  "id, device_id, is_public, updated_at, days, cover_kind, cover_asset_id, cover_moment_id, cover_consent_at, cover_consent_version";
const BASE_COLS = "id, device_id, is_public, updated_at, days";

export async function resolveEffectiveCover(
  itineraryId: string,
  admin: CoverAdminLike,
): Promise<EffectiveCover> {
  // migration 031 미적용 환경에서는 cover_* 컬럼이 없어 select 가 실패한다.
  // 기본 컬럼으로 재조회해 auto(=tourism) 로 취급한다.
  let row: Record<string, unknown> | null = null;
  let coverCols = true;

  const first = await admin.from("itineraries").select(COVER_COLS).eq("id", itineraryId).maybeSingle();
  if (first.error) {
    coverCols = false;
    const base = await admin.from("itineraries").select(BASE_COLS).eq("id", itineraryId).maybeSingle();
    if (base.error || !base.data) return { status: 404 };
    row = base.data;
  } else {
    row = first.data;
  }
  if (!row) return { status: 404 };

  const itin: ItineraryCoverRow = {
    id:                    String(row.id),
    device_id:             row.device_id ? String(row.device_id) : null,
    is_public:             Boolean(row.is_public),
    updated_at:            row.updated_at ? String(row.updated_at) : null,
    cover_kind:            coverCols && row.cover_kind ? String(row.cover_kind) : "auto",
    cover_asset_id:        coverCols && row.cover_asset_id ? String(row.cover_asset_id) : null,
    cover_moment_id:       coverCols && row.cover_moment_id ? String(row.cover_moment_id) : null,
    cover_consent_at:      coverCols && row.cover_consent_at ? String(row.cover_consent_at) : null,
    cover_consent_version: coverCols && row.cover_consent_version ? String(row.cover_consent_version) : null,
  };

  // 비공개 일정은 개인 사진도 관광 정보도 내보내지 않는다
  if (!itin.is_public) return { status: 404 };

  let moment: MomentRow | null = null;
  if (needsMomentLookup(itin)) {
    const m = await admin
      .from("trip_moments")
      .select("moment_id, itinerary_id, device_id, storage_path")
      .eq("moment_id", itin.cover_moment_id ?? "")
      .maybeSingle();
    if (!m.error && m.data) {
      moment = {
        moment_id:    String(m.data.moment_id),
        itinerary_id: String(m.data.itinerary_id),
        device_id:    String(m.data.device_id),
        storage_path: m.data.storage_path ? String(m.data.storage_path) : null,
      };
    }
  }

  const verdict = verifyPersonalCover(itin, moment);
  return verdict.valid
    ? { status: 200, kind: "personal", itin, storagePath: verdict.storagePath, days: row.days }
    : { status: 200, kind: "tourism",  itin, days: row.days };
}
