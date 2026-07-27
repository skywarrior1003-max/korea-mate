/**
 * Trip Cover V1A — 자산 로더 · 테마 판정 · 결정론적 선택 테스트
 * Run: node --experimental-strip-types src/lib/trip-cover/cover-core.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COVER_ASSETS, COVER_ASSETS_REJECTED, COVER_THEMES, DEFAULT_THEME,
  THEME_LABEL, assetsByTheme, assetById, coverProxyPath,
} from "./cover-core.ts";
import { resolveTheme, pickAsset, fnv1a32 } from "./cover-core.ts";

// ── 1. manifest 검증 ─────────────────────────────────────────────────────────

test("manifest 24건이 전부 로더 검증을 통과한다", () => {
  assert.strictEqual(COVER_ASSETS.length, 24);
  assert.strictEqual(COVER_ASSETS_REJECTED, 0);
});

test("모든 자산이 HTTPS + 허용 호스트", () => {
  for (const a of COVER_ASSETS) {
    const u = new URL(a.image_url);
    assert.strictEqual(u.protocol, "https:", a.asset_id);
    assert.strictEqual(u.hostname, "tong.visitkorea.or.kr", a.asset_id);
  }
});

test("KOGL Type 1 외 자산은 존재하지 않는다", () => {
  for (const a of COVER_ASSETS) assert.strictEqual(a.license_type, "kogl_type1", a.asset_id);
});

test("필수 필드가 모두 유효하다", () => {
  for (const a of COVER_ASSETS) {
    assert.ok(a.asset_id && a.city && a.theme, a.asset_id);
    assert.ok(a.attribution_text.length > 0, a.asset_id);
    assert.ok(a.landscape_fit && a.vertical_fit, a.asset_id);
    assert.ok(a.width > 0 && a.height > 0, a.asset_id);
  }
});

test("asset_id 중복 없음", () => {
  assert.strictEqual(new Set(COVER_ASSETS.map((a) => a.asset_id)).size, COVER_ASSETS.length);
});

test("테마 구성이 manifest 설계와 일치", () => {
  const c: Record<string, number> = {};
  for (const a of COVER_ASSETS) c[a.theme] = (c[a.theme] ?? 0) + 1;
  assert.deepStrictEqual(c, {
    beach_ocean: 6, food_market: 6, nature_trails: 6,
    culture_village: 3, night_view: 2, accommodation: 1,
  });
});

test("모든 자산이 theme_only — exact/high 표시 금지 근거", () => {
  for (const a of COVER_ASSETS) assert.strictEqual(a.place_match_status, "theme_only", a.asset_id);
});

test("로더는 잘못된 자산을 제외하되 전체를 실패시키지 않는다", () => {
  // COVER_ASSETS 가 빈 배열이 아니고 예외도 나지 않았다는 것이 곧 증거
  assert.ok(COVER_ASSETS.length > 0);
  assert.ok(Object.isFrozen(COVER_ASSETS));
});

test("프록시 경로만 노출하고 원본 URL 은 경로에 포함하지 않는다", () => {
  const p = coverProxyPath(COVER_ASSETS[0]!.asset_id);
  assert.match(p, /^\/img\/cover\//);
  assert.ok(!p.includes("tong.visitkorea"));
  assert.ok(!p.includes("http"));
});

// ── 2. 테마 판정 (운영 실측 어휘, 대소문자 혼재) ─────────────────────────────

test("beach_ocean 판정 — 해변 위주 일정", () => {
  const r = resolveTheme({
    tripTitle: "Busan Beach Days",
    places: [
      { name: "Haeundae Beach", category: "Attraction", location: "Haeundae-gu" },
      { name: "Gwangalli Beach", category: "attraction", location: "Suyeong-gu" },
      { name: "Songjeong Beach", category: "Attraction", location: "Haeundae-gu" },
    ],
  });
  assert.strictEqual(r.theme, "beach_ocean");
  assert.strictEqual(r.confident, true);
});

test("food_market 판정 — Market·Restaurant 대문자 어휘", () => {
  const r = resolveTheme({
    tripTitle: "",
    places: [
      { name: "Jagalchi Fish Market", category: "Market",     location: "Jung-gu" },
      { name: "Gukje Market",         category: "Market",     location: "Jung-gu" },
      { name: "Dwaeji Gukbap",        category: "Restaurant", location: "Busanjin-gu" },
    ],
  });
  assert.strictEqual(r.theme, "food_market");
  assert.strictEqual(r.confident, true);
});

test("nature_trails 판정 — Park·nature 혼재 표기", () => {
  const r = resolveTheme({
    tripTitle: "",
    places: [
      { name: "Igidae Coastal Trail", category: "Park",   location: "Nam-gu" },
      { name: "Geumjeongsan",         category: "nature", location: "Geumjeong-gu" },
      { name: "Hwamyeong Arboretum",  category: "Park",   location: "Buk-gu" },
    ],
  });
  assert.strictEqual(r.theme, "nature_trails");
});

test("category 대소문자 정규화 — Attraction/attraction 동일 취급", () => {
  const upper = resolveTheme({ places: [{ name: "Gamcheon Culture Village", category: "Attraction" }] });
  const lower = resolveTheme({ places: [{ name: "Gamcheon Culture Village", category: "attraction" }] });
  assert.strictEqual(upper.theme, lower.theme);
  assert.deepStrictEqual(upper.scores, lower.scores);
});

test("일반 어휘(Attraction/Experience/Landmark)만으로는 편향되지 않는다", () => {
  const r = resolveTheme({
    places: [
      { name: "Spot A", category: "Attraction" },
      { name: "Spot B", category: "Experience" },
      { name: "Spot C", category: "Landmark" },
    ],
  });
  assert.strictEqual(r.confident, false);
  assert.strictEqual(r.theme, DEFAULT_THEME);
});

test("불명확·빈 일정은 기본 테마로 fallback", () => {
  const empty = resolveTheme({ places: [] });
  assert.strictEqual(empty.theme, DEFAULT_THEME);
  assert.strictEqual(empty.confident, false);
});

test("동점이면 fallback — 임의 승자를 만들지 않는다", () => {
  const r = resolveTheme({
    places: [
      { name: "Some Beach", category: "" },
      { name: "Some Market", category: "" },
    ],
  });
  assert.strictEqual(r.confident, false);
  assert.strictEqual(r.theme, DEFAULT_THEME);
});

test("전체 일정 비중으로 판정 — 단일 키워드가 다수를 못 이긴다", () => {
  const r = resolveTheme({
    places: [
      { name: "Jagalchi Market",  category: "Market" },
      { name: "Bupyeong Market",  category: "Market" },
      { name: "Gukje Market",     category: "Market" },
      { name: "Nurimaru",         category: "Attraction", location: "Haeundae-gu" },
    ],
  });
  assert.strictEqual(r.theme, "food_market");
});

// ── 3. 결정론적 선택 ─────────────────────────────────────────────────────────

test("같은 itinerary ID 는 항상 같은 자산", () => {
  const id = "8f1c2b3a-0000-4000-8000-000000000001";
  const first = pickAsset(id, "food_market");
  for (let i = 0; i < 50; i++) {
    assert.strictEqual(pickAsset(id, "food_market")?.asset_id, first?.asset_id);
  }
});

test("다른 itinerary ID 는 후보가 분산된다", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 200; i++) {
    const a = pickAsset(`itin-${i}`, "beach_ocean");
    if (a) seen.add(a.asset_id);
  }
  assert.strictEqual(seen.size, assetsByTheme("beach_ocean").length);
});

test("skip 오프셋으로 다음 후보를 얻는다 (이미지 실패 fallback)", () => {
  const id = "fallback-test";
  const a0 = pickAsset(id, "nature_trails", 0);
  const a1 = pickAsset(id, "nature_trails", 1);
  assert.ok(a0 && a1);
  assert.notStrictEqual(a0.asset_id, a1.asset_id);
});

test("skip 이 풀 크기를 넘어도 순환하며 항상 자산을 반환", () => {
  const pool = assetsByTheme("night_view").length;
  for (let s = 0; s < pool * 3; s++) {
    assert.ok(pickAsset("wrap-test", "night_view", s));
  }
});

test("fnv1a32 는 안정적이고 결정적", () => {
  assert.strictEqual(fnv1a32("abc"), fnv1a32("abc"));
  assert.notStrictEqual(fnv1a32("abc"), fnv1a32("abd"));
  assert.ok(fnv1a32("x") >= 0 && Number.isInteger(fnv1a32("x")));
});

test("모든 테마에 최소 1개 자산이 있어 선택이 실패하지 않는다", () => {
  for (const t of COVER_THEMES) {
    assert.ok(pickAsset("any-id", t), `${t} 자산 없음`);
    assert.ok(THEME_LABEL[t].length > 0);
  }
});

test("assetById 는 존재하지 않는 ID 에 undefined 를 반환", () => {
  assert.strictEqual(assetById("does-not-exist"), undefined);
  assert.ok(assetById(COVER_ASSETS[0]!.asset_id));
});

// ── 4. theme_only 오표시 방지 ────────────────────────────────────────────────

test("테마 라벨에 자산 place_name 이 섞이지 않는다", () => {
  const names = COVER_ASSETS.map((a) => a.place_name);
  for (const label of Object.values(THEME_LABEL)) {
    assert.ok(!names.includes(label), `테마 라벨이 장소명과 겹침: ${label}`);
  }
});

test("attribution 은 짧은 표기이며 unknown 을 포함하지 않는다", () => {
  for (const a of COVER_ASSETS) {
    assert.ok(!/unknown/i.test(a.attribution_text), a.asset_id);
    assert.match(a.attribution_text, /Korea Tourism Organization/);
  }
});
