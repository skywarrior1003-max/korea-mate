// 모바일 IA 계약 고정 — BottomNav 5탭 + Picks 3탭.
//
// 이 구조는 이미 운영에 올라가 있다. 이 테스트는 새로 만드는 게 아니라
// "조용히 무너지지 않게" 못 박는 것이다. 여기 있는 항목은 전부 타입체크도
// 빌드도 잡아주지 않는 종류다 — 탭 순서, redirect 목적지, 어느 탭이 주
// CTA 를 갖는지.
//
// 특히 세 자산의 저장소 분리를 지킨다.
//   Selected  localStorage cart      · AI 일정 생성 입력
//   Saved     localStorage favorites · 하트 저장
//   My Places 서버 user_spots        · 사용자 등록 장소
// 하나로 합치면 "저장했는데 일정에 안 들어갔다" 또는 그 반대가 된다.

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8");

/** 블록 주석을 먼저 떼고 줄 주석을 뗀다 — 순서가 바뀌면 파일 본문을 삼킨다 */
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "")
   .split("\n").filter(l => !l.trimStart().startsWith("//")).join("\n");

const NAV    = read("src", "components", "ui", "BottomNav.tsx");
const SHELL  = read("src", "components", "ui", "NavShell.tsx");
const LAYOUT = read("src", "app", "layout.tsx");
const PICKS  = read("src", "app", "picks", "PicksClient.tsx");
const REDIR  = read("public", "_redirects");

// ── BottomNav ────────────────────────────────────────────────────────────────
test("★BottomNav 는 Home·Explore·Picks·Trips·More 5개를 이 순서로 갖는다", () => {
  const tabs = [...strip(NAV).matchAll(/\{\s*key:\s*"(\w+)",\s*href:\s*"([^"]+)"/g)]
    .map(m => [m[1], m[2]]);
  assert.deepEqual(tabs, [
    ["home",    "/"],
    ["explore", "/explore/busan"],
    ["picks",   "/picks"],
    ["trips",   "/my-trips"],
    // More 는 /more 정보 허브다. 예전엔 /about 글로 바로 떨어져서 Blog·
    // Survival Guide 가 좁은 화면에서 갈 곳이 없었다. /about 자체는 그대로 있고
    // /more 에서 연결한다.
    ["more",    "/more"],
  ]);
});

test("★5개 탭 라벨이 4개 언어 shell 네임스페이스에 모두 있다", () => {
  for (const locale of ["en", "ko", "ja", "zh"]) {
    const shell = JSON.parse(read("src", "messages", `${locale}.json`)).shell;
    for (const k of ["home", "explore", "picks", "trips", "more"]) {
      assert.equal(typeof shell?.[k], "string", `${locale}.shell.${k}`);
      assert.ok(shell[k].trim().length > 0, `${locale}.shell.${k} 가 빈 값`);
    }
  }
});

test("★현재 위치를 aria-current 로 알린다 — 색만으로 알리지 않는다", () => {
  assert.match(NAV, /aria-current=\{active \? "page" : undefined\}/);
  assert.match(NAV, /aria-label="Primary"/);
});

test("★아이콘과 텍스트를 함께 준다 — 아이콘만 두지 않는다", () => {
  assert.match(NAV, /\{t\(tab\.key\)\}/);          // 라벨 텍스트
  assert.match(NAV, /<svg[\s\S]*?aria-hidden/);    // 아이콘은 보조
});

test("★모바일 전용이다 — 데스크톱 내비 구조를 건드리지 않는다", () => {
  assert.match(NAV, /md:hidden/);
});

test("★safe-area 를 처리하고 콘텐츠가 내비에 가리지 않게 스페이서를 둔다", () => {
  assert.match(NAV, /env\(safe-area-inset-bottom\)/);
  assert.match(SHELL, /h-16 md:hidden/);
});

test("★BottomNav 배지는 Selected 개수다 — Saved 개수가 아니다", () => {
  assert.match(NAV, /selectedCount/);
  assert.doesNotMatch(strip(NAV), /favorit|saved/i);
  assert.match(SHELL, /getCart\(\)\.length/);
});

test("★BottomNav 에 중앙 Build FAB 를 넣지 않는다", () => {
  const s = strip(NAV);
  assert.doesNotMatch(s, /rounded-full[^"]*w-1[24]/);   // 큰 원형 버튼
  assert.doesNotMatch(s, /#planner/);
  assert.doesNotMatch(s, /<button/);                    // 5개 전부 Link
});

test("★NavShell 이 전역으로 붙어 있고 관리자 화면에서는 빠진다", () => {
  assert.match(LAYOUT, /<NavShell \/>/);
  assert.match(SHELL, /pathname\.startsWith\("\/korea-mate-admin"\)\) return null/);
});

// ── route 계약 ───────────────────────────────────────────────────────────────
test("★BottomNav 목적지 route 가 실제로 존재한다", () => {
  for (const p of [["src","app","page.tsx"], ["src","app","explore","[city]","page.tsx"],
                   ["src","app","picks","page.tsx"], ["src","app","my-trips","page.tsx"],
                   ["src","app","about","page.tsx"]]) {
    assert.ok(existsSync(join(ROOT, ...p)), p.join("/"));
  }
});

test("★신규 /trip route 를 만들지 않았다", () => {
  assert.ok(!existsSync(join(ROOT, "src", "app", "trip")));
  const dirs = readdirSync(join(ROOT, "src", "app"), { withFileTypes: true })
    .filter(d => d.isDirectory()).map(d => d.name);
  assert.ok(!dirs.includes("trip"), dirs.join(","));
});

test("★/saved 는 별도 화면이 아니라 Picks 로 넘긴다 — 북마크를 깨지 않는다", () => {
  assert.ok(!existsSync(join(ROOT, "src", "app", "saved")));
  assert.match(REDIR, /^\/saved\/\s+\/picks\/\?tab=saved\s+308$/m);
  assert.match(REDIR, /^\/saved\s+\/picks\/\?tab=saved\s+308$/m);
});

test("★/saved 가 보내는 탭 이름이 Picks 의 실제 탭 값이다", () => {
  const target = REDIR.match(/\/saved\s+\/picks\/\?tab=(\w+)/)?.[1];
  assert.ok(target, "_redirects 에서 탭 이름을 못 읽었다");
  const tabs = PICKS.match(/const TABS: Tab\[\] = \[([^\]]+)\]/)?.[1] ?? "";
  assert.ok(tabs.includes(`"${target}"`), `${target} 이 TABS 에 없다: ${tabs}`);
});

test("★모르는 ?tab= 값은 기본 탭으로 떨어진다 — 빈 화면을 만들지 않는다", () => {
  assert.match(PICKS, /function tabFromParam/);
  assert.match(PICKS, /TABS as string\[\]\)\.includes/);
  assert.match(PICKS, /: "selected"/);
  assert.match(PICKS, /tabFromParam\(searchParams\.get\("tab"\)\)/);
});

// ── Picks 3탭 ────────────────────────────────────────────────────────────────
test("★Picks 는 Selected·Saved·My Places 3탭이고 순서가 고정이다", () => {
  assert.match(PICKS, /const TABS: Tab\[\] = \["selected", "saved", "mine"\]/);
  assert.match(PICKS, /type Tab = "selected" \| "saved" \| "mine"/);
});

test("★탭 3개가 WAI-ARIA tabs 계약을 지킨다", () => {
  assert.match(PICKS, /role="tablist"/);
  assert.match(PICKS, /role="tab"/);
  assert.match(PICKS, /role="tabpanel"/);
  assert.match(PICKS, /aria-selected=\{tab === k\}/);
  assert.match(PICKS, /aria-controls=\{panelId\(k\)\}/);
  assert.match(PICKS, /ArrowRight/);
  assert.match(PICKS, /ArrowLeft/);
});

test("★세 자산의 저장소가 분리돼 있다 — 합치지 않는다", () => {
  assert.match(PICKS, /getCart|CART_EVENT/);                 // Selected
  assert.match(PICKS, /getFavorites|FAVORITES_EVENT/);       // Saved
  assert.match(PICKS, /apiGetUserSpots/);                    // My Places
  // 서로 다른 state 세 개로 유지되는지
  for (const s of [/setSelected\(getCityCart\(tripCity\)\)/, /setSaved\(/, /setMine\(/]) {
    assert.match(PICKS, s, String(s));
  }
});

test("★Selected 는 개수 표시·개별 제거·전체 삭제를 모두 갖는다", () => {
  assert.match(PICKS, /t\("selectedCount", \{ count: selected\.length \}\)/);
  assert.match(PICKS, /removeFromCart\(key\)/);
  assert.match(PICKS, /clearCart\(\)/);
});

test("★세 탭 모두 빈 상태 문구가 있다", () => {
  for (const k of ["selectedEmpty", "savedEmpty", "mineEmpty"]) {
    assert.match(PICKS, new RegExp(`t\\("${k}"\\)`), k);
  }
});

test("★My Places 는 user_spots 서버 API 만 쓴다 — 새 DB 구조를 만들지 않는다", () => {
  for (const fn of ["apiGetUserSpots", "apiCreateUserSpot", "apiUpdateUserSpot", "apiDeleteUserSpot"]) {
    assert.match(PICKS, new RegExp(`\\b${fn}\\b`), fn);
  }
  assert.doesNotMatch(strip(PICKS), /\.from\(["']/, "브라우저에서 DB 직접 접근");
  assert.doesNotMatch(strip(PICKS), /rest\/v1\//,  "REST 직접 호출");
});

test("★Saved·My Places 에서 Selected 로 담는 기존 경로가 살아 있다", () => {
  assert.match(PICKS, /addToSelected\(e, "saved"\)/);
  assert.match(PICKS, /addToSelected\(ev, "mine"\)/);
  assert.match(PICKS, /addPlaceToThisTrip\(item, tripCity\)/);
});

// ── 주 CTA 는 Selected 하나뿐 ────────────────────────────────────────────────
test("★Build CTA 는 Selected 탭에만 있고 여기서 바로 일정으로 간다", () => {
  // 예전에는 Home 플래너("/#planner")를 거쳐야 했다. 이제 This Trip 이 일정
  // 생성의 시작점이라 그 우회가 없다 — 지키는 것은 그때와 같다. **주 CTA 가
  // 하나이고, 새 route 로 새지 않는다.**
  assert.doesNotMatch(PICKS, /#planner/, "Home 플래너 우회가 남았다");
  assert.equal((PICKS.match(/handleBuild\(\)/g) ?? []).length, 1);
  // 주소는 공용 builder 하나로만 만든다
  assert.equal((PICKS.match(/buildItineraryGenerationUrl\(/g) ?? []).length, 1);
  assert.doesNotMatch(strip(PICKS), /router\.push\(`\/itinerary\?/, "주소를 따로 조립한다");
  // 신규 route 로 새지 않는다
  assert.doesNotMatch(strip(PICKS), /router\.push\("\/trip/);
});

test("★Saved 패널에 Build CTA 가 없다", () => {
  const s = PICKS.indexOf('id={panelId("saved")}');
  const e = PICKS.indexOf('id={panelId("mine")}');
  assert.ok(s > 0 && e > s);
  const saved = PICKS.slice(s, e);
  assert.doesNotMatch(saved, /handleBuild/);
  assert.doesNotMatch(saved, /t\("build"\)/);
});

// ── CartDrawer ───────────────────────────────────────────────────────────────
test("★전역 CartDrawer 가 다시 붙지 않는다 — Picks 와 진입점이 겹친다", () => {
  assert.doesNotMatch(LAYOUT, /CartDrawer/);
  assert.doesNotMatch(SHELL,  /CartDrawer/);
  // 어디에서도 import 하지 않는다(파일 자체는 남겨 둔다 — 이번 작업 범위 밖)
  const walk = (dir: string, out: string[] = []): string[] => {
    for (const d of readdirSync(dir, { withFileTypes: true })) {
      if (d.name === "node_modules") continue;
      const p = join(dir, d.name);
      if (d.isDirectory()) walk(p, out);
      else if (/\.tsx?$/.test(d.name) && d.name !== "CartDrawer.tsx") out.push(p);
    }
    return out;
  };
  for (const f of walk(join(ROOT, "src"))) {
    assert.doesNotMatch(readFileSync(f, "utf8"), /^import .*CartDrawer/m, f);
  }
});

// ── 브랜드 ───────────────────────────────────────────────────────────────────
test("★브랜드 표기는 소문자 gokoreamate 다", () => {
  const meta = read("src", "app", "picks", "page.tsx");
  assert.match(meta, /gokoreamate/);
  for (const bad of [/GoKoreaMate/, /Go Korea Mate/, /KoreaMate\b(?! ·)/]) {
    assert.doesNotMatch(strip(meta), bad, String(bad));
  }
});
