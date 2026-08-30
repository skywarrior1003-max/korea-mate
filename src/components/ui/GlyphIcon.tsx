// 작은 UI 글리프 — emoji 대신 쓰는 인라인 SVG.
//
// 승인 시안은 Material Symbols 폰트를 쓰지만 이 저장소에는 아이콘 폰트가 없다.
// TimelineIcon(planner) 과 같은 방식으로 24 viewBox·stroke 1.9 선 아이콘을 그린다.
// 새 아이콘 시스템이 아니다 — emoji 가 아이콘 노릇을 하던 자리(연필·휴지통·자물쇠·
// 시계·지도·카메라·위치·구름)만 채운다. 의미가 옆의 텍스트로 이미 전달되면 장식(aria-hidden),
// 아니면 label 을 붙인다.

export type GlyphKind = "pencil" | "trash" | "lock" | "clock" | "map" | "camera" | "pin" | "cloud";

const PATHS: Record<GlyphKind, React.ReactNode> = {
  pencil: <><path d="M4 20l4.2-.9L19.4 7.9a1.6 1.6 0 0 0 0-2.3l-1-1a1.6 1.6 0 0 0-2.3 0L4.9 15.8z" /><path d="M14.5 6.2l3.3 3.3" /></>,
  trash:  <><path d="M4 7h16M9.5 7V4.5h5V7M6 7l.9 12.2A1.5 1.5 0 0 0 8.4 20.5h7.2a1.5 1.5 0 0 0 1.5-1.3L18 7" /><path d="M10 11v6M14 11v6" /></>,
  lock:   <><rect x="5" y="10.5" width="14" height="10" rx="2" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /></>,
  clock:  <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  map:    <><path d="M9 4.5L3.5 6.5v13L9 17.5l6 2 5.5-2v-13L15 6.5z" /><path d="M9 4.5v13M15 6.5v13" /></>,
  camera: <><path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2.2l1.2-2h6.2l1.2 2h2.2A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z" /><circle cx="12" cy="13" r="3.2" /></>,
  pin:    <><path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z" /><circle cx="12" cy="10" r="2.4" /></>,
  cloud:  <><path d="M7 18.5h10a4 4 0 0 0 .6-7.95A5.5 5.5 0 0 0 7.1 9.6 4.5 4.5 0 0 0 7 18.5z" /></>,
};

interface Props {
  kind: GlyphKind;
  /** 같은 의미가 텍스트로 이미 있으면 비워 둔다 — 중복 낭독을 만들지 않는다. */
  label?: string;
  size?: number;
  className?: string;
}

export default function GlyphIcon({ kind, label, size = 16, className }: Props) {
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
