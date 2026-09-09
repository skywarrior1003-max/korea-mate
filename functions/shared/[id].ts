// gokoreamate — Cloudflare Pages Function: /shared/[id]
// TASK-027: SNS 크롤러 봇 감지 → Supabase REST 직접 조회 → 동적 OG 태그 주입
// 일반 유저 요청은 정적 쉘(out/shared/index.html)로 passthrough (TASK-026 보존)

// TASK-SHARE-OG-PREVIEW-FIX-01: 관광 커버일 때 og:image:width/height 를 내보내기
// 위해 커버 자산 결정을 프록시와 같은 순수 함수로 계산한다. manifest 의 실측
// 치수만 사용한다 — 개인 사진 커버는 치수를 알 수 없어 (업로드 시 비율 보존
// 리사이즈, 고정 규격 없음) 추측하지 않고 생략한다.
import { COVER_ASSETS } from "../../src/lib/trip-cover/assets.data";
import { resolveTourismCoverAsset } from "../../src/lib/trip-cover/cover-core";
// SHARING-VISUAL-PRODUCTION-V1 — 제목/설명/이미지 규칙은 9:16 카드와 같은 코어를 쓴다
import {
  shareTitle, shareDescription, countDaysPlaces, cityShareFallback, BRAND_OG,
} from "../../src/lib/share/sharing-visual-core";
import { representativeCoverUrl, type ApiStory, type ApiMemory } from "../../src/lib/share/story-adapter";

interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  NEXT_PUBLIC_SUPABASE_URL: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

interface ItineraryRow {
  city:         string;
  start_date:   string;
  end_date:     string;
  travel_style: string;
  /** 사용자의 실제 Trip 제목 — OG 의 primary title (SHARING-VISUAL-PRODUCTION-V1) */
  trip_title?:  string | null;
  days:         unknown[];
  // TASK-TRIP-COVER-V1B: OG 캐시 버전용. RPC 는 이미 반환하지만 타입에 없었다.
  updated_at?:  string;
  // TASK-SHARE-OG-PREVIEW-FIX-01: og:image 치수 결정용 (migration 031 컬럼)
  cover_kind?:     string | null;
  cover_asset_id?: string | null;
}

// ── v2 days 파싱 — { __v:2, scheduled: unknown[] } 또는 legacy 배열 모두 지원 ─
function getScheduledDayCount(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (
    value !== null &&
    typeof value === "object" &&
    (value as { __v?: number }).__v === 2
  ) {
    const scheduled = (value as { scheduled?: unknown }).scheduled;
    if (Array.isArray(scheduled)) return scheduled.length;
  }
  return 0;
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
  // manifest 실측 치수를 알 때만 전달된다 — 추측값 금지
  ogImageWidth?:  number;
  ogImageHeight?: number;
}): string {
  const ogImageDims =
    meta.ogImageWidth && meta.ogImageHeight
      ? `
  <meta property="og:image:width"  content="${meta.ogImageWidth}" />
  <meta property="og:image:height" content="${meta.ogImageHeight}" />`
      : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${esc(meta.title)}</title>
  <meta name="description"         content="${esc(meta.description)}" />
  <meta property="og:type"         content="website" />
  <meta property="og:title"        content="${esc(meta.title)}" />
  <meta property="og:description"  content="${esc(meta.description)}" />
  <meta property="og:image"        content="${esc(meta.ogImage)}" />${ogImageDims}
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
  // TASK-029 의 도시별 OG 맵(seoul/busan/jeju/gyeongju)은 여기서 제거했다.
  // 유일한 참조가 `trip` 이 falsy 인 분기 안의 `trip?.city` 였고, 그 자리에서
  // 도시를 알 수 없어 한 번도 선택된 적이 없다. 도시별 OG 를 살리려면
  // 도시를 알 수 있는 지점에서 다시 설계해야 한다 — 이번 작업 범위가 아니다.
  const FALLBACK_OG = BRAND_OG.image;
  const CANONICAL   = `https://gokoreamate.com/shared/${shareId}`;

  let trip: ItineraryRow | undefined;
  // 여행이 없거나 비공개면 브랜드 기본 메타만 — 여행 정보 노출 금지
  let title       = BRAND_OG.title;
  let description = BRAND_OG.description;
  /** 공개 순간이 결합된 장소(city_spot_id) — 대표 카탈로그 이미지 가중치용 */
  let publicSpotIds: number[] = [];

  try {
    // 예전에는 anon 키로 `get_shared_itinerary` RPC 를 불렀다. 그 RPC 의 anon
    // 권한은 곧 회수되므로(다음 작업) 여기부터 service_role 읽기로 옮긴다.
    // 공개 여부는 RPC 가 대신 강제해 주던 것이라 이제 조건을 직접 건다 —
    // `is_public=eq.true` 가 빠지면 비공개 일정 제목이 OG 로 새 나간다.
    //
    // 읽는 컬럼은 OG 문구에 쓰는 것뿐이다. `days` 는 일수를 세는 데만 쓰고
    // 응답 HTML 에 담기지 않는다. device_id·email 은 아예 가져오지 않는다.
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_RE.test(shareId)) throw new Error("invalid_uuid");

    const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) throw new Error("not_configured");

    const endpoint =
      `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/itineraries` +
      `?id=eq.${shareId}&is_public=eq.true&moderation_hidden_at=is.null&limit=1` +
      `&select=city,start_date,end_date,travel_style,trip_title,days,updated_at,cover_kind,cover_asset_id`;

    // 3초 타임아웃 — 초과 시 catch로 넘어가 기본값 OG 반환
    const res = await Promise.race<Response>([
      fetch(endpoint, {
        headers: {
          apikey:        serviceKey,
          Authorization: `Bearer ${serviceKey}`,
        },
      }),
      new Promise<Response>((_, reject) =>
        setTimeout(() => reject(new Error("supabase_timeout")), 3000)
      ),
    ]);

    if (res.ok) {
      const rows = (await res.json()) as ItineraryRow[];
      trip       = rows[0];

      if (trip) {
        // 제목: 사용자의 실제 Trip title 우선(9:16 카드와 같은 규칙).
        // 설명: 광고 문구 대신 여행의 사실 요약 — trip identity 가 주인공이다.
        const { dayCount, placeCount } = countDaysPlaces(trip.days);
        title       = shareTitle(trip.trip_title, trip.city, dayCount);
        description = shareDescription({
          city: trip.city, dayCount, placeCount,
          startDate: trip.start_date, endDate: trip.end_date,
        });

        // 대표 카탈로그 가중치 — 공개 순간이 결합된 장소를 우선한다.
        // 이 조회가 실패해도 OG 는 나간다(가중치만 없어진다).
        try {
          const mRes = await Promise.race<Response>([
            fetch(
              `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/trip_moments` +
              `?itinerary_id=eq.${shareId}&is_public=eq.true&select=city_spot_id&limit=100`,
              { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
            ),
            new Promise<Response>((_, reject) =>
              setTimeout(() => reject(new Error("moments_timeout")), 1500)
            ),
          ]);
          if (mRes.ok) {
            const rows = (await mRes.json()) as { city_spot_id: number | null }[];
            publicSpotIds = rows
              .map(r => r.city_spot_id)
              .filter((n): n is number => typeof n === "number");
          }
        } catch { /* 가중치 없이 진행 */ }
      }
    }
  } catch {
    // Supabase 타임아웃/네트워크 오류 → 기본값 OG 반환 (크래시 없음)
  }

  // TASK-TRIP-COVER-V1B: og:image 를 커버 프록시로 연결한다.
  // 개인 커버 유효 → 개인 사진 bytes / 무효·auto·asset → 관광 자산 bytes /
  // 비공개·미존재 → 브랜드 fallback. 판정은 전부 프록시가 하므로 RPC 변경이 없다.
  // (TASK-SHARE-OG-PREVIEW-FIX-01: 프록시가 302 없이 모든 분기를 직접 200 으로 반환)
  // v 는 updated_at 고정값. Date.now() 를 쓰면 매 요청 URL 이 바뀌어 캐시가 죽는다.
  const coverVersion = trip?.updated_at && String(trip.updated_at).trim()
    ? String(trip.updated_at).trim()
    : "0";
  // ── og:image 우선순위 (SHARING-VISUAL-PRODUCTION-V1 §12) ──────────────────
  //   1. 동의된 개인 cover(kind=personal) — 프록시가 매 요청 재검증
  //   2. 대표 카탈로그 이미지 — representativeCoverUrl 재사용(공개 순간이
  //      가장 많이 결합된 장소; "임의 첫 장" 아님)
  //   3. 기존 승인 tourism 자산(현재 manifest 는 busan; 치수 실측값 보유)
  //   4. 5도시 designed fallback(권리확인 기존 자산)
  //   5. 브랜드 이미지
  let ogImage = FALLBACK_OG;
  let ogImageWidth: number | undefined;
  let ogImageHeight: number | undefined;

  if (trip) {
    if (trip.cover_kind === "personal") {
      ogImage = `https://gokoreamate.com/img/trip-cover/${shareId}?v=${encodeURIComponent(coverVersion)}`;
      // 개인 사진은 치수를 저장하지 않아(비율 보존 리사이즈) 생략이 안전하다
    } else {
      const memories: ApiMemory[] = publicSpotIds.map(id => ({
        dayNumber: null, memo: "", placeName: null, placeId: String(id), photos: [],
      }));
      const rep = representativeCoverUrl({
        id: shareId, city: trip.city, start_date: trip.start_date, end_date: trip.end_date,
        trip_title: trip.trip_title ?? "", days: trip.days, memories,
      } as ApiStory);
      if (rep) {
        ogImage = rep; // 외부 카탈로그 원본 — 치수 미상이라 생략
      } else {
        const asset = resolveTourismCoverAsset(COVER_ASSETS, {
          itineraryId:  shareId,
          coverKind:    trip.cover_kind ?? null,
          coverAssetId: trip.cover_asset_id ?? null,
          days:         trip.days,
        });
        if (asset) {
          ogImage = `https://gokoreamate.com/img/trip-cover/${shareId}?v=${encodeURIComponent(coverVersion)}`;
          ogImageWidth  = asset.width;
          ogImageHeight = asset.height;
        } else {
          const cityFb = cityShareFallback(trip.city);
          if (cityFb) ogImage = `https://gokoreamate.com${cityFb}`;
        }
      }
    }
  }

  return new Response(
    buildBotHtml({ title, description, ogImage, url: CANONICAL, ogImageWidth, ogImageHeight }),
    {
      headers: {
        "content-type":  "text/html;charset=UTF-8",
        "cache-control": "public, max-age=300",
      },
    }
  );
};
