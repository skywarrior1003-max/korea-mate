"use client";

// 본인 공개 Story 의 "지역 추천에 제출" (§5-2)
//
//  · 공개 상태에서만 마운트된다(호출부 책임 + 서버 재검증).
//  · 제출 전 공개 범위·복사 계약을 명확히 안내한다: 다른 사용자가 보는 것과
//    `+ 내 여행` 으로 복사되는 것(장소·순서뿐)을 구분해 적는다.
//  · 상태: 미제출 → pending → approved/rejected, 철회(withdrawn) 가능.

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { getDeviceId } from "@/lib/deviceId";

type Status = "pending" | "approved" | "rejected" | "withdrawn" | null;

export default function StoryRecommendSubmit({ itineraryId }: { itineraryId: string }) {
  const t = useTranslations("community");
  const [status, setStatus] = useState<Status | "unknown">("unknown");
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/story-submission?itinerary_id=${itineraryId}`,
          { headers: { "x-device-id": getDeviceId() } });
        if (!alive) return;
        if (!res.ok) { setStatus(null); return; }
        const b = await res.json() as { status: Status };
        setStatus(b.status);
      } catch { if (alive) setStatus(null); }
    })();
    return () => { alive = false; };
  }, [itineraryId]);

  async function submit() {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/story-submission", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-device-id": getDeviceId() },
        body: JSON.stringify({ itinerary_id: itineraryId }),
      });
      const b = await res.json().catch(() => ({})) as { status?: Status; error?: string };
      if (!res.ok) { setError(b.error ?? "server_error"); return; }
      setStatus("pending"); setConfirmOpen(false);
    } catch { setError("server_error"); }
    finally { setBusy(false); }
  }

  async function withdraw() {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/story-submission?itinerary_id=${itineraryId}`, {
        method: "DELETE", headers: { "x-device-id": getDeviceId() },
      });
      if (!res.ok) { setError("server_error"); return; }
      setStatus("withdrawn");
    } catch { setError("server_error"); }
    finally { setBusy(false); }
  }

  if (status === "unknown") return null;

  const statusLine =
    status === "pending"  ? t("submitStatusPending")  :
    status === "approved" ? t("submitStatusApproved") :
    status === "rejected" ? t("submitStatusRejected") : null;

  return (
    <div className="rounded-xl border border-line bg-white px-4 py-3.5">
      <p className="text-[13.5px] font-bold text-ink">{t("submitTitle")}</p>
      {statusLine ? (
        <div className="mt-1.5 flex items-center justify-between gap-3">
          <p className="text-[12.5px] text-sub">{statusLine}</p>
          {(status === "pending" || status === "approved") && (
            <button type="button" onClick={withdraw} disabled={busy}
              className="gkm-focus flex-none text-[12.5px] font-semibold text-sub underline underline-offset-2 min-h-11 disabled:opacity-50">
              {t("submitWithdraw")}
            </button>
          )}
        </div>
      ) : (
        <>
          <p className="mt-1 text-[12.5px] text-sub">{t("submitBody")}</p>
          {!confirmOpen ? (
            <button type="button" onClick={() => setConfirmOpen(true)}
              className="gkm-focus mt-2.5 min-h-11 px-4 rounded-xl bg-gray-900 text-white text-[13px] font-bold">
              {t("submitCta")}
            </button>
          ) : (
            <div className="mt-2.5 rounded-xl bg-gray-50 border border-line px-3.5 py-3">
              {/* §5-2 제출 전 안내 — 보이는 것과 복사되는 것을 구분해 명시 */}
              <ul className="text-[12px] text-sub leading-relaxed list-disc pl-4">
                <li>{t("submitNoticeVisible")}</li>
                <li>{t("submitNoticeNotCopied")}</li>
                <li>{t("submitNoticeCopied")}</li>
              </ul>
              <div className="mt-2.5 flex gap-2">
                <button type="button" onClick={() => setConfirmOpen(false)} disabled={busy}
                  className="gkm-focus flex-1 min-h-11 rounded-xl border border-line text-[13px] font-semibold text-sub">
                  {t("feedbackClose")}
                </button>
                <button type="button" onClick={submit} disabled={busy}
                  className="gkm-focus flex-1 min-h-11 rounded-xl bg-gray-900 text-white text-[13px] font-bold disabled:opacity-50">
                  {busy ? t("feedbackSending") : t("submitConfirm")}
                </button>
              </div>
            </div>
          )}
        </>
      )}
      {error && (
        <p className="mt-1.5 text-[12px] text-red-600" role="alert">
          {error === "too_few_places" ? t("submitErrorTooFew")
            : error === "already_submitted" ? t("submitErrorDup")
            : t("feedbackError")}
        </p>
      )}
    </div>
  );
}
