// 공유받은 사람이 이름을 본 다음 지도로 이어갈 수 있는가 — 그리고 그 과정에서
// 원래 여행자의 사적인 정보가 따라 나가지 않는가.
//
// 두 가지가 동시에 성립해야 한다. 이름만 보이고 지도가 막히면 공유는 읽을거리로
// 끝나고, 지도를 열어 주자고 좌표를 실으면 어디서 자는지가 링크에 남는다.
// 답은 하나다 — 이미 공개된 이름과 도시로 검색한다.
//
// 실행: node --experimental-strip-types src/lib/maps/place-navigation.test.ts

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  NAVER_KEYWORD_MAP, googlePlaceSearchUrl, isSafeMapUrl, naverPlaceSearchUrl,
} from "./place-navigation.ts";

let passed = 0;
function test(name: string, fn: () => void): void {
  try { fn(); passed++; console.log(`  ok  ${name}`); }
  catch (e) { console.error(`  FAIL ${name}\n       ${(e as Error).message}`); process.exitCode = 1; }
}

const ROOT = process.cwd();
const read = (...p: string[]) => readFileSync(path.join(ROOT, ...p), "utf8");
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, " "))
   .replace(/\/\/[^\n]*/g, m => " ".repeat(m.length));

const SHARED = strip(read("src", "app", "shared", "page.tsx"));
const ITIN   = strip(read("src", "app", "itinerary", "page.tsx"));
const NAV    = strip(read("src", "lib", "maps", "place-navigation.ts"));

// ── A. 이름 + 도시로 연다 ────────────────────────────────────────────────────

test("★직접 적어 넣은 숙소도 열린다", () => {
  // canonical 장소가 아니어도 이름과 도시만 있으면 된다.
  const g = googlePlaceSearchUrl("Signiel Busan", "Busan");
  assert.ok(g.startsWith("https://www.google.com/maps/search/?api=1&query="));
  assert.ok(decodeURIComponent(g).includes("Signiel Busan Busan Korea"));
  const n = naverPlaceSearchUrl("Signiel Busan", "Busan");
  assert.ok(isSafeMapUrl(n), "네이버 주소가 안전 목록 밖이다");
});

test("★한글 이름은 네이버에서 그대로 찾는다", () => {
  const n = naverPlaceSearchUrl("파라다이스호텔 부산", "Busan");
  assert.ok(n.startsWith("https://map.naver.com/v5/search/"));
  assert.ok(decodeURIComponent(n).includes("파라다이스호텔"));
});

test("★알려진 장소는 기존 키워드 표를 그대로 쓴다", () => {
  // 일정 화면이 쓰던 계약이다. 옮기면서 뜻이 바뀌지 않았다.
  assert.ok(Object.keys(NAVER_KEYWORD_MAP).length > 10);
  assert.equal(decodeURIComponent(naverPlaceSearchUrl("Haeundae Beach", "Busan")),
    "https://map.naver.com/v5/search/해운대해수욕장");
});

test("★네이버에서 찾을 이름이 없으면 구글로 내려간다", () => {
  const n = naverPlaceSearchUrl("Some New Hotel", "Busan");
  assert.ok(n.includes("google.com"), "네이버로 찾을 수 없는데 네이버를 열었다");
  assert.ok(isSafeMapUrl(n));
});

test("★도시가 비어도 이상한 검색어를 만들지 않는다", () => {
  const g = googlePlaceSearchUrl("Signiel Busan", "");
  assert.ok(!decodeURIComponent(g).includes("  "), "빈 도시 때문에 공백이 겹쳤다");
  assert.ok(decodeURIComponent(g).includes("Signiel Busan Korea"));
});

// ── B. 사적인 것은 따라 나가지 않는다 ────────────────────────────────────────

test("★★검색 주소에 좌표가 들어갈 자리가 없다", () => {
  // 인자가 이름과 도시뿐이다 — 좌표를 넣을 수단 자체가 없다.
  assert.match(NAV, /export function naverPlaceSearchUrl\(placeName: string, city: string\)/);
  assert.match(NAV, /export function googlePlaceSearchUrl\(placeName: string, city: string\)/);
  assert.doesNotMatch(NAV, /\blat\b|\blng\b|coordinate|address|\.link/,
    "★지도 주소 생성이 좌표·주소·링크를 알고 있다");
});

test("★★공유 화면은 숙소의 좌표·주소·링크를 만지지 않는다", () => {
  assert.doesNotMatch(SHARED, /stay\.coordinate|stay\.address|stay\.link|TripDraft|readTripDraft/,
    "★공유 화면이 사적인 숙소 정보를 읽는다");
  assert.doesNotMatch(SHARED, /koreamate_checkin_/, "★공유 화면이 개인 체크인 시각을 읽는다");
});

test("★★지도 버튼에 체크인 시각이 실리지 않는다", () => {
  const block = SHARED.slice(SHARED.indexOf("{googleUrl && ("));
  const body  = block.slice(0, block.indexOf("</div>"));
  assert.doesNotMatch(body, /place\.time|checkin|Check-in/i,
    "★지도 링크·라벨에 시각이 들어갔다");
  assert.doesNotMatch(body, /place\.lat|place\.lng/, "★좌표가 링크에 들어갔다");
});

test("★★사용자가 붙여넣은 주소를 href 로 쓰지 않는다", () => {
  for (const bad of ["javascript:alert(1)", "data:text/html,x", "http://map.naver.com/x",
                     "https://evil.example.com/map"]) {
    assert.equal(isSafeMapUrl(bad), false, `${bad} 를 통과시켰다`);
  }
  assert.equal(isSafeMapUrl("https://map.naver.com/v5/search/x"), true);
  assert.equal(isSafeMapUrl("https://www.google.com/maps/search/?api=1&query=x"), true);
  // 저장된 주소도 검사를 거친 뒤에만 쓴다.
  assert.match(SHARED, /place\.googleMapsUrl && isSafeMapUrl\(place\.googleMapsUrl\)/,
    "저장된 지도 주소를 검사 없이 쓴다");
});

// ── C. 공유 화면의 모양 ──────────────────────────────────────────────────────

test("★★숙소 이름을 일반 라벨로 바꾸지 않는다", () => {
  assert.doesNotMatch(SHARED, /"Accommodation"|'Accommodation'/,
    "★숙소 이름 자리에 일반 라벨을 박았다");
  assert.match(SHARED, /place\.name\?\.trim\(\)/, "이름을 그대로 쓰지 않는다");
  // 이름이 아예 없을 때만 대체 문구를 쓴다.
  assert.match(SHARED, /place\.isAccommodation \? tStay\("placeFallback"\) : ""/);
});

test("★★네이버와 구글 둘 다 있고, 숙소만 다르게 생기지 않았다", () => {
  const block = SHARED.slice(SHARED.indexOf("{googleUrl && ("));
  const body  = block.slice(0, block.indexOf("</div>"));
  assert.match(body, /href=\{naverUrl!\}/, "네이버/대체 액션이 없다");
  assert.match(body, /href=\{googleUrl\}/, "구글 액션이 없다");
  assert.match(SHARED, /naverPlaceSearchUrl\(target, trip\.city\)/, "네이버 주소를 만들지 않는다");
  assert.match(SHARED, /googlePlaceSearchUrl\(target, trip\.city\)/, "구글 fallback 을 만들지 않는다");
  // 숙소 전용 분기가 아니라 모든 장소가 같은 UI 를 쓴다.
  assert.doesNotMatch(body, /isAccommodation/, "★숙소만 다른 지도 UI 를 만들었다");
});

// ── C2. 라벨이 실제 목적지와 일치하는가 ─────────────────────────────────────

test("★★A. 진짜 네이버로 갈 때만 Naver Map 이라고 적는다", () => {
  const n = naverPlaceSearchUrl("해운대해수욕장", "Busan");
  assert.ok(n.startsWith("https://map.naver.com/"), "네이버 주소가 아니다");
  assert.match(SHARED, /naverIsGoogle \? tItin\("moreSearch"\) : "🗺️ Naver Map"/,
    "★목적지와 무관하게 Naver Map 이라고 적는다");
});

test("★★B·D. Google 로 내려갈 때는 Naver 라고 적지 않는다", () => {
  // 영문 이름 숙소가 정확히 이 경우다 — 운영에서 실제로 이렇게 나왔다.
  const n = naverPlaceSearchUrl("QA Test Hotel Haeundae", "Busan");
  assert.ok(n.includes("google.com"), "이 이름은 네이버로 못 찾는다는 전제가 깨졌다");
  // 판정은 일정 화면과 같은 값으로 한다 — 새 규칙을 만들지 않았다.
  assert.match(SHARED, /const naverIsGoogle = naverUrl !== null && naverUrl\.includes\("google\.com"\)/);
  assert.match(ITIN, /const naverIsGoogle = naverUrl\.includes\("google\.com"\)/,
    "일정 화면의 기존 판정이 사라졌다");
});

test("★★같은 곳으로 가는 버튼을 두 개 두지 않는다", () => {
  // 직접 적어 넣은 숙소는 저장된 지도 주소가 없어 fallback 과 Google 이 같아진다.
  const name = "QA Test Hotel Haeundae", city = "Busan";
  assert.equal(naverPlaceSearchUrl(name, city), googlePlaceSearchUrl(name, city),
    "이 조건에서 두 주소가 같다는 전제가 깨졌다");
  assert.match(SHARED, /const showFallback = naverUrl !== null && \(!naverIsGoogle \|\| naverUrl !== googleUrl\)/,
    "★같은 주소로 가는 버튼이 중복으로 남는다");
});

test("★C. Google 버튼은 그대로 Google 이다", () => {
  const block = SHARED.slice(SHARED.indexOf("{googleUrl && ("));
  const body  = block.slice(0, block.indexOf("</div>"));
  assert.match(body, /href=\{googleUrl\}/);
  assert.match(body, /<span>Google Maps<\/span>/);
});

test("★F. 저장된 지도 주소가 있는 장소는 그것을 먼저 쓴다", () => {
  assert.match(SHARED, /place\.googleMapsUrl && isSafeMapUrl\(place\.googleMapsUrl\)[\s\S]{0,40}\? place\.googleMapsUrl/,
    "기존 장소의 지도 주소 우선순위가 바뀌었다");
});

test("★E. 라벨 판정에 사적인 값이 끼어들지 않는다", () => {
  const block = SHARED.slice(SHARED.indexOf("const target = mapTargetName(place)"));
  const body  = block.slice(0, block.indexOf("return ("));
  assert.doesNotMatch(body, /coordinate|address|\.link|place\.time|checkin/i,
    "★목적지 판정이 좌표·주소·링크·체크인 시각을 본다");
});

test("★외부 링크 안전 속성을 유지한다", () => {
  const block = SHARED.slice(SHARED.indexOf("{googleUrl && ("));
  const body  = block.slice(0, block.indexOf("</div>"));
  assert.equal((body.match(/target="_blank"/g) ?? []).length, 2);
  assert.equal((body.match(/rel="noopener noreferrer"/g) ?? []).length, 2);
});

test("★이름이 없으면 지도 버튼을 걸지 않는다", () => {
  assert.match(SHARED, /function mapTargetName\(place: Place\): string \| null/);
  assert.match(SHARED, /return n\.length > 0 \? n : null;/);
  assert.match(SHARED, /const target = mapTargetName\(place\);/, "target 판정이 없다");
});

// ── D. 기존 장소 동작은 그대로 ───────────────────────────────────────────────

test("★★일반 장소는 저장된 지도 주소를 먼저 쓴다", () => {
  assert.match(SHARED, /\? place\.googleMapsUrl[\s\S]{0,40}: \(target \? googlePlaceSearchUrl/,
    "저장된 주소보다 검색을 먼저 쓴다 — 기존 장소 동작이 바뀐다");
});

test("★★일정 화면은 같은 helper 를 쓴다", () => {
  assert.doesNotMatch(ITIN, /function buildNaverUrl|const NAVER_KEYWORD_MAP/,
    "옮겨 온 원본이 아직 남아 두 벌이 됐다");
  assert.match(ITIN, /naverPlaceSearchUrl\(place\.name, city\)/);
  assert.match(ITIN, /place\.googleMapsUrl \|\| googlePlaceSearchUrl\(place\.name, city\)/);
});

test("★복사 버튼과 공유 구조를 건드리지 않았다", () => {
  assert.match(SHARED, /apiCopyItinerary\(shareId, getDeviceId\(\)\)/);
  assert.match(SHARED, /fetchSharedItinerary\(shareId\)/);
});

test("★★공유 화면이 새 데이터를 요구하지 않는다", () => {
  // 저장된 일정에 이미 있는 것만 쓴다. 새 API·새 필드를 만들지 않았다.
  const block = SHARED.slice(SHARED.indexOf("{googleUrl && ("));
  const body  = block.slice(0, block.indexOf("</div>"));
  assert.doesNotMatch(body, /fetch\(|await /, "지도 버튼이 네트워크를 부른다");
});

console.log(`\n  ${passed} passed`);
