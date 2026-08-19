# GoKoreaMate — Multicity Main Laptop Handoff v1

| 항목 | 값 |
|---|---|
| 작성 | TASK-MULTICITY-MAIN-LAPTOP-HANDOFF-CONTEXT-PACKAGE-V2 |
| 작성일 | 2026-08-19 |
| 브랜치 | `data/multicity-main-handoff-v1` |
| 베이스 | `data/multicity-common @ bc8d5d4aaa904ffa710e3f1203e58787de3fa44e` |
| 적용 도시 | 부산(Food+NonFood)·경주·서울·제주·전주 |

---

## Executive Summary

이 문서는 보조컴퓨터가 수행한 5개 도시의 여행 데이터 수집·큐레이션·검증 작업의
상황·원천·기준·시행착오·최종 결과를 메인 노트북에 전달하기 위한 최종 인수인계서다.

**메인 노트북이 이 문서를 통해 이해해야 하는 핵심**:

1. 각 도시 데이터는 **이미 완료된 SSOT**다. 재수집·재큐레이션 불필요.
2. 각 도시의 최종 데이터는 **지정된 branch/SHA/artifact**에 있다.
3. 숫자(총 레코드 vs 서비스 대상)의 의미를 이해하고 사용해야 한다.
4. 보조컴퓨터에서 이미 완료된 검증을 처음부터 반복하지 않는다.
5. 실제 통합에서 특정 문제가 발견되면 **그 문제만** 보조컴퓨터에 요청한다.

---

## 보조컴퓨터 역할

보조컴퓨터는 다음을 수행했다:

- 5개 도시 데이터 원천 조사·계약·수집
- source별 파서 개발·디버깅
- 서비스 유니버스 확정 (포함/제외 기준 적용)
- 좌표 QA·복구·예외 처리
- 이미지 rights 검증·확보
- AI eligibility 판정 (5축 정책 적용)
- 이벤트 freshness 처리
- 다음 도시에 적용할 공통 정책 수립·승격
- 각 도시 final QA·close-state 문서화

---

## 공통 수집·큐레이션 철학

### 1. 공식 원천 우선

모든 도시에서 **공식 관광 기관 제공 데이터를 primary**로 사용했다.
VisitBusan·VisitGyeongju·VisitSeoul·VisitJeju·전주시관광 등.
비공식 블로그·리뷰 사이트·UGC 기반 수집은 하지 않았다.

### 2. 좌표 없으면 서비스 불완전

Area/Line 장소라도 실제 방문 가능한 nav anchor를 확보하지 못하면 서비스 완료로 보지 않았다.
`SEARCHABLE_PLACE_REQUIRES_NAV_COORD = YES` (RULE-H, multicity-phone-semantics-and-geometry-policy-v1.md)

### 3. 표준 숙박업소 제외

`STANDARD_ACCOMMODATION_IS_NOT_CITY_SPOT` 정책에 따라
일반 호텔·모텔·게스트하우스·에어비앤비 등 표준 숙박업소는 city_spots 서비스 대상에서 제외했다.
(multicity-place-accommodation-policy-v1.md)

### 4. 5축 eligibility 판정

모든 장소에 5개 독립 축을 각각 판정했다:

| 축 | 의미 |
|---|---|
| SEARCHABLE | 사용자가 검색할 수 있는 장소 |
| EXPLORE | 지도/탐색에 표시되는 장소 (nav_coord 필수) |
| AI_ITINERARY | AI가 일정에 자동/조건부 포함할 수 있는 장소 |
| USER_CAN_SELECT | 사용자가 명시적으로 선택할 수 있는 장소 |
| USER_CAN_SAVE | 사용자가 저장할 수 있는 장소 |

`DATA PRESENCE ≠ AI RECOMMENDATION ELIGIBILITY`
(multicity-place-eligibility-policy-v1.md RULE 1)

### 5. 이미지 권리 검증

모든 이미지에 image_rights/image_rights_status를 명시했다.
Pixabay·Google/Naver 직접 복사·Michelin 사진·블로그 리뷰어 사진은 전면 금지.
(busan food handoff 이미지 정책 참조)

---

## 도시별 상세

---

### BUSAN FOOD (194)

**Branch**: `data/busan-food-discovery-v1`
**SHA**: `40ecc06498a786ede426d0dcd6ec7ddbb66f1136`
**Artifact**: `data/tourapi/normalized/busan/busan-food-194-canonical-v1.json`

#### 수집 목적
부산 공식 미식 가이드 전체를 여행 정보로 제공.
미쉐린 가이드·태그슐랑·부산 맛집 공식 가이드 수록 식당만 포함.

#### 수집 원천
| 원천 | 역할 |
|---|---|
| 부산 Gourmet Guide (미쉐린 2026: 55건 / 태그슐랑 2025: 20건 / busan-mat-2026: 119건) | 포함 대상 기준 (canonical source) |
| VisitBusan (visitbusan.com) | 설명·좌표·공식 이미지 primary |
| KTO TourAPI (KorService2) | 보조 (description·coords 보완) |
| VBC (VisitBusan Content JSONL) | 이미지 보완 |
| Naver Local API | 운영 상태 확인, Instagram/공식 링크 discovery |
| Instagram 공식 계정 og:image | 이미지 (business_provided, takedown_ready) |
| 식당 공식 홈페이지 og:image | 이미지 (특정 조건 시) |
| VWorld Geocoder | 좌표 복구 |

**사용하지 않은 원천**: Kakao Maps(WAF 차단), Pixabay, Google/Naver 이미지 직접 복사, Michelin 사진, 리뷰어 사진.

#### 수집·큐레이션 기준
- **포함 기준**: 3개 공식 가이드(미쉐린·태그슐랑·부산맛) 수록 식당 194건
- **AI_AUTO**: 194/194 (모두 DESTINATION_RESTAURANT)
- **IMAGE 계층**: VisitBusan > KTO > VBC JSONL > Instagram og:image > 홈페이지 og:image
- **NAV**: VWorld geocoding으로 88건 좌표 복구 (COORD-RECOVERY-V1)
- **Naver Local 사용 제한**: 운영 상태·링크 discovery만. raw API 별도 저장 금지.

#### 시행착오·교정
| 사례 | 내용 |
|---|---|
| VWorld regression (IMAGE-R1-V2) | VWorld geocoding 적용 후 할매재첩국 좌표 오류 발생 → 수동 정정 |
| AI_AUTO 초기 설정 오류 | V1에서 1,803/1,833(98%)이었던 AI_AUTO를 → V2 이후 교정 (실제 194/194로 재확인) |
| Instagram 차단 → 해제 | Naver 차단 이슈(NAVER-UNBLOCK-V1)로 Instagram 이미지 +15건 추가 |
| 슌사이쿠보 화명 | DIFFERENT_ENTITY로 AI_BLOCKED 처리됐다가 Close-V2에서 해제 |

#### 최종 결과
| 항목 | 값 |
|---|---|
| SERVICE (CANONICAL) | **194** |
| NAV_READY | **194/194** |
| IMAGE | **191/194** (진정한 예외 3건: 쥬가정효·멍텅구리·미소오뎅) |
| AI_AUTO | **194/194** |
| ACTIVE | **194/194** |

---

### BUSAN NON-FOOD (764)

**Branch**: `data/busan-nonfood-complete-v1`
**SHA**: `26fb3affceca253d805dc264e3fcaab7647672ef`
**Artifact**: `data/tourapi/normalized/busan/busan-nonfood-canonical-v1.json`

#### ⚠️ 수치 주의: 853 vs 764

| 항목 | 수치 |
|---|---|
| total_provenance (canonical 수록 전체) | **853** |
| excluded (표준숙박 82 + FP 6 + 기타 1) | 89 |
| **service_universe (실제 서비스 대상)** | **764** |

**853은 Non-Food 서비스 숫자가 아니다.** 실제 통합 대상은 764.

#### 수집 원천
- **Base**: `data/busan-enrichment-v1 @ 710403f` (KTO TourAPI + VisitBusan enrichment)
- attraction 717 + accommodation 82 + nature 50 + event 4 = 853 provenance
- 이미지: KTO TourAPI detailImage2

#### 큐레이션 기준
- **제외**: EXCLUDE_STANDARD_ACCOMMODATION (82건), FP_CONFIRMED_EXCLUDE (6건), 기타 (1건)
- **AI_BLOCKED**: accommodation 82 + FP 14 + 좌표 진정한 예외 1 = 97건
- **AI_AUTO**: 756건 (non-accommodation ACTIVE 모두)

#### 시행착오·교정
| 사례 | 내용 |
|---|---|
| 반송공원 좌표 오류 | KTO 좌표 (lat=19.69, lng=117.99) → 중국 좌표. VWorld/주소 모두 미확인. `COORD_GENUINE_EXCEPTION`으로 처리, evidence 문서화 |
| IMAGE_MISSING 48건 | FP 14 + accommodation 34. AI_AUTO 756건 100% image 보유 |

#### 최종 결과
| 항목 | 값 |
|---|---|
| total_provenance | 853 |
| **service_universe** | **764** |
| NAV_READY | 852/853 (반송공원 genuine exception 1건) |
| IMAGE (service) | AI_AUTO 756/756 = 100% |
| AI_AUTO | 756 |
| AI_BLOCKED | 97 |

---

### GYEONGJU (299)

**Branch**: `data/gyeongju-targeted-completion-v1`
**SHA**: `0d9ab8afe5acd398481c0826b793e50cfac48fa1`
**Artifact**: `data/gyeongju-final-release/gyeongju-canonical-places-v1.jsonl`

#### 수집 목적
경주 관광지·음식점을 공식 경주시 관광 source 기반으로 구축.
유네스코 세계유산 등 역사 관광지 중심.

#### 수집 원천
| 원천 | 역할 |
|---|---|
| VisitGyeongju (gyeongju.go.kr) | Primary — 관광지·이미지·설명 (공공저작물) |
| KTO TourAPI | 보조 — 좌표·추가 정보 |
| VWorld Geocoder | 좌표 복구 (116건 중 107건 성공) |

#### 수집·큐레이션 기준
- **포함**: attraction + restaurant (accommodation 0건)
- **제외**: EXCLUDED_LOW_TRAVEL_VALUE (1건: 경주생활체육공원), EXCLUDED_DUPLICATE (2건)
- **좌표**: 원본 186건 + VWorld road/jibun 107건 + 해안 bbox 완화 11건 + KTO 공식 2건
- **bbox 완화**: 감포읍·양남면 해안 장소는 경주시 행정구역 내 확인 후 `OUTSIDE_STRICT_BBOX_GENUINE_COASTAL_GYEONGJU` 부여
- **이미지**: KTO 67건 + gyeongju.go.kr 132건 (공공저작물, image_rights_status=VG_OFFICIAL_PUBLIC)

#### 시행착오·교정
| 사례 | 내용 |
|---|---|
| 116건 좌표 누락 | VWorld 7단계 복구로 107건 해결. 해안 bbox 완화 11건. 대안 주소 3건 |
| KTO_TYPE_UNKNOWN | 초기 처리에서 2건 미처리 → Close-V2에서 EXCLUDED로 정리 |
| 중복 레코드 | 캘리포니아비치·낭산 각각 KTO+GJ01 중복 → GJ01 유지, KTO 제외 |

#### 최종 결과 (Close-V2 기준)
| 항목 | 값 |
|---|---|
| total_provenance | 302 (ACTIVE=299, EXCLUDED=3) |
| **service_universe** | **299** (attraction=197, restaurant=102) |
| NAV_READY | **299/299** |
| IMAGE | **299/299** |
| AI_AUTO | **299/299** |
| COMMON_POLICY | f9e3543 (RULE-H~M, accommodation, eligibility) |

---

### SEOUL (1,837)

**Branch**: `data/seoul-targeted-completion-v1`
**SHA**: `a57e01c29296ce243e223a0ab70b9c0fd9cd3fd8`
**Artifact**: `data/seoul-final-release/seoul-canonical-places-v1.jsonl`

#### 수집 목적
서울 관광정보 전체 (관광지·식당·쇼핑·자연) + 공식 이벤트.
VisitSeoul이 PRIMARY_AND_SUFFICIENT 원천.

#### 수집 원천
| 원천 | 역할 |
|---|---|
| VisitSeoul (visitseoul.net) | Primary — 비식당 573건, 이벤트 |
| Seoul Food Discovery R1 | 식당 1,259건 (food-discovery-candidates-r1.jsonl) |
| VWorld Geocoder | 좌표 보완 |

#### 수집·큐레이션 기준
- **포함**: non-food 573 + food 1,259 + special2 2건 + event_track 4건
- **제외**: KOPc3g5o6 (서울, 세계와 노래하다 — MULTI_LOCATION_NON_PLACE, 복수 주소)
- **일반 숙박**: 기존 routing에서 GENERAL_ACCOMMODATION_EXCLUDE(17건) 이미 처리
- **AI 분류** (TV Gate 적용 후):
  - AI_AUTO_DEFAULT 771 (DESTINATION_RESTAURANT 223 + non-rest 548)
  - AI_CONDITIONAL 199 (SPECIALTY_INTEREST_RESTAURANT: 할랄·비건 등)
  - AI_NOT_AUTO_RECOMMENDED 837 (UTILITY_RESTAURANT)
  - AI_HARD_BLOCKED 30 (non-rest 27 + Incheon 공항 정보센터 3)

#### ⚠️ TV Gate에 의한 AI_AUTO 변화
V1(TARGETED-COMPLETION)에서 1,803/1,833(98.4%) AI_AUTO였던 것이
TV Gate(V3) 적용 후 771/1,837(42%)로 조정됨.
이는 오류가 아닌 **multicity eligibility 정책 준수 결과**:
restaurant 전건 AI_AUTO=True는 잘못된 초기 설정이었음.

#### ⚠️ SPECIALTY 199건 = AI_CONDITIONAL (하드차단 아님)
AI_ITINERARY_ELIGIBLE=CONDITIONAL.
사용자가 할랄·비건 등 전문 식이 맥락을 명시하면 AI 일정 포함 가능.

#### 시행착오·교정
| 사례 | 내용 |
|---|---|
| V1 AI_AUTO 전건 설정 | restaurant 전건 ai_auto=True → TV Gate로 수정 (V3) |
| Incheon 공항 3건 | AI_ITINERARY=NO override 적용 (좌표·SEARCHABLE 불변) |
| SPECIALTY 하드차단 오해 | V3에서 일시 AI_BLOCKED로 처리 → V4에서 AI_CONDITIONAL로 정정 |
| EVENT 4건 추가 | V4: 기존 handoff의 existing_detail_available=False 이벤트 4건 canonical 추가 |

#### 최종 결과
| 항목 | 값 |
|---|---|
| total_provenance | 1,838 (ACTIVE=1,837, EXCLUDED=1) |
| **service_universe** | **1,837** |
| NAV_READY | **1,837/1,837** |
| IMAGE | **1,836/1,837** (KOPgdf9ry 진정한 예외 1건) |
| AI_AUTO_DEFAULT | 771 |
| AI_CONDITIONAL | 199 |
| AI_NOT_AUTO | 837 |
| AI_HARD_BLOCKED | 30 |
| Final QA | PASS (25개 체크) |

---

### JEJU (1,496)

**Branch**: `data/jeju-targeted-completion-v1`
**SHA**: `b6539a96908a972705836067430223645473951f`
**Artifact**: `data/jeju-final-release/jeju-canonical-places-v1.jsonl`

#### 수집 목적
제주 관광지·식당·체험 활동 + 이벤트.
VisitJeju 공식 API 기반.

#### 수집 원천
| 원천 | 역할 |
|---|---|
| VisitJeju (visitjeju.net) | Primary |
| VWorld Geocoder | 좌표 복구 (NAV-3 해결) |

#### ⚠️ RULE-M bbox 수정 (V7)
- 이전 bbox: lat 33.1-33.6, lng 126.1-126.9 (너무 좁음 → 추자도·우도 EXCLUDED)
- 수정 bbox: lat 33.0-34.0, lng 126.0-127.0
- 수정 전 119건 OUTLIER → 수정 후 0건
- `VALID_COORD_CHANGED_FOR_BBOX_ONLY = 0` (기존 좌표 절대 불변)
- 이 수정이 `data/multicity-common @ bc8d5d4`에 반영됨 (RULE-M fix)

#### ⚠️ VisitJeju 전화번호 placeholder 처리
VisitJeju API는 `phoneno = "--"` (202건)처럼 명시적 비-값 전달.
이를 단순 null이 아닌 `SOURCE_PLACEHOLDER`로 분류.
(RULE-A, multicity-phone-semantics-and-geometry-policy-v1.md)

#### 시행착오·교정
| 사례 | 내용 |
|---|---|
| bbox 너무 좁음 (V1~V6) | 추자도·우도 포함 119건 OUTLIER → RULE-M bbox 수정 (V7) |
| CORE_DEST ai_auto=False 13건 | AI_AUTO 미설정 누락 → V7에서 일괄 수정 |
| NAV-3 (3건 좌표 누락) | 성안올레·애월몽달·제주환상자전거길 VWorld geocoding으로 해결 |
| 체험관 AI_AUTO (4건) | 오픈공간 형태 체험관 → ACTIVITY_EXPERIENCE AUTO 규칙 적용 |

#### 최종 결과 (V7 기준)
| 항목 | 값 |
|---|---|
| TOTAL | 1,607 |
| **ACTIVE (service_universe)** | **1,496** (place=1,230, food=256, event=10) |
| NAV_READY | **1,496/1,496** |
| FOOD_IMG | 254/256 |
| AI_AUTO | 895 |
| RULE-M outlier | **0** |
| FINAL_COMMON_COMMIT | bc8d5d4 (RULE-M fix 포함) |

---

### JEONJU (236)

**Branch**: `data/jeonju-targeted-completion-v1`
**SHA**: `b3645d711143234b79407529f1a9b15babe934c0`
**Artifact**: `data/jeonju-raw-collection-v1/jeonju-final-service-catalog-v1.json`

#### 수집 목적
전주 관광지·식당·체험 활동.
전주시 공식 관광정보(tour.jeonju.go.kr) 기반.

#### 수집 원천
| 원천 | 역할 |
|---|---|
| 전주시관광 (tour.jeonju.go.kr) | Primary |
| VWorld Geocoder | 좌표 복구 (건지산) |

#### 수치 구조

```
FINAL_UNIQUE      = 423
  ACTIVE_SERVICE  = 236  ← 실제 서비스 대상
  EVENT_EXPIRED   =   9  (기간 만료 이벤트)
  EXCLUDED        =  96
  RELATION_CONTEXT=  82  (관계/컨텍스트만)
```

**236이 전주 서비스 유니버스.** 423은 수집 파이프라인 전체.

#### 시행착오·교정
| 사례 | 내용 |
|---|---|
| 건지산 좌표 누락 | KTO에 없음. 공식 소스(dataSid=13619)도 좌표 없음. VWorld jibun geocoding (송천동1가 산1-1)으로 해결 → CASE A (VERIFIED_NAV_ANCHOR) |

#### 최종 결과
| 항목 | 값 |
|---|---|
| **service_universe** | **236** |
| SEARCHABLE | 236/236 |
| EXPLORE | 236/236 |
| AI_ITINERARY | 236/236 |
| USER_CAN_SELECT | 236/236 |
| USER_CAN_SAVE | 236/236 |
| AI_AUTO | 159 |
| AI_CONDITIONAL | 77 |
| IMAGE_GAP | 30 (NICE_TO_HAVE) |
| PHONE_GAP | 70 (NICE_TO_HAVE) |
| PUBLIC_BLOCKER_COUNT | **0** |

---

## BUSAN TWO-ARTIFACT CONTRACT ⚠️

> **Busan Food 194 and Non-Food 764 are two separate completed final datasets. Non-Food 764 does not contain Food 194. Both are required, and together they form the Busan service total of 958.**

### Food
- COUNT = 194
- BRANCH = `data/busan-food-discovery-v1`
- SHA = `40ecc06498a786ede426d0dcd6ec7ddbb66f1136`
- ARTIFACT = `data/tourapi/normalized/busan/busan-food-194-canonical-v1.json`
- REMOTE = SAFE

### Non-Food
- SERVICE_COUNT = 764 (total_provenance=853, excluded=89)
- BRANCH = `data/busan-nonfood-complete-v1`
- SHA = `26fb3affceca253d805dc264e3fcaab7647672ef`
- ARTIFACT = `data/tourapi/normalized/busan/busan-nonfood-canonical-v1.json`
- REMOTE = SAFE

### Total
- **194 + 764 = 958**
- SINGLE_COMBINED_ARTIFACT = NONE (정상 설계)

### 반드시 지켜야 할 사항
1. 764는 194를 **포함하지 않는다**
2. 194는 764의 이전 버전이 **아니다**
3. 둘은 서로 다른 카테고리의 COMPLETE dataset이다
4. 두 artifact **모두** 부산 서비스에 필요하다
5. 853은 Non-Food 서비스 숫자로 사용하면 **안 된다** (서비스 대상은 764)
6. 958 단일 파일이 없는 것은 **설계대로** (누락 아님)
7. 메인에서 194/764를 **처음부터 duplicate dataset으로 재검증하지 않는다**
8. 통합 시 두 artifact를 **각각 소비**하여 부산 958을 구성한다

---

## Common Policy

**SSOT**: `data/multicity-common @ bc8d5d4aaa904ffa710e3f1203e58787de3fa44e`

| 파일 | 내용 |
|---|---|
| `multicity-place-eligibility-policy-v1.md` | 5축 eligibility (SEARCHABLE/EXPLORE/AI_ITINERARY/USER_CAN_SELECT/USER_CAN_SAVE), DATA PRESENCE ≠ AI RECOMMENDATION ELIGIBILITY |
| `multicity-phone-semantics-and-geometry-policy-v1.md` | RULE-A~G (전화번호 상태 분류), RULE-H~M (좌표/navigation 정책) |
| `multicity-place-accommodation-policy-v1.md` | STANDARD_ACCOMMODATION_IS_NOT_CITY_SPOT |
| `multicity-event-freshness-policy-v1.md` | ONGOING/UPCOMING 7일 주기 freshness |
| `multicity-food-discovery-collection-policy-v1.md` | Food 수집 정책 FINAL FREEZE |
| `multicity-food-trusted-curation-policy-v1.md` | 신뢰 큐레이션 정책 |
| `multicity-data-quality-guardrail-v1.md` | 데이터 품질 가드레일 v1 |
| `multicity-common-baseline-policy-v1.md` | Branch 거버넌스·공통 정책 승격 원칙 |

### Busan-unique Geometry Doc 관계
`docs/data-collection/multicity-geometry-navigation-policy-v1.md` (data/busan-nonfood-complete-v1에만 존재):
- **판정**: SUPERSEDED_BY_COMMON
- 이 문서에서 정의된 RULE-H~M은 이후 common의 `multicity-phone-semantics-and-geometry-policy-v1.md`에 흡수됨
- 현재 common 정책이 SSOT이므로 이 문서는 역사 참조용

---

## 이미 끝난 검증 (도시별)

### BUSAN FOOD
- [x] 공식 가이드 3개 기준 194건 포함 확정
- [x] Naver Local 운영 상태 확인 (194/194 VERIFIED_ACTIVE)
- [x] 이미지 계층 적용 (191/194)
- [x] 진정한 예외 3건 문서화
- [x] AI_AUTO 194/194 확정
- [x] VWorld 좌표 복구 88건
- [x] IMAGE-FINAL-CLOSURE-V3 (140→191)

### BUSAN NON-FOOD
- [x] busan-enrichment-v1 853건 provenance 확정
- [x] Standard accommodation 82건 제외
- [x] FP 6건 제외
- [x] 반송공원 genuine exception 문서화
- [x] AI eligibility 판정 완료 (756 AI_AUTO, 97 blocked)
- [x] Curation-Closure-V2 최종 큐레이션 확정

### GYEONGJU
- [x] VisitGyeongju 302건 canonical 구축
- [x] 116건 좌표 복구 (VWorld 107 + 해안bbox 11 + KTO 2)
- [x] KTO_TYPE_UNKNOWN 해소 (0건)
- [x] EXCLUDED 3건 최종 결정
- [x] Close-V2 9개 QA 체크 PASS

### SEOUL
- [x] VisitSeoul 기반 1,837건 service universe 확정
- [x] TV Gate 적용 AI 분류 (771/199/837/30)
- [x] Incheon 공항 3건 AI_ITINERARY=NO override
- [x] SPECIALTY 199건 AI_CONDITIONAL 정정 (V4)
- [x] EVENT 4건 canonical 추가 (V4)
- [x] Final QA 25개 체크 PASS

### JEJU
- [x] RULE-M bbox 수정 (33.0-34.0, 추자도/우도 포함)
- [x] NAV-3 좌표 복구 (VWorld)
- [x] CORE_DEST 13건 AI_AUTO 수정
- [x] 체험관 4건 ACTIVITY_EXPERIENCE AUTO 적용
- [x] Final QA 12개 체크 PASS

### JEONJU
- [x] 건지산 NAV (VWorld jibun geocoding, CASE A)
- [x] EVENT_EXPIRED 9건 처리
- [x] EXCLUDED 96건 확정
- [x] RELATION_CONTEXT 82건 분류
- [x] 5축 eligibility 236/236 모두 확정
- [x] Deterministic QA PASS

---

## 메인 노트북이 처음 받아서 해야 할 일

1. **이 handoff 문서 먼저 읽기** — 각 도시 수치의 의미와 구조 이해
2. **artifact manifest 확인** — 각 branch/SHA/artifact 정확히 확인
3. **원격에서 exact SHA fetch** — `git fetch origin`, 각 final branch SHA 확인
4. **각 final artifact 확인** — 파일 존재·크기 확인 (내용 재검증 아님)
5. **현재 main의 city_spots schema와 비교** — 필드 mapping 확인
6. **통합에서 추가 확인 필요한 항목 목록 작성** — 구체적 문제만
7. **필요한 항목만 보조컴퓨터에 요청** — 하단 요청 형식 사용
8. **merge/import 계획 수립** — 메인 책임

---

## 다시 하지 말아야 할 작업

| 금지 | 이유 |
|---|---|
| COMPLETE 도시 전체 재수집 | 이미 완료된 SSOT 존재 |
| broad recovery 재실행 | 특정 문제 발견 시에만 해당 항목만 |
| 처음부터 재큐레이션 | 완료 canonical 원본 수정 금지 |
| 이미 종료된 duplicate 전체 감사 | Close 단계에서 완료 |
| canonical 원본 임의 수정 | SSOT 훼손 금지 |
| 숫자 차이만 이유로 전체 감사 재시작 | 853≠764, 423≠236 모두 설명된 정상 차이 |
| source-specific 문제를 common으로 확대 | 도시별 특수 케이스 별도 처리 필요 |
| 부산 194/764 duplicate 재검증 | 독립 dataset, 중복 아님 |
| 958 단일 파일 없다고 부산 재작업 | TWO-ARTIFACT 설계가 정상 |

> **단**: 메인 실제 통합에서 **구체적인 충돌/결함**이 발견되면 그 문제만 보조컴퓨터에 요청.

---

## Main → Auxiliary 추가 요청 계약

메인 노트북이 추가 확인이 필요한 경우 다음 형식으로 요청:

```
CITY:               [Busan / Gyeongju / Seoul / Jeju / Jeonju]
TARGET_BRANCH:      [exact branch name]
TARGET_SHA:         [expected full SHA]
TARGET_ARTIFACT:    [파일 경로]
MAIN_CONTEXT:       [현재 main에서 어떤 작업 중인지]
MAIN_FOUND_ISSUE:   [발견한 구체적 문제]
EXPECTED:           [예상했던 값/상태]
ACTUAL:             [실제 값/상태]
NEEDED_CHECK:       [보조컴퓨터에서 확인해야 할 것]
DO_NOT_TOUCH:       [변경하면 안 되는 것]
```

**원칙**: `부산 다시 검증해줘`처럼 broad 요청 금지.
구체적 artifact의 구체적 필드·수치 문제만 요청.
보조컴퓨터는 요청받은 범위만 추가 검증.

---

## The main laptop must consume these completed SSOT artifacts and must not restart collection, curation, broad recovery, or duplicate validation from scratch.
