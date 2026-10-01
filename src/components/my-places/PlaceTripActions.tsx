"use client";

// 내 장소에서 바로 My Trip — [이 장소로 오늘 My Trip 시작] · [현재 여행에 추가].
//
// 누르기 전에는 아무 여행도 만들지 않는다. 시작은 오늘 날짜·지금 시각(또는 사용자가
// 쓰기로 한 사진 촬영 시각)을 고칠 수 있는 기본값으로 보여 주고, [시작] 을 눌러야
// 만든다. AI 를 부르지 않는다. 장소의 사진·메모는 서버가 여행 기록(비공개)으로 옮겨
// 담는다 — 순간 기록을 따로 적지 않아도 My Trip 카드와 Story 에 나온다.
//
// 결과를 숨기지 않는다: 사진 일부만 옮겨졌거나 기록이 실패하면 자동으로 넘어가지
// 않고 그 사실과 [여행 열기] 를 보여 준다.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { nowKst, type SpotForTrip } from "@/lib/user-spots/start-trip";
import { addSpotToTrip, startTripFromSpot, type TripChoice, type MomentCopyResult } from "@/lib/user-spots/start-trip-client";

interface Props {
  spot:        SpotForTrip;
  displayName: string;
  /** 내 여행 목록. null = 아직 모름(버튼은 보이되 누를 때 다시 묻는다). */
  trips:       TripChoice[] | null;
  /** 폼에서 쓰기로 한 사진 촬영 시각 — 시작 기본값이 된다. */
  photoTime?:  { date: string; time: string } | null;
  onTripsChanged?: () => void;
}

const BTN = "gkm-focus inline-flex items-center justify-center min-h-11 px-3 rounded-xl text-xs font-black cursor-pointer disabled:opacity-60";

export default function PlaceTripActions({ spot, displayName, trips, photoTime = null, onTripsChanged }: Props) {
  const t = useTranslations("picks");
  const router = useRouter();
  const [mode, setMode] = useState<null | "start" | "add">(null);
  const [busy, setBusy] = useState(false);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [pick, setPick] = useState<string | null>(null);
  const [result, setResult] = useState<null | { kind: "partial" | "duplicate" | "failed" | "momentFailed"; tripId?: string; day?: number; m?: MomentCopyResult }>(null);

  const hasTrips = (trips?.length ?? 0) > 0;
  const noLocation = !(typeof spot.lat === "number" && typeof spot.lng === "number");

  function openStart() {
    const n = nowKst();
    setDate(photoTime?.date ?? n.date);
    setTime(photoTime?.time ?? n.time);
    setResult(null);
    setMode("start");
  }
  function openAdd() {
    setPick(trips && trips.length === 1 ? trips[0].id : null);
    setResult(null);
    setMode("add");
  }

  function finish(tripId: string, m: MomentCopyResult) {
    onTripsChanged?.();
    if (!m.ok) { setResult({ kind: "momentFailed", tripId, m }); return; }
    if (m.photosFailed > 0) { setResult({ kind: "partial", tripId, m }); return; }
    router.push(`/itinerary?id=${encodeURIComponent(tripId)}`);
  }

  async function doStart() {
    if (busy || !date) return;
    setBusy(true);
    try {
      const r = await startTripFromSpot({ spot, displayName, date, time: time || null });
      if (!r.ok) { setResult({ kind: "failed" }); return; }
      finish(r.itineraryId, r.moment);
    } finally { setBusy(false); }
  }

  async function doAdd() {
    if (busy || !pick) return;
    setBusy(true);
    try {
      const n = nowKst();
      const r = await addSpotToTrip(pick, spot, displayName, n.date, photoTime?.date === n.date ? photoTime.time : n.time);
      if (!r.ok) {
        if (r.reason === "duplicate") setResult({ kind: "duplicate", tripId: r.itineraryId, day: r.dayNumber });
        else setResult({ kind: "failed" });
        return;
      }
      finish(r.itineraryId, r.moment);
    } finally { setBusy(false); }
  }

  return (
    <div className="mt-2 space-y-2" data-testid="place-trip-actions">
      <div className="flex gap-2 flex-wrap">
        <button type="button" onClick={openStart} disabled={busy}
          className={`${BTN} text-white`} style={{ backgroundColor: "#FF4A2D" }} data-testid="start-trip">
          {t("startTripToday")}
        </button>
        {hasTrips && (
          <button type="button" onClick={openAdd} disabled={busy}
            className={`${BTN} border border-[#E5E7EA] text-[#191C21] bg-white`} data-testid="add-to-trip">
            {t("addToCurrentTrip")}
          </button>
        )}
      </div>

      {mode === "start" && (
        <div className="rounded-xl border border-[#E5E7EA] bg-white p-3 space-y-2" data-testid="start-trip-panel">
          <p className="text-xs text-[#565D66]">{t("startTripHint")}</p>
          <div className="flex gap-2 flex-wrap items-center text-xs">
            <label className="font-bold text-[#565D66]">{t("startTripDate")}
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                className="ml-1 px-2 py-1 rounded-lg border border-[#E5E7EA]" />
            </label>
            <label className="font-bold text-[#565D66]">{t("startTripTime")}
              <input type="time" value={time} onChange={e => setTime(e.target.value)}
                className="ml-1 px-2 py-1 rounded-lg border border-[#E5E7EA]" />
            </label>
          </div>
          {photoTime && <p className="text-[11px] text-[#565D66]/80">{t("startTripPhotoTime")}</p>}
          {noLocation && <p className="text-[11px] font-bold text-[#8A5A00]">{t("startTripNoLocation")}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={() => void doStart()} disabled={busy || !date}
              className={`${BTN} text-white`} style={{ backgroundColor: "#191C21" }} data-testid="start-trip-confirm">
              {busy ? t("saving") : t("startTripConfirm")}
            </button>
            <button type="button" onClick={() => setMode(null)} className={`${BTN} text-[#565D66]`}>{t("cancel")}</button>
          </div>
        </div>
      )}

      {mode === "add" && trips && (
        <div className="rounded-xl border border-[#E5E7EA] bg-white p-3 space-y-2" data-testid="add-trip-panel">
          <p className="text-xs text-[#565D66]">{t("addTripHint")}</p>
          {trips.length > 1 && (
            <ul className="max-h-48 overflow-y-auto space-y-1">
              {trips.map(tr => (
                <li key={tr.id}>
                  <label className="flex items-center gap-2 text-xs text-[#191C21] min-h-9 cursor-pointer">
                    <input type="radio" name={`trip-${spot.id}`} checked={pick === tr.id} onChange={() => setPick(tr.id)} />
                    <span className="font-bold truncate">{tr.title || t("tripUntitled")}</span>
                    <span className="text-[#565D66] shrink-0">{tr.start}{tr.end && tr.end !== tr.start ? ` ~ ${tr.end}` : ""}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          {trips.length === 1 && (
            <p className="text-xs font-bold text-[#191C21]">{trips[0].title || t("tripUntitled")} <span className="font-normal text-[#565D66]">{trips[0].start}</span></p>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={() => void doAdd()} disabled={busy || !pick}
              className={`${BTN} text-white`} style={{ backgroundColor: "#191C21" }} data-testid="add-trip-confirm">
              {busy ? t("saving") : t("addTripConfirm")}
            </button>
            <button type="button" onClick={() => setMode(null)} className={`${BTN} text-[#565D66]`}>{t("cancel")}</button>
          </div>
        </div>
      )}

      {result && (
        <div role="status" className="rounded-xl bg-[#FFF7E6] border border-[#F2D9A6] p-3 text-xs text-[#5A3E00] space-y-2" data-testid="trip-result" data-kind={result.kind}>
          <p>
            {result.kind === "duplicate" ? t("tripDuplicate", { day: result.day ?? 1 })
              : result.kind === "partial" ? t("tripPhotosPartial", { ok: result.m?.photosCopied ?? 0, failed: result.m?.photosFailed ?? 0 })
              : result.kind === "momentFailed" ? t("tripMomentFailed")
              : t("tripSaveFailed")}
          </p>
          {result.tripId && (
            <button type="button" className={`${BTN} border border-[#E5E7EA] bg-white text-[#191C21]`}
              onClick={() => router.push(`/itinerary?id=${encodeURIComponent(result.tripId as string)}`)}>
              {t("openTrip")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
