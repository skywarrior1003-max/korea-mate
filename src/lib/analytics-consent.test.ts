// GA-CONSENT-V1 — 사용 통계 선택 동의 계약 가드(수집·이용 / 국외 이전 2단 동의)
// 실행: node --experimental-strip-types --test src/lib/analytics-consent.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseConsentState, gaAllowed, gaCookieNames, cookieDomains, GA_ID_RE, GA_HOST_RE, ANALYTICS_CONSENT_VERSION,
} from "./analytics-consent.ts";

const ROOT = join(import.meta.dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
const st = (collect: boolean, transfer: boolean, v = ANALYTICS_CONSENT_VERSION) => JSON.stringify({ v, collect, transfer, at: "2026-09-30T00:00:00Z" });

test("두 동의가 모두 있어야 GA — 한쪽만·없음·버전 불일치·손상은 수집 0", () => {
  assert.equal(gaAllowed(parseConsentState(st(true, true))), true);
  assert.equal(gaAllowed(parseConsentState(st(true, false))), false, "수집·이용만");
  assert.equal(gaAllowed(parseConsentState(st(false, true))), false, "국외 이전만");
  assert.equal(gaAllowed(parseConsentState(st(false, false))), false);
  assert.equal(parseConsentState(st(true, true, "ga-2026-01-01")), null, "이전 버전 선택은 무효 — 다시 묻는다");
  for (const raw of [null, "", "granted", "{", JSON.stringify({ v: ANALYTICS_CONSENT_VERSION, collect: "true", transfer: true })])
    assert.equal(gaAllowed(parseConsentState(raw)), false, String(raw));
});

test("철회 — _ga·_ga_<스트림> 쿠키만 골라 호스트·상위 도메인에서 지운다", () => {
  assert.deepEqual(gaCookieNames("_ga=GA1.1.1; _ga_C0NG56EH5Q=GS1; gkm=1; _gat=1; x_ga=2"), ["_ga", "_ga_C0NG56EH5Q"]);
  assert.deepEqual(cookieDomains("www.gokoreamate.com"), ["", ".www.gokoreamate.com", ".gokoreamate.com"]);
  assert.deepEqual(cookieDomains("localhost"), [""]);
  assert.ok(GA_ID_RE.test("G-C0NG56EH5Q"));
  assert.ok(!GA_ID_RE.test("G-X');alert(1)//"), "ID 형식 밖 값은 스크립트 URL 에 넣지 않는다");
});

test("철회 — 이미 줄에 선 hit 도 못 나가게 GA 호스트 전송을 막는다(다른 호스트는 통과)", () => {
  for (const h of ["www.google-analytics.com", "region1.google-analytics.com", "analytics.google.com"]) assert.ok(GA_HOST_RE.test(h), h);
  for (const h of ["gokoreamate.com", "google-analytics.com.evil.test", "oapi.map.naver.com", "supabase.co"]) assert.ok(!GA_HOST_RE.test(h), h);
  const code = strip(read("src/lib/analytics-consent.ts"));
  assert.match(code, /export function disableGtag[\s\S]{0,200}blockGaTransport\(true\)/);
  assert.match(code, /export function loadGtag[\s\S]{0,200}blockGaTransport\(false\)/);
  for (const k of ["navigator.sendBeacon =", "window.fetch =", "XMLHttpRequest.prototype.open =", "HTMLImageElement.prototype, \"src\""]) assert.ok(code.includes(k), k);
});

test("layout — gtag 를 무조건 싣지 않는다(동의 컴포넌트만)", () => {
  const code = strip(read("src/app/layout.tsx"));
  assert.ok(!/googletagmanager|ga4-init|gtag\(/.test(code), "layout 에 gtag 직접 적재 금지");
  assert.match(code, /gaConsentId \? <AnalyticsConsent gaId=\{gaConsentId\} \/> : null/);
  assert.match(code, /const gaConsentId = ga4Valid \? ga4Id : null/);
});

test("배너 — 두 체크 상자(기본 해제)·gaAllowed 일 때만 loadGtag·모달 뒤에 뜸·나중에", () => {
  const code = strip(read("src/components/AnalyticsConsent.tsx"));
  assert.match(code, /useState\(false\);\s*const \[transfer, setTransfer\] = useState\(false\)/, "두 동의 기본값 false");
  assert.equal((code.match(/type="checkbox"/g) ?? []).length, 2, "동의 상자 2개(한 버튼으로 묶지 않음)");
  assert.equal((code.match(/loadGtag\(/g) ?? []).length, 2);
  assert.match(code, /if \(gaAllowed\(s\)\) loadGtag\(gaId\);/);
  assert.match(code, /if \(gaAllowed\(next\)\) loadGtag\(gaId\); else disableGtag\(gaId\);/);
  assert.match(code, /writeConsentState\(\{ collect: false, transfer: false \}\)/, "모두 거부");
  assert.match(code, /writeConsentState\(\{ collect, transfer \}\)/, "선택 저장");
  assert.match(code, /if \(!open \|\| noticeOpen\) return null;/, "첫 방문 안내 모달이 떠 있으면 그리지 않는다");
  assert.match(code, /deferConsent\(\)/);
  assert.match(code, /if \(hasStaleConsent\(\)\) \{ clearStaleConsent\(\); disableGtag\(gaId\); \}/, "버전 바뀌면 이전 선택 무효·쿠키 정리");
  assert.equal((code.match(/h-11 rounded-xl border border-\[#2C2520\] bg-white/g) ?? []).length, 2, "두 버튼 같은 모양");
});

test("trackEvent — production + 두 동의 모두여야 전송", () => {
  const code = strip(read("src/lib/analytics.ts"));
  const iEnv = code.indexOf('!== "production") return;');
  const iConsent = code.indexOf("if (!gaAllowed(readConsentState())) return;");
  const iSend = code.indexOf('window.gtag?.("event"');
  assert.ok(iEnv > 0 && iConsent > iEnv && iSend > iConsent);
});

test("더보기 — 두 동의를 따로 켜고 끈다 + 4개 언어 고지 사항(제15조②·제28조의8②)", () => {
  const more = strip(read("src/app/more/MoreClient.tsx"));
  assert.match(more, /writeConsentState\(\{ \.\.\.stats, \[k\]: !stats\[k\] \}\)/);
  assert.match(more, /\(\["collect", "transfer"\] as const\)\.map/);
  assert.match(more, /role="switch"[\s\S]{0,60}aria-checked=\{stats\[k\]\}/);
  for (const l of ["ko", "en", "ja", "zh"]) {
    const m = JSON.parse(read(`src/messages/${l}.json`)) as Record<string, Record<string, string>>;
    const a = m.analyticsConsent;
    for (const k of ["title", "intro", "collectLabel", "collectDetails", "transferLabel", "transferDetails", "footer", "policyLink", "save", "rejectAll", "later", "statusOn", "statusOff"])
      assert.ok((a?.[k] ?? "").length > 1, `${l}.${k}`);
    assert.ok(!("accept" in a) && !("decline" in a), `${l}: 단일 허용 버튼 문구 잔존 금지`);
    assert.match(a.transferDetails, /Google LLC/, `${l}: 받는 자`);
    assert.match(a.transferDetails, /support\.google\.com\/policies/, `${l}: 받는 자 연락처`);
    for (const d of [a.collectDetails, a.transferDetails]) { assert.match(d, /2/); assert.match(d, /14/); }
    assert.match(a.footer, /14/, `${l}: 만 14세 안내`);
    for (const k of ["analyticsToggle", "analyticsDesc"]) assert.ok((m.more?.[k] ?? "").length > 1, `${l}.more.${k}`);
  }
});

test("처리방침 — 2단 동의·근거·철회는 그때부터(과거 전송분 즉시 삭제 약속 없음)·나이 미확인·개정 이력", () => {
  const p = read("src/lib/legal/privacy-content.ts");
  assert.ok(!/Google 의 차단 도구로 거부할 수 있으며|Google's opt-out tools, and the service still works|'허용 안 함'|Don't allow/.test(p), "옛 문장 잔존 금지");
  for (const k of ["제28조의8제1항제1호", "Article 28-8(1)(1)", "第28条の8第1項第1号", "第28条之8第1款第1项"]) assert.ok(p.includes(k), k);
  for (const k of ["철회로 즉시 삭제되지 않고", "not deleted immediately by withdrawing", "直ちに削除されず", "不会因撤回而立即删除"]) assert.ok(p.includes(k), k);
  for (const k of ["나이를 확인하지는 않습니다", "we do not verify age", "年齢の確認は行っていません", "不核实年龄"]) assert.ok(p.includes(k), k);
  const gaParas = p.split("\n").filter(l => /Google Analytics 4/.test(l));
  assert.equal(gaParas.length, 4);
  for (const g of gaParas) assert.ok(!/즉시 삭제됩니다|are deleted immediately|直ちに削除されます|立即删除。/.test(g), "GA 문단: 과거 데이터 즉시 삭제 약속 금지");
  assert.match(p, /PUBLIC_PRIVACY_FIRST_DATE = "2026-09-29"/);
  assert.equal((p.match(/\$\{PUBLIC_PRIVACY_FIRST_DATE\}/g) ?? []).length, 4, "4개 언어 개정 이력");
});
