// 날씨 칩 — STAGE A.
//
// 지금은 실제 예보를 부르지 않는다. API key 도, 검증된 KMA 연동도 없기 때문이다.
// 그래서 기온을 지어내지 않고 "날씨 보기" 만 보여준 뒤 기상청 공식 페이지로 보낸다.
// 가짜 18°C 를 띄우는 것보다 정직한 링크가 낫다.
//
// STAGE B 에서 실제 예보가 붙으면 이 컴포넌트에 temperature·condition prop 을
// 더하면 되도록 형태만 맞춰 두었다. 지금은 최소 prop 만 받는다.
//
// 링크 주소에 대하여 (2026-08-05 실측)
//   https://www.weather.go.kr/w/index.do            200 · 공식 날씨누리 홈
//   https://www.weather.go.kr/w/eng/index.do        200 이지만 html lang=ko,
//                                                   title "기상청 날씨누리", 한글 3,511자
//                                                   → 실제 영문 페이지가 아니다
//   web.kma.go.kr/eng 는 도메인이 달라 이번 허용 범위(weather.go.kr) 밖이다
// 따라서 검증되지 않은 locale 주소를 지어내지 않고, 모든 언어에서 검증된 공식
// 홈 하나만 쓴다.

const KMA_OFFICIAL_URL = "https://www.weather.go.kr/w/index.do";

interface Props {
  /** "날씨 보기" 등 locale 문구 */
  label: string;
  /** 외부 링크임을 알리는 접근성 문구 */
  ariaLabel: string;
  className?: string;
}

export default function WeatherLinkChip({ label, ariaLabel, className }: Props) {
  return (
    <a
      href={KMA_OFFICIAL_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={ariaLabel}
      className={
        "gkm-focus inline-flex items-center gap-1.5 shrink-0 min-h-11 px-3 rounded-full " +
        "text-[13px] font-bold transition-colors " +
        (className ?? "")
      }
      style={{ backgroundColor: "var(--gkm-action-tint)", color: "var(--gkm-action-primary)" }}
    >
      {/* 구름 — 실제 예보가 아니므로 특정 날씨를 뜻하지 않는 중립 아이콘 */}
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden
           stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 18h9.5a3.5 3.5 0 0 0 .4-6.98A5.5 5.5 0 0 0 6.6 10.2 3.9 3.9 0 0 0 7 18z" />
      </svg>
      <span className="whitespace-nowrap">{label}</span>
      {/* 외부 링크 표시 */}
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0 opacity-70"
           stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 5h5v5M19 5l-8 8" />
        <path d="M18 14v4.5A1.5 1.5 0 0 1 16.5 20h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" />
      </svg>
    </a>
  );
}

export { KMA_OFFICIAL_URL };
