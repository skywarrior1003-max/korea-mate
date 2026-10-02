"use client";
import { signalJourney } from "@/lib/guided-journey/journey-core";

// gokoreamate — Trip Moment Capture Modal
// TASK-022: photo + GPS + memo + category 캡처
//
// 2026-09-30 My Trip 장소 기록 교정(승인 시안 "Memory — final · mobile 390" 기준):
//  · 밝은 시트. 장소 카드에서 열면 날짜·장소가 이미 정해져 있다 — 저장 전에 이 여행의 다른 장소로 바꾸거나
//    "장소 없이" 자유 기록으로 돌릴 수 있다(시간·순서로 임의 연결하지 않는다).
//  · 사진을 고르기 전에는 작은 "사진 추가" 자리만, 고른 뒤에는 사진이 중심이 된다.
//  · 필수 행동은 사진·짧은 메모·저장. 제목은 선택.
//  · 위치는 자동으로 묻지 않는다 — 사용자가 "현재 위치 함께 저장"을 눌렀을 때만 요청한다.
//  · 카테고리 선택 화면은 두지 않는다(저장값은 기존 기본값 random 그대로).

import { useState, useRef, useCallback, useEffect } from "react";
import { useTranslations } from "next-intl";
import type { TripMoment, MomentCategory } from "@/lib/trip-moments/types";
import { compressPhoto, formatCoord } from "@/lib/trip-moments/storage";
import { ITINERARY_PHOTO_LIMIT } from "@/lib/photo-validate";
import { apiWritingMeta } from "@/lib/mytrip-writing/api";

interface Props {
  itineraryId: string;
  deviceId:    string;
  dayNumber:   number | null;
  /** AI 글쓰기 맥락용 도시명(여행의 city). 표시/저장에는 쓰지 않는다 */
  city?:       string | null;
  /** AI 글쓰기 맥락용 여행 제목 — 메모의 어조 재료(저장에는 쓰지 않는다) */
  tripTitle?:  string | null;
  /**
   * 일정 장소에서 시작한 순간 (TASK-TRIP-MOMENT-STOP-BINDING-V1).
   * 장소명은 미리 채워 두고, 공식 장소의 `city_spot_id` 는 화면에 보이지 않는
   * 관계로 싣는다. 사용자가 문구·사진을 고쳐도 관계는 그대로다. 둘 다 없으면
   * 예전과 같은 자유 순간이다 — 자유 입력은 그대로 남는다.
   */
  initialPlaceName?: string | null;
  /**
   * AI writing 컨텍스트 전용 requested-locale canonical 장소명
   * (LOCALE-FACT-GROUNDING-V1 §3). 결합 순간에서만 의미가 있다 — 저장되는
   * placeName/표시 prefill 은 기존 그대로이고, provider 로 가는 이름만 이 값이다.
   * 자유 순간(사용자 입력 이름)은 사용자가 쓴 이름을 proper noun 그대로 보낸다(§4).
   */
  aiPlaceName?:      string | null;
  citySpotId?:       number | null;
  /** 일정 장소의 일반 열쇠(sourceKey 문법). 있으면 결합 순간이다 — 내 장소·행사도 여기로 묶인다. */
  stopKey?:          string | null;
  /** 저장 전에 고를 수 있는 이 여행의 일정 장소(열쇠가 있는 것만) */
  placeOptions?:     { stopKey: string; name: string; dayNumber: number; citySpotId: number | null }[];
  /**
   * 로컬 저장 성공 여부를 반환한다.
   * 오프라인 우선 구조라 서버 동기화 실패는 "저장 실패"가 아니며,
   * 로컬 저장이 된 경우 true 를 돌려 모달을 닫는다.
   */
  onSave:      (moment: TripMoment) => Promise<boolean> | boolean;
  onClose:     () => void;
  /**
   * 이 여행에 이미 있는 사진 수(다른 기록 포함 · 서버에 올라간 것과 이 기기에서 올릴 것) — 2026-10-02.
   * 서버의 여행당 사진 한도(ITINERARY_PHOTO_LIMIT)를 고르기 전에 알리려고 쓴다. 없으면 0.
   */
  tripPhotoCount?: number;
}

export default function TripMomentCapture({ itineraryId, deviceId, dayNumber: initialDay, initialPlaceName, citySpotId: initialCitySpotId, stopKey, placeOptions = [], onSave, onClose, tripPhotoCount = 0 }: Props) {
  const t = useTranslations("memo");
  // 기록 시각 미리보기도 UI locale 을 따른다 (Timeline 과 같은 결함 수정).
  // → 2026-09-30 교정: 입력 화면의 시각 미리보기 줄은 뺐다(필수 행동만). 저장 시각(captured_at)은 그대로 기록한다.
  const [photoData,    setPhotoData]    = useState<string | null>(null);
  /**
   * 두 번째 이후 사진들. 첫 장을 따로 두는 것은 서버 구조가 그렇기 때문이다 —
   * 첫 장은 `trip_moments.storage_path`, 나머지는 `trip_moment_photos` 다.
   */
  const [extraPhotos,  setExtraPhotos]  = useState<string[]>([]);
  /** 압축에 실패해 빠진 장 수. 조용히 사라지면 몇 장을 골랐는지와 어긋난다. */
  const [failedCount,  setFailedCount]  = useState(0);
  const [memo,         setMemo]         = useState("");
  /** 순간 제목 — AI 3안에서 고르거나 직접 쓴다. 저장 시 memo 와 함께 SSOT 가 된다. */
  const [title,        setTitle]        = useState("");
  /**
   * 장소 이름. 선택 사항이다 — 여행 중 사진을 남기는 흐름을 막지 않는다.
   * 좌표(`location_label`)와 다른 값이다. 비워 두면 저장하지 않는다.
   */
  const [placeName,    setPlaceName]    = useState(() => (initialPlaceName ?? "").trim());
  // 일정 장소 결합 여부. 결합돼 있으면 장소명은 그 stop 의 이름으로 고정이다 —
  // 보이는 이름과 city_spot_id 가 서로 다른 장소를 가리키는 상태를 만들지 않는다.
  // 저장 전에 장소를 바꿀 수 있다 — 고른 일정 장소(열쇠·이름·날짜·공식 id)가 한 묶음으로 바뀐다
  const [bound, setBound] = useState<{ stopKey: string | null; name: string; dayNumber: number | null; citySpotId: number | null } | null>(() => {
    const sk = typeof stopKey === "string" && stopKey.trim() !== "" ? stopKey.trim() : null;
    if (!sk && typeof initialCitySpotId !== "number") return null;
    return { stopKey: sk, name: (initialPlaceName ?? "").trim(), dayNumber: initialDay, citySpotId: typeof initialCitySpotId === "number" ? initialCitySpotId : null };
  });
  const [picking, setPicking] = useState(false);
  const boundStopKey   = bound?.stopKey ?? null;
  const isBound        = bound !== null;
  const boundPlaceName = bound?.name ?? "";
  const citySpotId     = bound?.citySpotId ?? null;
  const dayNumber      = bound ? bound.dayNumber : initialDay;
  // 카테고리 선택 화면은 두지 않는다 — 저장값은 기존 기본값 그대로
  const [category] = useState<MomentCategory>("random");
  const [lat,          setLat]          = useState<number | null>(null);
  const [lng,          setLng]          = useState<number | null>(null);
  const [gpsStatus,    setGpsStatus]    = useState<"idle" | "loading" | "ok" | "denied">("idle");
  const [compressing,  setCompressing]  = useState(false);
  const [saving,       setSaving]       = useState(false);
  // 압축·저장 실패를 사용자에게 보여준다. 조용히 삼키면 실패가 성공처럼 보인다.
  const [errorKey,     setErrorKey]     = useState<"compressFailed" | "localSaveFailed" | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 위치는 자동으로 묻지 않는다 — 사용자가 "현재 위치 함께 저장"을 눌렀을 때만 요청한다.
  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) { setGpsStatus("denied"); return; }
    setGpsStatus("loading");
    navigator.geolocation.getCurrentPosition(
      pos => {
        setLat(pos.coords.latitude);
        setLng(pos.coords.longitude);
        setGpsStatus("ok");
      },
      () => setGpsStatus("denied"),
      { timeout: 8_000, maximumAge: 60_000, enableHighAccuracy: false },
    );
  }, []);

  // ESC + back gesture
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    window.history.pushState({ km_capture: true }, "");
    const pop = () => onClose();
    window.addEventListener("popstate", pop);
    return () => {
      window.removeEventListener("keydown", handler);
      window.removeEventListener("popstate", pop);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  /** 이 기록에 지금 고른 사진 수 */
  const pickedCount = (photoData ? 1 : 0) + extraPhotos.length;
  /** 여행 사진 한도 때문에 넣지 못한 장수(마지막 선택 기준) */
  const [overLimit, setOverLimit] = useState(0);

  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    if (picked.length === 0) return;
    // 여행당 사진 한도(서버와 같은 값) — 넘는 사진은 고르는 순간 넣지 않고 몇 장인지 알린다(저장 뒤 조용히 실패하지 않게)
    const room = Math.max(0, ITINERARY_PHOTO_LIMIT - tripPhotoCount - pickedCount);
    const files = picked.slice(0, room);
    setOverLimit(picked.length - files.length);
    if (files.length === 0) { if (fileInputRef.current) fileInputRef.current.value = ""; return; }
    setCompressing(true);
    setErrorKey(null);
    setFailedCount(0);

    // 한 장씩 처리한다. 한 장이 실패해도 나머지는 살린다 — 여러 장을 고른 사람이
    // 한 장 때문에 전부 다시 고르게 하지 않는다.
    const done: string[] = [];
    let failed = 0;
    for (const file of files) {
      try {
        done.push(await compressPhoto(file));
      } catch {
        // 무검증 원본을 올리지 않는다. 진단 로그에 파일명·내용을 남기지 않는다.
        console.warn("[TripMomentCapture] photo compression failed");
        failed++;
      }
    }

    if (done.length > 0) {
      setPhotoData(prev => prev ?? done[0]!);
      setExtraPhotos(prev => [...prev, ...(photoDataRef.current ? done : done.slice(1))]);
    }
    if (failed > 0) {
      setFailedCount(failed);
      if (done.length === 0) setErrorKey("compressFailed");
    }
    setCompressing(false);
    // 파일 input 을 비워 같은 사진 재선택도 change 이벤트가 발생하게 한다
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [tripPhotoCount, pickedCount]);

  /** setState 는 이 콜백 안에서 즉시 반영되지 않는다 — 첫 장 여부는 ref 로 본다 */
  const photoDataRef = useRef<string | null>(null);
  useEffect(() => { photoDataRef.current = photoData; }, [photoData]);
  // 마지막으로 고른 AI 후보 — 저장 메타(§E: 수정 여부·글자 수 변화)에만 쓴다
  const aiPickRef = useRef<{ title: string; memo: string; generationId: string | null } | null>(null);

  const totalPhotos = (photoData ? 1 : 0) + extraPhotos.length;

  function removeExtra(idx: number) {
    setExtraPhotos(prev => prev.filter((_, i) => i !== idx));
  }

  const handleSave = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    const moment: TripMoment = {
      moment_id:      crypto.randomUUID(),
      itinerary_id:   itineraryId,
      device_id:      deviceId,
      photo_data:     photoData,
      memo:           memo.trim(),
      ...(title.trim() ? { title: title.trim() } : {}),
      category,
      lat,
      lng,
      location_label: formatCoord(lat, lng),
      captured_at:    new Date().toISOString(),
      day_number:     dayNumber,
      synced:         false,
      // 결합된 순간은 stop 의 이름을 그대로 쓴다 — 입력값이 관계를 덮지 못한다
      ...((isBound ? boundPlaceName : placeName.trim()) ? { place_name: isBound ? boundPlaceName : placeName.trim() } : {}),
      // 일정 장소와의 안정 관계 — 사진 수와 무관하게 Moment 당 하나
      ...(typeof citySpotId === "number" ? { city_spot_id: citySpotId } : {}),
      ...(boundStopKey ? { stop_key: boundStopKey } : {}),
      ...(extraPhotos.length > 0 ? { photo_data_extra: extraPhotos } : {}),
    };
    setErrorKey(null);
    try {
      const ok = await onSave(moment);
      // 로컬 저장 자체가 실패했을 때만 오류다. 서버 동기화 대기는 오류가 아니다.
      if (!ok) setErrorKey("localSaveFailed");
      // AI 후보를 골라 저장했다면 저장 메타(§E — 원문 없이 수정 여부·글자 수 변화만)
      const pick = aiPickRef.current;
      if (ok && pick?.generationId) {
        apiWritingMeta({
          itineraryId, deviceId, generationId: pick.generationId, event: "save",
          edited: title.trim() !== pick.title || memo.trim() !== pick.memo,
          titleLenDelta: title.trim().length - pick.title.length,
          memoLenDelta: memo.trim().length - pick.memo.length,
        });
      }
      // GUIDED-JOURNEY-V1 — 기록 저장 성공을 안내에 알린다(사진 없이 메모만 저장해도 같은 행동이다).
      // 안내가 꺼져 있으면 아무도 듣지 않는다 — 부작용 없음.
      if (ok) signalJourney("moment-saved");
      // 성공 시 모달을 닫는 책임은 상위(onSave)에 있다
    } catch {
      setErrorKey("localSaveFailed");
    } finally {
      // 성공·실패 어느 쪽이든 loading 을 반드시 해제한다
      setSaving(false);
    }
  }, [saving, itineraryId, deviceId, photoData, extraPhotos, memo, title, placeName, category, lat, lng, dayNumber, onSave, isBound, boundPlaceName, citySpotId, boundStopKey]);

  const INK = "#191C21", SUB = "#565D66", FAINT = "#8A919B", LINE = "#E5E7EA", DIM = "#F6F7F8", CORAL = "#FF4A2D";

  return (
    <div
      data-journey-quiet=""
      data-capture-sheet=""
      className="fixed inset-0 z-50 flex flex-col"
      style={{ backgroundColor: "rgba(16,18,22,.45)", animation: "slideUp 0.28s ease-out" }}
    >
      <div className="mt-auto sm:m-auto w-full sm:max-w-lg max-h-[100dvh] flex flex-col rounded-t-3xl sm:rounded-3xl" style={{ backgroundColor: "#FFFFFF", color: INK }}>
      {/* 헤더 — 취소 · 제목 · 저장 */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3" style={{ borderBottom: `1px solid ${LINE}` }}>
        <button onClick={onClose} className="gkm-focus min-h-11 px-3 rounded-xl text-sm font-bold" style={{ color: SUB }}>
          {t("cancel")}
        </button>
        <h2 className="text-[15px] font-black">{t("addStopRecord")}</h2>
        <button
          onClick={handleSave}
          disabled={saving}
          data-capture-save=""
          className="gkm-focus min-h-11 text-sm font-black px-4 rounded-xl transition-all disabled:opacity-40"
          style={{ backgroundColor: CORAL, color: "#ffffff", boxShadow: "0 2px 8px rgba(255,74,45,.3)" }}
        >
          {saving ? t("saving") : t("save")}
        </button>
      </div>

      {errorKey && (
        <div role="alert" className="mx-4 mt-3 rounded-xl px-4 py-3 text-sm font-semibold" style={{ backgroundColor: "#FDF1EF", color: "#D23B2E" }}>
          {t(errorKey)}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 pb-6">
        {/* 장소 — 카드에서 열면 이미 정해져 있다. 저장 전에 바꾸거나 장소 없이 남길 수 있다 */}
        <div className="mt-3 rounded-2xl px-4 py-3" style={{ backgroundColor: DIM }} data-capture-place={isBound ? boundStopKey ?? "" : "free"}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[12px] font-semibold" style={{ color: FAINT }}>{t("fieldPlace")}</p>
              <p className="text-[15px] font-bold truncate">
                {isBound ? boundPlaceName : t("noPlaceOption")}
                {isBound && dayNumber !== null && <span className="ml-1.5 text-[12px] font-semibold" style={{ color: FAINT }}>· {t("dayN", { n: dayNumber })}</span>}
              </p>
            </div>
            {placeOptions.length > 0 && (
              <button type="button" onClick={() => setPicking(v => !v)} data-capture-change-place=""
                className="gkm-focus shrink-0 min-h-11 px-3 rounded-xl text-[13px] font-bold" style={{ color: INK, border: `1px solid ${LINE}`, backgroundColor: "#fff" }}>
                {t("changePlace")}
              </button>
            )}
          </div>
          {picking && (
            <ul className="mt-2 max-h-56 overflow-y-auto rounded-xl" style={{ border: `1px solid ${LINE}`, backgroundColor: "#fff" }} role="listbox" aria-label={t("changePlace")}>
              {placeOptions.map(o => (
                <li key={o.stopKey}>
                  <button type="button" role="option" aria-selected={boundStopKey === o.stopKey}
                    onClick={() => { setBound({ stopKey: o.stopKey, name: o.name, dayNumber: o.dayNumber, citySpotId: o.citySpotId }); setPicking(false); }}
                    className="gkm-focus w-full min-h-11 text-left px-3 text-[14px]" style={{ color: INK, fontWeight: boundStopKey === o.stopKey ? 800 : 500 }}>
                    {t("dayN", { n: o.dayNumber })} · {o.name}
                  </button>
                </li>
              ))}
              <li>
                <button type="button" role="option" aria-selected={!isBound} onClick={() => { setBound(null); setPicking(false); }}
                  className="gkm-focus w-full min-h-11 text-left px-3 text-[14px]" style={{ color: SUB }}>
                  {t("noPlaceOption")}
                </button>
              </li>
            </ul>
          )}
          {!isBound && (
            <input
              type="text" value={placeName} onChange={e => setPlaceName(e.target.value)} maxLength={200}
              placeholder={t("phPlace")} aria-label={t("fieldPlace")}
              className="gkm-focus mt-2 w-full rounded-xl px-3 py-2.5 text-[14px]" style={{ border: `1px solid ${LINE}`, backgroundColor: "#fff", color: INK }}
            />
          )}
        </div>

        {/* 사진 — 고르기 전에는 작은 자리, 고른 뒤에는 사진이 중심 */}
        <input ref={fileInputRef} type="file" accept="image/*"
          /* capture 를 두면 브라우저가 카메라만 열고 multiple 을 무시한다.
             빼면 OS 선택창이 카메라와 사진첩을 함께 보여 준다. */
          multiple className="hidden" onChange={handleFile} />
        {compressing ? (
          <div className="mt-3 flex items-center justify-center gap-3 rounded-2xl py-8" style={{ backgroundColor: DIM }}>
            <div className="animate-spin rounded-full h-6 w-6 border-b-2" style={{ borderColor: CORAL }} />
            <p className="text-[14px]" style={{ color: SUB }}>{t("optimizing")}</p>
          </div>
        ) : photoData ? (
          <div className="mt-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoData} alt={t("photoAlt")} className="w-full rounded-2xl object-cover" style={{ maxHeight: "46vh" }} data-capture-photo="" />
            <div className="mt-2 flex items-center justify-between">
              <span className="text-[12px]" style={{ color: FAINT }} data-capture-photo-count="">
                {t("recordPhotoCount", { n: totalPhotos })} · {t("tripPhotoCount", { n: tripPhotoCount + totalPhotos, max: ITINERARY_PHOTO_LIMIT })}
              </span>
              <button type="button" onClick={() => fileInputRef.current?.click()} className="gkm-focus min-h-11 px-3 rounded-xl text-[13px] font-bold" style={{ color: INK, border: `1px solid ${LINE}` }}>
                {t("changePhoto")}
              </button>
            </div>
            {extraPhotos.length > 0 && (
              <div className="mt-1 flex gap-2 overflow-x-auto pb-1">
                {extraPhotos.map((src, i) => (
                  <div key={`${i}-${src.slice(-16)}`} className="relative shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt="" className="w-14 h-14 object-cover rounded-xl" />
                    <button type="button" onClick={() => removeExtra(i)} aria-label={t("removePhoto")}
                      className="absolute -top-1 -right-1 w-6 h-6 rounded-full text-white text-xs font-black flex items-center justify-center" style={{ backgroundColor: INK }}>×</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <button type="button" onClick={() => fileInputRef.current?.click()} data-capture-add-photo=""
            className="gkm-focus mt-3 w-full min-h-[88px] rounded-2xl flex flex-col items-center justify-center gap-1"
            style={{ border: `1.5px dashed ${LINE}`, color: INK }}>
            <span className="text-[15px] font-bold">+ {t("addPhotoCta")}</span>
            <span className="text-[12px]" style={{ color: FAINT }}>{t("photoOptional")}</span>
          </button>
        )}
        {failedCount > 0 && (
          <p role="alert" className="pt-2 text-[12px]" style={{ color: "#D23B2E" }}>{t("photoFailed", { n: failedCount })}</p>
        )}
        {overLimit > 0 && (
          <p role="alert" className="pt-2 text-[12px]" style={{ color: "#D23B2E" }} data-capture-over-limit="">{t("tripPhotoLimitSkipped", { n: overLimit, max: ITINERARY_PHOTO_LIMIT })}</p>
        )}

        {/* 짧은 메모(주) · 제목(선택) */}
        <label className="block mt-4 text-[12px] font-semibold" htmlFor="moment-memo" style={{ color: FAINT }}>{t("memoLabel")}</label>
        <textarea
          id="moment-memo" value={memo} onChange={e => setMemo(e.target.value)} placeholder={t("memoPlaceholder")}
          maxLength={300} rows={3}
          className="gkm-focus mt-1 w-full rounded-xl px-3.5 py-3 text-[14px] leading-relaxed resize-none" style={{ border: `1px solid ${LINE}`, backgroundColor: "#fff", color: INK }}
        />
        <input
          id="moment-title" type="text" value={title} onChange={e => setTitle(e.target.value)} maxLength={60}
          placeholder={t("titlePlaceholder")} aria-label={t("titleLabel")}
          className="gkm-focus mt-2 w-full rounded-xl px-3.5 py-2.5 text-[14px] font-semibold" style={{ border: `1px solid ${LINE}`, backgroundColor: "#fff", color: INK }}
        />

        {/* 위치 — 원할 때만. 묻기 전에는 오류를 보여 주지 않는다 */}
        <div className="mt-3 flex items-center gap-2 text-[12px]" style={{ color: FAINT }}>
          {gpsStatus === "idle" && (
            <button type="button" onClick={requestLocation} data-capture-location="" className="gkm-focus min-h-11 px-1 font-semibold underline underline-offset-2" style={{ color: SUB }}>
              {t("addLocation")}
            </button>
          )}
          {gpsStatus === "loading" && <span>{t("gpsLoading")}</span>}
          {gpsStatus === "ok" && <span>✓ {t("locationAdded")}</span>}
          {gpsStatus === "denied" && <span>{t("locationFailed")}</span>}
        </div>
      </div>
      </div>

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(30px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
