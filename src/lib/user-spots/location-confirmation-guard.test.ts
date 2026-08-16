// 수동 My Place 는 등록하는 그 자리에서 위치를 확정한다.
//
// 예전에는 "지금 내가 서 있는 곳" 버튼 하나뿐이었다. 집에서 카페를 등록하면
// 집 좌표가 저장됐고, 그 장소는 일정에 넣을 때가 되어서야 위치가 없다는 걸
// 알게 됐다. 이제 지도를 열어 사용자가 그 장소의 자리를 직접 맞춘다.
//
// TSX 렌더 테스트 인프라가 없고 새 package 도 못 넣으므로, 여기서는 계약이
// 소스에 남아 있다는 것만 못 박는다. 실제 동작은 Playwright 로 확인한다.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8");

/** 블록 주석을 먼저 떼고 줄 주석을 뗀다 — 순서가 바뀌면 파일 본문을 삼킨다 */
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "")
   .split("\n").filter(l => !l.trimStart().startsWith("//")).join("\n");

const FORM   = read("src", "components", "UserSpotForm.tsx");
const PICKER = read("src", "components", "SpotLocationPicker.tsx");
const LAYOUT = read("src", "app", "layout.tsx");

// ── 주소를 지도 중심으로 바꿀 수 있는 상태인가 ───────────────────────────────
test("★geocoder submodule 을 실어 둔다 — 빼면 주소가 조용히 무시된다", () => {
  assert.match(LAYOUT, /maps\.js\?ncpKeyId=\$\{naverClientId\}&submodules=geocoder/);
});

// ── 폼이 지도를 연다 ─────────────────────────────────────────────────────────
test("★수동 등록 폼이 위치 확인 지도를 연다", () => {
  assert.match(FORM, /import SpotLocationPicker from "\.\/SpotLocationPicker"/);
  assert.match(strip(FORM), /<SpotLocationPicker/);
  assert.match(strip(FORM), /onConfirm=\{\(lat, lng\) =>/);
  // 확인한 좌표가 폼의 좌표가 된다 — 이 줄이 없으면 지도는 장식이다
  assert.match(strip(FORM), /setForm\(p => \(\{ \.\.\.p, lat, lng \}\)\)/);
});

test("★지도를 여는 근거 순서가 링크 → 주소 → 현재 위치 → 도시다", () => {
  const s = strip(FORM);
  assert.match(s, /parseMapLinkCoordinate\(raw\)/);
  assert.match(s, /geocodeAddress\(raw\)/);
  assert.match(s, /currentPosition\(\)/);
  assert.match(s, /cityCenter\(\)/);
  assert.match(s, /chooseSeed\(\{ link, address \}\)/);
});

test("★권한은 지도를 열 때만 묻는다 — 폼을 열자마자 묻지 않는다", () => {
  const s = strip(FORM);
  // getCurrentPosition 은 openPicker 가 부르는 currentPosition 안에만 있다
  assert.equal((s.match(/getCurrentPosition/g) ?? []).length, 1);
  assert.doesNotMatch(s, /useEffect\([^)]*getCurrentPosition/);
});

// ── 디자이너가 준 핀 ─────────────────────────────────────────────────────────
test("★중앙 핀은 제공된 전용 SVG 다 — generic 핀 emoji 를 쓰지 않는다", () => {
  // 브랜드 블루·그라디언트·바운스가 살아 있는지
  assert.match(PICKER, /#0057ff/);
  assert.match(PICKER, /gkm_pin_grad/);
  assert.match(PICKER, /#3b82f6/);
  assert.match(PICKER, /#1e3a8a/);
  assert.match(PICKER, /animateTransform/);
  assert.match(PICKER, /M100 92 C112 92 122 82 122 70/);
  for (const f of [PICKER, FORM]) {
    assert.doesNotMatch(f, /\u{1F4CD}/u, "generic 위치 핀 emoji");
  }
});

test("★ZIP 의 mock 지도 이미지와 Tailwind CDN 은 들어오지 않았다", () => {
  for (const f of [PICKER, FORM]) {
    assert.doesNotMatch(f, /googleusercontent/i);
    assert.doesNotMatch(f, /cdn\.tailwindcss\.com/i);
  }
});

test("★움직임을 줄여 달라는 설정을 지킨다", () => {
  assert.match(PICKER, /prefers-reduced-motion: reduce/);
  assert.match(strip(PICKER), /\{!still && </);
});

// ── 지도 조작 계약 ───────────────────────────────────────────────────────────
test("★핀은 화면 중앙에 고정되고 손가락이 닿지 않는다", () => {
  const s = strip(PICKER);
  assert.match(s, /pointer-events-none[^"]*absolute left-1\/2 top-1\/2/);
  assert.match(s, /-translate-x-1\/2 -translate-y-1\/2/);
  // 마커를 지리 좌표에 붙여 끌고 다니지 않는다
  assert.doesNotMatch(s, /new maps\.Marker/);
  assert.doesNotMatch(s, /draggable/);
});

test("★저장 좌표는 확인하는 순간의 지도 중심이다", () => {
  const s = strip(PICKER);
  assert.match(s, /mapRef\.current\?\.getCenter\(\)/);
  assert.match(s, /isValidCoordinate\(lat, lng\)/);
  assert.match(s, /onConfirm\(lat as number, lng as number\)/);
  // 매 프레임 state 를 갱신하지 않는다 — idle 로 한 번만 읽는다
  assert.match(s, /addListener\(map, "idle"/);
  assert.doesNotMatch(s, /"mousemove"|"touchmove"|"drag"/);
});

test("★전체 화면 지도다 — 폼 안의 작은 상자가 아니다", () => {
  const s = strip(PICKER);
  assert.match(s, /fixed inset-0/);
  assert.match(s, /ref=\{boxRef\} className="absolute inset-0/);
});

test("★상단 안내와 하단 저장 CTA 가 있다", () => {
  assert.match(PICKER, /locConfirmTitle/);
  assert.match(PICKER, /locConfirmHint/);
  assert.match(PICKER, /locConfirmSave/);
  assert.match(PICKER, /safe-area-inset-bottom/);
  assert.match(PICKER, /aria-label=\{t\("locConfirmClose"\)\}/);
});

// ── 저장 규칙은 건드리지 않았다 ──────────────────────────────────────────────
test("★anchor 규칙을 새로 겹치지 않는다 — 기존 canCreate/canEdit 그대로", () => {
  assert.match(FORM, /import \{ canCreate, canEdit \} from "@\/lib\/user-spots\/anchor-core"/);
  assert.match(strip(FORM), /mode === "create"\s*\?\s*canCreate\(anchorInput\)/);
});

// ── 4개 로케일 ───────────────────────────────────────────────────────────────
test("★새 문구가 4개 언어에 모두 있다", () => {
  const keys = [
    "locConfirmOpen", "locConfirmed", "locRecheck", "locSeeking", "locConfirmWhy",
    "locConfirmTitle", "locConfirmTitleFallback", "locConfirmHint", "locConfirmSave",
    "locConfirmClose", "locMapLoading", "locCenterAria",
    "locSeedLink", "locSeedAddress", "locSeedGps", "locSeedCity", "locSeedNone", "locSeedShortLink",
  ];
  for (const locale of ["en", "ko", "ja", "zh"]) {
    const picks = JSON.parse(read("src", "messages", `${locale}.json`)).picks;
    for (const k of keys) {
      assert.equal(typeof picks?.[k], "string", `${locale}.picks.${k}`);
      assert.ok(picks[k].trim().length > 0, `${locale}.picks.${k} 가 비었다`);
    }
    assert.match(picks.locConfirmTitle, /\{place\}/, `${locale} locConfirmTitle`);
  }
});
