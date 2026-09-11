// GET /api/weather/now?city=busan
//
// City Hub `☀️ 26°C` 한 줄용 — 기상청 단기예보 조회서비스(초단기실황+초단기예보)
// 프록시 (POST-ACCEPTANCE-CITY-HUB-WEATHER-V1). mid.ts 와 같은 안전 계약:
//   · 키는 서버 전용(ctx.env.KMA_API_KEY, 기존 키 재사용 — 새 키 발급 금지 계약).
//     출력·로그·클라이언트 노출 0.
//   · 위치는 GPS 가 아니라 요청된 도시의 공식 대표 격자(nx/ny 고정).
//   · 실패/timeout/malformed/Missing = 전부 200 {available:false} —
//     가짜 온도·가짜 아이콘 생성 금지.
//   · 캐시: 실황은 매시 정시 발표·10분 단위 갱신 — s-maxage 600 이면
//     최신성(≤10분 지연)과 호출량을 동시에 지킨다. 렌더마다 KMA 직행 없음.

import {
  CITY_NOW_GRID, latestNcstBase, latestFcstBase,
  extractT1H, extractSkyPty, nowIcon,
} from "../../../src/lib/weather/city-now-core";

interface Env {
  KMA_API_KEY?: string;
  TOUR_API_KEY?: string; // mid.ts 와 같은 fallback — 같은 data.go.kr 계정 키
}

const BASE = "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0";
const HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "public, s-maxage=600, max-age=300",
};
const unavailable = () => new Response(JSON.stringify({ available: false }), { status: 200, headers: HEADERS });

interface KmaBody { response?: { header?: { resultCode?: string }; body?: { items?: { item?: unknown[] } } } }

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const url = new URL(ctx.request.url);
  const city = (url.searchParams.get("city") ?? "").toLowerCase().trim();
  const grid = CITY_NOW_GRID[city];
  const key = ctx.env.KMA_API_KEY ?? ctx.env.TOUR_API_KEY;
  if (!grid || !key) return unavailable();

  const nowKst = new Date(Date.now() + 9 * 3600 * 1000);
  const ncst = latestNcstBase(nowKst);
  const fcst = latestFcstBase(nowKst);

  const call = async (op: string, base: { base_date: string; base_time: string }, rows: number): Promise<unknown[] | null> => {
    try {
      const r = await fetch(
        `${BASE}/${op}?serviceKey=${encodeURIComponent(key)}&dataType=JSON&numOfRows=${rows}&pageNo=1` +
        `&base_date=${base.base_date}&base_time=${base.base_time}&nx=${grid.nx}&ny=${grid.ny}`,
        { signal: AbortSignal.timeout(6000) },
      );
      if (!r.ok) return null;
      const j = (await r.json()) as KmaBody;
      if (j.response?.header?.resultCode !== "00") return null;
      return j.response?.body?.items?.item ?? null;
    } catch { return null; }
  };

  const [ncstItems, fcstItems] = await Promise.all([
    call("getUltraSrtNcst", ncst, 10),
    call("getUltraSrtFcst", fcst, 60),
  ]);

  const temp = extractT1H(ncstItems as never);
  if (temp === null) return unavailable(); // 현재 기온을 정직하게 못 얻으면 숨긴다

  const { sky, pty } = extractSkyPty(fcstItems as never);
  const icon = nowIcon(pty, sky);

  return new Response(
    JSON.stringify({
      available: true, city, temp, icon,
      // QA/관측용 비민감 메타 — 키·사용자 정보 없음
      meta: { nx: grid.nx, ny: grid.ny, base_date: ncst.base_date, base_time: ncst.base_time },
    }),
    { status: 200, headers: HEADERS },
  );
};
