# TASK-DATA-BUSAN-FESTIVAL-01 — 검증 보고서

**날짜:** 2026-07-24
**태스크:** TASK-DATA-BUSAN-FESTIVAL-01
**상태:** REVIEW REQUIRED

---

## API 프로브 결과

### 엔드포인트 (5개 언어 전부 정상)

| 언어 | 엔드포인트 | 응답 |
|---|---|---|
| KO | `FestivalService/getFestivalKr` | OK |
| EN | `FestivalService/getFestivalEn` | OK |
| JA | `FestivalService/getFestivalJa` | OK |
| ZhS | `FestivalService/getFestivalZhs` | OK |
| ZhT | `FestivalService/getFestivalZht` | OK |

### 실제 응답 필드 (KO 기준, 21개)

```
UC_SEQ, MAIN_TITLE, GUGUN_NM, LAT, LNG,
PLACE, TITLE, SUBTITLE, MAIN_PLACE,
ADDR1, ADDR2, CNTCT_TEL, HOMEPAGE_URL,
TRFC_INFO, USAGE_DAY, USAGE_DAY_WEEK_AND_TIME,
USAGE_AMOUNT, MAIN_IMG_NORMAL, MAIN_IMG_THUMB,
ITEMCNTNTS, MIDDLE_SIZE_RM1
```

### 수집 규모 (KO 기준)

- 전체: **40건** (1페이지, 100개 미만 → 단일 페이지)

---

## BLOCKER-01 — 구조화 날짜 필드 미존재

**태스크 요구:** "행사 시작일·종료일 정규화"
**실제 응답:** 구조화 날짜 필드(`event_start_date`, `event_end_date`, `START_DATE`, `END_DATE` 등) **없음**

대신 텍스트 필드 2개:
- `USAGE_DAY` — 비공백 8/40 **(20%)**
- `USAGE_DAY_WEEK_AND_TIME` — 비공백 34/40 **(85%)**

실제 값 패턴 (형식 불일치):

| 샘플 값 | 형식 |
|---|---|
| `"2025. 8. 1. ~ 8. 3."` | 연도 부분 생략, 공백 산재 |
| `"2026. 05. 22. ~ 05. 31."` | 시작 연도만 있음 |
| `"2026. 5. 15. ~  5. 24. 점등시간 매일 저녁 7시~새벽 1시"` | 날짜+시간 혼합 |
| `"2025.5.16.(금) ~ 5.19.(월)\n모래조각전 6.8.(일)까지 전시"` | 다중 기간, 줄바꿈 |
| `"매년 11월"` | 연간 반복, 날짜 없음 |
| `""` | 공백 |

**날짜 파싱 가능 추정: 10/40 (25%)** — 75%는 `event_end_date` 추출 불가.

---

## BLOCKER-02 — `ended_event` 분류 불가

**태스크 요구:** "종료 행사는 삭제하지 말고 상태만 기록", `ended_event` diff 분류

`ended_event` 판별 기준은 "event_end_date < today". 그러나 날짜 파싱 성공률이 25%이므로:
- 75% 행사는 `ended_event` 판별 불가 → 전부 `missing_once`로 fallback
- 25% 행사도 파싱 정확도가 보장되지 않음 (연도 생략, 혼합 텍스트)

신뢰성 없는 `ended_event` 구현은 오탐(ended로 잘못 분류)을 유발합니다.

---

## 실행 가능한 범위 (BLOCKER 제외 시)

다음은 날짜 없이도 즉시 구현 가능합니다:

| 항목 | 구현 여부 |
|---|---|
| FestivalService 5개 언어 수집 | ✅ 가능 |
| UC_SEQ 기반 same_id 언어 연결 | ✅ 가능 |
| title, address, district, lat, lng, image_url, description, venue 정규화 | ✅ 가능 |
| `event_period_raw` 텍스트 보존 | ✅ 가능 (가공 없이 원문 저장) |
| diff: new / changed / missing_once / unchanged | ✅ 가능 |
| `ended_event` 분류 | ❌ 날짜 파싱 불가 |
| `event_start_date` / `event_end_date` 구조화 | ❌ 필드 미존재 |

---

## GPT에게 요청할 결정

두 가지 중 선택 후 재제출:

**Option A (권장):** `ended_event` 제외, `event_period_raw` 보존
- `event_period_raw: USAGE_DAY_WEEK_AND_TIME || USAGE_DAY` 원문 텍스트로만 저장
- diff 분류: new / changed / missing_once / unchanged (ended_event 없음)
- 구조화 날짜 파싱은 추후 전용 파서 태스크로 분리
- 기존 `ended_event` 후속 과제 문서에 "FestivalService 날짜 미구조화" 사유 추가

**Option B:** 날짜 파싱 모듈 선행 구현
- `USAGE_DAY_WEEK_AND_TIME` → `event_start_date` / `event_end_date` 파서 구현 (25% coverage 한계 명시)
- 파싱 실패 건은 날짜 null 처리, `ended_event` 적용 불가 표시
- 구현 복잡도 높음, 커버리지 낮아 `ended_event` 실효성 제한적

---

## 변경 없음

파일 수정 없음. git 상태 변화 없음.

---

TASK-DATA-BUSAN-FESTIVAL-01 API 명세 불일치 — 구현 보류.
