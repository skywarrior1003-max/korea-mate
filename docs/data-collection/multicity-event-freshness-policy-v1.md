# Multicity Event Freshness Policy v1

> **최초 작성**: TASK-SEOUL-EVENT-CURRENT-UPCOMING-SYNC-AND-REFRESH-POLICY-V1  
> **R1 수정**: TASK-SEOUL-EVENT-CURRENT-UPCOMING-SYNC-R1-CORRECTION  
> **R2 업데이트**: TASK-SEOUL-EVENT-DISCOVERY-R2-OFFICIAL-SOURCE-FINALIZE-AND-CLEANUP  
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

**핵심**: 이벤트 날짜(`schdul_info_bgnde`/`schdul_info_endde`)는 상세 API에만 존재한다.  
`updt_dt_text`는 **source 수정 날짜**이며 event date가 아니다 — Discovery 필터로 사용 금지.

---

## 4. Discovery 전략 (R1 기준)

### 4.1 탐색 파이프라인

```
Step 1: contents/list 전체 페이징 (76페이지 × 50건 = 3,765건)
Step 2: 로컬 필터 → EVENT 카테고리 코드 (Cd4y5u1 / Cu9u5z7 / Cv7s8m5)
         → 약 1,232건 추출
Step 3: updt_dt_text DESC 정렬 (최신순 힌트 — hard gate 아님)
         + MAX_DETAIL_CANDIDATES = 200 (soft ceiling)
Step 4: 후보군에 contents/info 상세 call (targeted)
Step 5: schdul_info_bgnde / schdul_info_endde 추출 → AS_OF 날짜 gate
Step 6: ONGOING / UPCOMING 상태 판정 → service eligible 검사
```

> ⚠️ **R1 변경**: V1의 `updt_dt_text >= RECENCY_CUTOFF` hard gate는 **제거**되었다.  
> `updt_dt_text`는 source 수정 날짜이며 행사 진행 여부와 무관하다.  
> SOURCE_UPDATED_AT_HARD_DISCOVERY_GATE = **FORBIDDEN**

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
| `official_url` | 공식 정보 URL 존재 (우선순위 정책 Section 5 참조) |
| `is_seoul_location` | 행사 장소가 서울 내 (`place`/`address` 서울 지표 확인) |

> **참고**: VisitSeoul 데이터베이스에 비서울 이벤트(예: 경북 의성군 행사)가 포함될 수 있음. 지리 검증 필수.

---

## 5. Official URL 정책 (R1 기준)

### 5.1 우선순위

| 우선순위 | 소스 | url_type | 비고 |
|---|---|---|---|
| 1 | `extra.cmmn_hmpg_url` (주최사 공식 홈페이지) | `ORGANIZER_DIRECT` | 가장 강한 신호 |
| 2 | VERIFIED_URL_TABLE (스크립트 내 사전 검증된 URL) | `OFFICIAL_VISIT_OR_PUBLIC_PAGE` | 알고리즘 실패 또는 slug 불일치 시 |
| 3 | VisitSeoul English 상세 페이지 (알고리즘 생성 + HTTP 검증) | `OFFICIAL_VISIT_OR_PUBLIC_PAGE` | URL 패턴: `english.visitseoul.net/events/{slug}/{EN-CID}` |
| — | URL 없는 경우 | `NONE` | SERVICE_EVENT_POOL 제외 |

### 5.2 VisitSeoul English URL 알고리즘

```python
# EN CID: Korean CID에서 KOP→ENP 접두사 교체
# Slug: English API 제목을 공백→하이픈 변환
# 패턴: https://english.visitseoul.net/events/{slug}/{EN-CID}
# 필수: HTTP GET으로 200 응답 확인 후에만 사용
```

> **FABRICATED_OFFICIAL_URL = FORBIDDEN**: URL은 실제 존재 확인 후에만 official_url로 기록한다.

### 5.3 VERIFIED_URL_TABLE (v1.1.0-R1 기준)

| CID | 제목 | URL | 검증 날짜 |
|---|---|---|---|
| KOPsj8gga | 옹기콘서트 | `https://english.visitseoul.net/events/Joseon-Yangban-.../ENPsj8gga` | 2026-08-11 |
| KOPnkfasx | 연희판판 | `https://english.visitseoul.net/events/Yeonhee-Standing-.../ENPnkfasx` | 2026-08-11 |

> 비고: `연희판판`은 VisitSeoul의 커스텀 slug가 API English 제목과 달라 알고리즘이 실패함 → 수동 검증 후 테이블 등록.

### 5.4 R1 핵심 원칙

```
ORGANIZER_DIRECT_URL_REQUIRED = NO
OFFICIAL_INFORMATION_URL_REQUIRED = YES
SOURCE_UPDATED_AT_IS_NOT_EVENT_DATE = YES
SOURCE_UPDATED_AT_HARD_DISCOVERY_GATE = FORBIDDEN
```

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
| `updt_dt_text`를 행사 날짜 또는 discovery hard gate로 사용 | SOURCE_UPDATED_AT_IS_NOT_EVENT_DATE = YES |
| 날짜 없는 이벤트의 가능성 기반 포함 | POSSIBILITY_BASED_API_CALLS = 0 정책 |
| `INACTIVE` 또는 `ENDED` 상태 기록의 SERVICE_EVENT_POOL 진입 | 여행 일정 AI 원칙 |
| HTTP 검증 없이 VisitSeoul URL을 임의 생성하여 기록 | FABRICATED_OFFICIAL_URL = FORBIDDEN |

---

## 8. 도시별 적용 계획

| 도시 | 1차 소스 | 상태 |
|---|---|---|
| 서울 | VisitSeoul API (MAIN) + 열린데이터광장 OA-15486 (보완·미접근) | ✅ R2 PASS_WITH_LIMITATION (2026-08-11) |
| 부산 | 미정 (KTO 또는 VisitBusan API) | 미착수 |
| 경주 | 미정 (KTO 또는 경주시 공식 소스) | 미착수 |

> 타 도시 이벤트 수집 시 동일한 eligibility gate (날짜확정 + official_url + 지역검증) 적용.

---

## 9. 스크립트 참조

```
scripts/run-seoul-current-upcoming-event-sync-v1.py  (v1.1.0-R1)
  --discover-only   : 목록+상세 조회 → gate 확인 (파일 쓰기 없음)
  --collect         : 전체 수집 + 파일 출력
  --normalize-only  : raw 파일 기반 재정규화
```

출력 파일:

| 파일 | 내용 |
|---|---|
| `seoul-current-upcoming-event-discovery-v1.jsonl` | 전체 200건 상세 결과 (gate 포함) |
| `seoul-current-upcoming-event-pool-v1.jsonl` | SERVICE_EVENT_POOL 6건 |
| `seoul-current-upcoming-event-attempts-v1.jsonl` | 상세 call 시도 기록 |
| `seoul-current-upcoming-event-detail-raw-v1.jsonl` | raw API 응답 |
| `seoul-current-upcoming-event-sync-manifest-v1.json` | gate 수치 + SHA256 |

---

## 10. 수집 결과 이력

### V1 결과 (c99095e — 2026-08-11 최초)

| 지표 | 값 |
|---|---|
| VisitSeoul 전체 레코드 | 3,765건 |
| EVENT_CATEGORY 식별 | 1,232건 |
| 상세 call 후보 (updt≥2026-01-01 hard gate) | 60건 |
| 상세 call 성공 | 60/60 |
| ONGOING | 6건 |
| UPCOMING | 1건 (비서울) |
| **SERVICE_EVENT_POOL** | **4건** |

**Pool 제외 ONGOING 이유 (V1 결함)**:
- 옹기콘서트 → `NO_OFFICIAL_URL` (FIX-1 미적용)
- 연희판판 → `NO_OFFICIAL_URL` (FIX-1 미적용)

### R1 결과 (R1 커밋 — 2026-08-11)

| 지표 | 값 |
|---|---|
| VisitSeoul 전체 레코드 | 3,765건 |
| EVENT_CATEGORY 식별 | 1,232건 |
| 상세 call 후보 (recency 정렬 soft limit 200) | 200건 |
| 상세 call 성공 | 200/200 |
| Outside V1 hard gate (old updt) — 추가 탐색 | 140건 |
| ONGOING | 6건 |
| UPCOMING | 1건 (비서울) |
| **SERVICE_EVENT_POOL** | **6건** |
| RECENCY_HARD_GATE_FALSE_NEGATIVE_COUNT | 0 |
| VISIT_FALLBACK_COUNT | 2 |

**Pool 6건 목록**:

| 제목 | 기간 | URL type |
|---|---|---|
| 2026 서울 태권도 광장 | 2026-05-09 ~ 2026-10-18 | ORGANIZER_DIRECT |
| 2026 서울국제정원박람회 | 2026-05-01 ~ 2026-10-27 | ORGANIZER_DIRECT |
| 2026 서울야외도서관 | 2026-04-23 ~ 2026-11-01 | ORGANIZER_DIRECT |
| 2026 서울 한옥체험 : 어제와의 오늘 시간 | 2026-04-03 ~ 2026-10-25 | ORGANIZER_DIRECT |
| 옹기콘서트 (조선 양반 접객 문화 체험 공연) | 2026-07-02 ~ 2026-12-10 | OFFICIAL_VISIT_OR_PUBLIC_PAGE |
| 연희판판 (연희 상설 공연) | 2026-04-04 ~ 2026-10-31 | OFFICIAL_VISIT_OR_PUBLIC_PAGE |

### Regression Fixture 결과 (R1 최종)

| CID | 이벤트 | 기대 | 실제 | 판정 |
|---|---|---|---|---|
| KOPsj8gga | 옹기콘서트 | IN_POOL | IN_POOL | ✅ |
| KOPnkfasx | 연희판판 | IN_POOL | IN_POOL | ✅ |
| KOPl5u8ht | 의성 썸머뮤직 | NOT_IN_POOL | NOT_IN_POOL | ✅ |
| KOPz4etr5 | 서울썸머비치 | NOT_IN_POOL | NOT_IN_POOL | ✅ |

---

## 11. 다음 단계

1. **7일 주기 재수집**: 2026-08-18 기준으로 `--collect` 재실행 (VERIFIED_URL_TABLE 재검증 포함)
2. **AI 일정 통합**: SERVICE_EVENT_POOL 6건 → 여행자 날짜 overlap 검사 후 일정 연동
3. **타 도시 확장**: 부산·경주 이벤트 소스 발굴 후 동일 정책 적용
4. **VERIFIED_URL_TABLE 관리**: 재수집 시 기존 URL 유효성 확인; 만료된 항목 교체
5. **서울 열린데이터광장 OA-15486**: API 키 확보 후 보완 소스로 추가 (R2 PASS_WITH_LIMITATION 사유)

---

---

## 12. R2 공식 소스 탐색 결과 (2026-08-11)

> **Task**: TASK-SEOUL-EVENT-DISCOVERY-R2-OFFICIAL-SOURCE-FINALIZE-AND-CLEANUP  
> **결과**: EVENT_DISCOVERY_R2 = PASS_WITH_LIMITATION

### 12.1 탐색 대상 소스

| 소스 | 식별 근거 | 접근 상태 |
|---|---|---|
| 서울 열린데이터광장 「서울시 문화행사 정보」 (OA-15486) | `data.seoul.go.kr` 공개 데이터셋 | API 키 미보유 / 엔드포인트 접근 불가 |

### 12.2 소스 특성 (메타 기준)

```
데이터셋명: 서울시 문화행사 정보
OA 코드: OA-15486
업데이트 주기: 일 (daily)
날짜 필드: 시작일·종료일 포함 (확인됨)
라이선스: 공공누리 1유형
API 엔드포인트: openapi.seoul.go.kr:8088/{KEY}/json/culturalEventInfo/...
```

### 12.3 접근 차단 사유

```
API_KEY_AVAILABLE = NO          — SEOUL_OPENAPI_KEY 환경 변수 없음
ENDPOINT_ACCESSIBLE = NO        — HTTP :8088 포트 SSL 불가
AUTHENTICATED_PORTAL = BLOCKED  — culture.seoul.go.kr → SSO 리다이렉트
DISCOVERY_COMPLETENESS = NOT_PROVEN
```

### 12.4 R2 최종 결론

```
EVENT_DISCOVERY_R2           = PASS_WITH_LIMITATION
MAIN_EVENT_SOURCE            = VISITSEOUL_OFFICIAL_API
SECONDARY_SOURCE             = SEOUL_OPEN_DATA_OA15486_IDENTIFIED_NOT_ACCESSED
CURRENT_VERIFIED_EVENT_POOL  = 6 (R1 FROZEN — 2026-08-11)
POOL_SHA256                  = EC89604497EEB544483E688E2FABCAD439BA2905F2359BD27499F8F14ACF3C89
NEXT_TASK                    = FOOD_DISCOVERY_COLLECTION
```

### 12.5 파일 정리 분류

| 파일 | 분류 |
|---|---|
| `seoul-current-upcoming-event-pool-v1.jsonl` | ACTIVE_PIPELINE_OUTPUT |
| `seoul-current-upcoming-event-sync-manifest-v1.json` | ACTIVE_PIPELINE_OUTPUT |
| `seoul-current-upcoming-event-discovery-v1.jsonl` | KEEP_FOR_REPRODUCIBILITY |
| `seoul-current-upcoming-event-attempts-v1.jsonl` | KEEP_FOR_REPRODUCIBILITY |
| `seoul-current-upcoming-event-detail-raw-v1.jsonl` | SAFE_TO_DELETE |

> VisitSeoul API는 현재 유일하게 검증·운영 중인 서울 이벤트 소스다.  
> 서울 열린데이터광장 OA-15486은 API 키 확보 후 보완 소스로 통합할 수 있다.

---

*최초 생성: TASK-SEOUL-EVENT-CURRENT-UPCOMING-SYNC-AND-REFRESH-POLICY-V1 / 2026-08-11*  
*R1 업데이트: TASK-SEOUL-EVENT-CURRENT-UPCOMING-SYNC-R1-CORRECTION / 2026-08-11*  
*R2 업데이트: TASK-SEOUL-EVENT-DISCOVERY-R2-OFFICIAL-SOURCE-FINALIZE-AND-CLEANUP / 2026-08-11*
