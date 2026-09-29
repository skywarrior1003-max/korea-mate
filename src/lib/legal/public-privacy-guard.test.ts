// PUBLIC-PRIVACY-POLICY-V1 — 현재 공개 서비스판 개인정보처리방침 가드
// 실행: node --experimental-strip-types --test src/lib/legal/public-privacy-guard.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PRIVACY, PUBLIC_PRIVACY_EFFECTIVE_DATE } from "./privacy-content.ts";
import { hasOwnerInput, type LegalLocale } from "./legal-types.ts";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const LOCALES: LegalLocale[] = ["en", "ko", "ja", "zh"];
const all = (l: LegalLocale) => { const d = PRIVACY[l]; return [d.title, ...d.intro, ...d.sections.flatMap(s => [s.title, ...s.paragraphs, ...(s.items ?? [])])].join("\n"); };

test("게시 가능 상태 — 내부 마커·DRAFT 없음, 시행일 있음, 4locale 조항 번호 동일", () => {
  assert.match(PUBLIC_PRIVACY_EFFECTIVE_DATE, /^\d{4}-\d{2}-\d{2}$/);
  const nos = PRIVACY.ko.sections.map(s => s.no).join(",");
  for (const l of LOCALES) {
    assert.equal(hasOwnerInput(PRIVACY[l]), false, `${l}: DRAFT`);
    assert.equal(PRIVACY[l].sections.map(s => s.no).join(","), nos, `${l}: 조항 번호`);
    assert.ok(!/확인 필요|OWNER INPUT|TBD|TODO|\[.*확인.*\]/i.test(all(l)), `${l}: 내부 문구`);
  }
});

test("미출시 기능을 제공한다고 쓰지 않는다(로그인·계정 삭제·동의·자동 파기)", () => {
  const ko = all("ko"), en = all("en");
  for (const bad of ["Google 로그인", "계정 영구 삭제", "만 14세", "매일 자동으로 파기", "동의 기록"]) assert.ok(!ko.includes(bad), bad);
  for (const bad of ["Google sign-in", "delete your account", "aged 14", "daily job"]) assert.ok(!en.includes(bad), bad);
  assert.ok(ko.includes("현재 서비스에는 로그인·계정 기능이 없으며"));
});

test("Production 실측 사실이 4locale 에 있다", () => {
  for (const l of LOCALES) {
    const t = all(l);
    for (const k of ["support@gokoreamate.com", "케이이엔지", "부산시 남구 유엔로 96번길 26-31 (대연동)", "Cloudflare Web Analytics", "Resend", "Supabase Pte. Ltd.", "Google LLC", "Agoda"]) assert.ok(t.includes(k), `${l}: ${k}`);
    assert.ok(/NAVER|네이버/.test(t), `${l}: 네이버 지도`);
    assert.ok(/2 months|2개월|2か月|2 个月/.test(t) && /14 months|14개월|14か月|14 个月/.test(t), `${l}: GA 보관`);
  }
  assert.ok(all("ko").includes("현재 문의 알림 메일에는 이용자가 입력한 이름·이메일·메시지가 담깁니다"));
  assert.ok(all("ko").includes("서버로 보내지 않습니다"), "위치는 기기 안에서만");
});

test("접근 경로 — 홈 하단·More·문의 양식에서 /privacy, 존재하지 않는 /terms 링크 없음", () => {
  assert.match(read("src/app/HomeClient.tsx"), /href="\/privacy"[^>]*>\{tn\("privacy"\)\}/);
  // 개인정보처리방침 행은 독립된 <Row> 여야 한다 — 다른 행의 icon 안에 끼면 4×9px 링크가 된다(Preview 4726792e 실측 결함)
  assert.match(read("src/app/more/MoreClient.tsx"), /<\/svg>\}\s*\/>\s*<Row\s+href="\/privacy\/"\s+label=\{tNav\("privacy"\)\}/);
  assert.match(read("src/components/ContactModal.tsx"), /href="\/privacy\/"/);
  for (const f of ["src/app/HomeClient.tsx", "src/app/more/MoreClient.tsx", "src/components/ContactModal.tsx"]) assert.ok(!/href="\/terms/.test(read(f)), f);
  for (const l of LOCALES) {
    const m = JSON.parse(read(`src/messages/${l}.json`));
    assert.ok(m.nav.privacy && m.more.privacyDesc, l);
  }
});
