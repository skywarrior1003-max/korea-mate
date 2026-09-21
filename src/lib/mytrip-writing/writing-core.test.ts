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
  // V5 §B — witty = SNS 캡션 계약(즉시 이해 훅·payoff·장치 1개·철학 독백 금지)
  assert.match(p, /"witty": a SOCIAL-MEDIA CAPTION/);
  assert.match(p, /Use EXACTLY ONE comic device/);
  assert.match(p, /philosophical monologue/);
  assert.match(p, /never repeat or re-explain the title/);
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
  const resp = (trendId: string | null, wittyTitle: string) => JSON.stringify({
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

// ── V5-1 §C·§E — trend 사용 판정 SSOT = 서버 문자열 검사(14 케이스) ──────────
test("V5-1 §E — 서버 trend 판정 14 케이스(신고는 참고값·문자열이 SSOT)", async () => {
  const { resolveTrendUse } = await import("./writing-core.ts");
  const KO = [
    { id: "ko-duahonna-2026", forms: ["혼나볼래?", "혼나볼래"] },
    { id: "ko-oishue-2026", forms: ["오이쉬!", "오이쉬"] },
  ];
  const EN = [
    { id: "en-core-memory-2026", forms: ["core memory unlocked", "core memory"] },
    { id: "en-understood", forms: ["understood"] },
  ];
  // 1. 전달 phrase 0개 사용 + 신고 없음 → 미사용 PASS
  assert.deepEqual(resolveTrendUse("ko", "꽃이 주연", "탑이 조연.", KO, null), { ok: true, usedId: null, matched: [] });
  // 2. 1개 사용 + 신고 일치 → PASS + 확정
  assert.deepEqual(resolveTrendUse("ko", "이 날씨엔", "혼나볼래?", KO, "ko-duahonna-2026"), { ok: true, usedId: "ko-duahonna-2026", matched: ["ko-duahonna-2026"] });
  // 3. 1개 사용 + 신고 누락 → 서버 자동 확정 PASS(V5 KO 폐기 문제의 해결 경로)
  assert.deepEqual(resolveTrendUse("ko", "이 날씨엔", "혼나볼래?", KO, null), { ok: true, usedId: "ko-duahonna-2026", matched: ["ko-duahonna-2026"] });
  // 4. 1개 사용 + 다른 ID 신고 → 폐기
  assert.equal(resolveTrendUse("ko", "이 날씨엔", "혼나볼래?", KO, "ko-oishue-2026").ok, false);
  // 5. 0개 사용 + 사용 신고 → 폐기
  assert.equal(resolveTrendUse("ko", "꽃이 주연", "탑이 조연.", KO, "ko-duahonna-2026").ok, false);
  // 6. 2개 사용 + 1개만 신고 → 폐기 / 7. 2개 사용 + 신고 없음 → 폐기
  assert.equal(resolveTrendUse("ko", "너 예쁠래?", "반짝이는 날 혼나볼래? 오이쉬!", KO, "ko-duahonna-2026").ok, false);
  assert.equal(resolveTrendUse("ko", "너 예쁠래?", "반짝이는 날 혼나볼래? 오이쉬!", KO, null).ok, false);
  // 9. punctuation variant("혼나볼래"만·물음표 없음) → 정확히 1개로 판정
  assert.deepEqual(resolveTrendUse("ko", "오늘은", "네가 좀 혼나볼래 싶었다", KO, null).usedId, "ko-duahonna-2026");
  // 10. 단순 부분 문자열 우연 일치(en) → 미매칭
  assert.deepEqual(resolveTrendUse("en", "misunderstood bridge", "totally misunderstood.", EN, null), { ok: true, usedId: null, matched: [] });
  // en 정상 매칭·case 정규화
  assert.equal(resolveTrendUse("en", "Core Memory unlocked", "night bridge did that.", EN, null).usedId, "en-core-memory-2026");
  // 11. 전달 목록 밖(expired/candidate) phrase 가 우연히 있어도 통계 미반영
  assert.deepEqual(resolveTrendUse("ko", "출사 갔다가", "拿捏까지는 아니고", KO, null), { ok: true, usedId: null, matched: [] });
});

test("V5-1 §C — 파서 통합: 자동 확정·혼입 폐기·확정 ID 만 meta 기록(§E 12·14)", () => {
  const active = new Map<string, readonly string[]>([
    ["ko-duahonna-2026", ["혼나볼래?", "혼나볼래"]], ["ko-oishue-2026", ["오이쉬!", "오이쉬"]]]);
  const resp = (trendId: string | null, wittyMemo: string) => JSON.stringify({
    calm: { title: "첨성대, 맑은 날", memo: "꽃가지 사이로 본 첨성대." },
    witty: { title: "첨성대 앞", memo: wittyMemo, creative_kind: "comeback", visual_basis: ["flowers"], ...(trendId ? { trend_used_id: trendId } : {}) },
  });
  // 14. V5 고정 실패 문장 — 2개 감지 후 폐기(calm 유지)
  const r1 = extractMoment3Creative(resp("ko-duahonna-2026", "하늘도 꽃도 반짝이는 날 혼나볼래? 오이쉬!"), active, "ko");
  assert.ok(r1 && !r1.set.witty && r1.set.calm && r1.meta.trendUsedId === null);
  // 3·12. 신고 누락 + 실제 1개 → 서버 자동 확정 — meta 에 확정 ID(통계 SSOT)
  const r2 = extractMoment3Creative(resp(null, "이 날씨엔 혼나볼래?"), active, "ko");
  assert.ok(r2?.set.witty && r2.meta.trendUsedId === "ko-duahonna-2026");
  // 13. 공개로 나가는 set 에는 title/memo 만 — trend 내부 ID·검증 필드 0
  assert.deepEqual(Object.keys(r2!.set.witty!).sort(), ["memo", "title"]);
});

test("V5-1 §E-8 — EN 결과에 source 에 없는 한글(KO phrase 등) → 폐기", () => {
  const req: WritingRequest = { target: "moment3", direction: "calm", locale: "en",
    context: { city: "gyeongju", placeName: "Woljeonggyo Bridge", hasPhoto: true } };
  assert.equal(groundedSuggestionGuard(req, "the bridge said 혼나볼래?"), null);
  assert.equal(groundedSuggestionGuard(req, "1+1 tonight, water's idea"), "1+1 tonight, water's idea");
  // source(placeName)에 실제로 있는 한글은 허용 — 사용자가 쓴 한글을 뭉개지 않는다
  const req2: WritingRequest = { ...req, context: { ...req.context, placeName: "월정교" } };
  assert.equal(groundedSuggestionGuard(req2, "월정교 doubled itself"), "월정교 doubled itself");
});

test("V5-2 §B — 운영정보 오인 조합만 차단·비유/야경은 통과·source 인용 허용", async () => {
  const { bizInfoViolation } = await import("./writing-core.ts");
  // 고정 회귀 — 차단
  assert.ok(bizInfoViolation("월정교, 야간 영업 개시\n수면에 다리가 하나 더", ""));
  assert.ok(bizInfoViolation("stone bridge\nopen 24/7 apparently", ""));
  assert.ok(bizInfoViolation("첨성대는 오늘 휴무\n라고 꽃이 말했다", ""));
  assert.ok(bizInfoViolation("橋の夜\n本日休業みたい", ""));
  assert.ok(bizInfoViolation("月精桥\n全天开放的样子", ""));
  assert.ok(bizInfoViolation("입장 가능해 보이는 밤", ""));
  // 오탐 금지 — 허용
  assert.ok(!bizInfoViolation("월정교의 야간 풍경\n물이 다리를 복사했다", ""));
  assert.ok(!bizInfoViolation("open sky above the tower\nflowers steal the scene", ""));
  assert.ok(!bizInfoViolation("the bridge opened my eyes\nto reflections", ""));
  assert.ok(!bizInfoViolation("야경이 두 배\n밤이 일을 잘한다", ""));
  // 사용자·공식 입력에 그대로 있으면 사실 인용 — 허용
  assert.ok(!bizInfoViolation("여긴 24시간 개방이라던데\n밤에 또 왔다", "안내판에 24시간 개방이라 적혀 있었다"));
});

test("V5-2 §C — 브랜드 위험 이중 의미만 차단·정상 용례 통과·source 인용 허용", async () => {
  const { brandSafetyViolation } = await import("./writing-core.ts");
  // 고정 회귀 — 차단
  assert.ok(brandSafetyViolation("Stoned and flowered\nan old tower, new blooms", ""));
  assert.ok(brandSafetyViolation("bridge night\nwe got high at the tower", ""));
  assert.ok(brandSafetyViolation("This view is killer\nno survivors", ""));
  assert.ok(brandSafetyViolation("so wasted after the walk\nbut worth it", ""));
  assert.ok(brandSafetyViolation("tower night\nthis place is sick honestly", ""));
  assert.ok(brandSafetyViolation("완전 꽐라 감성\n밤의 다리", ""));
  // 오탐 금지 — 허용
  assert.ok(!brandSafetyViolation("An old stone tower among flowers\nspring did the styling", ""));
  assert.ok(!brandSafetyViolation("A high tower under the open sky\nflowers photobombing", ""));
  assert.ok(!brandSafetyViolation("The lanterns were lit across the bridge\ntwice, thanks to the water", ""));
  assert.ok(!brandSafetyViolation("high above the city\nthe tower keeps watch", ""));
  assert.ok(!brandSafetyViolation("wasted no time finding the bridge\nneither did its reflection", ""));
  // 사용자 원문 인용 — 허용
  assert.ok(!brandSafetyViolation("sick leave 내고 온 여행\n다리는 출근 중", "sick leave 내고 왔다"));
});

test("V5-2 §B·§C — witty 만 폐기(calm·warm 유지)·hero title/intro 에도 적용", async () => {
  const { groundedMoment3Guard, validateHeroRefs } = await import("./writing-core.ts");
  const req: WritingRequest = { target: "moment3", direction: "calm", locale: "ko",
    context: { city: "gyeongju", placeName: "월정교", hasPhoto: true } };
  const g = groundedMoment3Guard(req, {
    calm: { title: "월정교의 밤", memo: "물에 다리가 비쳤다" },
    witty: { title: "월정교, 야간 영업 개시", memo: "수면에 비친 다리까지 두 개" },
    warm: { title: "밤의 강", memo: "빛이 물 위에 오래 머물렀다" },
  });
  assert.ok(g && g.calm && g.warm && !g.witty);
  const heroReq: WritingRequest = { target: "storyHero", direction: "witty", locale: "en",
    context: { city: "gyeongju", hasPhoto: true, tripFacts: ["3 day(s), 7 stops"] } };
  const hero = (title: string, memo: string) => ({ title, memo, sourceRefs: [], creativeKind: "comeback" });
  assert.equal(validateHeroRefs(heroReq, hero("Stoned and flowered", "an old tower, new blooms")), null);
  assert.equal(validateHeroRefs(heroReq, hero("Gyeongju, open 24/7", "the night shift bridge")), null);
  assert.ok(validateHeroRefs(heroReq, hero("The bridge clocked in twice", "once on land, once on water.")));
  // §E 프롬프트 계약 — 모호 시어·3초 이해·운영정보/브랜드 금지 지시
  const { buildWritingPrompt, buildMoment3MultimodalPrompt } = await import("./writing-core.ts");
  const hp = buildWritingPrompt(heroReq);
  assert.match(hp, /WITHIN 3 SECONDS/);
  assert.match(hp, /고요한 유턴/);
  assert.match(hp, /must NOT merely explain the title/);
  const mp = buildMoment3MultimodalPrompt({ ...req, locale: "en" });
  assert.match(mp, /real operating information/);
  assert.match(mp, /never "stoned"/i);
});

test("V5-1 §H — hero witty 질문형 제목은 결정적으로 거부(나열형은 프롬프트+사람 판독)", async () => {
  const { HERO_QUESTION_RE, validateHeroRefs, buildWritingPrompt } = await import("./writing-core.ts");
  for (const bad of ["경주, 고요해서 더 좋았나", "다시 갈까?", "여긴 어디였을까", "was it worth it?"])
    assert.ok(HERO_QUESTION_RE.test(bad), bad);
  for (const good of ["경주는 고요가 주연", "다리 하나, 두 번 등장", "고요가 이긴 여행"])
    assert.ok(!HERO_QUESTION_RE.test(good), good);
  const req: WritingRequest = { target: "storyHero", direction: "witty", locale: "ko",
    context: { city: "gyeongju", hasPhoto: true, tripFacts: ["3 day(s), 7 stops"] } };
  const hero = (title: string) => ({ title, memo: "고요했다는 그 말, 표지가 가져갔다.", sourceRefs: [], creativeKind: "comeback" });
  assert.equal(validateHeroRefs(req, hero("경주, 고요해서 더 좋았나")), null);
  assert.ok(validateHeroRefs(req, hero("경주는 고요가 주연")));
  // calm 은 질문형 가드 비적용(계약은 witty 표지만)
  const calmReq: WritingRequest = { ...req, direction: "calm" };
  assert.ok(validateHeroRefs(calmReq, { title: "사흘의 경주였나", memo: "m", sourceRefs: [], creativeKind: null }));
  // §H — 프롬프트에 질문형·나열 금지 계약이 실림(V5-3 §F: 2곳 이상 금지로 강화)
  const p = buildWritingPrompt(req);
  assert.match(p, /NEVER a question/);
  assert.match(p, /NEVER name two or more places/);
});

// ── V5-3 §B·§G — 폐기 사유 reason code(원문 0) ──────────────────────────────
test("V5-3 §G — 파서 단계 reason code: kind·basis·trend 사유가 정확히 남는다", () => {
  const active = new Map<string, readonly string[]>([["ko-duahonna-2026", ["혼나볼래?"]], ["ko-oishue-2026", ["오이쉬!"]]]);
  const mk = (witty: Record<string, unknown>) => JSON.stringify({ calm: { title: "t", memo: "m" }, witty });
  const reasonsOf = (j: string) => extractMoment3Creative(j, active, "ko")?.meta.validation.witty;
  assert.deepEqual(reasonsOf(mk({ title: "t2", memo: "m2", visual_basis: ["reflection"] })), { status: "dropped", reasons: ["creative_kind_missing"] });
  assert.deepEqual(reasonsOf(mk({ title: "t2", memo: "m2", creative_kind: "sarcasm_bomb", visual_basis: ["reflection"] })), { status: "dropped", reasons: ["creative_kind_invalid"] });
  assert.deepEqual(reasonsOf(mk({ title: "t2", memo: "m2", creative_kind: "comeback" })), { status: "dropped", reasons: ["visual_basis_missing"] });
  assert.deepEqual(reasonsOf(mk({ title: "t2", memo: "m2", creative_kind: "comeback", visual_basis: ["sunset_vibes"] })), { status: "dropped", reasons: ["visual_basis_invalid"] });
  assert.deepEqual(reasonsOf(mk({ title: "혼나볼래?", memo: "오이쉬!까지", creative_kind: "comeback", visual_basis: ["reflection"] })), { status: "dropped", reasons: ["trend_multiple_detected"] });
  assert.deepEqual(reasonsOf(mk({ title: "t2", memo: "m2", creative_kind: "comeback", visual_basis: ["reflection"], trend_used_id: "ko-duahonna-2026" })), { status: "dropped", reasons: ["trend_claim_mismatch"] });
  // 통과 방향은 accepted·reasons []
  const okv = extractMoment3Creative(mk({ title: "짧은 훅", memo: "한 번에 이해", creative_kind: "comeback", visual_basis: ["reflection"] }), active, "ko");
  assert.deepEqual(okv?.meta.validation.calm, { status: "accepted", reasons: [] });
  assert.deepEqual(okv?.meta.validation.witty, { status: "accepted", reasons: [] });
});

test("V5-3 §G — guard 단계 reason code: 길이·운영정보·브랜드·계절·flat", async () => {
  const { emptyValidation, groundedMoment3Guard } = await import("./writing-core.ts");
  const req: WritingRequest = { target: "moment3", direction: "calm", locale: "ko",
    context: { city: "gyeongju", placeName: "월정교", hasPhoto: true } };
  const run = (witty: { title: string; memo: string }) => {
    const v = emptyValidation();
    const out = groundedMoment3Guard(req, { calm: { title: "월정교의 밤", memo: "물에 비쳤다" }, witty }, v);
    return { out, w: v.witty };
  };
  assert.deepEqual(run({ title: "이 제목은 스물두 자를 확실히 넘기는 긴 제목이다", memo: "본문" }).w.reasons, ["title_length_violation"]);
  assert.deepEqual(run({ title: "제목", memo: "나".repeat(46) }).w.reasons, ["memo_length_violation"]);
  assert.deepEqual(run({ title: "월정교, 야간 영업 개시", memo: "물에 하나 더" }).w.reasons, ["business_info_violation"]);
  assert.deepEqual(run({ title: "돌탑은 봤다는데", memo: "나는 뭘 봤을까" }).w.reasons, ["monologue_violation"]);
  // 계절 — 사용자 근거 없는 계절 단정(witty)
  const sv = emptyValidation();
  groundedMoment3Guard(req, { witty: { title: "가을의 월정교", memo: "단풍보다 다리" } }, sv);
  assert.deepEqual(sv.witty.reasons, ["season_violation"]);
  // brand — en
  const enReq: WritingRequest = { ...req, locale: "en", context: { city: "gyeongju", placeName: "Cheomseongdae", hasPhoto: true } };
  const bv = emptyValidation();
  groundedMoment3Guard(enReq, { witty: { title: "Stoned and flowered", memo: "old tower, new blooms" } }, bv);
  assert.deepEqual(bv.witty.reasons, ["brand_safety_violation"]);
  // V5-3 §C-1 — flat 설명문 고정 실패 fixture ("Old stone..." 실측)
  const fv = emptyValidation();
  groundedMoment3Guard(enReq, { witty: { title: "Old stone, new blooms", memo: "A stark contrast, yet peaceful." } }, fv);
  assert.deepEqual(fv.witty.reasons, ["witty_flat_description"]);
  // 명확한 되받기 1개는 허용
  const okv = emptyValidation();
  const ok = groundedMoment3Guard(req, { witty: { title: "야간엔 1+1", memo: "다리 하나 보러 왔는데 물이 하나 더 줬네" } }, okv);
  assert.ok(ok?.witty && okv.witty.status !== "dropped");
});

test("V5-3 §F·§G — hero: 추상 시어·장소 2곳·motif 미사용 사유 + 허용 케이스", async () => {
  const { validateHeroRefs, HERO_ABSTRACT_RE, heroDistinctPlaceCount, heroMotifMissing } = await import("./writing-core.ts");
  const ctx = { city: "gyeongju", hasPhoto: true, tripFacts: [
    "3 day(s), 7 stops", "places include: 월정교, 첨성대, 대릉원",
    "traveler's public moment notes: \"첨성대의 밤\" / \"다리 위에서 잠시\" / \"고요했다\"" ] };
  const req: WritingRequest = { target: "storyHero", direction: "witty", locale: "ko", context: ctx };
  const hero = (title: string, memo: string) => ({ title, memo, sourceRefs: [], creativeKind: "comeback" });
  const tryHero = (t: string, m: string) => { const rs: string[] = []; const out = validateHeroRefs(req, hero(t, m), rs as never); return { out, rs }; };
  // V5.2 실측 실패 사례 고정 — 추상 시어
  assert.ok(HERO_ABSTRACT_RE.test("경주에서 고요함을 '잠시' 빌리다"));
  const a = tryHero("경주에서 고요함을 '잠시' 빌리다", "다리 위에서 잠시 멈췄다");
  assert.equal(a.out, null); assert.deepEqual(a.rs, ["hero_abstract_violation"]);
  // 장소 2곳 나열
  const b = tryHero("다리 위에서 잠시, 두 배로", "월정교 위에서 멈추자 첨성대 밤도 왔다");
  assert.equal(b.out, null); assert.deepEqual(b.rs, ["hero_scene_list_violation"]);
  assert.equal(heroDistinctPlaceCount(ctx, "월정교 위에서 멈추자 첨성대 밤도 왔다"), 2);
  // 저장 motif 미사용
  const c = tryHero("경주는 밥이 다 했다", "국밥 세 그릇의 기록이었다");
  assert.equal(c.out, null); assert.deepEqual(c.rs, ["hero_saved_motif_missing"]);
  assert.ok(heroMotifMissing(ctx, "경주는 밥이 다 했다 국밥 세 그릇의 기록이었다"));
  // 저장 witty 한 건("다리 위에서 잠시")을 명확히 되받은 hero — 허용
  const d = tryHero("다리 위에서 잠시, 라던 사람", "그 잠시가 사흘 중 제일 길었다");
  assert.ok(d.out && d.rs.length === 0);
  assert.ok(!heroMotifMissing(ctx, "다리 위에서 잠시, 라던 사람"));
  // 질문형 사유 코드
  const e = tryHero("다리 위에서 잠시였을까", "그 잠시가 길었다");
  assert.equal(e.out, null); assert.deepEqual(e.rs, ["hero_question_violation"]);
});

test("SINGLE-ANCHOR V1 — anchor 선택 결정성·우선순위·비자격 제외·facts 격리", async () => {
  const { selectHeroAnchor, buildAnchorHeroFacts, stripMultiMomentFacts } = await import("./writing-core.ts");
  const base = { place_name: "장소", has_photo: true, day_number: 1, captured_at: "2026-09-15T10:00:00Z" };
  const rows = [
    { ...base, moment_id: "m3", title: "대릉원 오후", memo: "산책로", place_name: "대릉원", day_number: 3 },
    { ...base, moment_id: "m1", title: "첨성대의 밤", memo: "밤 조명", place_name: "첨성대", day_number: 1 },
    { ...base, moment_id: "m2", title: "다리 위에서 잠시", memo: "물에 비친", place_name: "월정교", day_number: 2 },
  ];
  // 사진+제목+메모 동점 → day 빠른 항목, 입력 순서와 무관(결정성)
  assert.equal(selectHeroAnchor(rows)?.moment_id, "m1");
  assert.equal(selectHeroAnchor([...rows].reverse())?.moment_id, "m1");
  // 사진이 문구 완전성보다 우선(계약 2>3)
  const photoWins = selectHeroAnchor([
    { ...base, moment_id: "a", title: "제목만", memo: null, has_photo: true, day_number: 3 },
    { ...base, moment_id: "b", title: "둘 다", memo: "있음", has_photo: false, day_number: 1 },
  ]);
  assert.equal(photoWins?.moment_id, "a");
  // 제목·메모 전무 moment 는 자격 없음 → 공백뿐이면 null(→ provider 0 fallback)
  assert.equal(selectHeroAnchor([{ ...base, moment_id: "x", title: "  ", memo: null }]), null);
  assert.equal(selectHeroAnchor([]), null);
  // facts 격리 — 다중 moment 문구·장소 나열 제거 + anchor 만 주입
  const facts = ["3 day(s), 7 stops", "places include: 월정교, 첨성대, 대릉원",
    "traveler's public moment notes: \"고요했다\" / \"대릉원 오후\""];
  assert.deepEqual(stripMultiMomentFacts(facts), ["3 day(s), 7 stops"]);
  const built = buildAnchorHeroFacts(facts, rows[1]!);
  assert.deepEqual(built, ["3 day(s), 7 stops", "anchor place: 첨성대", "anchor moment notes: \"첨성대의 밤\" / \"밤 조명\""]);
  // AI 요청에 다른 moment 문구·다른 장소명 0
  const joined = built.join("\n");
  for (const bad of ["월정교", "대릉원", "고요했다"]) assert.ok(!joined.includes(bad), bad);
  // anchor 라인은 기존 motif 검증(/moment notes:/)이 그대로 작동한다
  const { heroMotifMissing } = await import("./writing-core.ts");
  const ctx = { city: "gyeongju", tripFacts: built };
  assert.ok(!heroMotifMissing(ctx, "첨성대의 밤을 표지가 가져갔다"));
  assert.ok(heroMotifMissing(ctx, "국밥 세 그릇의 기록"));
});

test("영구 캐시 키(§D) — 사진·문맥·버전·trend 가 다르면 키가 갈린다, 같으면 같다", async () => {
  const base = { feature: "moment3" as const, direction: null, itineraryId: "11111111-2222-4333-8444-555555555555", locale: "ko",
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
  const req: WritingRequest = { target: "moment3", direction: "calm", locale: "ko",
    context: { city: "gyeongju", placeName: "월정교", hasPhoto: true } };
  const noTrend = buildMoment3MultimodalPrompt(req, []);
  assert.ok(!noTrend.includes("CURRENT EXPRESSIONS"));
  const withTrend = buildMoment3MultimodalPrompt(req, [{ id: "x1", phrase: "느좋", meaning: "m", usageExample: "u", avoidWhen: "a" }]);
  assert.match(withTrend, /CURRENT EXPRESSIONS/);
  assert.match(withTrend, /AT MOST ONE, only in "witty"/);
  assert.match(withTrend, /never\s+translate one into another language/);
  assert.match(withTrend, /trend_used_id/);
  // V5 §D — 자연 결합 우선 검토(단순 무시 금지) 지시
  assert.match(withTrend, /FIRST genuinely check whether ONE of them fits/);
  // V5 §E — trend 미전달 시 locale-native social caption 강제
  assert.match(noTrend, /native\s+social-caption grammar/);
  assert.match(noTrend, /NOT a philosophical line/);
  // 길이 목표(§H) — 처음부터 짧게 + V5 §C witty 하드 계약
  assert.match(withTrend, /around 18 characters/);
  assert.match(withTrend, /HARD LENGTH CONTRACT for "witty": title within 22 characters/);
  assert.match(withTrend, /memo within 45 characters/);
  const enP = buildMoment3MultimodalPrompt({ ...req, locale: "en" }, []);
  assert.match(enP, /~45 characters/);
  assert.match(enP, /title 2-7 words \(never more than 10\), memo 5-12 words \(never more than 18\)/);
  assert.match(buildMoment3MultimodalPrompt({ ...req, locale: "ja" }, []), /title within 22 characters(.|\n)*memo within 42 characters/);
  assert.match(buildMoment3MultimodalPrompt({ ...req, locale: "zh" }, []), /title within 18 characters(.|\n)*memo within 36 characters/);
});

test("V5 §C — witty 길이 계약: 위반 witty 만 폐기·재호출 0(자르지 않는다)", async () => {
  const { wittyLenViolation, groundedMoment3Guard } = await import("./writing-core.ts");
  // 한도 내 통과
  assert.equal(wittyLenViolation("ko", "야간엔 1+1", "다리 하나 보러 왔는데 물이 하나 더 줬네"), false);
  assert.equal(wittyLenViolation("ko", "가".repeat(23), "짧은 본문"), true);
  assert.equal(wittyLenViolation("ko", "제목", "나".repeat(46)), true);
  assert.equal(wittyLenViolation("en", "one two three four five six seven eight nine ten eleven", "short memo"), true);
  assert.equal(wittyLenViolation("en", "1+1 tonight", "came for one bridge, the water threw in another"), false);
  assert.equal(wittyLenViolation("ja", "夜は1+1", "橋を一本見に来たら水面がもう一本くれた"), false);
  assert.equal(wittyLenViolation("zh", "夜晚买一送一", "来看一座桥水面又送了一座"), false);
  // guard 통합 — 길이 위반 witty 만 빠지고 calm/warm 유지
  const req: WritingRequest = { target: "moment3", direction: "calm", locale: "ko",
    context: { city: "gyeongju", placeName: "월정교", hasPhoto: true } };
  const g = groundedMoment3Guard(req, {
    calm: { title: "월정교의 밤", memo: "다리 아래 물이 잔잔했다" },
    witty: { title: "이 제목은 스물두 자를 확실히 넘기는 긴 제목이다", memo: "본문" },
    warm: { title: "밤의 강", memo: "물 위에 등이 하나 떠 있었다" },
  });
  assert.ok(g && g.calm && g.warm && !g.witty);
});

test("V5 §B — witty 철학 독백·추상 자기질문은 witty 만 폐기", async () => {
  const { WITTY_MONOLOGUE_RE, groundedMoment3Guard } = await import("./writing-core.ts");
  assert.ok(WITTY_MONOLOGUE_RE.test("돌탑은 하늘을 봤다는데, 나는 뭘 봤을까"));
  assert.ok(WITTY_MONOLOGUE_RE.test("what did i even see here"));
  assert.ok(WITTY_MONOLOGUE_RE.test("私は何を見たのだろう"));
  assert.ok(WITTY_MONOLOGUE_RE.test("我到底看到了什么"));
  assert.ok(!WITTY_MONOLOGUE_RE.test("다리 하나 보러 왔는데 물이 하나 더 줬네"));
  assert.ok(!WITTY_MONOLOGUE_RE.test("첨성대 보러 왔는데 꽃이 주연"));
  const req: WritingRequest = { target: "moment3", direction: "calm", locale: "ko",
    context: { city: "gyeongju", placeName: "첨성대", hasPhoto: true } };
  const g = groundedMoment3Guard(req, {
    calm: { title: "첨성대 오후", memo: "돌탑 앞이 붐볐다" },
    witty: { title: "내 관찰은 하늘을 못 봤다", memo: "돌탑은 하늘을 봤다는데, 나는 뭘 봤을까" },
  });
  assert.ok(g && g.calm && !g.witty);
});

test("V5 §F — visual_basis 확장 6종이 파서 whitelist 를 통과한다", async () => {
  const { extractMoment3Creative } = await import("./writing-core.ts");
  const mk = (basis: string[]) => JSON.stringify({
    calm: { title: "t", memo: "m" },
    witty: { title: "t2", memo: "m2", creative_kind: "visual_contrast", visual_basis: basis },
  });
  for (const b of ["flowers", "architecture", "shadow", "crowd", "scale_contrast", "weather_visible"]) {
    const r = extractMoment3Creative(mk([b]));
    assert.ok(r && r.set.witty, b);
  }
  // 목록 밖 자기신고는 여전히 위반
  const bad = extractMoment3Creative(mk(["sunset_vibes"]));
  assert.ok(bad && !bad.set.witty && bad.set.calm);
});
