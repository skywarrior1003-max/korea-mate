# GoKoreaMate — Rule-based Scheduler 설계 문서

> 브랜드: GoKoreaMate / gokoreamate.com
> 작성일: 2026-06-17
> Task: TASK-012 — 규칙 기반 Scheduler 후보군 설계 문서 추가
> 위치: `docs/rule-based-scheduler-design.md`

---

## 1. 개요

Rule-based Scheduler는 gokoreamate 앱의 **자동 일정 생성 오케스트레이터(Orchestrator)** 입니다.

AI(Gemini)가 재활성화되기 전 단계로서, 순수 규칙 기반 **Deterministic Algorithm** 으로 동작합니다. 검증된 `place_id` / `event_id` FK만 사용하며, 장소명 텍스트를 AI가 생성하거나 저장하는 행위를 엔진 레벨에서 차단합니다.

Scheduler는 단독 실행 컴포넌트가 아닙니다. TASK-003 ~ TASK-011에 걸쳐 설계된 모든 데이터 모델의 **통합 오케스트레이터**입니다.

```
TASK-003  places ───────────────────────────┐
TASK-004  events ───────────────────────────┤
TASK-005  trip_sessions / trip_items ───────┤
TASK-007  affiliate_links ──────────────────┼──▶  Rule-based Scheduler  ──▶  ScheduledDay
TASK-008  route_template_items ─────────────┤         (TASK-012)
TASK-011  near_me_candidates ───────────────┘
```

> **핵심 원칙**: Gemini Live API는 이 Scheduler 내에서 호출을 금지합니다.
> 모든 의사결정은 사전 정의된 규칙과 검증된 데이터만으로 수행합니다.

---

## 2. 시스템 컴포넌트 아키텍처 (7-Module Pipeline)

Rule-based Scheduler는 순차 파이프라인 구조의 7개 독립 모듈로 구성됩니다.

```
┌───────────────────────────────────────────────────────────────┐
│                  Rule-based Scheduler Engine                   │
│                     scheduler_version: "rule-based-v1"         │
│                                                               │
│  ┌─────────────────┐   ┌──────────────────────────────────┐  │
│  │ TimelineBuilder │   │        CandidateFilter           │  │
│  │  ─────────────  │   │  ──────────────────────────────  │  │
│  │ 도착~출발 시각  │   │  HC-6: place_id/event_id 필수    │  │
│  │ 기반 시간축 초기화│  │  HC-7: is_active + approved 필터 │  │
│  └────────┬────────┘   └─────────────────┬────────────────┘  │
│           │                              │                   │
│           ▼                              ▼                   │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │                    AnchorPlacer                         │  │
│  │  ─────────────────────────────────────────────────────  │  │
│  │  P1: arrival 슬롯 LOCK  │  P2: departure 슬롯 LOCK     │  │
│  │  P3: fixed_time_event 슬롯 LOCK (충돌 시 ConflictError) │  │
│  └─────────────────────────────┬───────────────────────────┘  │
│                                │                             │
│                                ▼                             │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │            PriorityQueue  +  SlotAllocator              │  │
│  │  ─────────────────────────────────────────────────────  │  │
│  │  P4 itinerary_items → P5 liked_places → P6 near_me     │  │
│  │  Greedy loop: dequeue → ConstraintValidator → allocate  │  │
│  │  ZoneTracker: zone_continuity_bonus 계산                │  │
│  │  TravelTimeEstimator: transit_minutes 산입              │  │
│  └─────────────────────────────┬───────────────────────────┘  │
│                                │                             │
│                                ▼                             │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │                  AffiliateInjector                      │  │
│  │  ─────────────────────────────────────────────────────  │  │
│  │  P7: 잔여 Gap 슬롯 탐색 → placement_context 매칭        │  │
│  │  최대 max_cards 개 삽입 (기본값 2)                      │  │
│  └─────────────────────────────┬───────────────────────────┘  │
│                                │                             │
│                                ▼                             │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │                ConstraintValidator (최종)                │  │
│  │  ─────────────────────────────────────────────────────  │  │
│  │  전체 ScheduledDay 에 대해 HC-1 ~ HC-7 재검증           │  │
│  │  실패 시: unscheduled_items 배열에 제외 사유 기록        │  │
│  └─────────────────────────────┬───────────────────────────┘  │
└───────────────────────────────┼───────────────────────────────┘
                                ▼
                      ScheduledDay  (출력)
```

---

## 3. 입력 데이터 구조 (Scheduler Input Interface)

### 3-1. 도착 / 출발 앵커

```typescript
interface TripAnchor {
  time:      string;   // "HH:MM" KST
  place_id?: string;   // places.place_id FK (공항·역 등) — nullable
}
```

### 3-2. 고정 이벤트 아이템 (Priority 3)

```typescript
interface FixedEventItem {
  event_id:         string;   // events.event_id FK (TASK-004)
  place_id?:        string;   // events.place_id FK
  fixed_start_time: string;   // "HH:MM" — events.fixed_time_event = true 인 경우만
  duration_minutes: number;   // events.estimated_duration or 기본값 60
}
```

### 3-3. 내 일정 아이템 (Priority 4)

```typescript
interface ItineraryItem {
  place_id:        string;   // places.place_id FK — 절대 텍스트 직접 저장 금지
  added_by:        "user" | "route_template";
  preferred_time?: string;   // "HH:MM" — 사용자 선호 시각 (optional soft hint)
}
```

### 3-4. Story Route 체류 시간 참조 (TASK-008)

```typescript
interface RouteTemplateStay {
  place_id:     string;
  stay_minutes: number;    // route_template_items.stay_minutes — 1순위 체류 시간 출처
  is_required:  boolean;   // false = 시간 부족 시 Scheduler 제거 가능
}
```

### 3-5. 제휴 카드 컨텍스트 (TASK-007)

```typescript
interface AffiliateContext {
  placement_context: string;   // affiliate_links.placement_context 매칭 키
  max_cards:         number;   // 일정에 삽입할 최대 제휴 카드 수 (기본값 2)
}
```

### 3-6. Scheduler 전체 입력

```typescript
interface SchedulerInput {
  // 세션 식별
  trip_id:             string;
  schedule_date:       string;              // "YYYY-MM-DD" — 단일 일자 단위 실행

  // Priority 1·2 — 고정 앵커 (절대 이동 불가)
  arrival:             TripAnchor;
  departure:           TripAnchor;

  // Priority 3 — 사용자 확정 시간 고정 이벤트
  fixed_events:        FixedEventItem[];

  // Priority 4 — 내 일정 추가 장소 (trip_items)
  itinerary_items:     ItineraryItem[];

  // Priority 5 — 좋아요 신호
  liked_place_ids:     string[];            // place_id 배열

  // Priority 6 — Near Me 추천 후보 (TASK-011 출력)
  near_me_candidates:  NearMeCandidate[];   // total_score 내림차순 정렬 상태

  // 체류 시간 참조 (TASK-008)
  route_template_stays: RouteTemplateStay[];

  // Priority 7 — 제휴 컨텍스트 (TASK-007)
  affiliate_context:   AffiliateContext;

  // 스케줄링 파라미터
  pace: "relaxed" | "normal" | "packed";
  //    relaxed: stay_minutes × 1.3
  //    normal:  stay_minutes × 1.0
  //    packed:  stay_minutes × 0.8
}
```

---

## 4. 7단계 우선순위 알고리즘 (Priority Queue)

Scheduler는 **7단계 우선순위 큐(Priority Queue)** 를 기반으로 **Greedy 방식**으로 시간 슬롯을 채웁니다. 높은 Priority 항목이 먼저 슬롯을 선점하며, 낮은 Priority 항목은 잔여 슬롯에만 배정됩니다.

| Priority | 항목 | 데이터 소스 | 이동 가능 여부 | is_fixed |
|---------|------|-----------|-------------|---------|
| **P1** | 도착 시각 / 장소 | `trip_sessions.arrival_*` | ❌ 고정 앵커 | `true` |
| **P2** | 출발 시각 / 장소 | `trip_sessions.departure_*` | ❌ 고정 앵커 | `true` |
| **P3** | 사용자 확정 시간 고정 이벤트 | `events` (fixed_time_event=true) | ❌ 고정 앵커 | `true` |
| **P4** | 내 일정 추가 장소 | `trip_items` (TASK-005) | ✅ 순서 조정 가능 | `false` |
| **P5** | 좋아요 선호 장소 | `liked_place_ids` ∩ `near_me_candidates` | ✅ | `false` |
| **P6** | Near Me 추천 장소 | `near_me_candidates` (TASK-011) | ✅ | `false` |
| **P7** | 제휴 컨텍스트 카드 | `affiliate_links` (TASK-007) | ✅ Gap에만 삽입 | `false` |

---

## 5. 모듈별 처리 흐름

### 5-1. TimelineBuilder

```
입력: arrival.time, departure.time
처리:
  1. 가용 시간 계산:
       available_minutes = departure.time(분 변환) - arrival.time(분 변환)
  2. 15분 단위 타임 슬롯 배열 초기화:
       timeline[]: ALL_SLOTS from arrival to departure (ALL = FREE 상태)
  3. arrival 슬롯 상태 → LOCKED_ANCHOR
     departure 슬롯 상태 → LOCKED_ANCHOR
출력: 초기화된 timeline[] (빈 슬롯 배열)
```

### 5-2. CandidateFilter (사전 필터 — AnchorPlacer 이전 실행)

하드 제약 중 DB 조회 없이 판별 가능한 조건을 조기에 필터링합니다.

```
HC-6: place_id IS NOT NULL OR event_id IS NOT NULL
      → 둘 다 null인 후보 제거 (발명 데이터 방지)

HC-7: is_active = true AND admin_status = 'approved'
      → NearMeCandidate에 이미 포함된 값 재확인

조기 필터 통과 후 → AnchorPlacer 로 전달
```

### 5-3. AnchorPlacer (P1 · P2 · P3 처리)

```
Step 1: P1 arrival 앵커 배치
  timeline.lock(arrival.time ~ arrival.time + 15min)
  ScheduledItem(item_type: "arrival", is_fixed: true) 생성

Step 2: P2 departure 앵커 배치
  timeline.lock(departure.time - 15min ~ departure.time)
  ScheduledItem(item_type: "departure", is_fixed: true) 생성

Step 3: P3 fixed_events 순회
  FOR EACH event IN fixed_events (fixed_start_time 오름차순):
    충돌 검사: timeline.isRangeFree(event.fixed_start_time, duration)
    IF 충돌:
      → ConflictError 발생: { conflict_event_id, conflicting_item }
      → Scheduler 실행 중단, 사용자에게 충돌 알림 반환
    ELSE:
      timeline.lock(start, start + duration)
      ScheduledItem(item_type: "fixed_event", is_fixed: true) 생성

출력: 고정 앵커 배치 완료된 timeline[]
```

### 5-4. PriorityQueue 구성 및 SlotAllocator (P4 → P6)

#### 큐 구성

```
Step 1: P4 삽입
  FOR EACH item IN itinerary_items:
    queue.enqueue(item, priority=4)

Step 2: P5 삽입 — 교집합 추출
  liked_set = new Set(liked_place_ids)
  FOR EACH candidate IN near_me_candidates:
    IF liked_set.has(candidate.place_id):
      queue.enqueue(candidate, priority=5)

Step 3: P6 삽입 — 잔여 near_me 후보
  FOR EACH candidate IN near_me_candidates:
    IF NOT already_enqueued(candidate):
      queue.enqueue(candidate, priority=6)
      // near_me_candidates는 이미 TASK-011 total_score 내림차순 정렬 상태
      // → 같은 priority 내에서는 total_score 순 유지
```

#### Greedy Slot Allocation 루프

```
WHILE timeline.hasFreeSlotsAfterAnchor() AND queue.isNotEmpty():

  candidate = queue.dequeue()                    // 최고 Priority → 높은 score 순

  // 체류 시간 결정 (우선순위 적용)
  stay = resolveStayMinutes(candidate, input)    // 섹션 6 참조

  // 구역 연속성 보너스 계산
  zone_bonus = ZoneTracker.calculateBonus(candidate.zone_id)

  // 배정 가능한 최적 시작 시각 탐색
  proposed_start = SlotAllocator.findEarliestFit(stay + travel_buffer)

  // 하드 제약 검증 (HC-1 ~ HC-5)
  IF ConstraintValidator.passes(candidate, proposed_start, stay, timeline):
    // 슬롯 배정
    travel_min = TravelTimeEstimator.estimate(lastItem, candidate)
    timeline.allocate(proposed_start, stay)
    ScheduledItem 생성 후 schedule[] 에 추가
    ZoneTracker.update(candidate.zone_id)
    lastItem = candidate
  ELSE:
    unscheduled_items.push({ place_id: candidate.place_id, reason: "constraint_failed" })
    // 다음 후보로 진행 (폐기, 재시도 없음)

END WHILE
```

---

## 6. 하드 제약 조건 엔진 (Hard Constraint Engine)

`ConstraintValidator` 는 7개의 불변 술어(Predicate)로 구성됩니다. **단 하나라도 false 이면 해당 후보를 즉시 폐기**합니다.

```typescript
type HardConstraint = (
  candidate:      SchedulerCandidate,
  proposed_start: string,   // "HH:MM"
  stay_minutes:   number,
  timeline:       ScheduledItem[],
  input:          SchedulerInput
) => boolean;

const HARD_CONSTRAINTS: HardConstraint[] = [

  // HC-1: 도착 시각 이전 배정 금지
  (c, start, stay, t, i) =>
    start >= i.arrival.time,

  // HC-2: 출발 시각 이후 배정 금지 (end_time 기준)
  (c, start, stay, t, i) =>
    addMinutes(start, stay) <= i.departure.time,

  // HC-3: 고정 앵커와 시간 충돌 금지
  (c, start, stay, t) =>
    !t.filter(s => s.is_fixed)
      .some(s => overlaps(s.start_time, s.end_time, start, addMinutes(start, stay))),

  // HC-4: 동일 place_id 중복 배정 금지
  (c, start, stay, t) =>
    c.place_id === undefined ||
    !t.some(s => s.place_id === c.place_id),

  // HC-5: 시간 슬롯 중복(Overlap) 금지
  (c, start, stay, t) =>
    !t.some(s => overlaps(s.start_time, s.end_time, start, addMinutes(start, stay))),

  // HC-6: 검증된 FK 필수 — 발명된 place_name 텍스트 배정 금지
  (c) =>
    c.place_id !== undefined || c.event_id !== undefined,

  // HC-7: 활성 및 승인 상태 장소만 허용
  (c) =>
    c.is_active === true && c.admin_status === "approved",
];

// 헬퍼 함수 (시그니처 정의)
function overlaps(s1: string, e1: string, s2: string, e2: string): boolean;
function addMinutes(time: string, minutes: number): string;
```

---

## 7. 체류 시간 결정 로직 (Stay Minutes Resolution)

`resolveStayMinutes()` 는 아래 우선순위로 체류 시간을 결정합니다.

```
1순위: route_template_stays[place_id].stay_minutes
       (TASK-008 route_template_items — 큐레이터 검증값)

2순위: 카테고리별 기본값 × pace 계수 (아래 표)

3순위: 전역 기본값 60분 × pace 계수
```

| 카테고리 | 기본값 | relaxed (×1.3) | normal (×1.0) | packed (×0.8) |
|---------|-------|---------------|--------------|--------------|
| attraction | 75분 | 98분 | 75분 | 60분 |
| food | 60분 | 78분 | 60분 | 48분 |
| cafe | 40분 | 52분 | 40분 | 32분 |
| temple | 60분 | 78분 | 60분 | 48분 |
| walking | 45분 | 59분 | 45분 | 36분 |
| nightview | 40분 | 52분 | 40분 | 32분 |
| kpop | 60분 | 78분 | 60분 | 48분 |
| shopping | 60분 | 78분 | 60분 | 48분 |
| event (fixed) | duration_minutes 그대로 사용 — pace 보정 없음 |

> **TASK-008 연계**: `route_template_items.is_required = false` 인 아이템은
> 잔여 가용 시간이 부족할 경우 Scheduler가 제거(skip)할 수 있습니다.
> `is_required = true` 인 아이템은 HC-2 충돌 시 ConflictError 발생.

---

## 8. 이동 시간 추정 (TravelTimeEstimator)

`TravelTimeEstimator.estimate(prev, next)` 는 연속 아이템 간 이동 시간을 추정합니다.

```
입력: prev 아이템의 lat/lng, next 후보의 lat/lng (places 테이블 조회)
     또는 next.distance_m (TASK-011 near_me_candidates에 포함된 경우 재사용)

이동 시간 추정 테이블:

  distance_m ≤ 500    → 도보:           8분
  distance_m ≤ 1,000  → 도보:          15분
  distance_m ≤ 3,000  → 버스 / 택시:   20분
  distance_m ≤ 7,000  → 택시 / 지하철: 30분
  distance_m  > 7,000 → 교통수단 필수: 40분

이동 슬롯 삽입:
  prev.end_time ~ next.proposed_start_time 사이에
  ScheduledItem(item_type: "transit", stay_minutes: transit_minutes) 삽입
```

> **향후 정밀화 (별도 Task)**: 대중교통 API(카카오맵·TMAP) 연동 시
> 실시간 소요 시간으로 TravelTimeEstimator 교체. 현재는 거리 기반 추정값 사용.

---

## 9. 구역 연속성 모듈 (ZoneTracker)

**Zone Continuity** 는 동선 최적화를 위해 같은 행정구역 내 장소를 연속 배치합니다.

### 9-1. Zone 식별자 정의

```
zone_id = places.district (구/동 단위, 예: "해운대구", "수영구", "중구")
near_me_candidates.zone_id = places.district 에서 파생
```

### 9-2. Zone Continuity 보너스 계산

```typescript
class ZoneTracker {
  private currentZone: string | null = null;

  calculateBonus(candidateZone: string): number {
    if (this.currentZone === null) return 0;          // 첫 아이템: 보너스 없음
    if (candidateZone === this.currentZone) return 15; // 동일 구역: +15점 (소프트 점수)
    return 0;                                          // 구역 전환: 페널티 없음
  }

  update(zone: string): void {
    this.currentZone = zone;
  }
}
```

### 9-3. 역방향 동선 방지 원칙

```
Zone 전환 순서 예시 (부산):
  해운대구 → 수영구 → 남구 → 중구   ← 단방향 이동 (권장)
  해운대구 → 중구 → 해운대구         ← 역방향 이동 (Zone Continuity가 억제)

억제 메커니즘:
  already_visited_zones = Set<string>
  후보의 zone_id가 already_visited_zones 에 있으면:
    zone_continuity_bonus = -10점 (역방향 소프트 페널티)
  단, HC는 아님 — 점수로만 억제하며 강제 배제하지 않음
  (P3~P4 아이템은 역방향이어도 배정 필요할 수 있음)
```

---

## 10. 제휴 카드 삽입 모듈 (AffiliateInjector — Priority 7)

```
실행 시점: P4 ~ P6 배정 완료 후 잔여 Gap 탐색

삽입 조건:
  1. 연속된 FREE 슬롯 ≥ 15분 존재
  2. 해당 시간대 placement_context 가
     affiliate_links.placement_context[] 와 교집합 존재
  3. 고정 앵커 직전·직후 30분 이내 구간 제외
  4. 현재 삽입된 제휴 카드 수 < max_cards

placement_context 매핑 규칙:
  일정 시작 전 Gap   → "esim", "transport"
  관광지 사이 Gap    → "activity", "map-tip"
  식사 전후 Gap      → "payment-tip"
  일정 종료 전 Gap   → "stay"

삽입 후 출력:
  ScheduledItem(item_type: "affiliate",
                affiliate_link_id: string,    // FK — 실제 URL 노출 금지 (TASK-007 정책)
                stay_minutes: 0,              // 체류 시간 없음 (정보 카드)
                is_fixed: false)
```

---

## 11. 출력 데이터 구조 (Scheduler Output Interface)

### 11-1. 스케줄 아이템 타입

```typescript
type SchedulerItemType =
  | "arrival"       // P1 — 도착
  | "departure"     // P2 — 출발
  | "fixed_event"   // P3 — 고정 이벤트
  | "itinerary"     // P4 — 내 일정 추가 장소
  | "liked_place"   // P5 — 좋아요 선호 장소
  | "near_me"       // P6 — Near Me 추천 장소
  | "affiliate"     // P7 — 제휴 컨텍스트 카드
  | "transit";      // 구역 전환 이동 슬롯

type SchedulerDataSource =
  | "trip_session"    // TASK-005 trip_sessions
  | "events"          // TASK-004
  | "trip_items"      // TASK-005 trip_items
  | "route_template"  // TASK-008 route_template_items
  | "near_me"         // TASK-011 NearMeCandidate
  | "affiliate_links" // TASK-007
  | "system";         // transit 슬롯 등 내부 생성
```

### 11-2. 단일 스케줄 아이템

```typescript
interface ScheduledItem {
  slot_order:               number;

  // 타입 및 출처
  item_type:                SchedulerItemType;
  source:                   SchedulerDataSource;
  priority_level:           1 | 2 | 3 | 4 | 5 | 6 | 7;

  // FK 참조 — 세 필드 중 하나 이상 필수 (HC-6)
  // 텍스트 place_name 직접 저장 절대 금지
  place_id?:                string;          // places.place_id FK
  event_id?:                string;          // events.event_id FK
  affiliate_link_id?:       string;          // affiliate_links.id FK

  // 시간
  start_time:               string;          // "HH:MM" KST
  end_time:                 string;          // "HH:MM" KST
  stay_minutes:             number;
  travel_minutes_from_prev: number;          // TravelTimeEstimator 산출값

  // 배치 메타
  is_fixed:                 boolean;
  zone_id:                  string;          // places.district 값
  stay_source:              "route_template" | "category_default" | "global_default";
}
```

### 11-3. 하루 일정 전체 출력

```typescript
interface ScheduledDay {
  // 식별
  trip_id:               string;
  schedule_date:         string;          // "YYYY-MM-DD"

  // 배정 결과
  items:                 ScheduledItem[];

  // 집계 통계
  total_places:          number;          // transit, affiliate 제외 카운트
  total_events:          number;
  total_travel_minutes:  number;
  total_stay_minutes:    number;
  zones_visited:         string[];        // zone_id 방문 순서 배열

  // 제외 항목 기록 (디버깅 및 사용자 알림용)
  unscheduled_items: {
    place_id?:  string;
    event_id?:  string;
    reason:     "constraint_failed" | "time_insufficient" | "conflict";
  }[];

  // 메타
  ai_used:               false;                // Gemini 미사용 — 항상 false
  scheduler_version:     "rule-based-v1";
  generated_at:          string;               // ISO 8601 KST
  pace_applied:          "relaxed" | "normal" | "packed";
}
```

---

## 12. 시뮬레이션 예시 (부산 1일 일정)

**입력 조건**:
- 도착: 09:00 (KTX 부산역)
- 출발: 20:00 (공항)
- 고정 이벤트: 부산 국제 영화제 상영 14:00 (2시간)
- 내 일정: 해동용궁사
- 좋아요 장소: 광안리 해변
- pace: normal

**예상 출력 (ScheduledDay.items 순서)**:

| slot_order | item_type | start_time | end_time | place/event | zone |
|-----------|-----------|-----------|---------|------------|------|
| 1 | arrival | 09:00 | 09:15 | 부산역 (place_id) | 동구 |
| 2 | transit | 09:15 | 09:35 | (이동 20분) | — |
| 3 | near_me | 09:35 | 10:35 | 자갈치시장 (place_id) | 중구 |
| 4 | transit | 10:35 | 10:50 | (이동 15분) | — |
| 5 | itinerary | 10:50 | 11:50 | 해동용궁사 (place_id) | 기장군 |
| 6 | transit | 11:50 | 12:20 | (이동 30분) | — |
| 7 | near_me | 12:20 | 13:20 | 식당 A (place_id) | 해운대구 |
| 8 | transit | 13:20 | 13:40 | (이동 20분) | — |
| 9 | affiliate | 13:40 | 13:55 | activity 카드 | — |
| 10 | fixed_event | 14:00 | 16:00 | BIFF 상영 (event_id) | 중구 |
| 11 | transit | 16:00 | 16:15 | (이동 15분) | — |
| 12 | liked_place | 16:15 | 17:15 | 광안리 해변 (place_id) | 수영구 |
| 13 | near_me | 17:15 | 18:15 | 광안리 카페 (place_id) | 수영구 |
| 14 | near_me | 18:30 | 19:30 | 광안리 횟집 (place_id) | 수영구 |
| 15 | departure | 19:45 | 20:00 | 공항 (place_id) | 강서구 |

> **Zone Continuity 작동**: slot 12·13·14 모두 "수영구" — 광안리에서 구역 집중 탐색.
> **HC-3 작동**: slot 9 제휴 카드를 14:00 fixed_event 30분 전(13:30)까지만 허용.

---

## 13. AI 역할 경계 정의

```
현재 단계 (TASK-012 Rule-based Scheduler):
  ✅ 허용: 규칙 기반 100% 알고리즘으로 일정 생성
  ✅ 허용: place_id / event_id FK 기반 장소 참조
  ❌ 금지: Gemini Live API 호출
  ❌ 금지: 검증되지 않은 장소명 텍스트 생성
  ❌ 금지: 이벤트 날짜·시간 추정 또는 생성

TASK-014 이후 (AI 개인화 레이어 — 별도 Task 승인 필요):
  ✅ 허용: 추천 이유 설명 문장 생성 (검증된 place_id 기반 데이터만 사용)
  ✅ 허용: 대안 장소 제안 (반드시 places 테이블의 place_id FK 사용)
  ❌ 영구 금지: 검증 안 된 place_id / event_id 생성
  ❌ 영구 금지: ScheduledDay에 존재하지 않는 장소 언급
```

```typescript
// ScheduledDay.ai_used 필드 정책
// Rule-based 단계: 항상 false
const output: ScheduledDay = {
  // ...
  ai_used: false,           // Gemini 미사용 명시 — API 레벨에서 투명하게 표시
  scheduler_version: "rule-based-v1",
  // TASK-014 이후: ai_used: true, ai_model_id: "gemini-2.0-flash" 추가
};
```

---

## 14. 타 Task 연계 포인트 매트릭스

| Task | 제공 데이터 | Scheduler 내 역할 | 연계 모듈 |
|------|-----------|-----------------|---------|
| TASK-003 | `places` | `place_id` FK 원천, `is_active` / `admin_status` / `district` | CandidateFilter, HC-7, ZoneTracker |
| TASK-004 | `events` | P3 고정 앵커, `fixed_time_event`, `display_until` | AnchorPlacer |
| TASK-005 | `trip_sessions`, `trip_items` | P1·P2 도착/출발 앵커, P4 내 일정 후보 | TimelineBuilder, PriorityQueue |
| TASK-007 | `affiliate_links` | P7 제휴 카드, `placement_context` 매칭 | AffiliateInjector |
| TASK-008 | `route_template_items` | `stay_minutes` 1순위 출처, `is_required` skip 여부 | SlotAllocator |
| TASK-011 | `NearMeCandidate[]` | P5·P6 후보 풀, `total_score` 정렬 유지, `distance_m` 이동 추정 | PriorityQueue, TravelTimeEstimator |

---

## 15. 구현 전제조건 체크리스트

Rule-based Scheduler 실제 구현(별도 Task) 전 확인이 필요한 항목입니다.

| # | 항목 | 현재 상태 | 필요 조치 |
|---|------|---------|---------|
| 1 | `events` 테이블 마이그레이션 적용 | DRAFT (TASK-004) | 별도 Task로 적용 승인 |
| 2 | `route_templates` 마이그레이션 적용 | DRAFT (TASK-008) | 별도 Task로 적용 승인 |
| 3 | `trip_sessions` 마이그레이션 적용 | DRAFT (TASK-005) | 별도 Task로 적용 승인 |
| 4 | `places.district` 필드 존재 여부 | 미확인 | TASK-003 스키마 확인 |
| 5 | `places.is_map_usable` 필드 | 미확인 | TASK-003 스키마 확인 |
| 6 | PostGIS 활성화 (`ST_Distance`) | 미확인 | TASK-011과 동일 요건 |
| 7 | `events.fixed_time_event` 필드 | DRAFT에 설계됨 | 마이그레이션 적용 후 확인 |
| 8 | 대중교통 API (TravelTimeEstimator 고도화) | 미연동 | 별도 Task — 현재는 거리 기반 추정 |

---

## 16. 3단계 진화 로드맵 (TASK-008 stay_minutes 설계 목표와 연계)

```
Stage 1 — 현재 (TASK-012)
  Rule-based Scheduler v1
  stay_minutes: route_template_items 또는 카테고리 기본값
  스코어링: 7-Priority Greedy + 7-HardConstraint
  AI 사용: 없음 (ai_used: false)

Stage 2 — TASK-013 (별도 Task)
  Rule-based Scheduler 실제 구현 (src/ 코드 작성)
  Supabase 쿼리 연결
  ScheduledDay API 엔드포인트 구현
  UI: 자동 생성 일정 미리보기 화면

Stage 3 — TASK-014 이후 (별도 Task)
  AI 개인화 레이어 추가
  stay_minutes: 사용자 이력 기반 동적 조정
  추천 이유 문장: Gemini 생성 (검증된 데이터만)
  ai_used: true, ai_model_id 명시
  Gemini Live API 재활성화 — 별도 Task 명시적 승인 필수
```

---

*이 문서는 GoKoreaMate 2.0 Rule-based Scheduler v1 공식 설계 문서입니다.*
*실제 구현(src/ 코드 작성)은 이 문서를 기반으로 별도 Task 승인 후 진행합니다.*
*GoKoreaMate / gokoreamate.com*
