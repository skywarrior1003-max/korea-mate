# GoKoreaMate — Near Me 2.0 후보군 설계 문서

> 브랜드: GoKoreaMate / gokoreamate.com
> 작성일: 2026-06-17
> Task: TASK-011 — Near Me 2.0 후보군 설계 문서 추가
> 위치: `docs/near-me-2.0-candidate-logic.md`

---

## 1. 개요

Near Me 2.0은 사용자의 **현재 위치(GPS)** 를 기반으로 가까운 장소·이벤트를 자동 추천하는 gokoreamate.com의 핵심 현지 탐색 기능입니다.

기존 단순 거리순 정렬을 넘어, 아래 신호들을 **종합 스코어링** 방식으로 통합합니다.

```
GPS 위치
  + 반경(Radius)
  + 카테고리(Category)
  + 현재 시각(Time Context)
  + 좋아요 선호도(Like Preference)
  + 기존 일정 동선(Add to Itinerary Neighborhood)
  + 날짜 기반 이벤트(Date-based Events)
  + places 데이터 품질(coordinate_quality)
= 후보 정렬 총점(Total Score)
```

> **중요**: Near Me 2.0 후보군 생성 단계에서 Gemini Live API 호출을 금지합니다.
> 모든 후보 선정은 순수 규칙 기반(Rule-based) 로직으로 구현합니다.

---

## 2. 반경 레벨 (Radius Zones)

Near Me 2.0은 3단계 반경을 정의하며, 후보 수에 따라 **동적 확장** 합니다.

| Zone | 반경 | 이름 | 의미 |
|------|------|------|------|
| Zone 1 | 1km | CLOSE | 도보 10–15분 이내 "바로 근처" |
| Zone 2 | 3km | REACHABLE | 버스·지하철 1–2정거장 "이동 가능" |
| Zone 3 | 7km | SPECIAL | 특별한 이유(대형 이벤트·희귀 장소)가 있을 때 |

### 2-1. 동적 확장 원칙

```
Step 1: Zone 1 (1km) 기준으로 후보 수집
  → 후보 수 < 5개  : Zone 2 (3km) 로 확장
  → 후보 수 < 10개 : Zone 3 (7km) 로 추가 확장
  → 후보 수 ≥ 10개 : Zone 1에서 종료 (확장 없음)

목적:
  - 번화가(해운대 등): Zone 1에서 충분한 후보 확보 → 정밀 추천
  - 외곽 지역: Zone 3까지 확장 → 빈 결과 화면 방지
```

### 2-2. Zone 별 기대 시나리오

```
Zone 1 (1km) — CLOSE
  예시: 해운대 해변 근처 카페 → 도보 5분 거리 카페 4개 즉시 추천

Zone 2 (3km) — REACHABLE
  예시: 부산역 근처 → 차이나타운·용두산공원·광복로 쇼핑 포함

Zone 3 (7km) — SPECIAL
  예시: 교외 지역 → 해동용궁사(7km 이내) 특별 추천
        축제 이벤트 → 이벤트 점수(+40점)로 Zone 3에서도 상위 노출
```

---

## 3. 카테고리 분류 (10개)

사용자가 탭으로 선택 가능한 카테고리입니다.

| # | 카테고리 | 영문 키 | 아이콘 | 연결 데이터 소스 |
|---|---------|---------|--------|----------------|
| 1 | 음식 | `food` | 🍽️ | `places.category = 'food'` |
| 2 | 카페 | `cafe` | ☕ | `places.category = 'cafe'` |
| 3 | 관광지 | `attraction` | 🏛️ | `places.category = 'attraction'` |
| 4 | K-POP | `kpop` | 🎤 | `places.category = 'kpop'` / `events.event_type = 'concert'` |
| 5 | 이벤트 | `event` | 🎉 | `events` 테이블 (TASK-004) 우선 조회 |
| 6 | 산책 | `walking` | 🥾 | `places.category = 'walking'` |
| 7 | 사찰 | `temple` | 🏯 | `places.category = 'temple'` |
| 8 | 야경 | `nightview` | 🌙 | `places.category = 'nightview'` + 시간 필터 |
| 9 | 쇼핑 | `shopping` | 🛍️ | `places.category = 'shopping'` |
| 10 | 우천 | `rainy_day` | ☔ | `places.is_indoor = true` ⚠ 향후 필드 추가 필요 |

> **⚠ 구현 전제조건 (Rainy Day)**: `places.is_indoor` 필드가 현재 스키마에 미정의입니다.
> 해당 카테고리 구현 전 별도 Task를 통해 스키마 확장 승인이 필요합니다.

---

## 4. 후보 풀 생성 로직 (Candidate Pool Generation)

### 4-1. 입력값

```
사용자 GPS       : { lat, lng, accuracy_m }
선택 카테고리    : NearMeCategory | "all"
현재 시각(KST)   : DateTime
trip_items       : string[]  ← 현재 일정에 추가된 place_id 목록
liked_places     : string[]  ← 사용자 좋아요 place_id 목록
visited_moments  : string[]  ← trip_moments의 place_id 목록 (중복 방지용)
```

### 4-2. 1단계 — DB 하드 필터링

```sql
-- places 후보 기본 필터
SELECT p.*
FROM   places p
WHERE  p.is_active           = true
  AND  p.admin_status        = 'approved'
  AND  p.is_map_usable       = true
  AND  p.lat                 IS NOT NULL
  AND  p.lng                 IS NOT NULL
  AND  p.coordinate_quality  IN ('high', 'medium')
  AND  ST_DWithin(
         ST_MakePoint(p.lng, p.lat)::geography,
         ST_MakePoint(:user_lng, :user_lat)::geography,
         :radius_m            -- Zone 1: 1000 / Zone 2: 3000 / Zone 3: 7000
       )
  -- 이미 방문한 장소 제외 (trip_moments 기반)
  AND  p.place_id NOT IN (:visited_moments)

-- 거리 계산 컬럼 추가
, ST_Distance(
    ST_MakePoint(p.lng, p.lat)::geography,
    ST_MakePoint(:user_lng, :user_lat)::geography
  ) AS distance_m
```

> **⚠ 구현 전제조건 (PostGIS)**: `ST_DWithin` / `ST_Distance` 함수는 Supabase에서
> PostGIS 익스텐션이 활성화되어 있어야 합니다. 구현 전 확인이 필요합니다.
> 대안: `lat/lng` 범위 쿼리(Bounding Box)로 1차 필터 후 앱에서 정밀 거리 계산.

### 4-3. 2단계 — 이벤트 조인 (TASK-004 연계)

```sql
-- 활성 이벤트가 있는 장소 식별
LEFT JOIN events e
  ON  e.place_id      = p.place_id
  AND e.is_active     = true
  AND e.is_ai_usable  = true
  AND e.display_until >= NOW()
  AND e.start_date    <= CURRENT_DATE
  AND e.end_date      >= CURRENT_DATE
```

이벤트 조인 결과:
- `e.event_id IS NOT NULL` → 이벤트 점수 +40점 부여
- `e.title`, `e.end_date` → 카드 UI에 이벤트 정보 표시

### 4-4. 3단계 — 카테고리 필터

```
사용자가 카테고리 선택 시:
  WHERE places.category = :selected_category
  (또는 이벤트 카테고리: events.event_type IN (...))

"all" 선택 / 미선택 시:
  카테고리 필터 미적용 → 전체 후보 유지
```

### 4-5. 출력 — raw_candidates

```
필터 통과한 장소·이벤트 목록 (정렬 전 원시 데이터)
  → 이후 Step 5 스코어링 단계에서 점수 계산 후 정렬
```

---

## 5. 스코어링 알고리즘 (Scoring Algorithm)

**총점 = A + B + C + D + E + F + G**

| 항목 | 최대 점수 | 설명 |
|------|---------|------|
| A. 거리 점수 | 100점 | 가까울수록 높음 |
| B. 좌표 품질 | +10 / -20 | GPS 좌표 신뢰도 |
| C. 시간 점수 | 20점 | 현재 시각과 카테고리 궁합 |
| D. 카테고리 점수 | 20점 | 사용자 선택 카테고리 일치 |
| E. 선호도 점수 | 30점 | 좋아요 신호 |
| F. 일정 근접 점수 | 25점 | 기존 일정 동선 최적화 |
| G. 이벤트 점수 | 40점 | 오늘 날짜 활성 이벤트 |

---

### A. 거리 점수 (Distance Score) — 최대 100점

| 거리 범위 | 점수 |
|---------|------|
| 0 ~ 300m | 100점 |
| 301m ~ 700m | 85점 |
| 701m ~ 1,000m (Zone 1 끝) | 70점 |
| 1,001m ~ 2,000m (Zone 2 중간) | 50점 |
| 2,001m ~ 3,000m (Zone 2 끝) | 35점 |
| 3,001m ~ 5,000m (Zone 3 중간) | 20점 |
| 5,001m ~ 7,000m (Zone 3 끝) | 10점 |

```typescript
function distanceScore(distance_m: number): number {
  if (distance_m <= 300)  return 100;
  if (distance_m <= 700)  return 85;
  if (distance_m <= 1000) return 70;
  if (distance_m <= 2000) return 50;
  if (distance_m <= 3000) return 35;
  if (distance_m <= 5000) return 20;
  return 10;
}
```

---

### B. 좌표 품질 보정 (Coordinate Quality)

| `coordinate_quality` | 보정 |
|---------------------|------|
| `'high'` | +10점 |
| `'medium'` | +0점 |
| `'low'` | −20점 (목록 하단으로 밀림) |

> `coordinate_quality = 'low'` 인 장소는 GPS 오차가 크므로 패널티 부여.
> 하드 필터에서 `low`를 제외하지 않는 이유: Zone 3 확장 시 후보 부족 방지.

---

### C. 시간 점수 (Time Context Score) — 최대 20점

현재 시각(KST)과 카테고리 특성을 매칭합니다.

| 시간대 (KST) | 고점수 카테고리 | 점수 |
|------------|--------------|------|
| 06:00 ~ 10:00 | `cafe`, `walking`, `temple` | +15점 |
| 10:00 ~ 17:00 | `attraction`, `kpop`, `shopping` | +10점 |
| 17:00 ~ 21:00 | `food`, `nightview`, `event` | +20점 |
| 21:00 ~ 00:00 | `nightview`, `food` | +15점 |
| 00:00 ~ 06:00 | (전체 카테고리) | 0점 (심야 추천 억제) |

```typescript
function timeScore(category: NearMeCategory, hourKST: number): number {
  if (hourKST >= 6  && hourKST < 10)
    return ["cafe","walking","temple"].includes(category) ? 15 : 0;
  if (hourKST >= 10 && hourKST < 17)
    return ["attraction","kpop","shopping"].includes(category) ? 10 : 0;
  if (hourKST >= 17 && hourKST < 21)
    return ["food","nightview","event"].includes(category) ? 20 : 5;
  if (hourKST >= 21 || hourKST < 6)
    return ["nightview","food"].includes(category) ? 15 : 0;
  return 0;
}
```

> **향후 정밀화**: `places.opening_hours` 필드 추가 후 실제 영업 시간 기반 필터로 교체.
> 현재는 카테고리 특성 기반 시간 점수로 대체합니다.

---

### D. 카테고리 점수 (Category Match Score) — 최대 20점

```
사용자가 카테고리 탭 선택 시:
  해당 카테고리 장소 → +20점 (명시적 의사 표현 반영)

"all" / 미선택 시:
  → 0점 (전체 균등 추천)
```

---

### E. 선호도 점수 (Like Preference Signal) — 최대 30점

```
liked_places에 동일 place_id 존재:
  → +30점  (직접 선호 신호 — 이전 좋아요 장소)

liked_places 목록과 같은 category인 장소:
  → +10점  (간접 선호 신호 — 취향 카테고리 추정)

두 조건 모두 해당 시:
  → +30점만 적용 (중복 합산 금지)
```

> "좋아요 누른 장소가 근처에 있으면 그 사용자 취향과 맞는 동네"라는 추정.

---

### F. 일정 근접 점수 (Itinerary Neighborhood Score) — 최대 25점

```
trip_items (현재 내 일정)에 추가된 place_id 중 하나와
반경 1km 이내에 있는 장소:
  → +25점

목적:
  - 동선 연속성 최적화 (A 장소 다음에 근처 B 장소 추천)
  - AI Scheduler (TASK-012) 연계 핵심 입력값
  - 구역(Zone) 집중 탐색 유도 (교통 이동 최소화)
```

---

### G. 이벤트 점수 (Event Date Match Score) — 최대 40점

```
해당 place_id에 오늘 날짜 기준 활성 이벤트 존재 시:
  events.start_date <= TODAY <= events.end_date
  AND events.is_active = true
  AND events.display_until >= NOW()
  → +40점 (최고 우선순위 부여)

이유:
  - 오늘만 열리는 이벤트·축제는 시간적 희소성이 높음
  - 여행자는 "오늘 근처에서 무슨 일이 있는지" 정보에 높은 가치를 둠
  - 광고 아닌 실질적 정보 제공 → gokoreamate.com 신뢰도 핵심
```

---

### 최종 정렬 규칙

```
1차 정렬: 총점(score) 내림차순
2차 정렬: 거리(distance_m) 오름차순 (동점 시 가까운 순)
3차 정렬: place_id 알파벳 오름차순 (완전 동점 시 안정 정렬)

상위 N개 제한:
  기본 반환: 최대 20개
  이유: 과도한 선택지는 결정 피로(Decision Fatigue)를 유발
```

---

## 6. 출력 포맷 (Output Format)

### 6-1. NearMeCandidate (단일 후보 아이템)

```typescript
type NearMeCategory =
  | "food" | "cafe" | "attraction" | "kpop"
  | "event" | "walking" | "temple" | "nightview"
  | "shopping" | "rainy_day";

type RadiusZone = "close" | "reachable" | "special";

interface NearMeScoreDetail {
  distance:   number;  // A. 거리 점수
  coordinate: number;  // B. 좌표 품질 보정
  time:       number;  // C. 시간 점수
  category:   number;  // D. 카테고리 점수
  preference: number;  // E. 선호도 점수
  itinerary:  number;  // F. 일정 근접 점수
  event:      number;  // G. 이벤트 점수
}

interface NearMeActiveEvent {
  event_id:   string;
  title_en:   string;   // events.title jsonb .en (TASK-004)
  title_ko:   string;   // events.title jsonb .ko
  end_date:   string;   // "YYYY-MM-DD"
}

interface NearMeCandidate {
  // ─ 식별자 ─
  place_id:           string;          // places.place_id FK (절대 place_name 문자열 저장 금지)
  event_id?:          string;          // events.event_id FK (이벤트 있을 때만)

  // ─ 분류 ─
  category:           NearMeCategory;

  // ─ 위치 ─
  lat:                number;
  lng:                number;
  distance_m:         number;          // 사용자 위치로부터 미터 단위 거리
  radius_zone:        RadiusZone;      // 어느 Zone에서 발견되었는지
  coordinate_quality: "high" | "medium" | "low";

  // ─ 스코어링 ─
  score:              number;          // 총점 (A+B+C+D+E+F+G)
  score_detail:       NearMeScoreDetail;

  // ─ 이벤트 정보 (있을 때만) ─
  active_event?:      NearMeActiveEvent;
}
```

### 6-2. NearMeResult (API 응답 전체)

```typescript
interface NearMeUserLocation {
  lat:        number;
  lng:        number;
  accuracy_m: number;   // GPS 정확도 (meters)
}

interface NearMeResult {
  // ─ 후보 목록 ─
  candidates:       NearMeCandidate[];   // 최대 20개, 총점 내림차순

  // ─ 요청 컨텍스트 ─
  user_location:    NearMeUserLocation;
  radius_used_m:    number;              // 실제 사용된 반경 (1000/3000/7000)
  category_filter:  NearMeCategory | "all";
  total_found:      number;              // 필터 통과 총 후보 수 (상한 전)

  // ─ 메타 ─
  generated_at:     string;             // ISO 8601 (KST)
  ai_used:          false;              // Gemini 미사용 — 항상 false
}
```

> **ai_used: false** 는 단순 타입 주석이 아닙니다.
> Near Me 2.0이 AI 환각 없이 검증된 places/events 데이터만 사용함을 API 레벨에서 명시합니다.

---

## 7. 구현 전제조건 체크리스트

Near Me 2.0 실제 구현(별도 Task) 전 확인이 필요한 항목입니다.

| # | 항목 | 현재 상태 | 필요 조치 |
|---|------|---------|---------|
| 1 | PostGIS 활성화 | 미확인 | Supabase 대시보드에서 `postgis` 익스텐션 확인 |
| 2 | `places.coordinate_quality` 필드 | 미확인 | TASK-003 스키마 확인 필요 |
| 3 | `places.is_map_usable` 필드 | 미확인 | TASK-003 스키마 확인 필요 |
| 4 | `places.is_indoor` 필드 | **미정의** | 별도 Task로 스키마 추가 승인 필요 (Rainy Day 카테고리) |
| 5 | `places.opening_hours` 필드 | **미정의** | 별도 Task로 추가 (시간 점수 정밀화) |
| 6 | `events` 테이블 존재 | TASK-004 마이그레이션 적용 필요 | 별도 Task로 마이그레이션 적용 승인 |
| 7 | `navigator.geolocation` 접근 | UI Task에서 구현 필요 | 별도 Task 승인 후 구현 (프라이버시 정책 포함) |

---

## 8. 스코어링 예시 시뮬레이션

**상황**: 사용자가 해운대 해변 근처(Zone 1), 오후 7시, Food 카테고리 선택

### 후보 A — 해운대 횟집 (350m)

| 항목 | 점수 | 근거 |
|------|------|------|
| A. 거리 | 85점 | 350m → 85점 구간 |
| B. 좌표 품질 | +10점 | coordinate_quality = 'high' |
| C. 시간 | +20점 | 17:00~21:00 + food 카테고리 |
| D. 카테고리 | +20점 | 사용자가 Food 선택 |
| E. 선호도 | +30점 | liked_places에 포함 |
| F. 일정 근접 | +0점 | trip_items와 1km 내 없음 |
| G. 이벤트 | +0점 | 활성 이벤트 없음 |
| **총점** | **165점** | |

### 후보 B — 광안리 카페 (2.5km, Zone 2)

| 항목 | 점수 | 근거 |
|------|------|------|
| A. 거리 | 35점 | 2,001~3,000m → 35점 구간 |
| B. 좌표 품질 | +0점 | coordinate_quality = 'medium' |
| C. 시간 | +0점 | 17:00~21:00 구간에서 cafe는 고점수 아님 |
| D. 카테고리 | +0점 | 사용자 Food 선택 ≠ cafe |
| E. 선호도 | +0점 | liked_places에 없음 |
| F. 일정 근접 | +0점 | trip_items와 1km 내 없음 |
| G. 이벤트 | +40점 | 오늘 광안리 야경 페스티벌 이벤트 |
| **총점** | **75점** | 이벤트 덕분에 Zone 2에서 상위 노출 가능 |

**결과**: 후보 A(165점)가 후보 B(75점)보다 상위에 노출.
단, B는 Zone 3 후보보다 높은 점수로 "이벤트 알림" 역할을 수행.

---

## 9. Gemini / AI 사용 정책

```
RULE 1: Near Me 2.0 후보군 생성 단계에서 Gemini Live API 호출 금지
  → 후보 선정은 100% 규칙 기반(Rule-based) 로직

RULE 2: place_name 텍스트를 AI가 생성하거나 저장 금지
  → 반드시 places.place_id FK를 통해 DB에서 조회

RULE 3: AI 역할은 TASK-014 이후 단계에서만 허용
  → 허용 역할: "추천 이유 설명 문장 생성" (검증된 데이터 기반)
  → 금지 역할: 장소 발명, 이벤트 날짜 추정, 검증되지 않은 정보 생성

RULE 4: NearMeResult.ai_used 필드는 항상 false
  → AI 사용 여부를 API 레벨에서 투명하게 명시
```

---

## 10. AI Scheduler (TASK-012) 연계 포인트

Near Me 2.0의 후보군 출력은 향후 Rule-based Scheduler (TASK-012) 의 입력값으로 직결됩니다.

```
[Near Me 2.0 출력]
  candidates: NearMeCandidate[]
      ↓
[AI Scheduler 입력 — TASK-012]
  candidate_pool:
    - place_id, distance_m, score, score_detail
    - itinerary 점수가 높은 후보 → 동선 연속성 우선 배치
    - event 점수가 높은 후보   → fixed_time_event 처리 검토
    - preference 점수가 높은 후보 → Like 신호 기반 개인화
      ↓
[일정 최적화 결과]
  scheduled_items: TripItem[]
```

---

## 11. 향후 개선 예약 (Future Enhancements)

| 항목 | 설명 | 필요 Task |
|------|------|---------|
| `places.opening_hours` | 실제 영업 시간 기반 시간 점수 정밀화 | 별도 스키마 Task |
| `places.is_indoor` | Rainy Day 카테고리 정확한 구현 | 별도 스키마 Task |
| `place_media` 연계 | Near Me 카드에 라이선스 검증된 이미지 표시 | TASK-006 마이그레이션 적용 후 |
| 사용자 방문 이력 | 같은 장소 반복 추천 억제 정교화 | trip_moments 데이터 누적 후 |
| 개인화 가중치 | 사용자별 선호도 점수 가중치 동적 조정 | AI Scheduler 구축 후 |

---

*이 문서는 GoKoreaMate 2.0 Near Me 2.0 후보군 알고리즘 공식 설계 문서입니다.*
*실제 구현은 이 문서를 기반으로 별도 Task 승인 후 진행합니다.*
*GoKoreaMate / gokoreamate.com*
