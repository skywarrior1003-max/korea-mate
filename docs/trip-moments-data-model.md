# GoKoreaMate — Trip Moments / GPS 데이터 모델 설계 문서

> 브랜드: GoKoreaMate / gokoreamate.com  
> 작성일: 2026-06-17  
> Task: TASK-005 — Trip Moments / GPS 데이터 모델 초안 추가  
> Migration: `supabase/migrations/005_trip_moments_schema.sql` (Draft — 운영 적용 전 승인 필요)

---

## 1. 핵심 원칙

> **My Trip은 단순 장소 목록이 아니라 사용자의 여행기 원본 데이터다.**

Trip Moments는 사용자가 여행 중에 남기는 사진·코멘트·GPS·공유 설정의 집합입니다.  
이 데이터는 나중에 Trip Story Card(9:16 공유 카드)의 원재료가 됩니다.  
GoKoreaMate는 이 데이터를 가장 소중하게 다루며, **프라이버시를 기본값으로** 설계합니다.

---

## 2. 테이블 관계도

```
trip_sessions (여행 세션)
    │  (trip_id)
    ├──── trip_items ──── places.id      (공식 장소 추가)
    │                └─── events.id      (행사 추가)
    │
    ├──── custom_spots                   (사용자 직접 추가 장소)
    │         │ (custom_spot_id)
    │         │
    └──── trip_moments ── places.id      (공식 장소와 연결)
                      └── custom_spots   (사용자 장소와 연결)
```

---

## 3. 테이블별 역할 요약

| 테이블 | 역할 |
|--------|------|
| `trip_sessions` | 여행 세션 원본. 비로그인 익명 세션도 지원. |
| `trip_items` | My Trip 일정 구성. place_id 또는 event_id 기준으로만 추가. |
| `custom_spots` | places에 없는 사용자만의 장소. AI 참조 및 생성 금지. |
| `trip_moments` | 여행 추억 기록. 사진·코멘트·GPS·공유 설정 포함. |

---

## 4. title / comment 설계 — plain text (jsonb 미적용)

TASK-004의 `events.title`은 서비스 공식 콘텐츠로 외국인에게 노출되므로 **jsonb 다국어 구조**를 채택했습니다.

그러나 `trip_moments`의 `title`과 `comment`는 성격이 다릅니다.

| 구분 | events (TASK-004) | trip_moments (TASK-005) |
|------|------------------|------------------------|
| 데이터 성격 | 서비스 공식 콘텐츠 | 사용자 개인 추억 메모 |
| 열람 대상 | 모든 외국인 사용자 | 기본적으로 본인만 |
| 다국어 필요 | ✔ (ko/en/ja/zh 모두 필요) | ✗ (본인 언어로 직접 입력) |
| 타입 결론 | `jsonb` | `text` (plain) |

**결론:** 사용자가 한국어로 "생애 첫 해물찜!"이라고 적든, 영어로 "Amazing haemul jjim!"이라고 적든, 그 자체가 추억입니다. 번역이 필요한 데이터가 아닙니다.

---

## 5. 프라이버시 정책 (핵심)

GoKoreaMate의 GPS 및 Trip Moments 기본 원칙은 **프라이버시 퍼스트**입니다.

### 5-1. 기본값 정책

| 설정 | 기본값 | 의미 |
|------|--------|------|
| `visibility` | `private` | 생성 즉시 본인만 볼 수 있음. 명시적 선택 없이 공개 불가. |
| `share_location_level` | `hidden` | SNS 공유 시 위치 정보 일절 미공개. |
| `include_in_share_card` | `false` | Trip Story Card에 자동 포함되지 않음. |

### 5-2. 위치 공개 수준 3단계

| `share_location_level` | 공개 내용 | 활성화 조건 |
|------------------------|-----------|-------------|
| `hidden` | 위치 정보 전혀 없음 | 기본값 |
| `neighborhood` | "해운대 근처" 수준의 동네 정보 | 사용자 명시 선택 |
| `exact` | GPS 좌표 또는 정확한 주소 | 사용자 명시 선택 + 경고 표시 권장 |

### 5-3. GPS 정책 원칙

```
GPS는 정밀 주소 보증이 아니라
사용자가 다시 찾아갈 수 있는 추억의 힌트로 사용합니다.
```

| 원칙 | 내용 |
|------|------|
| GPS 정확도 저장 | `gps_accuracy_m` 필드로 정확도(미터) 기록 |
| 위치 획득 방식 | `geo_source`: `gps`(자동) / `manual`(직접 수정) / `place`(공식 장소 좌표 상속) |
| 사람 읽기용 레이블 | `address_label`: "해운대 해수욕장 근처" 수준으로만 저장 |
| 지도 앱 연동 | 나중에 Google Maps / Naver Maps 딥링크로 열기 가능 |

### 5-4. 사진 EXIF 처리

```
사용자가 사진을 업로드하면 gokoreamate.com 서버에서 EXIF 위치 정보를 제거한 뒤 저장합니다.
촬영 위치가 의도치 않게 공개되는 것을 원천 차단합니다.
```

---

## 6. trip_sessions — 익명 세션 지원

GoKoreaMate는 **로그인을 강제하지 않습니다.**

```
user_id = UUID  → 로그인한 사용자의 세션
user_id = NULL  → 익명(비로그인) 세션
```

| 시나리오 | user_id | 동작 |
|----------|---------|------|
| 비로그인 상태로 일정 생성 | NULL | 세션 토큰으로 식별 |
| 나중에 로그인 | UUID 업데이트 | 기존 여행 데이터 연결 |
| 계정 삭제 | SET NULL | 세션 보존 (데이터 유실 방지) |

---

## 7. trip_items — ID 기준 연결 원칙

```
장소 추가: place_id 설정, event_id = NULL
행사 추가: event_id 설정, place_id = NULL
둘 다 NULL: 허용 안 함 (CHECK 제약)
이름으로 연결: 절대 금지
```

`added_by` 값에 따른 UX:

| `added_by` | 설명 |
|------------|------|
| `user` | 사용자가 직접 추가 |
| `ai` | AI Scheduler가 제안하여 추가 |
| `route_template` | Story Route 기반으로 추가 |

---

## 8. custom_spots — places와의 분리 원칙

| 원칙 | 내용 |
|------|------|
| AI 참조 금지 | AI Scheduler는 custom_spots를 일정 후보로 사용하지 않음 |
| AI 생성 금지 | AI가 custom_spots에 직접 데이터 생성 금지 |
| places 혼용 금지 | custom_spots를 places 테이블에 병합하거나 교차 참조 금지 |
| 소유권 | 해당 trip_id를 가진 사용자만 접근 가능 |

---

## 9. Trip Story Card 연동

`include_in_share_card = true`로 설정된 Trip Moments만 Trip Story Card(9:16 공유 카드)에 포함됩니다.

```sql
-- Trip Story Card 후보 조회
SELECT * FROM trip_moments
WHERE trip_id = 'busan-2026-oct-u7k2'
  AND include_in_share_card = true
ORDER BY visit_time;
```

Trip Story Card 설계는 TASK-010에서 진행합니다.

---

## 10. 향후 연동 계획

| 기능 | 연동 테이블 | 예정 Task |
|------|------------|----------|
| Trip Story Card | `trip_moments` (include_in_share_card) | TASK-010 |
| AI Scheduler | `trip_sessions` (arrival/departure), `trip_items` | TASK-013/014 |
| 미디어 라이선스 | `place_media`, `media_licenses` | TASK-006 |
| 스토리 루트 | `trip_items` (added_by = route_template) | TASK-008 |
| Near Me 2.0 | `trip_items` 동선 기반 추천 | TASK-010 |

---

## 11. 절대 금지사항

```
- upload UI 구현 금지 (이 Task는 스키마 설계만)
- 실제 사용자 GPS 데이터 저장 금지 (테스트 포함)
- share_location_level = exact를 기본값으로 설정 금지
- custom_spots를 AI Scheduler 입력으로 사용 금지
- places 테이블에 custom_spots 데이터 혼입 금지
- 이 Migration을 Supabase 운영 DB에 직접 실행 금지 (사장님 승인 후 진행)
```

---

*이 문서는 Draft 설계 기준입니다. 실제 Migration 적용은 데스크탑(관제탑) 검토 및 사장님 최종 승인 후 진행합니다.*  
*GoKoreaMate / gokoreamate.com*
