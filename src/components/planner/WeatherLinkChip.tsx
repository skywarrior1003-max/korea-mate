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

/** STAGE B — 중기예보(공공데이터 KMA) 일자별 값. 코어의 아이콘 어휘를 그대로 쓴다. */
export interface DayForecast {
  taMin: number;
  taMax: number;
  icon: "sun" | "cloud" | "overcast" | "rain" | "snow";
}

interface Props {
  /** "날씨 보기" 등 locale 문구 — forecast 없을 때(STAGE A)의 표기 */
  label: string;
  /** 외부 링크임을 알리는 접근성 문구 */
  ariaLabel: string;
  /**
   * STAGE B: 이 Day 의 중기예보. 있으면 "16 / 27°C" + 날씨 아이콘으로 표기한다.
   * 없으면(제공 창 밖·API 실패) 기존 STAGE A 링크 표기 그대로 — 값을 지어내지 않는다.
   */
  forecast?: DayForecast | null;
  className?: string;
}

/** 예보 아이콘 — emoji 대신 stroke SVG(디자인 SSOT의 quiet 아이콘 규칙). */
function WxGlyph({ icon }: { icon: DayForecast["icon"] }) {
  const common = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none" as const, "aria-hidden": true,
    stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (icon === "sun") return (
    <svg {...common}><circle cx="12" cy="12" r="4.2" /><path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M19.1 4.9l-1.7 1.7M6.6 17.4l-1.7 1.7" /></svg>);
  if (icon === "rain") return (
    <svg {...common}><path d="M7 15h9.5a3.5 3.5 0 0 0 .4-6.98A5.5 5.5 0 0 0 6.6 7.2 3.9 3.9 0 0 0 7 15z" /><path d="M8.5 18l-1 2.4M12.5 18l-1 2.4M16.5 18l-1 2.4" /></svg>);
  if (icon === "snow") return (
    <svg {...common}><path d="M7 14h9.5a3.5 3.5 0 0 0 .4-6.98A5.5 5.5 0 0 0 6.6 6.2 3.9 3.9 0 0 0 7 14z" /><path d="M9 17.5v.01M12.5 19v.01M16 17.5v.01" strokeWidth="2.6" /></svg>);
  // cloud · overcast — overcast 는 살짝 두꺼운 구름 한 겹 추가
  return (
    <svg {...common}><path d="M7 18h9.5a3.5 3.5 0 0 0 .4-6.98A5.5 5.5 0 0 0 6.6 10.2 3.9 3.9 0 0 0 7 18z" />{icon === "overcast" ? <path d="M9 7.2a4.6 4.6 0 0 1 7.4 1.4" opacity=".6" /> : null}</svg>);
}

export default function WeatherLinkChip({ label, ariaLabel, forecast = null, className }: Props) {
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
      {forecast ? (
        <>
          {/* STAGE B — 그 날짜의 실제 중기예보(최저/최고). 공식 API 값 그대로다. */}
          <WxGlyph icon={forecast.icon} />
          <span className="whitespace-nowrap tabular-nums">{forecast.taMin} / {forecast.taMax}°C</span>
        </>
      ) : (
        <>
          {/* 구름 — 실제 예보가 아니므로 특정 날씨를 뜻하지 않는 중립 아이콘 */}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden
               stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 18h9.5a3.5 3.5 0 0 0 .4-6.98A5.5 5.5 0 0 0 6.6 10.2 3.9 3.9 0 0 0 7 18z" />
          </svg>
          <span className="whitespace-nowrap">{label}</span>
        </>
      )}
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
