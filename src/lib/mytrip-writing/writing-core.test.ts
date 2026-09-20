// AI Writing 품질 계약 — 3방향·locale-native·context enrichment·generic 억제.
// (TASK-GOKOREAMATE-AI-WRITING-QUALITY-PRODUCTION-V1)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildWritingPrompt, deriveTripWritingFacts, buildProviderBody,
  DIRECTION_TEMPERATURE, WRITING_DIRECTIONS, MAX_TRIP_FACTS,
  extractSuggestion, groundedSuggestionGuard, extractRequestImage, MOMENT3_MULTIMODAL_RESPONSE_SCHEMA, MOMENT3_RESPONSE_SCHEMA, MOMENT3_MULTIMODAL_MAX_OUTPUT_TOKENS, MAX_IMAGE_BASE64_CHARS, extractMoment3Creative, extractHeroSuggestion, validateHeroRefs, buildMoment3MultimodalPrompt, VISUAL_BASIS_ALLOWED, stripWrappingQuotes, WITTY_THINKING_BUDGET, WITTY_MAX_OUTPUT_TOKENS, MAX_OUTPUT_TOKENS,
  type WritingRequest,
} from "./writing-core.ts";
import { activeTrendEntries, trendPackVersionFor } from "./trend-packs.ts";
import { computeCacheKey, normalizedContextString, resolveLimits } from "./generation-cache.ts";

const req = (over: Partial<WritingRequest> = {}): WritingRequest => ({
  target: "title", direction: "witty", locale: "ko",
  context: { city: "busan" }, ...over,
});

test("3 style 계약 — 정확히 calm/witty/warm, 각자 다른 craft 지시", () => {
  assert.deepEqual([...WRITING_DIRECTIONS], ["calm", "witty", "warm"]);
  const p = (d: "calm" | "witty" | "warm") => buildWritingPrompt(req({ direction: d }));
  assert.match(p("calm"), /restrained/i);
  assert.match(p("witty"), /observation/i);
  assert.match(p("witty"), /pasted on ANY trip/i);
  assert.match(p("warm"), /concrete scene/i);
  assert.notEqual(p("calm"), p("witty"));
});

test("locale-native — 4개 언어 각각 고유한 voice 지시가 들어간다(번역투 금지)", () => {
  const seen = new Set<string>();
  for (const loc of ["ko", "en", "ja", "zh"] as const) {
    const p = buildWritingPrompt(req({ locale: loc }));
    assert.match(p, new RegExp(`ONLY in`));
    const m = p.split("\n")[2]!; // LOCALE_VOICE 줄
    seen.add(m);
  }
  assert.equal(seen.size, 4, "locale voice 가 언어별로 달라야 한다");
  assert.match(buildWritingPrompt(req({ locale: "ja" })), /旅の記録/);
  assert.match(buildWritingPrompt(req({ locale: "ko" })), /담백한 구어체/);
});

test("generic copy suppression — Owner FAIL 계열이 금지어로 명시된다", () => {
  const p = buildWritingPrompt(req());
  for (const bad of ["웃음꽃", "행복 가득", "추억 가득", "힐링", "잊지 못할", "특별한 순간"]) {
    assert.ok(p.includes(bad), `금지어 명시 누락: ${bad}`);
  }
  assert.match(p, /unforgettable memories/);
  assert.match(p, /could NOT be pasted onto a different trip/);
});

test("title vs memo — 역할 분리 craft", () => {
  const t = buildWritingPrompt(req({ target: "title" }));
  assert.match(t, /NEVER a label like/);
  const m = buildWritingPrompt(req({ target: "memo", context: { city: "busan", placeName: "국제시장" } }));
  assert.match(m, /stay inside THIS one moment/i);
  assert.match(m, /came from X, heading to Y/);
});

test("draft 우선 — 사용자의 농담/표현을 밋밋하게 만들지 말라는 지시", () => {
  const p = buildWritingPrompt(req({ context: { city: "busan", draft: "국밥이 세 그릇째다" } }));
  assert.match(p, /keep their meaning/i);
  assert.match(p, /their jokes/i);
  assert.match(p, /never flatten/i);
  assert.ok(p.includes("국밥이 세 그릇째다"));
});

test("prev/next 기계 삽입 금지·사실 창작 금지 유지", () => {
  const p = buildWritingPrompt(req());
  assert.match(p, /Do NOT mention previous or next itinerary stops/);
  assert.match(p, /Do NOT invent facts/);
});

test("context enrichment — tripFacts 가 프롬프트 facts 로 들어간다(상한 포함)", () => {
  const facts = Array.from({ length: 20 }, (_, i) => `fact ${i}`);
  const p = buildWritingPrompt(req({ context: { city: "busan", tripFacts: facts } }));
  assert.ok(p.includes("- fact 0"));
  assert.ok(p.includes(`- fact ${MAX_TRIP_FACTS - 1}`));
  assert.ok(!p.includes(`- fact ${MAX_TRIP_FACTS}`), "상한 초과 facts 가 들어갔다");
});

test("deriveTripWritingFacts — 실제 일정에서만 센다(발명 0, 숙소 제외)", () => {
  const days = [
    { places: [
      { name: "Gukje Market", category: "attraction" },
      { name: "Grandma Soup", category: "restaurant" },
      { name: "Sunset Cafe", category: "cafe" },
      { name: "Hotel X", category: "accommodation", isAccommodation: true },
    ] },
    { places: [
      { name: "Haedong Yonggungsa", category: "attraction" },
      { name: "Noodle House", category: "restaurant" },
    ] },
  ];
  const f = deriveTripWritingFacts(days);
  assert.ok(f.some(x => x.includes("2 day(s), 5 stops")), JSON.stringify(f));
  assert.ok(f.some(x => x.includes("food/cafe stops: 3 of 5")));
  assert.ok(f.some(x => x.startsWith("places include:") && x.includes("Gukje Market")));
  const joined = f.join(" | ");
  assert.ok(!joined.includes("Hotel X"), "숙소명이 새 나갔다");
});

test("privacy — 프롬프트에 좌표/기기/경로 필드가 존재하지 않는다", () => {
  const src = readFileSync(join(process.cwd(), "src", "lib", "mytrip-writing", "writing-core.ts"), "utf8");
  for (const bad of ["lat", "lng", "device_id", "storage_path", "sourceKey"]) {
    assert.ok(!new RegExp(`\\b${bad}\\b`).test(src), `writing-core 에 ${bad}`);
  }
});

test("temperature — witty 는 재생성 다양성을 위해 더 높다", () => {
  assert.ok(DIRECTION_TEMPERATURE.witty > DIRECTION_TEMPERATURE.calm);
  const b = buildProviderBody("p", "witty") as { generationConfig: { temperature: number } };
  assert.equal(b.generationConfig.temperature, DIRECTION_TEMPERATURE.witty);
  const d = buildProviderBody("p") as { generationConfig: { temperature: number } };
  assert.equal(d.generationConfig.temperature, 0.7);
});

test("witty 생성 예산 — 1024 thinking 은 maxOutputTokens 1800 과 세트(canary 실측 계약)", () => {
  const w = buildProviderBody("p", "witty") as { generationConfig: { maxOutputTokens: number; thinkingConfig: { thinkingBudget: number } } };
  assert.equal(w.generationConfig.thinkingConfig.thinkingBudget, WITTY_THINKING_BUDGET);
  assert.equal(w.generationConfig.maxOutputTokens, WITTY_MAX_OUTPUT_TOKENS);
  assert.equal(WITTY_THINKING_BUDGET, 1024);
  assert.equal(WITTY_MAX_OUTPUT_TOKENS, 1800);
  // thinking 토큰이 maxOutputTokens 에 포함되는 모델 특성 — 출력 여유가 실제로 남아야 한다
  assert.ok(WITTY_MAX_OUTPUT_TOKENS - WITTY_THINKING_BUDGET >= 700, "witty 출력 여유 부족");
  // calm/warm/기본은 기존 그대로
  for (const d of ["calm", "warm"] as const) {
    const b = buildProviderBody("p", d) as { generationConfig: { maxOutputTokens: number; thinkingConfig: { thinkingBudget: number } } };
    assert.equal(b.generationConfig.maxOutputTokens, MAX_OUTPUT_TOKENS, d);
    assert.equal(b.generationConfig.thinkingConfig.thinkingBudget, 256, d);
  }
});

test("parser guard — malformed/truncated payload 는 raw 노출 없이 null", () => {
  // 정상 계약
  assert.equal(extractSuggestion('{"suggestion": "부산 3일, 아홉 끼"}', "title"), "부산 3일, 아홉 끼");
  // code fence 에 싸인 JSON 은 여전히 파싱된다(기존 관용 유지)
  assert.equal(extractSuggestion('```json\n{"suggestion": "ok"}\n```', "title"), "ok");
  // 절단된 JSON(canary 1024/700 조합에서 실제 재현된 형태) — raw JSON 노출 0
  assert.equal(extractSuggestion('{"suggestion": "부산 3일, 밥 먹', "title"), null);
  // suggestion 이 문자열이 아니거나 없는 JSON
  assert.equal(extractSuggestion('{"suggestion": 42}', "title"), null);
  assert.equal(extractSuggestion("{}", "title"), null);
  // JSON 이 아예 아닌 응답도 제안으로 승격하지 않는다(responseSchema 계약 위반 = 실패)
  assert.equal(extractSuggestion("plain text answer", "memo"), null);
  assert.equal(extractSuggestion("", "memo"), null);
});

test("배선 가드 — title 은 locale 해석 tripFacts, memo 는 tripTitle·aiPlaceName 을 실제로 보낸다", () => {
  const page = readFileSync(join(process.cwd(), "src", "app", "itinerary", "page.tsx"), "utf8");
  // LOCALE-FACT-GROUNDING-V1: tripFacts 장소명은 requested-locale canonical 로 해석해 보낸다
  assert.match(page, /tripFacts: deriveTripWritingFacts\(days\.map/);
  assert.match(page, /name: localizedPlaceName\(p\.name\?\.trim\(\) \|\| "", l10nOf\(p\), locale\)/);
  // 결합 순간 캡처 3경로 모두 aiPlaceName(locale 해석)을 싣는다
  assert.equal((page.match(/aiPlaceName: localizedPlaceName\(/g) ?? []).length >= 2, true, "캡처 진입점 aiPlaceName 누락");
  assert.match(page, /aiPlaceName=\{captureStop\?\.aiPlaceName \?\? null\}/);
  const cap = readFileSync(join(process.cwd(), "src", "components", "TripMomentCapture.tsx"), "utf8");
  assert.match(cap, /tripTitle: \(tripTitle \?\? ""\)\.trim\(\) \|\| null/);
  assert.match(cap, /placeName: \(isBound \? \(aiPlaceName \?\? placeName\) : placeName\) \|\| null/);
  const worker = readFileSync(join(process.cwd(), "workers", "ai-writing", "src", "index.ts"), "utf8");
  // moment3(다중카드)부터 target, MULTIMODAL V1 부터 image 인자 — 4-인자 계약
  assert.match(worker, /buildProviderBody\(prompt, direction, target, isMultimodal \? image : null\)/);
  assert.match(worker, /groundedSuggestionGuard\(body, outcome\.suggestion\)/);
  const fn = readFileSync(join(process.cwd(), "functions", "api", "mytrip", "writing.ts"), "utf8");
  assert.match(fn, /buildProviderBody\(prompt, body\.direction, body\.target, isMultimodal \? image : null\)/);
  assert.match(fn, /groundedSuggestionGuard\(body, extracted\)/);
});

test("ALLOWED FACTS 구조 — 사실 영역과 FACT RULES·고유명사 불변·음식어 계약이 프롬프트에 있다", () => {
  const p = buildWritingPrompt(req({ target: "memo", context: { city: "Busan", placeName: "海雲台", hasPhoto: false } }));
  assert.match(p, /ALLOWED FACTS \(the ONLY facts that exist/);
  assert.match(p, /FACT RULES:/);
  assert.match(p, /Missing information means UNKNOWN/);
  assert.match(p, /IMMUTABLE PROPER NOUNS/);
  assert.match(p, /Do not translate, transliterate, respell, localize/);
  assert.match(p, /NEVER coin a new translated word for a Korean dish/);
  assert.match(p, /never assert that an event actually happened/);
  assert.match(p, /FACTUAL BEATS FUNNY/);
});

test("hasPhoto 양방향 계약 — false 는 '찍지 않았다' 를 명시, true 는 내용 모름을 명시", () => {
  const no = buildWritingPrompt(req({ target: "memo", context: { city: "Busan", placeName: "x", hasPhoto: false } }));
  assert.match(no, /photo available: NO — the traveler did NOT take a photo/);
  const yes = buildWritingPrompt(req({ target: "memo", context: { city: "Busan", placeName: "x", hasPhoto: true } }));
  assert.match(yes, /photo available: YES/);
  assert.match(yes, /never describe or guess its contents/);
  // title 요청엔 photo 사실 자체가 없다(모먼트가 아니다)
  const title = buildWritingPrompt(req({ target: "title", context: { city: "Busan" } }));
  assert.ok(!title.includes("photo available: NO"));
});

test("groundedSuggestionGuard — 한글 오염/사진행동 발명만 좁게 잡는다", () => {
  const base = req({ locale: "ja", target: "memo", context: { city: "Busan", placeName: "ハルメボックク", hasPhoto: false } });
  // source 에 없는 한글 = 오염 → null
  assert.equal(groundedSuggestionGuard(base, "国밥が三杯目。"), null);
  // 정상 일본어는 통과
  assert.equal(groundedSuggestionGuard(base, "クッパが三杯目。旅なのか。"), "クッパが三杯目。旅なのか。");
  // 사용자 draft 의 한글은 허용(§9 — naive regex 로 뭉개지 않는다)
  const withDraft = req({ locale: "ja", target: "memo", context: { city: "Busan", placeName: "x", hasPhoto: false, draft: "국밥이 세 그릇째" } });
  assert.equal(groundedSuggestionGuard(withDraft, "「국밥」がもう三杯目。"), "「국밥」がもう三杯目。");
  // hasPhoto:false + 사진 행동 = null (ja/en/ko/zh 공통)
  assert.equal(groundedSuggestionGuard(base, "つい何枚も撮ってしまう。"), null);
  const koNoPhoto = req({ locale: "ko", target: "memo", context: { city: "Seoul", placeName: "북촌", hasPhoto: false } });
  assert.equal(groundedSuggestionGuard(koNoPhoto, "골목에서 사진을 찍었다."), null);
  assert.equal(groundedSuggestionGuard(koNoPhoto, "골목이 조용했다."), "골목이 조용했다.");
  // hasPhoto:true 면 사진 언급 허용
  const koPhoto = req({ locale: "ko", target: "memo", context: { city: "Seoul", placeName: "북촌", hasPhoto: true } });
  assert.equal(groundedSuggestionGuard(koPhoto, "사진 한 장 남겼다."), "사진 한 장 남겼다.");
  // draft 가 사진을 말하면 hasPhoto:false 여도 통과(사용자 사실 우선)
  const draftPhoto = req({ locale: "ko", target: "memo", context: { city: "Seoul", placeName: "북촌", hasPhoto: false, draft: "사진 40장 찍음" } });
  assert.equal(groundedSuggestionGuard(draftPhoto, "같은 골목 사진만 40장."), "같은 골목 사진만 40장.");
  // null 은 null
  assert.equal(groundedSuggestionGuard(base, null), null);
});

// ── MULTIMODAL-MOMENT-AND-CREATIVE-STORY-AI V1 계약 ─────────────────────────

test("이미지 입력 계약 — JPEG base64 만, URL·타 포맷·초과 크기는 invalid", () => {
  const ok = extractRequestImage({ mimeType: "image/jpeg", data: "/9j/4AAQSkZJRg==" });
  assert.ok(ok !== "invalid" && ok !== null && ok.data.startsWith("/9j/"));
  // JPEG magic 없는 base64 는 invalid(§I)
  assert.equal(extractRequestImage({ mimeType: "image/jpeg", data: "aGVsbG8=" }), "invalid");
  assert.equal(extractRequestImage({ mimeType: "image/png", data: "aGVsbG8=" }), "invalid");
  assert.equal(extractRequestImage({ mimeType: "image/jpeg", data: "https://evil.example/x.jpg" }), "invalid"); // URL 은 base64 형식 위반
  assert.equal(extractRequestImage({ mimeType: "image/jpeg", data: "" }), "invalid");
  assert.equal(extractRequestImage({ mimeType: "image/jpeg", data: "A".repeat(MAX_IMAGE_BASE64_CHARS + 1) }), "invalid");
  assert.equal(extractRequestImage("x"), "invalid");
});

test("멀티모달 provider body — 사진이 있으면 inlineData 선행 + 창작 스키마, 없으면 기존 그대로", () => {
  const img = { mimeType: "image/jpeg" as const, data: "aGVsbG8=" };
  const withImg = buildProviderBody("p", "calm", "moment3", img) as {
    contents: { parts: unknown[] }[]; generationConfig: { responseSchema: unknown; maxOutputTokens: number };
  };
  assert.equal(withImg.contents[0]!.parts.length, 2);
  assert.deepEqual(withImg.contents[0]!.parts[0], { inlineData: { mimeType: "image/jpeg", data: "aGVsbG8=" } });
  assert.equal(withImg.generationConfig.responseSchema, MOMENT3_MULTIMODAL_RESPONSE_SCHEMA);
  assert.equal(withImg.generationConfig.maxOutputTokens, MOMENT3_MULTIMODAL_MAX_OUTPUT_TOKENS);
  const noImg = buildProviderBody("p", "calm", "moment3", null) as {
    contents: { parts: unknown[] }[]; generationConfig: { responseSchema: unknown };
  };
  assert.equal(noImg.contents[0]!.parts.length, 1); // §G — 멀티모달 part 0
  assert.equal(noImg.generationConfig.responseSchema, MOMENT3_RESPONSE_SCHEMA);
});

test("창작 파서 — creative_kind·visual_basis whitelist 위반 방향만 폐기(부분 성공)", () => {
  const good = JSON.stringify({
    calm: { title: "밤의 월정교", memo: "물에 다리가 비쳤다." },
    witty: { title: "야간에는 1+1", memo: "물속에 하나 더 있네.", creative_kind: "visual_wordplay", visual_basis: ["reflection", "night_light"] },
    warm: { title: "밤이 머문 자리", memo: "밤이 물 위에 한 번 더 머물렀다.", creative_kind: "poetic_imagery", visual_basis: ["reflection"] },
  });
  const r = extractMoment3Creative(good);
  assert.ok(r && r.set.calm && r.set.witty && r.set.warm);
  assert.deepEqual(r!.meta.kinds, { witty: "visual_wordplay", warm: "poetic_imagery" });
  // 검증 필드는 세트에 남지 않는다(클라 계약 무변경)
  assert.deepEqual(Object.keys(r!.set.witty!).sort(), ["memo", "title"]);
  // 허용 외 kind → 그 방향만 폐기
  const badKind = JSON.parse(good); badKind.witty.creative_kind = "sarcasm";
  const r2 = extractMoment3Creative(JSON.stringify(badKind));
  assert.ok(r2 && !r2.set.witty && r2.set.calm && r2.set.warm);
  assert.deepEqual(r2!.meta.dropped, ["witty"]);
  // 허용 외 visual_basis(인물/위치 추론류) → 폐기
  const badBasis = JSON.parse(good); badBasis.warm.visual_basis = ["face_of_person"];
  const r3 = extractMoment3Creative(JSON.stringify(badBasis));
  assert.ok(r3 && !r3.set.warm);
  // visual_basis 빈 배열(사진 활용 증빙 없음) → 폐기
  const emptyBasis = JSON.parse(good); emptyBasis.witty.visual_basis = [];
  const r4 = extractMoment3Creative(JSON.stringify(emptyBasis));
  assert.ok(r4 && !r4.set.witty);
});

test("hero 창작 계약 — basis_refs 확인 + witty/warm creative_kind whitelist", () => {
  const heroReq = (dir: "calm" | "witty" | "warm"): WritingRequest => ({
    target: "storyHero", direction: dir, locale: "ko",
    context: { city: "gyeongju", dates: "2026-09-15 – 2026-09-17", hasPhoto: true, tripFacts: ["trip length: 3 day(s), 9 stops"] },
  });
  const resp = (kind: string | null, refs = ["f1", "f2"]) => JSON.stringify({
    title: "경주, 아홉 번의 멈춤", memo: "사흘 동안 아홉 번 걸음을 멈췄다.",
    basis_refs: refs, ...(kind ? { creative_kind: kind } : {}),
  });
  // witty: whitelist kind → 통과, 없거나 밖이면 폐기
  assert.ok(validateHeroRefs(heroReq("witty"), extractHeroSuggestion(resp("playful_exaggeration"))));
  assert.equal(validateHeroRefs(heroReq("witty"), extractHeroSuggestion(resp(null))), null);
  assert.equal(validateHeroRefs(heroReq("witty"), extractHeroSuggestion(resp("sarcasm"))), null);
  // warm 도 동일, calm 은 kind 없어도 통과
  assert.ok(validateHeroRefs(heroReq("warm"), extractHeroSuggestion(resp("poetic_imagery"))));
  assert.ok(validateHeroRefs(heroReq("calm"), extractHeroSuggestion(resp(null))));
  // 존재하지 않는 fact key → 폐기(확인 용도 — substring 강제는 아니다)
  assert.equal(validateHeroRefs(heroReq("calm"), extractHeroSuggestion(resp(null, ["f99"]))), null);
  // 구 계약(source_refs)은 더 이상 유효하지 않다
  assert.equal(extractHeroSuggestion(JSON.stringify({ title: "t", memo: "m", source_refs: ["f1"] })), null);
});

test("hero 프롬프트 — 자유 창작(템플릿 금지)·문체별 브리프·basis_refs 반환 지시", () => {
  const req = (dir: "calm" | "witty" | "warm"): WritingRequest => ({
    target: "storyHero", direction: dir, locale: "ko",
    context: { city: "gyeongju", hasPhoto: true, tripFacts: ["trip length: 3 day(s), 9 stops"] },
  });
  const w = buildWritingPrompt(req("witty"));
  assert.match(w, /You write the FINAL title and intro yourself/);
  assert.match(w, /COMEBACK/); // TREND V1 §H — 재치 표지는 되받기
  assert.match(w, /HARD FAILURES for this tone/); // 나열·감성 오분류 = 실패 명시
  assert.match(w, /basis_refs/);
  assert.match(w, /creative_kind/);
  assert.ok(!w.includes("WORDING ONLY")); // V3 의 사실-나열 제한 문구 제거
  const c = buildWritingPrompt(req("calm"));
  assert.match(c, /Stay factual/);
  assert.notEqual(w, c);
});

test("멀티모달 프롬프트 — 문체별 창작 면허·인물 추론 금지·visual_basis whitelist 지시", () => {
  const req: WritingRequest = {
    target: "moment3", direction: "calm", locale: "ko",
    context: { city: "gyeongju", placeName: "월정교", hasPhoto: true },
  };
  const p = buildMoment3MultimodalPrompt(req);
  assert.match(p, /Look at the photo carefully/);
  assert.match(p, /"witty": the goal is a SHORT COMEBACK/); // §H 재치 = 짧은 되받기
  assert.match(p, /"warm": POETIC/);
  assert.match(p, /NEVER guess or mention the identity, relationship, age, race, nationality/);
  assert.match(p, /NEVER invent real-sounding events/);
  for (const b of VISUAL_BASIS_ALLOWED) assert.ok(p.includes(b), b);
  assert.match(p, /IMMUTABLE PROPER NOUNS/);
});

// ── AI-TREND-PACK-PERSISTENT-CACHE V1 계약 ──────────────────────────────────

test("따옴표 쌍 보존 — 감싼 쌍만 벗기고 한쪽 따옴표는 깨뜨리지 않는다(§K zh 수정)", () => {
  assert.equal(stripWrappingQuotes('"전체 감쌈"'), "전체 감쌈");
  assert.equal(stripWrappingQuotes("“中文引号”"), "中文引号");
  assert.equal(stripWrappingQuotes("「日本語」"), "日本語");
  // 구 버그 재현 입력: 끝만 닫는 따옴표 — 이제 그대로 보존된다(짝 안 깨짐)
  assert.equal(stripWrappingQuotes("月精桥的“克隆”"), "月精桥的“克隆”");
  assert.equal(stripWrappingQuotes('제목에 "인용" 포함'), '제목에 "인용" 포함');
  assert.equal(stripWrappingQuotes('"시작만'), '"시작만');
});

test("trend pack — 배포 기본은 Owner 승인만, QA 플래그는 검수 완료분까지, 브랜드 연관 제외", () => {
  // 현재 pack 은 전부 ownerApproved=false → 배포 기본 활성 0
  assert.equal(activeTrendEntries("ko").length, 0);
  assert.equal(trendPackVersionFor("ko"), null);
  // QA 허용 시 verified_active 만 — owner_candidate·브랜드 연관은 여전히 제외
  const koQA = activeTrendEntries("ko", { allowPendingOwner: true });
  assert.ok(koQA.length >= 1);
  assert.ok(koQA.every(e => e.status === "verified_active" && !e.brandOrArtistRelated));
  assert.ok(!koQA.some(e => e.phrase.includes("두아") || e.phrase.includes("오이쉬")));
  // zh 는 지역 미구분 → 항상 비활성(§F)
  assert.equal(activeTrendEntries("zh", { allowPendingOwner: true }).length, 0);
  assert.equal(trendPackVersionFor("zh", { allowPendingOwner: true }), null);
  // 유효기간 밖이면 제외(만료 pack 미사용 §O)
  assert.equal(activeTrendEntries("ko", { allowPendingOwner: true, now: new Date("2027-06-01") }).length, 0);
});

test("trend 검증(§G) — 활성 목록 밖 신고·미반영 신고는 witty 만 폐기", () => {
  const resp = (trendId, wittyTitle) => JSON.stringify({
    calm: { title: "밤의 월정교", memo: "물에 다리가 비쳤다." },
    witty: { title: wittyTitle, memo: "물속에 하나 더 있네.", creative_kind: "visual_wordplay", visual_basis: ["reflection"], ...(trendId ? { trend_used_id: trendId } : {}) },
    warm: { title: "밤이 머문 자리", memo: "밤이 물 위에 머물렀다.", creative_kind: "poetic_imagery", visual_basis: ["reflection"] },
  });
  const active = new Map([["ko-neujoh-2026", "느좋"]]);
  // 신고 없음 → 통과, trendUsedId null
  const r0 = extractMoment3Creative(resp(null, "야간엔 1+1"), active);
  assert.ok(r0?.set.witty && r0.meta.trendUsedId === null);
  // 활성 id + 실제 반영 → 통과 + 기록
  const r1 = extractMoment3Creative(resp("ko-neujoh-2026", "다리 반영 느좋"), active);
  assert.ok(r1?.set.witty && r1.meta.trendUsedId === "ko-neujoh-2026");
  // 활성 목록 밖 id → witty 폐기(다른 방향 유지)
  const r2 = extractMoment3Creative(resp("ko-fake-id", "야간엔 1+1"), active);
  assert.ok(r2 && !r2.set.witty && r2.set.calm && r2.set.warm);
  // 신고했는데 문구 미반영 → witty 폐기
  const r3 = extractMoment3Creative(resp("ko-neujoh-2026", "야간엔 1+1"), active);
  assert.ok(r3 && !r3.set.witty);
  // 활성 목록이 아예 없으면 신고 자체가 위반
  const r4 = extractMoment3Creative(resp("ko-neujoh-2026", "다리 반영 느좋"), new Map());
  assert.ok(r4 && !r4.set.witty);
});

test("영구 캐시 키(§D) — 사진·문맥·버전·trend 가 다르면 키가 갈린다, 같으면 같다", async () => {
  const base = { feature: "moment3", direction: null, itineraryId: "11111111-2222-4333-8444-555555555555", locale: "ko",
    contextHash: "ctx1", imageSha: "img1", promptVersion: "v1", trendPackVersion: null };
  const k1 = await computeCacheKey(base);
  assert.equal(await computeCacheKey({ ...base }), k1); // 결정적
  assert.notEqual(await computeCacheKey({ ...base, imageSha: "img2" }), k1);
  assert.notEqual(await computeCacheKey({ ...base, contextHash: "ctx2" }), k1);
  assert.notEqual(await computeCacheKey({ ...base, promptVersion: "v2" }), k1);
  assert.notEqual(await computeCacheKey({ ...base, trendPackVersion: "tp1" }), k1);
  assert.notEqual(await computeCacheKey({ ...base, itineraryId: "99999999-2222-4333-8444-555555555555" }), k1);
  // storyHero 는 문체별 키 분리(QA 실측 결함 수정 검증)
  assert.notEqual(await computeCacheKey({ ...base, feature: "storyHero", direction: "witty" }), await computeCacheKey({ ...base, feature: "storyHero", direction: "warm" }));
  // 문맥 정규화 — 공백·순서 차이는 같은 입력이다
  const c1 = normalizedContextString({ city: " gyeongju ", placeName: "월정교", tripFacts: ["a", " b "] });
  const c2 = normalizedContextString({ tripFacts: ["a", "b"], placeName: "월정교", city: "gyeongju" });
  assert.equal(c1, c2);
  // draft(메모)·사진 유무 변경은 다른 입력
  assert.notEqual(normalizedContextString({ city: "g", draft: "메모A" }), normalizedContextString({ city: "g", draft: "메모B" }));
});

test("호출 제한 설정(§I) — 기본값 + env 덮어쓰기, 잘못된 값은 기본 유지", () => {
  const d = resolveLimits({});
  assert.deepEqual(d, { regenCooldownSec: 20, entityRegenPerHour: 3, deviceCallsPerDay: 20, globalCallsPerDay: 100 });
  const o = resolveLimits({ MYTRIP_AI_REGEN_COOLDOWN_SEC: "5", MYTRIP_AI_DEVICE_CALLS_PER_DAY: "abc", MYTRIP_AI_GLOBAL_CALLS_PER_DAY: "2" });
  assert.equal(o.regenCooldownSec, 5);
  assert.equal(o.deviceCallsPerDay, 20);
  assert.equal(o.globalCallsPerDay, 2);
});

test("멀티모달 프롬프트 — trend 블록은 활성 항목이 있을 때만, witty 전용·최대 1개 지시(§G)", () => {
  const req = { target: "moment3", direction: "calm", locale: "ko",
    context: { city: "gyeongju", placeName: "월정교", hasPhoto: true } };
  const noTrend = buildMoment3MultimodalPrompt(req, []);
  assert.ok(!noTrend.includes("CURRENT EXPRESSIONS"));
  const withTrend = buildMoment3MultimodalPrompt(req, [{ id: "x1", phrase: "느좋", meaning: "m", usageExample: "u", avoidWhen: "a" }]);
  assert.match(withTrend, /CURRENT EXPRESSIONS/);
  assert.match(withTrend, /AT MOST ONE, only in "witty"/);
  assert.match(withTrend, /never translate one into another language/);
  assert.match(withTrend, /trend_used_id/);
  // 길이 목표(§H) — 처음부터 짧게
  assert.match(withTrend, /around 18 characters/);
  assert.match(buildMoment3MultimodalPrompt({ ...req, locale: "en" }, []), /~45 characters/);
});
