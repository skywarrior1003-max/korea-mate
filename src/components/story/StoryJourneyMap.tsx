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

import type { JourneyScene } from "@/lib/share/journey-scene-core";
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
}

export default function StoryJourneyMap({ scene }: Props) {
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
        The Journey
      </p>

      <div
        className="relative w-full overflow-hidden aspect-square sm:aspect-[4/3] pointer-events-none select-none"
        style={{
          borderRadius: RADIUS_PHOTO,
          backgroundColor: SURFACE_VARIANT,
          boxShadow: AMBIENT_SHADOW,
          border: `1px solid ${OUTLINE_VARIANT}4d`,
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
          {/* 각 Day 의 출발점 라벨 — DAY 챕터와 같은 영어 디자인 언어 */}
          {scene.days.map(d => {
            const first = d.points[0];
            if (!first) return null;
            const [x, y] = first;
            const above = y > 0.14;
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
          })}
        </svg>
      </div>

      {/* Day 범례 — Living Map 의 범례 언어 */}
      {scene.days.length > 1 && (
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
