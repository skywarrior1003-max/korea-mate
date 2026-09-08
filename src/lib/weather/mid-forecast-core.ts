// 기상청 중기예보(MidFcstInfoService, 공공데이터포털) — 순수 코어.
//
// Owner 확정(2026-09-09): 날씨 provider = 공공데이터 KMA API. 이 계정 키로
// 활용신청·실호출 검증된 서비스는 **중기예보**다(초단기실황은 미신청 403 —
// "현재기온" 칩은 그 서비스 신청 후에만 가능하다. 값을 지어내지 않는다).
//
// 중기예보 계약(공식 가이드 241128 + 구역코드 xlsx 2025.12 실측):
//   · 발표(tmFc): 매일 06:00 · 18:00 (KST)
//   · 제공 범위: 발표일 기준 +4 ~ +10일
//   · getMidTa(도시 regId)  → taMin{4..10} / taMax{4..10}
//   · getMidLandFcst(광역 regId) → wf{4..7}Am/Pm · wf{8..10}(하루 단위)
//
// 이 파일은 네트워크를 모른다 — 시각/구역/파싱/아이콘 규칙만 담는다.

/** 공식 구역코드(xlsx 원문 그대로) — 이름 유추 금지, 표에서 옮겨 적은 값이다. */
export const CITY_MID_REG: Record<string, { ta: string; land: string }> = {
  busan:    { ta: "11H20201", land: "11H20000" }, // 부산 / 부산·울산·경남
  seoul:    { ta: "11B10101", land: "11B00000" }, // 서울 / 서울·인천·경기
  jeju:     { ta: "11G00201", land: "11G00000" }, // 제주 / 제주도
  gyeongju: { ta: "11H10202", land: "11H10000" }, // 경주 / 대구·경북
  jeonju:   { ta: "11F10201", land: "11F10000" }, // 전주 / 전북
};

/** 최근 발표시각. 06시 전이면 전일 1800, 18시 전이면 당일 0600, 이후는 당일 1800. */
export function latestTmFc(nowKst: Date): string {
  const y = nowKst.getUTCFullYear(), mo = nowKst.getUTCMonth(), d = nowKst.getUTCDate();
  const h = nowKst.getUTCHours();
  if (h < 6) {
    const prev = new Date(Date.UTC(y, mo, d - 1));
    return `${ymd(prev)}1800`;
  }
  return `${ymd(nowKst)}${h < 18 ? "0600" : "1800"}`;
}
const ymd = (d: Date) =>
  `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;

/** 대상 날짜의 발표 기준 offset. 제공 창(4~10) 밖이면 null — 지어내지 않는다. */
export function midDayOffset(tmFc: string, targetDate: string): number | null {
  const base = Date.UTC(+tmFc.slice(0, 4), +tmFc.slice(4, 6) - 1, +tmFc.slice(6, 8));
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(targetDate);
  if (!m) return null;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const off = Math.round((t - base) / 86400000);
  return off >= 4 && off <= 10 ? off : null;
}

export type WxIcon = "sun" | "cloud" | "overcast" | "rain" | "snow";

/** 공식 문구 → 아이콘. 목록 밖 문구는 cloud 로 안전 수렴(발명 없음 — 표시 축소만). */
export function wxToIcon(wf: string | null | undefined): WxIcon | null {
  if (!wf) return null;
  if (/눈/.test(wf)) return "snow";
  if (/비|소나기/.test(wf)) return "rain";
  if (/흐림/.test(wf)) return "overcast";
  if (/구름/.test(wf)) return "cloud";
  if (/맑음/.test(wf)) return "sun";
  return "cloud";
}

export interface MidDayForecast {
  taMin: number;
  taMax: number;
  /** 오전/오후 대표 문구(8~10일차는 하루 단위 문구가 양쪽에 온다) */
  wxAm: string | null;
  wxPm: string | null;
  icon: WxIcon;
}

/** API item 에서 offset 일차 값을 꺼낸다. 숫자가 깨졌으면 null(무해 실패). */
export function extractMidDay(
  taItem: Record<string, unknown> | null | undefined,
  landItem: Record<string, unknown> | null | undefined,
  offset: number,
): MidDayForecast | null {
  if (!taItem) return null;
  const taMin = num(taItem[`taMin${offset}`]);
  const taMax = num(taItem[`taMax${offset}`]);
  if (taMin === null || taMax === null) return null;
  const wxAm = offset <= 7 ? str(landItem?.[`wf${offset}Am`]) : str(landItem?.[`wf${offset}`]);
  const wxPm = offset <= 7 ? str(landItem?.[`wf${offset}Pm`]) : str(landItem?.[`wf${offset}`]);
  // 아이콘은 낮(오후) 우선 — 여행자는 낮 시간대를 산다. 없으면 오전.
  const icon = wxToIcon(wxPm) ?? wxToIcon(wxAm) ?? "cloud";
  return { taMin, taMax, wxAm, wxPm, icon };
}

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
