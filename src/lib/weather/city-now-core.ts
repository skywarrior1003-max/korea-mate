// City Hub 현재날씨 `☀️ 26°C` — 순수 코어 (POST-ACCEPTANCE-CITY-HUB-WEATHER-V1)
//
// Owner 최종 계약: City Hub 는 "현재 아이콘 1 + 현재 기온 1" 한 줄뿐이다.
// 예보 카드/최저최고/시간별/자체 날씨 페이지는 만들지 않는다 — 더 궁금하면
// 이 줄을 눌러 기상청 공식 단기예보 화면에서 본다.
//
// 데이터: 기상청 단기예보 조회서비스(VilageFcstInfoService_2.0) 공식 가이드
// (기상청41, 2607) 원문 확인값만 사용한다:
//   · 초단기실황 getUltraSrtNcst — base_time = HH00(매시 정시 생성),
//     API 제공은 매시 10분 이후. 현재 기온은 category T1H(℃).
//   · 초단기예보 getUltraSrtFcst — base_time = HH30(매시 30분 생성),
//     API 제공은 매시 45분 이후. 하늘/강수 판별은 SKY·PTY.
//   · SKY: 맑음(1) 구름많음(3) 흐림(4).
//     PTY(초단기): 없음(0) 비(1) 비/눈(2) 눈(3) 소나기(4) 빗방울(5)
//     빗방울눈날림(6) 눈날림(7).
//   · +900 이상/−900 이하는 Missing.
//
// 위치: 사용자 GPS 가 아니라 **보고 있는 도시**다. 5도시 대표 nx/ny 는
// 공식 별첨 엑셀(격자_위경도 2607)의 시 대표 행에서 그대로 옮겼다.

export interface CityGrid { nx: number; ny: number; }

/** 공식 별첨 엑셀의 대표 행정구역 행 (행정구역코드 주석) — 임의 계산 아님 */
export const CITY_NOW_GRID: Readonly<Record<string, CityGrid>> = Object.freeze({
  busan:    { nx: 98,  ny: 76  }, // 부산광역시 2600000000
  seoul:    { nx: 60,  ny: 127 }, // 서울특별시 1100000000
  jeju:     { nx: 53,  ny: 38  }, // 제주특별자치도 제주시 5011000000
  gyeongju: { nx: 100, ny: 91  }, // 경상북도 경주시 4713000000
  jeonju:   { nx: 63,  ny: 89  }, // 전북특별자치도 전주시완산구(시청 소재) 5211100000
});

/**
 * 기상청 공식 단기예보 화면. 도시별 deep-link 는 공식 문서화된 안정
 * parameter 가 없어(임의 query 발명 금지 — 계약) 공통 단기예보 페이지로 간다.
 */
export const KMA_SHORT_FORECAST_URL = "https://www.weather.go.kr/w/weather/forecast/short-term.do";

const pad2 = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) =>
  `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}`;

/**
 * 초단기실황의 최신 유효 base_date/base_time.
 * 가이드: base_time 은 정시(HH00), 제공은 HH:10 이후 — 전파 여유 5분을 더해
 * 15분 전에는 직전 시각 발표를 쓴다. 자정 직후는 전날 2300 으로 넘어간다.
 * nowKst 는 "KST 벽시계를 UTC 필드에 실은 Date"(mid-forecast-core 와 같은 관례).
 */
export function latestNcstBase(nowKst: Date): { base_date: string; base_time: string } {
  const d = new Date(nowKst.getTime());
  if (d.getUTCMinutes() < 15) d.setUTCHours(d.getUTCHours() - 1);
  return { base_date: ymd(d), base_time: `${pad2(d.getUTCHours())}00` };
}

/**
 * 초단기예보의 최신 유효 base_date/base_time.
 * 가이드: base_time 은 HH30, 제공은 HH:45 이후 — 여유 5분을 더해 50분 전에는
 * 직전 시각의 HH30 을 쓴다. 00:50 이전에는 전날 2330.
 */
export function latestFcstBase(nowKst: Date): { base_date: string; base_time: string } {
  const d = new Date(nowKst.getTime());
  if (d.getUTCMinutes() < 50) d.setUTCHours(d.getUTCHours() - 1);
  return { base_date: ymd(d), base_time: `${pad2(d.getUTCHours())}30` };
}

interface NcstItem { category?: string; obsrValue?: string | number; }
interface FcstItem { category?: string; fcstDate?: string; fcstTime?: string; fcstValue?: string | number; }

const MISSING = (v: number) => v >= 900 || v <= -900;

/** 초단기실황 items 에서 현재 기온(T1H, ℃). Missing/비정상 범위는 null — 가짜 온도 금지. */
export function extractT1H(items: NcstItem[] | null | undefined): number | null {
  if (!Array.isArray(items)) return null;
  const row = items.find(i => i?.category === "T1H");
  if (!row) return null;
  const v = Number(row.obsrValue);
  if (!Number.isFinite(v) || MISSING(v)) return null;
  // 한반도 실황 정상 범위 밖이면 신뢰하지 않는다(파싱/전송 오류 방어)
  if (v < -40 || v > 45) return null;
  return v;
}

/**
 * 초단기예보 items 에서 "지금"에 해당하는 SKY/PTY.
 * 가장 이른 fcstDate+fcstTime(발표 직후 첫 예보 시각 = 현재 시각대)을 쓴다.
 */
export function extractSkyPty(items: FcstItem[] | null | undefined): { sky: number | null; pty: number | null } {
  if (!Array.isArray(items) || items.length === 0) return { sky: null, pty: null };
  const keyOf = (i: FcstItem) => `${i.fcstDate ?? ""}${i.fcstTime ?? ""}`;
  const usable = items.filter(i => (i.category === "SKY" || i.category === "PTY") && keyOf(i).length === 12);
  if (usable.length === 0) return { sky: null, pty: null };
  const first = usable.map(keyOf).sort()[0]!;
  const pick = (cat: string): number | null => {
    const row = usable.find(i => i.category === cat && keyOf(i) === first);
    if (!row) return null;
    const v = Number(row.fcstValue);
    return Number.isFinite(v) && !MISSING(v) ? v : null;
  };
  return { sky: pick("SKY"), pty: pick("PTY") };
}

/**
 * 아이콘 하나 — SKY/PTY 라는 글자를 사용자에게 보여주지 않는다.
 * PTY 가 실제 강수를 말하면 SKY 보다 우선(결정적 단순 매핑):
 *   비(1)/소나기(4)/빗방울(5) → 🌧️ · 비눈(2)/눈(3)/빗방울눈날림(6)/눈날림(7) → 🌨️
 *   PTY 0 이면 SKY: 맑음(1) → ☀️ · 구름많음(3)/흐림(4) → ☁️
 * 판별 불가면 null — 아이콘을 지어내지 않는다.
 */
export function nowIcon(pty: number | null, sky: number | null): string | null {
  if (pty !== null && pty !== 0) {
    if (pty === 1 || pty === 4 || pty === 5) return "🌧️";
    if (pty === 2 || pty === 3 || pty === 6 || pty === 7) return "🌨️";
    return null;
  }
  if (sky === 1) return "☀️";
  if (sky === 3 || sky === 4) return "☁️";
  return null;
}

/** 화면 표기 — `26°C`(반올림 정수). */
export function formatNowTemp(t: number): string {
  return `${Math.round(t)}°C`;
}
