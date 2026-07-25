// S3 — Publish Preview (handoff §2F: "This is what others will see")
// 명시적 공개 선택 전에는 외부 노출 없음. 실존 기능만 표시:
// - 공개되는 것: 일정(제목·도시·기간·Day별 장소) — 기존 is_public 계약 그대로
// - 공개되지 않는 것: 사진·메모(서버 공개 API 부재 — 비공개 유지 사실 명시), 기기 식별자·GPS
// 가짜 토글·미지원 기능 노출 금지.

"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";

interface PreviewDay {
  dayNumber: number;
  places: { name: string }[];
}

interface Props {
  title: string;
  city: string;
  startDate: string;
  endDate: string;
  days: PreviewDay[];
  momentCount: number;
  onConfirm: () => void;
  onClose: () => void;
}

export default function PublishPreviewModal({
  title, city, startDate, endDate, days, momentCount, onConfirm, onClose,
}: Props) {
  const t = useTranslations("publish");

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", h); document.body.style.overflow = ""; };
  }, [onClose]);

  const totalPlaces = days.reduce((s, d) => s + d.places.length, 0);

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

          {/* ── 액션: coral primary 1개 ── */}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="gkm-focus flex-1 min-h-11 rounded-control border border-line bg-surface text-ink text-sm font-semibold"
            >
              {t("cancel")}
            </button>
            <button
              onClick={onConfirm}
              className="gkm-focus flex-1 min-h-11 rounded-control bg-action text-white text-sm font-bold hover:bg-action-hover shadow-cta"
            >
              {t("publish")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
