# TASK-DATA-BUSAN-FESTIVAL-01-REV — 완료 보고서

**날짜:** 2026-07-24
**태스크:** TASK-DATA-BUSAN-FESTIVAL-01-REV
**상태:** PASS

---

## 1. 변경 파일

| 파일 | 변경 |
|---|---|
| `scripts/tourapi-busan-batch.mjs` | `normBusanFestival` 함수 추가, SOURCES 5개 추가 |
| `scripts/tourapi-busan-diff.mjs` | COMPARE_FIELDS에 `venue`, `event_period_raw` 추가 |

---

## 2. 행사 수집 결과

### 언어별 건수

| 언어 | 건수 |
|---|---|
| KO | 40 |
| EN | 37 |
| JA | 35 |
| ZhS | 35 |
| ZhT | 36 |
| **합계** | **183** |

API 요청: 5회 추가 (총 49→54회)

### 필드 채움률 (183건 기준)

| 필드 | 건수 | 채움률 |
|---|---|---|
| title | 183 | 100% |
| address (ADDR1) | 169 | 92% |
| coord (lat/lng) | 183 | 100% |
| image_url | 183 | 100% |
| description | 183 | 100% |
| venue (MAIN_PLACE) | 147 | 80% |
| event_period_raw | 163 | 89% |

---

## 3. diff 검증

### 1차 실행 (기존 스냅샷 2026-07-23/run-002 대비)

| 분류 | 건수 |
|---|---|
| new | 183 (festival 신규) |
| changed | 0 |
| missing_once | 0 |
| unchanged | 3,952 |

기존 3,952건 전부 unchanged 확인.

### 반복 실행 검증 (idempotency: run-001 → run-002)

| 분류 | 건수 | 기대 | 결과 |
|---|---|---|---|
| new | 0 | 0 | PASS |
| changed | 0 | 0 | PASS |
| missing_once | 0 | 0 | PASS |
| unchanged | 4,135 | 4,135 | PASS |

### Synthetic test

| 조작 | 기대 분류 | 검출 source_key | 검출 필드 | 결과 |
|---|---|---|---|---|
| festival[0] 제거 | new | `FestivalService:71:ko` | — | PASS |
| event_period_raw 변경 | changed | `FestivalService:329:ko` | event_period_raw | PASS |
| 가짜 festival 추가 | missing_once | `FestivalService:99999:ko` | — | PASS |

---

## 4. 기존 수치 유지 여부

| 항목 | 기준 | 실제 | 결과 |
|---|---|---|---|
| 기존(비festival) 레코드 | 3,952 | 3,952 | PASS |
| diff unchanged | 3,952 | 3,952 | PASS |
| source_key 중복 | 0 | 0 | PASS |
| 재처리 일치 | PASS | PASS | PASS |
| 비밀값 노출 | 0 | 0 | PASS |

festival 추가 후 총 normalized: **4,135건** (3,952 + 183)

언어 연결 변화 (festival 포함):

| 항목 | 추가 전 | 추가 후 |
|---|---|---|
| total | 2,430 | 2,571 (+141) |
| high | 2,364 | 2,498 (+134) |
| manual_review | 66 | 73 (+7) |
| unlinked | 92 | 98 (+6) |

---

## 5. Git 상태

git add / commit / push 없음. 변경된 추적 파일: 없음.

---

### 후속 과제 (문서화)

- `ended_event` 분류: FestivalService 날짜 필드 미구조화(파싱 가능 25%)로 보류. Festival 날짜 정규화 전용 파서 태스크로 분리 예정.
- `venue` 채움률 80%: MAIN_PLACE가 비어있는 40건은 PLACE 필드도 확인 필요.

---

TASK-DATA-BUSAN-FESTIVAL-01-REV 부산 행사 배치 통합 완료.
