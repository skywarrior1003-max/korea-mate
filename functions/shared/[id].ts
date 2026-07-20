// gokoreamate — Cloudflare Pages Function: /shared/[id]
// TASK-027: SNS 크롤러 봇 감지 → Supabase REST 직접 조회 → 동적 OG 태그 주입
// 일반 유저 요청은 정적 쉘(out/shared/index.html)로 passthrough (TASK-026 보존)

interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  NEXT_PUBLIC_SUPABASE_URL: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY: string;
}

interface ItineraryRow {
  city:         string;
  start_date:   string;
  end_date:     string;
  travel_style: string;
  days:         unknown[];
}

// ── 크롤러 봇 User-Agent 패턴 ─────────────────────────────────────────────────
const BOT_UA_PATTERNS: RegExp[] = [
  /facebookexternalhit/i,  // Facebook / Instagram
  /twitterbot/i,           // X (Twitter)
  /linkedinbot/i,          // LinkedIn
  /discordbot/i,           // Discord
  /telegrambot/i,          // Telegram
  /whatsapp/i,             // WhatsApp
  /slackbot/i,             // Slack
  /line\//i,               // LINE
  /googlebot/i,            // Google
  /bingbot/i,              // Bing
  /applebot/i,             // Apple
  /yeti/i,                 // Naver 검색봇
];

function isCrawlerBot(ua: string): boolean {
  return BOT_UA_PATTERNS.some((re) => re.test(ua));
}

// ── HTML 특수문자 이스케이프 (XSS 방어) ─────────────────────────────────────
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ── 봇 전용 OG HTML 생성기 ───────────────────────────────────────────────────
function buildBotHtml(meta: {
  title:       string;
  description: string;
  ogImage:     string;
  url:         string;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${esc(meta.title)}</title>
  <meta property="og:type"         content="website" />
  <meta property="og:title"        content="${esc(meta.title)}" />
  <meta property="og:description"  content="${esc(meta.description)}" />
  <meta property="og:image"        content="${esc(meta.ogImage)}" />
  <meta property="og:url"          content="${esc(meta.url)}" />
  <meta property="og:site_name"    content="gokoreamate.com" />
  <meta name="twitter:card"        content="summary_large_image" />
  <meta name="twitter:title"       content="${esc(meta.title)}" />
  <meta name="twitter:description" content="${esc(meta.description)}" />
  <meta name="twitter:image"       content="${esc(meta.ogImage)}" />
  <link rel="canonical"            href="${esc(meta.url)}" />
</head>
<body></body>
</html>`;
}

// ── 핵심 Pages Function ───────────────────────────────────────────────────────
export const onRequest: (context: {
  params:  Record<string, string | string[]>;
  request: Request;
  env:     Env;
}) => Promise<Response> = async ({ params, request, env }) => {
  const rawId     = params["id"];
  const shareId   = typeof rawId === "string" ? rawId : (rawId?.[0] ?? "");
  const userAgent = request.headers.get("user-agent") ?? "";

  // 일반 유저 또는 ID 없음 → 정적 쉘 passthrough (TASK-026 하이드레이션 보존)
  if (!shareId || !isCrawlerBot(userAgent)) {
    const shellUrl = new URL("/shared/", request.url);
    return env.ASSETS.fetch(new Request(shellUrl.toString(), request));
  }

  // 봇 요청 → 동적 OG HTML 생성
  // TASK-029: 도시별 정적 OG 이미지 맵 (build-time PNG)
  const CITY_OG_IMAGE: Record<string, string> = {
    seoul:    "https://gokoreamate.com/og/seoul/opengraph-image.png",
    busan:    "https://gokoreamate.com/og/busan/opengraph-image.png",
    jeju:     "https://gokoreamate.com/og/jeju/opengraph-image.png",
    gyeongju: "https://gokoreamate.com/og/gyeongju/opengraph-image.png",
  };
  const FALLBACK_OG = "https://gokoreamate.com/opengraph-image.png";
  const CANONICAL   = `https://gokoreamate.com/shared/${shareId}`;

  let trip: ItineraryRow | undefined;
  let title       = "AI Korea Trip Planner — gokoreamate.com";
  let description = "Plan, capture & share your Korea trip story with AI. Free · No sign-up required.";

  try {
    // TASK-SEC-02: 직접 테이블 REST 호출 → SECURITY DEFINER RPC 교체
    // get_shared_itinerary: device_id / email 미반환, search_path 고정
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_RE.test(shareId)) throw new Error("invalid_uuid");

    const endpoint = `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/get_shared_itinerary`;

    // 3초 타임아웃 — 초과 시 catch로 넘어가 기본값 OG 반환
    const res = await Promise.race<Response>([
      fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey:         env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
          Authorization:  `Bearer ${env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ p_id: shareId }),
      }),
      new Promise<Response>((_, reject) =>
        setTimeout(() => reject(new Error("supabase_timeout")), 3000)
      ),
    ]);

    if (res.ok) {
      const rows = (await res.json()) as ItineraryRow[];
      trip       = rows[0];

      if (trip) {
        const cityCap  = trip.city.charAt(0).toUpperCase() + trip.city.slice(1);
        const dayCount = Array.isArray(trip.days) ? trip.days.length : 0;
        title       = `${cityCap} ${dayCount}-Day Korea Itinerary — gokoreamate.com`;
        description =
          `AI-generated ${cityCap} trip · ${trip.start_date} to ${trip.end_date} · ` +
          `${dayCount} days of curated spots. Plan yours free on gokoreamate.com`;
      }
    }
  } catch {
    // Supabase 타임아웃/네트워크 오류 → 기본값 OG 반환 (크래시 없음)
  }

  const ogImage = CITY_OG_IMAGE[trip?.city?.toLowerCase() ?? ""] ?? FALLBACK_OG;

  return new Response(
    buildBotHtml({ title, description, ogImage, url: CANONICAL }),
    {
      headers: {
        "content-type":  "text/html;charset=UTF-8",
        "cache-control": "public, max-age=300",
      },
    }
  );
};
