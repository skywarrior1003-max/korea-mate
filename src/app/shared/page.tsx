"use client";

// gokoreamate — 공유 일정 뷰어 페이지
// TASK-026: /shared/[id] 정적 쉘 + 클라이언트 사이드 Supabase 바인딩
// Cloudflare Pages _redirects: /shared/* → /shared/ 200 (정적 쉘 라우팅)

// output: "export" 정적 익스포트 선언 필수
export const dynamic = "force-static";

import { useEffect, useState } from "react";
import { TRIP_FLOW_COMMERCE_ENABLED } from "@/config/commerce-surfaces";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { fetchSharedItinerary, type ItineraryRow } from "@/lib/supabase";
import { queryAffiliateLinks, buildAffiliateMap } from "@/lib/affiliates/affiliate-loader";
import type { AffiliateDisplayMap } from "@/lib/affiliates/types";
import AffiliateInlineSection from "@/components/AffiliateInlineSection";
import KoreaReadySection from "@/components/KoreaReadySection";
import TripStoryExport from "@/components/TripStoryExport";
import { apiCopyItinerary } from "@/lib/itinerary-api";
import StoryCover from "@/components/story/StoryCover";
import StoryNavHide from "@/components/story/StoryNavHide";
import StoryReport from "@/components/story/StoryReport";
import StoryJournal from "@/components/story/StoryJournal";
import StoryMemoryFocus from "@/components/story/StoryMemoryFocus";
import StorySummary from "@/components/story/StorySummary";
import { PAGE_BG } from "@/components/story/story-tokens";
import type { StoryMemory } from "@/components/story/story-types";
import {
  toStoryDays, coverPhotoUrl, coverEyebrow, storyStats, hasPublicMemories,
  toStoryCardMoments, publicStoryUrl,
  type ApiStory,
} from "@/lib/share/story-adapter";
import {
  googlePlaceSearchUrl, isSafeMapUrl, naverPlaceSearchUrl,
} from "@/lib/maps/place-navigation";
import { getDeviceId } from "@/lib/deviceId";
import TripCover from "@/components/TripCover";
import { resolveTheme } from "@/lib/trip-cover/cover-core";
import { pickAsset } from "@/lib/trip-cover/assets.data";

// ── 로컬 타입 (itinerary/page.tsx 와 동일 구조) ──────────────────────────────
interface Place {
  name:         string;
  category:     string;
  location:     string;
  time:         string;
  duration:     string;
  tips:         string;
  googleMapsUrl:string;
  slot?:        string;
  /** 숙소인가. 이 필드가 없던 시절 일정도 그대로 열린다. */
  isAccommodation?: boolean;
}

/**
 * 지도에서 무엇을 찾을 것인가.
 *
 * 공개된 장소 이름 하나다. 좌표도, 사용자가 적어 넣은 주소도, 붙여넣은 링크도
 * 쓰지 않는다 — 그것들은 이 화면에 오지도 않는다.
 *
 * 이름이 비어 있으면 null 이고, 그때는 지도 버튼을 걸지 않는다. 빈 검색어로
 * 지도를 열면 엉뚱한 곳이 뜬다.
 */
function mapTargetName(place: Place): string | null {
  const n = (place.name ?? "").trim();
  return n.length > 0 ? n : null;
}

interface Day {
  date:      string;
  dayNumber: number;
  places:    Place[];
}

// ── v2 days 파싱 — { __v:2, scheduled: Day[] } 또는 legacy Day[] 모두 지원 ───
function parseScheduledDays(value: unknown): Day[] {
  if (Array.isArray(value)) return value as Day[];
  if (
    value !== null &&
    typeof value === "object" &&
    (value as { __v?: number }).__v === 2
  ) {
    const scheduled = (value as { scheduled?: unknown }).scheduled;
    if (Array.isArray(scheduled)) return scheduled as Day[];
  }
  return [];
}

// ── 유틸: 클론 URL 빌더 ──────────────────────────────────────────────────────
// 공유된 일정의 날짜·스타일을 홈페이지 플래너에 pre-fill하는 URL 생성
const STYLE_MAP: Record<string, string> = {
  solo: "Solo", couple: "Couple", family: "Family", group: "Group",
};

function buildCloneUrl(trip: ItineraryRow): string {
  const cityFormatted = trip.city.charAt(0).toUpperCase() + trip.city.slice(1);
  const params = new URLSearchParams({
    city:  cityFormatted,
    from:  trip.start_date,
    to:    trip.end_date,
    style: STYLE_MAP[trip.travel_style?.toLowerCase()] ?? "Solo",
    ref:   "clone",
  });
  return `/?${params.toString()}`;
}

const KR_CITIES = ["seoul", "busan", "jeju", "gyeongju"] as const;
type KRCity = typeof KR_CITIES[number];
function toKRCity(c: string): KRCity | null {
  const lower = c.toLowerCase();
  return (KR_CITIES as readonly string[]).includes(lower) ? (lower as KRCity) : null;
}

// ── 유틸: share_id 추출 ───────────────────────────────────────────────────────
// 우선순위: pathname (/shared/UUID) → query string (?id=UUID)
function extractShareId(): string | null {
  if (typeof window === "undefined") return null;
  const pathParts = window.location.pathname.split("/shared/");
  const pathId    = pathParts.length > 1 ? (pathParts[1] ?? "").replace(/\/$/, "") : "";
  if (pathId) return pathId;
  return new URLSearchParams(window.location.search).get("id");
}

// ── 여행 스타일 한글 매핑 ─────────────────────────────────────────────────────
const STYLE_LABEL: Record<string, string> = {
  solo:   "Solo FIT",
  couple: "Couple Trip",
  family: "Family Trip",
  group:  "Group Trip",
};

function styleLabel(raw: string): string {
  return STYLE_LABEL[raw.toLowerCase()] ?? raw;
}

// ── 카테고리 이모지 ───────────────────────────────────────────────────────────
const CATEGORY_EMOJI: Record<string, string> = {
  restaurant:  "🍽️",
  food:        "🍜",
  attraction:  "🗺️",
  nature:      "🌿",
  culture:     "🏛️",
  shopping:    "🛍️",
  hotel:       "🏨",
  transport:   "🚌",
  cafe:        "☕",
  nightlife:   "🌙",
  activity:    "🎯",
};

function placeEmoji(category: string): string {
  return CATEGORY_EMOJI[category?.toLowerCase()] ?? "📍";
}

// ══════════════════════════════════════════════════════════════════════════════

type Status = "loading" | "found" | "not_found" | "error";

export default function SharedTripPage() {
  const tStay = useTranslations("stay");
  const tItin = useTranslations("itin");
  // 공개 Story 는 바깥 사람이 보는 화면이다 — 한 화면에 영어와 한국어가
  // 섞여 있으면 그 사람은 무엇이 자기 언어인지 알 수 없다.
  const tStory = useTranslations("story");
  // 공유 카드 CTA 는 소유자 화면·Publish 성공 화면과 같은 키를 쓴다.
  const tPublish = useTranslations("publish");
  const [status,        setStatus]        = useState<Status>("loading");
  const [trip,          setTrip]          = useState<ItineraryRow | null>(null);
  const [days,          setDays]          = useState<Day[]>([]);
  const [affiliateMap,  setAffiliateMap]  = useState<AffiliateDisplayMap>({});
  const tProof = useTranslations("socialProof");
  const [helpfulCount,    setHelpfulCount]    = useState(0); // 읽기 전용 표시
  const [copyCount,       setCopyCount]       = useState(0); // 읽기 전용 표시
  const [storyExportOpen, setStoryExportOpen] = useState(false);
  const [isCopying,       setIsCopying]       = useState(false);
  const [copyError,       setCopyError]       = useState<string | null>(null);
  /** Story 에서 사진을 눌러 연 큰 화면. 같은 Memory 의 사진만 들어간다. */
  const [storyFocus, setStoryFocus] = useState<{ m: StoryMemory; i: number } | null>(null);
  const [coverSkip,       setCoverSkip]       = useState(0);   // 이미지 실패 → 다음 자산
  // 실제 표시 커버 종류. 판정 전(unknown)에는 KTO 출처를 붙이지 않는다.
  const [coverKind, setCoverKind] = useState<"unknown" | "personal" | "tourism">("unknown");
  const router = useRouter();

  useEffect(() => {
    // ── window 가드 (SSR/빌드타임 안전) ──────────────────────────────────────
    if (typeof window === "undefined") return;

    const shareId = extractShareId();
    if (!shareId) { setStatus("not_found"); return; }

    // ── Supabase 조회 파이프라인 ───────────────────────────────────────────────
    // TASK-SEC-02: fetchSharedItinerary = SECURITY DEFINER RPC 경유 (device_id/email 미반환)
    fetchSharedItinerary(shareId).then(async (record) => {
      if (!record) { setStatus("not_found"); return; }

      setTrip(record);
      setHelpfulCount(record.helpful_count ?? 0);
      setCopyCount(record.copy_count ?? 0);

      // 개인/관광 커버 판정 — 실패하면 unknown 을 유지해 출처를 숨긴다.
      // 이 조회가 실패해도 커버 이미지와 Shared 페이지는 그대로 동작한다.
      fetch(`/api/shared/${encodeURIComponent(shareId)}/cover-kind`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { kind?: string } | null) => {
          if (d?.kind === "personal" || d?.kind === "tourism") setCoverKind(d.kind);
        })
        .catch(() => { /* unknown 유지 — 잘못된 출처를 표시하지 않는다 */ });

      // days JSONB → Day[] 파싱 (legacy Day[] 및 v2 { __v:2, scheduled } 모두 지원)
      const parsedDays = parseScheduledDays(record.days);
      setDays(parsedDays);

      // ── document.title 오버라이드 (Phase 1 OG 대응) ─────────────────────────
      const cityCap = record.city.charAt(0).toUpperCase() + record.city.slice(1);
      document.title = `${cityCap} ${parsedDays.length}-Day Itinerary — gokoreamate.com`;

      setStatus("found");

      // ── 제휴 링크 인젝션 파이프라인 ────────────────────────────────────────
      // Trip-Flow Commerce (§14-1-A) — 게이트는 렌더가 아니라 **데이터 경계**다.
      // 렌더만 막으면 존재하지 않는 affiliate_links 에 요청이 나가고(도시 한정 +
      // zero-row fallback 으로 2회) payload 까지 만들어진다. 조회 자체를 막는다.
      //
      // affiliateMap 초기값이 {} 이므로 여기서 setState 를 호출할 필요가 없다.
      // 불필요한 state update 도 발생하지 않는다.
      //
      // 조회·fallback 코드는 삭제하지 않는다. 게이트가 정상화 후 true 가 되면
      // 아래 파이프라인이 그대로 다시 동작한다.
      if (!TRIP_FLOW_COMMERCE_ENABLED) return;

      const locale = navigator.language.split("-")[0].toLowerCase();
      const rows   = await queryAffiliateLinks(record.city);
      setAffiliateMap(buildAffiliateMap(rows, locale));
    }).catch(() => setStatus("error"));
  }, []);

  // ── 뷰 카운터 — 서버 경유 (화면 렌더 후 백그라운드 비동기 호출) ────────────
  //
  // 예전에는 여기서 anon key 로 Supabase RPC 를 직접 불렀다. 중복 방지가
  // sessionStorage 뿐이라 지우거나 curl 로 부르면 무제한 증가했고, Popular·
  // Trending 이 view_count 를 쓰므로 순위까지 부풀릴 수 있었다.
  //
  // 이제 Pages Function 이 device id 를 SHA-256 해시해 서버 전용 RPC 로 넘기고,
  // DB 가 같은 일정+같은 기기를 24시간에 한 번만 인정한다.
  // sessionStorage 는 남겨 두지만 **네트워크 요청을 줄이는 최적화일 뿐**이고
  // 중복 방지의 책임은 서버·DB 에 있다.
  //
  // trip 이 세팅됐다는 것은 get_shared_itinerary(is_public 강제)가 성공했다는
  // 뜻이다. 비공개·미존재 화면에서는 이 effect 가 돌지 않는다.
  useEffect(() => {
    if (!trip?.id) return;
    const key = `viewed_${trip.id}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    fetch(`/api/itinerary/view/${trip.id}`, {
      method:  "POST",
      headers: { "x-device-id": getDeviceId() },
    }).catch(() => { /* silent — 카운터 실패가 UX에 영향 없음 */ });
  }, [trip?.id]);

  // TASK-HELPFUL-GUARD: 서버 성공 전에 카운트를 올리고 sessionStorage 로 잠그던
  // 낙관적 처리를 제거했다. 거짓 +1·거짓 완료 표시의 원인이었고, 서버가 복사 이력을
  // 요구하게 되면서 비복사 방문자에게는 실패가 정상 응답이 되기 때문이다.

  // ── PHASE 1-A-FE1: 공유 일정 복사 ────────────────────────────────────────
  async function handleCopyTrip() {
    if (isCopying || !trip) return;
    const shareId = extractShareId();
    if (!shareId) {
      setCopyError("This shared trip link is invalid.");
      return;
    }
    setIsCopying(true);
    setCopyError(null);
    try {
      const { id } = await apiCopyItinerary(shareId, getDeviceId());
      router.push(`/itinerary?id=${encodeURIComponent(id)}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg === "TRIP_NOT_AVAILABLE") {
        setCopyError("This trip is no longer available.");
      } else {
        setCopyError("Could not copy this trip. Please try again.");
      }
      setIsCopying(false);
    }
  }

  // ── 로딩 상태 ─────────────────────────────────────────────────────────────
  if (status === "loading") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center" style={{ backgroundColor: "#F6F7F8" }}>
        <div className="flex flex-col items-center gap-4">
          <div
            className="w-12 h-12 rounded-full border-4 border-t-transparent animate-spin"
            style={{ borderColor: "#FF4A2D", borderTopColor: "transparent" }}
          />
          <p className="text-sm font-bold text-[#565D66]">Loading itinerary…</p>
          <Link href="/" className="text-xs text-[#8A919B] hover:text-[#565D66] transition-colors">
            gokoreamate.com
          </Link>
        </div>
      </div>
    );
  }

  // ── 404 / 에러 상태 ──────────────────────────────────────────────────────
  if (status === "not_found" || status === "error") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4" style={{ backgroundColor: "#F6F7F8" }}>
        <div className="text-center max-w-sm">
          <div className="text-6xl mb-4">🗺️</div>
          <h1 className="text-2xl font-black text-[#191C21] mb-3">Itinerary not found</h1>
          <p className="text-sm text-[#565D66] leading-relaxed mb-6">
            This link has expired or doesn&apos;t exist.
          </p>
          <Link
            href="/"
            className="inline-flex items-center justify-center px-8 py-3.5 rounded-xl text-sm font-black text-white transition-all hover:opacity-90"
            style={{ backgroundColor: "#FF4A2D" }}
          >
            ✨ Plan My Trip
          </Link>
          <p className="text-xs text-[#8A919B] mt-4">gokoreamate.com</p>
        </div>
      </div>
    );
  }

  // ── 정상 렌더 ─────────────────────────────────────────────────────────────
  if (!trip) return null;

  const cityCap    = trip.city.charAt(0).toUpperCase() + trip.city.slice(1);
  const totalSpots = days.reduce((sum, d) => sum + d.places.length, 0);
  // Trip-Flow Commerce (§14-1-A) — 공유 일정은 다른 사용자가 보는 일정 화면이다.
  // 게이트가 false 인 동안 상업 섹션을 만들지 않는다.
  const hasAffiliate = TRIP_FLOW_COMMERCE_ENABLED && Object.keys(affiliateMap).length > 0;

  // ── Trip Cover V1A — 관광 테마 사진 커버 ─────────────────────────────────
  // 자산은 전부 theme_only 라 사진을 특정 장소의 사진으로 표시하지 않는다.
  // 일정의 실제 장소는 highlights 로 분리해 넘긴다.
  const coverPlaces = days.flatMap((d) =>
    d.places.map((p) => ({ name: p.name, category: p.category, location: p.location })),
  );
  const coverTheme = resolveTheme({ tripTitle: trip.trip_title, places: coverPlaces }).theme;
  const coverAsset = pickAsset(trip.id, coverTheme, coverSkip);
  const neighborhoods = new Set(
    coverPlaces.map((p) => (p.location ?? "").trim()).filter(Boolean),
  ).size;
  const highlights = Array.from(
    new Set(coverPlaces.map((p) => (p.name ?? "").trim()).filter(Boolean)),
  ).slice(0, 4);

  // ── 공개한 Memory 가 있으면 Story 로 보여 준다 ─────────────────────────────
  //
  // 없으면 아래 기존 공유 화면 그대로다. 공개한 기억이 없는 여행에 빈 Journal 을
  // 억지로 띄우지 않는다 — 그건 이 사람이 만든 것이 아니다.
  //
  // 여기 들어오는 값은 전부 서버가 정제한 것이다. 좌표도, 저장 경로도, 내부
  // id 도 응답에 오지 않으므로 화면이 볼 수 없다.
  const apiStory = trip as unknown as ApiStory;
  if (hasPublicMemories(apiStory)) {
    const storyDays = toStoryDays(apiStory);
    const cover     = coverPhotoUrl(apiStory);
    const stats     = storyStats(apiStory);
    const title     = trip.trip_title?.trim() || `${days.length}-Day ${cityCap} Itinerary`;

    return (
      <div style={{ backgroundColor: PAGE_BG }}>
        {/* 이 화면이 켜져 있는 동안에는 앱 하단 네비게이션을 감춘다.
            바깥 사람이 보는 독립된 화면이라 앱 메뉴가 낄 자리가 아니다.
            Story 가 아닌 공유 화면은 그대로 둔다. */}
        <StoryNavHide />

        {cover && (
          <StoryCover
            scrollHint="story-journal"
            data={{
              imageUrl: cover,
              eyebrow:  coverEyebrow(apiStory),
              title,
              // 작성자 표시값이 서비스에 없다. 없는 이름을 지어내지 않고 줄을 숨긴다.
            }}
          />
        )}

        <StoryJournal
          id="story-journal"
          days={storyDays}
          onOpenPhoto={(m, i) => setStoryFocus({ m, i })}
          /* Save 는 아직 붙일 곳이 없다 — 넘기지 않으면 버튼이 그려지지 않는다 */
        />

        <StorySummary
          data={{
            title,
            stats: `${stats.dayCount} Days · ${stats.placeCount} Places`,
            description: "",
          }}
          /* 지도는 아직 없다. 자리를 비워 두지 않고 통째로 감춘다 —
             빈 상자를 진짜 지도로 오인하게 두지 않는다. */
          hideMapSlot
          /* StorySummary 가 이미 클립보드 아이콘을 그린다. 여기서 이모지까지 붙이면
             아이콘이 둘로 보인다. 아래 기존 공유 화면은 SVG 가 없어 이모지가 곧
             아이콘이므로 그대로 둔다. */
          copyLabel={isCopying ? tStory("copying") : tStory("copyTrip")}
          copyBusy={isCopying}
          onCopy={() => void handleCopyTrip()}
          shareLabel={tStory("share")}
          /* 기존 Share 자리를 실제 9:16 카드에 연결한다. 새 버튼을 만들지 않는다 —
             `StorySummary` 는 `onShare` 가 있을 때만 이 버튼을 그린다. */
          onShare={() => setStoryExportOpen(true)}
        />

        {/* 맨 아래 조용한 신고 자리. 보낸다고 아무것도 가려지지 않는다 —
            사람이 보고 정한다. */}
        <StoryReport shareId={trip.id} deviceId={getDeviceId()} />

        {storyExportOpen && (
          <TripStoryExport
            city={trip.city}
            startDate={trip.start_date}
            endDate={trip.end_date}
            dayCount={stats.dayCount}
            placeCount={stats.placeCount}
            /* 서버가 공개 여부·동의 판본·차단을 이미 다 보고 걸러 준 것만 들어간다 */
            moments={toStoryCardMoments(apiStory)}
            travelStyle={trip.travel_style ?? ""}
            shareUrl={publicStoryUrl(window.location.origin, trip.id)}
            onClose={() => setStoryExportOpen(false)}
          />
        )}

        {storyFocus && (
          <StoryMemoryFocus
            memory={storyFocus.m}
            startIndex={storyFocus.i}
            onClose={() => setStoryFocus(null)}
          />
        )}
      </div>
    );
  }


  return (
    <div className="min-h-screen" style={{ backgroundColor: "#F6F7F8" }}>

      <TripCover
        coverSrc={`/img/trip-cover/${trip.id}?v=${encodeURIComponent(trip.updated_at ?? "0")}`}
        asset={coverAsset}
        theme={coverTheme}
        title={trip.trip_title?.trim() || `${days.length}-Day ${cityCap} Itinerary`}
        city={trip.city}
        startDate={trip.start_date}
        endDate={trip.end_date}
        days={days.length}
        places={totalSpots}
        neighborhoods={neighborhoods}
        copyCount={copyCount}
        helpfulCount={helpfulCount}
        highlights={highlights}
        coverKind={coverKind}
        onImageError={() => setCoverSkip((n) => n + 1)}
      />

      {/* ── 히어로 헤더 ─────────────────────────────────────────────────────── */}
      <div
        className="relative overflow-hidden py-12 px-4"
        style={{ background: "linear-gradient(160deg, #1a1a2e 0%, #16213e 60%, #0f3460 100%)" }}
      >
        {/* 배경 글로우 */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 70%, rgba(212,175,55,0.12) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(59,130,246,0.10) 0%, transparent 45%)",
          }}
        />

        <div className="relative max-w-2xl mx-auto text-center">
          {/* TASK-TRIP-COVER-V1A: 배지·도시명·날짜·스탯 칩은 상단 Trip Cover 가
              그대로 담당한다. 여기서 다시 그리면 제목·기간·지표가 화면에 두 번
              나오므로 중복 블록만 제거했다. 아래 복사 CTA·Day 목록은 그대로 유지. */}

          {/* 소셜 프루프 — 읽기 전용.
              TASK-HELPFUL-GUARD: 모든 방문자에게 보이던 Helpful 입력 버튼은 제거했다.
              Helpful 은 이제 "복사 후 실제로 써본 사람의 반응"이며, 서버가 복사 이력을
              요구한다. 입력 진입점은 후속 작업에서 별도로 붙인다.
              Copied·Helpful 은 Trip Cover 가 담당하므로 여기서는 view_count 만 남긴다. */}
          {(trip.view_count ?? 0) >= 2 && (
            <div className="mb-6 flex items-center gap-3 text-sm font-semibold flex-wrap justify-center">
              <span className="text-amber-400">🔥 {trip.view_count} views</span>
            </div>
          )}

          {/* 골드 디바이더 */}
          <div className="w-24 h-[1.5px] mx-auto" style={{ background: "#FF4A2D", opacity: 0.5 }} />
        </div>
      </div>

      {/* ── 메인 콘텐츠 ─────────────────────────────────────────────────────── */}
      <div className="max-w-2xl mx-auto px-4 py-8">

        {/* 상단 제휴 섹션 (데이터 로드 시) */}
        {hasAffiliate && (
          <div className="mb-8">
            <AffiliateInlineSection
              affiliateMap={affiliateMap}
              city={trip.city}
              placement="shared_trip_view"
            />
          </div>
        )}

        {/* Day별 일정 카드 */}
        {days.map((day, dayIdx) => (
          <div key={day.dayNumber ?? dayIdx}>
            {/* Day 헤더 */}
            <div className="flex items-center gap-3 mb-4">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-black text-white shrink-0"
                style={{ backgroundColor: "#1a1a2e" }}
              >
                {day.dayNumber ?? dayIdx + 1}
              </div>
              <div>
                <p className="text-base font-black text-[#191C21]">
                  Day {day.dayNumber ?? dayIdx + 1}
                </p>
                <p className="text-xs text-[#565D66]">{day.date}</p>
              </div>
            </div>

            {/* 장소 카드 목록 */}
            <div className="space-y-3 mb-6">
              {(day.places ?? []).map((place, placeIdx) => {
                // 어디로 보내는가를 먼저 정하고, 라벨은 그 결과를 따라간다.
                //
                // `naverPlaceSearchUrl` 은 한국어 이름을 찾지 못하면 Google 검색으로
                // 내려간다. 그때도 "Naver Map" 이라고 적어 두면 눌러 본 사람은
                // 우리가 거짓말을 했다고 느낀다. 일정 화면은 이미 같은 값으로
                // 판정해 라벨을 바꾸고 있었다 — 그 판정을 그대로 쓴다.
                const target = mapTargetName(place);
                const naverUrl = target ? naverPlaceSearchUrl(target, trip.city) : null;
                const naverIsGoogle = naverUrl !== null && naverUrl.includes("google.com");
                const googleUrl = place.googleMapsUrl && isSafeMapUrl(place.googleMapsUrl)
                  ? place.googleMapsUrl
                  : (target ? googlePlaceSearchUrl(target, trip.city) : null);
                // 같은 곳으로 가는 버튼을 두 개 두지 않는다. 직접 적어 넣은 숙소는
                // 저장된 지도 주소가 없어 두 주소가 정확히 같아진다.
                const showFallback = naverUrl !== null && (!naverIsGoogle || naverUrl !== googleUrl);
                return (
                <div
                  key={placeIdx}
                  className="bg-white rounded-2xl p-4 border border-[#E5E7EA] shadow-sm"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center text-base shrink-0"
                      style={{ backgroundColor: "#F5EFE3" }}
                    >
                      {placeEmoji(place.category)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-black text-[#191C21] truncate">
                          {place.name?.trim()
                            || (place.isAccommodation ? tStay("placeFallback") : "")}
                        </p>
                        {/* 방문 시각을 표시하지 않는다 — 저장된 값만으로는 사용자가
                            정한 시각인지 앱이 채운 값인지 구분할 수 없다. 공개 일정과
                            복사 일정도 같은 규칙을 따른다. 값 자체는 정렬용으로 남는다. */}
                      </div>
                      <p className="text-xs text-[#9C8575] mt-0.5">{place.location}</p>
                      {place.tips && (
                        <p className="text-xs text-[#565D66] mt-1.5 leading-relaxed line-clamp-2">
                          {place.tips}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* ── 지도 링크 ────────────────────────────────────────
                      공유받은 사람이 여기서 멈추면 이 일정은 읽을거리로 끝난다.
                      이름을 본 다음에 지도로 이어져야 실제로 따라갈 수 있다.

                      직접 적어 넣은 숙소에는 저장된 지도 주소가 없다. 그렇다고
                      좌표를 공유물에 실어 만들지 않는다 — 공개된 이름과 도시로
                      검색해 연다. 우리 장소 데이터에 없는 곳도 열리고, 어디서
                      자는지 정확한 지점은 링크에 남지 않는다. */}
                  {googleUrl && (
                    <div className="mt-3 flex items-center gap-3 flex-wrap">
                      {showFallback && (
                        <a
                          href={naverUrl!}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-[10px] font-bold text-[#565D66] hover:text-[#FF4A2D] transition-colors"
                        >
                          <span>{naverIsGoogle ? tItin("moreSearch") : "🗺️ Naver Map"}</span>
                          <span className="text-[#FF4A2D]">→</span>
                        </a>
                      )}
                      <a
                        href={googleUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-[10px] font-bold text-[#565D66] hover:text-[#FF4A2D] transition-colors"
                      >
                        <span>📍</span>
                        <span>Google Maps</span>
                        <span className="text-[#FF4A2D]">→</span>
                      </a>
                    </div>
                  )}
                </div>
                );
              })}
            </div>

            {/* 제휴 인젝터 — Day 2마다 삽입 */}
            {hasAffiliate && (dayIdx + 1) % 2 === 0 && dayIdx < days.length - 1 && (
              <div className="mb-8">
                <AffiliateInlineSection
                  affiliateMap={affiliateMap}
                  city={trip.city}
                  placement="shared_trip_view"
                  compact
                />
              </div>
            )}
          </div>
        ))}

        {/* ── 바이럴 CTA ────────────────────────────────────────────────────── */}
        <div
          className="rounded-3xl p-8 text-center mt-6 mb-8"
          style={{
            background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 60%, #0f3460 100%)",
            border: "1px solid rgba(212,175,55,0.25)",
          }}
        >
          <p className="text-xs font-black uppercase tracking-widest text-white/40 mb-3">
            gokoreamate.com
          </p>
          <h2 className="text-xl font-black text-white mb-2">
            {tStory("planOwnTitle", { city: cityCap })}
          </h2>
          <p className="text-sm text-white/55 leading-relaxed mb-6">
            {tStory("planOwnLine1")}<br />
            {tStory("planOwnLine2")}
          </p>

          {/* Primary — copy days directly to My Trips */}
          <button
            onClick={handleCopyTrip}
            disabled={isCopying}
            aria-disabled={isCopying}
            className="w-full inline-flex items-center justify-center px-8 py-3.5 rounded-xl text-sm font-black text-[#1a1a2e] transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
            style={{ backgroundColor: "#FF4A2D" }}
          >
            {/* 이 화면은 아이콘 SVG 가 없어 이모지가 곧 아이콘이다 — 그래서 붙여 둔다.
                Story 화면은 StorySummary 가 아이콘을 그리므로 거기엔 붙이지 않는다. */}
            {isCopying ? tStory("copying") : `📋 ${tStory("copyTrip")}`}
          </button>
          <p className="text-xs text-white/50 mt-1.5 mb-1">{tStory("copyHint")}</p>
          {copyError && (
            <p className="text-xs text-red-400 mb-3">{copyError}</p>
          )}

          {/* Secondary — contextual clone CTA (도시·날짜·스타일 pre-fill) */}
          <Link
            href={buildCloneUrl(trip)}
            className="mt-3 inline-flex items-center justify-center px-8 py-3.5 rounded-xl text-sm font-black border transition-all hover:bg-white/10 active:scale-95"
            style={{ color: "rgba(255,255,255,0.80)", borderColor: "rgba(212,175,55,0.50)" }}
          >
            🗺️ {tStory("planSimilar")}
          </Link>

          {/* Secondary — 이 일정 공유 카드 만들기 */}
          <button
            onClick={() => setStoryExportOpen(true)}
            className="mt-3 inline-flex items-center justify-center gap-2 px-8 py-3 rounded-xl text-sm font-black border transition-all hover:bg-white/10 active:scale-95 w-full"
            style={{ color: "rgba(255,255,255,0.80)", borderColor: "rgba(212,175,55,0.50)" }}
          >
            📤 {tPublish("openStoryCard")}
          </button>

          {/* Tertiary — 처음부터 새 여행 */}
          <Link
            href="/"
            className="mt-2 inline-flex items-center justify-center gap-2 px-8 py-3 rounded-xl text-sm font-black border transition-all hover:bg-white/10 active:scale-95"
            style={{ color: "rgba(255,255,255,0.40)", borderColor: "rgba(255,255,255,0.12)" }}
          >
            ✨ {tStory("startScratch")} →
          </Link>
        </div>

        {/* ── 하단 제휴 섹션 ──────────────────────────────────────────────── */}
        {hasAffiliate && (
          <div className="mb-8">
            <AffiliateInlineSection
              affiliateMap={affiliateMap}
              city={trip.city}
              placement="shared_trip_view"
            />
          </div>
        )}

        {/* Korea Ready 정적 제휴 카드 — DB 시드 없이 항상 노출 */}
        {/* 공유 일정은 Trip-Flow (§14-1-A) — surface 로 명시해 게이트가 차단하게 한다 */}
        {(() => { const krc = toKRCity(trip.city); return krc ? <KoreaReadySection city={krc} surface="shared-itinerary" /> : null; })()}

        {/* 푸터 */}
        <p className="text-center text-xs text-[#8A919B] pb-8 pt-6">
          {tStory("generatedBy")}
        </p>

        {/* 하단 고정 BottomNav(h-14 + safe-area) 만큼의 여유.
            예전에는 sticky Copy 바까지 함께 피하려고 둔 자리였는데, 그 바를
            없앤 뒤에도 이 여백은 필요하다 — 빼면 푸터가 메뉴에 가린다. */}
        <div className="h-16 md:hidden" />

      </div>

      {/* 9:16 공유 카드 모달 */}
      {storyExportOpen && (
        <TripStoryExport
          city={trip.city}
          startDate={trip.start_date}
          endDate={trip.end_date}
          dayCount={days.length}
          placeCount={totalSpots}
          /* 이 분기는 공개 Memory 가 0건일 때만 도달한다 — 넣을 것이 없다 */
          moments={[]}
          travelStyle={trip.travel_style}
          shareUrl={publicStoryUrl(window.location.origin, trip.id)}
          onClose={() => setStoryExportOpen(false)}
        />
      )}
    </div>
  );
}
