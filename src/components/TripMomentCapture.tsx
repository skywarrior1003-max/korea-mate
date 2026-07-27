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
   * 로컬 저장 성공 여부를 반환한다.
   * 오프라인 우선 구조라 서버 동기화 실패는 "저장 실패"가 아니며,
   * 로컬 저장이 된 경우 true 를 돌려 모달을 닫는다.
   */
  onSave:      (moment: TripMoment) => Promise<boolean> | boolean;
  onClose:     () => void;
}

export default function TripMomentCapture({ itineraryId, deviceId, dayNumber, onSave, onClose }: Props) {
  const t = useTranslations("memo");
  const [photoData,    setPhotoData]    = useState<string | null>(null);
  const [memo,         setMemo]         = useState("");
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
    const file = e.target.files?.[0];
    if (!file) return;
    setCompressing(true);
    setErrorKey(null);
    try {
      const data = await compressPhoto(file);
      setPhotoData(data);
    } catch {
      // 무검증 원본을 올리지 않는다. 사진·모달을 유지해 재시도할 수 있게 한다.
      // 진단 로그에 파일명·내용 등 민감정보를 남기지 않는다.
      console.warn("[TripMomentCapture] photo compression failed");
      setErrorKey("compressFailed");
    } finally {
      setCompressing(false);
      // 파일 input 을 비워 같은 사진 재선택도 change 이벤트가 발생하게 한다
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, []);

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
  }, [saving, itineraryId, deviceId, photoData, memo, category, lat, lng, dayNumber, onSave]);

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
            capture="environment"
            className="hidden"
            onChange={handleFile}
          />
        </div>

        <div className="px-5 py-5 space-y-5">
          {/* GPS 상태 */}
          <div className="flex items-center gap-2.5">
            <span className="text-base">
              {gpsStatus === "ok" ? "📍" : gpsStatus === "loading" ? "🔄" : "❌"}
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
