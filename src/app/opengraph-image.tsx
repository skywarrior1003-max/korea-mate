// gokoreamate — build-time OG image (1200×630 PNG)
// TASK-025: SNS 링크 프리뷰 강화 (Facebook · Twitter · LinkedIn · Discord · Slack)

import { ImageResponse } from "next/og";

// output: "export" 정적 익스포트 환경 필수 선언
export const dynamic = "force-static";

export const alt = "gokoreamate — Plan · Capture · Share Your Korea Story";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OGImage() {
  const gold = "#D4AF37";
  const dark = "#1a1a2e";

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: `linear-gradient(135deg, ${dark} 0%, #16213e 55%, #0f3460 100%)`,
          fontFamily: "system-ui, -apple-system, sans-serif",
          padding: "60px",
          position: "relative",
        }}
      >
        {/* Top badge */}
        <div
          style={{
            border: "1.5px solid rgba(255,255,255,0.2)",
            borderRadius: "18px",
            padding: "8px 22px",
            marginBottom: "28px",
            display: "flex",
          }}
        >
          <span
            style={{
              color: "rgba(255,255,255,0.5)",
              fontSize: "13px",
              fontWeight: "700",
              letterSpacing: "2.5px",
            }}
          >
            AI TRAVEL PLATFORM
          </span>
        </div>

        {/* Korea flag accent bars */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "22px" }}>
          <div style={{ width: "8px", height: "30px", borderRadius: "4px", background: "#CD2E3A" }} />
          <div style={{ width: "8px", height: "30px", borderRadius: "4px", background: "rgba(255,255,255,0.55)" }} />
          <div style={{ width: "8px", height: "30px", borderRadius: "4px", background: "#0047A0" }} />
          <span
            style={{
              color: "rgba(255,255,255,0.32)",
              fontSize: "19px",
              fontWeight: "800",
              marginLeft: "10px",
              letterSpacing: "3px",
              display: "flex",
            }}
          >
            KOREA
          </span>
        </div>

        {/* Main headline */}
        <div
          style={{
            fontSize: "76px",
            fontWeight: "900",
            color: "#ffffff",
            letterSpacing: "-1.5px",
            marginBottom: "18px",
            display: "flex",
            lineHeight: 1,
          }}
        >
          Your Korea Story
        </div>

        {/* Gold divider */}
        <div
          style={{
            width: "280px",
            height: "2px",
            background: gold,
            opacity: 0.65,
            marginBottom: "26px",
          }}
        />

        {/* Subheadline */}
        <div
          style={{
            fontSize: "30px",
            color: "rgba(255,255,255,0.6)",
            fontWeight: "400",
            marginBottom: "48px",
            display: "flex",
          }}
        >
          Plan it. Live it. Share it in 1 tap.
        </div>

        {/* 3-step chips */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {/* Step 1 */}
          <div
            style={{
              border: `1.2px solid rgba(212,175,55,0.4)`,
              borderRadius: "18px",
              padding: "14px 24px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              background: "rgba(255,255,255,0.07)",
              minWidth: "210px",
            }}
          >
            <span style={{ fontSize: "14px", fontWeight: "800", color: gold, letterSpacing: "1px", display: "flex" }}>
              AI PLANS IT
            </span>
            <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.42)", marginTop: "4px", display: "flex" }}>
              Day-by-day itinerary
            </span>
          </div>

          {/* Arrow */}
          <div style={{ fontSize: "20px", color: "rgba(255,255,255,0.22)", display: "flex" }}>→</div>

          {/* Step 2 */}
          <div
            style={{
              border: `1.2px solid rgba(212,175,55,0.4)`,
              borderRadius: "18px",
              padding: "14px 24px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              background: "rgba(255,255,255,0.07)",
              minWidth: "230px",
            }}
          >
            <span style={{ fontSize: "14px", fontWeight: "800", color: gold, letterSpacing: "1px", display: "flex" }}>
              YOU CAPTURE IT
            </span>
            <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.42)", marginTop: "4px", display: "flex" }}>
              GPS + Photo + Memo
            </span>
          </div>

          {/* Arrow */}
          <div style={{ fontSize: "20px", color: "rgba(255,255,255,0.22)", display: "flex" }}>→</div>

          {/* Step 3 */}
          <div
            style={{
              border: `1.2px solid rgba(212,175,55,0.4)`,
              borderRadius: "18px",
              padding: "14px 24px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              background: "rgba(255,255,255,0.07)",
              minWidth: "220px",
            }}
          >
            <span style={{ fontSize: "14px", fontWeight: "800", color: gold, letterSpacing: "1px", display: "flex" }}>
              SHARE THE STORY
            </span>
            <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.42)", marginTop: "4px", display: "flex" }}>
              Instagram · TikTok · X
            </span>
          </div>
        </div>

        {/* Bottom divider */}
        <div
          style={{
            width: "1040px",
            height: "1px",
            background: gold,
            opacity: 0.18,
            marginTop: "46px",
            marginBottom: "18px",
          }}
        />

        {/* Domain */}
        <div
          style={{
            fontSize: "24px",
            fontWeight: "800",
            color: "rgba(255,255,255,0.26)",
            letterSpacing: "1px",
            display: "flex",
          }}
        >
          gokoreamate.com
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
