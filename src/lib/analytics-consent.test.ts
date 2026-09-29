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

test("첫 방문 카드 — gaAllowed 일 때만 loadGtag·같은 무게의 [모두 거부]/[허용 선택]·나중에·연속으로 가로막지 않음", () => {
  const code = strip(read("src/components/AnalyticsConsent.tsx"));
  assert.equal((code.match(/loadGtag\(/g) ?? []).length, 2);
  assert.match(code, /if \(gaAllowed\(s\)\) loadGtag\(gaId\);/);
  assert.match(code, /if \(gaAllowed\(next\)\) loadGtag\(gaId\); else disableGtag\(gaId\);/);
  assert.match(code, /if \(hasStaleConsent\(\)\) \{ clearStaleConsent\(\); disableGtag\(gaId\); \}/, "버전 바뀌면 이전 선택 무효·쿠키 정리");
  assert.match(code, /writeConsentState\(\{ collect: false, transfer: false \}\)/, "카드의 모두 거부");
  assert.match(code, /onClick=\{\(\) => setSheet\(true\)\}/, "허용은 개별 동의 시트를 거친다(카드에서 바로 허용하지 않음)");
  assert.ok(!/writeConsentState\(\{ collect: true/.test(code), "카드에서 두 동의를 한 번에 켜는 경로 금지");
  assert.equal((code.match(/h-10 rounded-xl border border-\[#2C2520\] bg-white/g) ?? []).length, 2, "두 버튼 같은 모양");
  assert.match(code, /deferConsent\(\)/, "× = 나중에 결정");
  assert.match(code, /undecided && ready && !blocked && !onMore && !sheet/, "안내·다른 모달·더보기·시트가 있으면 카드 숨김");
  assert.match(code, /\[data-preopen-notice\], \[aria-modal=\\"true\\"\]:not\(\[data-gkm-analytics-sheet\]\)/);
  assert.match(code, /AFTER_NOTICE_MS = 12_000/, "첫 방문 안내 직후 연속 노출 금지");
});

test("동의 시트 — 두 상자(열 때 저장값, 없으면 해제)·모두 동의는 편의·고지 전문은 동의 전 '내용 보기'·한쪽만이면 꺼짐 안내", () => {
  const code = strip(read("src/components/AnalyticsConsentSheet.tsx"));
  assert.match(code, /setPick\(\{ collect: !!s\?\.collect, transfer: !!s\?\.transfer \}\)/, "저장값에서 출발·없으면 false");
  assert.match(code, /useState\(\{ collect: false, transfer: false \}\)/);
  for (const n of ["gkm-analytics-${k}", "gkm-analytics-all"]) assert.ok(code.includes(n), n);
  assert.equal((code.match(/type="checkbox"/g) ?? []).length, 2, "개별 상자 컴포넌트 1(두 번 렌더) + 모두 동의 1");
  assert.match(code, /item\("collect"\)[\s\S]{0,40}item\("transfer"\)/, "두 동의를 따로 렌더");
  assert.match(code, /setPick\(\{ collect: e\.target\.checked, transfer: e\.target\.checked \}\)/, "모두 동의 = 두 상자 체크 편의");
  assert.match(code, /collectDetails[\s\S]{0,20}transferDetails/, "고지 전문 연결");
  assert.match(code, /aria-expanded=\{shown\[k\]\}/, "내용 보기 펼침");
  assert.match(code, /both \? t\("liveBoth"\) : one \? t\("liveOne"\) : t\("liveNone"\)/, "한쪽만 선택 결과 안내");
  assert.match(code, /save\(\{ collect: false, transfer: false \}\)/, "시트의 모두 거부");
  assert.match(code, /onClick=\{\(\) => save\(pick\)\}/, "선택 저장 = 체크한 그대로(한쪽만이면 GA 꺼짐)");
  assert.match(code, /\}, \[open\]\);/, "부모 재렌더로 고르던 선택 초기화 금지");
});

test("trackEvent — production + 두 동의 모두여야 전송", () => {
  const code = strip(read("src/lib/analytics.ts"));
  const iEnv = code.indexOf('!== "production") return;');
  const iConsent = code.indexOf("if (!gaAllowed(readConsentState())) return;");
  const iSend = code.indexOf('window.gtag?.("event"');
  assert.ok(iEnv > 0 && iConsent > iEnv && iSend > iConsent);
});

test("더보기 — 상태 한 줄 + '통계 선택 변경'(같은 시트) · 4개 언어 고지 사항(제15조②·제28조의8②)", () => {
  const more = strip(read("src/app/more/MoreClient.tsx"));
  assert.match(more, /onClick=\{\(\) => setStatsSheet\(true\)\}/);
  assert.match(more, /<AnalyticsConsentSheet open=\{statsSheet\}/);
  assert.match(more, /statsLive \? "on" : !stats \? "unset" : \(stats\.collect \|\| stats\.transfer\) \? "one" : "off"/, "한쪽만 = 꺼짐(두 항목 필요) 상태");
  assert.ok(!/collectDetails|transferDetails/.test(more), "기본 화면에 고지 전문을 펼쳐 두지 않는다");
  assert.ok(!/writeConsentState/.test(more), "변경은 시트에서만");
  for (const l of ["ko", "en", "ja", "zh"]) {
    const m = JSON.parse(read(`src/messages/${l}.json`)) as Record<string, Record<string, string>>;
    const a = m.analyticsConsent;
    for (const k of ["title", "intro", "collectLabel", "collectDetails", "transferLabel", "transferDetails", "footer", "policyLink", "save", "rejectAll", "later", "statusOn", "statusOff",
      "cardTitle", "cardBody", "cardChoose", "selectAll", "showDetails", "hideDetails", "liveBoth", "liveOne", "liveNone", "statusPartial", "statusUnset"])
      assert.ok((a?.[k] ?? "").length > 1, `${l}.${k}`);
    assert.ok(!("accept" in a) && !("decline" in a), `${l}: 단일 허용 버튼 문구 잔존 금지`);
    assert.match(a.transferDetails, /Google LLC/, `${l}: 받는 자`);
    assert.match(a.transferDetails, /support\.google\.com\/policies/, `${l}: 받는 자 연락처`);
    for (const d of [a.collectDetails, a.transferDetails]) { assert.match(d, /2/); assert.match(d, /14/); }
    assert.match(a.footer, /14/, `${l}: 만 14세 안내`);
    for (const k of ["analyticsToggle", "analyticsDesc", "analyticsChange"]) assert.ok((m.more?.[k] ?? "").length > 1, `${l}.more.${k}`);
  }
});

test("처리방침 — 2단 동의·근거·철회는 그때부터(과거 전송분 즉시 삭제 약속 없음)·나이 미확인·개정 이력", () => {
  const p = read("src/lib/legal/privacy-content.ts");
  assert.ok(!/Google 의 차단 도구로 거부할 수 있으며|Google's opt-out tools, and the service still works|'허용 안 함'|Don't allow/.test(p), "옛 문장 잔존 금지");
  for (const k of ["제28조의8제1항제1호", "Article 28-8(1)(1)", "第28条の8第1項第1号", "第28条之8第1款第1项"]) assert.ok(p.includes(k), k);
  // Google 공식 안내(answer/7667196): 보관 설정은 사용자·이벤트 수준 데이터에만, 표준 집계 보고서엔 적용 안 됨, 사용자 기간은 새 활동 시 재설정
  for (const k of ["철회해도 이미 Google 로 전송된 정보가 즉시 삭제되지는 않습니다", "Withdrawing does not immediately delete information already sent to Google", "すでに Google に送信された情報が直ちに削除されるわけではありません", "撤回并不会立即删除已发送给 Google 的信息"]) assert.ok(p.includes(k), k);
  for (const k of ["표준 집계 보고서에는 적용되지 않습니다", "not to standard aggregated reports", "標準の集計レポートには適用されません", "不适用于标准汇总报告"]) assert.ok(p.includes(k), k);
  for (const k of ["사용자 데이터 보관 기간이 새로 시작됩니다", "user-data period restarts when a user is active again", "ユーザーデータの保管期間が改めて始まります", "用户数据的保存期限重新计算"]) assert.ok(p.includes(k), k);
  assert.ok(!/지나면 삭제됩니다|deleted when the retention periods below end|過ぎると削除されます|届满后删除/.test(p), "보관기간 경과=전부 삭제로 단정하는 문장 금지");
  for (const l of ["ko", "en", "ja", "zh"]) {
    const a = (JSON.parse(read(`src/messages/${l}.json`)) as Record<string, Record<string, string>>);
    for (const t of [a.analyticsConsent.footer, a.more.analyticsDesc]) assert.ok(!/지나야 삭제|deleted only after|過ぎるまで削除されません|届满后才会删除/.test(t), `${l}: 과거 데이터 삭제 단정 금지`);
    assert.match(a.analyticsConsent.footer, /표준 집계|standard aggregated|標準の集計|标准汇总/, `${l}: 집계 보고서 구분`);
  }
  for (const k of ["나이를 확인하지는 않습니다", "we do not verify age", "年齢の確認は行っていません", "不核实年龄"]) assert.ok(p.includes(k), k);
  const gaParas = p.split("\n").filter(l => /Google Analytics 4/.test(l));
  assert.equal(gaParas.length, 4);
  for (const g of gaParas) assert.ok(!/즉시 삭제됩니다|are deleted immediately|直ちに削除されます|立即删除。/.test(g), "GA 문단: 과거 데이터 즉시 삭제 약속 금지");
  assert.match(p, /PUBLIC_PRIVACY_FIRST_DATE = "2026-09-29"/);
  assert.equal((p.match(/\$\{PUBLIC_PRIVACY_FIRST_DATE\}/g) ?? []).length, 4, "4개 언어 개정 이력");
});
