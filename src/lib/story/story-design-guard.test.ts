// Public Memory Story 가 디자이너 최종 화면에서 벗어나지 않는다.
//
// 이 화면의 값들은 "더 나아 보인다" 는 이유로 바뀌기 쉽다 — 주황이 조금 밝다,
// 여백이 좁다, 모서리가 각지다. 그래서 숫자를 여기에 못 박는다.
//
// 정본 순서 (오너 확정)
//   1. 최종 screen.png 의 실제 시각 결과
//   2. 그 화면을 만든 code.html 의 tailwind.config
//   3. Public Memory Story Design Specs
//   4. Emotional Journal Design System
//   5. 앱 공통 스타일
//
// Specs 와 화면이 다르면 화면을 따른다. 그래서 아래 값들은 Specs 문서와
// **일부러** 다르다 — #C04808 이 아니라 #a53c05, 24px 이 아니라 20px,
// 64px 이 아니라 48px, 16px 이 아니라 12px(rounded-xl). 이건 실수가 아니다.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as T from "../../components/story/story-tokens.ts";

const ROOT = process.cwd();
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8");
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "")
   .split("\n").filter(l => !l.trimStart().startsWith("//")).join("\n");

const COVER   = read("src", "components", "story", "StoryCover.tsx");
const JOURNAL = read("src", "components", "story", "StoryJournal.tsx");
const FOCUS   = read("src", "components", "story", "StoryMemoryFocus.tsx");
const SUMMARY = read("src", "components", "story", "StorySummary.tsx");

// ── 토큰 ─────────────────────────────────────────────────────────────────────
// ── 390px reference 실측으로 잡아낸 값들 ────────────────────────────────────
// 아래 다섯은 눈으로는 "비슷"했지만 재 보니 달랐던 것들이다. 숫자로 박아 둔다.
test("★독립 QA 에서 잡은 실측값이 되돌아가지 않는다", () => {
  // ① 인용 줄간격 42.25px (26 × 1.625). 토큰의 1.3 을 그대로 쓰면 33.8px 이었다.
  assert.match(JOURNAL, /lineHeight: 1\.625/);
  // ② Journey Complete 칩 글자색. 팔레트에서 눈으로 고르면 #370e00 을 집는다.
  assert.equal(T.ON_PRIMARY_CONTAINER, "#692200");
  // ③ Focus 인용 줄간격 60px (48 × 1.25). 1.2 면 57.6px 이었다.
  assert.match(FOCUS, /lineHeight: 1\.25/);
  // ④ Focus 의 n/total·SWIPE, Cover eyebrow 자간 1.2px(0.1em)
  assert.equal(T.LABEL_CAPS_WIDE.letterSpacing, "0.1em");
  for (const src of [FOCUS, COVER]) assert.match(src, /LABEL_CAPS_WIDE/);
  // ⑤ Save 하트 24px — 18px 이면 버튼 폭이 시안보다 6px 좁았다
  const saveBlock = JOURNAL.slice(JOURNAL.indexOf("{onSave && ("));
  assert.match(saveBlock, /width="24" height="24"/);
});

test("★gradient 는 값으로 고정한다 — 유틸을 쓰면 oklab 으로 섞인다", () => {
  // 이 저장소의 Tailwind 는 gradient 를 oklab 에서 보간해, 같은 정지색을 줘도
  // 시안(sRGB)과 중간 톤이 달라진다. reference 실측 문자열 그대로 적는다.
  assert.match(COVER, /linear-gradient\(to top, rgba\(0, 0, 0, 0\.8\), rgba\(0, 0, 0, 0\.3\), rgba\(0, 0, 0, 0\)\)/);
  assert.match(FOCUS, /linear-gradient\(to bottom, rgba\(0, 0, 0, 0\.4\), rgba\(0, 0, 0, 0\), rgba\(0, 0, 0, 0\.8\)\)/);
  assert.doesNotMatch(COVER, /bg-gradient-to-t/);
  assert.doesNotMatch(FOCUS, /bg-gradient-to-b/);
});

test("★색은 최종 화면 값이다 — Specs 문서 값이 아니다", () => {
  assert.equal(T.PRIMARY,             "#a53c05");
  assert.notEqual(T.PRIMARY.toLowerCase(), "#c04808");
  assert.equal(T.PAGE_BG,             "#f8f9fa");
  assert.equal(T.ON_SURFACE,          "#191c1d");
  assert.equal(T.ON_SURFACE_VARIANT,  "#57423a");
  assert.equal(T.SURFACE_CONTAINER_LOW, "#f3f4f5");
});

test("★여백·모서리도 최종 화면 값이다", () => {
  assert.equal(T.MARGIN_MOBILE, 20);   // Specs 는 24
  assert.equal(T.STACK_LG,      48);   // Specs 는 64
  assert.equal(T.GUTTER,        16);
  assert.equal(T.RADIUS_PHOTO,  "0.75rem"); // rounded-xl = 12px, Specs 는 16px
});

test("★서체는 Noto Serif + Inter 다", () => {
  assert.match(T.FONT_SERIF, /--font-story-serif/);
  assert.match(T.FONT_SANS,  /--font-story-sans/);
  const layout = read("src", "app", "layout.tsx");
  assert.match(layout, /Noto_Serif/);
  assert.match(layout, /\bInter\b/);
  assert.match(layout, /--font-story-serif/);
  assert.match(layout, /--font-story-sans/);
  // 런타임에 Google 을 부르지 않는다
  assert.doesNotMatch(layout, /fonts\.googleapis\.com/);
  // 크기도 화면 값 그대로
  assert.equal(T.DISPLAY_MEMORY.fontSize,      "48px");
  assert.equal(T.HEADLINE_LG.fontSize,         "32px");
  assert.equal(T.HEADLINE_LG_MOBILE.fontSize,  "26px");
  assert.equal(T.TITLE_MD.fontSize,            "18px");
  assert.equal(T.BODY_SM.fontSize,             "14px");
  assert.equal(T.LABEL_CAPS.fontSize,          "12px");
});

// ── Cover ────────────────────────────────────────────────────────────────────
test("★Cover 는 사진과 gradient 와 제목뿐이다", () => {
  assert.match(COVER, /h-screen/);
  assert.match(COVER, /linear-gradient\(to top, rgba/);
  assert.match(COVER, /Scroll to explore/);
  // 여기에 두면 첫 감정이 흐려진다
  const c = strip(COVER);
  for (const bad of [/Copy this trip/, /onSave/, /mapSlot/, /itinerary/i]) {
    assert.doesNotMatch(c, bad, String(bad));
  }
});

// ── Journal ──────────────────────────────────────────────────────────────────
test("★Day 는 세로선과 주황 점을 가진다", () => {
  assert.match(JOURNAL, /borderLeft: `2px solid \$\{SURFACE_VARIANT\}`/);
  assert.match(JOURNAL, /backgroundColor: PRIMARY/);
  assert.match(JOURNAL, /DAY \{day\.dayNumber\}/);
});

test("★장소 이름은 첫 사진 위 유리 칩에 얹힌다", () => {
  assert.match(JOURNAL, /GLASS_OVERLAY/);
  assert.match(JOURNAL, /chip=\{memory\.placeName\}/);
});

test("★인용은 serif italic 이고 사용자 글을 그대로 쓴다", () => {
  assert.match(JOURNAL, /italic/);
  assert.match(JOURNAL, /HEADLINE_LG_MOBILE/);
  assert.match(JOURNAL, /\{`“\$\{memory\.memo\}”`\}/);
  // 문구를 만들어 내거나 다듬지 않는다
  const j = strip(JOURNAL);
  for (const bad of [/slice\(0,\s*\d+\)\s*\+\s*"…"/, /rewrite/i, /generate/i]) {
    assert.doesNotMatch(j, bad, String(bad));
  }
});

test("★Save 는 시안의 테두리 pill 이고, 기능이 없으면 그리지 않는다", () => {
  assert.match(JOURNAL, /rounded-full/);
  assert.match(JOURNAL, /border: `1px solid \$\{SURFACE_VARIANT\}`/);
  assert.match(JOURNAL, /color: PRIMARY/);        // 하트만 주황
  // onSave 를 주지 않으면 버튼 자체가 없다 — 눌러도 안 되는 CTA 를 두지 않는다
  assert.match(JOURNAL, /\{onSave && \(/);
  // 주황으로 꽉 채운 버튼이 아니다 — Save 버튼 블록만 본다
  // (Day 앞의 작은 주황 점은 시안에 있는 것이라 여기서 걸리면 안 된다)
  const saveBlock = JOURNAL.slice(JOURNAL.indexOf("{onSave && ("), JOURNAL.indexOf("</button>", JOURNAL.indexOf("{onSave && (")));
  assert.doesNotMatch(saveBlock, /backgroundColor/);
});

test("★사진이 많으면 시안의 언어 안에서 +N 으로 접는다", () => {
  assert.match(JOURNAL, /const hidden\s*=\s*Math\.max\(0, photos\.length - 3\)/);
  assert.match(JOURNAL, /\+\{overlayCount\}/);
  assert.doesNotMatch(strip(JOURNAL), /masonry|columns-/i);
});

// ── Focus ────────────────────────────────────────────────────────────────────
test("★Focus 는 선형 progress 와 n / total 을 그대로 갖는다", () => {
  assert.match(FOCUS, /h-1 flex-1 bg-white\/30 rounded-full/);
  // 구간 progress 는 지금 장소의 사진 수만큼 — 여행 전체를 넘겨도 "이 곳에 몇 장" 은 그대로 보인다
  assert.match(FOCUS, /Array\.from\(\{ length: current\.photoCount \}, \(_, n\)/);
  assert.match(FOCUS, /width: n <= current\.photoIndex \? "100%" : "0%"/);
  assert.match(FOCUS, /\{i \+ 1\} \/ \{total\}/);
  assert.match(FOCUS, /Swipe/);
});

test("★Focus 는 좌우 1/3 탭과 스와이프로 넘긴다", () => {
  assert.match(FOCUS, /inset-y-0 left-0 w-1\/3/);
  assert.match(FOCUS, /inset-y-0 right-0 w-1\/3/);
  assert.match(FOCUS, /onTouchEnd/);
  assert.match(FOCUS, /Escape/);
});

test("★긴 memo 를 데이터에서 잘라내지 않는다", () => {
  assert.match(FOCUS, /\{current\.memo\}/);
  assert.match(FOCUS, /overflow-y-auto/);
  assert.doesNotMatch(strip(FOCUS), /memo\.slice\(0,\s*\d+\)\s*\+/);
});

// ── Summary ──────────────────────────────────────────────────────────────────
test("★Summary 는 시안 순서를 지킨다", () => {
  // Props 선언이 아니라 **그려지는 순서**를 본다
  const jsx = SUMMARY.slice(SUMMARY.indexOf("return ("));
  const order = ["Journey Complete", "data.title", "data.stats", "data.description",
                 "mapSlot", "copyLabel", "shareLabel", "gokoreamate"];
  let at = -1;
  for (const k of order) {
    const i = jsx.indexOf(k);
    assert.ok(i > at, `${k} 의 자리가 시안과 다르다`);
    at = i;
  }
  assert.match(SUMMARY, /borderTopLeftRadius: 40/);
});

test("★Copy CTA 는 주황 full-round pill 이다", () => {
  assert.match(SUMMARY, /backgroundColor: PRIMARY, color: "#ffffff"/);
  assert.match(SUMMARY, /rounded-full/);
  assert.match(SUMMARY, /paddingTop: 16, paddingBottom: 16, paddingLeft: 32, paddingRight: 32/);
});

test("★Share 는 조용한 텍스트다 — CTA 를 두 개로 만들지 않는다", () => {
  const s = SUMMARY.slice(SUMMARY.indexOf("onShare &&"));
  assert.doesNotMatch(s.slice(0, 700), /backgroundColor: PRIMARY/);
});

test("★지도를 만들지 않는다 — 자리만 있다", () => {
  assert.match(SUMMARY, /mapSlot\?: ReactNode/);
  assert.match(SUMMARY, /\{mapSlot \?\? \(/);
  const all = strip(COVER + JOURNAL + FOCUS + SUMMARY);
  for (const bad of [/naver\.maps/i, /google\.maps/i, /leaflet/i, /polyline/i,
                     /marker/i, /\blat\b/, /\blng\b/]) {
    assert.doesNotMatch(all, bad, String(bad));
  }
});

// ── 공개 계약 ────────────────────────────────────────────────────────────────
test("★Story 타입에 공개하면 안 되는 값이 애초에 없다", () => {
  const types = strip(read("src", "components", "story", "story-types.ts"));
  for (const bad of ["lat", "lng", "address", "device_id", "sourceKey",
                     "storage_path", "googleMapsUrl", "place_id"]) {
    assert.ok(!new RegExp(`\\b${bad}\\b`).test(types), `${bad} 가 타입에 있다`);
  }
});

test("★공개 serializer 를 넓히지 않았다", () => {
  const pub = strip(read("src", "lib", "share", "public-story.ts"));
  assert.doesNotMatch(pub, /trip_moment/);
  assert.doesNotMatch(pub, /photo/i);
  const copy = strip(read("functions", "api", "itinerary", "copy.ts"));
  assert.doesNotMatch(copy, /trip_moments/);
  assert.doesNotMatch(copy, /trip_moment_photos/);
});

test("★디자이너 sample 데이터가 컴포넌트에 박혀 있지 않다", () => {
  // 주석까지 포함해 본다 — 예시로라도 시안 문자열을 남겨 두면 언젠가 붙여넣는다
  const all = COVER + JOURNAL + FOCUS + SUMMARY +
              read("src", "components", "story", "story-types.ts");
  for (const bad of ["Sarah Kim", "Gamcheon", "Our Golden Days", "Haeundae",
                     "Busan Memory: Wrapped", "October 12", "aida-public"]) {
    assert.ok(!all.includes(bad), `${bad} 가 코드에 박혀 있다`);
  }
});

test("★공개 화면에 앱 하단 네비게이션을 넣지 않는다", () => {
  const all = strip(COVER + JOURNAL + FOCUS + SUMMARY);
  for (const bad of [/BottomNav/, /TabBar/, /fixed bottom-0/]) {
    assert.doesNotMatch(all, bad, String(bad));
  }
});
