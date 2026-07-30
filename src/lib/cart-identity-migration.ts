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
  legacySourceKey,
  normalizeForMatch,
  normalizeCityKey,
  IDENTITY_STORAGE_KEYS,
} from "./place-identity.ts";

const CART_KEY    = IDENTITY_STORAGE_KEYS.cart;
const JOURNAL_KEY = IDENTITY_STORAGE_KEYS.journal;
const VERSION_KEY = IDENTITY_STORAGE_KEYS.version;

/** 이 값을 올리면 다음 로드에서 한 번 더 돈다. 완료 기록이 같으면 skip. */
export const MIGRATION_VERSION = "1";

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

/** UUID 형태의 user_spot id 는 접두어 없이도 이미 고유하다 */
function isOpaqueId(id: string): boolean {
  return !/^local-\d+$/.test(id);
}

export function migrateItems<T extends EventItem>(
  items: readonly T[],
  candidates: readonly SourceCandidate[],
): T[] {
  return items.map(item => {
    if (typeof item.sourceKey === "string" && item.sourceKey.trim()) return item;
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
): MigrationResult {
  const store = storage ?? (typeof window !== "undefined" ? window.localStorage : null);
  if (!store) return { status: "skipped", cart: 0, saved: 0 };

  if (recoverIfInterrupted(store)) return { status: "recovered", cart: 0, saved: 0 };
  if (readRaw(store, VERSION_KEY) === MIGRATION_VERSION) return { status: "skipped", cart: 0, saved: 0 };

  const original: Record<string, string | null> = {};
  for (const k of TARGET_KEYS) original[k] = readRaw(store, k);

  try {
    // 1. 변환은 전부 메모리에서 끝낸다
    const cart  = JSON.parse(original[CART_KEY] ?? "[]") as CartItem[];
    const saved = JSON.parse(original[IDENTITY_STORAGE_KEYS.savedData] ?? "[]") as EventItem[];
    if (!Array.isArray(cart) || !Array.isArray(saved)) throw new Error("unexpected shape");

    const nextCart  = migrateItems(cart, candidates);
    const nextSaved = migrateItems(saved, candidates);

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
