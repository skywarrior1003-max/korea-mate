// External URL Import 코어 가드 (EXTERNAL-URL-IMPORT-ENGINE-V1)
import test from "node:test";
import assert from "node:assert/strict";
import {
  validateImportUrl, isOwnHost, extractReadableText, parseAnalyzed,
  buildAnalyzePrompt, normalizePlaceName, isMatchableName, providerFailClass,
  MAX_RESPONSE_BYTES, MAX_REDIRECTS, FETCH_TIMEOUT_MS,
} from "./import-core.ts";

test("U1 http/https 만 허용", () => {
  assert.equal(validateImportUrl("https://example.com/trip").ok, true);
  assert.equal(validateImportUrl("example.com/trip").ok, true); // scheme 없으면 https 로
  for (const bad of ["ftp://example.com", "file:///etc/passwd", "javascript:alert(1)", "data:text/html,hi"]) {
    const r = validateImportUrl(bad);
    assert.equal(r.ok, false, bad);
  }
});

test("U2 private/internal 호스트 차단 (SSRF)", () => {
  for (const bad of [
    "http://localhost:8788/x", "http://127.0.0.1/", "http://10.0.0.5/a", "http://192.168.0.1/",
    "http://172.16.3.4/", "http://169.254.169.254/latest/meta-data", "http://0.0.0.0/",
    "http://[::1]/", "http://[fd00::1]/", "http://intranet/", "http://foo.local/", "http://2130706433/",
    "http://user:pw@example.com/",
  ]) {
    const r = validateImportUrl(bad);
    assert.equal(r.ok, false, bad);
  }
});

test("U3 자체 도메인 판별 — 내부 URL 은 서버 fetch/AI 분석 금지(§7)", () => {
  assert.equal(isOwnHost("gokoreamate.com"), true);
  assert.equal(isOwnHost("www.gokoreamate.com"), true);
  assert.equal(isOwnHost("abc.korea-mate.pages.dev"), true);
  assert.equal(isOwnHost("example.com"), false);
  assert.equal(isOwnHost("gokoreamate.com.evil.com"), false);
});

test("U4 텍스트 추출 — 스크립트 제거·구조 힌트·상한", () => {
  const html = `<html><head><title>Busan 2 Days</title>
    <meta name="description" content="A two day plan"></head>
    <body><script>evil()</script><nav>menu</nav>
    <h2>Day 1</h2><ul><li>09:00 Haeundae Beach</li><li>Gamcheon Culture Village</li></ul>
    <h2>Day 2</h2><p>Visit &amp; enjoy</p></body></html>`;
  const p = extractReadableText(html);
  assert.equal(p.title, "Busan 2 Days");
  assert.equal(p.description, "A two day plan");
  assert.ok(!p.text.includes("evil"));
  assert.ok(!p.text.includes("menu"), "nav 는 제거된다");
  assert.match(p.text, /## Day 1/);
  assert.match(p.text, /- 09:00 Haeundae Beach/);
  assert.match(p.text, /Visit & enjoy/);
  const big = extractReadableText("<body>" + "x".repeat(100000) + "</body>");
  assert.ok(big.text.length <= 18000);
});

test("U5 분석 결과 정화 — 발명 차단·형식 강제·상한", () => {
  const raw = JSON.stringify({
    content_kind: "external_itinerary",
    trip_title: "  Busan   Trip ",
    city: "Busan",
    start_date: "2026-10-01", end_date: "not-a-date",
    days: [
      { day_number: 1, stops: [{ name: "Haeundae Beach", time: "09:00" }, { name: "X", time: "9am" }, { name: "" }] },
      { day_number: "bad", stops: [] },
    ],
    places: [{ name: "Haeundae Beach" }, { name: "haeundae beach" }, { name: "Gamcheon" }],
  });
  const a = parseAnalyzed(raw);
  assert.ok(a);
  assert.equal(a.kind, "external_itinerary");
  assert.equal(a.trip_title, "Busan Trip");
  assert.equal(a.city, "busan");
  assert.equal(a.start_date, "2026-10-01");
  assert.equal(a.end_date, null, "형식이 아니면 null — 지어내지 않는다");
  assert.equal(a.days.length, 1, "잘못된 day 는 버린다");
  assert.equal(a.days[0].stops.length, 1, "이름 2자 미만·빈 이름 제외"); // "X" 는 1자라 제외
  assert.equal(a.days[0].stops[0].time, "09:00");
  assert.equal(a.places.length, 2, "이름 dedup(대소문자 무시)");
  assert.equal(parseAnalyzed("not json"), null);
  assert.equal(parseAnalyzed('{"content_kind":"evil"}'), null);
});

test("U6 프롬프트 — 발명 금지·순서 보존·재배치 금지가 명문이다", () => {
  const p = buildAnalyzePrompt({ title: "t", description: "d", text: "body" }, "https://example.com");
  assert.match(p, /NEVER invent/);
  assert.match(p, /ORIGINAL order/);
  assert.match(p, /Do not reorder or optimize/);
  assert.match(p, /Unknown → null/);
});

test("U7 매칭 이름 규칙 — 정확 일치 전용·문법 위험 문자는 매칭 제외", () => {
  assert.equal(normalizePlaceName("  Haeundae   Beach "), "haeundae beach");
  assert.equal(isMatchableName("Gamcheon Culture Village"), true);
  assert.equal(isMatchableName("A, B"), false);
  assert.equal(isMatchableName("x"), false);
  assert.equal(isMatchableName("50% off spot"), false);
});

test("U8 상한 상수가 방어적이다", () => {
  assert.ok(MAX_RESPONSE_BYTES <= 2_000_000);
  assert.ok(MAX_REDIRECTS <= 3);
  assert.ok(FETCH_TIMEOUT_MS <= 15_000);
});

// EXTERNAL-TRIP-IMPORT-V2 — 원문 시간 표기의 결정적 변환(AI 값을 믿지 않는다)
test("parseTimeText — 오전/오후·범위·한국어 표기", async () => {
  const { parseTimeText } = await import("./import-core.ts");
  const cases: [string | null, string | null, string | null][] = [
    ["12:00 PM - 02:00 PM", "12:00", "14:00"],
    ["02:00 PM - 04:30 PM", "14:00", "16:30"],
    ["14:00~16:30", "14:00", "16:30"],
    ["오후 2시 30분 - 4시", "14:30", "16:00"],
    ["오전 11시~오후 1시", "11:00", "13:00"],
    ["2 - 4:30 PM", "14:00", "16:30"],
    ["9:30", "09:30", null],
    [null, null, null],
  ];
  for (const [raw, s, e] of cases) assert.deepEqual(parseTimeText(raw), { start: s, end: e }, String(raw));
});

test("AI 대화 링크 — 공개 공유 vs 대화창 개인 주소", async () => {
  const { classifyAiChatUrl } = await import("./import-core.ts");
  assert.equal(classifyAiChatUrl(new URL("https://gemini.google.com/share/abc123")).link, "share");
  assert.equal(classifyAiChatUrl(new URL("https://g.co/gemini/share/abc")).link, "share");
  assert.equal(classifyAiChatUrl(new URL("https://chatgpt.com/share/abc-1")).link, "share");
  assert.equal(classifyAiChatUrl(new URL("https://gemini.google.com/app/abc")).link, "private");
  assert.equal(classifyAiChatUrl(new URL("https://chatgpt.com/c/abc")).link, "private");
  assert.equal(classifyAiChatUrl(new URL("https://blog.naver.com/x/1")).link, null);
});

// 메시지 자리표시({name}·{date})를 작은따옴표로 감싸면 ICU 가 이스케이프해 글자 그대로 보인다(실측 결함)
test("4개 locale 메시지에 ICU 따옴표로 감싼 자리표시가 없다", async () => {
  const { readFileSync } = await import("node:fs");
  for (const lc of ["ko", "en", "ja", "zh"]) {
    const raw = readFileSync(new URL(`../../messages/${lc}.json`, import.meta.url), "utf8");
    assert.doesNotMatch(raw, /'\{[a-zA-Z]+\}'/, lc);
  }
});

test("providerFailClass — 520 과 시간 초과·출력 상한을 가르고, 오류 문장·키는 버린다(2026-09-30)", () => {
  assert.equal(providerFailClass("timeout"), "timeout");
  assert.equal(providerFailClass("http_520:INTERNAL:boom AIzaXXXX"), "edge_520");
  assert.equal(providerFailClass("http_503:UNAVAILABLE:overloaded"), "http_5xx_503");
  assert.equal(providerFailClass("http_400:FAILED_PRECONDITION:User location is not supported"), "http_4xx_400");
  assert.equal(providerFailClass("http_401:worker_unauthorized"), "worker_refused_401");
  assert.equal(providerFailClass("parse_failed:MAX_TOKENS:4134"), "parse_max_tokens");
  assert.equal(providerFailClass("fetch_error"), "network");
  assert.equal(providerFailClass(undefined), "unknown");
});

// ── 글 형식별 추출 회귀(2026-09-30) — 합성 HTML 로 형식만 흉내 낸다(외부 원문을 저장소에 두지 않는다) ──
test("추출: 따옴표 속성 안의 '>' 가 본문에 새지 않는다(Brunch 형식) · 빈 목록 줄 제거", () => {
  const html = `<html><head><title>부산 1박2일</title></head><body>
    <div class="wrap" data-tiara-layer="본문 하단 > 키워드 클릭" t-section="article">
    <ul><li></li><li> </li><li></li></ul>
    <h2 data-x='a > b'>1. 영동밀면</h2><p>부산역 앞 밀면집.</p>
    <ul><li>이용시간 : 10:00-21:00</li></ul>
    <h2>5. 흰여울문화마을</h2><p>마지막 일정으로 선택한 곳.</p></div></body></html>`;
  const t = extractReadableText(html).text;
  assert.ok(!/t-section|data-tiara|키워드 클릭|a > b/.test(t), t);
  assert.ok(!/^-\s*$/m.test(t), "빈 목록 줄이 남았다");
  assert.match(t, /## 1\. 영동밀면/);
  assert.match(t, /- 이용시간 : 10:00-21:00/);
  assert.ok(t.indexOf("영동밀면") < t.indexOf("흰여울문화마을"), "순서가 바뀌었다");
});

test("추출: 영어 Day 제목 형식 — Day 구획과 '건너뛰었다' 같은 문장이 그대로 남는다", () => {
  const html = `<article><h2>Day 1 – Downtown</h2><h3>Morning</h3><p>Jagalchi Market is a great first stop.</p>
    <h2>Day 2 – Haeundae</h2><p>This is why we skipped <a href="/x" title="temple > sea">Haedong Yonggungsa Temple</a>.</p></article>`;
  const t = extractReadableText(html).text;
  assert.match(t, /## Day 1 – Downtown/);
  assert.match(t, /## Day 2 – Haeundae/);
  assert.match(t, /we skipped Haedong Yonggungsa Temple/);
  assert.ok(!/temple > sea/.test(t));
});

test("추출: 스크립트·스타일·머리글·주석은 버리고, 본문 순서는 지킨다", () => {
  const html = `<header><nav>메뉴 > 부산</nav></header><script>var a = "<p>x</p>";</script><style>p>b{}</style>
    <!-- 광고 --><main><p>첫째 장소: 동백섬</p><p>둘째 장소: 부산시립미술관</p></main><footer>회사 정보</footer>`;
  const t = extractReadableText(html).text;
  assert.ok(!/메뉴|var a|p>b|광고|회사 정보/.test(t), t);
  assert.ok(t.indexOf("동백섬") < t.indexOf("부산시립미술관"));
});

test("parseAnalyzed: 선택·대안으로 소개된 곳은 optional 로 남기고, 표시가 없거나 false 면 평범한 장소다(2026-09-30)", () => {
  const a = parseAnalyzed(JSON.stringify({ content_kind: "external_itinerary", days: [{ day_number: 1, stops: [
    { name: "Songdo Beach", time_text: null, note: null, optional: false },
    { name: "Amnam Park", time_text: null, note: "if you still have time", optional: true },
    { name: "Busan Tower", time_text: null, note: null },
  ] }], places: [] }))!;
  assert.deepEqual(a.days[0]!.stops.map(s => s.optional ?? false), [false, true, false]);
  assert.ok(!("optional" in a.days[0]!.stops[0]!), "false 는 필드 자체를 남기지 않는다");
  assert.ok(buildAnalyzePrompt({ title: "", description: "", text: "x".repeat(100) }, null).includes("skipped, not visited"), "건너뛴 곳 규칙");
});

test("프롬프트: 이름이 있는 식당·카페에서 먹었다고 쓴 곳은 일정 장소다(2026-10-01 저녁 식당 누락 대응)", () => {
  assert.ok(buildAnalyzePrompt({ title: "", description: "", text: "x".repeat(100) }, null).includes("For dinner we went to X"));
});
