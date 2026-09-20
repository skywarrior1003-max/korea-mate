"use client";

// Trip Map 장면 — Shared Story 의 큰 비인터랙티브 여행 지도.
// (TASK-GOKOREAMATE-SHARED-STORY-MAP-CONTEXT-FIX-V1, Owner 결정)
//
// 이것은 장소를 찾는 지도가 아니다. "이 여행이 어떤 모양으로 움직였는가" 를
// 한눈에 되돌아보는 **시각 장면**이다 — pan/zoom/click/GPS/Directions 없음.
// 실제 장소가 궁금하면 Save / + My Trip 흐름을 쓴다.
//
// 시각 언어는 새로 만들지 않는다:
//   - 판: 승인 journal artifact 의 map 자리 그대로 — surface-variant 바탕 +
//     점 격자(20px pitch dotted grid) + rounded + ambient shadow.
//   - 경로: Living Map 의 Day 색(livingMapDayColor)·점선 리듬 재사용.
// 들어오는 값은 서버가 투영한 0..1 상대 기하뿐이다 — 좌표가 아니다.

import { useEffect, useRef, useState } from "react";
import type { JourneyScene } from "@/lib/share/journey-scene-core";
import type { JourneyStop } from "@/lib/share/story-adapter";
import { livingMapDayColor } from "@/lib/living-map/living-map-core";
import {
  MARGIN_MOBILE, STACK_LG, STACK_MD, BODY_SM,
  ON_SURFACE_VARIANT, SURFACE_VARIANT, OUTLINE_VARIANT,
  RADIUS_PHOTO, AMBIENT_SHADOW, LABEL_CAPS_WIDE,
} from "./story-tokens";

// 승인 artifact 의 점 격자 그대로 (20×20 px, #e1e3e4 원)
const DOT_GRID =
  "url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCI+PGNpcmNsZSBjeD0iMSIgY3k9IjEiIHI9IjEiIGZpbGw9IiNlMWUzZTQiLz48L3N2Zz4=')";

interface Props {
  scene: JourneyScene;
  /** 섹션 제목 — 호출부가 UI locale 로 넘긴다. */
  titleLabel?: string;
  /**
   * 실지도 정류장(§7-1) — 공식 장소의 공개 카탈로그 좌표·순번·공개 사진.
   * 2곳 이상이고 Naver SDK 가 살아 있으면 실지도를 그리고, 아니면 기존
   * 도식(scene)으로 조용히 내려간다. 비공개 사진은 여기 올 수 없다(어댑터 계약).
   */
  stops?: JourneyStop[];
  /** Day 전환 라벨("전체") — 호출부 locale */
  allLabel?: string;
}

// Naver SDK 전역 — layout 이 로드한다. 없거나 인증 실패면 fallback 이 정답이다.
interface NaverMapsGlobal {
  maps?: {
    Map: new (el: HTMLElement, opts: unknown) => unknown;
    LatLng: new (lat: number, lng: number) => unknown;
    LatLngBounds: new () => { extend: (p: unknown) => void };
    Marker: new (opts: unknown) => { setMap: (m: unknown) => void };
    Polyline: new (opts: unknown) => { setMap: (m: unknown) => void };
    Size: new (w: number, h: number) => unknown;
    Point: new (x: number, y: number) => unknown;
  };
}

function naverMaps(): NaverMapsGlobal["maps"] | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { naver?: NaverMapsGlobal; __gkmNaverMapAuthFailed?: boolean };
  if (w.__gkmNaverMapAuthFailed === true) return null;
  return w.naver?.maps ?? null;
}

/** 원형 사진 + 순번 배지 + Day 색 테두리 마커 (HTML 아이콘) */
function markerHtml(stop: JourneyStop, color: string): string {
  const photo = stop.photo
    ? `<img src="${stop.photo.replace(/"/g, "&quot;")}" style="width:100%;height:100%;object-fit:cover" alt=""/>`
    : `<span style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;color:#fff;font-weight:800;font-size:13px">${stop.order}</span>`;
  return [
    `<div style="position:relative;width:44px;height:44px">`,
    `<div style="width:44px;height:44px;border-radius:50%;overflow:hidden;border:3px solid ${color};background:#232A33;box-shadow:0 2px 6px rgba(0,0,0,.35)">${photo}</div>`,
    `<div style="position:absolute;top:-5px;right:-5px;width:18px;height:18px;border-radius:50%;background:${color};color:#fff;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;border:2px solid #fff">${stop.order}</div>`,
    `</div>`,
  ].join("");
}

export default function StoryJourneyMap({ scene, titleLabel, stops, allLabel }: Props) {
  const mapEl = useRef<HTMLDivElement>(null);
  const [liveMapReady, setLiveMapReady] = useState(false);
  const [dayFilter, setDayFilter] = useState<number | null>(null);
  const wantLive = Array.isArray(stops) && stops.length >= 2;
  const dayNumbers = wantLive ? [...new Set(stops!.map(s => s.dayNumber))].sort((a, b) => a - b) : [];

  useEffect(() => {
    if (!wantLive) return;
    const el = mapEl.current;
    const maps = naverMaps();
    if (!el || !maps) { setLiveMapReady(false); return; }
    const shown = dayFilter === null ? stops! : stops!.filter(s => s.dayNumber === dayFilter);
    if (shown.length === 0) return;
    try {
      el.innerHTML = "";
      const bounds = new maps.LatLngBounds();
      shown.forEach(s => bounds.extend(new maps.LatLng(s.lat, s.lng)));
      const map = new maps.Map(el, {
        center: new maps.LatLng(shown[0]!.lat, shown[0]!.lng),
        zoom: 12,
        draggable: true,
        scrollWheel: false,
        zoomControl: false,
        mapDataControl: false,
        logoControlOptions: { position: 0 },
      });
      // 전체 경로 fit bounds(§7-1)
      (map as { fitBounds?: (b: unknown, o?: unknown) => void }).fitBounds?.(bounds, { top: 44, right: 44, bottom: 44, left: 44 });
      // Day 별 점선 경로 + 마커
      for (const n of dayNumbers) {
        if (dayFilter !== null && n !== dayFilter) continue;
        const dayStops = stops!.filter(s => s.dayNumber === n);
        const color = livingMapDayColor(n);
        if (dayStops.length >= 2) {
          new maps.Polyline({
            map, path: dayStops.map(s => new maps.LatLng(s.lat, s.lng)),
            strokeColor: color, strokeWeight: 3, strokeOpacity: 0.85, strokeStyle: "shortdash",
          }).setMap(map);
        }
        for (const s of dayStops) {
          new maps.Marker({
            map, position: new maps.LatLng(s.lat, s.lng),
            title: s.name,
            icon: { content: markerHtml(s, color), size: new maps.Size(44, 44), anchor: new maps.Point(22, 22) },
          }).setMap(map);
        }
      }
      setLiveMapReady(true);
    } catch {
      // SDK 가 있어도 인증/생성이 깨질 수 있다 — 도식 fallback 으로
      setLiveMapReady(false);
    }
  }, [wantLive, stops, dayFilter, dayNumbers]);
  // 단위 공간(0..1)을 100×100 뷰박스에 얹고 8% 여백을 준다
  const S = 84, O = 8;
  const sx = (x: number) => O + x * S;
  const sy = (y: number) => O + y * S;

  return (
    <section
      className="max-w-4xl mx-auto"
      style={{ paddingLeft: MARGIN_MOBILE, paddingRight: MARGIN_MOBILE, marginBottom: STACK_LG }}
      aria-label="Trip map"
    >
      <p
        className="uppercase text-center"
        style={{ ...LABEL_CAPS_WIDE, color: ON_SURFACE_VARIANT, marginBottom: STACK_MD }}
      >
        {titleLabel ?? "The Journey"}
      </p>

      {/* 실지도(§7-1) — SDK 가 살아 있고 좌표가 있으면 이쪽, 아니면 아래 도식 */}
      {wantLive && (
        <div
          ref={mapEl}
          className="relative w-full overflow-hidden aspect-square sm:aspect-[4/3]"
          style={{
            borderRadius: RADIUS_PHOTO,
            backgroundColor: SURFACE_VARIANT,
            boxShadow: AMBIENT_SHADOW,
            border: `1px solid ${OUTLINE_VARIANT}4d`,
            display: liveMapReady ? "block" : "none",
          }}
          role="img"
          aria-label={titleLabel ?? "The Journey"}
        />
      )}
      {/* Day 전환 — 모바일에서 마커 과밀 시 하루씩 본다(§7-1) */}
      {wantLive && liveMapReady && dayNumbers.length > 1 && (
        <div className="flex flex-wrap justify-center gap-1.5" style={{ marginTop: STACK_MD }}>
          {[null, ...dayNumbers].map(n => (
            <button
              key={n === null ? "all" : n}
              type="button"
              onClick={() => setDayFilter(n)}
              aria-pressed={dayFilter === n}
              className="gkm-focus px-3 py-1 rounded-full text-xs font-bold border cursor-pointer"
              style={dayFilter === n
                ? { backgroundColor: n === null ? "#131b2e" : livingMapDayColor(n), color: "#fff", borderColor: "transparent" }
                : { backgroundColor: "transparent", color: ON_SURFACE_VARIANT, borderColor: `${OUTLINE_VARIANT}80` }}
            >
              {n === null ? (allLabel ?? "All") : `Day ${n}`}
            </button>
          ))}
        </div>
      )}
      {/* 지도 아래 접근 가능한 방문 순서 목록(§7-1) */}
      {wantLive && liveMapReady && (
        <ol className="mt-3 space-y-1 max-w-md mx-auto" style={{ ...BODY_SM, color: ON_SURFACE_VARIANT }}>
          {(dayFilter === null ? stops! : stops!.filter(s => s.dayNumber === dayFilter)).map(s => (
            <li key={`${s.dayNumber}-${s.order}`} className="flex items-center gap-2">
              <span
                aria-hidden
                className="w-4 h-4 rounded-full inline-flex items-center justify-center text-[10px] font-black text-white shrink-0"
                style={{ backgroundColor: livingMapDayColor(s.dayNumber) }}
              >
                {s.order}
              </span>
              <span className="truncate">Day {s.dayNumber} · {s.name}</span>
            </li>
          ))}
        </ol>
      )}

      <div
        className="relative w-full overflow-hidden aspect-square sm:aspect-[4/3] pointer-events-none select-none"
        style={{
          borderRadius: RADIUS_PHOTO,
          backgroundColor: SURFACE_VARIANT,
          boxShadow: AMBIENT_SHADOW,
          border: `1px solid ${OUTLINE_VARIANT}4d`,
          display: wantLive && liveMapReady ? "none" : "block",
        }}
        role="img"
        aria-label="Non-interactive overview of the trip route"
      >
        <div className="absolute inset-0 opacity-25" style={{ backgroundImage: DOT_GRID }} aria-hidden />
        <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full" preserveAspectRatio="xMidYMid meet" aria-hidden>
          {/* Day 별 이동 경로 — Living Map 과 같은 점선 리듬, 하지만 여기선 그림일 뿐이다 */}
          {scene.days.map(d => (
            d.points.length >= 2 && (
              <path
                key={`l${d.dayNumber}`}
                d={"M " + d.points.map(([x, y]) => `${sx(x)} ${sy(y)}`).join(" L ")}
                fill="none"
                stroke={livingMapDayColor(d.dayNumber)}
                strokeWidth="0.9"
                strokeDasharray="2.6 1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.75"
              />
            )
          ))}
          {/* stop 점 — 흰 테두리 작은 원. 번호·이름 없음(장소 식별 기능이 아니다) */}
          {scene.days.map(d =>
            d.points.map(([x, y], i) => (
              <circle
                key={`p${d.dayNumber}-${i}`}
                cx={sx(x)} cy={sy(y)}
                r={i === 0 ? 2.1 : 1.5}
                fill={livingMapDayColor(d.dayNumber)}
                stroke="#ffffff"
                strokeWidth="0.7"
              />
            )),
          )}
          {/* 각 Day 의 출발점 라벨 — DAY 챕터와 같은 영어 디자인 언어.
              출발점이 서로 가까우면(전날 마지막 근처에서 다음 날이 시작하는
              보통 여행) 라벨을 위/아래로 갈라 겹치지 않게 한다. */}
          {(() => {
            const placed: { x: number; y: number; above: boolean }[] = [];
            return scene.days.map(d => {
              const first = d.points[0];
              if (!first) return null;
              const [x, y] = first;
              let above = y > 0.14;
              const near = placed.find(p => Math.abs(p.x - x) < 0.16 && Math.abs(p.y - y) < 0.1);
              if (near) above = !near.above; // 이웃 라벨의 반대편으로
              placed.push({ x, y, above });
              return (
                <text
                  key={`t${d.dayNumber}`}
                  x={sx(x)} y={sy(y) + (above ? -3.6 : 5.4)}
                  textAnchor="middle"
                  fontSize="3.1"
                  fontWeight="800"
                  letterSpacing="0.4"
                  fill={livingMapDayColor(d.dayNumber)}
                  stroke="#ffffff" strokeWidth="0.85" paintOrder="stroke"
                >
                  {`DAY ${d.dayNumber}`}
                </text>
              );
            });
          })()}
        </svg>
      </div>

      {/* Day 범례 — Living Map 의 범례 언어 (도식 fallback 전용 — 실지도는 Day 버튼이 범례다) */}
      {!(wantLive && liveMapReady) && scene.days.length > 1 && (
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-1" style={{ marginTop: STACK_MD }}>
          {scene.days.map(d => (
            <span key={d.dayNumber} className="inline-flex items-center gap-1.5" style={{ ...BODY_SM, color: ON_SURFACE_VARIANT }}>
              <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: livingMapDayColor(d.dayNumber) }} />
              Day {d.dayNumber}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
