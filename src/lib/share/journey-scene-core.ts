// Shared Story 의 Trip Map 장면 데이터 — 순수 계산. (TASK-GOKOREAMATE-SHARED-STORY-MAP-CONTEXT-FIX-V1)
//
// Owner 결정: 공개 Story 에는 여행 전체를 한눈에 되돌아보는 **큰 비인터랙티브
// visual map** 이 있어야 한다. 동시에 privacy 계약은 그대로다 — raw lat/lng,
// 정확한 주소, 좌표 배열은 클라이언트로 나가지 않는다.
//
// 그래서 서버가 좌표를 여기서 **상대 기하로 투영해서 버린다**:
//   - 공개 카탈로그 장소(city_spot)만 쓴다. 사용자 장소·숙소는 이름조차 공개
//     화면에 안 나가는 것과 같은 이유로 지도 장면에서도 제외한다.
//   - 각 stop 을 여행 bounding box 기준 0..1 로 정규화한다(위도 보정 포함).
//     축척·앵커·절대 좌표가 없으므로 이 값으로 실제 위치를 복원할 수 없다 —
//     남는 것은 "이 여행이 어떤 모양으로 움직였는가" 뿐이다.
//   - 출력 키에 lat/lng 라는 이름 자체를 두지 않는다(가드 테스트가 고정).
//
// 화면은 이 값을 받아 Day 색 경로로 그린다 — pan/zoom/click 없음.

export interface JourneySceneDay {
  dayNumber: number;
  /** [x, y] 0..1 — y 는 SVG 방향(아래로 증가). 방문 순서 그대로. */
  points: [number, number][];
}

export interface JourneyScene {
  days: JourneySceneDay[];
  /** 그리기 좋은 가로:세로 비율 힌트(0.5~2 로 클램프). 절대 축척이 아니다. */
  aspect: number;
}

interface RawPlace {
  lat?: unknown; lng?: unknown; source?: unknown; isAccommodation?: unknown;
}
interface RawDay { dayNumber?: unknown; places?: unknown }

function scheduledDays(raw: unknown): RawDay[] {
  if (Array.isArray(raw)) return raw as RawDay[];
  if (raw && typeof raw === "object") {
    const v2 = raw as { __v?: unknown; scheduled?: unknown };
    if (v2.__v === 2 && Array.isArray(v2.scheduled)) return v2.scheduled as RawDay[];
  }
  return [];
}

const fin = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** 서버 전용: raw days(좌표 포함) → 상대 기하 장면. 점이 2개 미만이면 null. */
export function buildJourneyScene(rawDays: unknown): JourneyScene | null {
  const days = scheduledDays(rawDays);
  const perDay: { dayNumber: number; pts: { la: number; lo: number }[] }[] = [];
  days.forEach((d, i) => {
    const dayNumber = typeof d.dayNumber === "number" ? d.dayNumber : i + 1;
    const pts: { la: number; lo: number }[] = [];
    for (const raw of Array.isArray(d.places) ? d.places : []) {
      const p = raw as RawPlace;
      if (p.source !== "city_spot") continue;          // 공개 카탈로그 장소만
      if (p.isAccommodation === true) continue;        // 숙소는 어떤 형태로도 제외
      if (!fin(p.lat) || !fin(p.lng)) continue;
      // 한국 밖 좌표는 데이터 오류다 — 장면을 왜곡시키느니 뺀다
      if (p.lat < 33 || p.lat > 39 || p.lng < 124 || p.lng > 132) continue;
      pts.push({ la: p.lat, lo: p.lng });
    }
    if (pts.length > 0) perDay.push({ dayNumber, pts });
  });

  const all = perDay.flatMap(d => d.pts);
  if (all.length < 2) return null;

  const las = all.map(p => p.la), los = all.map(p => p.lo);
  const laMin = Math.min(...las), laMax = Math.max(...las);
  const loMin = Math.min(...los), loMax = Math.max(...los);
  const midLa = (laMin + laMax) / 2;
  const kx = Math.cos((midLa * Math.PI) / 180);        // 경도 → 거리 보정
  const w = Math.max((loMax - loMin) * kx, 1e-6);
  const h = Math.max(laMax - laMin, 1e-6);
  const span = Math.max(w, h);

  const round = (n: number) => Math.round(n * 1000) / 1000;
  // 정사각 단위 공간에 맞춰 넣고 가운데 정렬 — 축척 정보는 여기서 소멸한다
  const px = (lo: number) => round(((lo - loMin) * kx / span) + (1 - w / span) / 2);
  const py = (la: number) => round(((laMax - la) / span) + (1 - h / span) / 2);

  return {
    days: perDay.map(d => ({
      dayNumber: d.dayNumber,
      points: d.pts.map(p => [px(p.lo), py(p.la)] as [number, number]),
    })),
    aspect: round(Math.min(2, Math.max(0.5, w / h))),
  };
}

/** 클라이언트 전용: 응답의 unknown 을 검증해서 받는다. 모양이 다르면 null. */
export function parseJourneyScene(raw: unknown): JourneyScene | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as { days?: unknown; aspect?: unknown };
  if (!Array.isArray(s.days) || !fin(s.aspect)) return null;
  const days: JourneySceneDay[] = [];
  for (const d of s.days) {
    const dd = d as { dayNumber?: unknown; points?: unknown };
    if (!fin(dd.dayNumber) || !Array.isArray(dd.points)) return null;
    const points: [number, number][] = [];
    for (const p of dd.points) {
      if (!Array.isArray(p) || !fin(p[0]) || !fin(p[1])) return null;
      if (p[0] < 0 || p[0] > 1 || p[1] < 0 || p[1] > 1) return null;
      points.push([p[0], p[1]]);
    }
    days.push({ dayNumber: dd.dayNumber, points });
  }
  const total = days.reduce((n, d) => n + d.points.length, 0);
  return total >= 2 ? { days, aspect: s.aspect } : null;
}
