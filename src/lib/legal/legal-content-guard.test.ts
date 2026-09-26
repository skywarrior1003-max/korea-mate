// PRIVACY-TERMS-V1 — 정책 문서와 실제 구현의 동기 가드
// 실행: node --experimental-strip-types src/lib/legal/legal-content-guard.test.ts
//
// 목적: 정책이 코드 현실에서 조용히 어긋나는 회귀를 잡는다.
//  · 4locale 조항 번호·수 동일(법적 의미 동기)
//  · 제휴 파트너 서술 = 실제 활성 4사만(거절 파트너 미기재)
//  · AI "현재 비활성" 서술 유지 — live 전환 릴리스가 이 테스트를 깨고
//    정책 갱신을 강제하게 한다(§: 출시 전 방침 갱신 계약)
//  · ownerInput 잔존 시 DRAFT 배너 강제(렌더러 배선)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { PRIVACY } from "./privacy-content.ts";
import { TERMS } from "./terms-content.ts";
import { hasOwnerInput } from "./legal-types.ts";
import type { LegalDocSet } from "./legal-types.ts";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");
const LOCALES = ["en", "ko", "ja", "zh"] as const;

function sectionNos(set: LegalDocSet, l: (typeof LOCALES)[number]): number[] {
  return set[l].sections.map(s => s.no);
}

test("4locale — 조항 번호·개수 동일 (privacy 16·terms 15)", () => {
  for (const l of LOCALES) {
    assert.deepEqual(sectionNos(PRIVACY, l), Array.from({ length: 16 }, (_, i) => i + 1), `privacy ${l}`);
    assert.deepEqual(sectionNos(TERMS, l), Array.from({ length: 15 }, (_, i) => i + 1), `terms ${l}`);
    // 언어별 본문 누락 금지 — ownerInput 없는 조항은 반드시 내용이 있다
    for (const s of [...PRIVACY[l].sections, ...TERMS[l].sections]) {
      if (!s.ownerInput) {
        assert.ok(s.paragraphs.length > 0 || (s.items?.length ?? 0) > 0, `${l} 조항 ${s.no} 본문 누락`);
      }
    }
  }
});

test("제휴 서술 — 활성 4사만, 거절 파트너 미기재", () => {
  for (const l of LOCALES) {
    const all = JSON.stringify(PRIVACY[l]) + JSON.stringify(TERMS[l]);
    for (const p of ["Agoda", "Trip.com", "Klook", "KKday"]) {
      assert.ok(all.includes(p), `${l}: 활성 파트너 ${p} 누락`);
    }
    for (const p of ["Booking.com", "Airalo", "Viator"]) {
      assert.ok(!all.includes(p), `${l}: 미제휴 파트너 ${p} 기재 금지`);
    }
  }
});

test("AI 서술 — '현재 비활성' 유지 (live 전환 시 이 테스트가 정책 갱신을 강제)", () => {
  // 코드 현실: Production AI_MODE=off + DB 스위치 전부 off (2026-09-25 릴리스).
  // 이 서술 검사는 en 기준 핵심 문구로 고정한다 — live 전환 TASK 는 정책을
  // 갱신하면서 이 기대값도 의도적으로 바꿔야 한다.
  assert.ok(JSON.stringify(PRIVACY.en).includes("currently disabled in production"), "privacy en AI 비활성 서술");
  assert.ok(JSON.stringify(TERMS.en).includes("when available"), "terms en AI 조건부 서술");
});

test("허위 표현 금지 — Google 비밀번호 수집·저장 긍정문 없음", () => {
  for (const l of LOCALES) {
    for (const s of PRIVACY[l].sections) {
      const txt = [...s.paragraphs, ...(s.items ?? [])].join(" ");
      // 비밀번호 언급은 전부 '받지/저장하지 않는다' 부정문 안에서만 등장한다
      if (/password|비밀번호|パスワード|密码/.test(txt)) {
        assert.ok(/never|않습니다|ありません|しません|不会/.test(txt), `${l} 조항 ${s.no}: 비밀번호 언급이 부정문이 아님`);
      }
    }
  }
});

test("DRAFT 계약 — ownerInput 잔존 = DRAFT, 렌더러가 배너 강제", () => {
  // 현 시점: Owner 미확정 항목이 남아 있으므로 두 문서 모두 DRAFT 여야 한다.
  // (Owner 확정 반영 커밋에서 이 기대값을 함께 바꾼다 — 그 전에 사라지면 회귀)
  for (const l of LOCALES) {
    assert.equal(hasOwnerInput(PRIVACY[l]), true, `privacy ${l} 는 아직 DRAFT`);
    assert.equal(hasOwnerInput(TERMS[l]), true, `terms ${l} 는 아직 DRAFT`);
  }
  const renderer = read("src/components/legal/LegalDocument.tsx");
  assert.ok(renderer.includes("hasOwnerInput"), "렌더러가 DRAFT 판정을 사용");
  assert.ok(renderer.includes("DRAFT — NOT FOR PRODUCTION"), "요구 배너 문구");
});

test("페이지·링크 배선 — canonical·footer·More", () => {
  const priv = read("src/app/privacy/page.tsx");
  const terms = read("src/app/terms/page.tsx");
  assert.ok(priv.includes('"https://gokoreamate.com/privacy/"'), "privacy canonical");
  assert.ok(terms.includes('"https://gokoreamate.com/terms/"'), "terms canonical");
  // 정책 페이지에 인증 요구 0
  for (const f of [priv, terms, read("src/components/legal/LegalDocument.tsx")]) {
    assert.ok(!f.includes("requireUser") && !f.includes("getCurrentUser"), "정책 페이지 인증 게이트 금지");
  }
  const home = read("src/app/HomeClient.tsx");
  assert.ok(home.includes('href="/privacy"') && home.includes('href="/terms"'), "홈 푸터 링크");
  const more = read("src/app/more/MoreClient.tsx");
  assert.ok(more.includes('href="/privacy/"') && more.includes('href="/terms/"'), "More 링크");
  // nav·more 라벨 4locale
  for (const l of LOCALES) {
    const m = JSON.parse(read(`src/messages/${l}.json`)) as Record<string, Record<string, string>>;
    for (const k of ["privacy", "terms"]) assert.ok(m.nav?.[k], `${l}.nav.${k}`);
    for (const k of ["privacyDesc", "termsDesc"]) assert.ok(m.more?.[k], `${l}.more.${k}`);
  }
});
