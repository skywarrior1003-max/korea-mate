// TASK-MY-TRIP-OWNER-SEMANTIC-P1-CORRECTION-V1 — 소스 가드. 실측으로 잡은 원인이 되돌아오지 않게 핀을 박는다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const PLAN = read("../../../functions/api/trip/plan.ts");
const PAGE = read("../../app/itinerary/page.tsx");
const EXPLORE = read("../../components/ExploreCity.tsx");
const DAYMAP = read("../../components/ItineraryDayMap.tsx");
const NMAP = read("../../components/NaverMap.tsx");
const MODAL = read("../../components/EventDetailModal.tsx");
const PICKS = read("../../app/picks/PicksClient.tsx");

test("★성능: commerce OFF 이면 affiliate 조회를 부르지 않는다 (하루당 ≈14s 타임아웃 원인)", () => {
  assert.match(PLAN, /const affiliateRows = TRIP_FLOW_COMMERCE_ENABLED \? await queryAffiliateLinks\(city\) : \[\];/);
  assert.match(PLAN, /import \{ TRIP_FLOW_COMMERCE_ENABLED \} from "\.\.\/\.\.\/\.\.\/src\/config\/commerce-surfaces";/);
  assert.match(PLAN, /\[plan-timing\]/, "단계별 타이밍 로그 한 줄은 남긴다(운영 관찰용)");
  assert.ok(!/setTimeout\(|sleep\(/.test(PLAN), "서버에 인위적 지연이 없다");
});

test("★KO locale: 모든 surface 가 공통 resolver(displayPlaceName)를 쓴다", () => {
  assert.match(EXPLORE, /displayPlaceName\(item\.name, item\.nameL10n, locale\)/, "Explore 카드");
  assert.match(EXPLORE, /name: displayPlaceName\(s\.name, s\.nameL10n, locale\), sourceKey: selectionKey\(s\)/, "Explore 지도 라벨");
  assert.match(EXPLORE, /displayName=\{displayPlaceName\(selectedEvent\.name, selectedEvent\.nameL10n, locale\)\}/, "Explore 상세 모달");
  assert.match(MODAL, /\{displayName \?\? event\.name\}/);
  assert.match(MODAL, /\{displayDescription \?\? event\.description\}/);
  assert.match(PICKS, /displayPlaceName\(item\.shortName \|\| item\.name, item\.nameL10n, locale\)/, "픽 카드");
  assert.match(DAYMAP, /name: localizedPlaceName\(s\.name, s\.nameL10n, locale\)/, "일정 지도 base 핀");
  assert.match(PAGE, /pickL10n\(exactSpot\?\.whyItMattersL10n, modalLocale\), pickL10n\(exactSpot\?\.descriptionL10n, modalLocale\)/, "PlaceModal 설명은 locale 값이 있으면 먼저");
  assert.match(read("../planner/planning-view-core.ts"), /return displayPlaceName\(name, l10n, locale\);/, "타임라인 이름도 같은 resolver");
  assert.match(read("../place-detail/place-detail-core.ts"), /stripIngestAnnotation\(n\)/, "/place 제목 수집 주석 제거");
});

test("★지도 마커 클릭 → 그 stop 의 PlaceModal (identity = 배열 idx)", () => {
  assert.match(NMAP, /onDayPlaceClick\?: \(place: DayPlace\) => void;/);
  assert.match(NMAP, /map\.Event\.addListener\(marker, "click", \(\) => \{ onDayPlaceClickRef\.current\?\.\(p\); \}\);/);
  assert.match(DAYMAP, /onStopClick\?: \(dayIdx: number, placeIdx: number\) => void;/);
  assert.match(DAYMAP, /out\.push\(\{ name: localizedPlaceName\(p\.name, spot\?\.nameL10n, locale\), lat, lng, idx \}\)/, "번호 마커가 places 인덱스를 들고 간다");
  assert.equal((PAGE.match(/onStopClick=\{openStopFromMap\}/g) || []).length, 2, "인라인 지도·전체화면 지도 둘 다");
  assert.match(PAGE, /const openStopFromMap = \(dayIdx: number, placeIdx: number\) => \{/);
  assert.match(PAGE, /className="fixed inset-0 z-\[90\] flex items-center justify-center p-4 bg-black\/65 backdrop-blur-sm"/, "모달은 전체화면 지도(z-70) 위");
});

test("★오늘 여행 날씨: 실제 예보 source 가 없으므로 정직한 기상청 링크 칩만 — 가짜 기온 0", () => {
  assert.match(PAGE, /<WeatherLinkChip label=\{tPlanner\("weather"\)\} ariaLabel=\{tPlanner\("weatherAria"\)\} \/>/);
  assert.ok(!/\d+°\s*\/\s*\d+°/.test(PAGE), "샘플 기온 문자열이 없다");
});
