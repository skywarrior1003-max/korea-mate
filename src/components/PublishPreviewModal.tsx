// S3 — Publish Preview (handoff §2F: "This is what others will see")
// 명시적 공개 선택 전에는 외부 노출 없음. 실존 기능만 표시:
// - 공개되는 것: 일정(제목·도시·기간·Day별 장소) — 기존 is_public 계약 그대로
// - 공개되지 않는 것: 사진·메모(서버 공개 API 부재 — 비공개 유지 사실 명시), 기기 식별자·GPS
// 가짜 토글·미지원 기능 노출 금지.

"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { resolveTheme, pickAsset, coverProxyPath, THEME_LABEL } from "@/lib/trip-cover/cover-core";
import { renderShareCard, shareOrDownload } from "@/lib/trip-cover/share-card";

interface PreviewDay {
  dayNumber: number;
  places: { name: string; category?: string; location?: string }[];
}

interface Props {
  title: string;
  city: string;
  startDate: string;
  endDate: string;
  days: PreviewDay[];
  momentCount: number;
  /** 공개 API 실행 — 성공 여부를 반환해야 성공 화면으로 전환된다. */
  onConfirm: () => Promise<boolean>;
  /** 공개 성공 후 안내할 공유 URL (기존 /shared/{id} 규칙 재사용). null이면 수동 복사 영역 미표시. */
  shareUrl: string | null;
  /** Trip Cover 결정론적 선택 키. 없으면 커버 영역을 렌더하지 않는다. */
  itineraryId?: string | null;
  copyCount?: number;
  helpfulCount?: number;
  onClose: () => void;
}

type Phase = "preview" | "publishing" | "published";
type CopyState = "idle" | "copied" | "failed";

export default function PublishPreviewModal({
  title, city, startDate, endDate, days, momentCount, onConfirm, shareUrl,
  itineraryId = null, copyCount = 0, helpfulCount = 0, onClose,
}: Props) {
  const t = useTranslations("publish");
  const [phase, setPhase]         = useState<Phase>("preview");
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const [error, setError]         = useState(false);
  const [canShare, setCanShare]   = useState(false);
  const [cardState, setCardState] = useState<"idle" | "working" | "done" | "failed">("idle");

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

  async function copyLink(): Promise<boolean> {
    if (!shareUrl) return false;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopyState("copied");
      return true;
    } catch {
      setCopyState("failed");
      return false;
    }
  }

  // 공개 실행 → 성공 시에만 공유 URL 안내 + 자동 복사 1회 시도.
  // phase 가드로 중복 공개 요청을 차단한다.
  async function handlePublish() {
    if (phase !== "preview") return;
    setPhase("publishing");
    setError(false);
    const ok = await onConfirm();
    if (!ok) { setPhase("preview"); setError(true); return; }
    setPhase("published");
    void copyLink(); // 실패해도 공개 성공 상태는 유지
  }

  async function handleShare() {
    if (!shareUrl) return;
    try {
      await navigator.share({ title, text: `${city} · ${startDate} – ${endDate}`, url: shareUrl });
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
        className="bg-surface w-full sm:max-w-md max-h-[90vh] overflow-y-auto rounded-t-frame sm:rounded-frame shadow-modal"
        onClick={e => e.stopPropagation()}
      >
        {/* ══ 공개 성공 화면 — 별도 화면 이동 없이 링크 획득까지 완료 ══ */}
        {phase === "published" ? (
          <div className="p-6">
            <p className="text-xs font-bold text-faint uppercase tracking-wider mb-1">{t("eyebrow")}</p>
            <h2 className="text-xl font-extrabold text-ink mb-1">✓ {t("successTitle")}</h2>
            <p className="text-sm text-sub mb-4">{t("successHint")}</p>

            {/* 자동 복사 결과 — 성공/실패 상태를 명확히 구분 */}
            <div
              className={`rounded-control px-4 py-3 mb-4 text-sm font-semibold ${
                copyState === "copied"
                  ? "bg-ok-tint text-ok"
                  : "bg-surface-dim text-sub"
              }`}
            >
              {copyState === "copied" ? `✓ ${t("linkCopied")}` : t("copyManual")}
            </div>

            {/* ── Trip Cover 미리보기 + 세로 공유 이미지 (V1A) ─────────────────
                자산은 theme_only 이므로 사진 아래에 장소명을 붙이지 않는다.
                테마 라벨만 노출하고, 이미지는 같은 출처 프록시로만 불러온다. */}
            {cover && (
              <div className="mb-4">
                <div className="relative rounded-control overflow-hidden" style={{ backgroundColor: "#191C21" }}>
                  <img
                    src={coverProxyPath(cover.asset_id)}
                    alt={`${city} ${THEME_LABEL[coverTheme]}`}
                    className="w-full h-32 object-cover"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }}
                  />
                  <div
                    className="absolute inset-0"
                    style={{ background: "linear-gradient(to bottom, rgba(25,28,33,0) 40%, rgba(25,28,33,0.85) 100%)" }}
                  />
                  <p className="absolute left-3 bottom-2 text-[10px] font-black tracking-widest uppercase"
                     style={{ color: "#FF4A2D" }}>
                    {city} · {THEME_LABEL[coverTheme]}
                  </p>
                </div>
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
              </div>
            )}

            {/* 공유 URL — 자동 복사 실패 시에도 항상 수동 복사 가능 */}
            {shareUrl && (
              <p className="rounded-control bg-surface-dim border border-line px-3 py-2.5 mb-4 text-xs text-sub break-all select-all">
                {shareUrl}
              </p>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => void copyLink()}
                className="gkm-focus flex-1 min-h-11 rounded-control border border-line bg-surface text-ink text-sm font-semibold"
              >
                {copyState === "copied" ? `✓ ${t("copiedShort")}` : t("copyLink")}
              </button>
              {canShare ? (
                <button
                  onClick={() => void handleShare()}
                  className="gkm-focus flex-1 min-h-11 rounded-control bg-action text-white text-sm font-bold hover:bg-action-hover shadow-cta"
                >
                  {t("share")}
                </button>
              ) : (
                <button
                  onClick={onClose}
                  className="gkm-focus flex-1 min-h-11 rounded-control bg-action text-white text-sm font-bold hover:bg-action-hover shadow-cta"
                >
                  {t("done")}
                </button>
              )}
            </div>
            {canShare && (
              <button
                onClick={onClose}
                className="gkm-focus w-full min-h-11 mt-2 text-sm font-semibold text-sub hover:text-ink"
              >
                {t("done")}
              </button>
            )}
          </div>
        ) : (
        <div className="p-6">
          <p className="text-xs font-bold text-faint uppercase tracking-wider mb-1">{t("eyebrow")}</p>
          <h2 className="text-xl font-extrabold text-ink mb-4">{t("title")}</h2>

          {/* ── 공개될 내용 미리보기 (Story에 보이는 그대로) ── */}
          <div className="rounded-card border border-line overflow-hidden mb-4">
            <div className="bg-surface-dim px-4 py-3 border-b border-line">
              <p className="font-bold text-ink text-[15px]">{title}</p>
              <p className="text-xs text-faint mt-0.5">{city} · {startDate} – {endDate}</p>
            </div>
            <ul className="px-4 py-3 flex flex-col gap-1.5">
              {days.map(d => (
                <li key={d.dayNumber} className="text-sm text-sub flex justify-between gap-3">
                  <span className="font-semibold text-ink shrink-0">Day {d.dayNumber}</span>
                  <span className="truncate text-right">
                    {d.places.slice(0, 2).map(p => p.name).join(", ")}
                    {d.places.length > 2 ? ` +${d.places.length - 2}` : ""}
                  </span>
                </li>
              ))}
            </ul>
            <p className="px-4 pb-3 text-xs text-faint">{t("placesTotal", { n: totalPlaces })}</p>
          </div>

          {/* ── 공개되지 않는 것 — 사실 그대로 명시 ── */}
          <div className="rounded-control bg-ok-tint border border-ok/20 px-4 py-3 mb-5 flex flex-col gap-1.5">
            <p className="text-sm font-bold text-ok">🔒 {t("privateTitle")}</p>
            <p className="text-xs text-sub leading-relaxed">
              {momentCount > 0 ? t("photosStayPrivate", { n: momentCount }) : t("noPhotos")}
            </p>
            <p className="text-xs text-sub leading-relaxed">{t("noDeviceInfo")}</p>
          </div>

          {/* 공개 실패 시에만 표시 — 재시도 가능 */}
          {error && (
            <p className="rounded-control bg-error-tint text-error text-sm font-semibold px-4 py-3 mb-4">
              {t("failed")}
            </p>
          )}

          {/* ── 액션: coral primary 1개 ── */}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              disabled={phase === "publishing"}
              className="gkm-focus flex-1 min-h-11 rounded-control border border-line bg-surface text-ink text-sm font-semibold disabled:opacity-50"
            >
              {t("cancel")}
            </button>
            <button
              onClick={() => void handlePublish()}
              disabled={phase === "publishing"}
              className="gkm-focus flex-1 min-h-11 rounded-control bg-action text-white text-sm font-bold hover:bg-action-hover shadow-cta disabled:opacity-60"
            >
              {phase === "publishing" ? t("publishing") : t("publish")}
            </button>
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
