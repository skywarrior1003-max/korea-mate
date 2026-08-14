"use client";

// "이 숙소가 여기 맞나요" — 사용자가 지도에서 직접 짚는 화면.
//
// 검색창이 아니다. 숙소 이름을 넣으면 찾아 주는 기능이 아니고, 그렇게 보이게
// 만들지도 않는다. 사용자는 자기가 아는 주소·링크를 옆에 두고 지도를 움직여
// 자기 숙소를 짚는다. 우리가 모르는 것을 아는 척하지 않는 대신, 사용자가 아는
// 것을 그대로 받는다.
//
// SDK 는 이미 layout 이 전 페이지에 실어 두었다. 새 지도 라이브러리를 들이지
// 않는다.
//
// 짚는 것과 확정하는 것은 다르다. 지도를 눌러 표시가 움직이는 동안에도 저장된
// 값은 그대로다. `Confirm` 을 눌러야 바뀐다 — 잘못 눌렀다고 이미 확인해 둔
// 위치를 잃지 않는다.

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { isValidCoordinate } from "@/lib/geo";
import type { StayMapCenter } from "@/lib/trip-stay/stay-input-core";

export interface StayLocationPickerProps {
  /** 지도를 어디서 열까. 없으면 이 화면을 띄우지 않는다. */
  center:      StayMapCenter;
  /** 이미 확인해 둔 위치. 있으면 그 자리에 표시를 놓고 시작한다. */
  confirmed:   { lat: number; lng: number } | null;
  /** 숙소 이름 — 무엇을 짚는 중인지 알려 주기 위해서만 쓴다. */
  placeName?:  string;
  onConfirm:   (lat: number, lng: number) => void;
  onCancel:    () => void;
}

export default function StayLocationPicker({
  center, confirmed, placeName, onConfirm, onCancel,
}: StayLocationPickerProps) {
  const t = useTranslations("stay");
  const boxRef    = useRef<HTMLDivElement>(null);
  // SDK 가 이미 선언해 둔 모양을 그대로 쓴다 — 여기서 다시 정의하면 두 선언이
  // 어긋나는 순간 타입은 통과하는데 실제로는 없는 메서드를 부르게 된다.
  type NaverMarker = InstanceType<NonNullable<Window["naver"]>["maps"]["Marker"]>;
  const markerRef = useRef<NaverMarker | null>(null);

  /** 아직 확정하지 않은 선택. 저장된 값과 따로 둔다. */
  const [picked, setPicked] = useState<{ lat: number; lng: number } | null>(confirmed);
  const [ready,  setReady]  = useState(false);

  // 뒤 화면이 같이 스크롤되면 지도를 끌 때마다 목록이 따라 움직인다.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onCancel]);

  useEffect(() => {
    const el = boxRef.current;
    const naver = typeof window !== "undefined" ? window.naver : undefined;
    // SDK 가 아직 안 왔을 수 있다. 그때는 지도 없이도 닫을 수 있어야 한다.
    if (!el || !naver?.maps) return;

    const { maps } = naver;
    const map = new maps.Map(el, {
      center: new maps.LatLng(center.lat, center.lng),
      zoom:   confirmed ? 17 : 14,
      // 위치를 짚는 화면이다. 지도 종류나 거리재기 도구는 방해만 된다.
      mapDataControl: false,
      scaleControl:   false,
      logoControlOptions: { position: 3 },
    });

    const place = (lat: number, lng: number) => {
      const at = new maps.LatLng(lat, lng);
      if (markerRef.current?.setPosition) markerRef.current.setPosition(at);
      else {
        markerRef.current?.setMap(null);
        markerRef.current = new maps.Marker({ position: at, map });
      }
    };
    if (confirmed) place(confirmed.lat, confirmed.lng);

    const listener = maps.Event.addListener(map, "click", (e) => {
      const lat = e.coord?.lat(), lng = e.coord?.lng();
      if (!isValidCoordinate(lat, lng)) return;
      place(lat!, lng!);
      setPicked({ lat: lat!, lng: lng! });
    });
    setReady(true);

    return () => {
      maps.Event.removeListener(listener);
      markerRef.current?.setMap(null);
      markerRef.current = null;
    };
  }, [center.lat, center.lng, confirmed]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
      role="dialog" aria-modal="true" aria-label={t("pickerTitle")}
    >
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[92vh]">
        <div className="px-5 pt-5 pb-3 flex flex-col gap-1">
          <p className="text-sm font-black text-gray-900">{t("pickerTitle")}</p>
          <p className="text-[11px] text-gray-500">
            {placeName?.trim() ? placeName.trim() : t("pickerHint")}
          </p>
        </div>

        {/* 지도는 화면이 좁아도 짚을 수 있을 만큼 남긴다. */}
        <div ref={boxRef} className="mx-5 h-[46vh] min-h-[240px] rounded-xl bg-gray-100 overflow-hidden" />

        <p className="px-5 pt-2 text-[11px] text-gray-500" aria-live="polite">
          {picked ? t("pickerPicked") : ready ? t("pickerTapToPick") : t("pickerLoading")}
        </p>

        <div className="p-5 flex gap-2">
          <button
            type="button" onClick={onCancel}
            className="flex-1 py-3 rounded-xl text-sm font-bold border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            {t("pickerCancel")}
          </button>
          <button
            type="button"
            onClick={() => { if (picked) onConfirm(picked.lat, picked.lng); }}
            disabled={!picked}
            className="flex-[1.4] py-3 rounded-xl text-sm font-black text-white transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ backgroundColor: "#FF4A2D" }}
          >
            {t("pickerConfirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
