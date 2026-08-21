// 여행 달력의 "오늘"과 "지금" — Asia/Seoul 기준. (TASK-MY-TRIPS-FINAL-UI-V1-R1)
//
// 왜 필요한가
//   `new Date().toISOString().slice(0, 10)` 은 UTC 날짜다. 한국 8월 22일 오전에는
//   UTC 가 아직 8월 21일이라, 8/22 에 시작하는 여행이 하루 늦게 "여행 중"이 됐다
//   (실측: 2026-08-22 KST, 8/22~8/24 여행이 Upcoming 으로 표시).
//
// 계약
//   검증 도시(부산·경주·서울·제주·전주)는 모두 한국이다. 여행 날짜(start/end,
//   Day 의 date, 장소 time)는 한국 달력·한국 시각으로 적혀 있으므로, 오늘·지금도
//   같은 기준으로 만든다. 사용자의 브라우저 timezone 이 어디든 같은 여행은 같은
//   상태다. 해외 여행을 지원하게 되면 목적지 timezone 계약으로 넓힌다 — 지금은
//   Asia/Seoul 하나다.

export const TRIP_TIME_ZONE = "Asia/Seoul";

export interface SeoulClock {
  /** "YYYY-MM-DD" — 한국 달력의 오늘 */
  todayISO: string;
  /** "HH:MM" — 한국 시각의 지금 (24시간) */
  nowHHMM:  string;
}

/** 주어진 순간(기본: 지금)을 한국 달력·시각으로. 브라우저 timezone 과 무관하다. */
export function seoulClock(now: Date = new Date()): SeoulClock {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TRIP_TIME_ZONE,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(now);
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? "";
  // 일부 엔진은 자정을 "24" 로 돌려준다 — 날짜는 이미 넘어가 있으므로 "00" 으로 읽는다
  const hour = get("hour") === "24" ? "00" : get("hour");
  return {
    todayISO: `${get("year")}-${get("month")}-${get("day")}`,
    nowHHMM:  `${hour}:${get("minute")}`,
  };
}
