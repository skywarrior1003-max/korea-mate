# GoKoreaMate — Story Routes 데이터 모델 설계 문서

> 브랜드: GoKoreaMate / gokoreamate.com
> 작성일: 2026-06-17
> Task: TASK-008 — Story Routes 데이터 구조 초안 추가
> Migration: `supabase/migrations/008_route_templates_schema.sql` (Draft — 운영 적용 전 승인 필요)

---

## 1. 핵심 원칙

> **Story Routes는 AI 환각이 아니라 사람이 검증한 완성형 루트다.**

외국인 여행자의 가장 큰 고통은 "어디서 뭘 해야 할지 모르겠다"와 "일정 짜는 게 너무 귀찮다"입니다.
Story Routes는 전문가가 미리 큐레이션한 테마별 완성 루트를 제공해 이 두 고통을 동시에 해결합니다.

그리고 Story Routes는 **AI Scheduler(TASK-013/014)의 핵심 뼈대**입니다.
`stay_minutes`와 `rec_start_time`이 AI 없이도 앱이 지능적으로 작동하게 만들고,
훗날 AI가 이 값들을 그대로 활용해 개인 맞춤 일정을 생성합니다.

---

## 2. 테이블 관계도

```
route_templates (루트 마스터)
       │  (route_id)
       │
       └──── route_template_items ──── places.id        (TASK-003)
                                  └─── events.id        (TASK-004, festival 루트)

       │  [My Trip 추가 시]
       └──── trip_items (added_by = 'route_template')   (TASK-005)

       │  [커버 이미지 — 라이선스 게이트]
       └──── place_media.media_id
                  └── media_licenses (commercial_use_allowed = true)  (TASK-006)
```

---

## 3. Story Routes 예시 목록 (부산 1차 론칭 목표)

| route_id | 제목 | 소요시간 | route_type | 핵심 특징 |
|----------|------|---------|------------|----------|
| `bts-day-busan` | BTS Day in Busan | 하루 | curated | BTS 성지 6곳 동선 최적화 |
| `busan-food-seafood-gukbap` | 부산 먹방 Day | 하루 | curated | 해산물 + 돼지국밥 + 밀면 3대장 |
| `galmaetgil-ocean-walk` | 갈맷길 해안 산책로 | 반나절 | walking-trail | 도보 5km, 오션뷰 연속 |
| `busan-spring-cherry` | 봄 벚꽃 루트 | 반나절 | seasonal | 온천천·대저 벚꽃 시즌 한정 |
| `temple-healing-busan` | 사찰 힐링 Day | 하루 | curated | 해동용궁사 + 범어사 + 고요한 공간 |
| `busan-night-view` | 부산 야경 루트 | 반나절 | night | 광안대교·부산타워·감천문화마을 야경 |
| `busan-rainy-day-indoor` | Rainy Day Busan | 하루 | curated | 비 오는 날 완전 실내 코스 |
| `biff-festival-route` | BIFF 영화제 코스 | 하루 | festival | events 테이블 연동 — 행사 기간만 노출 |

> `festival` 타입은 `route_template_items.event_id`를 통해 `events` 테이블을 직접 참조합니다.
> `events.start_date / end_date` 기간 외에는 앱에 노출하지 않습니다.

---

## 4. route_templates 컬럼 상세

| 컬럼 | 타입 | 역할 |
|------|------|------|
| `route_id` | TEXT UNIQUE | 사람이 읽는 식별자 — 한 번 결정 후 변경 금지 |
| `city` | TEXT | busan / seoul / jeju 등 도시 코드 |
| `title` | JSONB | 다국어 제목 (ko/en/ja/zh) |
| `description` | JSONB | 다국어 설명 |
| `highlight` | JSONB | 카드 노출용 한 줄 태그라인 |
| `mood_tags` | JSONB | 분위기 태그 배열 — Explore 필터 |
| `area_tags` | JSONB | 커버 구역 배열 — Near Me 연동 |
| `route_type` | TEXT | curated/festival/seasonal/walking-trail/night |
| `duration_type` | TEXT | half-day/full-day/multi-day |
| `estimated_min` | INTEGER | 예상 총 소요 시간(분) — AI Scheduler 입력 |
| `difficulty` | TEXT | easy/moderate/challenging |
| `best_season` | JSONB | 추천 계절 배열 (NULL = 연중) |
| `cover_media_id` | UUID NULL | → place_media (라이선스 게이트 필수 통과) |
| `viewer_count` | INTEGER | 홈 화면 인기순 정렬 기준 |
| `admin_status` | TEXT | pending/approved/rejected — approved만 노출 |

---

## 5. route_template_items 컬럼 상세

| 컬럼 | 타입 | 역할 |
|------|------|------|
| `place_id` | UUID NULL | → places.id (장소 정류장) |
| `event_id` | UUID NULL | → events.id (행사 정류장, festival 루트) |
| `item_order` | INTEGER | 정류장 순서 (1, 2, 3...) |
| `rec_start_time` | TIME NULL | 권장 시작 시간 — festival 고정 시간 행사 |
| `stay_minutes` | INTEGER | 권장 체류 시간 — **AI Scheduler 핵심 입력값** |
| `note` | JSONB | 큐레이터 코멘트 (ko/en/ja/zh) |
| `transport_to_next` | JSONB | 다음 정류장 이동 수단 힌트 (ko/en/ja/zh) |
| `is_required` | BOOLEAN | false = 시간 부족 시 AI Scheduler가 생략 가능 |

---

## 6. 정류장 ID 참조 원칙 (절대 원칙)

```
장소 정류장: place_id 설정, event_id = NULL
행사 정류장: event_id 설정, place_id = NULL  (festival 루트만)
둘 다 NULL : 허용 안 함 (CHECK 제약)
이름 문자열로 연결    : 절대 금지
AI가 장소명 직접 작성 : 절대 금지
```

Story Routes는 신뢰의 기반입니다. 검증되지 않은 장소가 하나라도 섞이면 GoKoreaMate 전체 신뢰도가 떨어집니다.

---

## 7. title / description / note — jsonb 다국어 구조 (GoKoreaMate 표준)

```json
{
  "ko": "BTS 성지 전부 여기 있다",
  "en": "Every BTS spot in one day",
  "ja": "BTSの聖地を一日で全部巡る",
  "zh": "一天走遍BTS圣地"
}
```

**왜 jsonb인가:** Story Routes는 TASK-004 events, TASK-007 affiliate_links와 동일한 서비스 공식 콘텐츠입니다. 외국인 대상 ko/en/ja/zh 다국어 동시 지원이 필요하므로 GoKoreaMate 다국어 표준 패턴을 일관 적용합니다. `note_ko`/`note_en` 분리 컬럼 방식은 새 언어 추가 시 스키마 변경이 필요하므로 채택하지 않습니다.

---

## 8. transport_to_next — AI 없이도 완전한 여행 가이드

```json
{
  "ko": "지하철 2호선 해운대역 → 광안리역 (15분, 1,800원)",
  "en": "Subway Line 2: Haeundae → Gwangalli (15 min, ₩1,800)",
  "ja": "地下鉄2号線 海雲台駅 → 広安里駅 (15分)"
}
```

이 컬럼 하나로 앱은 AI 없이 "다음 장소까지 지하철 2호선 타세요"를 4개 언어로 안내할 수 있습니다. AI Scheduler가 구현되기 전까지 gokoreamate.com이 실질적인 여행 도우미로 작동하는 핵심 장치입니다.

마지막 정류장은 `NULL` (귀환 안내는 앱 레벨에서 처리).

---

## 9. cover_media_id — TASK-006 라이선스 게이트 필수 통과

```sql
-- 앱에서 루트 커버 이미지 조회 시 반드시 이 패턴 사용
SELECT rt.*, pm.media_url
FROM route_templates rt
LEFT JOIN place_media pm ON rt.cover_media_id = pm.media_id
LEFT JOIN media_licenses ml ON pm.license_id = ml.id
WHERE rt.admin_status = 'approved'
  AND rt.is_active = true
  AND (rt.cover_media_id IS NULL
       OR (ml.commercial_use_allowed = true AND pm.admin_status = 'approved'))
ORDER BY rt.viewer_count DESC;
```

`cover_image_url TEXT`를 직접 저장하면 라이선스 추적이 불가능합니다. TASK-006에서 확립한 원칙: **라이선스가 확인된 이미지만 DB에 존재할 수 있고, 상업적 사용 허가된 이미지만 앱에 노출합니다.**

---

## 10. AI Scheduler 연동 설계 (TASK-013/014 사전 준비)

```
1단계 (현재): 큐레이터가 route_template_items에 stay_minutes 직접 설정
              → AI 없이도 "BTS Day 예상 8시간" 계산 가능

2단계 (TASK-013): Rule-based Scheduler가 stay_minutes + rec_start_time 읽어 일정 생성
                   is_required = false 정류장을 시간 부족 시 자동 제외

3단계 (TASK-014): AI가 사용자 취향(Like 신호, 과거 여행 패턴)으로 루트 개인화
                   stay_minutes를 기준값으로 ±20% 조정
                   AI는 기존 route_template_items 수정 금지 — 새 trip_items만 생성
```

---

## 11. My Trip 추가 흐름 (trip_items 연동)

```
사용자: [BTS Day in Busan] → "내 여행에 추가" 클릭
              │
              ▼
앱 로직: route_template_items 조회 (item_order ASC)
              │
              ▼
각 정류장을 trip_items에 INSERT:
  trip_items.place_id = rti.place_id
  trip_items.event_id = rti.event_id
  trip_items.added_by = 'route_template'   ← TASK-005 added_by 값
              │
              ▼
trip_sessions에 연결 → My Trip 화면에 전체 일정 표시
```

---

## 12. 향후 연동 계획

| 기능 | 연동 | 예정 Task |
|------|------|----------|
| 홈 화면 StoryRoutes 섹션 | route_templates (viewer_count DESC) | TASK-009/010 |
| Trip Story Card | trip_moments + route_template (출발 루트 정보) | TASK-010 |
| AI Scheduler | stay_minutes, rec_start_time, is_required | TASK-013/014 |
| Near Me 연동 | area_tags @> '["해운대"]' GIN 검색 | TASK-011 |
| festival 루트 자동 숨김 | events.end_date 기준 필터 | TASK-009 |

---

## 13. 절대 금지사항

```
- route_template_items에 장소명 텍스트(place_name TEXT) 직접 저장 금지
  (반드시 검증된 places.id 또는 events.id만 사용)
- cover_image_url TEXT 직접 저장 금지 — 반드시 cover_media_id → place_media 경유
- admin_status = 'pending' 루트를 앱에 노출 금지
- route_id 한 번 결정 후 변경 금지 (trip_items가 이 값에 의존)
- AI가 route_template_items에 직접 데이터 생성 금지
- is_required = true 정류장을 AI가 임의 제거 금지
- 미검증 장소를 큐레이터 판단 없이 추가 금지
- custom_spots를 route_template_items에 연결 금지 (TASK-005 원칙)
- 이 Migration을 Supabase 운영 DB에 직접 실행 금지 (사장님 승인 후 진행)
- gokoreamate 브랜딩이 빠진 문서·코드 작성 금지
```

---

*이 문서는 Draft 설계 기준입니다. 실제 Migration 적용 및 루트 큐레이션 데이터 입력은 사장님 최종 승인 후 진행합니다.*
*GoKoreaMate / gokoreamate.com*
