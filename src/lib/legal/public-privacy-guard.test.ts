// PUBLIC-PRIVACY-POLICY-V1 → AUTH 통합(2026-09-29) — 공개 서비스판에서 확인한 사실이 Auth 판에 남아 있는지 가드
// 실행: node --experimental-strip-types --test src/lib/legal/public-privacy-guard.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PRIVACY } from "./privacy-content.ts";
import { type LegalLocale } from "./legal-types.ts";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const LOCALES: LegalLocale[] = ["en", "ko", "ja", "zh"];
const all = (l: LegalLocale) => { const d = PRIVACY[l]; return [d.title, ...d.intro, ...d.sections.flatMap(s => [s.title, ...s.paragraphs, ...(s.items ?? [])])].join("\n"); };

test("Auth 판 — 남은 마커는 Owner 결정 항목(§1 L5 · §7 L1 · §13 L2)뿐, 4locale 조항 번호 동일", () => {
  const nos = PRIVACY.ko.sections.map(s => s.no).join(",");
  for (const l of LOCALES) {
    assert.equal(PRIVACY[l].sections.map(s => s.no).join(","), nos, `${l}: 조항 번호`);
    assert.deepEqual(PRIVACY[l].sections.filter(s => s.ownerInput).map(s => s.no), [1, 7, 13], `${l}: 마커 위치`);
  }
});

// 공개 서비스판의 '미출시 기능 서술 금지' 테스트를 Auth 판 기준으로 바꾼 것(병합 규칙 §4-5)
test("Auth 판 — 로그인·동의·계정 삭제를 서술하고, 자동 파기를 '이미 매일 도는 것'으로 단정하지 않는다", () => {
  const ko = all("ko"), en = all("en"), ja = all("ja"), zh = all("zh");
  for (const k of ["Google 로그인", "계정 영구 삭제"]) assert.ok(ko.includes(k), k);
  for (const bad of ["매일 자동으로 파기합니다", "매일 실행되는 자동 파기 작업이 데이터베이스에서 삭제"]) assert.ok(!ko.includes(bad), bad);
  assert.ok(!/destroyed automatically by a daily job|by the automatic daily job/.test(en));
  assert.ok(!/毎日の自動処理で破棄|毎日実行される自動処理がデータベースから削除/.test(ja));
  assert.ok(!/由每日自动任务销毁|由每日运行的自动任务从数据库中删除/.test(zh));
  assert.ok(ko.includes("자동 파기 작업 또는 운영자의 직접 삭제"), "활성화 전후 모두 참인 파기 방법");
  // 서비스 자체 쿠키: 로그인 동의 확인용 임시 쿠키(gkm_consent_intent, 최대 10분)
  assert.ok(ko.includes("동의를 확인하기 위한 임시 쿠키 하나뿐") && !ko.includes("서비스 자체는 쿠키를 설정하지 않습니다"));
});

// ⚠ Auth 병합 대조 항목(고정) — 아래 사실은 Auth 판 처리방침으로 교체된 뒤에도 4locale 에 남아 있어야 한다.
//   이 테스트는 Auth 병합 때 수정·삭제하지 않는다. 실패하면 Auth 판에 사실을 옮겨 적는다.
//   (네이버 지도 · Cloudflare Web Analytics · 관광 공식 사이트 이미지 · 기기 식별자 원형 저장 · 보관 문구)
test("Production 실측 사실이 4locale 에 있다 — Auth 병합 대조 항목", () => {
  for (const l of LOCALES) {
    const t = all(l);
    for (const k of ["support@gokoreamate.com", "케이이엔지", "부산시 남구 유엔로 96번길 26-31 (대연동)", "Cloudflare Web Analytics", "Resend", "Supabase Pte. Ltd.", "Google LLC", "Agoda"]) assert.ok(t.includes(k), `${l}: ${k}`);
    assert.ok(/NAVER|네이버/.test(t), `${l}: 네이버 지도`);
    assert.ok(/2 months|2개월|2か月|2 个月/.test(t) && /14 months|14개월|14か月|14 个月/.test(t), `${l}: GA 보관`);
    assert.ok(/6 months|6개월|6か月|6 个月/.test(t), `${l}: 문의·신고 6개월 보관`);
  }
  const ko = all("ko"), en = all("en");
  assert.ok(ko.includes("관광 공식 사이트에서 직접 불러오며") && en.includes("loaded directly from official tourism websites"), "외부 이미지");
  assert.ok(ko.includes("이용자가 만든 콘텐츠와 반응이 이용자의 것임을 알아보기 위해 함께 저장하며, 일부 기록에는 이 값을 변환한 값을 저장합니다"), "기기 식별자 원형 저장(일부만 변환)");
  assert.ok(en.includes("for some records we store a value converted from it instead"), "device identifier stored as-is (some converted)");
  assert.ok(!/원본 대신 일방향 해시|instead of the original .*one-way hash/.test(ko + en), "기기 식별자를 모두 해시한다고 쓰지 않는다");
  // 문의 알림 메일 내용은 Auth 코드(contact.ts — 번호·유형만)로 바뀌는 사실이라 대조 항목이 아니다: Auth 판 문장을 확인한다
  assert.ok(all("ko").includes("문의 알림 메일에는 문의 번호와 유형만 담고 이름·이메일·메시지는 담지 않으며"));
  assert.ok(all("ko").includes("서버로 보내지 않습니다"), "위치는 기기 안에서만");
});

test("접근 경로 — 홈 하단·More·문의 양식에서 /privacy, 홈·More 에서 /terms", () => {
  assert.match(read("src/app/HomeClient.tsx"), /href="\/privacy"[^>]*>\{tn\("privacy"\)\}/);
  // 개인정보처리방침 행은 독립된 <Row> 여야 한다 — 다른 행의 icon 안에 끼면 4×9px 링크가 된다(Preview 4726792e 실측 결함)
  assert.match(read("src/app/more/MoreClient.tsx"), /<\/svg>\}\s*\/>\s*<Row\s+href="\/privacy\/"\s+label=\{tNav\("privacy"\)\}/);
  assert.match(read("src/components/ContactModal.tsx"), /href="\/privacy\/"/);
  // Auth 판: 약관 페이지가 함께 출시되므로 홈·More 에 약관 링크도 있다
  assert.match(read("src/app/HomeClient.tsx"), /href="\/terms"/);
  assert.match(read("src/app/more/MoreClient.tsx"), /href="\/terms\/"/);
  for (const l of LOCALES) {
    const m = JSON.parse(read(`src/messages/${l}.json`));
    assert.ok(m.nav.privacy && m.more.privacyDesc, l);
  }
});
