// 이벤트 목록 노출 판정 — /trending·/all-spots 공용 (REGIONAL-CONTENT-FRESHNESS-V1)
//
// 두 화면이 각자 필터를 두다 보니 /trending 은 날짜를 전혀 보지 않았고, /all-spots 는
// displayUntil 만 보아 endDate 만 있는 행사가 끝난 뒤에도 남았다. 목록에서 빼는 기준을
// 한 곳에 둔다. 공유된 상세 링크를 살리는 일은 각 상세 화면의 몫이다.

export interface ListableEventFields {
  hidden?: boolean;
  displayUntil?: string | null;
  endDate?: string | null;
}

/** today 는 "YYYY-MM-DD"(로컬 기준). 날짜 문자열은 앞 10자리(YYYY-MM-DD)로만 비교한다. */
export function isListableEvent(e: ListableEventFields, today: string): boolean {
  if (e.hidden) return false;
  const day = (v?: string | null) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);
  const until = day(e.displayUntil);
  if (until && until < today) return false;
  const end = day(e.endDate);
  if (end && end < today) return false;
  return true;
}
