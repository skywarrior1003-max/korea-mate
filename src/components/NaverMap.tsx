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
      };
    };
  }
}
interface NaverMapObj      { setCenter: (l: NaverLatLng) => void; setZoom: (z: number) => void; relayout: () => void; }
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

interface Props {
  spots:         MapSpot[];
  userLocation?: { lat: number; lng: number } | null;
  nearMeActive?: boolean;
  defaultCenter?: { lat: number; lng: number };
  height?:       number | string;
  className?:    string;
  relayoutKey?:  number;
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
}: Props) {
  const mapDivRef     = useRef<HTMLDivElement>(null);
  const mapRef        = useRef<NaverMapObj | null>(null);
  const markersRef    = useRef<NaverMarkerObj[]>([]);
  const userMarkerRef = useRef<NaverMarkerObj | null>(null);
  const openInfoRef   = useRef<NaverInfoWindowObj | null>(null);
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
        content: `<div style="padding:10px 14px;font-size:13px;max-width:220px"><b style="color:#1a1a2e">${spot.name}</b><br/><span style="font-size:11px;color:#8C6239">${spot.address.slice(0, 55)}</span></div>`,
        borderWidth: 1,
        borderColor: "#D4AF37",
      });

      map.Event.addListener(marker, "click", () => {
        openInfoRef.current?.close();
        info.open(nmap, marker);
        openInfoRef.current = info;
        setActiveSpot(spot);
      });

      markersRef.current.push(marker);
    });
  }, [spots]);

  // Relayout when container size changes (e.g. full-screen toggle)
  useEffect(() => {
    if (relayoutKey === undefined || !mapRef.current) return;
    mapRef.current.relayout();
  }, [relayoutKey]);

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
        content: `<div style="width:16px;height:16px;background:#f97316;border-radius:50%;border:3px solid #fff;box-shadow:0 0 0 4px rgba(249,115,22,0.25)"></div>`,
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
      className={className ?? "relative w-full rounded-2xl overflow-hidden border border-[#E6DFD5] mb-6"}
      style={{ height }}
    >
      <div ref={mapDivRef} className="w-full h-full" />

      {!ready && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#FAF7F2] gap-3">
          <div
            className="w-8 h-8 rounded-full border-4 animate-spin"
            style={{ borderColor: "#D4AF37", borderTopColor: "transparent" }}
          />
          <p className="text-xs font-bold text-[#8C6239]">Loading map…</p>
        </div>
      )}

      {/* Active spot info bar */}
      {activeSpot && (
        <div className="absolute bottom-0 left-0 right-0 bg-white/95 backdrop-blur-sm border-t border-[#E6DFD5] px-4 py-3 flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-sm font-black text-[#2C2520] truncate">{activeSpot.name}</p>
            <p className="text-xs text-[#8C6239] truncate">{activeSpot.address.slice(0, 55)}</p>
          </div>
          <button
            onClick={() => { openInfoRef.current?.close(); setActiveSpot(null); }}
            className="ml-3 text-[#B8A89A] hover:text-[#2C2520] text-lg shrink-0"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
