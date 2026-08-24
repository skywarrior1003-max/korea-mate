"use client";

// gokoreamate — Trip Moment Capture Modal
// TASK-022: photo + GPS + memo + category 캡처

import { useState, useRef, useCallback, useEffect } from "react";
import { useTranslations } from "next-intl";
import type { TripMoment, MomentCategory } from "@/lib/trip-moments/types";
import { MOMENT_CATEGORIES } from "@/lib/trip-moments/types";
import { compressPhoto, formatCoord } from "@/lib/trip-moments/storage";

interface Props {
  itineraryId: string;
  deviceId:    string;
  dayNumber:   number | null;
  /**
   * 일정 장소에서 시작한 순간 (TASK-TRIP-MOMENT-STOP-BINDING-V1).
   * 장소명은 미리 채워 두고, 공식 장소의 `city_spot_id` 는 화면에 보이지 않는
   * 관계로 싣는다. 사용자가 문구·사진을 고쳐도 관계는 그대로다. 둘 다 없으면
   * 예전과 같은 자유 순간이다 — 자유 입력은 그대로 남는다.
   */
  initialPlaceName?: string | null;
  citySpotId?:       number | null;
  /** 일정 장소의 일반 열쇠(sourceKey 문법). 있으면 결합 순간이다 — 내 장소·행사도 여기로 묶인다. */
  stopKey?:          string | null;
  /**
   * 로컬 저장 성공 여부를 반환한다.
   * 오프라인 우선 구조라 서버 동기화 실패는 "저장 실패"가 아니며,
   * 로컬 저장이 된 경우 true 를 돌려 모달을 닫는다.
   */
  onSave:      (moment: TripMoment) => Promise<boolean> | boolean;
  onClose:     () => void;
}

export default function TripMomentCapture({ itineraryId, deviceId, dayNumber, initialPlaceName, citySpotId, stopKey, onSave, onClose }: Props) {
  const t = useTranslations("memo");
  const [photoData,    setPhotoData]    = useState<string | null>(null);
  /**
   * 두 번째 이후 사진들. 첫 장을 따로 두는 것은 서버 구조가 그렇기 때문이다 —
   * 첫 장은 `trip_moments.storage_path`, 나머지는 `trip_moment_photos` 다.
   */
  const [extraPhotos,  setExtraPhotos]  = useState<string[]>([]);
  /** 압축에 실패해 빠진 장 수. 조용히 사라지면 몇 장을 골랐는지와 어긋난다. */
  const [failedCount,  setFailedCount]  = useState(0);
  const [memo,         setMemo]         = useState("");
  /**
   * 장소 이름. 선택 사항이다 — 여행 중 사진을 남기는 흐름을 막지 않는다.
   * 좌표(`location_label`)와 다른 값이다. 비워 두면 저장하지 않는다.
   */
  const [placeName,    setPlaceName]    = useState(() => (initialPlaceName ?? "").trim());
  // 일정 장소 결합 여부. 결합돼 있으면 장소명은 그 stop 의 이름으로 고정이다 —
  // 보이는 이름과 city_spot_id 가 서로 다른 장소를 가리키는 상태를 만들지 않는다.
  const boundStopKey   = typeof stopKey === "string" && stopKey.trim() !== "" ? stopKey.trim() : null;
  const isBound        = typeof citySpotId === "number" || boundStopKey !== null;
  const boundPlaceName = (initialPlaceName ?? "").trim();
  const [category,     setCategory]     = useState<MomentCategory>("random");
  const [lat,          setLat]          = useState<number | null>(null);
  const [lng,          setLng]          = useState<number | null>(null);
  const [gpsStatus,    setGpsStatus]    = useState<"idle" | "loading" | "ok" | "denied">("idle");
  const [compressing,  setCompressing]  = useState(false);
  const [saving,       setSaving]       = useState(false);
  // 압축·저장 실패를 사용자에게 보여준다. 조용히 삼키면 실패가 성공처럼 보인다.
  const [errorKey,     setErrorKey]     = useState<"compressFailed" | "localSaveFailed" | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // GPS 자동 취득
  useEffect(() => {
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

  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
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
  }, []);

  /** setState 는 이 콜백 안에서 즉시 반영되지 않는다 — 첫 장 여부는 ref 로 본다 */
  const photoDataRef = useRef<string | null>(null);
  useEffect(() => { photoDataRef.current = photoData; }, [photoData]);

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
      // 성공 시 모달을 닫는 책임은 상위(onSave)에 있다
    } catch {
      setErrorKey("localSaveFailed");
    } finally {
      // 성공·실패 어느 쪽이든 loading 을 반드시 해제한다
      setSaving(false);
    }
  }, [saving, itineraryId, deviceId, photoData, extraPhotos, memo, placeName, category, lat, lng, dayNumber, onSave]);

  // 내부 enum(key)과 API 값은 영어 그대로 유지하고 표시명만 번역한다
  const catLabel = (k: MomentCategory) =>
    t(({ food: "catFood", scenery: "catScenery", people: "catPeople",
         culture: "catCulture", random: "catRandom" } as const)[k]);

  const catInfo = MOMENT_CATEGORIES.find(c => c.key === category)!;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-[#1a1a2e] text-white"
      style={{ animation: "slideUp 0.28s ease-out" }}
    >
      {/* 헤더 */}
      <div className="flex items-center justify-between px-5 pt-safe pt-6 pb-4 border-b border-white/10">
        <button onClick={onClose} className="text-white/60 hover:text-white text-sm font-bold px-3 py-1.5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer">
          {t("cancel")}
        </button>
        <h2 className="text-base font-black">📸 {t("captureTitle")}</h2>
        <button
          onClick={handleSave}
          disabled={saving}
          className="text-sm font-black px-4 py-1.5 rounded-xl transition-all disabled:opacity-40 cursor-pointer"
          style={{ backgroundColor: "#FF4A2D", color: "#ffffff" }}
        >
          {saving ? t("saving") : t("save")}
        </button>
      </div>

      {errorKey && (
        <div
          role="alert"
          className="mx-5 mt-4 rounded-xl px-4 py-3 text-sm font-semibold"
          style={{ backgroundColor: "rgba(255,74,45,0.14)", color: "#FFB4A5" }}
        >
          {t(errorKey)}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {/* 사진 영역 */}
        <div
          className="relative w-full bg-black/40 flex items-center justify-center cursor-pointer"
          style={{ minHeight: 260 }}
          onClick={() => fileInputRef.current?.click()}
        >
          {compressing ? (
            <div className="flex flex-col items-center gap-3">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#FF4A2D]" />
              <p className="text-xs text-white/50">{t("optimizing")}</p>
            </div>
          ) : photoData ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={photoData} alt={t("photoAlt")} className="w-full object-cover" style={{ maxHeight: 340 }} />
          ) : (
            <div className="flex flex-col items-center gap-3 py-14">
              <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center text-3xl">📷</div>
              <p className="text-sm font-bold text-white/60">{t("tapToAddPhoto")}</p>
              <p className="text-xs text-white/30">{t("choosePhotoSource")}</p>
            </div>
          )}
          {photoData && (
            <div className="absolute inset-0 flex items-end justify-end p-3">
              <span className="text-xs font-bold bg-black/60 text-white px-2.5 py-1 rounded-lg backdrop-blur-sm cursor-pointer">
                {t("changePhoto")}
              </span>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            /* capture 를 두면 브라우저가 카메라만 열고 multiple 을 무시한다.
               빼면 OS 선택창이 카메라와 사진첩을 함께 보여 준다 — 두 흐름을
               모두 살리면서 여러 장을 고를 수 있는 자리는 여기뿐이다. */
            multiple
            className="hidden"
            onChange={handleFile}
          />
        </div>

        {/* 고른 사진들. 여러 장이면 가로로 흐르게 둔다 — 격자로 쌓으면 메모가
            화면 밖으로 밀린다. 순서는 고른 순서 그대로다. */}
        {totalPhotos > 1 && (
          <div className="px-5 pt-3">
            <p className="text-xs font-bold text-white/60">{t("photoCount", { n: totalPhotos })}</p>
            <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
              {extraPhotos.map((src, i) => (
                <div key={`${i}-${src.slice(-16)}`} className="relative shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" className="w-16 h-16 object-cover rounded-xl" />
                  <button
                    type="button"
                    onClick={() => removeExtra(i)}
                    aria-label={t("removePhoto")}
                    className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-black/80 text-white text-xs font-black flex items-center justify-center"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        {failedCount > 0 && (
          <p role="alert" className="px-5 pt-2 text-xs text-[#FF4A2D]">
            {t("photoFailed", { n: failedCount })}
          </p>
        )}

        <div className="px-5 py-5 space-y-5">
          {/* GPS 상태 */}
          <div className="flex items-center gap-2.5">
            <span className="text-base">
              {gpsStatus === "ok" ? "✓" : gpsStatus === "loading" ? "…" : "✕"}
            </span>
            <div>
              <p className="text-xs font-bold text-white/80">
                {gpsStatus === "ok"
                  ? formatCoord(lat, lng)
                  : gpsStatus === "loading"
                  ? t("gpsLoading")
                  : t("gpsUnavailable")}
              </p>
              {gpsStatus === "ok" && (
                <p className="text-[10px] text-white/30 mt-0.5">{t("gpsTagged")}</p>
              )}
            </div>
          </div>

          {/* 카테고리 선택 */}
          <div>
            <p className="text-xs font-black text-white/50 uppercase tracking-widest mb-3">{t("categoryLabel")}</p>
            <div className="flex gap-2 flex-wrap">
              {MOMENT_CATEGORIES.map(cat => (
                <button
                  key={cat.key}
                  onClick={() => setCategory(cat.key)}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-black transition-all cursor-pointer ${
                    category === cat.key
                      ? "text-[#1a1a2e]"
                      : "text-white/50 bg-white/8 hover:bg-white/15"
                  }`}
                  style={category === cat.key ? { backgroundColor: "#FF4A2D" } : {}}
                >
                  <span>{cat.emoji}</span>
                  <span>{catLabel(cat.key)}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 메모 */}
          {isBound ? (
            /* 일정 장소에서 시작한 순간 — 장소는 이미 정해져 있다. 이름을 고치게 두면
               보이는 이름과 숨은 관계(city_spot_id)가 서로 다른 장소를 가리킬 수 있어
               읽기 전용으로 보여 준다. 장소를 바꾸고 싶으면 자유 순간으로 남기면 된다. */
            <div className="mb-4" data-bound-place="true">
              <p className="block text-xs font-bold text-white/50 mb-1.5">{t("fieldPlace")}</p>
              <p className="w-full bg-white/8 border border-white/10 rounded-2xl px-4 py-3.5 text-sm text-white">{boundPlaceName}</p>
              <p className="mt-1.5 text-[11px] text-white/30">{t("placeBound")}</p>
            </div>
          ) : (
          <div className="mb-4">
            <label className="block text-xs font-bold text-white/50 mb-1.5">
              {t("fieldPlace")} <span className="font-normal text-white/30">{t("placeOptional")}</span>
            </label>
            <input
              type="text"
              value={placeName}
              onChange={e => setPlaceName(e.target.value)}
              maxLength={200}
              placeholder={t("phPlace")}
              className="w-full bg-white/8 border border-white/15 rounded-2xl px-4 py-3.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-[#FF4A2D]/60"
            />
            <p className="mt-1.5 text-[11px] text-white/30">{t("placeHint")}</p>
          </div>
          )}
          <div>
            <p className="text-xs font-black text-white/50 uppercase tracking-widest mb-3">{t("memoLabel")}</p>
            <textarea
              value={memo}
              onChange={e => setMemo(e.target.value)}
              placeholder={t("memoPlaceholder")}
              maxLength={300}
              rows={4}
              className="w-full bg-white/8 border border-white/15 rounded-2xl px-4 py-3.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-[#FF4A2D]/60 resize-none leading-relaxed"
            />
            <p className="text-right text-[10px] text-white/25 mt-1">{memo.length}/300</p>
          </div>

          {/* 날짜/시간 */}
          <div className="flex items-center gap-2 text-xs text-white/30">
            <span>🕐</span>
            <span>{new Date().toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
            {dayNumber !== null && <span>· Day {dayNumber}</span>}
            <span>· {catInfo.emoji} {catLabel(catInfo.key)}</span>
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
