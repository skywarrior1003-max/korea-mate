/**
 * TASK-SHARE-OG-PREVIEW-FIX-01 — OG 미리보기 전달 계약 가드
 * Run: node --experimental-strip-types --test src/lib/trip-cover/og-preview-guard.test.ts
 *
 * 1) resolveTourismCoverAsset 순수 로직 (프록시·OG 메타 공용 결정 함수)
 * 2) 소스 가드: trip-cover 프록시는 redirect 를 내보내지 않고,
 *    /shared OG 메타는 관광 커버 실측 치수를 내보낸다
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildCoverAssets,
  resolveTourismCoverAsset,
  extractThemePlaces,
  filterByTheme,
  pickFrom,
  resolveTheme,
} from "./cover-core.ts";

const manifest = JSON.parse(
  readFileSync(new URL("../../../data/trip-cover/busan-v1-assets.json", import.meta.url), "utf8"),
) as { assets: unknown[] };
const POOL = buildCoverAssets(manifest.assets);

const TRIP = "492e4b7b-2b3d-4bf5-902a-970c693be0fd";

test("R1: cover_kind=asset + manifest 존재 자산이면 그 자산을 그대로 쓴다", () => {
  const target = POOL[3];
  const r = resolveTourismCoverAsset(POOL, {
    itineraryId: TRIP, coverKind: "asset", coverAssetId: target.asset_id, days: [],
  });
  assert.equal(r?.asset_id, target.asset_id);
  assert.ok(r!.width > 0 && r!.height > 0, "manifest 실측 치수가 있어야 한다");
});

test("R2: manifest 에서 사라진 asset_id 는 auto 로 떨어진다", () => {
  const r = resolveTourismCoverAsset(POOL, {
    itineraryId: TRIP, coverKind: "asset", coverAssetId: "busan-v1-ghost-999", days: [],
  });
  assert.ok(r, "auto fallback 자산이 나와야 한다");
  assert.notEqual(r!.asset_id, "busan-v1-ghost-999");
});

test("R3: auto 는 결정적이다 — 같은 입력이면 항상 같은 자산", () => {
  const days = [{ places: [{ name: "Haeundae Beach", category: "Beach", location: "Haeundae" }] }];
  const a = resolveTourismCoverAsset(POOL, { itineraryId: TRIP, coverKind: "auto", coverAssetId: null, days });
  const b = resolveTourismCoverAsset(POOL, { itineraryId: TRIP, coverKind: "auto", coverAssetId: null, days });
  assert.ok(a);
  assert.equal(a!.asset_id, b!.asset_id);
});

test("R4: auto 결정은 기존 pickFrom(theme) 결과와 일치한다 — 규칙 변경 없음", () => {
  const days = [{ places: [{ name: "Haeundae Beach", category: "Beach", location: "Haeundae" }] }];
  const theme = resolveTheme({ places: extractThemePlaces(days) }).theme;
  const expected = pickFrom(POOL, TRIP, theme) ?? POOL[0];
  const r = resolveTourismCoverAsset(POOL, { itineraryId: TRIP, coverKind: "auto", coverAssetId: null, days });
  assert.equal(r?.asset_id, expected?.asset_id);
});

test("R5: theme pool 이 비면 전체 첫 자산, 전체가 비면 undefined", () => {
  const r = resolveTourismCoverAsset([], { itineraryId: TRIP, coverKind: "auto", coverAssetId: null, days: [] });
  assert.equal(r, undefined);
  const one = POOL.slice(0, 1);
  const themeless = resolveTourismCoverAsset(one, { itineraryId: TRIP, coverKind: "auto", coverAssetId: null, days: [] });
  assert.ok(themeless, "pool 이 있으면 항상 자산이 나온다");
});

test("R6: extractThemePlaces 는 v2({__v:2,scheduled})와 legacy 배열을 모두 읽는다", () => {
  const legacy = [{ places: [{ name: "Gukje Market", category: "Market", location: "Jung-gu" }] }];
  const v2 = { __v: 2, scheduled: legacy };
  assert.deepEqual(extractThemePlaces(legacy), extractThemePlaces(v2));
  assert.equal(extractThemePlaces(legacy)[0].name, "Gukje Market");
  assert.deepEqual(extractThemePlaces(null), []);
});

test("R7: manifest 전 자산에 실측 width/height 가 있다 (og:image 치수 원천)", () => {
  assert.ok(POOL.length > 0);
  for (const a of POOL) {
    assert.ok(Number.isFinite(a.width)  && a.width  > 0, `${a.asset_id} width`);
    assert.ok(Number.isFinite(a.height) && a.height > 0, `${a.asset_id} height`);
  }
});

// ── 소스 가드 ────────────────────────────────────────────────────────────────
const tripCoverSrc = readFileSync(
  new URL("../../../functions/img/trip-cover/[itineraryId].ts", import.meta.url), "utf8");
const sharedSrc = readFileSync(
  new URL("../../../functions/shared/[id].ts", import.meta.url), "utf8");

test("G1: trip-cover 프록시는 redirect 를 내보내지 않는다 (302·Location 금지)", () => {
  assert.ok(!/status:\s*302/.test(tripCoverSrc), "302 응답이 없어야 한다");
  assert.ok(!/Location:/.test(tripCoverSrc), "Location 헤더가 없어야 한다");
});

test("G2: trip-cover 관광 분기는 공용 코어로 bytes 를 직접 서빙한다", () => {
  assert.match(tripCoverSrc, /fetchApprovedAssetBytes/);
  assert.match(tripCoverSrc, /resolveTourismCoverAsset/);
  assert.match(tripCoverSrc, /serveTourismAsset/);
});

test("G3: /shared OG 메타는 og:image:width/height 를 내보낸다", () => {
  assert.match(sharedSrc, /og:image:width/);
  assert.match(sharedSrc, /og:image:height/);
});

test("G4: /shared 는 프록시와 같은 결정 함수·실측 치수를 쓴다", () => {
  assert.match(sharedSrc, /resolveTourismCoverAsset/);
  // select 에 커버 컬럼이 포함되어야 결정이 가능하다
  assert.match(sharedSrc, /select=city,start_date,end_date,travel_style,days,updated_at,cover_kind,cover_asset_id/);
});

test("G5: 개인 커버는 치수를 추측하지 않는다 — personal 분기 제외 가드", () => {
  assert.match(sharedSrc, /cover_kind !== "personal"/);
});
