# 서울 Nature/Trekking Travel Value — Live Validation 결과 v1

| 항목 | 값 |
|---|---|
| TASK | TASK-SEOUL-VISITSEOUL-NATURE-TREKKING-TRAVEL-VALUE |
| 실행일 | 2026-08-10 |
| branch | data/seoul-collection-v1 |
| HEAD (full inventory) | a3b599c |
| 분석 기반 | `data/seoul-source-audit/seoul-visitseoul-full-inventory-v1.jsonl` (3,765건) |
| DETAIL_CALLS | **119건** (≤ 120 한도) |
| DETAIL_CALL_ERRORS | **0** |
| 수집 언어 | ko |

---

## A. 선택 CID 구성 (119건)

| 유형 | 건수 | 대표 예시 |
|---|---|---|
| mountain | 29 | 수락산, 도봉산, 북악산, 인왕산, 관악산, 서울 둘레길, 봉산, 안산, 아차산, 백사실계곡, 수성동계곡 등 |
| landmark_viewpoint | 19 | 남산서울타워, 반포대교야경, 북악스카이웨이팔각정, 서울스카이, 서울달, 한강버스 등 |
| national_park | 17 | 북한산국립공원, 용산가족공원, 홍릉숲, 한강공원난지캠핑장, 서울식물원, 뚝섬한강공원 등 |
| city_park | 14 | 서울숲, 망원한강공원, 반포한강공원, 잠실한강공원, 올림픽공원, 월드컵공원, 북서울꿈의숲 등 |
| river_stream | 13 | 청계천, 불광천, 홍제천, 양재천&탄천, 뚝섬유원지, 한강, 서래섬, 안양천 등 |
| hangang_other | 10 | 한강 자전거 코스, 뚝섬/여의도 한강공원 수영장, 한강몽땅 여름축제 등 |
| nature_generic | 9 | 중랑천 제방, 노을공원 캠핑장, 노들섬, 용마산, 용산공원, 남산 하늘숲길 등 |
| walking_route | 8 | 서울 둘레길, 송파둘레길, 소월길, 예술로 산책로, 솔로투어코스 등 |
| **합계** | **119** | |

---

## B. 데이터 품질 요약

| 지표 | 값 | 비율 |
|---|---|---|
| DETAIL_SUCCESS | 119 / 119 | 100% |
| has_coordinates | 114 / 119 | 95.8% |
| has_distance (text 추출) | 19 / 119 | 16.0% |
| has_elevation (text 추출) | 8 / 119 | 6.7% |
| has_activities (keyword 탐지) | 61 / 119 | 51.3% |

---

## C. 좌표 가용성

VisitSeoul detail 응답의 `traffic.map_position_x` / `traffic.map_position_y` 필드:

- 114 / 119 레코드에서 좌표 확인 (95.8%)
- 5건 좌표 없음 (이벤트성 레코드 — 한강 역사탐방, 7월 한강 문화 행사 등 일시 프로그램)

**결론**: 자연/트레킹 장소는 좌표 가용성이 높음. 좌표 기반 지도 표시, 거리 계산, 근처 장소 추천 모두 가능.

---

## D. 트레킹 루트 데이터 가용성

### 거리(Distance) 데이터 — text에서 추출된 건

| CID | 제목 | 유형 | 거리(km) |
|---|---|---|---|
| KOP015873 | 서울 둘레길 코스 안내 | mountain | 156.5 |
| KOP027296 | 망우산 사색의 길 | mountain | 5.2 |
| KOP028658 | 소월길 | mountain | 3.7 |
| KOP029802 | 삼천사계곡 | mountain | 2.1 |
| KOP000034 | 청계천 | river_stream | 10.84 |
| KOP002257 | 불광천 | river_stream | 9.21 |
| KOP002287 | 홍제천 | river_stream | 13.92 |
| KOP002300 | 불광천 해담는다리 | river_stream | 62.0 (자전거 코스) |
| KOP002429 | 양재천&탄천 | river_stream | (포함) |
| KOP002871 | 한강 자전거 코스 | hangang | 240.0 |
| KOP001981 | 중랑천 제방 | nature_generic | (포함) |
| KOP9l9dhu | 초안산근린공원 맨발 황톳길 | national_park | (포함) |
| KOP023496 | 서울로7017 | landmark | (포함) |
| KOP036754 | 송파둘레길 | walking_route | 21.0 |
| KOP040546 | 21km 송파둘레길 벚꽃나들이 | walking_route | 21.0 |
| KOP001838 | 서울숲 | city_park | (포함) |
| KOP002909 | 잠원 한강공원 | city_park | (포함) |
| KOP003968 | 반포 한강공원 | city_park | (포함) |
| KOP5nlj26 | 남산 하늘숲길 | nature_generic | (포함) |

> **중요**: 거리 정보는 HTML `post_desc` 또는 `sumry` **자유 텍스트** 안에 서술형으로 포함됨.
> **구조화된 필드(distance_km, duration_min, difficulty_level, elevation_m)로 제공되는 스키마 없음.**

### 고도(Elevation) 데이터 — text에서 추출된 건

| CID | 제목 | 고도(m) |
|---|---|---|
| KOP003165 | 수락산 | 638 |
| KOP027690 | 봉산 | (포함) |
| KOPtr2tsi | 서달산 | (포함) |
| KOP2xzi3t | 서대문 홍제폭포 | (포함) |
| KOP000036 | 남산서울타워 | (tower height) |
| KOP021278 | 롯데월드타워 | (tower height) |
| KOP998h6q | 용마산 스카이워크 전망대 | (포함) |
| KOP005750 | 뚝섬 한강공원 수영장 | (수심) |

### TREKKING_ROUTE_DATA_AVAILABLE_IN_VISITSEOUL = **PARTIAL**

| 항목 | 가용 여부 |
|---|---|
| 장소 좌표 (출발점/대표점) | ✅ YES (95.8%) |
| 거리 정보 (text에 서술) | ⚠️ PARTIAL (16.0%, 자유 텍스트) |
| 고도/산 높이 (text에 서술) | ⚠️ PARTIAL (6.7%, 자유 텍스트) |
| 소요 시간 | ❌ NOT_AVAILABLE_IN_VISITSEOUL |
| 난이도 등급 (구조화) | ❌ NOT_AVAILABLE_IN_VISITSEOUL |
| GPS 트랙 / 경로 좌표 | ❌ NOT_AVAILABLE_IN_VISITSEOUL |
| 코스별 웨이포인트 | ❌ NOT_AVAILABLE_IN_VISITSEOUL |
| 계절별 적합도 | ❌ NOT_AVAILABLE_IN_VISITSEOUL |
| KML / GPX 파일 | ❌ NOT_AVAILABLE_IN_VISITSEOUL |

**구체 예시:**
- `서울 둘레길 코스 안내` (KOP015873): `post_desc`에 "총 연장 156.5km의 서울둘레길은 총 21개 코스" 기재.
  하지만 21개 코스 개별 거리/난이도/소요시간은 **별도 레코드 없음**.
  전체 코스 안내는 단일 CID(KOP015873)에 집약되어 있음.
- `북한산국립공원` (KOP000369): 단일 레코드, 공원 전체 소개. 개별 등산 코스(의상능선, 백운대 등) 별도 레코드 없음.
- `수락산` (KOP003165): description에 "등산코스가 있습니다" 언급, 난이도 설명 있으나 구조화 없음.

---

## E. 활동(Activity) 데이터

| 활동 | 탐지 건수 | 대표 장소 |
|---|---|---|
| walking / 산책 | 35 | 청계천, 서울숲, 송파둘레길, 남산공원 등 |
| cycling / 자전거 | 16 | 한강 자전거 코스(240km), 불광천, 양재천, 한강공원 |
| hiking / 등산 | 10 | 수락산, 북한산, 아차산, 응봉산 팔각정 등 |
| swimming / 수영 | 9 | 뚝섬/여의도 한강공원 수영장, 뚝섬유원지 등 |
| camping / 캠핑 | 7 | 한강공원 난지캠핑장, 노을공원 캠핑장, 중랑캠핑숲 |
| picnic / 피크닉 | 6 | 반포한강공원, 여의도공원, 올림픽공원 등 |
| trekking | 2 | 서울 둘레길, (기타) |
| jogging | 1 | 한강 코스 |

---

## F. 한강(Hangang) 유형 실증 결과

### F-1. Hangang Park 구조

VisitSeoul은 한강공원을 **다중 레코드**로 표현:
- `망원 한강공원` (Ce9z7g9 — city_park) — 공원 자체
- `뚝섬 한강공원 수영장` (Co0g3x0 — PLACE_CONDITIONAL) — 계절 시설
- `뚝섬 한강공원 눈썰매장` (Cd4y5u1 — EVENT) — 계절 이벤트
- `한강 자전거 코스` (Co0g3x0) — 활동/루트
- `한강몽땅 여름축제` (Cd4y5u1 — EVENT) — 기간 이벤트

**결론**: 한강 관련 콘텐츠는 단일 PLACE_ENTITY가 아니라 **PLACE + EXPERIENCE + EVENT 복합** 구조.

### F-2. 한강 자전거 코스 (KOP002871)

- 총 연장 약 **240km** (sumry 확인)
- `post_desc`: "난이도와 풍경에 따라 다양한 구간으로 나뉘어 있어 초보자부터 숙련된 라이더까지"
- **→ ROUTE entity**: 특정 좌표의 PLACE가 아니라 경로 자체가 여행 가치

### F-3. 한강 수상버스(한강버스, KOPmluo32)

- 2024 도입 신규 교통 수단
- landmark 카테고리로 등록 (Cl5y4k0)
- **→ TRANSPORT + EXPERIENCE 복합 entity**

---

## G. 야경(Night View) 특수 유형

야경 레코드 시리즈 (6건, VisitSeoul 큐레이션):

| CID | 제목 |
|---|---|
| KOP016319 | 광화문광장 야경 |
| KOP016321 | 남산서울타워 야경 |
| KOP016322 | 하늘공원 야경 |
| KOP016324 | 북악산 야경 |
| KOP016325 | 반포대교 야경 |
| KOP016326 | 매봉산 야경 |
| KOP016327 | 선유도 야경 |
| KOP038786 | 응봉산 야경 |

- 각 장소(남산서울타워, 광화문광장)의 **야경 경험**을 별도 CID로 등록
- 동일 PLACE + 시간대 컨텍스트 = PLACE_BASED_EXPERIENCE 패턴
- SSOT: 장소 entity(남산서울타워) ≠ 야경 experience entity — 별도 모델링 필요

---

## H. VisitSeoul 상세 응답 스키마 (확인된 필드)

| 필드 | 위치 | 내용 |
|---|---|---|
| `post_sj` | data 직접 | 제목 |
| `sumry` | data 직접 | 요약 (1~2문장) |
| `post_desc` | data 직접 | 본문 설명 (HTML, 0~8,000자) |
| `tag` | data 직접 | 태그 배열 또는 문자열 |
| `traffic.map_position_x/y` | data.traffic | WGS84 좌표 (lon, lat) |
| `traffic.adres` | data.traffic | 주소 |
| `traffic.subway_info` | data.traffic | 지하철 접근 정보 |
| `extra.cmmn_telno` | data.extra | 전화번호 |
| `extra.cmmn_hmpg_url` | data.extra | 공식 홈페이지 |
| `extra.cmmn_use_time` | data.extra | 운영시간 |
| `extra.cmmn_important` | data.extra | 특이사항/추가 안내 |
| `extra.trrsrt_use_chrge` | data.extra | 입장료 여부 (N=무료, F=유료) |
| `extra.disabled_facility` | data.extra | 장애인 편의시설 |
| `extra.business_days` | data.extra | 운영 요일 |
| `extra.closed_days` | data.extra | 휴무일 |
| `tourist.guidance_service` | data.tourist | 안내 서비스 |
| `tourist.safe_mng` | data.tourist | 안전 관리 |
| `multi_lang_list` | data 직접 | 다국어 CID 매핑 |

**루트/트레킹 구조화 필드: 없음** — post_desc HTML에 서술형으로만 포함.

---

## I. QA 플래그 최종

| 플래그 | 값 |
|---|---|
| DETAIL_CALLS | 119 |
| DETAIL_SUCCESS_RATE | 100% |
| DETAIL_CALL_LIMIT_RESPECTED | YES (≤ 120) |
| API_KEY_EXPOSED | NO |
| DB_CHANGE | 0 |
| SRC_CHANGE | 0 |
| NATURE_TRAVEL_VALUE_POLICY | VALIDATED |
| TREKKING_ROUTE_DATA_AVAILABLE_IN_VISITSEOUL | **PARTIAL** |
| PLACE_BASED_EXPERIENCE_MODEL_REQUIRED | **YES** |
| EVENT_PLACE_RELATION_REQUIRED | **YES** |
| USER_ROUTE_ENRICHMENT_ROLE | **DOCUMENTED** |

---

## J. 참조 파일

| 파일 | 설명 |
|---|---|
| `docs/data-collection/seoul/seoul-nature-travel-value-policy-v1.md` | 정책 문서 (이번 task) |
| `docs/data-collection/seoul/seoul-nature-trekking-value-live-validation-v1.md` | 이 문서 |
| `data/seoul-source-audit/seoul-visitseoul-full-inventory-v1.jsonl` | 전체 inventory (3,765건) |
