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

test("§11 HMAC owner hash — 비밀키 기반, 키가 다르면 해시가 다르고 레거시와도 다르다(V3: 폴백 없음)", async () => {
  const a = await ownerHashHmac("bbbbbbbb-cccc-4ddd-8eee-ffff00000001", "secret-A");
  const a2 = await ownerHashHmac("bbbbbbbb-cccc-4ddd-8eee-ffff00000001", "secret-A");
  const b = await ownerHashHmac("bbbbbbbb-cccc-4ddd-8eee-ffff00000001", "secret-B");
  assert.ok(a.length === 64);
  assert.equal(a, a2);
  assert.notEqual(a, b);
  assert.notEqual(a, await ownerHash("bbbbbbbb-cccc-4ddd-8eee-ffff00000001"));
  // V3 §5 — secret 없는 폴백 경로는 타입에서 제거됐다(fail-closed 는 함수 계층 검증)
});

test("V3 §3 — trend bucket: 결정적·분포·경계", async () => {
  const { trendBucket, TREND_BUCKET_EXPERIMENTAL_MAX, TREND_BUCKET_ACTIVE_MAX } = await import("./generation-cache.ts");
  const secret = "bucket-test-secret";
  // 결정적 재현성
  const one = await trendBucket(secret, { feature: "moment3", locale: "ko", contextHash: "c1", imageSha: "i1" });
  const two = await trendBucket(secret, { feature: "moment3", locale: "ko", contextHash: "c1", imageSha: "i1" });
  assert.deepEqual(one, two);
  // secret·입력 민감도
  const other = await trendBucket("other-secret", { feature: "moment3", locale: "ko", contextHash: "c1", imageSha: "i1" });
  assert.notEqual(one.bucket, undefined);
  assert.ok(one.bucket >= 0 && one.bucket <= 99);
  // 분포 — locale별 100개 입력 hash(§11: 100개 이상, locale당 ≥20)
  const tally = { experimental: 0, active: 0, none: 0 };
  const perLocale: Record<string, Record<string, number>> = {};
  for (const loc of ["ko", "en", "ja", "zh"]) {
    perLocale[loc] = { experimental: 0, active: 0, none: 0 };
    for (let i = 0; i < 100; i++) {
      const { kind } = await trendBucket(secret, { feature: "moment3", locale: loc, contextHash: `ctx-${i}`, imageSha: `img-${i % 7}` });
      tally[kind]++; perLocale[loc][kind]++;
    }
  }
  const total = 400;
  const expPct = tally.experimental / total * 100, actPct = tally.active / total * 100, nonePct = tally.none / total * 100;
  console.log(`    분포(400): experimental ${expPct}% · active ${actPct}% · none ${nonePct}% · trend 합 ${expPct + actPct}%`);
  assert.ok(Math.abs(expPct - TREND_BUCKET_EXPERIMENTAL_MAX) <= 5, `exp ${expPct}%`);
  assert.ok(Math.abs(actPct - (TREND_BUCKET_ACTIVE_MAX - TREND_BUCKET_EXPERIMENTAL_MAX)) <= 6, `act ${actPct}%`);
  assert.ok(expPct + actPct <= 25 + 6, "trend 상한 25%±오차");
  assert.ok(nonePct >= 75 - 6);
  void other;
});

test("§6 ja — 기계적 「笑」 꼬리는 결정적으로 제거된다(실측 재현 수정)", async () => {
  const { stripJaLaughTail, groundedMoment3Guard } = await import("./writing-core.ts");
  assert.equal(stripJaLaughTail("水面が頑張りすぎ。笑"), "水面が頑張りすぎ。");
  assert.equal(stripJaLaughTail("橋が2本(笑)"), "橋が2本");
  assert.equal(stripJaLaughTail("すごいｗｗ"), "すごい");
  assert.equal(stripJaLaughTail("笑って過ごした一日"), "笑って過ごした一日"); // 본문 중간·선두는 보존
  const req = { target: "moment3", direction: "calm", locale: "ja", context: { city: "gyeongju", hasPhoto: true } } as import("./writing-core.ts").WritingRequest;
  const g = groundedMoment3Guard(req, { witty: { title: "橋が2本 笑", memo: "水面が頑張りすぎ。笑" }, calm: { title: "t", memo: "m" } });
  assert.equal(g?.witty?.title, "橋が2本");
  assert.equal(g?.witty?.memo, "水面が頑張りすぎ。");
});

test("V3 §9 — warm 상투구는 그 방향만 폐기(재호출 0)", async () => {
  const { groundedMoment3Guard, STOCK_WARM_RE } = await import("./writing-core.ts");
  assert.ok(STOCK_WARM_RE.test("모든 것이 멈춘 듯 평화로운"));
  assert.ok(STOCK_WARM_RE.test("time stood still on the bridge"));
  assert.ok(STOCK_WARM_RE.test("時が止まったよう"));
  assert.ok(STOCK_WARM_RE.test("时间静止了"));
  const req = { target: "moment3", direction: "calm", locale: "ko", context: { city: "gyeongju", hasPhoto: true } } as import("./writing-core.ts").WritingRequest;
  const g = groundedMoment3Guard(req, {
    calm: { title: "t", memo: "m" },
    witty: { title: "w", memo: "wm" },
    warm: { title: "밤의 다리", memo: "모든 것이 멈춘 듯 평화로웠다." },
  });
  assert.ok(g && g.calm && g.witty && !g.warm);
  // 상투구 없는 warm 은 통과(감성 하향 아님)
  const ok = groundedMoment3Guard(req, { warm: { title: "밤의 다리", memo: "빛이 물결에 스몄다." } });
  assert.ok(ok?.warm);
});
