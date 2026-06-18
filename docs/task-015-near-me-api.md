# GoKoreaMate — TASK-015: Near Me 2.0 API 구현 계획서

> 브랜드: GoKoreaMate / gokoreamate.com
> 작성일: 2026-06-18
> Task: TASK-015 — Near Me 2.0 후보군 생성 API 구현
> 전제 조건:
>   TASK-011 docs/near-me-2.0-candidate-logic.md (설계 문서)
>   TASK-013 src/lib/scheduler/ (규칙 기반 스케줄러 — NearMeCandidate 소비자)
>   TASK-014 src/lib/scheduler/ai/ (AI 개인화 레이어)

---

## 1. 개요 및 구현 위치

TASK-011은 Near Me 2.0의 **후보군 생성 알고리즘을 문서로만 정의**했다.
TASK-013 스케줄러는 `NearMeCandidate[]`를 입력으로 받지만, 현재는 `mock/mock-input.ts`의 하드코딩된 배열만 사용한다.

TASK-015는 이 공백을 채운다:

```
GPS 좌표 + 카테고리 + 시각 + 사용자 컨텍스트
          │
          ▼
POST /api/near-me (TASK-015 NEW)
          │
   NearMeResult[] ──────────────────────────────┐
          │                                     │
          ▼                                     ▼
POST /api/scheduler (TASK-013)    POST /api/scheduler/personalize (TASK-014)
          │                                     │
   ScheduledDay                   PersonalizedScheduledDay
```

**TASK-015 완료 시**: 스케줄러~AI 파이프라인이 실제 Supabase `places` 데이터로 종단 간(E2E) 동작한다.

**핵심 불변 원칙**: Gemini Live API 호출 금지. 모든 Near Me 후보 선정 로직은 순수 규칙 기반(Rule-based)이다.

---

## 2. 현재 Supabase `places` 테이블 스키마 (실측)

`src/lib/places.ts`의 `PlaceRow` 타입에서 확인된 실제 컬럼:

| 컬럼 | 타입 | Near Me 활용 여부 |
|------|------|-----------------|
| `place_id` | string | ✅ 후보 ID |
| `category` | string | ✅ 카테고리 필터 |
| `lat` | number \| null | ✅ Haversine 거리 계산 |
| `lng` | number \| null | ✅ Haversine 거리 계산 |
| `district` | string | ✅ Zone 보조 분류 |
| `is_active` | boolean | ✅ 필수 필터 |
| `admin_status` | string | ✅ 'approved'만 조회 |
| `name_ko`, `name_en` | string | UI display only |
| `tags` | string[] | 선호도 매칭 보조 |

**미보유 컬럼 (설계 대비 차이점)**:
- `coordinate_quality`: TASK-011 설계에 포함됐으나 현재 DB에 없음 → 전체 `"gps"` 동등 처리로 스코어링 패널티 없음 (v2 개선 시 컬럼 추가)
- `opening_hours`: 없음 → 시간대 스코어링 비활성화 (TASK-011 동일 기준)

---

## 3. 카테고리 매핑 (DB → Near Me)

현재 `places.category` 값은 TASK-011 카테고리 키와 다를 수 있다. 매핑 테이블을 정의한다.

```typescript
// DB category 값 → NearMe PlaceCategory 매핑
const CATEGORY_MAP: Record<string, PlaceCategory> = {
  restaurant: "food",
  food:       "food",
  cafe:       "cafe",
  attraction: "attraction",
  temple:     "temple",
  kpop:       "kpop",
  shopping:   "shopping",
  nightview:  "nightview",
  walking:    "walking",
  rainy_day:  "rainy_day",
  // 이벤트는 별도 events 테이블에서 처리 (TASK-004 스키마)
};
```

`CATEGORY_MAP`에 없는 카테고리는 Near Me 후보에서 제외한다.

---

## 4. 3-Zone 반경 시스템 및 동적 확장 (TASK-011 충실 구현)

### 4-1. Bounding Box Pre-filter → Haversine Fine-filter 2단계 전략

PostGIS `ST_DWithin`이 없으므로 순수 TypeScript로 구현:

```
Step 1 — Bounding Box (DB 쿼리 수준)
  lat BETWEEN (user_lat - delta_lat) AND (user_lat + delta_lat)
  lng BETWEEN (user_lng - delta_lng) AND (user_lng + delta_lng)
  delta_lat = max_radius_km / 111.0
  delta_lng = max_radius_km / (111.0 × cos(user_lat_rad))

  → 직사각형 범위를 DB에서 필터링 (인덱스 활용 가능)
  → 코너 부분에서 약간의 과다 조회 발생 → Step 2에서 정밀 필터링

Step 2 — Haversine Fine-filter (TypeScript)
  haversineDistance(user_coord, place_coord) <= target_radius_meters
  → 정확한 원형 반경 필터링
  → zone_id 계산: ≤1km=1, ≤3km=2, ≤7km=3
```

### 4-2. 동적 Zone 확장 알고리즘

```typescript
// ZoneExpansionResult
function expandZones(
  places: FilteredPlace[],
  userCoord: Coordinate
): { candidates: ZonedPlace[]; activeZone: ZoneId } {
  const zone1 = filter(places, ≤1km);
  if (zone1.length >= 5) return { candidates: zone1, activeZone: 1 };

  const zone12 = filter(places, ≤3km);
  if (zone12.length >= 10) return { candidates: zone12, activeZone: 2 };

  const zone123 = filter(places, ≤7km);
  return { candidates: zone123, activeZone: 3 };
}
```

---

## 5. 7-Factor 스코어링 알고리즘 (TASK-011 충실 구현)

각 후보에 대해 아래 7개 요소를 합산하여 총점 계산:

| # | Factor | 최대 점수 | 구현 상태 |
|---|--------|----------|---------|
| F1 | 거리 역비례 점수 | 100점 | ✅ Haversine 실측 |
| F2 | 좌표 정확도 (coordinate_quality) | ±점수 | ⚠️ DB 컬럼 없음 → 0점 처리 |
| F3 | 시간대 적합성 (opening_hours) | 20점 | ⚠️ DB 컬럼 없음 → 0점 처리 |
| F4 | 카테고리 가중치 | 20점 | ✅ 카테고리별 고정 |
| F5 | 사용자 선호도 (Like 기록) | 30점 | ✅ client-side preferences 배열 |
| F6 | 기존 일정 동선 근접도 | 25점 | ✅ 기존 itinerary_items 좌표 |
| F7 | 이벤트 보너스 | 40점 | 🔜 v2 (events 테이블 JOIN 필요) |

### 5-1. F1 — 거리 역비례 점수 공식

```typescript
function distanceScore(distanceMeters: number): number {
  if (distanceMeters <=   500) return 100;
  if (distanceMeters <=  1000) return  80;
  if (distanceMeters <=  2000) return  60;
  if (distanceMeters <=  3000) return  40;
  if (distanceMeters <=  5000) return  20;
  return 10; // ≤ 7km
}
```

### 5-2. F4 — 카테고리 가중치

```typescript
const CATEGORY_WEIGHT: Record<PlaceCategory, number> = {
  food:      20,  // 음식 — 항상 높은 수요
  cafe:      15,
  attraction:20,
  kpop:      18,
  temple:    16,
  walking:   14,
  nightview: 16,
  shopping:  14,
  rainy_day: 12,
  event:      0,  // 이벤트는 F7에서 별도 처리
};
```

### 5-3. F5 — 사용자 선호도 점수

```typescript
// liked_place_ids: 사용자가 Like한 place_id 배열 (클라이언트 전달)
// 좋아요한 장소의 category와 동일하면 +30점
function preferenceScore(
  candidate: ZonedPlace,
  likedCategories: Set<PlaceCategory>
): number {
  return likedCategories.has(candidate.category) ? 30 : 0;
}
```

### 5-4. F6 — 기존 일정 동선 근접도 점수

```typescript
// itinerary_coords: Add to Itinerary로 추가된 장소들의 좌표 배열
// 기존 일정 중 어느 하나와 500m 이내면 +25점 (동선 연결성)
function itineraryProximityScore(
  candidate: ZonedPlace,
  itineraryCoords: Coordinate[]
): number {
  const withinNeighborhood = itineraryCoords.some(
    (coord) => haversineDistance(coord, candidate.coordinate) <= 500
  );
  return withinNeighborhood ? 25 : 0;
}
```

---

## 6. 신규 타입 정의

```typescript
// src/lib/near-me/types.ts

export interface NearMeInput {
  coordinate:        Coordinate;            // GPS 현재 위치
  timestamp:         string;                // "HH:MM" (시간대 스코어링용)
  categories?:       PlaceCategory[];       // 필터 카테고리 (없으면 전체)
  liked_place_ids?:  string[];              // F5 선호도
  itinerary_coords?: Coordinate[];          // F6 기존 일정 동선
  limit?:            number;                // 결과 최대 수 (default: 20)
}

export interface NearMeResult {
  place_id:   string;
  category:   PlaceCategory;
  coordinate: Coordinate;
  zone_id:    ZoneId;
  score:      number;           // 총점 (F1~F7 합산)
  distance_m: number;           // 실제 거리 (미터)
}

// NearMeResult는 NearMeCandidate(TASK-013)와 동일 구조
// → scheduler 입력으로 직접 전달 가능 (어댑터 불필요)
export type NearMeCandidateReady = NearMeResult;
```

---

## 7. Supabase 쿼리 전략

```typescript
// src/lib/near-me/candidate-generator.ts
// Supabase anon 클라이언트 사용 (service role 금지)

async function queryPlacesByBoundingBox(
  userCoord: Coordinate,
  maxRadiusKm: number,
  categories: PlaceCategory[]
): Promise<PlaceRow[]> {
  const delta_lat = maxRadiusKm / 111.0;
  const delta_lng = maxRadiusKm / (111.0 * Math.cos(toRad(userCoord.lat)));

  const dbCategories = mapToDbCategories(categories);

  const { data, error } = await supabase
    .from("places")
    .select("place_id, category, lat, lng, district, tags")
    .eq("is_active", true)
    .eq("admin_status", "approved")
    .in("category", dbCategories)
    .gte("lat", userCoord.lat - delta_lat)
    .lte("lat", userCoord.lat + delta_lat)
    .gte("lng", userCoord.lng - delta_lng)
    .lte("lng", userCoord.lng + delta_lng);

  if (error || !data) return [];
  return data as PlaceRow[];
}
```

**Supabase 쿼리 제약**:
- `supabase` anon client 사용 (service role key 코드 진입 금지)
- SELECT 컬럼 최소화 (place_id, category, lat, lng, district, tags만 조회)
- 결과 한도: Supabase 기본 1000건 (Busan 전체 장소 수 기준 안전)

---

## 8. Mock-first 전략

```typescript
// NEXT_PUBLIC_USE_MOCK_NEAR_ME=true → Supabase 쿼리 건너뜀
// mock/mock-places.ts에서 10개 카테고리 × Busan 커버리지 모의 데이터 반환

// mock-places.ts: 30개 모의 장소 (카테고리별 3개, 부산 좌표 기반)
// → 10개 카테고리 × Zone 1~3 분포 보장
// → Near Me → Scheduler → AI 파이프라인 E2E 테스트 가능
```

---

## 9. API 엔드포인트 설계

### POST `/api/near-me`

**Request body**: `NearMeInput`

```json
{
  "coordinate":       { "lat": 35.1587, "lng": 129.1604 },
  "timestamp":        "14:30",
  "categories":       ["food", "cafe", "attraction"],
  "liked_place_ids":  ["place-haedong-yonggungsa"],
  "itinerary_coords": [{ "lat": 35.158, "lng": 129.160 }],
  "limit":            20
}
```

**Response — 성공 (200)**:
```json
{
  "data": {
    "results":      [...],          // NearMeResult[]
    "active_zone":  1,              // 실제 사용된 Zone (1/2/3)
    "total_count":  8,
    "mock":         false           // 모의 데이터 여부
  }
}
```

**Response — 유효성 오류 (400)**:
```json
{ "error": "coordinate.lat is required" }
```

**스케줄러 연동 패턴** (클라이언트 호출 순서):
```
1. POST /api/near-me → NearMeResult[]
2. POST /api/scheduler   { candidates: results, ... }
   OR
   POST /api/scheduler/personalize { candidates: results, ... }
```

---

## 10. 파일 구조 계획

```
src/lib/near-me/
├── types.ts                # NearMeInput, NearMeResult, PlaceRow, ZonedPlace
├── zone-classifier.ts      # boundingBox(), haversineFilter(), assignZoneId(), expandZones()
├── scorer.ts               # 7-factor scoring (F1~F6, F7 stub)
├── candidate-generator.ts  # queryPlacesByBoundingBox() — Supabase 또는 mock 분기
├── near-me-engine.ts       # runNearMe(input) → NearMeResponse (전체 오케스트레이터)
├── mock/
│   └── mock-places.ts      # 30개 모의 장소 (10 카테고리 × Busan Zone 1~3)
└── index.ts                # public: runNearMe, NearMeInput, NearMeResult

src/app/api/near-me/
└── route.ts                # POST /api/near-me handler
```

**총 신규 파일: 8개** (src 7개 + route.ts 1개)

---

## 11. 스케줄러 타입 연동 (TASK-013 adapter 해소)

TASK-013 `src/lib/scheduler/types.ts` 58번째 줄 주석:
```typescript
// NearMeCandidate is a local adapter; will be replaced by TASK-011 import.
```

TASK-015 완료 후, 이 어댑터 주석을 실제 import로 교체하는 경로:

```typescript
// Before (TASK-013 adapter)
import type { NearMeCandidate } from "./types";  // 로컬 정의

// After (TASK-015 실제 타입으로 교체 — 별도 TASK에서 승인 후 진행)
import type { NearMeResult as NearMeCandidate } from "@/lib/near-me/types";
```

> **주의**: types.ts 수정은 이번 TASK-015 범위에서는 진행하지 않는다.
> 두 타입의 구조가 동일함을 확인한 후 별도 Task로 마이그레이션한다.

---

## 12. 절대 금지사항 (TASK-015 범위)

```
금지 1: Gemini Live API 호출 금지 — 후보 선정은 100% Rule-based
금지 2: supabase service role key 코드 진입 금지
금지 3: TASK-013 src/lib/scheduler/types.ts 수정 금지 (어댑터 교체는 별도 Task)
금지 4: events 테이블 JOIN 금지 (TASK-004 스키마 미적용 — F7은 stub으로 처리)
금지 5: coordinate_quality 컬럼 의존 금지 (DB에 없음 — F2는 0점 처리)
금지 6: src/lib/places.ts 수정 금지
금지 7: supabase/migrations/** 수정 금지 (DB 변경 없음)
금지 8: 새 npm 패키지 추가 금지
금지 9: place_name 문자열을 DB에 저장하는 코드 금지
금지 10: gokoreamate 브랜딩 누락 금지
```

---

## 13. 성공 지표 (Definition of Done)

- [ ] `tsc --noEmit` 오류 0개
- [ ] `npm run build` 성공, `/api/near-me` 동적 라우트 목록에 출현
- [ ] `NEXT_PUBLIC_USE_MOCK_NEAR_ME=true`로 `POST /api/near-me` → 30개 mock 장소 중 Zone 동적 확장 후 스코어 정렬된 결과 반환
- [ ] 반환된 `NearMeResult[]`를 `POST /api/scheduler`의 `candidates` 필드에 그대로 전달 시 스케줄 생성 성공
- [ ] Zone 1 후보 < 5개 시 자동으로 Zone 2 확장 동작 확인 (mock 좌표 조작으로 검증)

---

## 14. 작업 순서 계획 (구현 승인 후)

```
Step 1.  git checkout -b feature/TASK-015-near-me-api

Step 2.  src/lib/near-me/ 디렉토리 생성

Step 3.  types.ts 작성
         (NearMeInput, NearMeResult, NearMeResponse, PlaceRow, ZonedPlace)

Step 4.  zone-classifier.ts 작성
         (boundingBoxDelta, haversineFilter, assignZoneId, expandZones)

Step 5.  scorer.ts 작성
         (distanceScore F1, categoryWeight F4, preferenceScore F5,
          itineraryProximityScore F6, F2/F3/F7 stub)

Step 6.  mock/mock-places.ts 작성
         (30개 모의 장소: 10 카테고리 × Busan Zone 1~3 분포)

Step 7.  candidate-generator.ts 작성
         (isMockNearMeMode, queryPlacesByBoundingBox, adaptToZonedPlaces)

Step 8.  near-me-engine.ts 작성
         (runNearMe: bounding box → Haversine filter → zone expand → score → sort → limit)

Step 9.  index.ts 작성
         (public: runNearMe, NearMeInput, NearMeResult)

Step 10. src/app/api/near-me/route.ts 작성
         (POST handler, input validation, 200/400)

Step 11. docs/task-board.md 업데이트 (TASK-015 완료)

Step 12. node_modules/.bin/tsc --noEmit 검증

Step 13. npm run build 검증

Step 14. Selective git add (8 src 파일 + task-board.md) → commit → push → PR
```

---

*이 문서는 GoKoreaMate 2.0 Near Me 2.0 API 구현 계획서입니다.*
*GoKoreaMate / gokoreamate.com*
