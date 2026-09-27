// OWNER-OAUTH-E2E-AND-MORE-NAV-CLOSEOUT-V1 §9 — 전역 '더보기(계정 More)' 내비 계약
// 실행: node --experimental-strip-types src/lib/global-more-nav-guard.test.ts
//
// 계약: 계정 More 라벨(shell.more / nav 셸의 more 키 — 더보기·More·その他·更多)이
// 붙은 전역 내비 링크는 canonical `/more` 하나로만 간다. About(소개)은 별도
// 라벨·별도 링크로 유지되고, More 라벨이 /about 을 가리키면 실패한다.
// 광역 문자열 치환이 아니라 role(내비 셸 컴포넌트 allowlist)+href 로 검증한다.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");

/** 사용자용 전역 내비 셸 allowlist — 새 화면 헤더는 이 셸을 재사용해야 한다 */
const NAV_SHELLS = [
  "src/components/ui/TopNav.tsx",
  "src/components/ui/BottomNav.tsx",
  "src/app/HomeClient.tsx",
];

test("① 전역 내비의 More 는 canonical /more — About 연결 금지", () => {
  for (const p of NAV_SHELLS) {
    const s = strip(read(p));
    // t("more")/tShell("more") 라벨 인접 200자 안의 href 는 /more 여야 한다
    const re = /href=\{?"?([^"}\s]+)"?\}?[^>]*>\s*\{t(?:Shell)?\("more"\)\}/g;
    let m: RegExpExecArray | null; let found = 0;
    while ((m = re.exec(s))) {
      found++;
      assert.ok(m[1].startsWith("/more"), `${p}: More 라벨이 ${m[1]} 로 간다`);
    }
    // TABS 형태(BottomNav): more 키의 href 고정
    if (p.endsWith("BottomNav.tsx")) {
      assert.match(s, /key: "more",\s*href: "\/more"/);
      found++;
    }
    assert.ok(found > 0, p + ": More 내비 항목이 있어야 한다");
    // 같은 셸에서 More 라벨이 about 으로 가는 조합 금지(역방향 검사)
    assert.ok(!/href="\/about\/?"[^>]*>\s*\{t(?:Shell)?\("more"\)\}/.test(s), p + ": more 라벨→about 금지");
  }
});

test("② About(소개)은 별도 라벨로 유지 — More 허브 Row·footer 접근", () => {
  // 소개 페이지 자체 존재
  read("src/app/about/AboutClient.tsx");
  // More 허브에 '소개' Row(/about) — 라벨은 nav.about, more 아님
  const more = strip(read("src/app/more/MoreClient.tsx"));
  assert.match(more, /href="\/about\/"[\s\S]{0,120}tNav\("about"\)/);
});

test("③ 4locale — 계정 More 라벨과 About 라벨이 구분된다", () => {
  const EXPECT_MORE: Record<string, string> = { ko: "더보기", en: "More", ja: "その他", zh: "更多" };
  for (const l of ["ko", "en", "ja", "zh"]) {
    const d = JSON.parse(read(`src/messages/${l}.json`)) as { shell: Record<string, string>; nav: Record<string, string> };
    assert.equal(d.shell.more, EXPECT_MORE[l], l + " shell.more");
    assert.ok(d.nav.about && d.nav.about !== d.shell.more, l + ": about 라벨은 more 와 달라야 한다");
  }
});

test("④ 범위 가드 — auth/linking·migration 무접촉(이번 TASK)", () => {
  // 이 가드 파일이 도입된 커밋의 계약: nav 수정은 셸 컴포넌트에 한정된다.
  // migration 수는 079 까지 그대로(스냅숏 digest 는 3파일 가드가 고정).
  const files = readdirSync(join(ROOT, "supabase/migrations")).filter(f => f.endsWith(".sql"));
  assert.equal(files.length, 79);
  assert.match(read("src/lib/legal/privacy-content.ts"), /effectiveDate: null/);
});
