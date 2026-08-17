TASK-BUSAN-NONFOOD-FINAL-CURATION-AND-COMMON-POLICY-CLOSURE-V2 완료보고서

---

## Curation

| 항목 | 값 |
|---|---|
| SERVICE_UNIVERSE_BEFORE | 853 |
| BANSONG_REMOVED | 1/1 |
| ACCOMMODATION_BEFORE | 82 |
| STANDARD_ACCOMMODATION_EXCLUDED | 82 |
| EXPERIENTIAL_ACCOMMODATION_KEPT | **0** |
| ACCOMMODATION_RECLASSIFIED | 0 |
| FP_BEFORE | 14 |
| FP_KEEP | 8 |
| FP_EXCLUDE | 6 |
| FP_UNRESOLVED | **0** |

### 반송공원 제외 근거

`busan-K-00674` 반송공원: `EXCLUDED_LOW_TRAVEL_VALUE`  
KTO 원본 좌표 오류 (lat=19.69/lng=117.99, China region), VWorld 6회 시도 전부 NOT_FOUND.  
NAV 복구 불가 + 독립적 관광 가치 낮음 → service universe 제외.

### Accommodation 심사 결과

82건 전수 심사, 한옥 체험 / 템플스테이 / 역사 건축 숙박 = **0건** 확인.  
부산 accommodation 82건 전체: `EXCLUDE_STANDARD_ACCOMMODATION`.

주요 판정 사례:
- 시그니엘 부산 (Michelin Key 2) → EXCLUDE (럭셔리 호텔, 브랜드 등급은 KEEP 근거 아님)
- 더펫텔프리미엄스위트 (국내 유일 반려동물 전용) → EXCLUDE (개념 독창성이지 문화 체험 아님)
- 방가방가게스트하우스 (감천문화마을 내부) → EXCLUDE (위치가 관광지일 뿐, 숙박 자체는 표준)
- 아난티 앳 부산 코브 / 빌라쥬 → EXCLUDE (럭셔리 리조트)
- busan-VB-2273 = busan-K-00224 duplicate (아난티 코브) → 양쪽 모두 EXCLUDE

### FP 14건 판정

| canonical_id | name_ko | 판정 | 사유 |
|---|---|---|---|
| busan-K-00005 | 25의용단 | **KEEP** | 조선 의용단 기념관, KTO 등재, 전시 공간, 방문 가능 |
| busan-K-00053 | 영도관광실탄사격장 | **KEEP** | 부산 최초 실탄사격장, 관광 레저 활동 |
| busan-K-00321 | 임랑카라반파크 | **KEEP** | 해안 카라반 캠핑장 (숙박이 아닌 야외 레저) |
| busan-K-00322 | 명지시장 | **KEEP** | 50년 전통 활어시장, 전어 축제, 자갈치 수준 관광 |
| busan-K-00678 | UN조각공원 | **KEEP** | UN기념공원 인접, 21개국 참전 조각 34점, 국제 명소 |
| busan-K-00685 | 플루니티 | **KEEP** | KTO 관광두레 인증, 꽃차·다식 문화 체험 |
| busan-K-00755 | 주식회사뷰티홀릭 | **KEEP** | K-뷰티 DIY 체험, 광안리, 외국인 관광객 대상 |
| busan-K-00756 | 주식회사피알아이피 | **KEEP** | 독립책방 + 여행 체험 프로그램, 문화 관광 |
| busan-K-00035 | 사상문화원 | EXCLUDE | 주민 문화 시설, 관광 목적지 아님 |
| busan-K-00052 | 함지골청소년수련관 | EXCLUDE | 청소년 훈련 시설 |
| busan-K-00720 | 고래서이뻐 | EXCLUDE | 수공예 기념품 소품샵 (소매점) |
| busan-K-00752 | 주식회사감천아울 | EXCLUDE | 업사이클링 굿즈 제조업체, 방문 체험 없음 |
| busan-K-00753 | 주식회사아래모래 | EXCLUDE | 캐릭터 굿즈 제조업체 |
| busan-K-00754 | 주식회사어반힐링 | EXCLUDE | 여행사 (장소가 아닌 서비스) |

---

## Final Universe

| 항목 | 값 |
|---|---|
| SERVICE_UNIVERSE_FINAL | **764** |
| attraction | 710 |
| nature | 50 |
| event | 4 |
| experiential_accommodation | 0 |

---

## Navigation

| 항목 | 값 |
|---|---|
| NAV_READY | **764/764** |
| NAV_MISSING | 0 |

`BUSAN_NONFOOD_NAV_READY = 764/764`  
**BUSAN_NONFOOD_NAVIGATION_COMPLETE = YES**

---

## Image

| 항목 | 값 |
|---|---|
| IMAGE_RESOLVED | **756/764** |
| IMAGE_MISSING | 8 |
| VISUAL_ACCESS_READY | 756 |

`BUSAN_NONFOOD_IMAGE = 756/764`

### Image missing 8건 — 진정한 예외

모두 FP KEEP 8건. 이전 pipeline에서 이미 source_exhausted 처리됨. KTO contentId 없음.

| canonical_id | name_ko |
|---|---|
| busan-K-00005 | 25의용단 |
| busan-K-00053 | 영도관광실탄사격장 |
| busan-K-00321 | 임랑카라반파크 |
| busan-K-00322 | 명지시장 |
| busan-K-00678 | UN조각공원 |
| busan-K-00685 | 플루니티 |
| busan-K-00755 | 주식회사뷰티홀릭 |
| busan-K-00756 | 주식회사피알아이피 |

이미지 gate는 AI_AUTO 필수 조건이 아님. 이 8건은 AI_AUTO=True 유지.

---

## AI

| 항목 | 값 |
|---|---|
| AI_AUTO | **764/764** |
| AI_BLOCKED | 0 |

Blocker 0건: 모든 service entity가 AI 일정 후보.

---

## Common SSOT

| 항목 | 값 |
|---|---|
| COMMON_POLICY_COMMIT_BEFORE | 2476cac |
| ACTIVE_COMMON_BRANCH | data/multicity-common |
| GEOMETRY_POLICY_APPLIED | YES |
| ACCOMMODATION_POLICY_APPLIED | YES |
| COMMON_POLICY_COMMIT_AFTER | f9e3543 |

### 적용된 정책

1. **RULE-H~M** (geometry/navigation): `multicity-phone-semantics-and-geometry-policy-v1.md` PART 11 추가
   - Area/Line 좌표 예외 금지
   - 좌표 확보 우선순위 7단계
   - VWorld geocode 패턴
   - Bbox 기준 5개 도시
   - Anti-patterns 5종

2. **Accommodation Eligibility**: `multicity-place-accommodation-policy-v1.md` 신규
   - STANDARD_ACCOMMODATION_IS_NOT_CITY_SPOT
   - KEEP_EXPERIENTIAL_LODGING 조건 (한옥/템플스테이/역사 건축)
   - 부산 실증 82건 → 0건 KEEP

---

## QA

| Check | 결과 |
|---|---|
| BANSONG_IN_SERVICE | **0** ✓ |
| STANDARD_ACCOMMODATION_IN_SERVICE | **0** ✓ |
| FP_UNRESOLVED | **0** ✓ |
| NAV_MISSING | **0** ✓ |
| NAV_READY | **764/764** ✓ |
| WRONG_ENTITY_COORD | **0** ✓ |
| WRONG_BRANCH_COORD | **0** ✓ |
| INVENTED_COORD | **0** ✓ |
| AREA_LINE_FAKE_CENTROID | **0** ✓ |
| WRONG_ENTITY_IMAGE | **0** ✓ |
| FOOD_194_CHANGED | **0** ✓ |
| SECRET_LEAK | **0** ✓ |
| OTHER_CITY_DATA_CHANGED | **0** ✓ |
| MASTER_DIRECT_CHANGED | **0** ✓ |
| PRODUCTION_CHANGED | **0** ✓ |
| DETERMINISTIC_QA | **PASS** ✓ |

---

## Final Decision

```
BUSAN_NONFOOD_FINAL_QA              = PASS
BUSAN_DATA_STATUS                   = COMPLETE
BUSAN_NAVIGATION_COMPLETE           = YES
BUSAN_IMAGE_TRACK_COMPLETE          = YES (8 genuine exceptions: FP KEEP source_exhausted)
COMMON_POLICY_READY_FOR_NEXT_CITY   = YES
SAFE_TO_CLOSE_BUSAN_DATA            = YES
NEXT_CITY                           = GYEONGJU
```

---

## 커밋 이력 (이 task)

| 커밋 | 내용 | branch |
|---|---|---|
| 5756125 | Non-food canonical 853건 + geometry policy (RULE-H~M) | data/busan-nonfood-complete-v1 |
| bccdd62 | Phase 9-10 handoff + completion report (V1 task) | data/busan-nonfood-complete-v1 |
| 7a6c19a | Phase 1-7 curation (반송공원+82accom+FP14) | data/busan-nonfood-complete-v1 |
| f9e3543 | Common policy: RULE-H~M + accommodation policy | data/multicity-common |

---

## 부산 전체 최종 현황 (Food + NonFood)

| Dataset | Provenance | Service (Active) | Nav | Image | AI |
|---|---|---|---|---|---|
| busan-food-194-canonical-v1 | 194 | 194 | 194/194 | 191/194 | 194/194 |
| busan-nonfood-canonical-v1 | 853 | 764 | 764/764 | 756/764 | 764/764 |
| **COMBINED** | **1047** | **958** | **958/958** | **947/958** | **958/958** |

---

TASK-BUSAN-NONFOOD-FINAL-CURATION-AND-COMMON-POLICY-CLOSURE-V2 완료보고서
작업을 완료했습니다.
