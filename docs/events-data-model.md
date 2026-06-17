# GoKoreaMate — Events 데이터 모델 설계 문서

> 브랜드: GoKoreaMate / gokoreamate.com  
> 작성일: 2026-06-17  
> Task: TASK-004 — Events 데이터 모델 초안 추가  
> Migration: `supabase/migrations/004_events_schema.sql` (Draft — 운영 적용 전 승인 필요)

---

## 1. 핵심 원칙

> **Events는 단순 콘텐츠 카드가 아니라 날짜 기반 핵심 여행 데이터다.**

GoKoreaMate에서 행사(Events)는 외국인 여행자의 방문 날짜와 직접 연결되는 데이터입니다.  
축제·콘서트·전시·마켓이 여행의 주목적이 되는 경우가 많으며, AI Scheduler와 My Trip이 이 테이블을 핵심 입력으로 사용합니다.

---

## 2. 다국어 설계 — jsonb 주머니 구조

GoKoreaMate는 초기에는 영어 중심으로 시작하지만, 일본어·중국어·스페인어 등 다국어 확장을 유연하게 지원하기 위해 `title`과 `description` 컬럼을 **jsonb 타입**으로 설계합니다.

### 구조 예시

```json
// title 필드
{
  "ko": "부산 불꽃축제 2026",
  "en": "Busan Fireworks Festival 2026",
  "ja": "釜山花火祭り 2026",
  "zh": "釜山烟火节 2026",
  "es": "Festival de Fuegos Artificiales de Busan 2026"
}

// description 필드
{
  "ko": "매년 10월 광안리 해변에서 열리는 대규모 불꽃축제. 약 100만 명이 방문.",
  "en": "Large-scale fireworks festival at Gwangalli Beach every October. ~1M visitors.",
  "ja": "毎年10月に広安里海岸で開催される大規模な花火祭り。約100万人が訪れる。"
}
```

### 언어 키 규칙

| 규칙 | 내용 |
|------|------|
| 키 형식 | ISO 639-1 코드 (`ko`, `en`, `ja`, `zh`, `fr`, `es`, ...) |
| 표시 우선순위 | 요청 언어 → `en` → `ko` → 첫 번째 키 값 |
| 필수 언어 | `ko` 또는 `en` 중 하나 이상 필수 |
| 새 언어 추가 | 스키마 변경 없이 JSON 키만 추가 — 마이그레이션 불필요 |
| 번역 부재 시 | fallback 언어로 표시, 빈 문자열 저장 금지 |

### 앱에서 다국어 조회 예시 (PostgreSQL)

```sql
-- 사용자 언어가 'ja'인 경우
SELECT
  COALESCE(title->>'ja', title->>'en', title->>'ko') AS title_display
FROM events
WHERE admin_status = 'approved' AND is_active = true;
```

---

## 3. "Happening during your trip" 추천 로직

GoKoreaMate의 핵심 UX 중 하나입니다.

```
사용자 trip_start_date  ≤  event.end_date
AND
사용자 trip_end_date    ≥  event.start_date
→ "Happening during your trip" 배지 표시
→ AI Scheduler 우선 후보에 포함
→ Events 탐색 화면 상단 고정
```

### 예시

| 사용자 여행 기간 | 행사 기간 | 결과 |
|----------------|-----------|------|
| 10/23 ~ 10/27 | 10/24 ~ 10/25 | ✔ Happening during your trip |
| 10/23 ~ 10/27 | 10/20 ~ 10/23 | ✔ Happening during your trip (10/23 겹침) |
| 10/23 ~ 10/27 | 10/28 ~ 10/30 | ✗ 해당 없음 |

---

## 4. display_until 자동 숨김 규칙

`display_until`은 종료일 이후에도 여운 기간을 두거나, 반대로 일찍 숨길 수 있는 유연한 필드입니다.

| 상황 | 처리 방식 |
|------|----------|
| `CURRENT_DATE > display_until` | 기본 Events 목록, Explore 탭에서 자동 숨김 |
| My Trip에 저장된 행사 | 숨기지 않음 — **"Past Event"** 라벨로 표시 |
| `is_active = false` | 모든 화면에서 즉시 숨김 (소프트 삭제) |
| `admin_status ≠ 'approved'` | 공개 목록 노출 안 함 |

### display_until 설정 가이드

```
display_until = end_date         → 종료 당일 자정부터 숨김 (기본)
display_until = end_date + 3일   → 여운 기간 제공 (축제 여운 검색 대응)
display_until = start_date - 1일 → 사전 공지 후 바로 숨겨야 할 경우
```

---

## 5. fixed_time_event — Scheduler 시간 고정 규칙

`fixed_time_event = true`로 설정된 행사는 AI Scheduler와 Rule-based Scheduler 모두에서 **시간 고정(Lock)** 처리됩니다.

```
fixed_time_event = true + start_time + end_time 존재
→ 해당 시간대: 다른 장소 배치 불가
→ AI는 이 시간대를 기준점으로 전후 동선 최적화
→ 사용자에게 "이 행사는 시간이 고정되어 있습니다" 안내 표시

fixed_time_event = false (기본값)
→ Scheduler가 시간대를 유연하게 조정 가능
→ 종일 행사, 상시 행사에 적용
```

### 적용 예시

| 행사 | fixed_time_event | 이유 |
|------|-----------------|------|
| BTS 콘서트 | `true` | 정확한 공연 시간 존재 |
| 부산 불꽃축제 | `true` | 야간 특정 시각에만 진행 |
| 광안리 해수욕장 개장 | `false` | 하루 종일 상시 운영 |
| 크리스마스 마켓 | `false` | 기간 중 자유 방문 |

---

## 6. 공식 데이터 출처 요건

GoKoreaMate Events의 데이터 품질은 공식 소스에 의존합니다. **검증되지 않은 비공식 소스는 절대 허용하지 않습니다.**

### 허용 source 목록

| source 값 | 설명 |
|-----------|------|
| `visit-busan` | visitbusan.com 공식 일정 데이터 |
| `korean-tourism-api` | 한국관광공사 공식 API |
| `busan-metro` | 부산시 공식 문화 행사 데이터 |
| `manual` | GoKoreaMate 운영자 직접 입력 (공식 확인 후) |
| 기타 공식 API | 시·구청, 공공기관 공식 API 한정 |

### 금지 source 목록

| 금지 source | 이유 |
|-------------|------|
| 블로그 크롤링 | 정확도·저작권 보장 불가 |
| 인스타그램·SNS 게시물 | 비공식, 오정보 위험 |
| 네이버·구글 검색 결과 | 2차 가공 데이터 |
| 미확인 제3자 사이트 | 책임 소재 불명 |

### 이벤트 소스 검증 절차

```
1. official_url 확인 → 공식 기관 도메인인지 검증
2. 날짜 정보 공식 페이지와 대조
3. admin_status = 'pending' → 운영자 검토 → 'approved' 전환
4. is_ai_usable = true 활성화는 운영자 개별 판단
```

---

## 7. My Trip 연동 원칙

| 상황 | 처리 |
|------|------|
| 행사를 일정에 추가 | `trip_items` 테이블에 `event_id` 기준으로 저장 |
| 행사가 진행 중 | 정상 표시 |
| `display_until` 경과 후 | My Trip에서 **"Past Event"** 라벨 표시 (자동 삭제 금지) |
| 행사가 `is_active = false`로 변경 | My Trip 항목에 **"Cancelled"** 라벨 표시 (삭제 금지) |

---

## 8. 향후 연동 계획

| 기능 | 연동 테이블 | 예정 Task |
|------|------------|----------|
| 제휴 링크 연결 | `affiliate_links` | TASK-007 |
| 미디어/이미지 | `place_media`, `media_licenses` | TASK-006 |
| AI Scheduler 후보 | `candidate_pool` | TASK-013/014 |
| 여행 일정 연동 | `trip_sessions`, `trip_items` | TASK-005 |
| 스토리 루트 연동 | `route_template_items` | TASK-008 |

---

## 9. 절대 금지사항

```
- 비공식 소스 데이터 입력 금지
- 라이선스 미확인 이미지를 image_url에 설정 금지
- 이름(title 텍스트)만으로 places와 연결 금지 — place_id 기준만 허용
- is_ai_usable = true를 무분별하게 설정 금지
- 운영자 승인 없이 admin_status = 'approved' 처리 금지
- 이 Migration을 Supabase 운영 DB에 직접 실행 금지 (사장님 승인 후 진행)
```

---

*이 문서는 Draft 설계 기준입니다. 실제 Migration 적용은 데스크탑(관제탑) 검토 및 사장님 최종 승인 후 진행합니다.*  
*GoKoreaMate / gokoreamate.com*
