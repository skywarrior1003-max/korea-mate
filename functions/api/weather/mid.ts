// GET /api/weather/mid?city=busan&date=YYYY-MM-DD
//
// 기상청 중기예보(공공데이터포털 MidFcstInfoService) 프록시 — Owner 확정 provider.
// 계약:
//   · 키는 서버 전용(ctx.env). 출력·로그 금지. 클라이언트로 절대 내려가지 않는다.
//   · 제공 창(발표 +4~+10일) 밖·API 실패·파싱 실패 = 전부 200 {available:false}.
//     실패는 무해해야 하고, 가짜 온도는 만들지 않는다(STAGE A 정직 원칙 유지).
//   · 캐시: 발표는 하루 2회뿐이라 s-maxage 30분이면 충분하다.

import {
  CITY_MID_REG, latestTmFc, midDayOffset, extractMidDay,
} from "../../../src/lib/weather/mid-forecast-core";

interface Env {
  KMA_API_KEY?: string;
  TOUR_API_KEY?: string; // 같은 data.go.kr 계정 키 — 전용 키 없으면 이걸 쓴다
}

const BASE = "https://apis.data.go.kr/1360000/MidFcstInfoService";
const HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "public, s-maxage=1800, max-age=600",
};
const unavailable = () => new Response(JSON.stringify({ available: false }), { status: 200, headers: HEADERS });

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const url = new URL(ctx.request.url);
  const city = (url.searchParams.get("city") ?? "").toLowerCase().trim();
  const date = (url.searchParams.get("date") ?? "").trim();
  const reg = CITY_MID_REG[city];
  const key = ctx.env.KMA_API_KEY ?? ctx.env.TOUR_API_KEY;
  if (!reg || !key) return unavailable();

  const tmFc = latestTmFc(new Date(Date.now() + 9 * 3600 * 1000));
  const offset = midDayOffset(tmFc, date);
  if (offset === null) return unavailable();

  const call = async (path: string, regId: string): Promise<Record<string, unknown> | null> => {
    try {
      const r = await fetch(
        `${BASE}/${path}?serviceKey=${encodeURIComponent(key)}&dataType=JSON&numOfRows=10&pageNo=1&regId=${regId}&tmFc=${tmFc}`,
        { signal: AbortSignal.timeout(6000) },
      );
      if (!r.ok) return null;
      const j = (await r.json()) as {
        response?: { header?: { resultCode?: string }; body?: { items?: { item?: Record<string, unknown>[] } } };
      };
      if (j.response?.header?.resultCode !== "00") return null;
      return j.response?.body?.items?.item?.[0] ?? null;
    } catch {
      return null;
    }
  };

  const [ta, land] = await Promise.all([call("getMidTa", reg.ta), call("getMidLandFcst", reg.land)]);
  const day = extractMidDay(ta, land, offset);
  if (!day) return unavailable();

  return new Response(
    JSON.stringify({ available: true, city, date, taMin: day.taMin, taMax: day.taMax, icon: day.icon, wxAm: day.wxAm, wxPm: day.wxPm }),
    { status: 200, headers: HEADERS },
  );
};
