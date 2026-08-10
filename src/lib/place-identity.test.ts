// place-identity + cart-identity-migration 단위 테스트
// 실행: node --experimental-strip-types src/lib/place-identity.test.ts
//
// 검증 핵심 두 가지
//   1. 서로 다른 소스의 같은 숫자 ID 가 서로 다른 identity 를 갖는가
//   2. planner 로 나가는 키가 city_spot 만 숫자가 되는가

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeCityKey,
  normalizeForMatch,
  citySpotSourceKey,
  localInfoSourceKey,
  eventSourceKey,
  userSpotSourceKey,
  legacySourceKey,
  parseCitySpotId,
  isCitySpotSource,
  getItemSourceKey,
  isSameSourcePlace,
  getPlannerHintKey,
} from "./place-identity.ts";
import {
  resolveSourceKeyForLegacyItem,
  migrateItems,
  runCartIdentityMigration,
  recoverIfInterrupted,
  MIGRATION_VERSION,
  type SourceCandidate,
  type StorageLike,
} from "./cart-identity-migration.ts";
import { IDENTITY_STORAGE_KEYS } from "./place-identity.ts";

// ── 1. sourceKey 생성 ────────────────────────────────────────────────────────

test("city_spot 은 도시 없이 DB PK 만 쓴다 — 전역 PK 라서", () => {
  assert.equal(citySpotSourceKey(24), "city_spot:24");
  assert.equal(citySpotSourceKey("24"), "city_spot:24");
});

test("local_info 는 도시를 포함한다 — 도시별 파일이 같은 수동 ID 를 쓸 수 있다", () => {
  assert.equal(localInfoSourceKey("Busan", 24), "local_info:busan:24");
  assert.equal(localInfoSourceKey("busan", 24), "local_info:busan:24");
});

test("event 는 events.json 원본 문자열 ID 를 쓴다 — 배열 index 금지", () => {
  assert.equal(eventSourceKey("Busan", "evt-anchor-001"), "event:busan:evt-anchor-001");
});

test("event sourceKey 는 배열 순서가 바뀌어도 동일하다", () => {
  const file = [{ id: "evt-b" }, { id: "evt-a" }];
  const reordered = [{ id: "evt-a" }, { id: "evt-b" }];
  const keyOf = (arr: { id: string }[], id: string) =>
    eventSourceKey("Busan", arr.find(e => e.id === id)!.id);
  assert.equal(keyOf(file, "evt-a"), keyOf(reordered, "evt-a"));
  assert.equal(keyOf(file, "evt-a"), "event:busan:evt-a");
});

test("user_spot 은 UUID 를 그대로 쓴다", () => {
  assert.equal(userSpotSourceKey("8f3a-1"), "user_spot:8f3a-1");
});

test("★핵심: DB 24 와 local-info 24 는 서로 다른 identity 다", () => {
  assert.notEqual(citySpotSourceKey(24), localInfoSourceKey("Busan", 24));
});

test("도시 정규화 — 대소문자·공백", () => {
  assert.equal(normalizeCityKey("Busan"), "busan");
  assert.equal(normalizeCityKey("  Jeju Island "), "jeju-island");
  assert.equal(normalizeCityKey(null), "");
});

// ── 2. legacy fingerprint ────────────────────────────────────────────────────

const LEG = { city: "Busan", name: "Some Place", address: "1 Road", category: "attraction" };

test("legacy 지문은 결정적이다 — 두 번 호출해도 같다", () => {
  assert.equal(legacySourceKey(LEG), legacySourceKey(LEG));
});

test("legacy 지문은 도시 namespace 를 포함한다", () => {
  assert.ok(legacySourceKey(LEG).startsWith("legacy:busan:"));
});

test("legacy 지문에 사용자 메모·순서·시각이 들어가지 않는다", () => {
  const withNoise = { ...LEG } as Record<string, unknown>;
  withNoise.userNote = "비밀 메모";
  withNoise.addedAt = 1750000000000;
  withNoise.sortOrder = 3;
  assert.equal(
    legacySourceKey(withNoise as typeof LEG),
    legacySourceKey(LEG),
    "메모·addedAt·sortOrder 가 지문을 바꾸면 안 된다",
  );
  assert.ok(!legacySourceKey(withNoise as typeof LEG).includes("비밀"));
});

test("서로 다른 장소는 서로 다른 legacy 지문", () => {
  assert.notEqual(legacySourceKey(LEG), legacySourceKey({ ...LEG, name: "Other Place" }));
  assert.notEqual(legacySourceKey(LEG), legacySourceKey({ ...LEG, city: "Seoul" }));
});

test("표기 차이는 같은 지문으로 흡수한다", () => {
  assert.equal(
    legacySourceKey(LEG),
    legacySourceKey({ ...LEG, name: "  SOME   place  ", address: "1  Road" }),
  );
});

// ── 3. 해석 ──────────────────────────────────────────────────────────────────

test("parseCitySpotId 는 정확 매칭만 — 부분 포함으로 자르지 않는다", () => {
  assert.equal(parseCitySpotId("city_spot:24"), "24");
  assert.equal(parseCitySpotId("legacy:busan:city_spot:24"), null);
  assert.equal(parseCitySpotId("city_spot:24x"), null);
  assert.equal(parseCitySpotId("city_spot:"), null);
  assert.equal(parseCitySpotId("local_info:busan:24"), null);
  assert.equal(parseCitySpotId("event:busan:evt-1"), null);
  assert.equal(parseCitySpotId(undefined), null);
  assert.equal(parseCitySpotId("local-24"), null);
});

test("isCitySpotSource — /place/ 링크를 낼 수 있는 소스만 true", () => {
  assert.equal(isCitySpotSource("city_spot:24"), true);
  for (const k of ["local_info:busan:24", "event:busan:evt-1", "user_spot:x", "legacy:busan:ab", "local-24"]) {
    assert.equal(isCitySpotSource(k), false, k);
  }
});

// ── 4. Cart 판정 ─────────────────────────────────────────────────────────────

const dbItem  = { id: "local-24", sourceKey: "city_spot:24" };
const liItem  = { id: "local-24", sourceKey: "local_info:busan:24" };
const oldItem = { id: "local-24" };

test("★핵심: 같은 id 라도 sourceKey 가 다르면 다른 장소다", () => {
  assert.equal(isSameSourcePlace(dbItem, liItem), false);
  assert.equal(isSameSourcePlace(dbItem, { id: "local-99", sourceKey: "city_spot:24" }), true);
});

test("sourceKey 가 없는 옛 항목은 id 로 fallback 한다", () => {
  assert.equal(getItemSourceKey(oldItem), "local-24");
  assert.equal(getItemSourceKey({ id: "x", sourceKey: "   " }), "x");
});

// ── 5. Planner hint key (B안 핵심) ───────────────────────────────────────────

test("city_spot 만 바레 숫자로 나간다 — plan.ts 의 DB 후보와 대조돼야 하므로", () => {
  assert.equal(getPlannerHintKey(dbItem), "24");
});

test("그 밖의 소스는 sourceKey 원문 — 어떤 DB 후보와도 매칭되면 안 된다", () => {
  assert.equal(getPlannerHintKey(liItem), "local_info:busan:24");
  assert.equal(getPlannerHintKey({ id: "local-3000", sourceKey: "event:busan:evt-anchor-001" }),
               "event:busan:evt-anchor-001");
  assert.equal(getPlannerHintKey({ id: "u1", sourceKey: "user_spot:8f3a" }), "user_spot:8f3a");
  assert.equal(getPlannerHintKey({ id: "local-9", sourceKey: "legacy:busan:abc" }), "legacy:busan:abc");
});

test("★핵심: 두 충돌 장소의 planner 키가 서로 다르다 — 일정에서 합쳐지지 않는다", () => {
  assert.notEqual(getPlannerHintKey(dbItem), getPlannerHintKey(liItem));
});

test("마이그레이션 전 `local-N` 을 숫자로 자동 변환하지 않는다 — 결함 C 의 원인", () => {
  assert.equal(getPlannerHintKey(oldItem), "local-24");
});

// ── 6. 마이그레이션 판정 ─────────────────────────────────────────────────────

const CANDIDATES: SourceCandidate[] = [
  { sourceKey: "city_spot:24",        name: "Yongdusan Park and Busan Tower", address: "37-55 Yongdusan-gil", city: "busan" },
  { sourceKey: "local_info:busan:24", name: "온천천 벚꽃 산책로",                address: "Oncheoncheon-ro",     city: "Busan" },
  { sourceKey: "city_spot:42",        name: "The Bay 101",                    address: "52 Dongbaek-ro",      city: "busan" },
];

test("이름+도시가 유일하면 해당 sourceKey 로 이전한다", () => {
  assert.equal(
    resolveSourceKeyForLegacyItem(
      { id: "local-24", name: "Yongdusan Park and Busan Tower", address: "37-55 Yongdusan-gil", city: "Busan" },
      CANDIDATES),
    "city_spot:24");
  assert.equal(
    resolveSourceKeyForLegacyItem(
      { id: "local-24", name: "온천천 벚꽃 산책로", address: "Oncheoncheon-ro", city: "Busan" },
      CANDIDATES),
    "local_info:busan:24");
});

test("후보가 없으면 city_spot 으로 추측하지 않고 legacy 로 남긴다", () => {
  const k = resolveSourceKeyForLegacyItem(
    { id: "local-24", name: "사라진 장소", address: "unknown", city: "Busan" }, CANDIDATES);
  assert.ok(k.startsWith("legacy:busan:"), k);
  assert.equal(parseCitySpotId(k), null);
});

test("이름이 겹치고 주소로도 못 좁히면 legacy — 잘못된 DB 귀속 금지", () => {
  const ambiguous: SourceCandidate[] = [
    { sourceKey: "city_spot:1",        name: "Same Name", address: null, city: "busan" },
    { sourceKey: "local_info:busan:1", name: "Same Name", address: null, city: "busan" },
  ];
  const k = resolveSourceKeyForLegacyItem(
    { id: "local-1", name: "Same Name", address: null, city: "Busan" }, ambiguous);
  assert.ok(k.startsWith("legacy:"), k);
});

test("이름이 겹쳐도 주소가 다르면 좁혀진다", () => {
  const two: SourceCandidate[] = [
    { sourceKey: "city_spot:1",        name: "Same Name", address: "A road", city: "busan" },
    { sourceKey: "local_info:busan:1", name: "Same Name", address: "B road", city: "busan" },
  ];
  assert.equal(
    resolveSourceKeyForLegacyItem({ id: "local-1", name: "Same Name", address: "B road", city: "Busan" }, two),
    "local_info:busan:1");
});

test("이미 sourceKey 가 있으면 건드리지 않는다 — 멱등", () => {
  assert.equal(
    resolveSourceKeyForLegacyItem(
      { id: "local-24", sourceKey: "city_spot:24", name: "무엇이든", address: null, city: "Busan" }, CANDIDATES),
    "city_spot:24");
});

// ── 7. migrateItems ──────────────────────────────────────────────────────────

type Item = { id: string; sourceKey?: string; name: string; address: string; city: string; type: string; note?: string; addedAt?: number };
const mkItem = (o: Partial<Item>): Item =>
  ({ id: "local-24", name: "Yongdusan Park and Busan Tower", address: "37-55 Yongdusan-gil",
     city: "Busan", type: "attraction", ...o }) as Item;

test("migrateItems 는 sourceKey 만 추가하고 사용자 필드를 보존한다", () => {
  const before = [mkItem({ note: "친구 추천", addedAt: 1750000000000 })];
  const after  = migrateItems(before as never, CANDIDATES) as unknown as Item[];
  assert.equal(after[0].sourceKey, "city_spot:24");
  assert.equal(after[0].id, "local-24");
  assert.equal(after[0].note, "친구 추천");
  assert.equal(after[0].addedAt, 1750000000000);
  assert.equal(after.length, before.length);
});

test("migrateItems 는 두 번 돌려도 결과가 같다 — 멱등", () => {
  const once  = migrateItems([mkItem({})] as never, CANDIDATES);
  const twice = migrateItems(once, CANDIDATES);
  assert.deepEqual(twice, once);
});

test("migrateItems 는 항목을 삭제하거나 병합하지 않는다", () => {
  const src = [
    mkItem({}),
    mkItem({ name: "온천천 벚꽃 산책로", address: "Oncheoncheon-ro" }),
  ];
  const out = migrateItems(src as never, CANDIDATES) as unknown as Item[];
  assert.equal(out.length, 2);
  assert.notEqual(out[0].sourceKey, out[1].sourceKey);
});

test("UUID 처럼 이미 고유한 id 는 그대로 sourceKey 가 된다", () => {
  const out = migrateItems(
    [mkItem({ id: "8f3a-1111-2222" })] as never, CANDIDATES) as unknown as Item[];
  assert.equal(out[0].sourceKey, "8f3a-1111-2222");
});

test("normalizeForMatch — 비교용 정규화", () => {
  assert.equal(normalizeForMatch("  The Bay 101!  "), "the bay 101");
  assert.equal(normalizeForMatch("온천천 벚꽃 산책로"), "온천천 벚꽃 산책로");
  assert.equal(normalizeForMatch(null), "");
});

// ── 8. React key / Map 충돌 (identity-sensitive 렌더) ────────────────────────
//
// 두 항목은 하위 호환 때문에 같은 `local-24` 를 유지한다. 목록 렌더 key 와
// 내부 Map 이 id 를 쓰면 React 가 둘을 같은 것으로 보고 재사용한다.

const A  = { id: "local-24", sourceKey: "city_spot:24",        name: "Yongdusan Park and Busan Tower" };
const Bb = { id: "local-24", sourceKey: "local_info:busan:24", name: "Oncheonjeon Cherry Walk" };

test("렌더 key: 같은 id 라도 서로 다른 key 를 만든다", () => {
  assert.notEqual(getItemSourceKey(A), getItemSourceKey(Bb));
  assert.equal(new Set([A, Bb].map(getItemSourceKey)).size, 2);
});

test("Map/Object: 한 항목이 다른 항목을 덮어쓰지 않는다", () => {
  const byKey = Object.fromEntries([A, Bb].map(x => [getItemSourceKey(x), x]));
  assert.equal(Object.keys(byKey).length, 2);
  assert.equal(byKey["city_spot:24"].name, A.name);
  assert.equal(byKey["local_info:busan:24"].name, Bb.name);
  // id 로 만들면 하나가 사라진다 — 회귀 방지용 대조
  assert.equal(Object.keys(Object.fromEntries([A, Bb].map(x => [x.id, x]))).length, 1);
});

test("삭제: 한쪽을 지워도 다른 쪽이 남는다", () => {
  const list = [A, Bb];
  assert.deepEqual(list.filter(x => getItemSourceKey(x) !== "city_spot:24").map(x => x.name), [Bb.name]);
  assert.deepEqual(list.filter(x => getItemSourceKey(x) !== "local_info:busan:24").map(x => x.name), [A.name]);
});

test("정렬 순서를 바꿔도 각 항목의 key 가 유지된다", () => {
  const before = [A, Bb].map(getItemSourceKey);
  const after  = [Bb, A].map(getItemSourceKey).reverse();
  assert.deepEqual(before, after);
});

test("lookup: sourceKey 로 찾으면 올바른 항목이 선택된다", () => {
  const list = [A, Bb];
  assert.equal(list.find(x => getItemSourceKey(x) === "local_info:busan:24")?.name, Bb.name);
});

test("key 는 절대 빈 문자열이 아니다", () => {
  for (const it of [A, Bb, { id: "local-9" }, { id: "", sourceKey: "city_spot:1" },
                    { id: "", sourceKey: "", name: "X", city: "Busan", address: "a", type: "attraction" }]) {
    const k = getItemSourceKey(it);
    assert.ok(typeof k === "string" && k.length > 0, JSON.stringify(it));
  }
});

test("id·sourceKey 둘 다 없으면 내용 기반 결정적 지문 — index 미사용", () => {
  const bad = { id: "", sourceKey: "", name: "X", city: "Busan", address: "a", type: "attraction" };
  const k1 = getItemSourceKey(bad);
  const k2 = getItemSourceKey({ ...bad });
  assert.equal(k1, k2);
  assert.ok(k1.startsWith("legacy:busan:"), k1);
});

// ── 9. Migration — 주입 storage 로 정상·멱등·실패 복구 ──────────────────────

function fakeStorage(seed: Record<string, string> = {}) {
  const m = new Map(Object.entries(seed));
  let failOn: ((key: string) => boolean) | null = null;
  return {
    store: {
      getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
      setItem: (k: string, v: string) => {
        if (failOn?.(k)) throw new Error("injected failure at " + k);
        m.set(k, v);
      },
      removeItem: (k: string) => { m.delete(k); },
    } satisfies StorageLike,
    snapshot: () => Object.fromEntries(m),
    has: (k: string) => m.has(k),
    failAt: (fn: (key: string) => boolean) => { failOn = fn; },
    /** 해당 키의 첫 쓰기만 실패시킨다 — 일시적 오류(복구 성공) 재현 */
    failOnce: (key: string) => { let done = false;
      failOn = k => { if (k === key && !done) { done = true; return true; } return false; }; },
    clearFail: () => { failOn = null; },
  };
}

const CART_ITEMS = [
  { ...mkItem({ id: "local-24", name: "Yongdusan Park and Busan Tower" }), userNote: "친구 추천", addedAt: 1750000000001, sortOrder: 0 },
  { ...mkItem({ id: "local-24", name: "온천천 벚꽃 산책로", address: "Oncheoncheon-ro" }), userNote: "봄에 가기", addedAt: 1750000000002, sortOrder: 1 },
];
const SEED = () => ({
  [IDENTITY_STORAGE_KEYS.cart]:       JSON.stringify(CART_ITEMS),
  [IDENTITY_STORAGE_KEYS.savedData]:  JSON.stringify([CART_ITEMS[0]]),
  [IDENTITY_STORAGE_KEYS.legacyFavs]: JSON.stringify(["local-24"]),
});

test("migration 정상: 항목 수·사용자 필드 보존, sourceKey 만 추가", () => {
  const fs = fakeStorage(SEED());
  const r = runCartIdentityMigration(CANDIDATES, fs.store);
  assert.equal(r.status, "done");
  const cart = JSON.parse(fs.snapshot()[IDENTITY_STORAGE_KEYS.cart]);
  assert.equal(cart.length, 2);
  assert.equal(cart[0].id, "local-24");
  assert.equal(cart[1].id, "local-24");
  assert.equal(cart[0].userNote, "친구 추천");
  assert.equal(cart[1].userNote, "봄에 가기");
  assert.equal(cart[0].addedAt, 1750000000001);
  assert.equal(cart[0].sortOrder, 0);
  assert.equal(cart[1].sortOrder, 1);
  assert.equal(cart[0].sourceKey, "city_spot:24");
  assert.equal(cart[1].sourceKey, "local_info:busan:24");
  assert.equal(fs.snapshot()[IDENTITY_STORAGE_KEYS.version], MIGRATION_VERSION);
  assert.equal(fs.has(IDENTITY_STORAGE_KEYS.journal), false);
});

test("migration 정상: 기존 favorites ID 배열을 변형하지 않는다", () => {
  const fs = fakeStorage(SEED());
  runCartIdentityMigration(CANDIDATES, fs.store);
  assert.equal(fs.snapshot()[IDENTITY_STORAGE_KEYS.legacyFavs], JSON.stringify(["local-24"]));
});

test("migration 멱등: 두 번째 실행 후 storage 문자열이 같다", () => {
  const fs = fakeStorage(SEED());
  runCartIdentityMigration(CANDIDATES, fs.store);
  const first = JSON.stringify(fs.snapshot());
  const r2 = runCartIdentityMigration(CANDIDATES, fs.store);
  assert.equal(r2.status, "skipped");
  assert.equal(JSON.stringify(fs.snapshot()), first);
});

test("migration 일시적 실패: 각 쓰기 지점에서 원본이 완전히 복구된다", () => {
  const targets = [
    IDENTITY_STORAGE_KEYS.cart,
    IDENTITY_STORAGE_KEYS.savedData,
    IDENTITY_STORAGE_KEYS.favSources,
    IDENTITY_STORAGE_KEYS.version,
  ];
  for (const failKey of targets) {
    const seed = SEED();
    const fs = fakeStorage({ ...seed });
    fs.failOnce(failKey);
    const r = runCartIdentityMigration(CANDIDATES, fs.store);
    assert.equal(r.status, "failed", failKey);
    const snap = fs.snapshot();
    assert.equal(snap[IDENTITY_STORAGE_KEYS.cart], seed[IDENTITY_STORAGE_KEYS.cart], "cart 복구 실패: " + failKey);
    assert.equal(snap[IDENTITY_STORAGE_KEYS.savedData], seed[IDENTITY_STORAGE_KEYS.savedData], "saved 복구 실패: " + failKey);
    assert.equal(snap[IDENTITY_STORAGE_KEYS.legacyFavs], seed[IDENTITY_STORAGE_KEYS.legacyFavs], "favs 복구 실패: " + failKey);
    // 원래 없던 키를 만들어 두지 않는다
    assert.equal(fs.has(IDENTITY_STORAGE_KEYS.favSources), false, "favSources 잔존: " + failKey);
    assert.equal(fs.has(IDENTITY_STORAGE_KEYS.version), false, "version 잔존: " + failKey);
    assert.equal(fs.has(IDENTITY_STORAGE_KEYS.journal), false, "journal 잔존: " + failKey);
  }
});

test("migration 지속 실패: 사용자 데이터는 온전하고 journal 을 남겨 다음 시작에 위임한다", () => {
  // 용량 초과처럼 같은 키 쓰기가 계속 실패하는 경우. 복구 쓰기도 실패하므로
  // journal 을 지우면 안 된다 — 지우면 복구 근거가 사라진다.
  const seed = SEED();
  const fs = fakeStorage({ ...seed });
  fs.failAt(k => k === IDENTITY_STORAGE_KEYS.cart);
  const r = runCartIdentityMigration(CANDIDATES, fs.store);
  assert.equal(r.status, "failed");
  // 쓰기가 아예 안 됐으므로 원본이 그대로다
  assert.equal(fs.snapshot()[IDENTITY_STORAGE_KEYS.cart], seed[IDENTITY_STORAGE_KEYS.cart]);
  assert.equal(fs.has(IDENTITY_STORAGE_KEYS.journal), true);
  assert.equal(fs.has(IDENTITY_STORAGE_KEYS.version), false);

  // 장애가 계속되는 동안에는 복원 근거(journal)를 버리지 않는다
  const r2 = runCartIdentityMigration(CANDIDATES, fs.store);
  assert.equal(r2.status, "failed");
  assert.equal(fs.has(IDENTITY_STORAGE_KEYS.journal), true, "복원 실패 중에는 journal 을 유지해야 한다");
  assert.equal(fs.snapshot()[IDENTITY_STORAGE_KEYS.cart], seed[IDENTITY_STORAGE_KEYS.cart]);

  // 장애가 해소되면 다음 시작에서 원본으로 복원되고 journal 이 정리된다
  fs.clearFail();
  const r3 = runCartIdentityMigration(CANDIDATES, fs.store);
  assert.equal(r3.status, "recovered");
  assert.equal(fs.has(IDENTITY_STORAGE_KEYS.journal), false);
  assert.equal(fs.snapshot()[IDENTITY_STORAGE_KEYS.cart], seed[IDENTITY_STORAGE_KEYS.cart]);
});

test("migration 실패 후 사용자 메모·순서가 그대로다", () => {
  const seed = SEED();
  const fs = fakeStorage({ ...seed });
  fs.failOnce(IDENTITY_STORAGE_KEYS.savedData);
  runCartIdentityMigration(CANDIDATES, fs.store);
  const cart = JSON.parse(fs.snapshot()[IDENTITY_STORAGE_KEYS.cart]);
  assert.equal(cart.length, 2);
  assert.equal(cart[0].userNote, "친구 추천");
  assert.equal(cart[1].sortOrder, 1);
  assert.equal(cart[0].sourceKey, undefined);
});

test("journal 이 남아 있으면 다음 시작에서 원본을 복원한다", () => {
  const seed = SEED();
  const fs = fakeStorage({
    ...seed,
    [IDENTITY_STORAGE_KEYS.cart]: JSON.stringify([]),
    [IDENTITY_STORAGE_KEYS.journal]: JSON.stringify({
      version: MIGRATION_VERSION, inProgress: true,
      original: {
        [IDENTITY_STORAGE_KEYS.cart]: seed[IDENTITY_STORAGE_KEYS.cart],
        [IDENTITY_STORAGE_KEYS.savedData]: seed[IDENTITY_STORAGE_KEYS.savedData],
        [IDENTITY_STORAGE_KEYS.favSources]: null,
      },
    }),
  });
  const r = runCartIdentityMigration(CANDIDATES, fs.store);
  assert.equal(r.status, "recovered");
  assert.equal(fs.snapshot()[IDENTITY_STORAGE_KEYS.cart], seed[IDENTITY_STORAGE_KEYS.cart]);
  // original 이 null 이던 키는 만들지 않는다
  assert.equal(fs.has(IDENTITY_STORAGE_KEYS.favSources), false);
  assert.equal(fs.has(IDENTITY_STORAGE_KEYS.journal), false);
});

test("복구는 관련 없는 storage 를 건드리지 않는다", () => {
  const fs = fakeStorage({ ...SEED(), koreamate_device_id: "dev-1", koreamate_user_email: "x@y" });
  fs.failOnce(IDENTITY_STORAGE_KEYS.savedData);
  runCartIdentityMigration(CANDIDATES, fs.store);
  assert.equal(fs.snapshot()["koreamate_device_id"], "dev-1");
  assert.equal(fs.snapshot()["koreamate_user_email"], "x@y");
});

test("recoverIfInterrupted: journal 이 없으면 아무 일도 하지 않는다", () => {
  const fs = fakeStorage(SEED());
  assert.equal(recoverIfInterrupted(fs.store), false);
  assert.equal(fs.snapshot()[IDENTITY_STORAGE_KEYS.cart], SEED()[IDENTITY_STORAGE_KEYS.cart]);
});

// ── 10. Favorites 분리 ──────────────────────────────────────────────────────

test("favorites: 같은 id 두 장소의 하트가 sourceKey 로 분리된다", () => {
  const favKeys = ["city_spot:24"];
  assert.equal(favKeys.includes(getItemSourceKey(A)), true);
  assert.equal(favKeys.includes(getItemSourceKey(Bb)), false);
});

test("favorites: 모호한 legacy 하트는 어느 장소에도 자동 귀속되지 않는다", () => {
  const fs = fakeStorage({
    [IDENTITY_STORAGE_KEYS.cart]: JSON.stringify([]),
    [IDENTITY_STORAGE_KEYS.savedData]: JSON.stringify([]),
    [IDENTITY_STORAGE_KEYS.legacyFavs]: JSON.stringify(["local-24"]),
  });
  runCartIdentityMigration(CANDIDATES, fs.store);
  assert.deepEqual(JSON.parse(fs.snapshot()[IDENTITY_STORAGE_KEYS.favSources]), []);
  assert.equal(fs.snapshot()[IDENTITY_STORAGE_KEYS.legacyFavs], JSON.stringify(["local-24"]));
});

test("favorites: saved 에 실체가 있으면 그 sourceKey 만 기록된다", () => {
  const fs = fakeStorage(SEED());
  runCartIdentityMigration(CANDIDATES, fs.store);
  const keys = JSON.parse(fs.snapshot()[IDENTITY_STORAGE_KEYS.favSources]);
  assert.deepEqual(keys, ["city_spot:24"]);
  assert.equal(keys.includes("local_info:busan:24"), false);
});

// ── 11. 저장 JSON 직렬화·재진입·공유·복사 전파 ──────────────────────────────

test("저장 JSON: 같은 id 두 항목이 unscheduled 에서 합쳐지지 않는다", () => {
  const fs = fakeStorage(SEED());
  runCartIdentityMigration(CANDIDATES, fs.store);
  const unscheduled = JSON.parse(fs.snapshot()[IDENTITY_STORAGE_KEYS.cart]);
  const payload = { __v: 2, scheduled: [], unscheduled };
  const round = JSON.parse(JSON.stringify(payload));
  assert.equal(round.unscheduled.length, 2);
  assert.deepEqual(round.unscheduled.map((x: { sourceKey: string }) => x.sourceKey),
                   ["city_spot:24", "local_info:busan:24"]);
  assert.deepEqual(round.unscheduled.map((x: { id: string }) => x.id), ["local-24", "local-24"]);
});

test("저장 JSON: sourceKey 가 optional 이라 옛 일정도 그대로 파싱된다", () => {
  const legacy = { __v: 2, scheduled: [{ date: "2026-10-10", dayNumber: 1,
    places: [{ name: "X", category: "attraction", location: "L", time: "10:00",
               duration: "60m", tips: "t", googleMapsUrl: "u", place_id: "24", source: "city_spot" }] }],
    unscheduled: [{ id: "local-9", name: "Old" }] };
  const round = JSON.parse(JSON.stringify(legacy));
  assert.equal(round.scheduled[0].places[0].sourceKey, undefined);
  assert.equal(round.scheduled[0].places[0].place_id, "24");
  assert.equal(getItemSourceKey(round.unscheduled[0]), "local-9");
});

test("재진입·공유·복사: 직렬화를 반복해도 두 항목이 독립적이다", () => {
  const fs = fakeStorage(SEED());
  runCartIdentityMigration(CANDIDATES, fs.store);
  let payload = { __v: 2, scheduled: [], unscheduled: JSON.parse(fs.snapshot()[IDENTITY_STORAGE_KEYS.cart]) };
  for (let i = 0; i < 3; i++) payload = JSON.parse(JSON.stringify(payload));
  const keys = payload.unscheduled.map((x: { sourceKey: string }) => x.sourceKey);
  assert.equal(new Set(keys).size, 2);
  assert.equal(payload.unscheduled[0].userNote, "친구 추천");
  assert.equal(payload.unscheduled[1].userNote, "봄에 가기");
});

test("scheduled place 는 city_spot 만 /place/ 링크를 갖는다", () => {
  assert.equal(parseCitySpotId("city_spot:24"), "24");
  assert.equal(parseCitySpotId("local_info:busan:24"), null);
});

// ── 12. local-info unscheduled 보존 ─────────────────────────────────────────

test("좌표 없는 local_info 항목은 planner hint 에서 빠져도 Cart 에 남는다", () => {
  const noCoord = { ...Bb, lat: undefined, lng: undefined };
  const hintEligible = [A, noCoord].filter(x => (x as { lat?: number }).lat != null);
  assert.equal(hintEligible.length, 0);
  assert.equal([A, noCoord].length, 2);
  assert.equal(getItemSourceKey(noCoord), "local_info:busan:24");
  assert.notEqual(getItemSourceKey(noCoord), getItemSourceKey(A));
});

// ── 10. V1 오염 identity 복구 (migration v2) ────────────────────────────────
//
// V1 Home 은 local-info 파일 ID 를 city_spot 키로 선언했다. 파일 6 번은
// Haeundae Beach 인데 canonical 6 번은 Jangsan Mountain Trail 이라, 저장해 두면
// 상세에서 다른 산이 열렸다. 여기서 확인하는 것은 "되돌리되 멀쩡한 데이터를
// 건드리지 않는다" 하나다.

const V2_CANDIDATES: SourceCandidate[] = [
  { sourceKey: "city_spot:1", name: "Haeundae Beach",           address: "Haeundae-gu", city: "busan" },
  { sourceKey: "city_spot:3", name: "Jagalchi Fish Market",     address: "Jung-gu",     city: "busan" },
  { sourceKey: "city_spot:6", name: "Jangsan Mountain Trail",   address: "Haeundae-gu", city: "busan" },
  { sourceKey: "city_spot:9", name: "Twin Hall",                address: "A-ro",        city: "busan" },
  { sourceKey: "city_spot:10", name: "Twin Hall",               address: "B-ro",        city: "busan" },
];
// V1 local-info 지문: 파일 ID → 그 시절 장소명
const V2_LEGACY = new Map<string, string>([
  ["busan:6",  "Haeundae Beach"],
  ["busan:8",  "Jagalchi Fish Market"],
  ["busan:20", "Twin Hall"],
]);

function v2Item(over: Record<string, unknown>) {
  return { id: "local-6", name: "X", city: "Busan", address: null, type: "attraction",
           addedAt: 1750000000000, sortOrder: 0, ...over };
}
function runV2(items: unknown[], candidates = V2_CANDIDATES, legacy: Map<string, string> | undefined = V2_LEGACY) {
  const fs = fakeStorage({
    [IDENTITY_STORAGE_KEYS.cart]:      JSON.stringify(items),
    [IDENTITY_STORAGE_KEYS.savedData]: JSON.stringify(items),
  });
  const r = runCartIdentityMigration(candidates, fs.store, legacy);
  return { r, fs, cart: () => JSON.parse(fs.snapshot()[IDENTITY_STORAGE_KEYS.cart] ?? "[]") };
}

test("CASE A — 오염된 Haeundae(city_spot:6) 가 canonical city_spot:1 로 복구된다", () => {
  const { r, cart } = runV2([v2Item({ name: "Haeundae Beach", sourceKey: "city_spot:6" })]);
  assert.equal(r.status, "done");
  assert.equal(cart()[0].sourceKey, "city_spot:1");
});

test("CASE B — 정상 canonical(Jangsan + city_spot:6) 는 절대 바뀌지 않는다", () => {
  const { cart } = runV2([v2Item({ name: "Jangsan Mountain Trail", sourceKey: "city_spot:6" })]);
  assert.equal(cart()[0].sourceKey, "city_spot:6");
});

test("CASE C — canonical 행이 없는 파일 ID(8) 도 이름으로 정확히 복구된다", () => {
  const { cart } = runV2([v2Item({ id: "local-8", name: "Jagalchi Fish Market", sourceKey: "city_spot:8" })]);
  assert.equal(cart()[0].sourceKey, "city_spot:3");
});

test("CASE D — 후보가 둘이면 추측하지 않고 local_info 로 강등한다", () => {
  const { cart } = runV2([v2Item({ id: "local-20", name: "Twin Hall", sourceKey: "city_spot:20" })]);
  assert.equal(cart()[0].sourceKey, "local_info:busan:20");
  assert.equal(parseCitySpotId(cart()[0].sourceKey), null);
});

test("CASE E — 후보 목록이 비면 아무것도 쓰지 않고 version 도 남기지 않는다", () => {
  const items = [v2Item({ name: "Haeundae Beach", sourceKey: "city_spot:6" })];
  const before = JSON.stringify(items);
  const { r, fs, cart } = runV2(items, []);
  assert.equal(r.status, "skipped");
  assert.equal(JSON.stringify(cart()), before);
  assert.equal(fs.has(IDENTITY_STORAGE_KEYS.version), false);
});

test("CASE E-2 — 지문이 비면(local-info 로드 실패) 실행하지 않는다", () => {
  const items = [v2Item({ name: "Haeundae Beach", sourceKey: "city_spot:6" })];
  const { r, fs } = runV2(items, V2_CANDIDATES, new Map());
  assert.equal(r.status, "skipped");
  assert.equal(fs.has(IDENTITY_STORAGE_KEYS.version), false);
});

test("CASE F — v2 완료 후 재실행은 storage 를 바꾸지 않는다", () => {
  const items = [v2Item({ name: "Haeundae Beach", sourceKey: "city_spot:6" })];
  const fs = fakeStorage({
    [IDENTITY_STORAGE_KEYS.cart]:      JSON.stringify(items),
    [IDENTITY_STORAGE_KEYS.savedData]: JSON.stringify(items),
  });
  runCartIdentityMigration(V2_CANDIDATES, fs.store, V2_LEGACY);
  const first = JSON.stringify(fs.snapshot());
  const r2 = runCartIdentityMigration(V2_CANDIDATES, fs.store, V2_LEGACY);
  assert.equal(r2.status, "skipped");
  assert.equal(JSON.stringify(fs.snapshot()), first);
});

test("CASE G — 쓰기 실패 시 원본이 그대로 복구된다", () => {
  const items = [v2Item({ name: "Haeundae Beach", sourceKey: "city_spot:6" })];
  const seed = {
    [IDENTITY_STORAGE_KEYS.cart]:      JSON.stringify(items),
    [IDENTITY_STORAGE_KEYS.savedData]: JSON.stringify(items),
  };
  const fs = fakeStorage({ ...seed });
  fs.failAt(k => k === IDENTITY_STORAGE_KEYS.savedData);
  const r = runCartIdentityMigration(V2_CANDIDATES, fs.store, V2_LEGACY);
  assert.equal(r.status, "failed");
  assert.equal(fs.snapshot()[IDENTITY_STORAGE_KEYS.cart], seed[IDENTITY_STORAGE_KEYS.cart]);
  assert.equal(fs.has(IDENTITY_STORAGE_KEYS.version), false);
});

test("CASE H — 무관한 정상 항목은 사용자 필드까지 그대로다", () => {
  const normal = v2Item({
    id: "local-42", name: "The Bay 101", sourceKey: "city_spot:42",
    addedAt: 1750000009999, sortOrder: 7, userNote: "야경",
  });
  const { cart } = runV2([normal, v2Item({ name: "Haeundae Beach", sourceKey: "city_spot:6" })]);
  const after = cart()[0];
  assert.equal(after.sourceKey, "city_spot:42");
  assert.equal(after.addedAt, 1750000009999);
  assert.equal(after.sortOrder, 7);
  assert.equal(after.userNote, "야경");
  assert.equal(after.name, "The Bay 101");
  assert.equal(cart()[1].sourceKey, "city_spot:1");
});

test("★오염 복구 후 favorites source key 가 새 identity 로 재유도된다", () => {
  const item = v2Item({ id: "local-6", name: "Haeundae Beach", sourceKey: "city_spot:6" });
  const fs = fakeStorage({
    [IDENTITY_STORAGE_KEYS.cart]:       JSON.stringify([item]),
    [IDENTITY_STORAGE_KEYS.savedData]:  JSON.stringify([item]),
    [IDENTITY_STORAGE_KEYS.legacyFavs]: JSON.stringify(["local-6"]),
  });
  runCartIdentityMigration(V2_CANDIDATES, fs.store, V2_LEGACY);
  assert.deepEqual(
    JSON.parse(fs.snapshot()[IDENTITY_STORAGE_KEYS.favSources]),
    ["city_spot:1"],
  );
  assert.equal(fs.snapshot()[IDENTITY_STORAGE_KEYS.legacyFavs], JSON.stringify(["local-6"]));
});
