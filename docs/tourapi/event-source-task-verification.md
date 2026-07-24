# TASK-DATA-BUSAN-EVENT-SOURCE-01 — 검증 보고서

**날짜:** 2026-07-24
**태스크:** TASK-DATA-BUSAN-EVENT-SOURCE-01 (GPT 프롬프트)
**검증 상태:** REVIEW REQUIRED — 실행 전 설계 결정 3건 필요

---

## 1. 프롬프트 목적 — 요약

행사 데이터에 6개 필드(`official_url`, `official_source_name`, `official_check_required`, `schedule_change_detected`, `affiliate_url`, `affiliate_provider`) 추가. 공식 URL은 API 제공분만 사용, affiliate와 분리 보관, 변경 감지 지원.

---

## 2. 사전 확인 결과

### 2-1. HOMEPAGE_URL 존재 확인

```
busan-festival-ko-p001.json → UC_SEQ:71 HOMEPAGE_URL: "http://www.bfo.or.kr/festival_sea/info/01.asp?MENUDIV=1"
busan-festival-en-p001.json → UC_SEQ:71 HOMEPAGE_URL: "http://www.bfo.or.kr/festival_Eng/info/01.asp?MENUDIV=1&Fcode=SEAFESTIVAL"
```

HOMEPAGE_URL은 **KO뿐 아니라 EN/JA/ZhS/ZhT raw에도 각 언어별 다른 URL**로 존재.

### 2-2. diff 현황

```json
{
  "compared_against": "2026-07-24/run-001",
  "new": 0, "changed": 0, "missing_once": 0, "unchanged": 4135
}
```

run-001 → run-002가 같은 날 동일 데이터. `schedule_change_detected`는 현재 183건 전부 false.

### 2-3. COMPARE_FIELDS 확인

`tourapi-busan-diff.mjs:12`에 `venue`, `event_period_raw` 이미 포함 ✓

---

## 3. 발견 사항 — 설계 결정 필요

### [D1] HOMEPAGE_URL이 언어별로 별도 URL

**현상:** 동일 행사(UC_SEQ:71)에 대해 KO raw와 EN raw가 **서로 다른** HOMEPAGE_URL을 반환함.

| 언어 | HOMEPAGE_URL |
|---|---|
| KO | `http://www.bfo.or.kr/festival_sea/info/01.asp?MENUDIV=1` |
| EN | `http://www.bfo.or.kr/festival_Eng/info/01.asp?MENUDIV=1&Fcode=SEAFESTIVAL` |

**프롬프트 갭:** `official_url` 필드가 1개이므로, 어느 언어의 URL을 저장할지 또는 언어별로 별도 저장할지 정의되지 않음.

**선택지:**

| 옵션 | 방식 | 장단점 |
|---|---|---|
| A | KO HOMEPAGE_URL만 사용, 전 언어에 동일 적용 | 단순, 하지만 EN 사용자에게 KO 공식 URL 제공 |
| B | 각 레코드의 언어별 raw에서 각자 HOMEPAGE_URL 추출 | 정확, `official_url`이 언어별로 다름 |
| C | KO를 primary로, null인 언어만 KO에서 상속 | 절충안 |

**추천:** B 방식 — FestivalService API가 언어별 URL을 직접 제공하므로 그 의도를 따름.

---

### [D2] `official_source_name` 정의 불명확

**현상:** HOMEPAGE_URL은 Busan API가 제공하지만, 실제 URL은 행사 주최자 사이트(bfo.or.kr, beerfestival.co.kr 등).

**프롬프트 갭:** "이 데이터를 제공한 API 출처" vs "이 URL의 소유 주체" 중 어느 의미인지 불명확.

| UC_SEQ | HOMEPAGE_URL 도메인 | 의미 |
|---|---|---|
| 71 | bfo.or.kr | 부산관광공사 |
| 329 | beerfestival.co.kr | 행사 주최자 |
| 253 | (없음) | null |

**선택지:**

| 옵션 | 값 예시 | 용도 |
|---|---|---|
| A | `'visitbusan'` 고정 | 데이터 제공 API 출처 일관 표기 |
| B | URL 도메인 추출 (`bfo.or.kr`) | 실제 사이트 주체 표기 |
| C | 두 필드 분리: `official_data_source` + `official_url_domain` | 명확하지만 필드 증가 |

**추천:** A 방식 — `source_provider: 'busan'`, `image_source: 'visitbusan'`과 일관성 유지. 실제 URL 자체에 도메인 정보가 있으므로 중복 저장 불필요.

---

### [D3] `affiliate_provider` 허용값 미정의

**현상:** "affiliate_provider는 허용값 외 0건" 검증이 명시됐지만, 허용값 목록이 프롬프트에 없음.

**제안:** 스크립트 상수로 명시 —

```javascript
const ALLOWED_AFFILIATE_PROVIDERS = ['klook', 'booking.com', 'viator', 'kkday'];
```

현재는 모두 null이므로 어떤 목록이든 "허용값 외 0건" 통과하지만, 이후 실수 방지를 위해 지금 정의가 필요.

---

## 4. 발견 사항 — 구현 방법론 갭

### [M1] `normBusanFestival` 수정만으로는 현재 데이터 반영 불가

**문제:** 프롬프트가 "행사 정규화 필드 추가"를 말하나, `normBusanFestival` 함수를 수정해도 배치 재실행(=API 호출) 없이는 현재 `busan-batch-normalized.json`에 반영 안됨.

**API 호출 금지** 원칙상 배치 재실행 불가.

**필요 구조:**

```
[신규] tourapi-busan-event-source.mjs
  ↓ 기존 raw 파일 읽기 (API 호출 없음)
  ↓ busan-festival-*-p001.json에서 HOMEPAGE_URL 추출
  ↓ busan-batch-normalized.json에서 festival 183건 필터
  ↓ 새 필드 추가하여 enriched CSV 생성
  → busan-festival-event-source.csv (신규)
  → busan-festival-event-source-metrics.json (신규)
  
[수정] tourapi-busan-batch.mjs - normBusanFestival
  → HOMEPAGE_URL 포함 (향후 배치 실행 시 자동 반영)
```

### [M2] `schedule_change_detected` 현재 데이터 실용 정보 없음

**현상:** diff run-001→run-002는 동일 날짜, 동일 데이터 → 모든 레코드 unchanged → `schedule_change_detected=false` 100%.

**영향:** 현재 데이터에서는 필드가 항상 false. 의미있는 값은 cross-day 배치 실행 후 생성됨.

**대응:** 스크립트에 synthetic test 포함 + metrics에 "baseline" 상태 명시. 실 데이터 0건 changed는 예상 동작으로 문서화.

---

## 5. 발견 사항 — 완료 보고서에서 언급된 후속 과제와의 연관성

`busan-festival-01-rev-report.md` 후속 과제:
> "ended_event 분류: FestivalService 날짜 필드 미구조화(파싱 가능 25%)로 보류."

- UC_SEQ:71 부산바다축제: USAGE_DAY_WEEK_AND_TIME = `"2025. 8. 1. ~ 8. 3."` → 2025년 행사
- 현재 2026-07-24이므로 이 행사는 종료됨
- EVENT-SOURCE-01에서 `official_check_required=true`로 표시하지만 이것이 ended_event 위험을 해소하지는 않음
- 관련 없는 태스크이므로 EVENT-SOURCE-01에서 다룰 필요는 없음 (별도 TASK으로 관리 중)

---

## 6. 프롬프트 원칙 검토 — PASS 항목

| 항목 | 평가 |
|---|---|
| 공식 URL 없으면 null 유지, 임의 링크 생성 금지 | ✓ HOMEPAGE_URL이 빈 문자열이면 null 처리 명확 |
| 공식·제휴 링크 혼합 금지 | ✓ 필드 분리 원칙 명확 |
| GoKoreaMate가 취소·연기·매진 자동 확정 금지 | ✓ 상태값 정의 올바름 |
| 사용자 문구 영문 확정 | ✓ 구체적 문구 포함 |
| festival 183건 유지 | ✓ 기존 normalized 수정 없음 |
| canonical 1,356건 유지 | ✓ canonical 출력 파일 미수정 |
| source_key 중복·비밀값·범위 밖 변경 0 | ✓ enrichment 전용 스크립트 구조에서 충족 가능 |

---

## 7. 수정된 구현 계획 (실행 시 반영할 내용)

프롬프트 원안 + 하기 수정 반영:

| 항목 | 원안 | 수정 |
|---|---|---|
| official_url 출처 | 미정 | 각 언어 raw의 HOMEPAGE_URL 사용 (D1-B) |
| official_source_name 값 | 미정 | `'visitbusan'` 고정 (D2-A) |
| affiliate_provider 허용값 | 미정 | `['klook', 'booking.com', 'viator', 'kkday']` 상수 정의 (D3) |
| 구현 방식 | normBusanFestival 수정 암시 | 별도 enrichment 스크립트 신규 생성 + normBusanFestival 수정 분리 (M1) |
| schedule_change_detected 기준 | diff 기반 | 현재 diff 결과 기반, baseline 0건 expected로 문서화 (M2) |

### 신규 생성 파일

```
scripts/tourapi-busan-event-source.mjs         (신규 enrichment 스크립트)
data/tourapi/candidates/busan/busan-festival-event-source.csv   (신규)
data/tourapi/reports/busan/busan-festival-event-source-metrics.json (신규)
docs/tourapi/event-source-disclaimer.md        (신규 — 사용자 안내 문구 확정)
```

### 수정 파일

```
scripts/tourapi-busan-batch.mjs — normBusanFestival에 HOMEPAGE_URL 필드 추가
```

---

## 8. 실행 전 확인 요청

다음 3개 설계 결정에 대한 방향 확인이 필요합니다.

| # | 질문 | 추천 |
|---|---|---|
| D1 | official_url: 각 언어 raw의 URL 사용(B) vs KO 공통 적용(A)? | B — 언어별 URL 사용 |
| D2 | official_source_name: 'visitbusan' 고정(A) vs 도메인 추출(B)? | A — 'visitbusan' 고정 |
| D3 | affiliate_provider 허용값을 어떻게 정의할까? | ['klook', 'booking.com', 'viator', 'kkday'] |

현재 추천대로 진행해도 된다면 즉시 실행 가능합니다.

---

TASK-DATA-BUSAN-EVENT-SOURCE-01 검증 완료 — 실행 전 설계 결정 3건 확인 필요.
