"use client";

// "이 장소가 여기 맞나요" — My Place 를 만들기 전에 위치를 확정하는 화면.
//
// 작은 폼 안의 지도가 아니다. 화면 전체가 지도다. 사용자는 자기가 아는 골목을
// 눈으로 찾아야 하는데, 손바닥만 한 사각형 안에서는 그게 안 된다.
//
// 핀은 움직이지 않는다. 화면 한가운데 붙어 있고 사용자가 지도를 끈다. 지도
// 앱들이 오래 써 온 방식이라 설명 없이도 알고, 손가락이 핀을 가리지 않는다.
// 저장되는 좌표는 확인하는 순간의 지도 중심이다.
//
// SDK 는 layout 이 이미 전 페이지에 실어 두었다. 새 지도 라이브러리를 들이지
// 않는다.

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { isValidCoordinate } from "@/lib/geo";

/** 디자이너 시안의 브랜드 블루. 핀과 CTA 가 같은 색이라 한 곳에 둔다. */
const PIN_BLUE = "#0057ff";

export interface SpotLocationPickerProps {
  /** 지도를 열 자리. 없으면 지도가 자기 기본 위치에서 시작한다. */
  center:     { lat: number; lng: number } | null;
  /** 이미 확인해 둔 위치가 있으면 더 가까이서 시작한다. */
  zoomedIn?:  boolean;
  /** 무엇의 위치를 정하는 중인지. 비어 있으면 일반 제목을 쓴다. */
  placeName?: string;
  /** 지도를 왜 여기서 열었는지 한 줄. 없으면 표시하지 않는다. */
  seedNote?:  string | null;
  onConfirm:  (lat: number, lng: number) => void;
  onCancel:   () => void;
}

/** 화면 한가운데 붙는 핀. 지도 위에 떠 있을 뿐 지리 좌표에 묶이지 않는다. */
function CenterPin({ still }: { still: boolean }) {
  return (
    <svg
      width="200" height="200" viewBox="0 0 200 200" fill="none"
      xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"
    >
      {/* 퍼지는 고리 — 여기가 기준점이라는 신호 */}
      <circle cx="100" cy="100" r="10" opacity={still ? 0.25 : 0} stroke={PIN_BLUE} strokeWidth="1.5">
        {!still && <animate attributeName="r" from="10" to="50" dur="2s" repeatCount="indefinite" />}
        {!still && <animate attributeName="opacity" values="0;0.4;0" dur="2s" repeatCount="indefinite" />}
      </circle>

      {/* 정확히 이 점이 저장된다 */}
      <circle cx="100" cy="100" r="3" fill={PIN_BLUE}>
        {!still && <animate attributeName="r" values="3;4;3" dur="2s" repeatCount="indefinite" />}
      </circle>
      <circle cx="100" cy="100" r="8" fill={PIN_BLUE} fillOpacity="0.1" />

      <g>
        <path
          d="M100 92 C112 92 122 82 122 70 C122 58 112 48 100 48 C88 48 78 58 78 70 C78 82 88 92 100 92 Z"
          fill="url(#gkm_pin_grad)"
        />
        <path d="M100 96 L94 84 H106 L100 96 Z" fill={PIN_BLUE} />
        <circle cx="100" cy="70" r="6" fill="white" />
        <path d="M88 60 C92 54 108 54 112 60" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.3" />
        {!still && (
          <animateTransform
            attributeName="transform" type="translate"
            values="0,0; 0,-6; 0,0" dur="1.8s" repeatCount="indefinite"
            calcMode="spline" keySplines="0.4 0 0.2 1; 0.4 0 0.2 1"
          />
        )}
      </g>

      <ellipse cx="100" cy="102" rx="10" ry="3" fill="black" fillOpacity="0.1">
        {!still && <animate attributeName="rx" values="10;7;10" dur="1.8s" repeatCount="indefinite" />}
        {!still && <animate attributeName="fill-opacity" values="0.1;0.05;0.1" dur="1.8s" repeatCount="indefinite" />}
      </ellipse>

      <defs>
        <linearGradient id="gkm_pin_grad" x1="100" y1="48" x2="100" y2="92" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="50%" stopColor={PIN_BLUE} />
          <stop offset="100%" stopColor="#1e3a8a" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export default function SpotLocationPicker({
  center, zoomedIn = false, placeName, seedNote = null, onConfirm, onCancel,
}: SpotLocationPickerProps) {
  const t = useTranslations("picks");
  const boxRef = useRef<HTMLDivElement>(null);
  // SDK 가 이미 선언해 둔 모양을 그대로 쓴다 — 여기서 다시 정의하면 두 선언이
  // 어긋나는 순간 타입은 통과하는데 실제로는 없는 메서드를 부르게 된다.
  type NaverMapInstance = InstanceType<NonNullable<Window["naver"]>["maps"]["Map"]>;
  const mapRef = useRef<NaverMapInstance | null>(null);

  const [ready, setReady] = useState(false);
  const [at,    setAt]    = useState<{ lat: number; lng: number } | null>(center);

  // 움직임을 줄여 달라고 한 사람에게는 튀는 핀을 보이지 않는다. 핀은 그대로 있고
  // 애니메이션만 멈춘다 — 정보를 잃지 않는다.
  const [still, setStill] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    setStill(mq.matches);
    const on = (e: MediaQueryListEvent) => setStill(e.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);

  // 뒤 화면이 같이 스크롤되면 지도를 끌 때마다 폼이 따라 움직인다.
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
    // SDK 가 아직 안 왔을 수 있다. 그때도 화면은 닫을 수 있어야 한다.
    if (!el || !naver?.maps || !center) return;

    const { maps } = naver;
    const map = new maps.Map(el, {
      center: new maps.LatLng(center.lat, center.lng),
      zoom:   zoomedIn ? 18 : 16,
      mapDataControl: false,
      scaleControl:   false,
      logoControlOptions: { position: 3 },
    });
    mapRef.current = map;

    // 손가락이 움직이는 내내 state 를 갱신하면 지도가 끊긴다. `idle` 은 움직임이
    // 멎은 뒤 한 번 온다 — 화면에 읽어 줄 좌표는 그때 갱신하면 충분하다.
    const idle = maps.Event.addListener(map, "idle", () => {
      const c = map.getCenter();
      const lat = c?.lat(), lng = c?.lng();
      if (isValidCoordinate(lat, lng)) setAt({ lat: lat as number, lng: lng as number });
    });
    setReady(true);

    return () => {
      maps.Event.removeListener(idle);
      mapRef.current = null;
    };
  }, [center, zoomedIn]);

  function confirm() {
    // 저장되는 값은 지금 이 순간의 지도 중심이다. `idle` 을 기다리다 놓친
    // 마지막 움직임까지 반영하려고 state 가 아니라 지도에게 직접 묻는다.
    const c = mapRef.current?.getCenter();
    const lat = c?.lat() ?? at?.lat;
    const lng = c?.lng() ?? at?.lng;
    if (!isValidCoordinate(lat, lng)) return;
    onConfirm(lat as number, lng as number);
  }

  const title = placeName?.trim()
    ? t("locConfirmTitle", { place: placeName.trim() })
    : t("locConfirmTitleFallback");

  return (
    <div
      className="fixed inset-0 z-50 bg-white"
      role="dialog" aria-modal="true" aria-label={title}
    >
      {/* 지도 — 화면 전체다.
          자리를 잡는 바깥 상자와 지도가 들어갈 안쪽 상자를 나눈다. SDK 는
          지도를 만들 때 컨테이너에 인라인 `position: relative` 를 덮어쓴다.
          한 상자에 `absolute inset-0` 만 주면 그 순간 inset 이 무효가 되고
          높이가 0 으로 접혀 타일이 하나도 그려지지 않는다. */}
      <div className="absolute inset-0">
        <div ref={boxRef} className="w-full h-full bg-[#F6F7F8]" />
      </div>

      {/* 안내 — 지도를 가리지 않을 만큼만 */}
      <div className="absolute top-4 right-4 left-4 sm:left-auto z-20 sm:max-w-[260px] rounded-2xl border border-black/5 bg-white/92 backdrop-blur-sm p-4 shadow-sm">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-sm font-black text-[#191C21]">{title}</h2>
          <button
            type="button" onClick={onCancel}
            aria-label={t("locConfirmClose")}
            className="gkm-focus -mr-1 -mt-1 shrink-0 w-8 h-8 inline-flex items-center justify-center rounded-full text-[#565D66] hover:bg-black/5 transition-colors cursor-pointer"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-[#565D66]">{t("locConfirmHint")}</p>
        {seedNote && <p className="mt-1.5 text-[11px] text-[#565D66]/75">{seedNote}</p>}
      </div>

      {/* 한가운데 고정 핀 — 손가락이 닿지 않는다 */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
        <CenterPin still={still} />
      </div>

      {/* 지도를 못 띄웠을 때 — 빈 화면으로 두지 않는다 */}
      {!ready && (
        <p className="absolute inset-x-0 top-1/2 z-10 mt-28 text-center text-xs text-[#565D66]" role="status">
          {t("locMapLoading")}
        </p>
      )}

      {/* 화면에 못 그리는 값은 읽어 준다 */}
      <p className="sr-only" aria-live="polite">
        {at ? t("locCenterAria", { lat: at.lat.toFixed(5), lng: at.lng.toFixed(5) }) : ""}
      </p>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-white/90 via-white/50 to-transparent z-10" />
      <div
        className="absolute inset-x-0 bottom-0 z-20 px-4 pt-4"
        style={{ paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom))" }}
      >
        <button
          type="button" onClick={confirm} disabled={!ready}
          className="gkm-focus w-full min-h-12 inline-flex items-center justify-center gap-2 rounded-full py-3.5 text-sm font-black text-white shadow-lg transition-opacity hover:opacity-90 disabled:opacity-40 cursor-pointer"
          style={{ backgroundColor: PIN_BLUE }}
        >
          <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="opacity-90">
            <path fillRule="evenodd" clipRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" />
          </svg>
          {t("locConfirmSave")}
        </button>
      </div>
    </div>
  );
}
