// 기존 localStorage 항목에 sourceKey 를 채워 넣는 1회성 마이그레이션.
//
// 왜 journal 이 필요한가
//   koreamate_cart · koreamate_saved_spots_data · koreamate_favorite_source_keys
//   세 키를 순서대로 쓰는 것은 트랜잭션이 아니다. 두 번째 쓰기에서 용량 초과나
//   예외가 나면 첫 번째만 바뀐 반쪽 상태가 남는다. 원본 문자열을 journal 에
//   먼저 적어 두고, 다음 실행 때 in-progress 표시가 남아 있으면 되돌린다.
//
// 무엇을 하지 않는가
//   - 항목을 삭제하거나 병합하지 않는다
//   - id · addedAt · sortOrder · 사용자 메모를 바꾸지 않는다
//   - 서버에 저장된 일정을 건드리지 않는다 (DB 변경 금지)
//   - 확신 없는 항목을 city_spot 으로 귀속시키지 않는다 — legacy: 로 남긴다
//
// 허용되는 유일한 변경은 sourceKey 추가다.

import type { CartItem, EventItem } from "@/lib/cart";
import {
  citySpotSourceKey,
  localInfoSourceKey,
  legacySourceKey,
  normalizeForMatch,
  normalizeCityKey,
  parseCitySpotId,
  IDENTITY_STORAGE_KEYS,
} from "./place-identity.ts";

const CART_KEY    = IDENTITY_STORAGE_KEYS.cart;
const JOURNAL_KEY = IDENTITY_STORAGE_KEYS.journal;
const VERSION_KEY = IDENTITY_STORAGE_KEYS.version;

/** 이 값을 올리면 다음 로드에서 한 번 더 돈다. 완료 기록이 같으면 skip. */
//
// v2 — V1 Home 이 local-info 파일 ID 를 city_spot 키로 선언하던 시절에 저장된
// 항목을 되돌린다. v1 을 이미 마친 브라우저도 정확히 한 번 더 돌아야 하므로
// 값을 올린다.
export const MIGRATION_VERSION = "2";

/**
 * V1 시절 local-info 파일의 `<도시>:<파일 id>` → 장소명.
 *
 * 오염 판정의 두 번째 증거다. 이름이 canonical 과 다르다는 것만으로는
 * 오염이라고 볼 수 없다 — 사용자가 실제로 그 canonical 장소를 저장했는데
 * 나중에 DB 쪽 이름이 바뀐 경우와 구분되지 않는다. "저장된 이름이 그 파일 ID
 * 의 V1 장소명과 같다"는 흔적이 함께 있어야 V1 출신이라고 말할 수 있다.
 */
export type LegacyNameByLocalId = ReadonlyMap<string, string>;

const legacyKey = (city: string, id: number | string) => `${normalizeCityKey(city)}:${id}`;

/** local-info 원본 배열 → 지문. ExploreCity 가 이미 받아 둔 데이터를 그대로 쓴다. */
export function buildLegacyFingerprint(raw: unknown): Map<string, string> {
  const out = new Map<string, string>();
  if (!Array.isArray(raw)) return out;
  for (const r of raw) {
    if (typeof r !== "object" || r === null) continue;
    const o = r as Record<string, unknown>;
    if (typeof o.id !== "number" || typeof o.name !== "string" || typeof o.city !== "string") continue;
    out.set(legacyKey(o.city, o.id), o.name);
  }
  return out;
}

/** 마이그레이션이 소스 판정에 쓰는 최소 정보 */
export interface SourceCandidate {
  sourceKey: string;
  name:      string;
  address:   string | null | undefined;
  city:      string;
}

/**
 * localStorage 대체 가능한 최소 인터페이스.
 *
 * 부분 실패 복구는 테스트로 증명해야 하는데, window.localStorage 를 직접 부르면
 * 예외를 주입할 방법이 없다. 구조를 바꾸는 것이 아니라 주입 지점만 연다.
 */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface Journal {
  version: string;
  inProgress: true;
  original: Record<string, string | null>;
}

const TARGET_KEYS = [
  CART_KEY,
  IDENTITY_STORAGE_KEYS.savedData,
  IDENTITY_STORAGE_KEYS.favSources,
] as const;

// ── 판정 ─────────────────────────────────────────────────────────────────────

/**
 * 항목 하나의 sourceKey 를 정한다.
 *
 * 이름+도시로 후보를 찾고, 여럿이면 주소로 좁힌다. 그래도 하나로 좁혀지지
 * 않으면 **city_spot 으로 추측하지 않고** legacy 지문을 쓴다. 잘못된 DB 장소에
 * 귀속시키는 것보다 고유한 legacy 키로 남기는 편이 안전하다.
 *
 * local-info 항목은 좌표가 아예 없으므로(실측 0/71) 좌표 비교 단계는 두지
 * 않았다. 이름·주소·도시가 실질적인 최종 수단이다.
 */
export function resolveSourceKeyForLegacyItem(
  item: { id: string; sourceKey?: string; name: string; address?: string | null; city: string; type?: string },
  candidates: readonly SourceCandidate[],
): string {
  if (typeof item.sourceKey === "string" && item.sourceKey.trim()) return item.sourceKey;

  const city = normalizeCityKey(item.city);
  const name = normalizeForMatch(item.name);

  let matches = candidates.filter(
    c => normalizeCityKey(c.city) === city && normalizeForMatch(c.name) === name,
  );

  if (matches.length > 1 && item.address) {
    const addr = normalizeForMatch(item.address);
    const narrowed = matches.filter(c => normalizeForMatch(c.address) === addr);
    if (narrowed.length === 1) matches = narrowed;
  }

  if (matches.length === 1) return matches[0].sourceKey;

  return legacySourceKey({
    city: item.city, name: item.name, address: item.address, category: item.type,
  });
}

/**
 * 이 항목이 V1 Home 이 만든 오염 identity 인가.
 *
 * 세 가지가 동시에 맞아야 한다.
 *   1. sourceKey 가 `city_spot:<n>` 이다
 *   2. 저장된 이름이 **그 n 번 파일 ID 의 V1 장소명**과 같다
 *   3. 같은 n 번 canonical 행이 없거나, 있어도 이름이 다르다
 *
 * 2 번이 핵심이다. 이름 불일치만 보면 정상 저장까지 오염으로 몰 수 있다 —
 * canonical 6 번을 실제로 저장한 사용자와 구분되지 않는다.
 */
function isV1Contaminated(
  item: { name: string; city: string; sourceKey?: string },
  candidates: readonly SourceCandidate[],
  legacy: LegacyNameByLocalId,
): number | null {
  const raw = typeof item.sourceKey === "string" ? item.sourceKey : "";
  const idStr = parseCitySpotId(raw);
  if (!idStr) return null;

  const legacyName = legacy.get(legacyKey(item.city, idStr));
  if (!legacyName) return null;                                    // V1 흔적 없음
  if (normalizeForMatch(item.name) !== normalizeForMatch(legacyName)) return null;

  const canonical = candidates.find(c => c.sourceKey === raw);
  if (canonical && normalizeForMatch(canonical.name) === normalizeForMatch(item.name)) {
    return null;                                                   // 이름이 맞다 = 정상
  }
  return Number(idStr);
}

/**
 * 오염 항목을 어디로 보낼지 정한다.
 *
 * 이름+도시로 canonical 후보가 **정확히 하나** 나올 때만 그 키로 옮긴다.
 * 0 건이거나 2 건 이상이면 추측하지 않고 local_info 로 강등한다 — 틀린 장소에
 * 붙이는 것보다 상세 링크가 없는 편이 낫다. 항목을 지우지는 않는다.
 */
function repairContaminated(
  item: { name: string; address?: string | null; city: string },
  legacyId: number,
  candidates: readonly SourceCandidate[],
): string {
  const city = normalizeCityKey(item.city);
  const name = normalizeForMatch(item.name);
  let matches = candidates.filter(
    c => c.sourceKey.startsWith("city_spot:") &&
         normalizeCityKey(c.city) === city &&
         normalizeForMatch(c.name) === name,
  );
  if (matches.length > 1 && item.address) {
    const addr = normalizeForMatch(item.address);
    const narrowed = matches.filter(c => normalizeForMatch(c.address) === addr);
    if (narrowed.length === 1) matches = narrowed;
  }
  if (matches.length === 1) return matches[0].sourceKey;
  return localInfoSourceKey(item.city, legacyId);
}

/** UUID 형태의 user_spot id 는 접두어 없이도 이미 고유하다 */
function isOpaqueId(id: string): boolean {
  return !/^local-\d+$/.test(id);
}

export function migrateItems<T extends EventItem>(
  items: readonly T[],
  candidates: readonly SourceCandidate[],
  legacy?: LegacyNameByLocalId,
): T[] {
  return items.map(item => {
    if (typeof item.sourceKey === "string" && item.sourceKey.trim()) {
      // v1 은 여기서 끝났다. sourceKey 가 있으면 내용을 보지 않았고, 그래서
      // V1 이 심어 둔 잘못된 city_spot 키가 그대로 살아남았다.
      if (!legacy) return item;
      const legacyId = isV1Contaminated(item, candidates, legacy);
      if (legacyId === null) return item;
      return { ...item, sourceKey: repairContaminated(item, legacyId, candidates) };
    }
    // `local-<n>` 이 아닌 id(사용자 장소 UUID 등)는 그 자체로 고유하므로 그대로 쓴다
    if (isOpaqueId(item.id)) return { ...item, sourceKey: item.id };
    return {
      ...item,
      sourceKey: resolveSourceKeyForLegacyItem(
        { id: item.id, name: item.name, address: item.address, city: item.city, type: item.type },
        candidates,
      ),
    };
  });
}

// ── 실행 ─────────────────────────────────────────────────────────────────────

function readRaw(store: StorageLike, key: string): string | null {
  try { return store.getItem(key); } catch { return null; }
}

/**
 * 이전 실행이 도중에 끊겼으면 journal 원본으로 되돌린다.
 *
 * 원본이 null 이었던 키는 **삭제**한다 — 빈 배열 문자열로 임의 생성하면
 * 원래 없던 storage 가 생겨 롤백 호환이 깨진다.
 */
export function recoverIfInterrupted(store: StorageLike): boolean {
  const raw = readRaw(store, JOURNAL_KEY);
  if (!raw) return false;

  let journal: Journal;
  try {
    journal = JSON.parse(raw) as Journal;
  } catch {
    // journal 자체가 깨졌으면 복원할 근거가 없다. 사용자 데이터는 건드리지
    // 않고 표시만 지운다.
    store.removeItem(JOURNAL_KEY);
    return false;
  }
  if (!journal?.inProgress || !journal.original) { store.removeItem(JOURNAL_KEY); return false; }

  // 복원 쓰기가 실패하면 journal 을 지우지 않는다 — 지우면 다음 기회에
  // 되돌릴 근거가 사라진다. journal 손상과 쓰기 실패를 구분해야 하는 이유다.
  let restored = true;
  for (const [k, v] of Object.entries(journal.original)) {
    try {
      if (v === null) store.removeItem(k);
      else store.setItem(k, v);
    } catch { restored = false; }
  }
  if (!restored) return false;

  store.removeItem(JOURNAL_KEY);
  return true;
}

export interface MigrationResult {
  status: "skipped" | "done" | "recovered" | "failed";
  cart:   number;
  saved:  number;
}

/**
 * 멱등. 이미 이 버전으로 끝났으면 아무것도 하지 않는다.
 * 중간에 실패하면 journal 로 원상 복구하고 사용자 데이터를 남긴다.
 */
export function runCartIdentityMigration(
  candidates: readonly SourceCandidate[],
  storage?: StorageLike,
  legacy?: LegacyNameByLocalId,
): MigrationResult {
  const store = storage ?? (typeof window !== "undefined" ? window.localStorage : null);
  if (!store) return { status: "skipped", cart: 0, saved: 0 };

  if (recoverIfInterrupted(store)) return { status: "recovered", cart: 0, saved: 0 };
  if (readRaw(store, VERSION_KEY) === MIGRATION_VERSION) return { status: "skipped", cart: 0, saved: 0 };
  // 후보 목록이 비면 아무것도 하지 않는다.
  //
  // Supabase 가 실패해 0 건으로 떨어진 상태에서 돌면, 멀쩡한 city_spot 항목이
  // 전부 "canonical 후보 없음"으로 보여 강등된다. version 도 적지 않아 다음
  // 정상 로드에서 다시 시도한다.
  if (candidates.length === 0) return { status: "skipped", cart: 0, saved: 0 };

  // legacy 지문을 넘겼는데 비어 있다면 local-info 로드가 실패한 것이다.
  // 그 상태로 v2 를 완료 처리하면 오염이 영영 남는다. 지문을 넘기지 않은
  // 호출은 v1 동작(빈 sourceKey 채우기)만 하므로 그대로 진행한다.
  if (legacy && legacy.size === 0) return { status: "skipped", cart: 0, saved: 0 };

  const original: Record<string, string | null> = {};
  for (const k of TARGET_KEYS) original[k] = readRaw(store, k);

  try {
    // 1. 변환은 전부 메모리에서 끝낸다
    const cart  = JSON.parse(original[CART_KEY] ?? "[]") as CartItem[];
    const saved = JSON.parse(original[IDENTITY_STORAGE_KEYS.savedData] ?? "[]") as EventItem[];
    if (!Array.isArray(cart) || !Array.isArray(saved)) throw new Error("unexpected shape");

    const nextCart  = migrateItems(cart, candidates, legacy);
    const nextSaved = migrateItems(saved, candidates, legacy);

    // 찜 sourceKey 는 saved 데이터에서만 유도한다. legacy id 만 있고 실체를
    // 못 찾은 하트는 기록하지 않는다 — 엉뚱한 장소에 하트를 붙이지 않는다.
    const legacyFavs = JSON.parse(readRaw(store, IDENTITY_STORAGE_KEYS.legacyFavs) ?? "[]") as string[];
    const favKeys = Array.isArray(legacyFavs)
      ? nextSaved.filter(s => legacyFavs.includes(s.id)).map(s => s.sourceKey!).filter(Boolean)
      : [];

    // 2. 쓰기 전에 직렬화 가능한지 확인한다
    const payload: Record<string, string> = {
      [CART_KEY]: JSON.stringify(nextCart),
      [IDENTITY_STORAGE_KEYS.savedData]: JSON.stringify(nextSaved),
      [IDENTITY_STORAGE_KEYS.favSources]: JSON.stringify([...new Set(favKeys)]),
    };

    // 3. journal 기록 후 쓰기
    store.setItem(JOURNAL_KEY, JSON.stringify({
      version: MIGRATION_VERSION, inProgress: true, original,
    } satisfies Journal));
    for (const [k, v] of Object.entries(payload)) store.setItem(k, v);

    // 4. 다시 읽어 검증 — 행 수와 사용자 필드가 보존됐는가
    const backCart = JSON.parse(readRaw(store, CART_KEY) ?? "[]") as CartItem[];
    if (backCart.length !== cart.length) throw new Error("cart row count changed");
    if (backCart.some((c, i) => c.id !== cart[i].id || c.addedAt !== cart[i].addedAt)) {
      throw new Error("cart identity/order changed");
    }

    // 5. 완료
    store.setItem(VERSION_KEY, MIGRATION_VERSION);
    store.removeItem(JOURNAL_KEY);
    return { status: "done", cart: nextCart.length, saved: nextSaved.length };
  } catch {
    // 원본 복구. 같은 세션에서 무한 재시도하지 않도록 journal 을 정리한다.
    // 복구 자체가 실패하면 journal 을 남겨 다음 시작에서 다시 시도한다.
    let restored = true;
    for (const [k, v] of Object.entries(original)) {
      try { if (v === null) store.removeItem(k); else store.setItem(k, v); }
      catch { restored = false; }
    }
    if (restored) { try { store.removeItem(JOURNAL_KEY); } catch { /* noop */ } }
    return { status: "failed", cart: 0, saved: 0 };
  }
}

/** ExploreCity 가 병합한 목록에서 후보 목록을 만든다 */
export function toSourceCandidates(
  spots: readonly { sourceKey?: string; name: string; address?: string | null; city: string; id: number }[],
): SourceCandidate[] {
  return spots.map(s => ({
    sourceKey: s.sourceKey ?? citySpotSourceKey(s.id),
    name:      s.name,
    address:   s.address,
    city:      s.city,
  }));
}
