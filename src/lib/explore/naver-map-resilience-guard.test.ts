/**
 * TASK-MY-TRIPS-FINAL-UI-V1-R1 — Naver Map SDK 실패가 화면 전체를 죽이지 않는다
 * Run: node --experimental-strip-types --test src/lib/explore/naver-map-resilience-guard.test.ts
 *
 * 실측(로컬 127.0.0.1, NCP 미등록 origin): auth 401 → SDK 반초기화 → cleanup 의
 * removeListener 가 null 을 밟아 React error boundary → My Trip 전체 "couldn't load".
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ROOT = new URL("../../../", import.meta.url);
const src = readFileSync(new URL("src/components/NaverMap.tsx", ROOT), "utf8");

test("M1: 인증 실패를 상태로 받는다 — layout 의 navermap_authFailure 훅(SDK 로드 시점) → 구독 + 지도 생성 try/catch", () => {
  const layout = readFileSync(new URL("src/app/layout.tsx", ROOT), "utf8");
  // SDK 는 로드 직후 인증 콜백을 부른다 — 컴포넌트 마운트 뒤에 거는 훅은 놓친다
  assert.match(layout, /window\.navermap_authFailure\s*=\s*function/);
  assert.match(layout, /__gkmNaverMapAuthFailed\s*=\s*true/);
  assert.match(layout, /gkm:navermap-auth-failure/);
  assert.ok(layout.indexOf("navermap_authFailure") < layout.indexOf("oapi.map.naver.com/openapi/v3/maps.js"), "훅은 maps.js 보다 앞에 있어야 한다");
  assert.match(src, /useSyncExternalStore\(/);
  assert.match(src, /__gkmNaverMapAuthFailed/);
  assert.match(src, /const failed = authFailed \|\| initFailed/);
  assert.match(src, /try \{\s*mapRef\.current = new window\.naver!\.maps\.Map\(/);
  assert.match(src, /if \(!ready \|\| failed \|\| !mapDivRef\.current \|\| mapRef\.current\) return;/);
});

test("M2: cleanup 이 SDK 안에서 터져도 삼킨다 — removeListener / setMap(null) / close", () => {
  assert.match(src, /try \{ if \(l\) map\.Event\.removeListener\?\.\(l\); \} catch/);
  assert.match(src, /try \{ markersRef\.current\.forEach\(m => m\.setMap\(null\)\); \} catch/);
  assert.match(src, /try \{ openInfoRef\.current\?\.close\(\); \} catch/);
  assert.match(src, /try \{\s*dayMarkersRef\.current\.forEach\(m => m\.setMap\(null\)\);\s*dayLineRef\.current\?\.setMap\(null\);\s*\} catch/);
});

test("M3: 실패 시 지도 칸만 비운다 — 번역된 한 줄, 스피너는 멈춘다", () => {
  assert.match(src, /\{failed && \(/);
  assert.match(src, /tMap\("mapUnavailable"\)/);
  assert.match(src, /\{!ready && !failed && \(/);
  for (const l of ["en", "ko", "ja", "zh"]) {
    const d = JSON.parse(readFileSync(new URL(`src/messages/${l}.json`, ROOT), "utf8")) as Record<string, Record<string, string>>;
    assert.ok(typeof d.shell?.mapUnavailable === "string" && d.shell.mapUnavailable.trim() !== "", `${l}.shell.mapUnavailable`);
  }
});
