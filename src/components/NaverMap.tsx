"use client";

import { useEffect, useRef, useState } from "react";
import {
  planDisplay, spotKey, labelText, escapeHtml, zoomAfterClusterClick,
  LABEL_MAX_WIDTH_PX,
} from "@/lib/explore/map-cluster-core";

/** 클러스터·선택 강조에 쓰는 action primary — SDK 옵션이라 CSS 변수를 못 쓴다. */
const SELECTED_COLOR = "#0041c8";
/** SDK 가 아직 살아나기 전 계산에 쓰는 초기 줌 — 지도 생성 옵션과 같은 값. */
const DEFAULT_ZOOM = 13;

// Naver Maps v3 — window type declarations (no npm package)
declare global {
  interface Window {
    naver?: {
      maps: {
        Map:        new (el: HTMLElement, opts: Record<string, unknown>) => NaverMapObj;
        LatLng:     new (lat: number, lng: number) => NaverLatLng;
        Marker:     new (opts: Record<string, unknown>) => NaverMarkerObj;
        InfoWindow: new (opts: Record<string, unknown>) => NaverInfoWindowObj;
        Event:      {
          addListener:    (t: unknown, ev: string, fn: () => void) => NaverListener;
          removeListener: (l: NaverListener) => void;
        };
        Point:      new (x: number, y: number) => { x: number; y: number };
        Size:       new (w: number, h: number) => unknown;
        Polyline:   new (opts: Record<string, unknown>) => NaverShapeObj;
        LatLngBounds: new (sw: NaverLatLng, ne: NaverLatLng) => NaverBoundsObj;
      };
    };
  }
}
// 주의: relayout()은 Kakao Maps API — Naver v3에는 없다. 크기 갱신은 setSize()가 정식 API.
interface NaverMapObj      { setCenter: (l: NaverLatLng) => void; setZoom: (z: number) => void; getZoom: () => number; setSize: (s: unknown) => void; getCenter: () => NaverLatLng; fitBounds: (b: NaverBoundsObj, opts?: Record<string, unknown>) => void; }
type NaverListener = unknown;
interface NaverShapeObj    { setMap: (m: NaverMapObj | null) => void; }
interface NaverBoundsObj   { extend: (l: NaverLatLng) => void; }
interface NaverLatLng      { lat: () => number; lng: () => number; }
interface NaverMarkerObj   { setMap: (m: NaverMapObj | null) => void; setIcon?: (icon: Record<string, unknown>) => void; setZIndex?: (z: number) => void; }
interface NaverInfoWindowObj { open: (m: NaverMapObj, mk: NaverMarkerObj) => void; close: () => void; }

export interface MapSpot {
  id:       number;
  name:     string;
  lat:      number;
  lng:      number;
  category: string;
  address:  string;
  /** 선택 강조용 키. 병합 목록에서 같은 숫자 id 를 쓰는 다른 소스와 구분한다. */
  sourceKey?: string;
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
  /** 강조할 마커의 선택 키(sourceKey ?? id). 지정하면 그 마커만 크게 그린다. */
  selectedKey?: string | null;
  /**
   * 줌 기반 클러스터 + 이름 pill 계층을 켠다 (Explore Map 전용).
   *
   * 기본은 꺼짐이다. 일정 Day 지도처럼 장소가 몇 개뿐인 화면은 묶을 것이
   * 없고 번호 마커가 이미 순서를 말하고 있어 클러스터가 방해만 된다.
   */
  clusterZoomLabels?: boolean;
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

// 마커 아이콘 — 44×44 투명 통탐 안에 작은 핀을 가운데 둔다.
//
// 예전엔 94개 전부를 장소명 텍스트 pill 로 그렸다. 390px 에서 화면 내
// 마커 6개 중 8/15 쌍이 겹쳐 도로와 지명을 가렸고, 1440px 에선 지도
// 면적의 38% 를 덮었다(실측). 이름은 하단 선택 카드가 맡는다.
//
// ↑ 위 실측은 "모든 줌에서 94개 전부에 pill" 이던 시절 이야기다. 지금은
// 승인 시안대로 pill 을 되살리되, 겹치지 않는 줌(z≥16, map-cluster-core 실측)
// 에서만 그리고 그 아래는 숫자 클러스터로 접는다. 하단 선택 카드가 전체
// 이름을 맡는 계약은 그대로다.
//
// 시각적으로는 작지만 터치 영역은 44×44 로 유지한다 — 손가락으로
// 누를 수 있어야 하고, 투명 여백은 지도를 가리지 않는다.
const MARKER_HIT = 44;

/**
 * 장소 마커. label 이 있으면 승인 시안처럼 점 위에 이름 pill 을 얹는다.
 *
 * pill 은 44×44 히트박스 밖(position:absolute)에 그린다. 컨테이너를 넓히면
 * anchor 기준이 함께 밀려 마커가 실제 좌표에서 벗어난다.
 */
function markerIcon(color: string, selected: boolean, label?: string | null): string {
  const d = selected ? 22 : 14;
  const ring = selected ? 3 : 2;
  const dot = `<span style="display:block;width:${d}px;height:${d}px;border-radius:50%;background:${color};border:${ring}px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.3)"></span>`;
  const pill = label
    ? `<span style="position:absolute;left:50%;bottom:${MARKER_HIT / 2 + d / 2 + 4}px;transform:translateX(-50%);`
      + `max-width:${LABEL_MAX_WIDTH_PX}px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;`
      + `padding:3px 9px;border-radius:999px;font-size:12px;font-weight:700;line-height:1.35;`
      + (selected
          ? `background:${SELECTED_COLOR};color:#fff;border:1px solid ${SELECTED_COLOR};`
          : `background:rgba(255,255,255,0.96);color:#131b2e;border:1px solid #E5E7EA;`)
      + `box-shadow:0 1px 4px rgba(19,27,46,0.18)">${escapeHtml(label)}</span>`
    : "";
  return `<div style="position:relative;width:${MARKER_HIT}px;height:${MARKER_HIT}px;display:flex;align-items:center;justify-content:center;cursor:pointer;background:transparent">`
    + pill + dot
    + `</div>`;
}

/** 클러스터 뱃지 — 숫자만 읽히면 되므로 원 하나. 그라디언트·그림자 과용 금지. */
const CLUSTER_HIT = 56;
function clusterIcon(count: number): string {
  const d = count < 10 ? 36 : count < 50 ? 44 : 52;
  const fs = count < 10 ? 14 : count < 50 ? 15 : 16;
  return `<div style="width:${CLUSTER_HIT}px;height:${CLUSTER_HIT}px;display:flex;align-items:center;justify-content:center;cursor:pointer;background:transparent">`
    + `<span style="display:flex;align-items:center;justify-content:center;width:${d}px;height:${d}px;`
    + `border-radius:50%;background:${SELECTED_COLOR};color:#fff;font-size:${fs}px;font-weight:800;`
    + `border:2px solid #fff;box-shadow:0 1px 5px rgba(19,27,46,0.28)">${count}</span>`
    + `</div>`;
}

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
  selectedKey,
  clusterZoomLabels,
}: Props) {
  const mapDivRef     = useRef<HTMLDivElement>(null);
  const mapRef        = useRef<NaverMapObj | null>(null);
  const markersRef    = useRef<NaverMarkerObj[]>([]);
  // 선택 강조를 바꿀 때 마커 94개를 다시 만들지 않기 위해 키로 찾아 아이콘만
  // 갈아끼운다. selectedKey 를 마커 effect 의 deps 에 넣으면 탭할 때마다
  // 전체가 재생성된다.
  const markerByKeyRef = useRef<Map<string, { marker: NaverMarkerObj; color: string; label: string | null }>>(new Map());
  const selectedKeyRef = useRef<string | null>(null);
  // 마커 클릭 콜백은 마커를 만들던 순간의 hideInfoWindow 를 그대로 물고 있다.
  // 마커 effect 는 spots 로만 다시 도는데 List↔Map 전환은 spots 를 바꾸지 않으므로,
  // Explore 가 Map 으로 넘어가도 콜백은 "List 시절의 false" 를 계속 읽어
  // 같은 장소가 말풍선과 하단 카드에 겹쳐 떴다.
  //
  // deps 에 넣지 않는 이유는 selectedKey 와 같다 — 토글할 때마다 마커 94개가
  // 통째로 다시 만들어진다. 최신 값만 ref 로 흘려보낸다.
  const hideInfoWindowRef = useRef<boolean>(!!hideInfoWindow);
  useEffect(() => { hideInfoWindowRef.current = !!hideInfoWindow; }, [hideInfoWindow]);
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

  // ── 장소 계층 렌더 ────────────────────────────────────────────────────────
  //
  // 무엇을 그릴지는 map-cluster-core 가 순수 계산으로 정한다. 여기서는 그
  // 결과를 SDK 객체로 옮기기만 한다 — 판단이 SDK 콜백 안에 섞이면 913430d
  // 처럼 단위 테스트가 통과해도 운영에서 틀리는 일이 생긴다.
  //
  // 줌이 바뀔 때마다 무조건 다시 만들지 않는다. 계획 서명이 같으면(같은 모드·
  // 같은 묶음) 아무것도 건드리지 않고 빠져나간다.
  //
  // 렌더 함수는 effect 안에서 ref 에 담는다. 렌더 도중에 ref 를 건드리면
  // React 규칙 위반이고, deps 에 넣으면 줌 리스너가 매 렌더 다시 붙는다.
  const planSigRef = useRef<string>("");
  const renderSpotLayerRef = useRef<(force?: boolean) => void>(() => {});

  const renderSpotLayer = (force = false) => {
    const nmap = mapRef.current;
    if (!nmap || !window.naver) return;
    const map = window.naver.maps;

    const zoom = typeof nmap.getZoom === "function" ? nmap.getZoom() : DEFAULT_ZOOM;
    // 클러스터를 끈 화면은 예전처럼 전부 개별 마커, 이름 pill 없음.
    const plan = clusterZoomLabels
      ? planDisplay(spots, zoom)
      : { mode: "individual" as const, clusters: [], singles: spots.filter(s => s.lat && s.lng), showLabels: false };

    const sig = `${plan.mode}|${plan.showLabels}|`
      + plan.clusters.map(c => `${c.key}=${c.count}`).sort().join(",")
      + `|` + plan.singles.map(spotKey).sort().join(",");
    if (!force && sig === planSigRef.current) return;
    planSigRef.current = sig;

    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];
    markerByKeyRef.current.clear();
    openInfoRef.current?.close();
    openInfoRef.current = null;

    // 클러스터 뱃지 — 누르면 그 묶음이 풀릴 만큼 확대한다.
    for (const cluster of plan.clusters) {
      const marker = new map.Marker({
        position: new map.LatLng(cluster.lat, cluster.lng),
        map: nmap as unknown as Record<string, unknown>,
        icon: { content: clusterIcon(cluster.count), anchor: new map.Point(CLUSTER_HIT / 2, CLUSTER_HIT / 2) },
        zIndex: 60,
      });
      map.Event.addListener(marker, "click", () => {
        const cur = typeof nmap.getZoom === "function" ? nmap.getZoom() : DEFAULT_ZOOM;
        nmap.setCenter(new map.LatLng(cluster.lat, cluster.lng));
        nmap.setZoom(zoomAfterClusterClick(cur));
      });
      markersRef.current.push(marker);
    }

    // 개별 장소 마커 (+ 충분히 확대됐으면 이름 pill)
    for (const spot of plan.singles) {
      const color = CATEGORY_COLOR[spot.category] ?? "#1a1a2e";
      const key = spotKey(spot);
      const label = plan.showLabels ? labelText(spot.name) : null;

      const marker = new map.Marker({
        position: new map.LatLng(spot.lat, spot.lng),
        map: nmap as unknown as Record<string, unknown>,
        icon: {
          content: markerIcon(color, key === selectedKeyRef.current, label),
          anchor: new map.Point(MARKER_HIT / 2, MARKER_HIT / 2),
        },
        // 선택 장소는 이웃 pill 에 가리지 않게 위로 올린다.
        zIndex: key === selectedKeyRef.current ? 50 : 10,
      });
      markerByKeyRef.current.set(key, { marker, color, label });

      const info = new map.InfoWindow({
        content: `<div style="padding:10px 14px;font-size:13px;max-width:220px"><b style="color:#1a1a2e">${escapeHtml(spot.name)}</b><br/><span style="font-size:11px;color:#565D66">${escapeHtml(spot.address.slice(0, 55))}</span></div>`,
        borderWidth: 1,
        // 데스크톱 split 은 여전히 말풍선을 쓴다. 코랄은 B1 에서 보조 accent 로
        // 내려갔으므로 action primary 로 맞춘다. SDK 옵션이라 CSS 변수를 쓸 수
        // 없어 --gkm-action-primary 와 같은 값을 직접 적는다.
        borderColor: SELECTED_COLOR,
      });

      // 마커와 이름 pill 은 같은 아이콘 안에 있으므로 클릭도 하나로 묶인다 —
      // 이름을 눌러도 점을 눌러도 같은 장소가 선택된다.
      map.Event.addListener(marker, "click", () => {
        openInfoRef.current?.close();
        if (!hideInfoWindowRef.current) {
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
    }
  };

  // 최신 렌더 함수를 ref 에 보관한다 — 줌 리스너가 항상 현재 spots·props 를 본다.
  // 아래 effect 들보다 먼저 선언해야 같은 커밋에서 먼저 갱신된다.
  useEffect(() => { renderSpotLayerRef.current = renderSpotLayer; });

  // spots·클러스터 옵션이 바뀌면 계획을 다시 세운다 (강제 재생성)
  useEffect(() => {
    // 결과가 바뀌면 자체 미리보기는 닫는다 — 목록에서 사라진 장소가 계속
    // 떠 있으면 사용자가 고르지 않은 장소를 고른 것처럼 보인다.
    // 연쇄 렌더는 생기지 않는다: 이미 null 이면 React 가 같은 값으로 보고
    // 재렌더를 건너뛰고, 실제로 값이 바뀌는 경우가 이 effect 의 목적이다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveSpot(prev => (prev === null ? prev : null));
    renderSpotLayerRef.current(true);
  }, [spots, clusterZoomLabels, ready]);

  // 줌 변화 — 리스너는 지도당 한 번만 건다. 계획이 같으면 렌더는 건너뛴다.
  useEffect(() => {
    if (!ready || !mapRef.current || !window.naver) return;
    const map = window.naver.maps;
    const nmap = mapRef.current;
    if (typeof map.Event?.addListener !== "function") return;
    const l = map.Event.addListener(nmap, "zoom_changed", () => renderSpotLayerRef.current());
    return () => { map.Event.removeListener?.(l); };
  }, [ready]);

  // 선택 마커만 아이콘 교체 — 이전 선택은 기본으로 되돌린다.
  useEffect(() => {
    const prev = selectedKeyRef.current;
    selectedKeyRef.current = selectedKey ?? null;
    if (!window.naver) return;
    const map = window.naver.maps;
    const paint = (k: string | null, on: boolean) => {
      if (!k) return;
      const entry = markerByKeyRef.current.get(k);
      if (!entry) return;
      entry.marker.setIcon?.({
        content: markerIcon(entry.color, on, entry.label),
        anchor: new map.Point(MARKER_HIT / 2, MARKER_HIT / 2),
      });
      entry.marker.setZIndex?.(on ? 50 : 10);
    };
    if (prev && prev !== selectedKey) paint(prev, false);
    paint(selectedKey ?? null, true);
  }, [selectedKey, spots]);

  // 언마운트 정리 — 지도에서 떼지 않으면 SDK 안에 마커가 남는다.
  useEffect(() => () => {
    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];
    markerByKeyRef.current.clear();
    openInfoRef.current?.close();
    openInfoRef.current = null;
  }, []);

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
