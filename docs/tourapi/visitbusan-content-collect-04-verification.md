# VISITBUSAN 일반 콘텐츠 전체 수집 GPT 프롬프트 검증 보고서

**날짜:** 2026-07-24
**대상:** 사용자 제시 전체 수집 태스크 요구사항
**판정: 실행 보류 — 6개 항목 보완 후 실행**

---

## 1. 검증 항목별 결과

### 올바른 내용 ✓

| 항목 | 검증 | 근거 |
|---|---|---|
| `requires_client_render` 별도 분리, 억지 저장 금지 | ✓ 정확 | PARSER-FIX-02A-REV에서 구현 완료. uc_seq=2566 등 `var mtTitle` 없는 항목은 `excludedRows`에만 기록 |
| EN 공식 제목 확인된 항목만 후보 레코드 저장 | ✓ 정확 | PARSER-FIX-02A-REV Phase 4: `extractTitle(html)` 공백이면 `language_content_unavailable`로 제외 |
| 허위 title·URL 0 조건 | ✓ 정확 | `extractOfficialUrl()` fallback 제거, `BLOCKED_URL_PATTERNS` 차단, `UI_TEXTS` 필터 모두 반영됨 |
| `source_detail_url` / `external_official_url` 분리 | ✓ 정확 | PARSER-FIX-02A-REV CSV_HDR 및 row 객체에 반영됨 |
| 본문·이미지 파일 저장 금지 | ✓ 정확 | 파일럿 스크립트부터 `image_url` (경로만), 파일 저장 없음 |
| 타입별 필드 채움률 | ✓ 정확 | 파일럿 MD 보고서 이미 포함 |
| TourAPI 비교 단계를 다음으로 명시 | ✓ 정확 | 진행 맥락 정합 |

---

## 2. 누락·개선 필요 항목 (실행 보류 사유)

### 🔴 A. 출력 파일 덮어쓰기 위험 — Critical

**문제:** 프롬프트에 출력 파일 경로 미지정. 파일럿 스크립트를 그대로 수정·실행하면 기존 파일럿 결과 파일을 덮어씁니다.

**현재 파일럿 결과 (보존 대상):**
```
data/tourapi/candidates/busan/visitbusan-content-pilot.csv   (105행, 41 KB)
data/tourapi/candidates/busan/visitbusan-content-pilot.json  (105건, 87 KB)
data/tourapi/reports/busan/visitbusan-content-pilot-metrics.json
```

**권장 전체 수집 출력 파일:**
```
data/tourapi/candidates/busan/visitbusan-content-full.csv
data/tourapi/candidates/busan/visitbusan-content-full.json
data/tourapi/reports/busan/visitbusan-content-full-excluded.json
data/tourapi/reports/busan/visitbusan-content-full-metrics.json
docs/tourapi/visitbusan-content-collect-04-report.md
```

**스크립트 전략:** 파일럿 스크립트(`content-pilot.mjs`) 수정 시 덮어쓰기 위험. **신규 스크립트 권장:**
```
scripts/tourapi-busan-visitbusan-content-collect.mjs
```
파일럿 스크립트의 유틸 함수(extractTitle, extractOfficialUrl, stripHtml, parseDetail 등)와 Phase 3/4/5/6/7 구조는 그대로 재사용.

---

### 🔴 B. HARD STOP 조건 미정의 — Critical

**문제:** 파일럿에서는 3개의 HARD STOP 조건이 있었으나 전체 수집 요구사항에 명시되지 않았습니다. 조건 없이 실행하면 허위 제목·오염 데이터가 저장될 수 있습니다.

**권장 HARD STOP 조건 (파일럿과 동일):**

| # | 조건 | 판정 |
|---|---|---|
| 1 | `title_ko` 공백 ≥ 1건 (`requires_client_render` 제외 후) | HARD STOP |
| 2 | 주소·전화·운영시간 HTML 오염 잔류 ≥ 1건 | HARD STOP |
| 3 | `source_key` 중복 ≥ 1건 | HARD STOP |

HARD STOP 시 → metrics JSON만 저장, CSV/JSON/MD 출력 없음.

---

### 🟡 C. ID 발견 방식 교체 미언급 — Significant

**문제:** 프롬프트에 "KO 전체 775건 상세 수집"이라고만 명시됐으나, 기존 파일럿의 ID 발견 로직(`discoverCategories()` + `collectIds()`)은 DISCOVERY-03에서 확인된 방식과 다릅니다.

**현재 파일럿 로직 (교체 필요):**
```javascript
KO_TARGET = 20  // 타입당 목표 — 제거 필요
// discoverCategories(): ucc2_seq href 탐색 → 0건 발견
// collectIds(): 기본 16건 + 카테고리 루프 → 고정 16건
```

**DISCOVERY-03 확정 방식 (적용 필요):**
```javascript
// attraction/shopping/experience/course: listCntPerPage2=500 → 1회 전체 수집
// food: page_no=1~22 순회 (16건/페이지 고정)
// 카테고리 코드: <button value="N">LABEL</button> 추출
// KO_TARGET/EN_TARGET 제거 (전체 수집)
```

또한 **카테고리 코드 → `category_label` 필드 매핑**이 추가됩니다. DISCOVERY-03에서 발견된 코드:

| 유형 | ucc2_seq 코드 |
|---|---|
| attraction | 31:자연, 35:역사, 36:문화, 37:공원 |
| food | 32:한식, 39:중식, 40:일식, 41:아세안요리, 42:양식, 43:카페&베이커리, 73:해산물, 95:그릴 |
| shopping | 44:전통시장, 45:쇼핑센터, 46:쇼핑거리, 47:기념품 |
| experience | 57:해양·레저, 59:역사·문화, 123:웰니스 |
| course | 90:당일여행, 91:1박2일, 92:2박3일, 93:3박4일이상 |

---

### 🟡 D. EN 수집 범위 불명확 — Significant

**문제:** "EN 동일 ID 상세 제공 여부 확인"의 범위가 불명확합니다.
- 파일럿: 타입당 5건(25건) 표본 확인
- 전체 수집: 전체 775건 확인 vs 타입별 확장 표본?

**권장: 전체 775건 EN 확인**

이유:
- EN 공식 제목 제공 여부가 항목마다 상이함 (파일럿에서 24%가 EN 미제공)
- 표본 방식으로는 EN 후보 레코드 누락 발생
- TourAPI 비교 단계에서 EN 레코드 수가 중요한 지표가 됨

| 방식 | EN 요청 수 | 총 요청 | 예상 시간 |
|---|---|---|---|
| 타입당 5건 (파일럿 방식) | 25건 | ~875건 | ~10분 |
| **전체 775건 (권장)** | **775건** | **~1,625건** | **~19분** |

---

### 🟢 E. 태스크 ID 미지정 — Minor

**권장 태스크 ID:** `TASK-DATA-BUSAN-VISITBUSAN-CONTENT-COLLECT-04`

기존 명명 규칙:
- PILOT-02: 파일럿 수집
- PARSER-FIX-02A-REV: 파서 결함 수정
- DISCOVERY-03: 전체 ID 발견
- **COLLECT-04: 전체 본 수집** ← 현재 단계

---

### 🟢 F. 완료 보고서 마지막 줄 미지정 — Minor

**권장 마지막 줄:**
```
TASK-DATA-BUSAN-VISITBUSAN-CONTENT-COLLECT-04 VisitBusan 일반 콘텐츠 전체 수집 완료.
```

---

## 3. 수정된 태스크 명세 (권장)

```
# TASK-DATA-BUSAN-VISITBUSAN-CONTENT-COLLECT-04

태스크: VisitBusan 5개 일반 콘텐츠 유형 전체 KO/EN 수집

ID 발견 방식 (DISCOVERY-03 확정):
  - attraction/shopping/experience/course: listCntPerPage2=500 (1회)
  - food: page_no=1~22 순회 (16건/페이지)
  - 대상: KO 775건 전체

KO 수집:
  - 전체 775건 상세 페이지 수집
  - requires_client_render → excludedRows 분리 (후보 미생성)
  - HARD STOP: title_ko 공백 ≥ 1 | HTML 오염 ≥ 1 | source_key 중복 ≥ 1

EN 수집:
  - 동일 775건 EN 상세 확인
  - var mtTitle 공식 EN 제목 있는 경우만 후보 레코드 생성
  - 없으면 language_content_unavailable → excludedRows 분리

출력:
  - data/tourapi/candidates/busan/visitbusan-content-full.csv
  - data/tourapi/candidates/busan/visitbusan-content-full.json
  - data/tourapi/reports/busan/visitbusan-content-full-excluded.json
  - data/tourapi/reports/busan/visitbusan-content-full-metrics.json
  - docs/tourapi/visitbusan-content-collect-04-report.md

스크립트: scripts/tourapi-busan-visitbusan-content-collect.mjs (신규)
  기존 파일럿 스크립트 무수정 보존

금지:
  DB·commit·push·기존 파일럿 파일 수정·본문/이미지 저장
  visitbusan-content-pilot.csv/json 덮어쓰기

마지막 줄:
  TASK-DATA-BUSAN-VISITBUSAN-CONTENT-COLLECT-04 VisitBusan 일반 콘텐츠 전체 수집 완료.
```

---

## 4. 예상 규모 (수정된 명세 기준)

| 단계 | 내용 | 요청 수 |
|---|---|---|
| ID 발견 | DISCOVERY-03 방식 (attraction×2 + food×24 + shopping×2 + experience×2 + course×2) | 32건 |
| KO 상세 | 775건 전체 | 775건 |
| EN 상세 | 775건 전체 확인 | 775건 |
| JA/ZhS/ZhT | 타입당 1건 확인 | 15건 |
| **합계** | | **1,597건** |

- 요청 간격: 700ms
- 예상 소요시간: **약 19분**
- rate limit 위험: 없음

---

## 5. 판정 및 다음 단계

**판정: 실행 보류**

보완 후 실행 허가 필요한 항목:
1. 🔴 출력 파일 경로 확정 (파일럿 파일 보존 여부)
2. 🔴 HARD STOP 조건 동의
3. 🟡 ID 발견 방식 교체 포함 여부
4. 🟡 EN 수집 범위 (전체 775건 vs 타입별 표본)

권장: 위 수정된 명세(`TASK-DATA-BUSAN-VISITBUSAN-CONTENT-COLLECT-04`)로 실행

---

**다음 태스크:** 전체 수집 완료 후 TourAPI/KTO matched / web_only / api_only / manual_review 비교
