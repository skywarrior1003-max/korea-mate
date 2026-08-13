TASK-JEJU-VISITJEJU-API-SAMPLE-VERIFY-V1-R2 완료보고서

| 항목 | 값 |
|---|---|
| 버전 | R2 |
| 작성일 | 2026-08-13 |
| TASK | TASK-JEJU-VISITJEJU-API-SAMPLE-VERIFY-V1-R2 |
| Branch | data/jeju-collection-v2 |
| Branch HEAD (before) | 9f5705f |
| TASK_RESULT | **PASS** |

```
COMMON_POLICY_BRANCH  = data/multicity-common
COMMON_POLICY_COMMIT  = dc6f9be563983d369f400e4e8b0eea139f82da7c

MASTER_COMMON_POLICY_MERGE = CANCELLED_OBSOLETE

VISITJEJU_API_KEY_CAPABILITY = AVAILABLE

API_CALLS         = 21  (VisitJeju searchList 21회, searchDetail 2회 시도 → 404)
FULL_CRAWL        = 0
DATA_COLLECTION   = 0
DB_WRITE          = 0
MASTER_WRITE      = 0
PRODUCTION_WRITE  = 0
SECRET_LEAK       = 0
```

---

## 1. 사전 검증

### 1.1 Branch 상태

| 항목 | 값 |
|---|---|
| 현재 branch | data/jeju-collection-v2 ✅ |
| v2 HEAD (before) | 9f5705f |
| origin/master | e1a397b (master 이동 — 이번 Task 범위 외) |
| origin/data/multicity-common | dc6f9be ✅ |

### 1.2 Existing Raw First 확인

```
data/tourapi/jeju/ — 없음
VisitJeju raw — 없음
EXISTING_RAW_FIRST_APPLICABLE = NO
```

### 1.3 API Key Capability

```
Windows User Environment Variable (VISITJEJU_API_KEY):
  Process scope: PRESENT
  User scope: PRESENT
  → VISITJEJU_API_KEY_CAPABILITY = AVAILABLE
  (key 값 비공개 — 길이·내용 출력 금지)
```

---

## 2. 인증 및 Key Parameter Casing 검증

### 실측 결과

| 시도 | 결과 |
|---|---|
| `apikey` (PDF 표, lowercase) | **FAIL** — 비-JSON 응답 (JSON parse error) |
| `apiKey` (PDF 예제 URL, camelCase) | **SUCCESS** — HTTP 200 / result=200 |

```
WORKING_KEY_PARAM = "apiKey"  (camelCase)
PDF 불일치: 문서 표에는 'apikey', 예제 URL에는 'apiKey'
실제 API 기준: 'apiKey' 를 SSOT로 사용
```

---

## 3. Locale 코드 검증

### PDF 명세 vs 실측

| locale | PDF 명세 | 실측 결과 |
|---|---|---|
| `kr` | 한국어 | ✅ CONFIRMED (totalCount=5938) |
| `en` | 영어 | ✅ CONFIRMED (동일 entity 번역 제공) |
| `jp` | 일본어 | ✅ CONFIRMED (NOT `ja` — 기존 가정 수정) |
| `cn` | 중국어 간체 | ✅ CONFIRMED |
| `zh` | 중국어 번체 | ✅ CONFIRMED |
| `my` | 말레이어 | 미실측 (이번 Task 제외) |

```
CONFIRMED_LOCALE_CODES = kr, en, jp, cn, zh
DEPRECATED_ASSUMPTION  = ja (JP locale는 jp 사용)
```

---

## 4. API 기본 응답 구조

### 4.1 Pagination 필드

| 필드 | 값 (locale=kr, page=1) |
|---|---|
| `result` | `200` |
| `resultMessage` | `SUCCESS` |
| `totalCount` | `5938` |
| `resultCount` | `100` |
| `pageSize` | `100` |
| `pageCount` | `60` |
| `currentPage` | `1` |
| `items` | `[100개]` |

### 4.2 Category 구조 (실측 확인)

| contentscd.value | contentscd.label | 설명 |
|---|---|---|
| `c1` | `관광지` | 관광지/체험/자연 |
| `c2` | `쇼핑` | 쇼핑 |
| `c4` | `음식점` | 음식점 |
| `c5` | `축제/행사` | 축제·행사 (기존 c5 가정 **확인**) |
| `c6` | `테마여행` | 테마여행 |

### 4.3 cid 파라미터 동작 확인

```
cid=c1 → totalCount=0, items=0
→ cid 파라미터는 category filter가 아니다.
→ cid = 특정 entity의 contentsid 직접 조회용
→ Category 필터링은 general list 응답에서 client-side 분류 필요
```

### 4.4 searchDetail 엔드포인트

```
GET /vsjApi/contents/searchDetail?apiKey=...&locale=kr&cid=CNTS_...
→ HTTP 404 (NOT FOUND)
→ searchDetail endpoint 존재하지 않음
→ 상세 엔드포인트 없음: PDF에 언급된 것과 다를 수 있음
```

---

## 5. 공통 Entity 스키마 (searchList 응답)

모든 콘텐츠 타입(c1~c6)이 동일한 15개 필드를 공유:

| 필드 | 설명 | 상태 |
|---|---|---|
| `contentsid` | 안정적 고유 ID (CNTS_XXXXXXXXXXXXXXX) | ✅ PRESENT |
| `title` | 제목 | ✅ PRESENT |
| `contentscd.value` | 카테고리 코드 (c1/c4/c5 등) | ✅ PRESENT |
| `contentscd.label` | 카테고리 한국어명 | ✅ PRESENT |
| `address` | 지번주소 | ✅ PRESENT |
| `roadaddress` | 도로명주소 | ✅ PRESENT |
| `latitude` | 위도 | ✅ PRESENT |
| `longitude` | 경도 | ✅ PRESENT |
| `phoneno` | 전화번호 | ✅ PRESENT (일부 `*` 값 있음) |
| `introduction` | 설명 | ✅ PRESENT |
| `alltag` | 태그 (운영/결제 힌트 포함 가능) | ✅ PRESENT |
| `tag` | 기본 태그 | ✅ PRESENT |
| `region1cd` | 광역 지역코드 | ✅ PRESENT |
| `region2cd` | 세부 지역코드 | ✅ PRESENT |
| `repPhoto.imgpath` | 대표 이미지 경로 | ✅ PRESENT |
| `postcode` | 우편번호 | ⚠️ 항상 null/absent |

**PDF에 없는 추가 실측 필드:**
- `roadaddress` (PDF는 address만 명시)
- `region1cd.refId`, `region2cd.refId`

**없는 필드 (PDF 명시 vs 실측):**
- `repPhoto.photoid`, `repPhoto.descseo`, `repPhoto.thumbnailpath` — 미확인 (repPhoto 객체 내부 구조 일부)
- `contentscd.refId` — 미확인

---

## 6. Place Sample 실측

### 6.1 Sample 결과 (c1 관광지)

```
contentsid  : CNTS_300000000015873
title       : 와우다이버스 스쿠버다이빙
contentscd  : c1 / 관광지
address     : 제주특별자치도 서귀포시 호근동 479-5
roadaddress : 제주특별자치도 서귀포시 태평로 119-1
latitude    : 33.2444824
longitude   : 126.5355615
phoneno     : 0507-1455-8864 ✅
introduction: 편의를 최우선으로 고려하는 다이빙센터
alltag      : 서귀포, 호근동, 스쿠버다이빙, 이색체험,실외,중,2~3시간
region1cd   : region2 / 서귀포시
region2cd   : 21 / 서귀포시내
repPhoto    : PRESENT ✅
```

### 6.2 Place 필드 충족도

| 필드 | 상태 | 비고 |
|---|---|---|
| stable ID | ✅ PRESENT | CNTS_ 형식 |
| title | ✅ PRESENT | |
| address / roadaddress | ✅ PRESENT | 두 종류 모두 |
| 위경도 | ✅ PRESENT | |
| phone | ✅ PRESENT | |
| description | ✅ PRESENT | |
| tag/alltag | ✅ PRESENT | 운영 힌트 일부 포함 (시간, 실내/외) |
| image | ✅ PRESENT | repPhoto |
| 지역코드 | ✅ PRESENT | region1/2 |
| detail URL | ⚠️ 추론 가능 | `/kr/detail/view?contentsid=` |
| 운영시간 | ❌ NOT_IN_API | alltag에 일부 힌트 가능 |
| modified/updated | ❌ NOT_IN_API | freshness 필드 없음 |
| 상세 endpoint | ❌ searchDetail 404 | |

**PLACE_PRIMARY 판정: CONFIRMED ✅**

---

## 7. Food Sample 실측

### 7.1 Sample 결과 (c4 음식점 — 2건)

**음식점 #1:**
```
contentsid  : CNTS_300000000013872
title       : 굴무기낭
address     : 제주특별자치도 제주시 애월읍 납읍리 2463
roadaddress : 제주특별자치도 제주시 애월읍 납읍남로2길 6 1동 1층
latitude    : 33.4331681
longitude   : 126.3278679
phoneno     : 0507-1484-1370 ✅
introduction: 제주 전통 발효음료 쉰다리로 만든 비건 베이커리 카페
alltag      : 애월카페, 제주쉰다리, 쉰다리빵, 비건카페, 천연발효빵, 비건베이커리
repPhoto    : PRESENT ✅
```

**음식점 #2:**
```
contentsid  : CNTS_300000000013986
title       : 소소샵
address     : 제주특별자치도 제주시 우도면 연평리 866 1층
roadaddress : 제주특별자치도 제주시 우도면 우도해안길 518 1층
latitude    : 33.5201996
longitude   : 126.9480709
phoneno     : 0507-1375-5251 ✅
introduction: 우도 해안도로에 위치한 업사이클링 카페
alltag      : 업사이클링, 오션뷰, 힐링, 우도, 카페,현금결제,카드결제,무료 WIFI
repPhoto    : PRESENT ✅
```

### 7.2 Food FINAL FREEZE 정책 대비 필드 충족도

| 필드 | 상태 | 비고 |
|---|---|---|
| stable ID | ✅ PRESENT | contentsid |
| 전화번호 (phoneno) | ✅ PRESENT (샘플 2건 모두) | |
| 주소 / 도로명주소 | ✅ PRESENT | |
| 좌표 | ✅ PRESENT | |
| 이미지 | ✅ PRESENT | repPhoto |
| introduction | ✅ PRESENT | 짧은 설명 |
| alltag | ✅ PRESENT | 결제수단 힌트 포함 가능 |
| **운영시간** | ❌ **NOT_IN_API** | UNKNOWN — 추론 금지 |
| **휴무일** | ❌ **NOT_IN_API** | UNKNOWN — 추론 금지 |
| **대표메뉴** | ❌ **NOT_IN_API** | UNKNOWN — 추론 금지 |
| **메뉴 evidence** | ❌ **NOT_IN_API** | UNKNOWN — 추론 금지 |
| 예약 | ❌ **NOT_IN_API** | UNKNOWN |
| **결제수단** | ⚠️ alltag에 비구조 힌트 | `현금결제,카드결제` 태그 존재. positive evidence로만 처리, 부재를 NO로 추론 금지 |
| 다국어 | ✅ PRESENT (다음 섹션) | |

```
FOOD_FIELDS_SUMMARY:
  PRESENT_IN_API     = contentsid, phoneno, address, roadaddress, lat/lon, image, introduction, alltag
  UNKNOWN_NOT_IN_API = 운영시간, 휴무일, 메뉴, 예약
  STRUCTURED_MISSING = 결제수단 (alltag에 비구조 존재 — positive evidence 취급, NO 추론 금지)

FOOD_PHONE_COVERAGE_SAMPLE = 2/2 (100% — 소규모 샘플 기준)
KTO_TYPE39_SUPPLEMENT_NEEDED = YES (운영시간/메뉴 gap 보완 가능성 확인 필요)
```

**FOOD_PRIMARY 판정: CONFIRMED (VisitJeju c4) — 운영시간 등은 UNKNOWN으로 기록 ✅**

---

## 8. Event Sample 실측 — 핵심 발견

### 8.1 Sample 결과 (c5 축제/행사)

**Event #1: CNTS_300000000016073**
```
contentsid  : CNTS_300000000016073
title       : 2025 우도 하고수동 해수욕장 썸머페스티벌
contentscd  : c5 / 축제/행사 ✅
address     : 제주특별자치도 제주시 우도면 연평리 1451-3
roadaddress : 제주특별자치도 제주시 우도면 우도로 153
latitude    : 33.506439
longitude   : 126.9534006
phoneno     : * (특수값)
introduction: 무더운 여름 일상으로부터의 탈출, 빛, 바다, 음악이 함께 어우러진...
alltag      : #제주썸머페스티벌, #우도축제 #하고수동해수욕장...
region1cd   : region3 / 섬 속의 섬
repPhoto    : PRESENT ✅
```

**Event #2: CNTS_300000000013658**
```
contentsid  : CNTS_300000000013658
title       : 낮보다 아름다운 밤, '제주 섬夜(섬야) 시즌' (야간 축제 모음)
contentscd  : c6 / 테마여행 (≠ c5! — 테마여행으로 분류됨)
address     : FIELD_ABSENT (테마여행은 단일 장소 없음)
latitude    : FIELD_ABSENT
longitude   : FIELD_ABSENT
phoneno     : FIELD_ABSENT
```

### 8.2 Event 날짜 필드 전체 스캔 결과 — 핵심

```
DATE FIELD SCAN (API searchList 응답):
  startdate          : ABSENT
  enddate            : ABSENT
  eventstartdate     : ABSENT
  eventenddate       : ABSENT
  startDate          : ABSENT
  endDate            : ABSENT
  eventDate          : ABSENT
  openDate           : ABSENT
  closeDate          : ABSENT
  usetime            : ABSENT
  usetimefestival    : ABSENT
  playtime           : ABSENT

→ 날짜 관련 필드 전무 (0/12)
```

### 8.3 홈페이지 vs API Event Freshness 비교

| 항목 | 홈페이지 (visitjeju.net) | API (api.visitjeju.net) |
|---|---|---|
| 이벤트 제목 | ✅ | ✅ |
| 이벤트 날짜 (시작/종료) | ✅ (YYYY.MM.DD 형식) | ❌ ABSENT |
| 상태 (진행중/예정) | ✅ 필터 존재 | ❌ ABSENT |
| 이미지 | ✅ | ✅ (repPhoto) |
| 주소 | ✅ | ✅ (c5 한정) |
| 안정적 ID | ✅ (contentsid) | ✅ (contentsid) |

```
WEBSITE_EVENT_FRESHNESS = AVAILABLE (날짜 필드 존재)
API_EVENT_FRESHNESS     = NOT_AVAILABLE (날짜 필드 없음)
```

### 8.4 Event c5 category 필터 확인

```
cid=c5 → totalCount=0, items=0
→ cid=c5는 category 필터로 작동하지 않음
→ c5 이벤트는 general list(cid 없이)에서만 수집 가능
→ totalCount=5938 중 c5 비율 = 별도 집계 필요 (bulk pagination 금지로 미집계)
```

### 8.5 Event Source 판정

```
VisitJeju API as EVENT_PRIMARY = NOT_POSSIBLE
  이유: searchList에 날짜 필드 없음 / searchDetail 404
  → Event freshness policy (ONGOING + 날짜 확정 UPCOMING) 불만족

VisitJeju API as EVENT_SUPPLEMENT = POSSIBLE
  이유: contentsid, title, address, coords, image 제공
  → KTO가 날짜 정보 조회 후 contentsid로 enrichment 가능

EVENT_PRIMARY = KTO TourAPI searchFestival2 (areaCode=39)
  이유: eventStartDate/eventEndDate 파라미터 지원 (기존 확인)
        ONGOING + UPCOMING 날짜 범위 필터링 가능
```

---

## 9. Multilingual Sample 실측

### 9.1 동일 Entity 언어별 비교

Reference: `CNTS_300000000015873` (와우다이버스 스쿠버다이빙)

| locale | totalCount | contentsid 일치 | title 번역 | introduction | address | phoneno |
|---|---|---|---|---|---|---|
| kr | 1 | ✅ | 와우다이버스 스쿠버다이빙 | PRESENT | 제주특별자치도... | ✅ |
| en | 1 | ✅ | Wow Divers Scuba Diving | PRESENT (44자) | 479-5 Hogeun-dong... | ✅ |
| jp | 1 | ✅ | ワウダイバーススキューバダイビング | PRESENT (20자) | 済州特別自治道西帰浦市... | ✅ |
| cn | 1 | ✅ | 哇潜水员水肺潜水 | PRESENT (16자) | 济州特别自治道西归浦市... | ✅ |
| zh | 1 | ✅ | 哇潛水員水肺潛水 | PRESENT (14자) | 濟州特別自治道西歸浦市... | ✅ |

### 9.2 Multilingual 주요 발견

```
MULTILINGUAL_ID_CONSISTENCY   = CONFIRMED (모든 locale에서 동일 contentsid)
MULTILINGUAL_TITLE_TRANSLATED = CONFIRMED (5개 언어 모두 번역)
MULTILINGUAL_ADDRESS_PROVIDED = CONFIRMED (언어별 현지 주소 표기)
MULTILINGUAL_PHONE_CONSISTENT = CONFIRMED (전화번호 동일)
MULTILINGUAL_COVERAGE_WARNING = YES
  → 일부 entity는 특정 언어 번역 없음 (totalCount=0)
  → 예: CNTS_300000000013614는 en/jp/cn/zh 번역 없음 (locale별 totalCount=0)
  → 번역 커버리지 = entity별 상이 (100% 아님)
```

---

## 10. 제주관광빅데이터플랫폼 역할 최종 판정

**URL:** `https://data.ijto.or.kr/prog/dataPick/bigdata/sub02/list.do`

| 제공 데이터 | 유형 |
|---|---|
| 입도 통계 (방문자 수/날짜별) | 분석 통계 |
| 소비 데이터 (카드 지출액) | 분석 통계 |
| 교통 (페리/크루즈) | 분석 통계 |
| 관광지 방문 통계 | 분석 통계 (ID/주소 없음) |
| 인구 통계 (외국인 국적별) | 분석 통계 |
| 지역 방문 통계 | 분석 통계 |

```
BIGDATA_PLATFORM_ROLE = ANALYTICS_SUPPLEMENT
  이유: canonical Place/Food/Event entity 데이터 없음
        장소 ID, 주소, 운영시간 등 구조화 데이터 미제공
        방문자 트렌드·소비·인구 통계 전문
  용도: 수집 후 데이터 검증(인기도), 품질 우선순위 참고
  제외: canonical source, Place/Food/Event primary
```

---

## 11. 최종 Source Architecture

실측 evidence 기준으로 확정:

```
PLACE_PRIMARY    = VisitJeju Open API (api.visitjeju.net, c1 관광지)
FOOD_PRIMARY     = VisitJeju Open API (api.visitjeju.net, c4 음식점)
EVENT_PRIMARY    = KTO TourAPI searchFestival2 (areaCode=39)
                   이유: VisitJeju API 날짜 필드 없음

PLACE_SUPPLEMENT  = KTO TourAPI areaBasedList2 (areaCode=39, gap fill)
FOOD_SUPPLEMENT   = KTO TourAPI detailIntro2 type39 (운영시간/메뉴 gap 보완 시도)
EVENT_SUPPLEMENT  = VisitJeju API c5 (title/address/coords/image 보강)

IMAGE_SOURCE     = VisitJeju API repPhoto (JTO 공식 이미지)
                   SUPPLEMENT: KTO firstimage

MULTILINGUAL_SOURCE     = VisitJeju API locale (kr/en/jp/cn/zh)
                          주의: 번역 커버리지 entity별 상이
TREND_ANALYTICS_SOURCE  = data.ijto.or.kr (방문자 통계, 품질 우선순위 참고)

KTO_ROLE =
  EVENT_PRIMARY    — searchFestival2 (날짜 필터 지원)
  FOOD_SUPPLEMENT  — detailIntro2 infocenterfood (운영시간/메뉴 보완 시도)
  PLACE_SUPPLEMENT — areaBasedList2 gap fill (VisitJeju 미수록 장소)
  LARGE_CRAWL      = FORBIDDEN (전체 제주 crawl 금지)
```

---

## 12. Website vs API 관계 분류

| 콘텐츠 유형 | 분류 |
|---|---|
| Place (c1) 관광지 기본 정보 | `API_COVERED` |
| Food (c4) 기본 정보 (phone/address/coords) | `API_COVERED` |
| Food 운영시간/메뉴/휴무일 | `API_MISSING` (KTO supplement) |
| Event (c5) 기본 정보 (title/address/image) | `API_COVERED` |
| Event 날짜 (시작/종료) | `WEBSITE_ONLY` (API에 없음) |
| 쇼핑 (c2) | `API_COVERED` |
| 테마여행 (c6) | `API_COVERED` |
| 추천/우수관광/웰니스 | `WEBSITE_ONLY` 또는 `c6 테마여행에 포함` |
| 실시간 제주 트렌드 | `WEBSITE_ONLY` |

---

## 13. 필수 QA 체크리스트

| # | 항목 | 결과 |
|---|---|---|
| 1 | COMMON_POLICY_COMMIT 기록 | ✅ dc6f9be |
| 2 | VISITJEJU_API_KEY_CAPABILITY = AVAILABLE | ✅ |
| 3 | 실제 인증 성공 | ✅ result=200/SUCCESS |
| 4 | key parameter casing 확인 | ✅ apiKey (camelCase) |
| 5 | locale 코드 검증 | ✅ kr/en/jp/cn/zh (jp ≠ ja) |
| 6 | Place sample 성공 | ✅ CNTS_300000000015873 |
| 7 | Food sample 성공 | ✅ 2건 (phoneno 확인) |
| 8 | Event source 실측 | ✅ c5 있음 / 날짜 없음 확인 |
| 9 | Event 홈페이지/API freshness 차이 구분 | ✅ WEBSITE=AVAILABLE / API=NOT_AVAILABLE |
| 10 | multilingual sample 검증 | ✅ 5개 locale 확인 |
| 11 | Food Unknown ≠ No | ✅ 운영시간 = UNKNOWN (추론 금지) |
| 12 | Primary/Supplement 근거 명확 | ✅ |
| 13 | KTO 역할 결정 | ✅ EVENT_PRIMARY + TARGETED_ONLY |
| 14 | 빅데이터플랫폼 역할 결정 | ✅ ANALYTICS_SUPPLEMENT |
| 15 | API_CALLS 기록 | ✅ 21회 |
| 16 | FULL_CRAWL = 0 | ✅ |
| 17 | DATA_COLLECTION = 0 | ✅ |
| 18 | secret scan PASS | ✅ (key 미출력) |
| 19 | master/common/production 변경 = 0 | ✅ |

---

## 14. 다음 제주 수집 Task 제안

### TASK-JEJU-PLACE-COLLECTION-V1 (즉시 설계 가능)

```
Primary: VisitJeju API (searchList, locale=kr, client-side c1 filter)
  → 전수 수집: pageCount=60 / pageSize=100 (최대 6000건 → c1만 집계)
  → 다국어: locale=en/jp/cn/zh (동일 contentsid cid 조회)
  → 주의: 번역 없는 entity는 UNKNOWN으로 표시
Supplement: KTO areaBasedList2 areaCode=39 (gap fill)
정책: multicity-common Place eligibility 5축 적용
```

### TASK-JEJU-FOOD-COLLECTION-V1

```
Primary: VisitJeju API (c4 filter, client-side)
  → phoneno PRESENT 기대 (샘플 2/2)
  → 운영시간/메뉴 = UNKNOWN (API_NOT_PROVIDED)
Supplement: KTO detailIntro2 type39 (운영시간/메뉴 보완 시도)
필수: NAVER 최종 검증 (NAVER_FINAL_VERIFICATION_ONLY=YES)
정책: Food FINAL FREEZE 준수
```

### TASK-JEJU-EVENT-COLLECTION-V1

```
Primary: KTO searchFestival2 (areaCode=39, eventStartDate/eventEndDate 필터)
  → ONGOING + 날짜 확정 UPCOMING 만
Supplement: VisitJeju c5 (contentsid로 title/address/image 보강)
정책: Event freshness policy (ONGOING + UPCOMING only)
주의: VisitJeju 홈페이지 날짜는 HTML 스크래핑 없이 KTO 날짜 사용
```

---

## 15. 최종 플래그

```
TASK_RESULT = PASS

COMMON_POLICY_BRANCH  = data/multicity-common
COMMON_POLICY_COMMIT  = dc6f9be563983d369f400e4e8b0eea139f82da7c

VISITJEJU_API_KEY_CAPABILITY = AVAILABLE
WORKING_KEY_PARAM            = "apiKey" (camelCase — PDF 표기 불일치 확인)
CONFIRMED_LOCALES            = kr, en, jp, cn, zh (jp ≠ ja)

TOTAL_CONTENT_COUNT  = 5938 (전체 카테고리, locale=kr)
CATEGORIES_CONFIRMED = c1(관광지), c2(쇼핑), c4(음식점), c5(축제/행사), c6(테마여행)

SEARCHDETAIL_ENDPOINT = NOT_AVAILABLE (HTTP 404)
CID_PARAM_BEHAVIOR    = ENTITY_ID_LOOKUP_ONLY (category filter 아님)

--- FOOD ---
FOOD_PHONE_PRESENT     = YES (샘플 기준)
FOOD_HOURS_IN_API      = NOT_IN_API (UNKNOWN)
FOOD_MENU_IN_API       = NOT_IN_API (UNKNOWN)
FOOD_PAYMENT_HINTS     = alltag (비구조, positive evidence만 허용)

--- EVENT ---
WEBSITE_EVENT_FRESHNESS = AVAILABLE
API_EVENT_FRESHNESS     = NOT_AVAILABLE (날짜 필드 없음)

--- SOURCE ARCHITECTURE ---
PLACE_PRIMARY           = VisitJeju Open API (c1)
FOOD_PRIMARY            = VisitJeju Open API (c4)
EVENT_PRIMARY           = KTO TourAPI searchFestival2 (areaCode=39)
PLACE_SUPPLEMENT        = KTO areaBasedList2 areaCode=39
FOOD_SUPPLEMENT         = KTO detailIntro2 type39 (운영시간 시도)
EVENT_SUPPLEMENT        = VisitJeju c5 (metadata enrichment)
IMAGE_SOURCE            = VisitJeju repPhoto
MULTILINGUAL_SOURCE     = VisitJeju locale (kr/en/jp/cn/zh)
TREND_ANALYTICS_SOURCE  = data.ijto.or.kr (ANALYTICS_SUPPLEMENT)
KTO_ROLE                = EVENT_PRIMARY + TARGETED_ONLY

API_CALLS         = 21
FULL_CRAWL        = 0
DATA_COLLECTION   = 0
DB_WRITE          = 0
MASTER_WRITE      = 0
PRODUCTION_WRITE  = 0
SECRET_LEAK       = 0
BUSAN_DATA_CHANGE     = 0
GYEONGJU_DATA_CHANGE  = 0
SEOUL_DATA_CHANGE     = 0
JEJU_DATA_CHANGE      = 0

NEXT_TASK = TASK-JEJU-PLACE-COLLECTION-V1
```

---

TASK-JEJU-VISITJEJU-API-SAMPLE-VERIFY-V1-R2 완료보고서

작업을 완료했습니다.
