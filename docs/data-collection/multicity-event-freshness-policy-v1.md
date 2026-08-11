# Multicity Event Freshness Policy v1

> **Task**: TASK-SEOUL-EVENT-CURRENT-UPCOMING-SYNC-AND-REFRESH-POLICY-V1  
> **As-of**: 2026-08-11  
> **Product role**: AI Travel Scheduler (not event archive / search engine)

---

## 1. 목적

GoKoreaMate는 여행 일정 AI이다. 이벤트 데이터의 목적은 **여행자의 방문 기간에 실제로 진행되는 행사를 일정에 포함**시키는 것이다.  
따라서 이벤트 풀은 아카이브가 아니다 — `ONGOING` 또는 날짜 확정 `UPCOMING` 상태의 기록만 SERVICE_EVENT_POOL에 진입할 수 있다.

---

## 2. 수집 대상 및 전략

### 2.1 기본 원칙

| 원칙 | 내용 |
|---|---|
| **PRODUCT_ROLE** | AI_TRAVEL_SCHEDULER |
| **EVENT_COVERAGE_GOAL** | 현재 진행 중(ONGOING) + 날짜 확정 예정(UPCOMING) 이벤트만 |
| **ARCHIVE_GOAL** | ❌ — GoKoreaMate는 이벤트 아카이브 서비스 아님 |
| **FUTURE_DATE_THRESHOLD_GATE** | 없음 — 날짜 확정 + status gate로 충분 |

### 2.2 서울 1차 소스

| 소스 | 엔드포인트 | 인증 |
|---|---|---|
| VisitSeoul 공식 API | `POST https://api-call.visitseoul.net/api/v1/contents/list` (목록) | `VISITSEOUL-API-KEY` 헤더 |
| VisitSeoul 공식 API | `POST https://api-call.visitseoul.net/api/v1/contents/info` (상세) | `VISITSEOUL-API-KEY` 헤더 |

---

## 3. VisitSeoul API 날짜 필드 발견 (Section 30 검증 완료)

> **검증 결과 (2026-08-11 실측)**

| 필드 | 위치 | 포맷 | 예시 |
|---|---|---|---|
| `schdul_info_bgnde` | `contents/info` 응답에만 존재 | `YYYY.MM.DD` | `"2026.07.31"` |
| `schdul_info_endde` | `contents/info` 응답에만 존재 | `YYYY.MM.DD` | `"2026.08.02"` |
| `creat_dt_text` | `contents/list` 응답 | `YYYY.MM.DD` | `"2026.04.30"` |
| `updt_dt_text` | `contents/list` 응답 | `YYYY.MM.DD` | `"2026.07.08"` |

**핵심**: 이벤트 날짜(`schdul_info_bgnde`/`schdul_info_endde`)는 상세 API에만 존재한다. 목록 API의 `updt_dt_text`는 Recency Pre-Filter에만 사용 가능하다.

---

## 4. Discovery 전략

### 4.1 Recency Pre-Filter (HISTORICAL_BULK_DETAIL_CALLS = 0 보장)

```
Step 1: contents/list 전체 페이징 (76페이지 × 50건 = 3,765건)
Step 2: 로컬 필터 → EVENT 카테고리 코드 (Cd4y5u1 / Cu9u5z7 / Cv7s8m5)
         → 약 1,190~1,232건 추출
Step 3: Recency filter: updt_dt_text >= RECENCY_CUTOFF (기본: 2026-01-01)
         → 상세 call 대상 범위로 축소
Step 4: 필터된 후보군에만 contents/info 상세 call (targeted)
Step 5: schdul_info_bgnde / schdul_info_endde 추출 → AS_OF 날짜 gate
Step 6: ONGOING / UPCOMING 상태 판정 → service eligible 검사
```

### 4.2 상태 판정 기준 (AS_OF = 수집 날짜)

| 상태 | 조건 |
|---|---|
| `ONGOING` | start_date ≤ AS_OF ≤ end_date |
| `UPCOMING` | start_date > AS_OF |
| `ENDED` | end_date < AS_OF |
| `INACTIVE` | 날짜 필드 없거나 파싱 불가 |

### 4.3 Service Eligibility (전부 충족해야 SERVICE_EVENT_POOL 진입)

| 조건 | 규칙 |
|---|---|
| `has_exact_dates` | `schdul_info_bgnde` + `schdul_info_endde` 모두 파싱 가능 |
| `temporal_status` | `ONGOING` 또는 `UPCOMING` |
| `official_url` | 주최 공식 URL 존재 (`cmmn_hmpg_url` 기준) |
| `is_seoul_location` | 행사 장소가 서울 내 (`place`/`address` 서울 지표 확인) |

> **참고**: VisitSeoul 데이터베이스에 비서울 이벤트(예: 경북 의성군 행사)가 포함될 수 있음. 지리 검증 필수.

---

## 5. Official URL 정책

| 우선순위 | 소스 | url_type |
|---|---|---|
| 1 | `extra.cmmn_hmpg_url` (주최사 공식 홈페이지) | `ORGANIZER_DIRECT` |
| 2 | (미지원) VisitSeoul 공개 페이지 URL 포맷 미확인 | `OFFICIAL_VISIT_SOURCE_FALLBACK` |
| — | URL 없는 경우 | SERVICE_EVENT_POOL 제외 |

> **정책 근거**: VisitSeoul public 이벤트 상세 페이지 URL 포맷이 파악되지 않아 fallback URL 구성 불가.  
> 공식 URL 없는 이벤트(`옹기콘서트`, `연희판판` 등)는 SERVICE_EVENT_POOL 제외 — 품질 기준 유지.

---

## 6. 새로고침 정책

### 6.1 기본 주기

| 항목 | 주기 |
|---|---|
| **기본 이벤트 새로고침** | **7일** |
| 갱신 방식 | 전체 재수집 (`--collect`) — 증분 아님 |
| 날짜 gate | 수집 시점 AS_OF 재계산 |

### 6.2 런타임 만료 gate

AI 일정 생성 시점에 EVENT_POOL 레코드의 상태를 재검사한다:

```
여행자 여행 기간 ∩ event 날짜 구간 ≠ ∅
→ AI 일정에 포함 가능
```

Pool 기록이 있어도 여행자 날짜와 겹치지 않으면 제안하지 않는다.

### 6.3 예정 이벤트 (UPCOMING) 정책

- `start_date > AS_OF` 이면 UPCOMING으로 풀에 포함
- 별도의 미래 날짜 임계값(X일 이내) gate 없음 — 날짜 확정이 기준
- Recurring event watchlist 미운영 (v1)
- Event series registry 미운영 (v1)

---

## 7. 금지 사항

| 금지 | 이유 |
|---|---|
| 전체 1,190건 상세 bulk call | HISTORICAL_BULK_DETAIL_CALLS = 0 정책 |
| Recency filter 없이 event category 전체 상세 | 동일 |
| 날짜 없는 이벤트의 가능성 기반 포함 | POSSIBILITY_BASED_API_CALLS = 0 정책 |
| `INACTIVE` 또는 `ENDED` 상태 기록의 SERVICE_EVENT_POOL 진입 | 여행 일정 AI 원칙 |
| 공식 URL 없는 이벤트의 SERVICE_EVENT_POOL 진입 | 최소 정보 기준 |

---

## 8. 도시별 적용 계획

| 도시 | 1차 소스 | 상태 |
|---|---|---|
| 서울 | VisitSeoul API | ✅ v1 완료 (2026-08-11) |
| 부산 | 미정 (KTO 또는 VisitBusan API) | 미착수 |
| 경주 | 미정 (KTO 또는 경주시 공식 소스) | 미착수 |

> 타 도시 이벤트 수집 시 동일한 eligibility gate (날짜확정 + official_url + 지역검증) 적용.

---

## 9. 스크립트 참조

```
scripts/run-seoul-current-upcoming-event-sync-v1.py
  --discover-only   : 목록+상세 조회 → gate 확인 (파일 쓰기 없음)
  --collect         : 전체 수집 + 파일 출력
  --normalize-only  : raw 파일 기반 재정규화
```

출력 파일:

| 파일 | 내용 |
|---|---|
| `seoul-current-upcoming-event-discovery-v1.jsonl` | 전체 60건 상세 결과 (gate 포함) |
| `seoul-current-upcoming-event-pool-v1.jsonl` | SERVICE_EVENT_POOL 4건 |
| `seoul-current-upcoming-event-attempts-v1.jsonl` | 상세 call 시도 기록 |
| `seoul-current-upcoming-event-detail-raw-v1.jsonl` | raw API 응답 |
| `seoul-current-upcoming-event-sync-manifest-v1.json` | gate 수치 + SHA256 |

---

## 10. v1 수집 결과 (2026-08-11 기준)

| 지표 | 값 |
|---|---|
| VisitSeoul 전체 레코드 | 3,765건 |
| EVENT_CATEGORY 식별 | 1,232건 |
| Recency 후보 (updt≥2026-01-01) | 60건 |
| 상세 call 성공 | 60/60 |
| 날짜 확정 레코드 | 37건 |
| 날짜 없음(INACTIVE) | 23건 |
| ONGOING | 6건 |
| UPCOMING | 1건 (비서울 — pool 제외) |
| ENDED | 30건 |
| **SERVICE_EVENT_POOL** | **4건** |

### Pool 4건 목록

| 제목 | 기간 | URL type |
|---|---|---|
| 2026 서울 태권도 광장 | 2026-05-09 ~ 2026-10-18 | ORGANIZER_DIRECT |
| 2026 서울국제정원박람회 | 2026-05-01 ~ 2026-10-27 | ORGANIZER_DIRECT |
| 2026 서울야외도서관 | 2026-04-23 ~ 2026-11-01 | ORGANIZER_DIRECT |
| 2026 서울 한옥체험 : 어제와의 오늘 시간 | 2026-04-03 ~ 2026-10-25 | ORGANIZER_DIRECT |

### Pool 미포함 ONGOING/UPCOMING (3건)

| 제목 | 이유 |
|---|---|
| 제3회 의성 썸머 뮤직 페스타 | NON_SEOUL_LOCATION + NO_OFFICIAL_URL |
| 조선 양반 접객 문화 체험 공연 '옹기콘서트' | NO_OFFICIAL_URL (서울 공연) |
| 연희 상설 공연 〈연희판판〉 | NO_OFFICIAL_URL (서울 공연) |

---

## 11. 다음 단계

1. **7일 주기 재수집**: 2026-08-18 기준으로 `--collect` 재실행
2. **전통 공연 URL 수동 보완**: 옹기콘서트·연희판판 주최사 URL 파악 후 추가 가능성 검토
3. **AI 일정 통합**: SERVICE_EVENT_POOL 4건 → 여행자 날짜 overlap 검사 후 일정 연동
4. **타 도시 확장**: 부산·경주 이벤트 소스 발굴 후 동일 정책 적용

---

*생성: TASK-SEOUL-EVENT-CURRENT-UPCOMING-SYNC-AND-REFRESH-POLICY-V1 / 2026-08-11*
