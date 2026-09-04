// S3 — Publish Preview (handoff §2F: "This is what others will see")
// 명시적 공개 선택 전에는 외부 노출 없음. 실존 기능만 표시:
// - 공개되는 것: 일정(제목·도시·기간·Day별 장소) — 기존 is_public 계약 그대로
// - 공개되지 않는 것: 사진·메모(서버 공개 API 부재 — 비공개 유지 사실 명시), 기기 식별자·GPS
// 가짜 토글·미지원 기능 노출 금지.

"use client";

import { reportShareEvent, shareIdFromUrl } from "@/lib/social/signals";
import ShareIcon from "@/components/ui/ShareIcon";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { resolveTheme, coverProxyPath, coverEyebrow, coverAlt } from "@/lib/trip-cover/cover-core";
import type { CoverDisplayKind } from "@/lib/trip-cover/cover-core";
import { pickAsset } from "@/lib/trip-cover/assets.data";
import { renderShareCard, shareOrDownload } from "@/lib/trip-cover/share-card";
import { CONSENT_VERSION } from "@/lib/trip-cover/cover-state-core";
import CoverConsentDialog, { type ConsentPhoto } from "@/components/CoverConsentDialog";
import { getDeviceId } from "@/lib/deviceId";
// 최신 승인 디자인(Public Memory Story)의 시각 토큰을 그대로 쓴다. 이 화면은
// 공개 Story 를 만드는 자리이므로 같은 언어를 써야 한다 — 일반 관리 폼처럼
// 보이면 사용자는 자기 여행 기록을 다루고 있다고 느끼지 못한다. 숫자를 새로
// 정하지 않고 story-tokens 의 값을 읽는다.
import {
  PAGE_BG, PRIMARY, ON_SURFACE, ON_SURFACE_VARIANT, SURFACE_VARIANT,
  PRIMARY_CONTAINER, ON_PRIMARY_CONTAINER, OUTLINE_VARIANT,
  MARGIN_MOBILE, STACK_MD, RADIUS_PHOTO, AMBIENT_SHADOW,
  HEADLINE_LG_MOBILE, TITLE_MD, BODY_SM, LABEL_CAPS_WIDE,
} from "@/components/story/story-tokens";
import { summarizeSelection } from "@/lib/trip-moments/publish-reconcile-core";
import type { PublishOutcome } from "@/lib/trip-moments/publish-reconcile-core";

interface PreviewDay {
  dayNumber: number;
  places: { name: string; category?: string; location?: string }[];
}

/**
 * 공개 후보 Memory 한 건. 화면이 그리는 데 필요한 것만 담는다 —
 * 좌표·기기 식별자·사진 원본은 여기 오지 않는다.
 */
export interface PublishMemoryItem {
  momentId:   string;
  dayNumber:  number | null;
  placeName:  string | null;
  photoCount: number;
  hasMemo:    boolean;
  /** 서버가 알려준 지금 공개 상태. 처음 선택 상태의 근거다. */
  isPublic:   boolean;
  /**
   * 고를 수 있는가. 아직 서버에 올라가지 않은 Memory 는 공개 요청을 보내도
   * 404 다 — 눌러도 안 되는 것을 열어 주지 않는다.
   */
  selectable: boolean;
}

interface Props {
  title: string;
  city: string;
  startDate: string;
  endDate: string;
  days: PreviewDay[];
  momentCount: number;
  /**
   * 최초 공개 실행. 고른 Memory 목록을 넘기고 **한 개의 결과**를 돌려받는다.
   * 개별 요청의 성공 개수는 화면이 알 필요가 없다 — 사용자는 Publish 를 한 번
   * 눌렀고, 그 한 번에 대한 답도 하나여야 한다.
   */
  onConfirm: (selectedMomentIds: string[]) => Promise<PublishOutcome["status"]>;
  /** 공개 후보 Memory. 비우면 선택 영역을 그리지 않는다. */
  memories?: PublishMemoryItem[];
  /** 공개 성공 후 Story Card 를 열 수 있으면 준다. 없으면 버튼을 그리지 않는다. */
  onOpenStoryCard?: () => Promise<boolean>;
  /** 공개 성공 후 안내할 공유 URL (기존 /shared/{id} 규칙 재사용). null이면 수동 복사 영역 미표시. */
  shareUrl: string | null;
  /** Trip Cover 결정론적 선택 키. 없으면 커버 영역을 렌더하지 않는다. */
  itineraryId?: string | null;
  copyCount?: number;
  helpfulCount?: number;
  /** 서버 동기화가 끝난 Memory 사진만 (커버 PUT 이 성공할 수 있는 것들) */
  coverPhotos?: ConsentPhoto[];
  /** 아직 사진 동기화가 끝나지 않은 Memory 수 — 안내 문구용 */
  coverPendingCount?: number;
  /**
   * 서버가 알려준 현재 커버 종류. 미리보기 문구의 유일한 근거다.
   * 모르는 상태로 관광 테마 라벨을 그리면 개인 사진을 오표기하므로
   * 기본값은 "unknown"(도시명만) 이다.
   */
  coverKind?: CoverDisplayKind;
  onClose: () => void;
}

type Phase = "preview" | "publishing" | "published";
type CopyState = "idle" | "copied" | "failed";

export default function PublishPreviewModal({
  title, city, startDate, endDate, days, momentCount, onConfirm, memories = [], onOpenStoryCard, shareUrl,
  itineraryId = null, copyCount = 0, helpfulCount = 0, coverPhotos = [],
  coverPendingCount = 0, coverKind = "unknown", onClose,
}: Props) {
  const t = useTranslations("publish");
  const tConsent = useTranslations("coverConsent");
  const tMemo    = useTranslations("memo");
  const [phase, setPhase]         = useState<Phase>("preview");
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const [error, setError]         = useState(false);
  const [canShare, setCanShare]   = useState(false);
  const [cardState, setCardState] = useState<"idle" | "working" | "done" | "failed">("idle");
  const [consentOpen, setConsentOpen] = useState(false);
  // 공개하기로 고른 Memory. 처음 값은 **서버가 알려준 지금 상태**다 —
  // 지난 시도에서 켜진 채 남은 것이 있으면 사용자가 그것을 보고 정할 수 있어야 한다.
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(memories.filter(m => m.selectable && m.isPublic).map(m => m.momentId)),
  );
  const [okRights,     setOkRights]     = useState(false);
  const [okUnderstand, setOkUnderstand] = useState(false);
  // 실패의 종류. "공개 못 함" 과 "공개는 됐는데 카드 실패" 는 다른 사실이다.
  const [failKind, setFailKind] = useState<"notPublished" | "card" | null>(null);
  const [coverBusy,   setCoverBusy]   = useState(false);
  const [personalOn,  setPersonalOn]  = useState(false);   // 개인 커버 적용됨
  const [coverBust,   setCoverBust]   = useState(0);       // 미리보기 갱신용

  // Web Share API 지원 여부 — 마운트 후 판정 (SSR hydration 불일치 방지)
  useEffect(() => {
    setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      // 공개 요청 진행 중에는 ESC로 닫지 않는다 (중복 요청·상태 유실 방지)
      if (e.key === "Escape" && phase !== "publishing") onClose();
    };
    window.addEventListener("keydown", h);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", h); document.body.style.overflow = ""; };
  }, [onClose, phase]);

  const totalPlaces = days.reduce((s, d) => s + d.places.length, 0);
  /** 시안의 카드 — 흰 바탕 · rounded-xl · ambient shadow. 테두리를 쓰지 않는다. */
  const CARD_STYLE = { backgroundColor: "#fff", borderRadius: RADIUS_PHOTO, boxShadow: AMBIENT_SHADOW } as const;
  /** 비공개로 남는 사진 수. 목록이 없으면 예전 계약(momentCount)을 그대로 쓴다. */
  const photoTotal = memories.length > 0
    ? memories.reduce((n, m) => n + (m.photoCount > 0 ? m.photoCount : 0), 0)
    : momentCount;

  // 이 모달에서 개인 커버를 적용하면 서버 응답을 다시 기다리지 않고 personal 로 확정한다
  const displayKind: CoverDisplayKind = personalOn ? "personal" : coverKind;

  // ── Trip Cover V1A — 결정론적 테마 커버 ──────────────────────────────────
  const coverPlaces = days.flatMap((d) =>
    d.places.map((p) => ({ name: p.name, category: p.category, location: p.location })),
  );
  const coverTheme = resolveTheme({ tripTitle: title, places: coverPlaces }).theme;
  const cover      = itineraryId ? pickAsset(itineraryId, coverTheme) : undefined;
  const neighborhoods = new Set(
    coverPlaces.map((p) => (p.location ?? "").trim()).filter(Boolean),
  ).size;

  /** 세로 공유 카드 생성 — 실패해도 Publish 성공 상태를 되돌리지 않는다 */
  async function createCard(): Promise<void> {
    if (!cover) return;
    setCardState("working");
    try {
      const blob = await renderShareCard({
        coverSrc:      coverProxyPath(cover.asset_id),
        theme:         coverTheme,
        title,
        city,
        startDate,
        endDate,
        days:          days.length,
        places:        totalPlaces,
        neighborhoods,
        copyCount,
        helpfulCount,
        attribution:   cover.attribution_text.replace(/\s*\(KOGL Type 1\)\s*$/i, ""),
      });
      await shareOrDownload(blob, `gokoreamate-${city.toLowerCase()}-trip.png`, title);
      setCardState("done");
    } catch {
      setCardState("failed");
    }
  }

  /** 개인 사진을 공개 커버로 적용. 실패해도 Publish 성공 상태는 유지된다. */
  async function applyPersonalCover(momentId: string): Promise<void> {
    if (!itineraryId) return;
    setCoverBusy(true);
    try {
      const res = await fetch(`/api/itinerary/${encodeURIComponent(itineraryId)}/cover`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json", "x-device-id": getDeviceId() },
        body:    JSON.stringify({
          kind: "moment", momentId, consent: true, consentVersion: CONSENT_VERSION,
        }),
      });
      if (res.ok) {
        setPersonalOn(true);
        setCoverBust((n) => n + 1);
        setConsentOpen(false);
      }
      // 실패 시 조용히 기존 V1A 관광 커버를 유지한다 (Publish 는 이미 성공)
    } catch {
      /* 네트워크 실패 — 관광 커버 유지 */
    } finally {
      setCoverBusy(false);
    }
  }

  async function copyLink(): Promise<boolean> {
    if (!shareUrl) return false;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopyState("copied");
      { const sid = shareIdFromUrl(shareUrl); if (sid) reportShareEvent("story", sid, "copy_link"); }
      return true;
    } catch {
      setCopyState("failed");
      return false;
    }
  }

  // 공개 실행 → 성공 시에만 공유 URL 안내 + 자동 복사 1회 시도.
  // phase 가드로 중복 공개 요청을 차단한다.
  const pickable   = memories.filter(m => m.selectable);
  const chosen     = pickable.filter(m => selected.has(m.momentId));
  const summary    = summarizeSelection(
    chosen.map(m => ({ photoCount: m.photoCount, hasMemo: m.hasMemo })),
  );
  // 공개할 것을 골랐을 때만 동의를 요구한다. 하나도 고르지 않으면 이 Publish 는
  // 일정만 공개하는 것이고, 그것은 기존 계약 그대로다.
  const consentNeeded = chosen.length > 0;
  const consentDone   = !consentNeeded || (okRights && okUnderstand);

  function toggle(momentId: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(momentId)) next.delete(momentId); else next.add(momentId);
      return next;
    });
  }

  async function handlePublish() {
    if (phase !== "preview" || !consentDone) return;
    setPhase("publishing");
    setError(false);
    setFailKind(null);
    // 고른 Memory 를 서버 상태와 맞춘 **뒤에** 여행을 공개한다. 그 순서와
    // 실패 판정은 호출부(reconciliation)가 책임진다. 여기서는 결과 하나만 본다.
    const status = await onConfirm([...selected]);
    if (status !== "published") {
      setPhase("preview");
      setError(true);
      setFailKind("notPublished");
      return;
    }
    setPhase("published");
    void copyLink(); // 실패해도 공개 성공 상태는 유지
  }

  /** 공개는 이미 끝났다. 여기서 실패하는 것은 카드뿐이다 — 되돌리지 않는다. */
  async function handleOpenStoryCard() {
    if (!onOpenStoryCard) return;
    setFailKind(null);
    const ok = await onOpenStoryCard();
    if (!ok) setFailKind("card");
  }

  async function handleShare() {
    if (!shareUrl) return;
    try {
      await navigator.share({ title, text: `${city} · ${startDate} – ${endDate}`, url: shareUrl });
      { const sid = shareIdFromUrl(shareUrl); if (sid) reportShareEvent("story", sid, "web_share"); }
    } catch {
      // 사용자 취소(AbortError)·미지원은 오류 아님 — 상태 변경 없음
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-6"
      style={{ backgroundColor: "var(--gkm-overlay-scrim)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t("title")}
    >
      <div
        className="w-full sm:max-w-md max-h-[92vh] flex flex-col overflow-hidden rounded-t-frame sm:rounded-frame shadow-modal"
        style={{ backgroundColor: PAGE_BG }}
        onClick={e => e.stopPropagation()}
      >
        {consentOpen && (
          <CoverConsentDialog
            photos={coverPhotos}
            busy={coverBusy}
            onCancel={() => setConsentOpen(false)}
            onApply={(momentId) => void applyPersonalCover(momentId)}
          />
        )}

        {/* ══ 공개 성공 화면 — 별도 화면 이동 없이 링크 획득까지 완료 ══ */}
        {phase === "published" ? (
          <div className="overflow-y-auto" style={{ padding: MARGIN_MOBILE }}>
            <p style={{ ...LABEL_CAPS_WIDE, color: ON_SURFACE_VARIANT, textTransform: "uppercase" }}>{t("eyebrow")}</p>
            <h2 className="mt-1.5" style={{ ...HEADLINE_LG_MOBILE, color: ON_SURFACE }}>✓ {t("successTitle")}</h2>
            <p className="mt-1.5 mb-4" style={{ ...BODY_SM, color: ON_SURFACE_VARIANT }}>{t("successHint")}</p>

            {/* 자동 복사 결과 — 성공/실패 상태를 명확히 구분 */}
            <div
              className="px-4 py-3 mb-4"
              style={{
                ...BODY_SM,
                borderRadius: RADIUS_PHOTO,
                color: copyState === "copied" ? ON_PRIMARY_CONTAINER : ON_SURFACE_VARIANT,
                backgroundColor: copyState === "copied" ? `${PRIMARY_CONTAINER}20` : "#fff",
                boxShadow: AMBIENT_SHADOW,
              }}
            >
              {copyState === "copied" ? `✓ ${t("linkCopied")}` : t("copyManual")}
            </div>

            {/* ── SNS 9:16 공유 카드 ──
                공개는 이미 끝났다. 여기서 실패해도 "아직 비공개" 라고 말하지
                않는다 — 사실이 아니고, 사용자가 다시 Publish 를 누르게 만든다. */}
            {onOpenStoryCard && (
              <div className="mb-4">
                <button
                  onClick={() => void handleOpenStoryCard()}
                  className="gkm-focus w-full min-h-12 rounded-full text-white"
                  style={{ ...TITLE_MD, backgroundColor: PRIMARY }}
                >
                  {t("openStoryCard")}
                </button>
                {failKind === "card" && (
                  <p role="alert" className="mt-2" style={{ ...BODY_SM, fontSize: "13px", color: "#8c1d18" }}>
                    {t("cardFailed")}
                  </p>
                )}
              </div>
            )}

            {/* ── Trip Cover 미리보기 + 세로 공유 이미지 (V1A) ─────────────────
                자산은 theme_only 이므로 사진 아래에 장소명을 붙이지 않는다.
                테마 라벨만 노출하고, 이미지는 같은 출처 프록시로만 불러온다. */}
            {cover && (
              <div className="mb-4">
                <div className="relative rounded-control overflow-hidden" style={{ backgroundColor: "#191C21" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={itineraryId
                      ? `/img/trip-cover/${encodeURIComponent(itineraryId)}?v=${coverBust}`
                      : coverProxyPath(cover.asset_id)}
                    alt={coverAlt(displayKind, { city, theme: coverTheme, title })}
                    className="w-full h-32 object-cover"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }}
                  />
                  <div
                    className="absolute inset-0"
                    style={{ background: "linear-gradient(to bottom, rgba(25,28,33,0) 40%, rgba(25,28,33,0.85) 100%)" }}
                  />
                  <p className="absolute left-3 bottom-2 text-[10px] font-black tracking-widest uppercase"
                     style={{ color: "#FF4A2D" }}>
                    {coverEyebrow(city, displayKind, coverTheme)}
                  </p>
                </div>
                {coverPhotos.length === 0 && coverPendingCount > 0 && (
                  <p className="mt-2 text-xs text-sub">{tMemo("coverNeedsSync")}</p>
                )}
                {coverPhotos.length > 0 && !personalOn && (
                  <button
                    onClick={() => setConsentOpen(true)}
                    className="gkm-focus w-full min-h-11 mt-2 rounded-control border border-line bg-surface text-ink text-sm font-semibold"
                  >
                    {tConsent("useMyPhoto")}
                  </button>
                )}
                {/* 예전 세로 이미지 만들기.
                    위 `onOpenStoryCard` 가 있으면 이 화면에는 이미 정본 9:16
                    카드(TripStoryExport) 버튼이 있다. 둘을 같이 두면 "공유 카드"
                    와 "공유 이미지" 라는 거의 같은 이름의 버튼이 나란히 서서
                    무엇을 눌러야 하는지 알 수 없다. 그래서 정본이 있는 화면에서는
                    이쪽을 내린다 — 코드는 지우지 않는다. 정본을 주지 않는 호출부가
                    생기면 예전 동작이 그대로 남아야 한다. */}
                {!onOpenStoryCard && (
                <button
                  onClick={() => void createCard()}
                  disabled={cardState === "working"}
                  className="gkm-focus w-full min-h-11 mt-2 rounded-control border border-line bg-surface text-ink text-sm font-semibold disabled:opacity-60"
                >
                  {cardState === "working" ? t("creatingImage")
                    : cardState === "done"  ? `✓ ${t("imageReady")}`
                    : cardState === "failed" ? t("imageFailed")
                    : t("createShareImage")}
                </button>
                )}
              </div>
            )}

            {/* 공유 URL — 자동 복사 실패 시에도 항상 수동 복사 가능 */}
            {shareUrl && (
              <p
                className="px-4 py-3 mb-4 break-all select-all"
                style={{ ...BODY_SM, fontSize: "13px", color: ON_SURFACE_VARIANT, backgroundColor: "#fff", borderRadius: RADIUS_PHOTO, border: `1px solid ${SURFACE_VARIANT}` }}
              >
                {shareUrl}
              </p>
            )}

            {/* 이 화면의 primary 는 위의 공유 카드다. 링크 복사·공유는 보조,
                닫기는 그 아래 조용한 자리에 둔다 — 닫기를 가장 눈에 띄게 만들면
                방금 만든 것을 보지 않고 나가게 된다. */}
            <div className="flex gap-2">
              <button
                onClick={() => void copyLink()}
                className="gkm-focus flex-1 min-h-12 rounded-full"
                style={{ ...TITLE_MD, fontSize: "15px", color: ON_SURFACE, backgroundColor: "#fff", border: `1px solid ${SURFACE_VARIANT}` }}
              >
                {copyState === "copied" ? `✓ ${t("copiedShort")}` : t("copyLink")}
              </button>
              {canShare && (
                <button
                  onClick={() => void handleShare()}
                  className="gkm-focus flex-1 min-h-12 rounded-full"
                  style={{ ...TITLE_MD, fontSize: "15px", color: ON_SURFACE, backgroundColor: "#fff", border: `1px solid ${SURFACE_VARIANT}` }}
                >
                  <span className="inline-flex items-center justify-center gap-1.5">
                    <ShareIcon size={15} />
                    {t("share")}
                  </span>
                </button>
              )}
            </div>
            <button
              onClick={onClose}
              className="gkm-focus w-full min-h-12 mt-2"
              style={{ ...TITLE_MD, fontSize: "15px", color: ON_SURFACE_VARIANT }}
            >
              {t("done")}
            </button>
          </div>
        ) : (
        <>
        {/* 안쪽만 스크롤한다 — 아래 CTA 는 항상 화면에 남는다.
            예전에는 시트 전체가 스크롤이라 모바일에서 Publish 버튼이 접힌
            아래로 밀려 보이지 않았다. */}
        <div className="flex-1 min-h-0 overflow-y-auto" style={{ padding: MARGIN_MOBILE }}>
          <p style={{ ...LABEL_CAPS_WIDE, color: ON_SURFACE_VARIANT, textTransform: "uppercase" }}>{t("eyebrow")}</p>
          <h2 className="mt-1.5" style={{ ...HEADLINE_LG_MOBILE, color: ON_SURFACE }}>{t("title")}</h2>

          {/* 공개될 내용 미리보기 (Story 에 보이는 그대로) */}
          <div className="overflow-hidden" style={{ ...CARD_STYLE, marginTop: STACK_MD }}>
            <div className="px-5 pt-4 pb-3">
              <p style={{ ...TITLE_MD, color: ON_SURFACE }}>{title}</p>
              <p className="mt-0.5" style={{ ...BODY_SM, color: ON_SURFACE_VARIANT }}>
                {city} · {startDate} – {endDate}
              </p>
            </div>
            <ul className="px-5 pb-1 flex flex-col gap-2">
              {days.map(d => (
                <li key={d.dayNumber} className="flex gap-3" style={{ ...BODY_SM, color: ON_SURFACE_VARIANT }}>
                  <span className="shrink-0 font-semibold" style={{ color: ON_SURFACE }}>Day {d.dayNumber}</span>
                  <span className="truncate">
                    {d.places.slice(0, 2).map(p => p.name).join(", ")}
                    {d.places.length > 2 ? ` +${d.places.length - 2}` : ""}
                  </span>
                </li>
              ))}
            </ul>
            <p className="px-5 pt-2 pb-4" style={{ ...BODY_SM, color: ON_SURFACE_VARIANT, opacity: 0.75 }}>
              {t("placesTotal", { n: totalPlaces })}
            </p>
          </div>

          {/* 공개 Story 에 넣을 Memory 고르기.
              기본값은 서버의 지금 상태다. 자동 전체선택을 하지 않는다 —
              공개는 사용자가 켜는 것이지 기본으로 켜져 있는 것이 아니다. */}
          {pickable.length > 0 && (
            <div className="overflow-hidden" style={{ ...CARD_STYLE, marginTop: STACK_MD }}>
              <div className="px-5 pt-4 pb-3">
                <p style={{ ...TITLE_MD, color: ON_SURFACE }}>{t("memoriesTitle")}</p>
                <p className="mt-1" style={{ ...BODY_SM, color: ON_SURFACE_VARIANT }}>{t("memoriesHint")}</p>
              </div>
              <ul>
                {pickable.map((m, i) => {
                  const on = selected.has(m.momentId);
                  return (
                    <li key={m.momentId} style={i === 0 ? undefined : { borderTop: `1px solid ${SURFACE_VARIANT}` }}>
                      <label
                        className="flex items-center gap-3.5 px-5 cursor-pointer"
                        style={{ minHeight: 56, backgroundColor: on ? `${PRIMARY_CONTAINER}14` : undefined }}
                      >
                        <input
                          type="checkbox"
                          className="gkm-focus h-5 w-5 shrink-0"
                          style={{ accentColor: PRIMARY }}
                          checked={on}
                          onChange={() => toggle(m.momentId)}
                          disabled={phase === "publishing"}
                        />
                        <span className="min-w-0 py-2.5">
                          <span className="block truncate" style={{ ...TITLE_MD, fontSize: "15px", color: ON_SURFACE }}>
                            {m.placeName?.trim()
                              || (m.dayNumber === null ? tMemo("dayUnassigned") : `Day ${m.dayNumber}`)}
                          </span>
                          <span className="block" style={{ ...BODY_SM, fontSize: "13px", color: ON_SURFACE_VARIANT }}>
                            {[
                              m.dayNumber !== null && m.placeName?.trim() ? `Day ${m.dayNumber}` : null,
                              m.photoCount > 0 ? tMemo("photoCount", { n: m.photoCount }) : null,
                              m.hasMemo ? t("memoryHasNote") : null,
                            ].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
              {/* 고른 것이 실제로 무엇을 공개하는지 — 한 건짜리 동의 화면과 같은 규칙 */}
              <p
                className="px-5 py-3.5"
                style={{
                  ...BODY_SM,
                  color: chosen.length > 0 ? ON_PRIMARY_CONTAINER : ON_SURFACE_VARIANT,
                  backgroundColor: chosen.length > 0 ? `${PRIMARY_CONTAINER}20` : undefined,
                  borderTop: `1px solid ${SURFACE_VARIANT}`,
                }}
              >
                {summary.scope === "photos_and_memo" ? t("summaryPhotosAndMemos", { p: summary.photos, m: summary.memos })
                  : summary.scope === "photos_only"  ? t("summaryPhotosOnly",     { p: summary.photos })
                  : summary.scope === "memo_only"    ? t("summaryMemosOnly",      { m: summary.memos })
                  :                                    t("summaryNone")}
              </p>
            </div>
          )}

          {/* 고른 것이 있을 때만 동의 — 기존 Memory 동의 문구를 그대로 쓴다 */}
          {consentNeeded && (
            <div className="px-5 py-4 flex flex-col gap-3" style={{ ...CARD_STYLE, marginTop: STACK_MD }}>
              <p style={{ ...BODY_SM, color: ON_SURFACE_VARIANT }}>{tMemo("consentScopeAnyone")}</p>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  className="gkm-focus mt-0.5 h-5 w-5 shrink-0"
                  style={{ accentColor: PRIMARY }}
                  checked={okRights}
                  onChange={e => setOkRights(e.target.checked)}
                  disabled={phase === "publishing"}
                />
                <span style={{ ...BODY_SM, color: ON_SURFACE }}>{tMemo("consentCheckRights")}</span>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  className="gkm-focus mt-0.5 h-5 w-5 shrink-0"
                  style={{ accentColor: PRIMARY }}
                  checked={okUnderstand}
                  onChange={e => setOkUnderstand(e.target.checked)}
                  disabled={phase === "publishing"}
                />
                <span style={{ ...BODY_SM, color: ON_SURFACE }}>{tMemo("consentCheckUnderstand")}</span>
              </label>
            </div>
          )}

          {/* 공개되지 않는 것 — 사실 그대로 명시 */}
          <div
            className="px-5 py-4 flex flex-col gap-1.5"
            style={{ borderRadius: RADIUS_PHOTO, border: `1px solid ${OUTLINE_VARIANT}`, marginTop: STACK_MD }}
          >
            <p style={{ ...TITLE_MD, fontSize: "15px", color: ON_SURFACE }}>🔒 {t("privateTitle")}</p>
            <p style={{ ...BODY_SM, color: ON_SURFACE_VARIANT }}>
              {/* 문구가 "사진 n장" 이라고 말하므로 n 은 사진 수여야 한다. 예전에는
                  Memory 개수를 넘겨서, 사진 없는 Memory 가 섞이면 없는 사진을
                  세어 말했다. 목록을 받지 못한 호출부에서는 예전 값을 쓴다. */}
              {photoTotal > 0 ? t("photosStayPrivate", { n: photoTotal }) : t("noPhotos")}
            </p>
            <p style={{ ...BODY_SM, color: ON_SURFACE_VARIANT }}>{t("noDeviceInfo")}</p>
          </div>

          {/* 공개 실패 시에만 표시 — 재시도 가능 */}
          {error && (
            <p
              role="alert"
              className="px-5 py-3.5"
              style={{ ...BODY_SM, color: "#8c1d18", backgroundColor: "#f9dedc", borderRadius: RADIUS_PHOTO, marginTop: STACK_MD }}
            >
              {failKind === "notPublished" ? t("failNotPublished") : t("failed")}
            </p>
          )}
        </div>

        {/* 액션 — 스크롤과 무관하게 항상 보인다 */}
        <div
          className="flex items-center gap-3 shrink-0"
          style={{ padding: MARGIN_MOBILE, borderTop: `1px solid ${SURFACE_VARIANT}`, backgroundColor: PAGE_BG }}
        >
          <button
            onClick={onClose}
            disabled={phase === "publishing"}
            className="gkm-focus min-h-12 px-4 disabled:opacity-50"
            style={{ ...TITLE_MD, fontSize: "15px", color: ON_SURFACE_VARIANT }}
          >
            {t("cancel")}
          </button>
          <button
            onClick={() => void handlePublish()}
            disabled={phase === "publishing" || !consentDone}
            className="gkm-focus flex-1 min-h-12 rounded-full text-white disabled:opacity-40"
            style={{ ...TITLE_MD, backgroundColor: PRIMARY }}
          >
            {phase === "publishing" ? t("publishing") : t("publish")}
          </button>
        </div>
        </>
        )}
      </div>
    </div>
  );
}
