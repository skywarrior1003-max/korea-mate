// 한국 날짜(YYYY-MM-DD) — 행사 종료일·표시 기한은 한국 날짜로 적혀 있다.
// UTC 날짜로 비교하면 한국 자정~오전 9시 사이에 전날 기준이 되어 끝난 행사가 9시간 더 남는다.

const KST_OFFSET_MS = 9 * 3_600_000;

export function kstToday(nowMs: number = Date.now()): string {
  return new Date(nowMs + KST_OFFSET_MS).toISOString().slice(0, 10);
}
