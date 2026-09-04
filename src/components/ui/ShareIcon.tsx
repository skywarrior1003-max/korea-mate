// Share glyph — 전 서비스 단일 원천 (Social Actions 계약: 같은 행동 = 같은 모양).
//
// 모양은 Place Detail 이 써 오던 검증된 트레이+화살(공유 시트 관용 표기)이다.
// Story 의 3-node, 이모지 📤 등 표면마다 다르던 Share 표기를 이 컴포넌트 하나로
// 통일한다. 새 아이콘을 발명한 것이 아니라 기존 것 중 하나를 원천으로 승격했다.
// 의미·동작(share_events 기록, web_share/copy_link 구분)은 여기서 다루지 않는다.

interface ShareIconProps {
  size?: number;
  strokeWidth?: number;
  className?: string;
}

export default function ShareIcon({ size = 15, strokeWidth = 1.9, className }: ShareIconProps) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden
      stroke="currentColor" strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" className={className}
    >
      <path d="M12 16V4M12 4L7.5 8.5M12 4l4.5 4.5" />
      <path d="M5 14v4.5a1.5 1.5 0 001.5 1.5h11a1.5 1.5 0 001.5-1.5V14" />
    </svg>
  );
}
