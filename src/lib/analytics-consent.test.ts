// GA-CONSENT-V1 — 사용 통계 선택 동의 계약 가드
// 실행: node --experimental-strip-types --test src/lib/analytics-consent.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseConsent, gaCookieNames, cookieDomains, GA_ID_RE } from "./analytics-consent.ts";

const ROOT = join(import.meta.dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

test("선택 값 — granted/denied 외에는 '선택 없음'", () => {
  assert.equal(parseConsent("granted"), "granted");
  assert.equal(parseConsent("denied"), "denied");
  for (const v of [null, undefined, "", "true", "GRANTED", "yes"]) assert.equal(parseConsent(v as string), null);
});

test("철회 — _ga·_ga_<스트림> 쿠키만 골라 호스트·상위 도메인에서 지운다", () => {
  assert.deepEqual(gaCookieNames("_ga=GA1.1.1; _ga_C0NG56EH5Q=GS1; gkm=1; _gat=1; x_ga=2"), ["_ga", "_ga_C0NG56EH5Q"]);
  assert.deepEqual(cookieDomains("www.gokoreamate.com"), ["", ".www.gokoreamate.com", ".gokoreamate.com"]);
  assert.deepEqual(cookieDomains("localhost"), [""]);
  assert.ok(GA_ID_RE.test("G-C0NG56EH5Q"));
  assert.ok(!GA_ID_RE.test("G-X');alert(1)//"), "ID 형식 밖 값은 스크립트 URL 에 넣지 않는다");
});

test("layout — gtag 를 무조건 싣지 않는다(동의 컴포넌트만)", () => {
  const code = strip(read("src/app/layout.tsx"));
  assert.ok(!/googletagmanager|ga4-init|gtag\(/.test(code), "layout 에 gtag 직접 적재 금지");
  assert.match(code, /gaConsentId \? <AnalyticsConsent gaId=\{gaConsentId\} \/> : null/);
  assert.match(code, /const gaConsentId = ga4Valid \? ga4Id : null/);
});

test("배너 — 'granted' 일 때만 loadGtag, 선택 없음이면 배너만", () => {
  const code = strip(read("src/components/AnalyticsConsent.tsx"));
  assert.match(code, /if \(c === "granted"\) loadGtag\(gaId\);\s*else if \(c === null\) setOpen\(true\);/);
  assert.match(code, /if \(c === "granted"\) loadGtag\(gaId\); else if \(c === "denied"\) disableGtag\(gaId\);/);
  assert.equal((code.match(/loadGtag\(/g) ?? []).length, 2, "loadGtag 호출은 위 두 곳뿐");
  // 거부 버튼이 허용 버튼과 같은 격자·같은 높이(숨기거나 작게 만들지 않는다)
  assert.match(code, /grid grid-cols-2/);
  assert.equal((code.match(/h-11 rounded-xl/g) ?? []).length, 2);
});

test("trackEvent — production + 동의 둘 다여야 전송", () => {
  const code = strip(read("src/lib/analytics.ts"));
  const iEnv = code.indexOf('!== "production") return;');
  const iConsent = code.indexOf('readConsent() !== "granted") return;');
  const iSend = code.indexOf('window.gtag?.("event"');
  assert.ok(iEnv > 0 && iConsent > iEnv && iSend > iConsent);
});

test("철회 경로 — 더보기 스위치 + 4개 언어 문구(법 제28조의8② 사항 포함)", () => {
  const more = strip(read("src/app/more/MoreClient.tsx"));
  assert.match(more, /writeConsent\(statsOn \? "denied" : "granted"\)/);
  assert.match(more, /role="switch"[\s\S]{0,80}aria-checked=\{statsOn\}/);
  for (const l of ["ko", "en", "ja", "zh"]) {
    const m = JSON.parse(read(`src/messages/${l}.json`)) as Record<string, Record<string, string>>;
    const a = m.analyticsConsent;
    for (const k of ["title", "body", "details", "refuse", "policyLink", "accept", "decline"]) assert.ok((a?.[k] ?? "").length > 1, `${l}.${k}`);
    assert.match(a.details, /Google LLC/, `${l}: 받는 자`);
    assert.match(a.details, /2|２/, `${l}: 보유기간`);
    assert.match(a.details, /14/, `${l}: 보유기간`);
    for (const k of ["analyticsToggle", "analyticsDesc"]) assert.ok((m.more?.[k] ?? "").length > 1, `${l}.more.${k}`);
  }
});

test("처리방침 — GA 는 허용한 경우에만·근거(제15조①1호·제28조의8①1호)·철회 경로", () => {
  const p = read("src/lib/legal/privacy-content.ts");
  assert.ok(!/Google 의 차단 도구로 거부할 수 있으며|Google's opt-out tools, and the service still works/.test(p), "쿠키 차단 안내만으로 거부를 설명하던 옛 문장 잔존 금지");
  for (const k of ["제28조의8제1항제1호", "Article 28-8(1)(1)", "第28条の8第1項第1号", "第28条之8第1款第1项"]) assert.ok(p.includes(k), k);
  for (const k of ["더보기 › 사용 통계", "More › Usage statistics", "その他 › 利用統計", "更多 › 使用统计"]) assert.ok(p.includes(k), k);
});
