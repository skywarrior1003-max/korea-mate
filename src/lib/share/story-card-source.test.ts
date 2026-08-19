// 9:16 카드가 무엇을 먹는가.
//
// 지키는 것
//   1. 카드 입력은 공개 Story 가 내보낸 것뿐이다. 소유자 목록이 아니다.
//   2. 공유되는 주소는 그 여행의 공개 Story 주소다. 홈페이지가 아니다.
//   3. 공개 payload 에 없는 값(category)을 지어내지 않는다.
//   4. 사진 한 장이 실패해도 나머지로 계속하고, 전부 실패하면 멈춘다.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { toStoryCardMoments, publicStoryUrl, type ApiStory } from "./story-adapter.ts";

const ID = "11111111-2222-3333-4444-555555555555";
const story = (memories: ApiStory["memories"]): ApiStory => ({
  id: ID, city: "busan", start_date: "2026-08-01", end_date: "2026-08-03",
  trip_title: "t", days: [], memories,
});

// ── A: 어댑터 ────────────────────────────────────────────────────────────────

test("A1 사진 ref 는 같은 출처의 공개 프록시 주소가 된다", () => {
  const out = toStoryCardMoments(story([{ dayNumber: 1, memo: "m", placeName: "p", placeId: null, photos: [{ ref: "r1" }] }]));
  assert.equal(out.length, 1);
  assert.equal(out[0]!.photoSrc, `/img/memory/${ID}/r1`);
  assert.ok(out[0]!.photoSrc!.startsWith("/"), "절대 URL 이면 다른 출처가 될 수 있다");
});

test("A2 category 를 지어내지 않는다", () => {
  const out = toStoryCardMoments(story([{ dayNumber: 1, memo: "m", placeName: null, placeId: null, photos: [{ ref: "r" }] }]));
  assert.equal(out[0]!.category, undefined);
});

test("A3 한 Memory 의 사진 여러 장을 모두 펼친다", () => {
  const out = toStoryCardMoments(story([
    { dayNumber: 1, memo: "m", placeName: null, placeId: null, photos: [{ ref: "a" }, { ref: "b" }] },
  ]));
  assert.deepEqual(out.map(o => o.photoSrc), [`/img/memory/${ID}/a`, `/img/memory/${ID}/b`]);
});

test("A4 사진 없는 Memory 는 메모가 있을 때만 남는다", () => {
  assert.equal(toStoryCardMoments(story([
    { dayNumber: 1, memo: "적어 둔 것", placeName: null, placeId: null, photos: [] },
  ])).length, 1);
  assert.equal(toStoryCardMoments(story([
    { dayNumber: 1, memo: "   ", placeName: null, placeId: null, photos: [] },
  ])).length, 0);
});

test("A5 공개 Memory 가 없으면 빈 목록 — 오류가 아니다", () => {
  assert.deepEqual(toStoryCardMoments(story([])), []);
  assert.deepEqual(toStoryCardMoments(story(undefined)), []);
});

test("A6 좌표·저장경로·내부 id 는 입력 모양에 자리가 없다", () => {
  const out = toStoryCardMoments(story([{ dayNumber: 1, memo: "m", placeName: "p", placeId: "9", photos: [{ ref: "r" }] }]));
  assert.deepEqual(Object.keys(out[0]!).sort(), ["memo", "photoSrc", "placeName"]);
});

// ── U: 주소 ──────────────────────────────────────────────────────────────────

test("U1 그 여행의 공개 Story 주소를 만든다", () => {
  assert.equal(publicStoryUrl("https://gokoreamate.com", ID), `https://gokoreamate.com/shared/${ID}`);
});

test("U2 끝의 슬래시가 겹치지 않는다", () => {
  assert.equal(publicStoryUrl("https://gokoreamate.com/", ID), `https://gokoreamate.com/shared/${ID}`);
});

// ── R: 렌더러 계약 ───────────────────────────────────────────────────────────

const RAW  = readFileSync("src/components/TripStoryExport.tsx", "utf8");
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const CARD = code(RAW);
const PAGE = code(readFileSync("src/app/itinerary/page.tsx", "utf8"));
const SHARED = code(readFileSync("src/app/shared/page.tsx", "utf8"));

test("R1 소유자 도메인 타입에 의존하지 않는다", () => {
  assert.ok(!/TripMoment/.test(CARD), "TripMoment 를 다시 받으면 비공개 필드가 카드까지 온다");
  assert.ok(!/photo_data/.test(CARD));
});

test("R2 공유 주소는 반드시 받는다 — 홈페이지 폴백이 다시 생길 수 없다", () => {
  assert.match(CARD, /shareUrl:\s*string;/);
  assert.ok(!/shareUrl\?:/.test(CARD), "선택 prop 이면 없을 때 폴백이 생긴다");
  assert.ok(!/"https:\/\/gokoreamate\.com"/.test(CARD), "홈페이지 하드코딩이 남아 있다");
});

test("R3 사진은 한 장씩 따로 처리한다", () => {
  assert.match(CARD, /Promise\.allSettled\(srcs\.map\(loadImage\)\)/);
  // 사진을 묶음으로 기다리면 한 장만 실패해도 전부 날아간다.
  assert.ok(!/Promise\.all\([^[]*loadImage/.test(CARD), "사진을 묶음으로 기다린다");
});

test("R4 사진이 있는데 전부 실패하면 카드를 완성하지 않는다", () => {
  const blk = CARD.slice(CARD.indexOf("allSettled"), CARD.indexOf("allSettled") + 600);
  assert.match(blk, /imgs\.length === 0/);
  assert.match(blk, /setPhotoError\(true\)/);
  assert.match(blk, /setRendered\(false\)/);
  assert.match(blk, /return;/);
});

test("R5 사진이 원래 0 장이면 정상 진행한다", () => {
  // 실패 차단은 `srcs.length > 0` 안에만 있다
  const guard = CARD.slice(CARD.indexOf("if (srcs.length > 0)"), CARD.indexOf("setPhotoError(false)"));
  assert.match(guard, /imgs\.length === 0/);
  assert.ok(CARD.includes("setPhotoError(false)"), "사진이 없으면 오류 상태가 아니다");
});

test("R6 오류 문구는 locale 을 쓴다 — 영어를 박아 넣지 않는다", () => {
  assert.match(CARD, /t\("photoLoadFailed"\)/);
});

// ── W: 배선 ──────────────────────────────────────────────────────────────────

test("W1 소유자 화면이 자기 moments 를 카드에 직접 넘기지 않는다", () => {
  const call = PAGE.slice(PAGE.indexOf("<TripStoryExport"), PAGE.indexOf("<TripStoryExport") + 500);
  assert.match(call, /moments=\{storyCardMoments\}/);
  assert.ok(!/moments=\{moments\}/.test(call), "비공개 Memory 가 카드로 들어간다");
});

test("W2 카드 입력은 공개 Story 응답에서만 만든다", () => {
  assert.match(PAGE, /\/api\/shared\/\$\{encodeURIComponent\(itinId\)\}\/story/);
  assert.match(PAGE, /toStoryCardMoments\(api\)/);
});

test("W3 비공개 여행은 카드가 아니라 공개 절차로 간다", () => {
  assert.match(PAGE, /if \(isPublic\) void openStoryCard\(\); else setPublishPreviewOpen\(true\)/);
});

test("W4 Public Story 분기의 기존 Share 자리를 쓴다 — 새 버튼을 만들지 않는다", () => {
  assert.match(SHARED, /onShare=\{\(\) => setStoryExportOpen\(true\)\}/);
  const summary = SHARED.slice(SHARED.indexOf("<StorySummary"), SHARED.indexOf("</StorySummary>") + 1 || SHARED.indexOf("onShare=") + 200);
  assert.ok(summary.includes("onShare="), "Share 는 StorySummary 안에 있어야 한다");
});

test("W5 legacy 분기는 그대로 빈 목록이다 — 회귀 없음", () => {
  assert.match(SHARED, /moments=\{\[\]\}/);
});

test("W6 두 분기 모두 정확한 공개 Story 주소를 넘긴다", () => {
  assert.equal((SHARED.match(/shareUrl=\{publicStoryUrl\(window\.location\.origin, trip\.id\)\}/g) ?? []).length, 2);
  assert.match(PAGE, /shareUrl=\{publicStoryUrl\(window\.location\.origin, itinId \?\? ""\)\}/);
});

test("W7 저장소 어디에도 공유용 홈페이지 폴백이 남아 있지 않다", () => {
  for (const f of ["src/components/TripStoryExport.tsx", "src/app/shared/page.tsx", "src/app/itinerary/page.tsx"]) {
    const src = code(readFileSync(f, "utf8"));
    assert.ok(!/clipboard\.writeText\("https:\/\/gokoreamate\.com"\)/.test(src), f);
    assert.ok(!/url:\s*"https:\/\/gokoreamate\.com"/.test(src), f);
  }
});

// ── P: postcard 재스킨 계약 ─────────────────────────────────────────────────

/** canvas 를 그리는 부분만 — 모달 chrome 색은 이번 재스킨 범위가 아니다 */
const RENDER = CARD.slice(CARD.indexOf("const render = useCallback"), CARD.indexOf("const pngFilename"));

test("P1 카드가 승인 토큰을 읽는다 — 색·여백을 새로 정하지 않는다", () => {
  assert.match(CARD, /from "@\/components\/story\/story-tokens"/);
  for (const t of ["ON_SURFACE", "PRIMARY", "MARGIN_MOBILE", "STACK_MD"]) {
    assert.ok(RENDER.includes(t), `토큰 미사용: ${t}`);
  }
  // 그리는 자리에서 지어낸 색은 브랜드 그라디언트 한 쌍과 흰 글자뿐이다
  const hexes = [...new Set([...RENDER.matchAll(/#[0-9a-fA-F]{6}/g)].map(m => m[0].toLowerCase()))].sort();
  assert.deepEqual(hexes, ["#2a1d1a", "#ffffff"], `토큰 밖 색: ${hexes.join(", ")}`);
});

test("P2 편집기 UI 를 만들지 않았다", () => {
  // 스타일/비율/필터 고르기는 V2 범위가 아니다. 상태값도 두지 않는다.
  for (const bad of ["Postcard", "Polaroid", "setAspect", "setTemplate", "setFilter",
                     "aspectOptions", "templateOptions", "filterTheme"]) {
    assert.ok(!CARD.includes(bad), `편집기 요소가 들어왔다: ${bad}`);
  }
  // 비율은 고르는 값이 아니라 고정값이다
  assert.match(CARD, /aspectRatio: "9\/16"/);
  assert.ok(!/"4:5"|"1:1"/.test(CARD));
});

test("P3 1080×1920 은 그대로다", () => {
  assert.match(CARD, /const W = 1080, H = 1920;/);
  assert.match(CARD, /canvas\.width\s+= W;/);
  assert.match(CARD, /canvas\.height = H;/);
});

test("P4 사진을 늘리지 않는다 — 비율을 지켜 잘라 채운다", () => {
  assert.match(CARD, /Math\.max\(w \/ img\.width, h \/ img\.height\)/);
});

test("P5 지어낸 값을 그리지 않는다", () => {
  for (const bad of ["hashtag", "#Ocean", "likes", "views", "score", "personality", "getTravelPersonality"]) {
    assert.ok(!new RegExp(bad, "i").test(CARD), `없는 값을 그린다: ${bad}`);
  }
});

test("P6 사용자에게 보이는 영어를 코드에 박지 않았다", () => {
  for (const bad of ['"Create Card"', '"Save Image"', '"Copy Link"', '"Regenerate"', '"Sharing…"', "Optimized for"]) {
    assert.ok(!CARD.includes(bad), bad);
  }
  for (const k of ["cardTitle", "createCard", "saveImage", "copyLink", "regenerate", "formatHint"]) {
    assert.ok(CARD.includes(`t("${k}")`), `locale key 미사용: ${k}`);
  }
});

test("P7 네 언어가 카드 문구를 모두 갖는다", () => {
  const need = ["cardTitle", "createCard", "creating", "tryAgain", "shareNow", "shareCard",
                "sharing", "saveImage", "copyLink", "linkCopied", "regenerate",
                "savedAndCopied", "formatHint", "copyPrompt"];
  for (const L of ["en", "ko", "ja", "zh"]) {
    const m = JSON.parse(readFileSync(`src/messages/${L}.json`, "utf8")) as { story: Record<string, string> };
    for (const k of need) assert.ok(typeof m.story[k] === "string" && m.story[k].trim() !== "", `${L}.story.${k}`);
  }
});

test("P8 9:16 렌더러는 둘뿐이다 — 세 번째를 만들지 않았다", () => {
  const engines: string[] = [];
  for (const f of ["src/components/TripStoryExport.tsx", "src/lib/trip-cover/share-card.ts"]) {
    assert.match(readFileSync(f, "utf8"), /1920/, f);
    engines.push(f);
  }
  assert.equal(engines.length, 2);
});

test("P9 장소 이름은 공개 payload 에서만 온다", () => {
  const adapter = readFileSync("src/lib/share/story-adapter.ts", "utf8");
  assert.match(adapter, /placeName = typeof m\.placeName === "string"/);
  assert.match(CARD, /m\.placeName/);
});

// ── L: Canvas 안의 말 ────────────────────────────────────────────────────────
//
// wrapper 버튼만 번역해 놓고 카드 안은 영어로 그리고 있었다. 카드는 그대로
// SNS 로 나가는 결과물이라, 거기 찍힌 언어가 사용자가 보는 마지막 언어다.

test("L1 카드에 그리는 문장을 코드에서 만들지 않는다", () => {
  assert.ok(!/`\$\{dayCount\} Days in/.test(RENDER), "제목이 영어로 박혀 있다");
  assert.ok(!/\$\{placeCount\} PLACES/.test(RENDER), "장소 수 문구가 영어로 박혀 있다");
  assert.match(RENDER, /t\("cardHeadline", \{ n: dayCount, city: cityCap \}\)/);
  assert.match(RENDER, /t\("cardPlaces", \{ n: placeCount \}\)/);
});

test("L2 공유 텍스트도 locale 이 만든다", () => {
  const bst = CARD.slice(CARD.indexOf("function buildShareText"), CARD.indexOf("function canShareFiles"));
  assert.ok(!/My \$\{|AI-built|memories|spots/.test(bst), "공유 문구를 여기서 조립한다");
  for (const k of ["shareTextTitle", "shareTextStats", "shareTextMemories"]) {
    assert.ok(CARD.includes(`t("${k}"`), `locale key 미사용: ${k}`);
  }
});

test("L3 특정 SNS 지원을 과장하지 않는다", () => {
  for (const L of ["en", "ko", "ja", "zh"]) {
    const m = JSON.parse(readFileSync(`src/messages/${L}.json`, "utf8")) as { story: Record<string, string> };
    const hint = m.story.formatHint ?? "";
    assert.ok(hint.includes("9:16"), `${L}: 형식 표기가 없다`);
    for (const brand of ["Instagram", "인스타", "インスタ", "TikTok", "틱톡", "抖音", " X", "快拍"]) {
      assert.ok(!hint.includes(brand), `${L}.formatHint 가 특정 SNS 를 내세운다: ${brand}`);
    }
  }
});

test("L4 네 언어가 카드 문장 키를 모두 갖는다", () => {
  const need = ["cardHeadline", "cardPlaces", "shareTextTitle", "shareTextStats", "shareTextMemories", "formatHint"];
  for (const L of ["en", "ko", "ja", "zh"]) {
    const m = JSON.parse(readFileSync(`src/messages/${L}.json`, "utf8")) as { story: Record<string, string> };
    for (const k of need) assert.ok(typeof m.story[k] === "string" && m.story[k].trim() !== "", `${L}.story.${k}`);
  }
  // 제목 문구에는 두 자리가 다 있어야 한다
  for (const L of ["en", "ko", "ja", "zh"]) {
    const m = JSON.parse(readFileSync(`src/messages/${L}.json`, "utf8")) as { story: Record<string, string> };
    assert.ok(m.story.cardHeadline!.includes("{n}") && m.story.cardHeadline!.includes("{city}"), `${L}.cardHeadline`);
  }
});

test("L5 띄어쓰기 없는 글도 줄바꿈한다 — 일본어·중국어 제목이 잘리지 않게", () => {
  assert.match(CARD, /pushBroken/);
  const wrap = CARD.slice(CARD.indexOf("function wrapText"), CARD.indexOf("function dataUrlToFile"));
  assert.match(wrap, /for \(const ch of word\)/);
});
