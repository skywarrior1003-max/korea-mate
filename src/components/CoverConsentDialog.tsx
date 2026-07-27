"use client";

// GoKoreaMate — 개인 Memory 사진 공개 커버 동의 (V1B)
//
// 업로드만으로는 절대 공개되지 않는다. 사용자가 사진을 고르고, 아래 두 체크를
// 모두 선택해야만 적용 버튼이 활성화된다.
//
// ⚠ 문구를 축약하거나 작은 숨김 문구로 처리하지 않는다.
//   특히 "삭제·공개 취소 후에도 외부 SNS 캐시가 남을 수 있다"는 안내는
//   우리가 회수할 수 없는 위험을 사용자에게 알리는 유일한 수단이다.

import { useState } from "react";
import { useTranslations } from "next-intl";

export interface ConsentPhoto {
  momentId: string;
  /** 소유자 본인에게만 발급되는 단기 signed URL — 미리보기 전용 */
  previewUrl: string;
  label?: string;
}

interface Props {
  photos:   ConsentPhoto[];
  busy?:    boolean;
  onCancel: () => void;
  /** 두 체크가 모두 선택된 상태에서만 호출된다 */
  onApply:  (momentId: string) => void;
}

export default function CoverConsentDialog({ photos, busy = false, onCancel, onApply }: Props) {
  const t = useTranslations("coverConsent");
  const [selected, setSelected] = useState<string | null>(photos[0]?.momentId ?? null);
  const [ownRights, setOwnRights] = useState(false);   // 기본 미선택
  const [understand, setUnderstand] = useState(false); // 기본 미선택

  const canApply = Boolean(selected) && ownRights && understand && !busy;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-6"
      style={{ backgroundColor: "var(--gkm-overlay-scrim)" }}
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-label={t("title")}
    >
      <div
        className="bg-surface w-full sm:max-w-md max-h-[90vh] overflow-y-auto rounded-t-frame sm:rounded-frame shadow-modal p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-extrabold text-ink mb-1">{t("title")}</h2>
        <p className="text-sm text-sub mb-4">{t("subtitle")}</p>

        {/* 사진 선택 — 같은 일정의 사진만 전달받는다 */}
        <div className="grid grid-cols-3 gap-2 mb-5">
          {photos.map((p) => (
            <button
              key={p.momentId}
              type="button"
              onClick={() => setSelected(p.momentId)}
              aria-pressed={selected === p.momentId}
              className={`gkm-focus relative aspect-square rounded-control overflow-hidden border-2 ${
                selected === p.momentId ? "border-action" : "border-line"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.previewUrl} alt={p.label ?? ""} className="w-full h-full object-cover" />
            </button>
          ))}
        </div>

        {/* 공개 범위 안내 — 축약 금지 */}
        <ul className="mb-3 space-y-1.5 text-sm text-sub list-disc pl-5">
          <li>{t("scopePublicTrip")}</li>
          <li>{t("scopeLinkPreview")}</li>
          <li>{t("scopeAnyone")}</li>
        </ul>

        <p className="mb-5 rounded-control bg-surface-dim px-4 py-3 text-sm font-semibold text-ink">
          {t("cacheWarning")}
        </p>

        {/* 동의 2건 — 기본 미선택, 둘 다 필요 */}
        <label className="flex gap-3 mb-3 cursor-pointer">
          <input
            type="checkbox"
            checked={ownRights}
            onChange={(e) => setOwnRights(e.target.checked)}
            className="gkm-focus mt-0.5 h-5 w-5 shrink-0 accent-[color:var(--gkm-action)]"
          />
          <span className="text-sm text-ink">{t("checkOwnRights")}</span>
        </label>

        <label className="flex gap-3 mb-6 cursor-pointer">
          <input
            type="checkbox"
            checked={understand}
            onChange={(e) => setUnderstand(e.target.checked)}
            className="gkm-focus mt-0.5 h-5 w-5 shrink-0 accent-[color:var(--gkm-action)]"
          />
          <span className="text-sm text-ink">{t("checkUnderstandPublic")}</span>
        </label>

        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="gkm-focus flex-1 min-h-11 rounded-control border border-line bg-surface text-ink text-sm font-semibold"
          >
            {t("cancel")}
          </button>
          <button
            onClick={() => selected && onApply(selected)}
            disabled={!canApply}
            className="gkm-focus flex-1 min-h-11 rounded-control bg-action text-white text-sm font-bold shadow-cta disabled:opacity-45 disabled:cursor-not-allowed"
          >
            {busy ? t("applying") : t("apply")}
          </button>
        </div>
      </div>
    </div>
  );
}
