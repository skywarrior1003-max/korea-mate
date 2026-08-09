# 서울 소스 Preflight 요약 (v1)

**TASK:** TASK-SEOUL-SOURCE-DISCOVERY-COVERAGE-AUDIT-V1  
**as_of:** 2026-08-09  
**branch:** data/seoul-collection-v1  
**GUARDRAIL_VERSION:** multicity-data-quality-guardrail-v1  
**RULES_LOADED:** YES  
**SEOUL_BULK_COLLECTION:** NOT_STARTED  

---

## 1. 소스별 Preflight 결과 요약

| 소스 | 운영자 | 접근 방식 | Preflight | 총 건수 | 판정 |
|---|---|---|---|---|---|
| KTO TourAPI (areaCode=1) | 한국관광공사 | REST API (인증키) | **PASS** | 관광지 421, 문화 220, 레포츠 60, 쇼핑 150, 음식 1,019 | **PRIMARY** |
| KTO EngService2 (areaCode=1) | 한국관광공사 | REST API (인증키) | **PASS (주의)** | areaCode=1 전체 725건 | 영문 보조 (FP 多) |
| VisitSeoul.net (영문) | 서울관광재단 | HTML (무인증) | **PARTIAL** | `english.visitseoul.net/attractions` 200 OK | 영문 enrichment 후보 |
| VisitSeoul.net (한국어) | 서울관광재단 | HTML (무인증) | **FAIL** | 주요 하위경로 404 (URL 구조 불명) | URL 재탐색 필요 |
| data.seoul.go.kr | 서울시 | REST API (인증키 필요) | **PARTIAL** | culturalEventInfo sample만 가능 | 공연/행사 보조 |
| 국가유산청 API (khs.go.kr) | 국가유산청 | REST API | **FAIL** | BLOCKED (경주와 동일) | 사용 불가 |
| 서울성곽 공식 사이트 | 서울시 | HTML | **PASS** | HTTP 200, 실내용 | 보조 |
| 국립중앙박물관 공식 | 국립박물관관리단 | HTML | **PASS** | HTTP 200, 실내용 | 보조 |
| 국립한글박물관 공식 | 국립한글박물관 | HTML | **PASS** | HTTP 200, 실내용 | 보조 |
| 경복궁/창덕궁/덕수궁 공식 | 궁능유적본부 | HTML | **FAIL** | Connection refused | 사용 불가 |
| KTO searchFestival2 (서울) | 한국관광공사 | REST API | **PARTIAL** | 2026-01기준 2건 (입력값에 민감) | 이벤트 보조 |

---

## 2. KTO TourAPI 상세 결과

### contentTypeId별 전건 수 (areaCode=1)

| contentTypeId | 분류 | 건수 | Preflight |
|---|---|---|---|
| 12 | 관광지 | **421** | REAL_RESULT ✅ |
| 14 | 문화시설 | **220** | REAL_RESULT ✅ |
| 15 | 축제/행사 | **84** | REAL_RESULT ✅ |
| 28 | 레포츠 | **60** | REAL_RESULT ✅ |
| 38 | 쇼핑 | **150** | REAL_RESULT ✅ |
| 39 | 음식점 | **1,019** | REAL_RESULT ✅ |
| 25 | 여행코스 | 0 | EMPTY_RESULT ⚠️ |

**합계 대상 후보 (12+14+28+38 중심):** 851건 (음식/행사 제외)

### detailCommon2 targeted preflight (3건 샘플)

| contentId | 예상 장소 | 결과 | 비고 |
|---|---|---|---|
| 126508 | 경복궁 | REAL_RESULT ✅ | title=경복궁, overview=True, addr=세종로 |
| 264337 | 창덕궁 (old) | EMPTY_RESULT ❌ | ID 변경됨, 아래 참조 |
| 2685706 | N서울타워 | EMPTY_RESULT ❌ | KTO 등재 없음, 아래 FALSE NEGATIVE 참조 |

### KTO contentId 주요 수정사항 (benchmark lookup)

| 장소명 | 기존 예상 cid | 검색 결과 cid | 비고 |
|---|---|---|---|
| 경복궁 | 126508 | 126508 ✅ | 정확 |
| 창덕궁 | 264337 | 2923488 → 창덕궁상품관 ⚠️ | 궁 자체 cid 추가 조사 필요 |
| 창경궁 | 126500 | 126511 ✅ | 실제 cid 126511 |
| 덕수궁 | 127000 | 130173 ✅ | 실제 cid 130173 |
| 경희궁 | 126998 | 126484 ✅ | 실제 cid 126484 |
| 종묘 | 264335 | 126510 ✅ | 실제 cid 126510 |
| 북촌한옥마을 | 264370 | 126537 ✅ | 실제 cid 126537 |

---

## 3. FALSE NEGATIVE 위험 목록 (KTO 단순 검색 미발견)

> **경주 교훈 재확인:** "KTO 키워드 검색 없음 ≠ KTO 미등재." targeted detail 우선.

| 장소명 | 검색어 시도 | KTO 검색 결과 | 조치 |
|---|---|---|---|
| 한양도성(서울 성곽) | 한양도성, 서울성곽 | 0건 (미발견) | VisitSeoul + 성곽 공식 사이트로 대체 |
| 숭례문(남대문) | 남대문, 숭례문 | 남대문시장 골목만 나옴 | KTO DB 직접 확인 필요 |
| 흥인지문(동대문) | 동대문, 흥인지문 | DDP/역사문화공원만 나옴 | DDP 별도 등재 (cid=2470006) 확인 |
| N서울타워(남산타워) | N서울타워, 남산서울타워, 남산타워 | 0건 | KTO 미등재 또는 관련사 cid |
| 창덕궁 (본체) | 창덕궁 | 창덕궁상품관(cid=2923488)만 | 창덕궁 본체 cid 추가 조사 필요 |

---

## 4. FALSE POSITIVE 위험 목록 (KTO sample 확인)

KTO areaCode=1 80건 샘플에서 FP 의심 8건 발견.

| 이름 | contentTypeId | FP 유형 | 추천 |
|---|---|---|---|
| 강동문화원 | 14 (문화시설) | FP_SOURCE_SCOPE_TOO_BROAD | MORE_RESEARCH |
| 관악문화원 | 14 (문화시설) | FP_SOURCE_SCOPE_TOO_BROAD | MORE_RESEARCH |
| 건국대학교 상허기념도서관 | 14 (문화시설) | FP_ENTITY_TYPE_MISMATCH | EXCLUDE 후보 |
| 경희대학교 자연사박물관 | 14 (문화시설) | FP_ENTITY_TYPE_MISMATCH | MORE_RESEARCH (개방형 박물관이면 KEEP) |
| 고려대학교 박물관 | 14 (문화시설) | FP_ENTITY_TYPE_MISMATCH | MORE_RESEARCH (개방형이면 KEEP) |
| (3건 추가 — 전체 GROUP A 목록 참조) | — | — | — |

> **주의:** 대학교 박물관은 일부 외부 관람객 개방 → 자동 EXCLUDE 금지. GROUP A 사용자 확인 필요.

---

## 5. EngService2 (영문 KTO) 분석

- `areaCode=1` 전체: **725건** (REAL_RESULT)
- `keyword=Seoul` 검색: **253건**
- **주의:** sample 결과에 `"ABC-Mart 롯데아울렛 서울역점"`, `"1stbutton 비뇨기과"` 등 비관광 항목 포함
- EngService2도 KTO KorService2와 동일한 FP 구조적 위험 있음
- 한국어 KTO에서 확정된 항목의 영문 제목/설명 보완 용도로만 사용 권장

---

## 6. VisitSeoul.net 구조 분석

| 엔드포인트 | HTTP | 결과 | 비고 |
|---|---|---|---|
| `visitseoul.net/` (KR 메인) | 200 | REAL_RESULT | 실내용 존재, 주로 EN 텍스트 감지 |
| `english.visitseoul.net/` | 200 | REAL_RESULT | 212KB, 실내용 |
| `english.visitseoul.net/attractions` | 200 | REAL_RESULT | 96KB, 장소 목록 |
| `visitseoul.net/attractions` (KR) | 404 | — | KR URL 구조 다름 |
| `visitseoul.net/sightseeing` | 404 | — | 404 |
| `visitseoul.net/food` | 404 | — | 404 |
| API 엔드포인트 탐색 | 404 | — | 구조화 API 미확인 |

- **API 없음 확인:** JSON API endpoint 탐색 실패
- **JSON-LD 없음:** `@type=TouristAttraction` 마크업 없음
- **활용 방안:** 영문 페이지 HTML 파싱 (targeted) 또는 KTO 주 cascade로 대체

---

## 7. 국가유산청 (khs.go.kr) 분석

| 엔드포인트 | HTTP | 결과 |
|---|---|---|
| khs.go.kr OpenAPI (서울 사적) | 200 | NON_PLACE_CONTENT (XML 항목 없음) |
| heritage.go.kr 검색 | 404 | — |
| cha.go.kr API | 200 | NON_PLACE_CONTENT |

**결론:** 경주와 동일하게 BLOCKED/NON_ACCESSIBLE 상태.  
**대안:** KTO contentTypeId=12/14 내 국가유산 항목 + 궁능유적본부 공식 사이트 (개별 targeted)

---

## 8. 서울 열린데이터광장 (data.seoul.go.kr)

| 데이터셋 | 샘플 접근 | 건수 |
|---|---|---|
| culturalEventInfo (공연정보) | PASS (인증키 없이) | 5건 샘플 (2026 재즈 공연 등) |
| TbViewTouristInfo (관광지) | 인증키 필요 | 0 |
| SeoulMuseumInfo (박물관) | 인증키 필요 | 0 |
| SeoulOpenMarketInfo (시장) | 인증키 필요 | 0 |

**결론:** 공연/행사 정보는 부분 접근 가능. 관광지 정보는 인증키 필요.

---

## 9. 소스 cascade 확정 (추천)

```
PLACE DISCOVERY:     KTO TourAPI KorService2 (areaCode=1, contentTypeId 12/14/28/38)
DETAIL ENRICHMENT:   KTO detailCommon2 + detailIntro2 + detailImage2 (targeted)
ENGLISH TITLE:       KTO EngService2 areaBasedList2 (FP 교차 검증 후)
IMAGE:               KTO detailImage2 (imageYN=Y, no subImageYN)
VISIT_ENRICHMENT:    english.visitseoul.net/attractions (HTML targeted, per-place)
HERITAGE_DETAIL:     서울성곽/국립박물관 공식 (targeted HTML, key sites only)
EVENT:               KTO searchFestival2 (eventStartDate 기준)
FALLBACK:            USER_REVIEW_REQUIRED
```

---

## 10. 다음 단계 제안

1. **GROUP A 사용자 확인** (`seoul-user-review-groups-v1.md`) → 대학 박물관 KEEP/EXCLUDE 결정
2. **GROUP B False Negative** → 한양도성·숭례문·N서울타워 alternate source 탐색
3. **창덕궁 본체 cid 확인** → targeted detailCommon2 추가 시도
4. **VisitSeoul KR URL 구조 탐색** → robots.txt 또는 sitemap.xml 확인
5. **서울 열린데이터광장 인증키 신청 검토** → 관광지/박물관 데이터 활용
6. **GROUP A/B/C 사용자 확인 완료 후** → SEOUL_BULK_COLLECTION 시작 승인

---

**SEOUL_BULK_COLLECTION = NOT_STARTED**
