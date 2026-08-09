// S1 — Place Detail 본문 (design-system.md PlaceDetail·EssentialsStrip)
// 원칙: 방문 판단에 충분한 요약 + 공식 원문 링크(기관명 표시). 얕은 복제 금지.
// 데이터 없는 필드는 렌더하지 않는다 (unknown ≠ 불가). 가짜 수치·후기 금지.
//
// V1-A 변경
//   - Product Constitution §11 "Add to Itinerary 가 일정 입력의 중심" 을 반영해
//     primary CTA 를 Save → Add to Itinerary 로 교체했다. coral primary 는
//     화면당 1개 규칙을 유지하며, 모바일은 하단 sticky 에만 둔다.
//   - 일정 입력에는 비상업 어댑터(toItineraryEvent)만 쓴다. Cart 의 commerce 가
//     cartHints 를 거쳐 plan API 로 흘러가므로, 상세페이지발 항목은 상업 문맥을
//     갖지 않는다 (§14).
//   - 원격 이미지 로드 실패에도 fallback 을 그린다. 운영 image_url 다수가 폐지된
//     호스트라 onError 가 없으면 브라우저 기본 깨짐 아이콘이 그대로 노출된다.
//   - provenance 를 4종으로 정직하게 표시한다 (§8). manual 을 공식 정보로
//     표시하지 않는다.
//   - 장소 텍스트는 활성 locale 로 다시 해석한다. l10n 이 전부 NULL 인 현재도
//     영어 표시가 회귀하지 않는다.

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import { TopNav, Card, Badge } from "@/components/ui";
import { getFavorites, toggleFavorite, cacheSavedSpot, uncacheSavedSpot, FAVORITES_EVENT } from "@/lib/favorites";
import PlaceReportModal from "@/components/PlaceReportModal";
import { citySpotSourceKey } from "@/lib/place-identity";
import { trackEvent } from "@/lib/analytics";
import {
  resolvePlaceText,
  resolvePublicPlaceSummary,
  resolveDisplayImage,
  resolveProvenance,
  resolveMapLinks,
  toItineraryEvent,
  stripCommercialKeys,
  placeEventId,
  buildShareContent,
  PROVENANCE_MESSAGE_KEY,
} from "@/lib/place-detail/place-detail-core";
import type { PlaceView } from "@/lib/place-detail/place-detail-core";

// 공식 링크 출처 기관명 추출 (도메인 기반 — 알 수 없으면 도메인 자체 표기)
function officialSourceName(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (host.includes("visitbusan"))   return "Visit Busan";
    if (host.includes("visitseoul"))   return "Visit Seoul";
    if (host.includes("visitjeju"))    return "Visit Jeju";
    if (host.includes("gyeongju"))     return "Visit Gyeongju";
    if (host.includes("visitkorea") || host.includes("knto")) return "Visit Korea";
    return host;
  } catch {
    return "official site";
  }
}

// 표시용 첫 글자 대문자 (DB 값은 소문자 저장 — "busan" → "Busan")
function cap(s: string): string {
  return s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s;
}

export default function PlaceDetailClient({ spot }: { spot: PlaceView }) {
  const t = useTranslations("place");
  const tD = useTranslations("discovery");
  const tSaved = useTranslations("saved");
  const tReport = useTranslations("report");
  const locale = useLocale();

  const [saved, setSaved]       = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [savedToast, setSavedT] = useState(false);
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  const [imgFailed, setImgFail] = useState(false);

  const eventId = placeEventId(spot.id);
  const text      = resolvePlaceText(spot, locale);
  const oneLiner  = resolvePublicPlaceSummary(text); // 내부 운영 메모 차단
  const maps      = resolveMapLinks(spot, text.name);
  const provKind  = resolveProvenance(spot);
  // 시안의 chip 열 — 카테고리·세부카테고리·행정구는 실제 값만 쓴다.
  // 값이 없는 칩은 만들지 않는다(빈 칩은 정보가 아니라 잡음이다).
  const chips = [cap(spot.category), spot.subcategory, spot.district].filter(Boolean) as string[];
  const safeImage = resolveDisplayImage(spot.image_url); // 죽은 호스트는 시도조차 하지 않는다
  const showImage = Boolean(safeImage) && !imgFailed;

  useEffect(() => {
    setSaved(getFavorites().includes(eventId));
  }, [eventId]);

  // 다른 화면(Explore 카드·모달·Picks)에서 저장 상태가 바뀌어도 이 버튼이
  // 어긋나지 않게 한다. 예전에는 Cart 만 구독하고 Save 는 마운트 시 1회만
  // 읽어서, 같은 파일 안에서 두 상태의 동기화 수준이 달랐다.
  useEffect(() => {
    const sync = () => setSaved(getFavorites().includes(eventId));
    window.addEventListener(FAVORITES_EVENT, sync);
    return () => window.removeEventListener(FAVORITES_EVENT, sync);
  }, [eventId]);

  // place_view 는 장소당 1회만 발화한다 (spot.id 변경 시에만 재실행)
  useEffect(() => {
    trackEvent("place_view", { place_id: spot.id, city: spot.city, category: spot.category });
  }, [spot.id, spot.city, spot.category]);


  function handleSave() {
    const nowSaved = toggleFavorite(eventId, citySpotSourceKey(spot.id));
    if (nowSaved) {
      cacheSavedSpot(stripCommercialKeys(toItineraryEvent(spot, text)));
      setSavedT(true);
      setTimeout(() => setSavedT(false), 4000);
    } else {
      uncacheSavedSpot(eventId, citySpotSourceKey(spot.id));
    }
    setSaved(nowSaved);
    trackEvent("place_save", { place_id: spot.id, city: spot.city, saved: nowSaved });
  }

  function handleMapOpen(provider: "naver" | "google") {
    trackEvent("place_map_open", { place_id: spot.id, city: spot.city, map_provider: provider });
  }

  async function handleShare() {
    const content = buildShareContent(spot, text.name);
    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        await navigator.share(content);
        trackEvent("place_share", { place_id: spot.id, city: spot.city, method: "web_share" });
        return;
      }
    } catch {
      // 사용자가 취소했거나 Web Share 실패 — 복사로 떨어진다
    }
    try {
      await navigator.clipboard.writeText(content.url);
      setShareMsg(t("linkCopied"));
      setTimeout(() => setShareMsg(null), 3000);
      trackEvent("place_share", { place_id: spot.id, city: spot.city, method: "copy" });
    } catch {
      setShareMsg(content.url); // 복사도 막히면 URL 을 직접 보여준다
      setTimeout(() => setShareMsg(null), 6000);
    }
  }

  // ── 재사용 조각 ────────────────────────────────────────────────────────────

  // 라벨은 문자열, 아이콘은 JSX 로 분리한다 (버튼 두 곳이 같은 조합을 쓴다)

  // 외부 연결 3개 — 네이버·구글·공식 정보를 항상 같은 자리에 둘다.
  //
  // 우선순위가 아니라 여행자가 비교해 고르는 병렬 수단이다. 공식 URL 이
  // 없는 장소도 자리를 숨기지 않고 비활성으로 남긴다 — 어떤 장소는 링크가
  // 있고 어떤 장소는 없다는 것 자체가 정보다. 빈 href 나 # 를 넣지 않는다.
  const EXT_LINK =
    "gkm-focus flex-1 min-h-11 inline-flex items-center justify-center gap-1.5 rounded-control border border-line text-sm font-semibold text-sub hover:text-ink";

  const externalLinks = (
    <div className="flex flex-col sm:flex-row gap-2">
      {maps.naver && (
        <a href={maps.naver} target="_blank" rel="noopener noreferrer"
           aria-label={t("openExternal", { service: t("naverMaps") })}
           onClick={() => handleMapOpen("naver")}
           className={EXT_LINK}>
          {t("naverMaps")}
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 5h5v5" /><path d="M19 5l-8 8" /><path d="M18 14v4.5a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 014 18.5v-11A1.5 1.5 0 015.5 6H10" /></svg>
        </a>
      )}
      {maps.google && (
        <a href={maps.google} target="_blank" rel="noopener noreferrer"
           aria-label={t("openExternal", { service: t("googleMaps") })}
           onClick={() => handleMapOpen("google")}
           className={EXT_LINK}>
          {t("googleMaps")}
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 5h5v5" /><path d="M19 5l-8 8" /><path d="M18 14v4.5a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 014 18.5v-11A1.5 1.5 0 015.5 6H10" /></svg>
        </a>
      )}
      {spot.official_url ? (
        <a href={spot.official_url} target="_blank" rel="noopener noreferrer"
           aria-label={t("openExternal", { service: officialSourceName(spot.official_url) })}
           className={`${EXT_LINK} bg-official-tint text-official border-transparent hover:text-official`}>
          {t("officialInfo")}
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 5h5v5" /><path d="M19 5l-8 8" /><path d="M18 14v4.5a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 014 18.5v-11A1.5 1.5 0 015.5 6H10" /></svg>
        </a>
      ) : (
        <span
          aria-disabled="true"
          className="flex-1 min-h-11 inline-flex items-center justify-center rounded-control border border-line border-dashed text-sm font-medium text-faint cursor-default"
        >
          {t("officialUnavailable")}
        </span>
      )}
    </div>
  );

  const essentials = (
    <dl className="flex flex-col gap-3 text-sm">
      {/* 운영시간은 값이 없다고 영역을 지우지 않는다. 여행자가 가장 먼저 찾는
          정보인데 칸이 사라지면 "없다"인지 "안 보여준다"인지 알 수 없다.
          가짜 Open now 나 휴무일을 만드는 대신 바뀔 수 있다고 말하고 아래
          외부 연결로 보낸다. */}
      <div className="flex gap-3">
        <dt className="w-24 shrink-0 text-faint font-medium">{t("hours")}</dt>
        {spot.opening_hours ? (
          <dd className="text-ink font-medium">{spot.opening_hours.open} – {spot.opening_hours.close}</dd>
        ) : (
          <dd className="text-sub">
            {t("hoursMayChange")}<br />
            <span className="text-faint">{t("checkLatest")}</span>
          </dd>
        )}
      </div>
      {spot.entry_fee && (
        <div className="flex gap-3">
          <dt className="w-24 shrink-0 text-faint font-medium">{t("entryFee")}</dt>
          <dd className="text-ink font-medium">{spot.entry_fee}</dd>
        </div>
      )}
      {typeof spot.duration_minutes === "number" && spot.duration_minutes > 0 && (
        <div className="flex gap-3">
          <dt className="w-24 shrink-0 text-faint font-medium">{t("duration")}</dt>
          <dd className="text-ink font-medium">~{spot.duration_minutes} min</dd>
        </div>
      )}
      {spot.address && (
        <div className="flex gap-3">
          <dt className="w-24 shrink-0 text-faint font-medium">{t("address")}</dt>
          <dd className="text-ink">{spot.address}</dd>
        </div>
      )}
    </dl>
  );

  // provenance — 운영 테이블에 있다는 이유로 공식 기관 정보라고 쓰지 않는다
  const provenanceLine = (
    <p className="text-xs text-faint">{t(PROVENANCE_MESSAGE_KEY[provKind])}</p>
  );

  return (
    <div className="min-h-screen bg-surface-dim flex flex-col">
      <TopNav />


      {/* 화면 breadcrumb — BreadcrumbList JSON-LD 와 같은 경로 */}
      <nav aria-label="Breadcrumb" className="hidden md:block w-full max-w-[1100px] mx-auto px-4 pt-5">
        <ol className="flex items-center gap-1.5 text-xs text-faint">
          <li><Link href="/" className="gkm-focus hover:text-ink">gokoreamate</Link></li>
          <li aria-hidden>/</li>
          <li><Link href={`/explore/${spot.city.toLowerCase()}/`} className="gkm-focus hover:text-ink">{cap(spot.city)}</Link></li>
          <li aria-hidden>/</li>
          <li className="text-sub font-medium truncate max-w-[280px]">{text.name ?? spot.name}</li>
        </ol>
      </nav>

      {/* pb-32: 모바일 sticky CTA + BottomNav 에 본문이 가려지지 않도록 */}
      <main className="flex-1 w-full max-w-[1100px] mx-auto md:px-4 md:py-6 pb-32 md:pb-10">
        <div className="md:grid md:grid-cols-[minmax(0,1fr)_340px] md:gap-6 md:items-start">

          {/* ── 왼쪽: 내용 ────────────────────────────────────────────────── */}
          <Card className="md:rounded-card rounded-none border-x-0 md:border-x overflow-hidden">
            {/* 대표 사진 — NULL 과 로드 실패 모두 같은 fallback (레이아웃 높이 유지).
                시안처럼 사진을 먼저 크게 보여주고 제목 카드가 그 위로 올라온다.
                예전엔 사진 아래에 제목이 그냥 이어 붙어 어느 장소의 사진인지
                스크롤 위치에 따라 끊겨 보였다. */}
            <div className="relative h-64 md:h-80 bg-surface-dim flex items-center justify-center overflow-hidden">
              {showImage ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={safeImage!}
                  alt={text.name ?? spot.name}
                  className="w-full h-full object-cover"
                  onError={() => setImgFail(true)}
                />
              ) : (
                <div className="flex flex-col items-center gap-2 text-faint">
                  <svg width="34" height="34" viewBox="0 0 24 24" fill="none" aria-hidden
                       stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="5" width="18" height="14" rx="2.5" />
                    <circle cx="8.5" cy="10" r="1.6" />
                    <path d="M3.5 17.5l4.8-4.4a2 2 0 012.7 0l6.4 5.9" />
                  </svg>
                  <span className="text-xs font-medium">{t("photoComingSoon")}</span>
                </div>
              )}
              {/* 사진 위 글자가 어떤 사진에서도 읽히도록 아래쪽만 어둡게 */}
              {showImage && (
                <div aria-hidden className="absolute inset-x-0 bottom-0 h-24"
                     style={{ background: "linear-gradient(to top, rgba(19,27,46,0.35), transparent)" }} />
              )}
              {/* 모바일 뒤로가기 — 별도 바를 두면 사진이 그만큼 눌린다 */}
              <Link
                href={`/explore/${spot.city.toLowerCase()}/`}
                aria-label={t("backExplore")}
                className="gkm-focus md:hidden absolute left-3 top-3 w-10 h-10 rounded-full inline-flex items-center justify-center text-ink shadow-lg"
                style={{ backgroundColor: "rgba(255,255,255,0.92)", backdropFilter: "blur(6px)" }}
              >
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden
                     stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 5l-7 7 7 7" />
                </svg>
              </Link>
            </div>

            {/* 사진 위로 6px 올라오는 정보 카드 */}
            <div className="relative -mt-6 rounded-t-[24px] bg-surface p-5 md:p-7">
              <div className="flex flex-wrap gap-1.5 mb-2.5">
                {chips.map(c => (
                  <span key={c} className="inline-flex items-center px-2.5 py-1 rounded-pill text-[11px] font-bold uppercase tracking-wide"
                        style={{ backgroundColor: "var(--gkm-action-tint)", color: "var(--gkm-action-primary)" }}>
                    {c}
                  </span>
                ))}
              </div>
              <h1 className="text-2xl font-extrabold text-ink leading-tight" style={{ textWrap: "balance" }}>
                {text.name ?? spot.name}
              </h1>
              <p className="text-sm text-faint mt-1.5">{cap(spot.city)}</p>
              <div className="mt-2">{provenanceLine}</div>

              {oneLiner && (
                <p className="mt-4 text-[15px] text-sub leading-relaxed border-l-2 border-action pl-3">
                  {oneLiner}
                </p>
              )}

              {/* 여행자 편의 chips — 확인된 사실만 (unknown 은 렌더 안 함) */}
              <div className="flex flex-wrap gap-2 mt-4">
                {spot.solo_friendly && <Badge kind="editorial">{t("soloFriendly")}</Badge>}
                {spot.foreign_card_accepted && <Badge kind="editorial">{t("cardOk")}</Badge>}
                {spot.cash_only === true && <Badge kind="editorial-warm">{t("cashOnly")}</Badge>}
              </div>

              {/* 모바일에서만 본문에 essentials — 데스크톱은 오른쪽 카드가 갖는다 */}
              <div className="mt-6 md:hidden">{essentials}</div>

              {text.description && (
                <section className="mt-6">
                  <h2 className="text-[11px] font-black text-faint uppercase tracking-[0.14em] mb-2">{tD("whyVisit")}</h2>
                  <p className="text-sm text-sub leading-relaxed">{text.description}</p>
                </section>
              )}

              {/* 지도 — 모바일 본문 배치 (데스크톱은 오른쪽 카드) */}
              {(maps.naver || maps.google) && (
                <section className="mt-6 md:hidden">
                  <h2 className="text-base font-bold text-ink mb-2">{t("openInMaps")}</h2>
                  {externalLinks}
                </section>
              )}

              {/* 공식 원문 링크 — 기관명 명시 */}

              {/* 제보 — 공개 장소면 카테고리와 무관하게 같은 모달을 쓴다.
                  본문 하단이라 모바일·데스크톱 어디서든 닿는다. */}
              {/* 모바일 본문에도 Like — 오른쪽 카드는 데스크톱 전용이라 여기 하나 더 둔다 */}
              <div className="mt-8 md:hidden">
              </div>

              <div className="mt-8 md:mt-6 pt-5 border-t border-line">
                <button
                  onClick={() => setReportOpen(true)}
                  className="gkm-focus min-h-11 inline-flex items-center gap-1.5 text-xs font-semibold text-sub hover:text-ink"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden
                       stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="9" /><path d="M12 8v5" /><path d="M12 16.5v.01" />
                  </svg>
                  {tReport("title")}
                </button>
              </div>

              <div className="mt-4 pt-5 border-t border-line flex items-center justify-between gap-3">
                <Link href={`/explore/${spot.city.toLowerCase()}/`} className="gkm-focus text-sm font-semibold text-sub hover:text-ink">
                  {t("backExplore")}
                </Link>
                {/* primary 를 반복하지 않는다 — 여기서는 quiet 링크만 */}
                <Link href="/itinerary/" className="gkm-focus text-sm font-semibold text-sub hover:text-ink border border-line rounded-control min-h-11 px-4 inline-flex items-center">
                  {t("viewItinerary")}
                </Link>
              </div>
            </div>
          </Card>

          {/* ── 오른쪽: 데스크톱 sticky action card ───────────────────────── */}
          <aside className="hidden md:block md:sticky md:top-6">
            <Card className="p-5 flex flex-col gap-3">
              {/* 발견 단계의 개인 행동은 저장 하나다. 일정 편입은 Picks > Saved 에서
                  This Trip 으로 보낼 때 한다 — 장소를 처음 본 자리에서 저장과 일정
                  선택을 동시에 묻지 않는다. */}
              <button
                onClick={handleSave}
                aria-pressed={saved}
                className={`gkm-focus w-full min-h-12 rounded-control text-sm font-bold transition-colors ${
                  saved ? "bg-action-tint text-action" : "bg-action text-white hover:bg-action-hover shadow-cta"
                }`}
              >
                <span className="inline-flex items-center justify-center gap-1.5">
                  {saved ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 12.5l5 5 10-11" /></svg> : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M6.5 4.5h11a1 1 0 011 1v14l-6.5-4-6.5 4v-14a1 1 0 011-1z" /></svg>}
                  {saved ? t("savedState") : t("save")}
                </span>
              </button>

              {externalLinks}

              <button
                onClick={handleShare}
                className="gkm-focus w-full min-h-11 rounded-control border border-line text-sm font-semibold text-sub hover:text-ink"
              >
                <span className="inline-flex items-center justify-center gap-1.5">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4M12 4L7.5 8.5M12 4l4.5 4.5" /><path d="M5 14v4.5a1.5 1.5 0 001.5 1.5h11a1.5 1.5 0 001.5-1.5V14" /></svg>
                  {t("share")}
                </span>
              </button>

              <div className="pt-3 mt-1 border-t border-line">{essentials}</div>
              <div className="pt-3 border-t border-line">{provenanceLine}</div>
            </Card>
          </aside>
        </div>
      </main>

      {/* ── 모바일 sticky CTA — primary 1개만, BottomNav 위, safe-area 고려 ── */}
      <div
        className="md:hidden fixed left-0 right-0 bottom-16 z-40 bg-surface border-t border-line px-4 py-3 flex items-center gap-2"
        style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
      >
        {/* 이 버튼은 아이콘만 있고 글자가 없다. 이름을 붙여 두지 않으면 화면을
            읽어 주는 도구에는 "버튼"이라고만 들리고, 이 화면에서 가장 중요한
            동작이 무엇인지 알 수 없다. 데스크톱이 보여 주는 라벨과 같은 문구를
            쓴다 — 상태는 aria-pressed 가 함께 알린다. */}
        <button
          onClick={handleSave}
          aria-pressed={saved}
          aria-label={saved ? t("savedState") : t("save")}
          className={`gkm-focus flex-1 min-h-12 rounded-control text-sm font-bold transition-colors ${
            saved ? "bg-action-tint text-action" : "bg-action text-white shadow-cta"
          }`}
        >
          {saved ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 12.5l5 5 10-11" /></svg> : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M6.5 4.5h11a1 1 0 011 1v14l-6.5-4-6.5 4v-14a1 1 0 011-1z" /></svg>}
        </button>
        <button
          onClick={handleShare}
          aria-label={t("share")}
          className="gkm-focus shrink-0 min-h-12 w-12 rounded-control border border-line inline-flex items-center justify-center text-sub"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4M12 4L7.5 8.5M12 4l4.5 4.5" /><path d="M5 14v4.5a1.5 1.5 0 001.5 1.5h11a1.5 1.5 0 001.5-1.5V14" /></svg>
        </button>
      </div>

      {/* Save → 일정 브리지 토스트 */}
      {savedToast && (
        <div className="fixed bottom-36 md:bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-ink text-white text-sm font-semibold pl-4 pr-2 py-2.5 rounded-control shadow-modal">
          <span className="inline-flex items-center gap-1.5"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 12.5l5 5 10-11" /></svg>{t("savedState")}</span>
          <Link
            href="/#planner"
            className="gkm-focus bg-action hover:bg-action-hover text-white text-sm font-bold px-3 py-1.5 rounded-control"
            onClick={() => setSavedT(false)}
          >
            {tSaved("build")}
          </Link>
        </div>
      )}

      {/* Share 결과 */}
      {shareMsg && (
        <div className="fixed bottom-36 md:bottom-6 left-1/2 -translate-x-1/2 z-50 max-w-[90vw] truncate bg-ink text-white text-sm font-semibold px-4 py-2.5 rounded-control shadow-modal">
          {shareMsg}
        </div>
      )}

      {reportOpen && (
        <PlaceReportModal
          onClose={() => setReportOpen(false)}
          targetType="city_spot" targetKey={String(spot.id)} placeName={text.name ?? ""}
        />
      )}
    </div>
  );
}
