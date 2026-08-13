<!--
STATUS              = SUPERSEDED_HISTORICAL
SOURCE_BRANCH       = data/jeju-collection-v1
SOURCE_COMMIT       = 0bc7f8a
ACTIVE_SSOT         = NO
REASON              = Jeju v1 was branched from Seoul; Jeju v2 was rebuilt from current master.
PRESERVED_IN        = docs/data-collection/jeju/history/jeju-source-state-audit-v1.md
-->

# 제주 Source State Audit v1

| 항목 | 값 |
|---|---|
| 버전 | v1 |
| 작성일 | 2026-08-13 |
| 작성 TASK | TASK-JEJU-SOURCE-STATE-AUDIT-V1 |
| Branch | data/jeju-collection-v1 |
| Base commit | 7a71304 (Seoul Final Handoff 승계) |
| 감사 방식 | READ-ONLY — repo 기존 자료만 사용 |
| API_CALLS | 0 |
| WEB_COLLECTION | 0 |

**선행 조건**: 서울 데이터 수집 COMPLETE (Final QA PASS, a070926 → handoff 7a71304)

---

## ⚠️ 핵심 발견 요약

```
JEJU_EXISTING_DATA_ARTIFACTS = 0건
  (data/ 디렉터리에 제주 전용 raw/enriched/normalized/manifest 없음)

REGIONAL_OFFICIAL_PRIMARY_CANDIDATE = 제주관광공사 API (JTO)
REGIONAL_SOURCE_STATE = NEEDS_SOURCE_CAPABILITY_CHECK
  (repo에 제주관광공사 API 실제 조사 기록 없음 — 웹/API 호출 없이 확인 불가)

KTO_JEJU = HOLD_FOR_SOURCE_CAPABILITY_DECISION
  (지역 공식 source 상태 확인 후 결정 — KTO 전체 crawl 선행 계획 금지)

STALE_POLICY_CONFLICT_COUNT = 1
  (gokoreamate-data-source-strategy.md: KTO를 Jeju primary source로 가정)
```

---

## SECTION 1 — 기존 제주 Artifacts 전수 Audit

### 1.1 data/ 디렉터리

| 경로 | 존재 여부 | 비고 |
|---|---|---|
| `data/jeju-source-audit/` | **없음** | 디렉터리 자체 미존재 |
| `data/tourapi/raw/jeju/` | **없음** | raw 수집 기록 없음 |
| `data/tourapi/enriched/jeju/` | **없음** | enrichment 없음 |
| `data/tourapi/candidates/jeju/` | **없음** | candidate 없음 |
| `data/tourapi/reports/jeju/` | **없음** | 보고서 없음 |

제주 전용 data/ 파일: **0개**

### 1.2 docs/ 디렉터리

| 경로 | 내용 | 재사용 가능 여부 |
|---|---|---|
| `docs/data-collection/jeju/` | 이번 Audit 전 없음 (이번에 신규 생성) | N/A |
| `docs/tourapi/gokoreamate-data-source-strategy.md` §D | Jeju 확장 계획 (KTO areaCode=39 언급, 예상 300~500건) | **PARTIAL** — KTO 가정은 stale, 수치는 미검증 추정 |
| `docs/tourapi/busan-collection-normalization-design.md` §8 | 제주관광공사 API 확장 후보로 언급 | **REFERENCE_ONLY** |
| `docs/data-collection/multicity-place-eligibility-policy-v1.md` | 제주 포함 전국 적용 명시 | ✅ 승계 사용 |
| `docs/data-collection/multicity-event-freshness-policy-v1.md` | 도시별 적용 계획 (제주 미착수) | ✅ 승계 사용 |
| `docs/data-collection/multicity-food-discovery-collection-policy-v1.md` | 전국 적용 | ✅ 승계 사용 |
| `docs/data-collection/multicity-main-data-handoff-v1.md` | 전 도시 공통 | ✅ 승계 사용 |
| `docs/data-collection/seoul/seoul-final-handoff-v1.md` | 서울 완료 기록 | 참조용 |

### 1.3 scripts/ 디렉터리

| 파일 | 제주 적용 가능 여부 |
|---|---|
| `scripts/run-seoul-nonfood-*` | 서울 전용 (VisitSeoul API) — 재사용 불가 |
| `scripts/run-seoul-food-*` | 서울 전용 (KTO + VisitSeoul) — 구조만 참조 |
| KTO 기반 부산 스크립트 | areaCode 교체 후 재사용 가능 구조 (부산 설계 문서 기술) |

### 1.4 app / src/ (app 레벨 skeleton)

| 파일 | 내용 | 데이터 수집 관련성 |
|---|---|---|
| `src/data/cities/jeju.ts` | `staticSpots: []` — 빈 배열 | app skeleton 존재, 데이터 없음 |
| `src/data/city-presets.ts` | Jeju 도착/출발 옵션 6개 정의 (공항·시내·서귀포·함덕·여객터미널·시외버스터미널) | UI용, 데이터 수집과 무관 |
| `src/app/api/generate-itinerary/route.ts` | Jeju MOCK 일정 하드코딩 (`[MOCK]` 태그) | 실데이터 연결 전 placeholder |
| `src/content/posts/2026-06-13-jeju-3-day-itinerary.md` | editorial 여행 가이드 (영문, 기자/편집 작성) | 수집 데이터 아님 |

### 1.5 public/data/ (현재 서비스 데이터)

| 파일 | 제주 레코드 | 비고 |
|---|---|---|
| `public/data/local-info.json` | **2건** (city="Jeju") | Dongmun Market, Hallasan — 수동 편집 레코드 |
| `public/data/restaurants.json` | **0건** (실 제주 식당) | 5건 hit은 Busan 식당의 "Jeju beef" 언급 — FP |
| `public/data/events.json` | **0건** (실 제주 이벤트) | 1건 hit은 Busan 식당의 "Jeju beef" 언급 — FP |
| `public/data/survival-guide.json` | 미확인 (list 구조) | 제주 전용 카테고리 미확인 |

### 1.6 이미지 (UI 자산)

| 파일 | 내용 | 데이터 수집 관련성 |
|---|---|---|
| `public/images/cities/city-jeju-v1.webp` | 도시 hero 이미지 | UI 자산 — 수집 데이터 아님 |
| `public/images/home/city-jeju.jpg` | 홈 화면 도시 이미지 | UI 자산 |

---

## SECTION 2 — Source 상태 분류

### 2.1 지역 공식 Source

| Source | 상태 | 근거 |
|---|---|---|
| **제주관광공사(JTO) API** | `NEEDS_SOURCE_CAPABILITY_CHECK` | busan-collection-normalization-design.md §8에 확장 후보로 언급. 실제 API 엔드포인트·커버리지·구조 미조사. |
| **visitjeju.net 공식 포털** | `NEEDS_SOURCE_CAPABILITY_CHECK` | repo에 조사 기록 없음. API 존재 여부 미확인. |
| **제주도 공공데이터 포털** | `NEEDS_SOURCE_CAPABILITY_CHECK` | 언급 없음. |

### 2.2 KTO TourAPI

| Source | 상태 | 근거 |
|---|---|---|
| KTO TourAPI (areaCode=39) | `HOLD_FOR_SOURCE_CAPABILITY_DECISION` | data-source-strategy.md §D에 계획 수치(300~500건, 미실측) 존재. 서울 경험상 지역 공식 source 우선 확인 후 결정. KTO 전체 crawl 선행 계획 금지. |

### 2.3 멀티링구얼 KTO

| Source | 상태 | 근거 |
|---|---|---|
| KTO EngService2 (areaCode=39) | `DOCUMENTED_NOT_COLLECTED` | 구조는 busan과 동일 — areaCode만 다름 |
| KTO JpnService2 / ChsService2 / ChtService2 | `DOCUMENTED_NOT_COLLECTED` | busan-collection-normalization-design.md §8: 서울·제주 확장 시 필수 언급. 현재 403 상태였음. |

### 2.4 기타

| Source | 상태 | 비고 |
|---|---|---|
| Naver | `NOT_NEEDED_CURRENT_SCOPE` | NAVER_FINAL_VERIFICATION_ONLY (phone/영업시간) — 1차 수집 source 금지 |
| Google Maps / Kakao | `NOT_AVAILABLE` | FORBIDDEN |

---

## SECTION 3 — Regional Official Source 우선 검증 결과

서울에서 확립된 원칙: **지역 공식 관광 source가 최신성·구조·품질이 충분하면 이를 primary로 사용한다.**

제주 검증 결과:

| 확인 항목 | 결과 |
|---|---|
| 지역 공식 source repo 조사 기록 | **없음** |
| VisitJeju 또는 제주관광공사 API 엔드포인트 문서 | **없음** |
| place / food / event / 다국어 coverage 실측 | **없음** |
| stable ID 확인 | **불가 (자료 없음)** |
| detail API 구조 | **불가 (자료 없음)** |
| address/coordinates 지원 여부 | **불가 (자료 없음)** |
| 개방 데이터 여부 / 접근 정책 | **불가 (자료 없음)** |

**판정**: `NEEDS_SOURCE_CAPABILITY_CHECK`

> 이번 Audit에서 웹/API 호출 없이 판단 불가. 다음 Task에서 Regional Source Capability Check 필요.

제주관광공사(JTO)는 busan-collection-normalization-design.md에서 도시 확장 시 추가할 원천으로 언급되었으므로 `PRIMARY_CANDIDATE_MENTIONED_IN_DOCS`이나 실제 capability는 미검증이다.

---

## SECTION 4 — 기존 공통 정책 승계 확인

| 정책 | 승계 상태 | SSOT 문서 |
|---|---|---|
| Place eligibility 5축 | ✅ 그대로 적용 | `multicity-place-eligibility-policy-v1.md` |
| Event freshness (ONGOING/UPCOMING만) | ✅ 그대로 적용 | `multicity-event-freshness-policy-v1.md` |
| Food discovery 정책 | ✅ 그대로 적용 | `multicity-food-discovery-collection-policy-v1.md` |
| Source 권리·이미지 정책 | ✅ 재조사 없이 승계 | 기존 ACTIVE 규칙 |
| USER PICKED > AI AUTO | ✅ | Place eligibility policy |
| AI 분류·번역 금지 | ✅ | CoC |
| Naver final verification only | ✅ | 기존 정책 |
| Google/Kakao 금지 | ✅ | 기존 정책 |
| NUMERIC_PRUNING 금지 | ✅ | 기존 정책 |
| COUNT_TARGET = NOT_DEFINED_BY_DESIGN | ✅ | 기존 정책 |

---

## SECTION 5 — 제품 범위 원칙 (제주 특성 반영)

제주는 다음 특성이 있어 Track 설계 시 특히 중요:

| 제주 특성 | 수집 범위 포함 | 제외 |
|---|---|---|
| **오름 (368개)** | 주요 관광 오름 (개방·접근 가능·travel value 있는 것만) | 전수 수집 금지 |
| **올레길 (26코스)** | 코스 경유지 주요 장소 | 코스 전체 GPS track (외부 기관 책임) |
| **유네스코 3관왕** (자연·문화·무형) | 핵심 UNESCO 장소·유산 | 전체 아카이브 금지 |
| **해녀 문화 체험** | 체험 가능 장소·프로그램 | 개인 해녀 리스트 금지 |
| **계절성 강한 Event** | ONGOING/UPCOMING 확정 일정만 | 과거 festival archive 금지 |
| **렌터카 필수 지역** | 위치·접근성 정보 | 실시간 교통·주차 micro-info 금지 |

---

## SECTION 6 — Track별 현재 상태

### 6.1 PLACE / ATTRACTION

| 항목 | 값 |
|---|---|
| EXISTING_COUNT | 0 (data/ 기준) |
| USABLE_COUNT | 0 |
| NEEDS_REFRESH_COUNT | 0 |
| MISSING_OR_NOT_STARTED | **전체** |
| PRIMARY_SOURCE | NEEDS_SOURCE_CAPABILITY_CHECK (지역 공식) / KTO HOLD |
| NEXT_ACTION | Regional Source Capability Check → source 결정 후 수집 설계 |

app level: `src/data/cities/jeju.ts` `staticSpots: []` — skeleton만 존재

### 6.2 NATURE / TREKKING

| 항목 | 값 |
|---|---|
| EXISTING_COUNT | 2 (public/data/local-info.json 수동 레코드: Dongmun Market[category=restaurant], Hallasan) |
| USABLE_COUNT | 1 (Hallasan — 기본 정보만, raw/normalized 없음) |
| NEEDS_REFRESH_COUNT | 0 |
| MISSING_OR_NOT_STARTED | 오름·올레길·해안·계절 자연 콘텐츠 전체 |
| PRIMARY_SOURCE | NEEDS_SOURCE_CAPABILITY_CHECK |
| NEXT_ACTION | Regional Source Capability Check |

참고: 서울 Nature/Trekking 교훈 — **Route entity ≠ Place entity**. 오름·올레길도 동일 원칙 적용.

### 6.3 SHOPPING / LIFESTYLE

| 항목 | 값 |
|---|---|
| EXISTING_COUNT | 0 |
| USABLE_COUNT | 0 |
| MISSING_OR_NOT_STARTED | 전체 |
| PRIMARY_SOURCE | NEEDS_SOURCE_CAPABILITY_CHECK |
| NEXT_ACTION | Source 결정 후 |

### 6.4 FOOD

| 항목 | 값 |
|---|---|
| EXISTING_COUNT | 0 (실 제주 식당 레코드 없음) |
| USABLE_COUNT | 0 |
| MISSING_OR_NOT_STARTED | 전체 |
| PRIMARY_SOURCE | NEEDS_SOURCE_CAPABILITY_CHECK (지역 source) / KTO HOLD |
| NEXT_ACTION | Regional Source Capability Check → Food policy 적용 |

제주 특산 음식 (흑돼지·갈치·한라봉·성게미역국 등) 카테고리 처리는 기존 multicity food policy 승계.

### 6.5 EVENT

| 항목 | 값 |
|---|---|
| EXISTING_COUNT | 0 (실 제주 이벤트 없음) |
| ACTIVE_EVENT_SERVICE_POOL | 0 |
| MISSING_OR_NOT_STARTED | 전체 |
| PRIMARY_SOURCE | NEEDS_SOURCE_CAPABILITY_CHECK |
| NEXT_ACTION | Source 결정 후 ONGOING/UPCOMING Event 탐색 |

적용 정책: `multicity-event-freshness-policy-v1.md` 그대로. 과거 event archive 수집 금지.

### 6.6 MULTILINGUAL

| 항목 | 값 |
|---|---|
| EXISTING_COUNT | 0 |
| DOCUMENTED_SOURCE | KTO EngService2/JpnService2/ChsService2/ChtService2 (미수집) |
| MISSING_OR_NOT_STARTED | 전체 |
| PRIMARY_SOURCE | KTO DOCUMENTED_NOT_COLLECTED (지역 source 다국어 capability 미확인) |
| NEXT_ACTION | Source capability 확인 시 다국어 coverage 함께 조사 |

### 6.7 IMAGE

| 항목 | 값 |
|---|---|
| UI 자산 | `public/images/cities/city-jeju-v1.webp`, `city-jeju.jpg` (도시 hero) |
| 큐레이션 데이터 이미지 | 0건 |
| PRIMARY_SOURCE | NEEDS_SOURCE_CAPABILITY_CHECK |
| NEXT_ACTION | Source capability 확인 시 이미지 정책 함께 조사 |

### 6.8 RELATION / DUPLICATE

| 항목 | 값 |
|---|---|
| EXISTING_COUNT | 0 |
| MISSING_OR_NOT_STARTED | 전체 (수집 후 적용) |
| NEXT_ACTION | 수집 완료 후 entity relation 분석 |

### 6.9 FRESHNESS

| 항목 | 값 |
|---|---|
| Event refresh | 7일 주기 (multicity policy 승계) |
| Place | 안정적 사실 짧은 주기 불필요 |
| Food | 수집 후 Food policy 적용 |

---

## SECTION 7 — KTO 사용 여부

```
KTO_JEJU = HOLD_FOR_SOURCE_CAPABILITY_DECISION

근거:
  1. 제주관광공사(JTO) 또는 visitjeju 등 지역 공식 source의 실제 capability 미확인
  2. 서울에서는 VisitSeoul이 PRIMARY_AND_SUFFICIENT였음
  3. 제주에서도 지역 공식 source 확인 후 결정 — KTO는 보완 gap 있을 때만 사용
  4. KTO 전체 crawl 계획은 이번 Audit에서 수립 금지

다음 Task에서 결정:
  - 지역 공식 source capability check 결과에 따라
    a. SUFFICIENT → KTO_JEJU = NOT_NEEDED_CURRENT_SCOPE (또는 targeted supplement만)
    b. INSUFFICIENT → KTO_JEJU = TARGETED_SUPPLEMENT_CANDIDATE (해당 gap만)
```

---

## SECTION 8 — Stale Policy 충돌 검사

### 충돌 1 (STALE_POLICY_CONFLICT)

| 항목 | 내용 |
|---|---|
| 파일 | `docs/tourapi/gokoreamate-data-source-strategy.md` |
| 섹션 | §D "도시 확장 계획 — 서울·제주·경주" |
| 충돌 내용 | KTO TourAPI (areaCode=39)를 제주의 기본 primary source로 가정 |
| 현재 정책 | 지역 공식 관광 source 우선 확인 후 KTO 보완 결정 (서울 작업으로 확립) |
| 추가 문제 | 예상 건수 "300~500건"은 미실측 추정치 — actual count는 source 확인 후 실측 |
| 처리 방침 | 이번 Audit에서 **데이터 수정 금지**. `STALE_POLICY_CONFLICT`로 기록. 다음 Task에서 source 결정 시 이 문서 관련 섹션 정정 |
| 심각도 | MEDIUM — source 결정을 잘못 유도할 수 있으나, 이번 Audit에서 pre-check했으므로 실제 오류 발생 전 차단됨 |

### 추가 확인 사항 (충돌 아닌 주의)

| 항목 | 비고 |
|---|---|
| `src/app/api/generate-itinerary/route.ts` Jeju MOCK | 실데이터 연결 전 hardcoded MOCK ([MOCK] 명시) — 수집 완료 후 교체 대상 (Main 담당) |
| `public/data/local-info.json` 2건 | 수동 편집, 현재 서비스 중. 수집 완료 후 canonical record로 교체 검토 (Main 판단) |

**STALE_POLICY_CONFLICT_COUNT = 1**

---

## SECTION 9 — 다음 실행 범위 제안

### 권장 실행 순서

```
Step 1: REGIONAL_OFFICIAL_SOURCE_CAPABILITY_CHECK  ← 다음 Task
  목표: 제주관광공사(JTO) 또는 visitjeju 공식 API/공개 데이터
        엔드포인트·구조·coverage·다국어·이미지·ID 안정성 확인
  방식: 소규모 실측 샘플 (API 호출 1~2회 테스트 — Main 승인 후)
  출력: source_capability 판정 → KTO 필요 여부 결정

Step 2: SOURCE_DECISION (Step 1 결과에 따라)
  A. 지역 source SUFFICIENT → Primary = JTO/VisitJeju
  B. 지역 source INSUFFICIENT/PARTIAL → Primary = JTO + KTO targeted
  C. 지역 source NOT_AVAILABLE → Primary = KTO (areaCode=39)

Step 3: EXISTING_RAW_RECOVERY (해당 없음 — 0건이므로 불필요)

Step 4: TARGETED_COLLECTION (source 결정 후 설계)
  - PLACE / ATTRACTION 수집
  - NATURE (주요 오름·올레길 연계 장소·UNESCO)
  - SHOPPING / LIFESTYLE

Step 5: FOOD_COLLECTION
  - multicity food policy 적용

Step 6: CURRENT_FUTURE_EVENT_DISCOVERY
  - ONGOING / UPCOMING Event만 (archive 금지)

Step 7: FINAL_QA
```

### 이미 충분한 Track (재수집 불필요)

없음 — 수집 자체가 미착수 상태.

### 수량 목표 사전 설정 금지

```
COUNT_TARGET = NOT_DEFINED_BY_DESIGN
NUMERIC_PRUNING = FORBIDDEN
Travel Value와 서비스 적합성이 기준
```

---

## 최종 플래그

```
TASK_RESULT                    = PASS
JEJU_BRANCH                    = data/jeju-collection-v1
JEJU_EXISTING_ARTIFACTS_FOUND  = NO (data/ 기준 0건)

REGIONAL_OFFICIAL_PRIMARY_CANDIDATE = 제주관광공사(JTO) API / visitjeju 공식 source
REGIONAL_SOURCE_STATE               = NEEDS_SOURCE_CAPABILITY_CHECK

PLACE_STATE        = NOT_STARTED
FOOD_STATE         = NOT_STARTED
EVENT_STATE        = NOT_STARTED (ACTIVE_EVENT_SERVICE_POOL=0)
MULTILINGUAL_STATE = NOT_STARTED
IMAGE_STATE        = UI_ASSETS_ONLY (수집 데이터 없음)

EXISTING_RAW_RECOVERY_TARGET = 0 (재사용 가능한 raw 없음)
KTO_JEJU = HOLD_FOR_SOURCE_CAPABILITY_DECISION

STALE_POLICY_CONFLICT_COUNT = 1
  (docs/tourapi/gokoreamate-data-source-strategy.md §D — KTO primary 가정)

API_CALLS         = 0
WEB_COLLECTION    = 0
DATA_COLLECTION   = 0
DB_WRITE          = 0
MASTER_WRITE      = 0
PRODUCTION_WRITE  = 0

NEXT_TASK = TASK-JEJU-REGIONAL-SOURCE-CAPABILITY-CHECK-V1
  (JTO/VisitJeju API 실제 엔드포인트·coverage·구조 소규모 실측 — Main 승인 필요)
```
