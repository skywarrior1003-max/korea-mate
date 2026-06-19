// gokoreamate — 도시별 OG 이미지 공유 JSX 템플릿
// TASK-029: next/og ImageResponse에 전달되는 공통 레이아웃 빌더
// 한글 폰트 미지원 환경 대비 — 텍스트 100% 영문 처리

import type { CityOGConfig } from "./city-og-config";

export function buildCityOGJSX(cfg: CityOGConfig) {
  return (
    <div
      style={{
        width:          "1200px",
        height:         "630px",
        display:        "flex",
        flexDirection:  "column",
        alignItems:     "center",
        justifyContent: "center",
        background:     cfg.bgGradient,
        fontFamily:     "system-ui, -apple-system, Arial, sans-serif",
        padding:        "64px",
        position:       "relative",
      }}
    >
      {/* Top badge */}
      <div
        style={{
          border:       "1.5px solid rgba(255,255,255,0.18)",
          borderRadius: "20px",
          padding:      "8px 28px",
          marginBottom: "36px",
          display:      "flex",
        }}
      >
        <span
          style={{
            color:         "rgba(255,255,255,0.45)",
            fontSize:      "13px",
            fontWeight:    700,
            letterSpacing: "2.5px",
            display:       "flex",
          }}
        >
          gokoreamate · AI TRIP PLANNER
        </span>
      </div>

      {/* City name — large English only */}
      <div
        style={{
          fontSize:      "118px",
          fontWeight:    900,
          color:         "#ffffff",
          letterSpacing: "-3px",
          lineHeight:    1,
          marginBottom:  "16px",
          display:       "flex",
        }}
      >
        {cfg.cityEn}
      </div>

      {/* Accent divider */}
      <div
        style={{
          width:         "100px",
          height:        "3px",
          background:    cfg.accentColor,
          borderRadius:  "2px",
          marginBottom:  "22px",
          opacity:       0.9,
        }}
      />

      {/* Subtitle */}
      <div
        style={{
          fontSize:      "26px",
          color:         "rgba(255,255,255,0.5)",
          fontWeight:    400,
          marginBottom:  "52px",
          display:       "flex",
        }}
      >
        {cfg.subtitle}
      </div>

      {/* Korea flag accent bars */}
      <div
        style={{
          display:       "flex",
          alignItems:    "center",
          gap:           "8px",
          marginBottom:  "36px",
        }}
      >
        <div style={{ width: "8px", height: "28px", borderRadius: "4px", background: "#CD2E3A" }} />
        <div style={{ width: "8px", height: "28px", borderRadius: "4px", background: "rgba(255,255,255,0.5)" }} />
        <div style={{ width: "8px", height: "28px", borderRadius: "4px", background: "#0047A0" }} />
        <span
          style={{
            color:         "rgba(255,255,255,0.25)",
            fontSize:      "15px",
            fontWeight:    800,
            marginLeft:    "12px",
            letterSpacing: "3px",
            display:       "flex",
          }}
        >
          KOREA
        </span>
      </div>

      {/* Horizontal divider */}
      <div
        style={{
          width:         "900px",
          height:        "1px",
          background:    "rgba(255,255,255,0.1)",
          marginBottom:  "20px",
        }}
      />

      {/* Domain */}
      <div
        style={{
          fontSize:      "22px",
          fontWeight:    700,
          color:         "rgba(255,255,255,0.22)",
          letterSpacing: "1px",
          display:       "flex",
        }}
      >
        gokoreamate.com
      </div>
    </div>
  );
}
