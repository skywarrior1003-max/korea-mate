// Trend 자동 큐레이션 규칙 계약 (MULTILOCALE-TREND-DB V2 §4·§9·§10·§11)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decideAutoStatus, decideQualityTransition, selectTrendForRequest, trendVersionOf,
  nextReviewDate, REVIEW_INTERVAL_DAYS, TREND_QUALITY_RULE, UI_TO_DB_LOCALE,
  type TrendEvidence, type TrendRow,
} from "./trend-curation.ts";
import { ownerHashHmac, ownerHash } from "./generation-cache.ts";

const baseEvidence: TrendEvidence = {
  recentUseConfirmed: true, independentSources: 2, originPlusSpread: true,
  meaningConfirmed: true, travelFit: true, sensitive: false, looksLikeBrandAd: false,
  regionalConflict: false, forcedUseRateOk: true, sourcesRecorded: true,
  artistOrFandomOrigin: false, lowSample: false, ambiguous: false,
};

test("§4 자동 판정 — 예외만 manual_review/blocked, 나머지는 규칙", () => {
  assert.equal(decideAutoStatus(baseEvidence), "active");
  assert.equal(decideAutoStatus({ ...baseEvidence, artistOrFandomOrigin: true }), "experimental_active");
  assert.equal(decideAutoStatus({ ...baseEvidence, lowSample: true }), "experimental_active");
  assert.equal(decideAutoStatus({ ...baseEvidence, sensitive: true }), "blocked");
  assert.equal(decideAutoStatus({ ...baseEvidence, looksLikeBrandAd: true }), "manual_review");
  assert.equal(decideAutoStatus({ ...baseEvidence, ambiguous: true }), "manual_review");
  assert.equal(decideAutoStatus({ ...baseEvidence, regionalConflict: true }), "manual_review");
  // 근거 미달은 활성화가 아니라 candidate — 숫자 맞추기 발명 금지(§6)
  assert.equal(decideAutoStatus({ ...baseEvidence, independentSources: 1, originPlusSpread: false }), "candidate");
  assert.equal(decideAutoStatus({ ...baseEvidence, recentUseConfirmed: false }), "candidate");
});

test("§4 재검증 주기 — lifecycle 별(고정 단일 만료 없음)", () => {
  assert.deepEqual(REVIEW_INTERVAL_DAYS, { artist_fandom: 14, fast_sns: 30, established: 90, colloquial: 180 });
  const from = new Date("2026-09-21T00:00:00Z");
  assert.equal(nextReviewDate("artist_fandom", from), "2026-10-05");
  assert.equal(nextReviewDate("colloquial", from), "2027-03-20");
});

const row = (over: Partial<TrendRow>): TrendRow => ({
  id: "x", phrase: "p", meaning: "m", usageExample: "u", avoidWhen: "a",
  locale: "ko-KR", region_scope: "KR", status: "active", lifecycle_type: "fast_sns",
  next_review_at: "2099-01-01", confidence_score: 0.7, risk_score: 0.2,
  brand_or_artist_related: false, pack_version: "v1", ...over,
});

test("§9 선택 — 상태·기한·위험 필터, zh는 zh-CN만, 최대 5", () => {
  const rows = [
    row({ id: "ok1" }),
    row({ id: "exp", status: "experimental_active" }),
    row({ id: "cool", status: "cooling" }),
    row({ id: "cand", status: "candidate" }),
    row({ id: "arch", status: "archived" }),
    row({ id: "due", next_review_at: "2020-01-01" }),      // 재검증 기한 경과 → 제외
    row({ id: "risky", risk_score: 0.9 }),
    row({ id: "zh1", locale: "zh-CN" }),
    row({ id: "tw1", locale: "zh-TW" }),
  ];
  const ko = selectTrendForRequest(rows, "ko", new Date("2026-09-21"));
  assert.deepEqual(ko.map(r => r.id).sort(), ["exp", "ok1"]);
  const zh = selectTrendForRequest(rows, "zh", new Date("2026-09-21"));
  assert.deepEqual(zh.map(r => r.id), ["zh1"]); // zh-TW 혼합 0(§6)
  assert.equal(UI_TO_DB_LOCALE.zh, "zh-CN");
  // 최대 5개
  const many = Array.from({ length: 9 }, (_, i) => row({ id: `m${i}`, confidence_score: 0.5 + i * 0.05 }));
  assert.equal(selectTrendForRequest(many, "ko", new Date("2026-09-21")).length, 5);
});

test("§9 pack_version — 보낸 집합이 바뀌면 캐시 키 재료가 바뀐다", () => {
  assert.equal(trendVersionOf([]), null);
  const v1 = trendVersionOf([row({ id: "a", pack_version: "r1" }), row({ id: "b", pack_version: "r1" })]);
  const v2 = trendVersionOf([row({ id: "b", pack_version: "r1" }), row({ id: "a", pack_version: "r1" })]);
  assert.equal(v1, v2); // 순서 무관 결정적
  assert.notEqual(v1, trendVersionOf([row({ id: "a", pack_version: "r2" }), row({ id: "b", pack_version: "r1" })]));
  assert.notEqual(v1, trendVersionOf([row({ id: "a", pack_version: "r1" })]));
});

test("§10 품질 전이 — 표본 미달이면 null, 선택률/재생성/대폭수정 규칙", () => {
  assert.equal(decideQualityTransition({ status: "experimental_active", shown_count: 10, selected_count: 9, heavily_edited_count: 0, regenerated_after_count: 0 }), null);
  assert.equal(decideQualityTransition({ status: "experimental_active", shown_count: 20, selected_count: 6, heavily_edited_count: 0, regenerated_after_count: 0 }), "active");
  assert.equal(decideQualityTransition({ status: "active", shown_count: 20, selected_count: 2, heavily_edited_count: 0, regenerated_after_count: 12 }), "cooling");
  assert.equal(decideQualityTransition({ status: "active", shown_count: 20, selected_count: 10, heavily_edited_count: 7, regenerated_after_count: 0 }), "cooling");
  assert.equal(TREND_QUALITY_RULE.minSample, 20);
});

test("§11 HMAC owner hash — 비밀키 기반, 키가 다르면 해시가 다르고 레거시와도 다르다", async () => {
  const a = await ownerHashHmac("bbbbbbbb-cccc-4ddd-8eee-ffff00000001", "secret-A");
  const a2 = await ownerHashHmac("bbbbbbbb-cccc-4ddd-8eee-ffff00000001", "secret-A");
  const b = await ownerHashHmac("bbbbbbbb-cccc-4ddd-8eee-ffff00000001", "secret-B");
  assert.ok(a.hmac && a.hash.length === 64);
  assert.equal(a.hash, a2.hash);
  assert.notEqual(a.hash, b.hash);
  assert.notEqual(a.hash, await ownerHash("bbbbbbbb-cccc-4ddd-8eee-ffff00000001"));
  // 비밀키 없으면 레거시 sha 로 동작하되 hmac=false 로 보고된다
  const legacy = await ownerHashHmac("bbbbbbbb-cccc-4ddd-8eee-ffff00000001", undefined);
  assert.ok(!legacy.hmac);
  assert.equal(legacy.hash, await ownerHash("bbbbbbbb-cccc-4ddd-8eee-ffff00000001"));
});

test("§6 ja — 기계적 「笑」 꼬리는 결정적으로 제거된다(실측 재현 수정)", async () => {
  const { stripJaLaughTail, groundedMoment3Guard } = await import("./writing-core.ts");
  assert.equal(stripJaLaughTail("水面が頑張りすぎ。笑"), "水面が頑張りすぎ。");
  assert.equal(stripJaLaughTail("橋が2本(笑)"), "橋が2本");
  assert.equal(stripJaLaughTail("すごいｗｗ"), "すごい");
  assert.equal(stripJaLaughTail("笑って過ごした一日"), "笑って過ごした一日"); // 본문 중간·선두는 보존
  const req = { target: "moment3", direction: "calm", locale: "ja", context: { city: "gyeongju", hasPhoto: true } };
  const g = groundedMoment3Guard(req, { witty: { title: "橋が2本 笑", memo: "水面が頑張りすぎ。笑" }, calm: { title: "t", memo: "m" } });
  assert.equal(g.witty.title, "橋が2本");
  assert.equal(g.witty.memo, "水面が頑張りすぎ。");
});
