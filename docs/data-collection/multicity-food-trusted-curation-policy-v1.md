# GoKoreaMate — Multicity Food Trusted Curation Policy v1

| 항목 | 값 |
|---|---|
| 버전 | v1 |
| 작성일 | 2026-08-14 |
| 작성 TASK | TASK-COMMON-FOOD-TRUSTED-CURATION-POLICY-V1-R1 |
| 실증 도시 | 제주 (VisitJeju c4 1870건, Publication 260건) |
| 실증 commit | `80d67da` (Jeju Food Final QA PASS_WITH_WARN) |
| 공통 정책 commit | TBD (이 문서가 커밋될 SHA) |
| 적용 범위 | 전 도시 Food 큐레이션 (부산·서울·제주 및 이후 도시) |
| 관련 정책 | `multicity-food-discovery-collection-policy-v1.md` (수집 정책, FINAL FREEZE) |

---

## 이 문서의 목적

**Food Trusted Curation Policy**는 수집된 Food source universe에서
여행자에게 보여줄 Public Food Catalog를 큐레이션하는 원칙을 정의한다.

수집(collection)·Schema·API 규칙은
`multicity-food-discovery-collection-policy-v1.md` 참조.

이 문서는 수집 이후 단계:
- Source Universe → Publication 선별
- Publication → AI_AUTO 분리
- Hold/Reference 보존
- Contact·Navigation 검증 기준
- Individual/Collective 구분
- External Reputation 정책 현황

을 다룬다.

---

## 절대 고정 원칙

```
SOURCE_UNIVERSE_IS_NOT_PUBLIC_CATALOG = YES
WHY_RECOMMEND_REQUIRED_FOR_ALL_PUBLIC = YES
MENU_PRESENCE_IS_NOT_RECOMMENDATION = YES
QUOTA_BASED_SELECTION = FORBIDDEN
PUBLICATION_READY_DISTINCT_FROM_AI_AUTO = YES
HOLD_REFERENCE_DELETE_FORBIDDEN = YES
COLLECTIVE_ENTITY_SEPARATE_GATE = YES
EXTERNAL_REPUTATION_POLICY = NOT_YET_ESTABLISHED
GOOGLE_MAPS_VERIFICATION = FORBIDDEN
NAVER_FINAL_VERIFICATION_ONLY = YES
```

---

## RULE 1 — Source Universe ≠ Public Food Catalog

공식·관광 source의 Food directory 전체를 사용자에게 추천하지 않는다.

```
SOURCE_UNIVERSE_PURPOSE = 원천 보존 및 미래 재검토
PUBLIC_CATALOG_PURPOSE  = 여행자 추천 후보 (근거 있는 것만)
OPERATION               = SOURCE → PUBLICATION 별도 큐레이션
```

- Source Universe에 있는 모든 식당이 PUBLIC 후보인 것이 아니다.
- Source에서 제외됐다고 폐업·비활성 판정이 아니다.
- Source Universe는 삭제 금지. audit·미래 재검토를 위해 보존.

**제주 실증**: VisitJeju c4 1870건 → Publication 260건 (13.9%)

---

## RULE 2 — 모든 PUBLIC Food에는 `why_recommend`

PUBLIC Food entity는 반드시 아래 질문에 답할 수 있어야 한다:

> "왜 이 장소를 여행자에게 보여주는가?"

이 근거가 없으면 PUBLIC 승격 금지.

### 검증된 WHY_RECOMMEND 코드 (제주 실증)

| 코드 | 의미 | evidence 기준 |
|------|------|---------------|
| `LOCAL_SIGNATURE` | 도시 대표 음식 카테고리 + 해당 경험 체험 | 공식/관광 소스 근거 |
| `GUIDE_OR_STRONG_RECOGNITION` | 공식 가이드·인증 등재 (백년가게, 미쉐린, 공식 추천) | 공식 인증 출처 명시 |
| `OFFICIAL_EDITORIAL` | 관광기관 공식 편집 추천 | 공식 출처 명시 |
| `KOREAN_FOOD_EXPERIENCE` | 한국 음식 문화 체험 여행가치 | 공식 소스 근거 |
| `SPECIAL_FOOD_EXPERIENCE` | 야시장·시장·특별 food 환경 등 unique 경험 | 공식/관광 소스 근거 |
| `REGIONAL_GOOD_CHOICE` | 권역 내 검증된 좋은 선택지 | 공식 소스 근거 |
| `TRAVELER_UTILITY` | 여행자 편의 (공항 인근 등) | 공식 소스 근거 |

### LOCAL_REPUTATION (D-code) — 별도 처리

```
LOCAL_REPUTATION_COMMON_CORE_EVIDENCE = NO
LOCAL_REPUTATION_STATUS = UNVERIFIED_OPTIONAL_FUTURE_SIGNAL
```

- 공식 소스 intro text에 '소문난', '유명한' 등 포함
  → 공식 근거로서의 가치는 있으나, 검증된 reputation evidence가 아님
- 다른 강한 근거(LOCAL_SIGNATURE, GUIDE 등)와 함께 supplementary signal로만 사용
- D-code ONLY (다른 검증 근거 없음) → PUBLIC 승격 금지

**제주 실증**:
- D_CODE_PUBLIC_COUNT = 35 (30건: 다른 강한 근거 있음)
- D_CODE_ONLY_WHY_RECOMMEND_COUNT = 5 (미영이네, 아줄레주, 파라토도스, 이재모피자 제주점, 프릳츠 제주성산점)
- 5건은 VisitJeju 공식 소개문에서 '소문난'/'유명한' 키워드 추출 (consumer 리뷰 스크래핑 아님)
- 5건은 Jeju branch targeted correction 대상 (이 Common 문서에서 수정하지 않음)

---

## RULE 3 — Menu Presence ≠ Recommendation

지역 대표음식·한국음식을 판매한다는 사실만으로 PUBLIC 승격 금지.

```
MENU_ITEM_TAG = SUPPORTING_FACT_ONLY
MENU_ITEM_TAG_AS_WHY_RECOMMEND = FORBIDDEN
```

예:
- 흑돼지 판매 → LOCAL_SIGNATURE WHY_RECOMMEND 아님 (도시 대표 음식 카테고리이지만 이 식당이 그 경험의 좋은 대표인지는 별도 근거 필요)
- 돼지국밥 판매, 삼겹살 판매, 해산물 판매 → 동일
- 메뉴에 있다 = 판매 사실, 추천 근거 아님

`tag ≠ menu evidence`

---

## RULE 4 — Evidence Semantics 제한

다음은 서로 동일하지 않다.

| 항목 | 의미 | 오용 예시 |
|------|------|-----------|
| official directory 등재 | 소스에 있음 | → 맛집 추천 아님 |
| 소비자 `맛집` 태그 | 소비자 레이블 | → 공식 품질 근거 아님 |
| `BTS 추천` 등 소비자/미디어 태그 | 미확인 출처 | → 자동 quality evidence 아님 |
| 위생 인증 | 위생 합격 | → 맛 보증 아님 |
| 오래 운영됨 | 존속 기간 | → 최고 맛집 아님 |
| 공인 certification | 인증 보유 | → auto-include 신호일 뿐 |
| 소개문 '유명한' | 공식 소스 표현 | → 외부 검증된 reputation 아님 |

각 signal은 실제 source가 의미하는 수준까지만 사용한다.

---

## RULE 5 — Public Trust Signal ≠ Auto Include

백년가게·미쉐린 등 강한 공공 신뢰 signal도:

```
STRONG_PUBLIC_TRUST_SIGNAL = YES
FINAL_AUTO_INCLUDE = NO
```

복수 evidence 또는 충분한 여행가치와 함께 판단한다.

**제주 실증**: 백년가게 8건 → 전건 PUBLIC_STRONG 포함됐지만,
근거는 `GUIDE_OR_STRONG_RECOGNITION` + `LOCAL_SIGNATURE` (복수 근거).
`BAEKNYEON_AUTO_FINAL_INCLUDE = 0`

---

## RULE 6 — Quota 금지

도시별 PUBLIC 식당 수를 미리 고정하지 않는다.

```
QUOTA_BASED_SELECTION = FORBIDDEN
FORCED_COUNT_TARGET = FORBIDDEN
```

금지:
- "300개 맞추기"
- 권역별 동일 개수 강제
- 음식 종류별 quota
- 약한 식당을 숫자 채우기 위해 PUBLIC 승격

결과는 evidence-driven.

**제주 실증**: 목표 범위 '250~350'은 research guidance였으나 강제 아님.
실제 결과 260건 = evidence 기준.

---

## RULE 7 — Regional Coverage는 품질 대체가 아님

지역 coverage가 부족해도 낮은 evidence 식당을 강제 승격하지 않는다.

```
UNDERSERVED_REGION_FORCED_INCLUDE = FORBIDDEN
UNDERSERVED_REGION_ACTION = [후속 수집 priority, 수집 gap으로 기록]
```

**제주 실증**:
- 서귀포시/남원: pub=1, 섬속의섬/마라도: pub=0, 섬속의섬/추차도: pub=0
- 강제 include 없음 → 수집 한계로 기록

---

## RULE 8 — PUBLIC ≠ AI_AUTO

두 상태를 반드시 분리한다.

```
PUBLICATION_READY != AI_AUTO_FOOD_READY
PUBLICATION_READY_PURPOSE = 여행자 선택 가능 Food 카탈로그
AI_AUTO_FOOD_READY_PURPOSE = AI가 사용자 개입 없이 일정에 자동 배치 가능한 Food
```

### AI_AUTO Gate (최소 기준)

```
GATE_1: PUBLICATION_READY (pub_status starts with PUBLIC_)
GATE_2: WHY_RECOMMEND sufficient
GATE_3: INDIVIDUAL → contact_ready (검증된 연락처)
        COLLECTIVE → SPECIAL_MANUAL_CURATION_REQUIRED (자동 포함 금지)
GATE_4: INDIVIDUAL → navigation_ready (valid lat/lon)
GATE_5: NO_CRITICAL_ANOMALY
```

**제주 실증**: PUBLICATION_READY=260 → AI_AUTO=225 (DELTA=-35)
- COLLECTIVE 33건: SPECIAL_MANUAL_CURATION_REQUIRED → AI_AUTO=NO
- MISSING_COORD 2건(INDIVIDUAL): AI_AUTO=NO

---

## RULE 9 — Contact / Current-operation

### Individual Food Business

```
INDIVIDUAL_MISSING_VERIFIED_CONTACT → VERIFICATION_REQUIRED
INDIVIDUAL_UNVERIFIED_CONTACT_AI_AUTO = NO
LANDLINE_ONLY_REQUIRED = NO
```

검증된 연락처 유형 (모두 valid):
- landline (지역번호 포함 유선)
- 050/VoIP
- mobile (010/011 등) — **단, 직접 확인(MOBILE_VERIFIED_DIRECT_CONTACT) 필요**

```
MOBILE_VERIFIED_ACCEPTED = YES
VOIP_050_ACCEPTED = YES
PHONE_FORMAT_AS_QUALITY_GATE = FORBIDDEN
```

도서·소규모·개인 운영업체에서 mobile contact 정상일 수 있음.

### 검증 소스 우선순위

```
1. 공식 source (VisitJeju, KTO, 지자체)
2. 공식 사이트 직접 확인
3. Naver Place (외부 최종 검증)
4. NAVER_FINAL_VERIFICATION_ONLY = YES
5. GOOGLE_MAPS_VERIFICATION = FORBIDDEN
```

**제주 실증**:
- 우도해녀식당: 010- mobile → MOBILE_VERIFIED_DIRECT_CONTACT (VisitJeju+다이닝코드) → AI_AUTO=YES
- 방모루: source 010- → USER_MANUAL, Naver에서 064- 확인 → manual_verified_phoneno → AI_AUTO=YES

---

## RULE 10 — Individual ≠ Collective

Food entity semantic을 명확히 구분한다.

```
INDIVIDUAL_RESTAURANT     = 단일 식당 사업체
COLLECTIVE_MARKET         = 시장·시장 구역
COLLECTIVE_MARKET_STALL   = 시장 개별 매대
COLLECTIVE_FOOD_CENTER    = 복합 식당 건물
COLLECTIVE_FOOD_STREET    = 먹거리 거리 구역
MULTI_VENDOR_DESTINATION  = 복합 식음료 관광지
```

### Collective 처리 원칙

```
COLLECTIVE_PHONE_GATE = INDIVIDUAL_PHONE_GATE와 동일 적용 금지
COLLECTIVE_MARKET_MAIN_PHONE = RESTAURANT_INDIVIDUAL_PHONE 금지
COLLECTIVE_AI_AUTO = SPECIAL_MANUAL_CURATION_REQUIRED
COLLECTIVE_AI_AUTO_AUTO_YES = FORBIDDEN
```

Collective entity:
- contact_ready: COLLECTIVE_ENTITY_CONTACT_NOT_REQUIRED
- AI_AUTO: 항상 SPECIAL_MANUAL_CURATION_REQUIRED → AI_AUTO=NO
- 개별 식당 phone gate 강제 적용 금지
- Collective 전체 제외(BULK_EXCLUSION) 금지 — entity별 판단

**단**: Collective entity를 AI_AUTO에 포함하려면 별도 수동 큐레이션 및 policy 결정 필요.

**제주 실증**: PUBLIC_SPECIAL_PURPOSE 32건 + COLLECTIVE_FOOD_CENTER 1건(베테랑회센터) = 33건 → AI_AUTO=NO

---

## RULE 11 — Navigation 원칙

```
MISSING_OR_INVALID_NAVIGATION → AI_AUTO = NO
PUBLIC_POSSIBLE_WITHOUT_NAVIGATION = YES (추천 이유가 충분하면 PUBLIC 유지 가능)
AI_AUTO_REQUIRES_VALID_COORD = YES
```

- PUBLIC은 navigation 없이도 충분한 추천 이유가 있으면 가능
- AI_AUTO에는 반드시 valid lat/lon 필요
- Collective/market의 대표 navigation point는 individual restaurant 좌표와 다를 수 있음

**제주 실증**: PUBLIC MISSING_NAVIGATION=5건 → 모두 AI_AUTO=NO, 단 PUBLIC 유지

---

## RULE 12 — Hold / Reference 보존

PUBLIC에서 제외된 Food를 source에서 삭제하지 않는다.

```
HOLD_DELETE = FORBIDDEN
REFERENCE_ONLY_DELETE = FORBIDDEN
REVIEW_REQUIRED_DELETE = FORBIDDEN
```

보존 상태 예:
- `HOLD_WEAK_EVIDENCE`: 현재 근거 불충분, 미래 재검토 가능
- `REFERENCE_ONLY`: 공식 정보이지만 추천 범위 밖
- `REVIEW_REQUIRED`: 이상 감지, 수동 검토 필요

향후 재검토 트리거:
- 공식 신규 선정 (미쉐린, 백년가게 신규 등)
- 허용된 reputation evidence 신규 확보
- freshness/current operation 확인
- user demand signal (자동 승격 아닌 RE-REVIEW TRIGGER)

**제주 실증**: HOLD_WEAK_EVIDENCE=631, REFERENCE_ONLY=904, REVIEW_REQUIRED=75 모두 보존

---

## RULE 13 — Manual Decision Provenance

```
USER_MANUAL_CURATION_DECISION = 명시적 provenance로 보존
MANUAL_CASE_TO_GLOBAL_RULE = FORBIDDEN
```

Manual decision은 entity-specific이며 전역 규칙으로 일반화하지 않는다.

```
금지 예시:
- 5점 entity → auto include 규칙 생성 금지
- 1점대 entity → global auto exclude 규칙 생성 금지
- 한 개별식당의 010 성공 → 모든 010 무조건 active 판정 금지
- 한 collective 분류 → 유사 이름 entity 일괄 reclassify 금지
```

---

## RULE 14 — External Reputation 정책

```
EXTERNAL_REPUTATION_POLICY = NOT_YET_ESTABLISHED
```

이번 Task에서 새로운 reputation 정책을 만들지 않는다.

```
금지:
- Google/Naver rating 기반 전역 ranking
- review-count threshold
- arbitrary rating threshold
- consumer review scraping
- LOCAL_REPUTATION을 검증 없이 강한 common evidence로 승격
```

향후 별도 Policy Task에서 검토 가능 옵션:
- Option A: 공식 인증 DB 직접 매칭 (백년가게, 미쉐린 등)
- Option B: 관광공사 공식 추천 리스트 활용
- Option C: Policy 개정 후 허용 external source 명시 (현재 금지)

---

## RULE 15 — City-Specific 분리

다음은 이 공통 정책에 포함하지 않는다:

```
제주 전용 (승격 금지):
- 제주 signature 음식 목록 (흑돼지, 갈치조림, 보말칼국수 등)
- 제주 Food zone (제주시내, 서귀포시내, 성산, 한림 등)
- VisitJeju c4 contentsid·field 명세
- 제주 Publication 260건 수치
- 제주 AI_AUTO 225건 수치
- 백년가게 8건 명단
- 개별 식당 수동 결정 (우도해녀식당, 방모루, 베테랑회센터 등)

도시별 수치는 각 도시 branch에서 관리.
```

---

## Regression Fixtures

> 다음 12개 fixture는 결정론적 PASS/FAIL 검증이다.
> 도시별 구체 entity 없이 원칙 수준으로 검증한다.

| # | 시나리오 | 판정 기준 | 결과 |
|---|----------|-----------|------|
| F-01 | official directory 등재만 있고 WHY_RECOMMEND 없는 entity → PUBLIC | FORBIDDEN | FAIL |
| F-02 | signature menu item 보유만 있고 다른 근거 없는 entity → PUBLIC | FORBIDDEN | FAIL |
| F-03 | 강한 editorial/guide 인증 + valid entity → PUBLIC 후보 | ALLOWED | PASS |
| F-04 | 소비자 `맛집` 태그만 있는 entity → PUBLIC strong evidence | FORBIDDEN | FAIL |
| F-05 | 위생 인증만 있고 다른 근거 없는 entity → 맛 보증·PUBLIC 승격 | FORBIDDEN | FAIL |
| F-06 | individual + 검증된 연락처 없음 → AI_AUTO=YES | FORBIDDEN | FAIL |
| F-07 | 검증된 mobile contact 보유 entity → phone format만으로 AI_AUTO 제외 | FORBIDDEN | FAIL |
| F-08 | collective entity → individual phone gate 동일 적용 | FORBIDDEN | FAIL |
| F-09 | PUBLICATION_READY entity → AI_AUTO 자동 동일시 | FORBIDDEN | FAIL |
| F-10 | lat/lon 없는 individual entity → AI_AUTO=YES | FORBIDDEN | FAIL |
| F-11 | 권역 coverage 부족 → weak evidence entity 강제 PUBLIC 승격 | FORBIDDEN | FAIL |
| F-12 | manual rating case 1건 → global 식당 threshold 규칙 생성 | FORBIDDEN | FAIL |

---

## D-code LOCAL_REPUTATION 처리 결과 (제주 검증)

**제주 Final QA 80d67da 기준 감사 결과:**

| 항목 | 값 |
|------|----|
| D_CODE_PUBLIC_COUNT | 35 |
| D_CODE_ONLY_WHY_RECOMMEND_COUNT | 5 |
| D_CODE_WITH_OTHER_STRONG_REASON_COUNT | 30 |

**D-code ONLY 5건 (모두 PUBLIC_GOOD_CHOICE):**

| contentsid | 식당 | evidence source |
|------------|------|-----------------|
| CNTS_000000000020421 | 미영이네 | 소개문 '소문난' |
| CNTS_200000000008044 | 아줄레주 | 소개문 '유명한' |
| CNTS_200000000012635 | 파라토도스 | 소개문 '유명한' |
| CNTS_300000000013071 | 이재모피자 제주점 | 소개문 '유명한' |
| CNTS_300000000013080 | 프릳츠 제주성산점 | 소개문 '유명한' |

**영향도 평가:**
- 5건 / 260건 = 1.9% (낮은 비율)
- evidence source = VisitJeju 공식 소개문 키워드 (consumer 리뷰 스크래핑 아님)
- evidence_strength = MODERATE (STRONG 아님)
- 다른 강한 근거가 없는 상태로 PUBLIC — Policy와 불일치
- `JEJU_FOOD_TARGETED_CORRECTION_REQUIRED = YES`
- Common policy 자체는 D-code를 핵심 근거에서 제외하므로 PASS_WITH_WARN으로 진행 가능

**처리 방침:**
- 이번 Common Task에서 해당 entity 상태 수정하지 않음
- `data/jeju-collection-v2` branch에서 별도 targeted correction 필요:
  - Option A: 추가 강한 근거 발굴 후 유지 (예: LOCAL_SIGNATURE 해당 여부 재검토)
  - Option B: HOLD_WEAK_EVIDENCE로 변경 (소개문 키워드만으로는 insufficient)

---

## 부산·서울 재큐레이션 SSOT

이 정책을 부산·서울 Food 재큐레이션에 적용한다.

```
SAFE_TO_START_BUSAN_FOOD_RECURATION = YES
SAFE_TO_START_SEOUL_FOOD_RECURATION = YES
```

부산·서울 현재 수집 상태 (변경하지 않음, 참고만):
- 부산: Food Discovery V1 721건 closeout (food-discovery-collection-policy 기준)
- 서울: Food NONFOOD-FINAL-QA-R1 PASS, COLLECTION_STATUS=COMPLETE

재큐레이션 시 이 문서를 SSOT로 사용하여:
- Source Universe ↔ Public catalog 분리
- WHY_RECOMMEND 기준 적용
- AI_AUTO gate 적용
- D-code별도 처리 원칙 적용

---

## Safety

```
EXTERNAL_API_CALLS       = 0
WEB_SCRAPING             = 0
JEJU_DATA_CHANGE         = 0
BUSAN_CHANGE             = 0
SEOUL_CHANGE             = 0
MASTER_CHANGE            = 0
PRODUCTION_CHANGE        = 0
DB_CHANGE                = 0
SECRET_LEAK              = 0
```

---

## 변경 이력

| 날짜 | 변경 | SHA |
|------|------|-----|
| 2026-08-14 | 초안 작성 (제주 Food Final QA 80d67da 실증 기반) | TBD |

---

*FOOD_TRUSTED_CURATION_POLICY_STATUS = ACTIVE*
*JEJU_FOOD_TARGETED_CORRECTION_REQUIRED = YES*
*EXTERNAL_REPUTATION_POLICY = NOT_YET_ESTABLISHED*
