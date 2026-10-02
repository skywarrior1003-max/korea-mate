// 뒤늦게 올라온 기록 사진의 공개 범위 · 같은 사진 재전송 · 전체 여행 글쓰기 비용 예약 경계 (2026-10-02)
// node --experimental-strip-types --test src/lib/mytrip-writing/full-trip-reserve-guard.test.ts
import "../../../scripts/ts-resolve-hook.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildFullTripPrompt, fullTripTextBytes, fullTripReserveUsdMicro, fullTripWorstUsdMicro,
  FULL_TRIP_MAX_TEXT_BYTES, FULL_TRIP_WORST_USD_MICRO, FULL_TRIP_MAX_OUTPUT_TOKENS, FULL_TRIP_IMAGE_TOKENS_MEDIUM,
  FULL_TRIP_PHOTO_LIMITS, FULL_TRIP_TOKENS_PER_TEXT_BYTE,
} from "./full-trip-core.ts";
import { worstFullTripFacts, worstFullTripImages } from "./full-trip-worst-fixture.ts";
import { consentedChildPhotos } from "../share/public-memory.ts";
import { photoContentKey } from "../trip-moments/photo-set.ts";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8").replace(/\r\n/g, "\n");

// ── 비용 예약 ────────────────────────────────────────────────────────────────
test("예약 상한 — 어떤 문자로 모든 칸을 채워도 본문 바이트가 상한 안이다(서버 자르기 기준)", () => {
  const classes = ["\u0001", "\ud800", "\"", "\\", "Ꙁ", "", "광", "a", "\u{20000}", "🦄"];
  let max = 0;
  for (const ch of classes) {
    const b = fullTripTextBytes(buildFullTripPrompt(worstFullTripFacts(ch)), worstFullTripImages());
    max = Math.max(max, b);
    assert.ok(b <= FULL_TRIP_MAX_TEXT_BYTES, `${JSON.stringify(ch)} → ${b} bytes`);
  }
  // 상한이 터무니없이 크지도 않다(실제 최악 + 10% 안)
  assert.ok(FULL_TRIP_MAX_TEXT_BYTES <= Math.ceil(max * 1.1), `${FULL_TRIP_MAX_TEXT_BYTES} vs ${max}`);
});

test("날짜·일차 번호처럼 DB 에서 길이 제한이 없는 칸도 잘린다", () => {
  const f = worstFullTripFacts("a");
  f.startDate = "2".repeat(50_000); f.endDate = "3".repeat(50_000);
  f.days[0]!.day = 1e300; f.moments[0]!.day = -5;
  const p = buildFullTripPrompt(f);
  assert.ok(!p.includes("2".repeat(11)) && !p.includes("3".repeat(11)));
  assert.ok(!p.includes("1e+300"));
});

test("예약식 — 입력 ≤ 본문 바이트×1 + 사진×560, 출력 ≤ 8,192(사고 포함), 단가 $0.30/$2.50", () => {
  assert.equal(FULL_TRIP_TOKENS_PER_TEXT_BYTE, 1);
  assert.equal(fullTripReserveUsdMicro(10_000, 3), Math.ceil((10_000 + 3 * FULL_TRIP_IMAGE_TOKENS_MEDIUM) * 0.30 + FULL_TRIP_MAX_OUTPUT_TOKENS * 2.50));
  assert.equal(FULL_TRIP_WORST_USD_MICRO, fullTripReserveUsdMicro(FULL_TRIP_MAX_TEXT_BYTES, FULL_TRIP_PHOTO_LIMITS.maxPhotos));
  assert.equal(fullTripWorstUsdMicro(), 95_000);
  // 실제 호출(10-02 Preview) 사용량은 같은 요청의 예약식 안에 든다: 광안리 사진 15장 입력 9,737·출력 1,600 토큰
  assert.ok(Math.ceil(9_737 * 0.30 + 1_600 * 2.50) < fullTripReserveUsdMicro(9_737 - 15 * 560, 15));
});

test("서버 — 요청마다 보낼 본문으로 예약하고, 상한을 넘는 요청은 사용권·예약 전에 멈춘다", () => {
  const w = read("functions", "api", "mytrip", "writing-full.ts");
  assert.match(w, /const reserveUsdMicro = fullTripReserveUsdMicro\(fullTripTextBytes\(prompt, images\), images\.length\);/);
  assert.match(w, /worstUsdMicro: reserveUsdMicro,/);
  const cap = w.indexOf("if (reserveUsdMicro > WORST_USD_MICRO)");
  assert.ok(cap > 0 && cap < w.indexOf("quotaReserve(") && cap < w.indexOf("aiOpsReserve("));
  assert.equal((w.match(/await pf\(/g) ?? []).length, 1, "모델 호출 1회");
  assert.match(w, /mediaResolution|buildFullTripProviderBody/);
  assert.match(read("src", "lib", "mytrip-writing", "full-trip-core.ts"), /mediaResolution: "MEDIA_RESOLUTION_MEDIUM"/);
});

test("예약 초과가 생기면 그날 그 기능을 더 보내지 않는다 · 표에 없는 모델은 가장 비싼 단가로 적는다", async () => {
  const g = read("functions", "_lib", "ai-ops-guard.ts");
  const block = g.indexOf("if (await hasOverrunToday(env, input.feature))");
  assert.ok(block > 0 && block < g.indexOf('rest(env, "rpc/ai_ops_reserve"'));
  const { hasOverrunToday, usdMicroFromUsage } = await import("../../../functions/_lib/ai-ops-guard.ts");
  const env = { NEXT_PUBLIC_SUPABASE_URL: "https://x", SUPABASE_SERVICE_ROLE_KEY: "k" };
  const orig = globalThis.fetch;
  try {
    let url = "";
    globalThis.fetch = (async (u: string) => { url = u; return new Response(JSON.stringify([{ reserved_usd_micro: 20_000, committed_usd_micro: 7_000 }])); }) as typeof fetch;
    assert.equal(await hasOverrunToday(env, "writing", new Date("2026-10-02T15:00:00Z")), false);
    assert.match(url, /route=eq\.writing&status=eq\.committed&created_at=gte\.2026-10-02T00%3A00%3A00\.000Z/);
    globalThis.fetch = (async () => new Response(JSON.stringify([{ reserved_usd_micro: 20_000, committed_usd_micro: 20_001 }]))) as typeof fetch;
    assert.equal(await hasOverrunToday(env, "writing"), true);
    globalThis.fetch = (async () => new Response("nope", { status: 500 })) as typeof fetch;
    assert.equal(await hasOverrunToday(env, "writing"), true, "읽지 못하면 막는다");
  } finally { globalThis.fetch = orig; }
  assert.equal(usdMicroFromUsage(1_000, 1_000, "gemini-3.5-flash-lite"), Math.ceil(1_000 * 0.30 + 1_000 * 2.50));
  assert.ok(usdMicroFromUsage(1_000, 1_000, "gemini-9-unknown") > usdMicroFromUsage(1_000, 1_000, "gemini-3.5-flash-lite"));
  assert.equal(usdMicroFromUsage(1_000, 1_000), Math.ceil(1_000 * 0.30 + 1_000 * 2.50), "모델을 안 넘기는 예전 호출부는 그대로");
});

// ── 뒤늦게 올라온 사진의 공개 범위 ────────────────────────────────────────────
test("공개 동의 뒤에 올라온 추가 사진은 공개하지 않는다(시각을 모르면 막는다)", () => {
  const kids = [
    { id: "before", created_at: "2026-10-02T05:00:00.000+00:00" },
    { id: "same",   created_at: "2026-10-02T06:00:00.000+00:00" },
    { id: "after",  created_at: "2026-10-02T06:00:00.001+00:00" },
    { id: "nil",    created_at: null },
  ];
  assert.deepEqual(consentedChildPhotos(kids, "2026-10-02T06:00:00.000Z").map(k => k.id), ["before", "same"]);
  assert.deepEqual(consentedChildPhotos(kids, null), [], "동의 기록이 없으면 추가 사진은 하나도 나가지 않는다");
});

test("공개 경로 셋(공개 Story·사진 주소·커뮤니티 대표 사진)이 모두 같은 규칙을 쓴다", () => {
  const story = read("functions", "api", "shared", "[id]", "story.ts");
  const img = read("functions", "img", "memory", "[itineraryId]", "[ref].ts");
  const reco = read("src", "lib", "community", "recommendations-server.ts");
  for (const [name, s] of [["story", story], ["img", img], ["reco", reco]] as const) {
    assert.match(s, /mergePhotoSet\(r\.storage_path, consentedChildPhotos\(childByMoment\.get\(r\.moment_id\) \?\? \[\], r\.public_consent_at\)\)/, name);
  }
});

test("첫 사진을 지운 공개 기록에 동의 뒤 사진만 남으면 첫 자리로 올리되 그 기록은 비공개로 돌린다", () => {
  const d = read("functions", "api", "trip-moments", "[momentId]", "photos", "[photoId].ts");
  assert.match(d, /\.select\("moment_id, itinerary_id, storage_path, is_public, public_consent_at"\)/);
  assert.match(d, /consentedChildPhotos\(\[promotedRow\], pub\.public_consent_at\)\.length === 0/);
  assert.match(d, /\{ storage_path: plan\.nextLegacy, \.\.\.buildPublicPatch\(false, new Date\(\)\.toISOString\(\)\) \}/);
});

test("소유자 화면 — 아직 공개되지 않은 장수를 알리고, 같은 동의 창으로 다시 확인받는다(자동 공개 없음)", () => {
  const list = read("functions", "api", "trip-moments", "index.ts");
  assert.match(list, /public_pending_photos: pending/);
  assert.match(list, /public_consent_at: _consentAt, \.\.\.rest/, "동의 시각은 내보내지 않는다");
  const tl = read("src", "components", "TripMomentTimeline.tsx");
  assert.match(tl, /data-moment-public-pending/);
  assert.match(tl, /onClick=\{\(\) => openConsent\(m\)\}/);
  for (const l of ["ko", "en", "ja", "zh"]) {
    const m = JSON.parse(read("src", "messages", `${l}.json`)).memo;
    assert.ok(m.publicPendingPhotos && m.publicPendingConfirm, l);
  }
});

// ── 같은 사진 재전송 ──────────────────────────────────────────────────────────
test("같은 기록·같은 바이트는 같은 저장 이름, 다른 기록이면 다른 이름(uuid 모양)", async () => {
  const bytes = new Uint8Array([0xff, 0xd8, 1, 2, 3, 0xff, 0xd9]);
  const a1 = await photoContentKey("m-1", bytes), a2 = await photoContentKey("m-1", bytes.slice());
  const b = await photoContentKey("m-2", bytes);
  assert.equal(a1, a2); assert.notEqual(a1, b);
  assert.match(a1, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
});

test("추가 사진 업로드 — 이미 저장된 같은 사진이면 한도 판정 전에 성공으로 답하고 새 파일·행을 만들지 않는다", () => {
  const p = read("functions", "api", "trip-moments", "[momentId]", "photos.ts");
  const post = p.slice(p.indexOf("export async function onRequestPost"));
  const dup = post.indexOf("if (dup) return json({ ...dup, duplicate: true }, 200);");
  assert.ok(dup > 0 && dup < post.indexOf("DEVICE_PHOTO_LIMIT") && dup < post.indexOf(".upload(storagePath"));
  assert.match(post, /makeStoragePath\(moment\.itinerary_id, momentId, await photoContentKey\(momentId, stripped\)\)/);
  assert.doesNotMatch(post, /crypto\.randomUUID\(\)/);
  assert.match(post, /upsert: false/);
});
