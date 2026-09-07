// External URL Import 코어 가드 (EXTERNAL-URL-IMPORT-ENGINE-V1)
import test from "node:test";
import assert from "node:assert/strict";
import {
  validateImportUrl, isOwnHost, extractReadableText, parseAnalyzed,
  buildAnalyzePrompt, normalizePlaceName, isMatchableName,
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
