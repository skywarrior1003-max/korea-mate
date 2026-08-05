// 일정 유형 아이콘 — 점선 타임라인의 기준점.
//
// 승인 시안은 Material Symbols 폰트를 쓰지만 이 저장소에는 아이콘 폰트가 없다.
// 새 폰트를 로드하지 않고 인라인 SVG 로 그린다(B2 에서 정한 방식과 같다).
//
// 아이콘만으로 의미를 전달하지 않는다. 카드에 category 텍스트가 이미 있으면
// 아이콘은 장식이므로 스크린리더에서 숨기고, 없으면 label 을 붙인다.

import { timelineIconKind, type TimelineIconKind } from "@/lib/planner/day-window-core";

const PATHS: Record<TimelineIconKind, React.ReactNode> = {
  // 나이프·포크
  food: <><path d="M7 3v8M5 3v4a2 2 0 0 0 2 2M9 3v4a2 2 0 0 1-2 2M7 11v10" /><path d="M17 3c-1.7 1.2-2.5 3-2.5 5.5S15.3 13 17 14v7" /></>,
  // 카메라
  camera: <><path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2.2l1.2-2h6.2l1.2 2h2.2A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z" /><circle cx="12" cy="13" r="3.4" /></>,
  // 잎사귀
  nature: <><path d="M5 20c0-8 5-13 14-14 .6 7-3 14-10 14-1.6 0-3-.6-4-1.6z" /><path d="M8 17c2.5-3.2 5.5-5.4 9-6.8" /></>,
  // 달력
  event: <><rect x="3.5" y="5" width="17" height="15" rx="2.2" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  // 침대
  stay: <><path d="M3 18v-8M3 13h18v5M21 18v-4a3 3 0 0 0-3-3h-7v2" /><circle cx="7" cy="10" r="2" /></>,
  // 버스
  transit: <><rect x="4.5" y="3.5" width="15" height="13" rx="2.4" /><path d="M4.5 11h15M7 20v-2M17 20v-2" /><circle cx="8" cy="14" r="1" /><circle cx="16" cy="14" r="1" /></>,
  // 지도 핀
  pin: <><path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z" /><circle cx="12" cy="10" r="2.4" /></>,
};

interface Props {
  category?: string | null;
  subcategory?: string | null;
  /** 같은 의미가 텍스트로 이미 있으면 비워 둔다 — 중복 낭독을 만들지 않는다. */
  label?: string;
  size?: number;
  className?: string;
}

export default function TimelineIcon({ category, subcategory, label, size = 18, className }: Props) {
  const kind = timelineIconKind(category, subcategory);
  const decorative = !label;
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"
      className={className}
      aria-hidden={decorative ? true : undefined}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : label}
    >
      {PATHS[kind]}
    </svg>
  );
}

export { timelineIconKind };
