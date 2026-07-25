"use client";

import { useEffect, useRef, useState } from "react";

// Naver Maps v3 — window type declarations (no npm package)
declare global {
  interface Window {
    naver?: {
      maps: {
        Map:        new (el: HTMLElement, opts: Record<string, unknown>) => NaverMapObj;
        LatLng:     new (lat: number, lng: number) => NaverLatLng;
        Marker:     new (opts: Record<string, unknown>) => NaverMarkerObj;
        InfoWindow: new (opts: Record<string, unknown>) => NaverInfoWindowObj;
        Event:      { addListener: (t: unknown, ev: string, fn: () => void) => void };
        Point:      new (x: number, y: number) => { x: number; y: number };
        Size:       new (w: number, h: number) => unknown;
        Polyline:   new (opts: Record<string, unknown>) => NaverShapeObj;
        LatLngBounds: new (sw: NaverLatLng, ne: NaverLatLng) => NaverBoundsObj;
      };
    };
  }
}
// 주의: relayout()은 Kakao Maps API — Naver v3에는 없다. 크기 갱신은 setSize()가 정식 API.
interface NaverMapObj      { setCenter: (l: NaverLatLng) => void; setZoom: (z: number) => void; setSize: (s: unknown) => void; getCenter: () => NaverLatLng; fitBounds: (b: NaverBoundsObj, opts?: Record<string, unknown>) => void; }
interface NaverShapeObj    { setMap: (m: NaverMapObj | null) => void; }
interface NaverBoundsObj   { extend: (l: NaverLatLng) => void; }
interface NaverLatLng      { lat: () => number; lng: () => number; }
interface NaverMarkerObj   { setMap: (m: NaverMapObj | null) => void; }
interface NaverInfoWindowObj { open: (m: NaverMapObj, mk: NaverMarkerObj) => void; close: () => void; }

export interface MapSpot {
  id:       number;
  name:     string;
  lat:      number;
  lng:      number;
  category: string;
  address:  string;
}

// S2 trip 레이어 — 선택한 Day의 방문 순서 장소 (번호 마커 + 순서선)
export interface DayPlace {
  name: string;
  lat:  number;
  lng:  number;
}

interface Props {
  spots:         MapSpot[];
  userLocation?: { lat: number; lng: number } | null;
  nearMeActive?: boolean;
  defaultCenter?: { lat: number; lng: number };
  height?:       number | string;
  className?:    string;
  relayoutKey?:  number;
  onSpotClick?:  (spot: MapSpot) => void;
  /** trip 레이어: 방문 순서대로 번호 코랄 마커 + 점선 순서선. 항상 최상위, 클러스터 없음. */
  dayPlaces?:    DayPlace[];
  /** true면 마커 클릭 시 Naver InfoWindow를 열지 않음 — 자체 프리뷰 UI를 쓰는 화면용(일정 지도). */
  hideInfoWindow?: boolean;
}

// 한국 영토 경계 — GPS가 이 범위를 벗어나면 지도를 재중심하지 않음
const KOREA_BOUNDS = { latMin: 33.0, latMax: 39.0, lngMin: 124.0, lngMax: 132.0 };
function isInKorea(lat: number, lng: number): boolean {
  return lat >= KOREA_BOUNDS.latMin && lat <= KOREA_BOUNDS.latMax
      && lng >= KOREA_BOUNDS.lngMin && lng <= KOREA_BOUNDS.lngMax;
}

const CATEGORY_COLOR: Record<string, string> = {
  attraction:    "#1a1a2e",
  restaurant:    "#c2410c",
  nature:        "#15803d",
  event:         "#7e22ce",
  accommodation: "#1d4ed8",
};

export default function NaverMap({
  spots,
  userLocation,
  nearMeActive,
  defaultCenter = { lat: 35.1587, lng: 129.1604 },
  height = 420,
  className,
  relayoutKey,
  onSpotClick,
  dayPlaces,
  hideInfoWindow,
}: Props) {
  const mapDivRef     = useRef<HTMLDivElement>(null);
  const mapRef        = useRef<NaverMapObj | null>(null);
  const markersRef    = useRef<NaverMarkerObj[]>([]);
  const userMarkerRef = useRef<NaverMarkerObj | null>(null);
  const openInfoRef   = useRef<NaverInfoWindowObj | null>(null);
  const dayMarkersRef = useRef<NaverMarkerObj[]>([]);
  const dayLineRef    = useRef<NaverShapeObj | null>(null);
  const [ready,      setReady]      = useState(false);
  const [activeSpot, setActiveSpot] = useState<MapSpot | null>(null);

  // Poll until naver.maps is available (loaded by layout.tsx Script)
  useEffect(() => {
    if (window.naver?.maps) { setReady(true); return; }
    let tries = 0;
    const t = setInterval(() => {
      if (window.naver?.maps) { clearInterval(t); setReady(true); }
      if (++tries > 80) clearInterval(t);
    }, 100);
    return () => clearInterval(t);
  }, []);

  // Initialize map once naver SDK is ready
  useEffect(() => {
    if (!ready || !mapDivRef.current || mapRef.current) return;
    mapRef.current = new window.naver!.maps.Map(mapDivRef.current, {
      center: new window.naver!.maps.LatLng(defaultCenter.lat, defaultCenter.lng),
      zoom: 13,
      mapDataControl: false,
    });
  }, [ready, defaultCenter.lat, defaultCenter.lng]);

  // Re-draw markers when spots change
  useEffect(() => {
    if (!mapRef.current || !window.naver) return;
    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];
    openInfoRef.current?.close();
    openInfoRef.current = null;
    setActiveSpot(null);

    const map = window.naver!.maps;
    const nmap = mapRef.current;

    spots.filter(s => s.lat && s.lng).forEach(spot => {
      const color = CATEGORY_COLOR[spot.category] ?? "#1a1a2e";
      const label = spot.name.length > 14 ? spot.name.slice(0, 13) + "…" : spot.name;

      const marker = new map.Marker({
        position: new map.LatLng(spot.lat, spot.lng),
        map: nmap as unknown as Record<string, unknown>,
        icon: {
          content: `<div style="background:${color};color:#fff;font-size:11px;font-weight:900;padding:4px 10px;border-radius:20px;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.25);cursor:pointer;border:2px solid rgba(255,255,255,0.25)">${label}</div>`,
          anchor: new map.Point(40, 12),
        },
      });

      const info = new map.InfoWindow({
        content: `<div style="padding:10px 14px;font-size:13px;max-width:220px"><b style="color:#1a1a2e">${spot.name}</b><br/><span style="font-size:11px;color:#565D66">${spot.address.slice(0, 55)}</span></div>`,
        borderWidth: 1,
        borderColor: "#FF4A2D",
      });

      map.Event.addListener(marker, "click", () => {
        openInfoRef.current?.close();
        if (!hideInfoWindow) {
          info.open(nmap, marker);
          openInfoRef.current = info;
        }
        if (onSpotClick) {
          onSpotClick(spot);
        } else {
          setActiveSpot(spot);
        }
      });

      markersRef.current.push(marker);
    });
  }, [spots]);

  // 컨테이너 실제 크기를 지도에 반영 — Naver v3 정식 API setSize() 사용.
  // center를 먼저 저장하고 setSize 후 복원해야 확장 영역 타일이 즉시 로드된다.
  // 숨김 상태(0×0)나 SDK 스텁(인증 실패 시 메서드 부재)에는 호출하지 않는다.
  const applyContainerSize = () => {
    const nmap = mapRef.current;
    const el   = mapDivRef.current;
    if (!nmap || !el || !window.naver?.maps?.Size) return;
    if (typeof nmap.setSize !== "function" || typeof nmap.getCenter !== "function") return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    if (w <= 0 || h <= 0) return;
    const center = nmap.getCenter();
    nmap.setSize(new window.naver.maps.Size(w, h));
    nmap.setCenter(center);
  };
  const applySizeRef = useRef(applyContainerSize);
  applySizeRef.current = applyContainerSize;

  // 크기 변경 감지 주 경로 — ResizeObserver + rAF 디바운스 (전체화면 토글 대응).
  useEffect(() => {
    if (!ready || !mapDivRef.current) return;
    const el = mapDivRef.current;
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => applySizeRef.current());
    });
    ro.observe(el);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [ready]);

  // relayoutKey 보조 폴백 (ResizeObserver 미지원·레이아웃 지연 환경) — 단일 300ms 패스.
  useEffect(() => {
    if (relayoutKey === undefined || !mapRef.current) return;
    const t = setTimeout(() => applySizeRef.current(), 300);
    return () => clearTimeout(t);
  }, [relayoutKey]);

  // ── S2 trip 레이어: 번호 마커(코랄) + 점선 순서선 — 도로 경로가 아닌 방문 순서 표현 ──
  // base 마커와 독립 관리(additive). 항상 최상위(zIndex 200), 클러스터 없음.
  useEffect(() => {
    if (!mapRef.current || !window.naver?.maps) return;
    // 이전 trip 레이어 정리
    dayMarkersRef.current.forEach(m => m.setMap(null));
    dayMarkersRef.current = [];
    dayLineRef.current?.setMap(null);
    dayLineRef.current = null;

    const pts = (dayPlaces ?? []).filter(p => p.lat && p.lng);
    if (pts.length === 0) return;

    const map = window.naver.maps;
    const nmap = mapRef.current;

    const latlngs = pts.map(p => new map.LatLng(p.lat, p.lng));

    // 순서선 (점선 — planned-visit 관계 표현)
    if (latlngs.length >= 2) {
      dayLineRef.current = new map.Polyline({
        map: nmap as unknown as Record<string, unknown>,
        path: latlngs,
        strokeColor: "#FF4A2D",
        strokeOpacity: 0.55,
        strokeWeight: 3,
        strokeStyle: "shortdash",
        zIndex: 150,
      });
    }

    // 번호 마커 1..n
    pts.forEach((p, i) => {
      const marker = new map.Marker({
        position: latlngs[i],
        map: nmap as unknown as Record<string, unknown>,
        zIndex: 200,
        icon: {
          content: `<div style="display:flex;align-items:center;gap:5px">
            <div style="width:26px;height:26px;border-radius:50%;background:#FF4A2D;color:#fff;font-size:13px;font-weight:800;display:flex;align-items:center;justify-content:center;border:2.5px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.35)">${i + 1}</div>
            <div style="background:rgba(255,255,255,0.95);color:#191C21;font-size:11px;font-weight:700;padding:2px 7px;border-radius:10px;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.2)">${p.name.length > 12 ? p.name.slice(0, 11) + "…" : p.name}</div>
          </div>`,
          anchor: new map.Point(13, 13),
        },
      });
      dayMarkersRef.current.push(marker);
    });

    // 해당 Day 전체가 보이도록 fit (1곳이면 center만)
    if (latlngs.length === 1) {
      nmap.setCenter(latlngs[0]);
      nmap.setZoom(14);
    } else {
      const bounds = new map.LatLngBounds(latlngs[0], latlngs[0]);
      latlngs.forEach(l => bounds.extend(l));
      nmap.fitBounds(bounds, { top: 40, right: 40, bottom: 40, left: 40 });
    }
  }, [dayPlaces, ready]); // ready: 지도 초기화 이전에 dayPlaces가 먼저 도착하는 경우 재실행

  // User location marker
  useEffect(() => {
    if (!mapRef.current || !window.naver) return;
    userMarkerRef.current?.setMap(null);
    if (!nearMeActive || !userLocation) { userMarkerRef.current = null; return; }

    const map = window.naver!.maps;
    const nmap = mapRef.current;

    userMarkerRef.current = new map.Marker({
      position: new map.LatLng(userLocation.lat, userLocation.lng),
      map: nmap as unknown as Record<string, unknown>,
      icon: {
        content: `<div style="width:16px;height:16px;background:#FF4A2D;border-radius:50%;border:3px solid #fff;box-shadow:0 0 0 4px rgba(249,115,22,0.25)"></div>`,
        anchor: new map.Point(8, 8),
      },
      zIndex: 100,
    });

    // 한국 내에 있을 때만 지도 재중심 — 해외 GPS면 한국 마커가 화면 밖으로 이동하는 것 방지
    if (isInKorea(userLocation.lat, userLocation.lng)) {
      nmap.setCenter(new map.LatLng(userLocation.lat, userLocation.lng));
      nmap.setZoom(14);
    }
  }, [nearMeActive, userLocation]);

  return (
    <div
      className={className ?? "relative w-full rounded-2xl overflow-hidden border border-[#E5E7EA] mb-6"}
      style={{ height }}
    >
      <div ref={mapDivRef} className="w-full h-full" />

      {!ready && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#F6F7F8] gap-3">
          <div
            className="w-8 h-8 rounded-full border-4 animate-spin"
            style={{ borderColor: "#FF4A2D", borderTopColor: "transparent" }}
          />
          <p className="text-xs font-bold text-[#565D66]">Loading map…</p>
        </div>
      )}

      {/* Active spot info bar — only when no parent modal handler */}
      {!onSpotClick && activeSpot && (
        <div className="absolute bottom-0 left-0 right-0 bg-white/95 backdrop-blur-sm border-t border-[#E5E7EA] px-4 py-3 flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-sm font-black text-[#191C21] truncate">{activeSpot.name}</p>
            <p className="text-xs text-[#565D66] truncate">{activeSpot.address.slice(0, 55)}</p>
          </div>
          <button
            onClick={() => { openInfoRef.current?.close(); setActiveSpot(null); }}
            className="ml-3 text-[#8A919B] hover:text-[#191C21] text-lg shrink-0"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
