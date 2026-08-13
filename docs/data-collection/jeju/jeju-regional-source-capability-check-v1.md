# TASK-JEJU-REGIONAL-SOURCE-CAPABILITY-CHECK-V1 완료보고서

| 항목 | 값 |
|---|---|
| 버전 | v1 |
| 작성일 | 2026-08-13 |
| TASK | TASK-JEJU-REGIONAL-SOURCE-CAPABILITY-CHECK-V1 |
| Branch | data/jeju-collection-v2 |
| Branch HEAD (before) | 8fe515e |
| 감사 방식 | READ-ONLY (웹조사) + 최소 endpoint 확인 (API key 없이) |

```
COMMON_POLICY_BRANCH  = data/multicity-common
COMMON_POLICY_COMMIT  = dc6f9be563983d369f400e4e8b0eea139f82da7c

API_CALLS         = 2   (api.visitjeju.net — key 없이 endpoint alive 확인)
WEB_COLLECTION    = 0   (웹조사는 capability research, 데이터 수집 아님)
DATA_COLLECTION   = 0
DB_WRITE          = 0
MASTER_WRITE      = 0
PRODUCTION_WRITE  = 0
SECRET_LEAK       = 0
LARGE_CRAWL       = 0
```

---

## 1. 사전 검증

### 1.1 Branch 상태

| 항목 | 값 |
|---|---|
| 현재 branch | data/jeju-collection-v2 ✅ |
| v2 HEAD | 8fe515e |
| origin/master | a9014c6 |
| origin/data/multicity-common | dc6f9be ✅ |
| origin/data/jeju-collection-v1 | 삭제됨 (TASK-JEJU-V1-SAFE-DELETE-V1) |

### 1.2 Existing Raw First 확인

```
data/tourapi/jeju/      — 없음
data/jeju-collection*/  — 없음
```

EXISTING_RAW_FIRST_APPLICABLE = NO (제주 원시 데이터 없음)

---

## 2. 공통 정책 기준 확인

적용 정책 (dc6f9be 기준):

| 정책 | 핵심 제약 |
|---|---|
| Place eligibility | 5개 축 독립 평가 (DATA_PRESENCE ≠ AI_RECOMMENDATION) |
| Food FINAL FREEZE | AI 추론 금지, NAVER_FINAL_VERIFICATION_ONLY=YES, phone 필수 |
| Event freshness | ONGOING + 날짜 확정 UPCOMING만 SERVICE_EVENT_POOL 진입 가능 |
| Data quality guardrail | unknown→no 변환 금지, NUMERIC_PRUNING 금지 |

### 2.1 Food 정책 핵심 조항 (FINAL FREEZE)

```
AI_INFERRED_RESTAURANT_FACT = FORBIDDEN
NAVER_FINAL_VERIFICATION_ONLY = YES
RESTAURANT_ATTRIBUTE_AI_INFERENCE = FORBIDDEN
KTO_TYPE39_PHONE_PRIMARY_DETAIL_FIELD = detailIntro2.infocenterfood
FINAL_RETAINED_CANDIDATES_WITHOUT_PHONE = 0
```

### 2.2 Event 정책 핵심 조항

```
PRODUCT_ROLE    = AI_TRAVEL_SCHEDULER
EVENT_COVERAGE  = ONGOING + 날짜 확정 UPCOMING 만
ARCHIVE_GOAL    = NO
```

---

## 3. 조사 대상 Source 전체 목록

| # | Source | 운영 주체 | 접근 방식 |
|---|---|---|---|
| S1 | VisitJeju Open API | 제주관광공사 (JTO) | REST API, JSON |
| S2 | tourapi.visitjeju.net | 제주관광공사 (JTO) | SPARQL endpoint |
| S3 | VisitJeju 파일 데이터 (data.go.kr) | 제주관광공사 | CSV 다운로드 |
| S4 | VisitJeju 이벤트 파일 (data.go.kr) | 제주관광공사 | CSV 다운로드 |
| S5 | 제주관광공사 빅데이터 플랫폼 | 제주관광공사 | 웹 대시보드 |
| S6 | 제주데이터허브 | 제주특별자치도 | 웹 플랫폼 |
| S7 | KTO TourAPI (areaCode=39) | 한국관광공사 | REST API, JSON |

---

## 4. Source별 Capability 상세

### S1 — VisitJeju Open API (PRIMARY_CANDIDATE)

| 항목 | 값 |
|---|---|
| 운영 주체 | 제주관광공사 (Jeju Tourism Organization) |
| Base URL | `https://api.visitjeju.net` |
| 목록 엔드포인트 | `GET /vsjApi/contents/searchList` |
| 인증 | API key (`apiKey` 쿼리 파라미터), 이메일 신청 후 관리자 승인 (~1일) |
| 응답 형식 | JSON, UTF-8 |
| Endpoint 상태 | **LIVE** (curl 실측 확인) |

**쿼리 파라미터:**

| 파라미터 | 필수 | 값 |
|---|---|---|
| `apiKey` | ✅ | 발급 키 |
| `locale` | ✅ | `kr` / `en` / `zh` / `ja` |
| `category` | 선택 | `c1` (관광지) / `c4` (음식점) 등 |
| `currentPage` | 선택 | 페이지 번호 |

**응답 스키마 (확인된 필드):**

| 필드 | 내용 |
|---|---|
| `contentsid` | 고유 stable ID ✅ |
| `title` | 장소명 ✅ |
| `address` | 주소 ✅ |
| `latitude` / `longitude` | 좌표 ✅ |
| `phoneno` | 전화번호 ✅ |
| `introduction` | 설명 ✅ |
| `repPhoto` | 대표 이미지 ✅ |
| `alltag` | 태그 ✅ |

**페이지네이션:**

| 필드 | 내용 |
|---|---|
| `currentPage` | 현재 페이지 |
| `pageCount` | 전체 페이지 수 |
| `pageSize` | 페이지당 개수 |
| `totalCount` | 전체 레코드 수 |

**카테고리 분류 (확인):**

```
관광지 (c1): 자연, 문화, 기타, 의료, 축제, 오름, 예술, 시장, 트레일,
             문화유적, 축제/행사, 지질트레일, 박물관, 유적, 사찰,
             올레코스, 생태공원
숙박: 별도 카테고리
음식점 (c4): 음식점 전체
쇼핑: 별도 카테고리
문화시설: 별도 카테고리
축제·행사: 별도 카테고리
체험관광: 별도 카테고리
```

**Endpoint 실측 확인:**

```
요청 1: GET https://api.visitjeju.net/vsjApi/contents/searchList
응답:   HTTP 200

요청 2: GET https://api.visitjeju.net/vsjApi/contents/searchList?apiKey=test&locale=kr
응답:   {"result":"403","resultMessage":"apiKey is invalid"}
```

→ Endpoint 정상 작동. API key 인증 방식 확인. JSON 응답 구조 확인.

**미확인 사항 (API key 없이 실측 불가):**

| 항목 | 상태 |
|---|---|
| 운영시간 (opentime/hours) | 미확인 — 상세 엔드포인트 존재 여부 미확인 |
| 음식 메뉴 정보 | 미확인 |
| c4 phone 커버리지 실제 비율 | 미확인 |
| 축제/행사 카테고리 날짜 필드 | 미확인 |
| 상세 엔드포인트 존재 여부 | 미확인 (searchDetail 등) |

**장소 커버리지:** 1,128개소 (공공데이터포털 기준, API key 없이 정확한 총 수 미확인)

**판정:** `PRIMARY_CANDIDATE` — Place / Food

---

### S2 — tourapi.visitjeju.net (BLOCKED)

| 항목 | 값 |
|---|---|
| 운영 주체 | 제주관광공사 |
| URL | `https://tourapi.visitjeju.net/` |
| 기능 | SPARQL endpoint, 사용 신청, 데이터 탐색 |
| Endpoint 상태 | **ECONNREFUSED** (211.57.84.90:443 — 연결 거부) |

```
실측: curl → ECONNREFUSED (connect ECONNREFUSED 211.57.84.90:443)
```

**판정:** `BLOCKED` — 현재 접근 불가. S1 (api.visitjeju.net)이 대체 정상 작동 중.

---

### S3 — VisitJeju 콘텐츠 파일 데이터 (data.go.kr 15049999)

| 항목 | 값 |
|---|---|
| 운영 주체 | 제주관광공사 |
| 형식 | CSV (8,090건) |
| 접근 | 로그인 없이 무료 다운로드 |
| 갱신 주기 | 연 1회 (마지막 갱신: 2026-03-06) |

**제공 필드 (56개 컬럼):**
콘텐츠ID, 콘텐츠분류, 제목, 언어, 타이틀, 연관콘텐츠, 지번주소, 도로명주소, 위도, 경도,
좋아요수, 리뷰수, 북마크수, 방문자수, 웹/모바일/다국어 이용수, SNS 공유수, 번역 승인일 (한/영/중/일/중번/말레이)

**미제공 필드:** 전화번호, 운영시간, 메뉴

**다국어:** 한국어/영어/중국어/일본어/중국번체/말레이어 번역 상태 포함

**판정:** `ASSET_SUPPLEMENT` — 연 1회 갱신, 전화/시간 없음. 커버리지 감사·다국어 번역 상태 확인용.

---

### S4 — VisitJeju 콘텐츠이벤트 파일 (data.go.kr 15041968)

| 항목 | 값 |
|---|---|
| 운영 주체 | 제주관광공사 |
| 형식 | CSV (16건) |
| 접근 | 무료 다운로드 |
| 갱신 주기 | 연 1회 |

**제공 필드:**
이벤트아이디, 관련콘텐츠명, 이벤트내용, 이벤트시작일, 이벤트종료일, 연속이벤트여부, 링크주소

**Event Freshness Policy 대비:**

```
총 건수: 16건 (극히 소규모)
갱신 주기: 연 1회 (freshness policy 위반)
→ ONGOING/UPCOMING 실시간 추적 불가
→ SERVICE_EVENT_POOL 진입 기준 미달
```

**판정:** `NOT_NEEDED` — Event freshness policy 기준 미달. 건수·갱신 주기 모두 부적합.

---

### S5 — 제주관광공사 빅데이터 플랫폼 (data.ijto.or.kr)

| 항목 | 값 |
|---|---|
| 운영 주체 | 제주관광공사 |
| URL | http://data.ijto.or.kr/bigdata/index.do |
| 제공 데이터 | 방문자 통계, 소비 데이터, 교통, 인구통계, 만족도 |
| API | 제공 없음 (대시보드 전용) |

**판정:** `NOT_NEEDED` — 통계 분석 대시보드. Place/Food/Event 구조화 데이터 없음.

---

### S6 — 제주데이터허브 (jejudatahub.net)

| 항목 | 값 |
|---|---|
| 운영 주체 | 제주특별자치도 |
| URL | https://www.jejudatahub.net/ |
| Capability | 페이지 접근은 되나 내용 확인 실패 (JavaScript 렌더링) |

**판정:** `UNKNOWN` — 내용 미확인. 추가 조사 필요하나 우선순위 낮음 (S1으로 충분한 경우).

---

### S7 — KTO TourAPI (areaCode=39, 한국관광공사)

| 항목 | 값 |
|---|---|
| 운영 주체 | 한국관광공사 |
| Base URL | `https://apis.data.go.kr/B551011/` |
| 인증 | serviceKey (기존 repo .env에 보유) |
| areaCode | 39 (제주특별자치도) |
| 콘텐츠 규모 | 260,000+건 전국, areaCode=39 필터링 |

**관련 엔드포인트:**

| 엔드포인트 | 용도 | 부산/경주 검증 |
|---|---|---|
| `KorService2/areaBasedList2` | Place 목록 (contentTypeId별) | ✅ 사용 실적 |
| `KorService2/searchFestival2` | 행사·축제 (날짜 필터 지원) | ✅ 부산 사용 |
| `KorService2/detailIntro2` | 상세정보 (phone = infocenterfood) | ✅ 경주 사용 |
| `EngService2/areaBasedList2` | 영문 목록 | ✅ 부산 사용 |

**searchFestival2 날짜 필터:**

```
파라미터: eventStartDate (YYYYMMDD), eventEndDate (YYYYMMDD)
areaCode: 39
→ ONGOING + UPCOMING 기간 필터링 가능
→ Event freshness policy 충족 가능
```

**기존 raw 데이터 (Existing Raw First):**

```
data/tourapi/raw/busan/  — 부산 완료
data/tourapi/raw/gyeongju/ — 경주 완료
data/tourapi/raw/jeju/ — 없음 (신규 수집 필요)
```

**KTO 제주 type15 (festival) 목록 스키마 (Gyeongju raw 기반 확인):**

```
areaBasedList2?contentTypeId=15&areaCode=39 응답 필드:
addr1, addr2, areacode, cat1~cat3, contentid (stable ID), contenttypeid,
mapx, mapy, tel, title, firstimage
→ 주의: 날짜 필드 없음 (areaBasedList2 목록 레벨)
→ 날짜는 searchFestival2 또는 detailCommon으로 별도 조회
```

**판정:**
- Festival/Event: `EVENT_SPECIALIST` (searchFestival2 + 날짜 필터 = freshness policy 대응 가능)
- Place: `SUPPLEMENT_CANDIDATE` (gap fill 전용, primary 아님)
- Food (type39): `SUPPLEMENT_CANDIDATE` (phone gap → detailIntro2.infocenterfood)

---

## 5. Source 역할 최종 결정

### 5.1 Primary/Supplement 분류

| Source | Place | Food | Event | 이미지 | 다국어 |
|---|---|---|---|---|---|
| S1 VisitJeju API | **PRIMARY** | **PRIMARY** | SUPPLEMENT | PRIMARY | PRIMARY |
| S2 tourapi.visitjeju.net | BLOCKED | BLOCKED | BLOCKED | — | — |
| S3 VisitJeju 파일 | ASSET_SUPPLEMENT | ASSET_SUPPLEMENT | — | — | ASSET_SUPPLEMENT |
| S4 VisitJeju Event 파일 | — | — | NOT_NEEDED | — | — |
| S5 JTO 빅데이터 | NOT_NEEDED | NOT_NEEDED | NOT_NEEDED | — | — |
| S6 제주데이터허브 | UNKNOWN | UNKNOWN | UNKNOWN | — | — |
| S7 KTO TourAPI | SUPPLEMENT | SUPPLEMENT | **EVENT_SPECIALIST** | ASSET_SUPPLEMENT | — |

### 5.2 최종 판정

```
PLACE_PRIMARY          = VisitJeju Open API (api.visitjeju.net, category c1)
                         커버리지: 1,128개소+, stable ID (contentsid), 공식 JTO 데이터
                         multilingual: locale parameter (kr/en/zh/ja)

FOOD_PRIMARY           = VisitJeju Open API (api.visitjeju.net, category c4)
                         phone 필드 (phoneno) 확인 — 실제 커버리지는 key 취득 후 실측 필요
                         CAVEAT: 운영시간/메뉴 제공 여부 미확인

EVENT_PRIMARY          = KTO TourAPI searchFestival2 (areaCode=39)
                         날짜 필터 (eventStartDate/eventEndDate) 지원 → freshness policy 대응
                         SUPPLEMENT: VisitJeju API 축제/행사 카테고리 (실측 후 판단)

KTO_ROLE               = TARGETED_ONLY
                         (1) Event: searchFestival2 areaCode=39 — PRIMARY
                         (2) Food gap: detailIntro2.infocenterfood (phone 보강)
                         (3) Place gap: areaBasedList2 보완용
                         전체 crawl 금지

IMAGE_SOURCE           = VisitJeju API repPhoto (JTO 공식 이미지, 공공 저작권)
                         KTO firstimage — ASSET_SUPPLEMENT

MULTILINGUAL_SOURCE    = VisitJeju API locale parameter (kr/en/zh/ja 공식 제공)
                         S3 파일 데이터 번역 상태 — 커버리지 감사용
```

---

## 6. 인증 현황

| Source | Key 보유 | 취득 방법 |
|---|---|---|
| VisitJeju API | ❌ 미보유 | visitjeju.net/kr/visitjejuapi 신청 → 이메일 (~1일) |
| KTO TourAPI | ✅ repo .env에 존재 | (기존 부산/경주 사용분) |

```
VISITJEJU_API_KEY_STATUS = NOT_YET_OBTAINED
  → 신청 방법: https://www.visitjeju.net/kr/visitjejuapi
  → 양식: 기관명, 이메일, 사용 목적 → 관리자 승인 후 이메일 발송
  → 소요: 약 1일 (영업일)
  → 이 task의 HOLD 주요 사유 (실제 샘플 호출 불가)
```

---

## 7. Event Freshness Policy 대비 분석

| 항목 | VisitJeju Event 파일 | KTO searchFestival2 |
|---|---|---|
| 총 건수 | 16건 | 확인 필요 (부산 12건 참고) |
| 갱신 주기 | 연 1회 | API 실시간 |
| 날짜 필터 | 이벤트시작일/종료일 존재 | eventStartDate/eventEndDate |
| ONGOING 필터 | 불가 (연 1회 파일) | 날짜 범위로 가능 |
| UPCOMING 필터 | 불가 | 날짜 범위로 가능 |
| freshness policy 적합 | ❌ | ✅ |

→ VisitJeju 공식 API에서 축제/행사 카테고리 날짜 필드 존재 여부 미확인 (API key 필요)

---

## 8. Food Capability 분석

| 항목 | VisitJeju c4 | KTO type39 supplement |
|---|---|---|
| 안정적 ID | contentsid ✅ | contentid ✅ |
| 전화 | phoneno 필드 존재 ✅ | detailIntro2.infocenterfood ✅ |
| 주소 | address ✅ | addr1 ✅ |
| 좌표 | lat/lon ✅ | mapx/mapy ✅ |
| 운영시간 | 미확인 | 별도 필드 (일부 제공) |
| 메뉴 | 미확인 | 미제공 |
| 공식 이미지 | repPhoto ✅ | firstimage ✅ |
| NAVER 최종 검증 | 필수 (FINAL FREEZE 정책) | 필수 |

---

## 9. 다음 수집 Task 설계 제안

### Step 1 — VisitJeju API Key 취득 (HOLD 해제 조건)

```
ACTION: visitjeju.net/kr/visitjejuapi 신청
BLOCKER: 이 Task에서 실제 샘플 호출 불가의 주된 원인
예상 소요: 1영업일
```

### Step 2 — 제안 다음 Task: TASK-JEJU-VISITJEJU-API-SAMPLE-VERIFY-V1

```
목적: key 취득 후 최소 샘플 호출로 스키마/커버리지/품질 확인
내용:
  - c1 (관광지) 소규모 샘플 → 필드 완전성 확인
  - c4 (음식점) 소규모 샘플 → phoneno 커버리지, 운영시간 존재 여부
  - 축제/행사 카테고리 샘플 → 날짜 필드 존재 여부
  - 상세 엔드포인트 존재 시 확인
branch: data/jeju-collection-v2
허용 호출: 각 카테고리 1~3페이지 (샘플 only)
```

### Step 3 — TASK-JEJU-PLACE-COLLECTION-V1 (샘플 검증 후)

```
Primary: VisitJeju API c1 (관광지) — 전수 수집
Supplement: KTO areaBasedList2 areaCode=39 — gap fill
공통 정책: data/multicity-common (dc6f9be) Place eligibility 5축 적용
```

### Step 4 — TASK-JEJU-FOOD-COLLECTION-V1

```
Primary: VisitJeju API c4 (음식점) — FINAL FREEZE 정책 준수
Supplement: KTO type39 detailIntro2 — phone gap 보강
필수: NAVER 최종 검증 (NAVER_FINAL_VERIFICATION_ONLY=YES)
```

### Step 5 — TASK-JEJU-EVENT-COLLECTION-V1

```
Primary: KTO searchFestival2 (areaCode=39, 날짜 필터)
Supplement: VisitJeju API 축제/행사 카테고리 (실측 후 결정)
적용 정책: Event freshness (ONGOING + 날짜 확정 UPCOMING 만)
```

---

## 10. 필수 검증 체크리스트

| # | 항목 | 결과 |
|---|---|---|
| 1 | COMMON_POLICY_COMMIT 기록 | ✅ dc6f9be |
| 2 | 공식 source별 capability 근거 확보 | ✅ |
| 3 | endpoint와 응답 구조 실측 | ⚠️ PARTIAL — key 없이 alive/error만 확인 |
| 4 | Existing Raw First 적용 | ✅ (jeju raw 없음 확인) |
| 5 | API 호출 횟수 기록 | ✅ API_CALLS=2 |
| 6 | 대량 crawl = 0 | ✅ |
| 7 | 제주 raw/normalized/candidate 본수집 = 0 | ✅ |
| 8 | Primary/Supplement 역할 결정 | ✅ |
| 9 | KTO 역할 판정 | ✅ TARGETED_ONLY |
| 10 | Place/Food/Event 다음 수집 전략 제안 | ✅ |
| 11 | master/common/기존 도시 branch 변경 = 0 | ✅ |
| 12 | secret scan PASS | ✅ (secret 값 없음) |

---

## 11. 최종 플래그

```
TASK_RESULT                    = HOLD

HOLD_REASON_1 = VISITJEJU_API_KEY_NOT_YET_OBTAINED
  실제 샘플 호출 불가 → food 운영시간, 축제 날짜 필드 미확인
  해제 조건: API key 취득 후 TASK-JEJU-VISITJEJU-API-SAMPLE-VERIFY-V1 완료

HOLD_REASON_2 = TOURAPI_VISITJEJU_NET_BLOCKED
  ECONNREFUSED — 대체로 api.visitjeju.net 사용 결정

HOLD_REASON_3 = VISITJEJU_EVENT_FRESHNESS_UNVERIFIED
  파일 데이터(16건, 연 1회) = NOT_NEEDED
  API 축제 카테고리 날짜 필드 실측 필요

---

PLACE_PRIMARY         = VisitJeju Open API (api.visitjeju.net, c1)
FOOD_PRIMARY          = VisitJeju Open API (api.visitjeju.net, c4)
EVENT_PRIMARY         = KTO TourAPI searchFestival2 (areaCode=39)
KTO_ROLE              = TARGETED_ONLY
IMAGE_SOURCE          = VisitJeju API repPhoto (JTO 공식)
MULTILINGUAL_SOURCE   = VisitJeju API locale (kr/en/zh/ja)

COMMON_POLICY_BRANCH  = data/multicity-common
COMMON_POLICY_COMMIT  = dc6f9be563983d369f400e4e8b0eea139f82da7c

VISITJEJU_API_ENDPOINT_STATUS = LIVE (https://api.visitjeju.net/vsjApi/contents/searchList)
TOURAPI_VISITJEJU_NET_STATUS  = BLOCKED (ECONNREFUSED)
VISITJEJU_API_KEY_STATUS      = NOT_YET_OBTAINED

API_CALLS             = 2   (endpoint alive 확인, key 없이)
WEB_COLLECTION        = 0
DATA_COLLECTION       = 0
DB_WRITE              = 0
MASTER_WRITE          = 0
PRODUCTION_WRITE      = 0
SECRET_LEAK           = 0
LARGE_CRAWL           = 0
BUSAN_DATA_CHANGE     = 0
GYEONGJU_DATA_CHANGE  = 0
SEOUL_DATA_CHANGE     = 0
JEJU_DATA_CHANGE      = 0

NEXT_TASK = TASK-JEJU-VISITJEJU-API-SAMPLE-VERIFY-V1
  (VisitJeju API key 취득 후 샘플 호출 → 스키마/커버리지/품질 확인)
```

---

TASK-JEJU-REGIONAL-SOURCE-CAPABILITY-CHECK-V1 완료보고서

작업을 완료했습니다.
