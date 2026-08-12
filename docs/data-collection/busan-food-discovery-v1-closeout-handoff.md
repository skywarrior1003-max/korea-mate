# 부산 Food Discovery V1 Closeout Handoff

> Branch: `data/busan-food-discovery-v1`  
> Final HEAD: `0a174fc` (TASK-BUSAN-FOOD-KTO-IMAGE-GAPFILL-R1)  
> JSONL SHA: `f3af0c8f112afaa66f63d2cd0ac14b225ef80621ef421c3746719c0acc193b3e`  
> 작성일: 2026-08-12  
> 상태: **CLOSEOUT COMPLETE** — 메인 노트북 handoff 대기

---

## 1. 최종 Candidate 수치 (721건 전체)

| 분류 | 수량 | 주요 플래그 |
|---|---|---|
| **INDIVIDUAL** | **684** | (플래그 없음) |
| COLLECTIVE | 3 | `ENTITY_QA: NOT_SINGLE_RESTAURANT_ENTITY` |
| EXCLUDED | 4 | `ENTITY_QA: FOOD_SCOPE_EXCLUDED` |
| DUPLICATE_CONFIRMED | 30 | `ENTITY_QA: DUPLICATE_CONFIRMED` |
| UNRESOLVED | 0 | — |
| **TOTAL** | **721** | — |

파일: `data/tourapi/enriched/busan/busan-food-discovery-candidates-v1.jsonl`

---

## 2. Entity 분류 상세

### 2-A. Collective 3건 — 반드시 보호

아래 3건은 **개별 식당이 아닌 복합 식음료 관광지**다.

| candidate_id | 장소명 | 분류 근거 |
|---|---|---|
| busan-VB-2097 | 영도해녀촌 | 여러 해녀 식당이 모인 복합 공간 |
| busan-VB-293 | 광안리 민락회타운 | 회센터 집합 상가 |
| busan-VB-294 | 해운대시장 | 전통시장 내 다수 식당 |

#### Collective 3건 Handoff 규칙 (메인 노트북에 반드시 전달)

- **Food/tourism destination으로 유지** — 삭제·제외 금지
- Individual restaurant 검색 결과에는 포함 안 함
- Phone Gate(Naver 미확인) 대상 아님
- `ENTITY_QA: NOT_SINGLE_RESTAURANT_ENTITY` 플래그로 generic `ENTITY_QA:*` 전체 제외 필터 적용 금지
- `ENTITY_QA: FOOD_SCOPE_EXCLUDED` 쿠킹클래스 4건과 명확히 구분

`COLLECTIVE_HANDOFF_RULE_PRESERVED = YES`

### 2-B. EXCLUDED 4건 (쿠킹클래스)

| candidate_id | 장소명 |
|---|---|
| busan-VB-1721 | 코리아쿠킹클래스 |
| busan-VB-2401 | 부산 오키친 쿠킹하우스 |
| busan-VB-2704 | 배로모디 쿠킹클래스 |
| busan-VB-518  | 부산 로컬푸드 쿠킹클래스 |

식당이 아닌 요리체험 공간 → 음식점 후보 제외, 향후 Experience 카테고리 검토 가능.

---

## 3. Phone 최종 상태 (INDIVIDUAL 684건 기준)

| 상태 | 건수 | 비율 |
|---|---|---|
| Phone verified | **677** | 98.9% |
| **OPEN_PHONE_VERIFICATION (Naver blocker)** | **7** | 1.0% |

### Phone Gate 7건 — Naver 차단 상태 유지

| candidate_id | 장소명 | 원인 |
|---|---|---|
| busan-K-00284 | 스시몬 | EXCLUDED_NO_VERIFIABLE_PHONE |
| busan-K-00285 | 청와정 | DingCode 사용 불가, KTO phone 없음 |
| busan-K-00512 | 튼튼장어 무한리필 | DingCode 사용 불가, KTO phone 없음 |
| busan-K-00536 | 부산조개창고 | KTO detailIntro2 phone 없음 |
| busan-K-00668 | 문토스트 | KTO detailIntro2 phone 없음 |
| busan-VB-1853 | 클래식 캠퍼 | VB 미확인 pending |
| busan-VB-2579 | 부산샌드 | VB 미확인 pending |

#### Phone 규칙

- `OPEN_PHONE_VERIFICATION = 7` 유지
- Naver map.naver.com / search.naver.com 차단 상태 — 다른 비공식 플랫폼 대체 금지
- **phone 미확보 ≠ 폐업** — 장소 자체 제외 금지
- 부산 Food closeout을 막지 않음

---

## 4. 영어 콘텐츠 최종 상태 (INDIVIDUAL 684건 기준)

```
NO_OFFICIAL_EN_MATCH_FOUND_IN_CURRENT_INVENTORY = 266
```

| 상태 | 건수 |
|---|---|
| description_en 보유 | 418 |
| **NO_OFFICIAL_EN_MATCH** | **266** |
| → KTO origin (264) | KorService2·EngService2 어디에도 exact match 없음 |
| → VB origin (2) | UC_SEQ=1065(삼진어묵) 전언어 미등록, UC_SEQ=1108(당감밀면) EN content 빈값 |

#### 반드시 이 표현 사용

> `NO_OFFICIAL_EN_MATCH_FOUND_IN_CURRENT_INVENTORY = 266`

#### 절대 금지 표현

- "영어가 없다" → ❌
- "폐업했다" → ❌
- "비활성 장소다" → ❌
- "잘못된 장소다" → ❌

**이 266건은 현재 확보·검증한 공식 EN inventory에서 exact match를 찾지 못했다는 의미뿐이다.**

KTO EngService2(부산 EN 171개 유효 레코드)와 FoodService EN(436건) 전수 대조 완료.  
신규 English 수집 시 해당 venue들의 EngService2 contentId를 별도 탐색하면 일부 회수 가능성 있음.

---

## 5. 이미지 최종 상태 (INDIVIDUAL 684건 기준)

| 상태 | 건수 | 비율 |
|---|---|---|
| image_urls 보유 | **601** | 87.9% |
| image_urls 없음 | **83** | 12.1% |
| → KTO detailImage2 NO_IMAGE_ITEM | 44 | KTO DB에 이미지 미등록 |
| → VB/FoodService 소진 | 39 | 공식 source 이미지 없음 |
| REVIEW_REQUIRED rights | **0** | — |

#### 이미지 정책 — 확정, 재검토 금지

`OFFICIAL_PUBLIC_IMAGE_USE = ALLOWED_WITH_REQUIRED_ATTRIBUTION`

- VisitBusan(www.visitbusan.net), KTO(tong.visitkorea.or.kr), 지자체, 공공데이터 API 이미지 사용 가능
- 필요한 provenance/출처표시 유지
- 일반 개인이 식별 가능하게 주요 피사체로 나온 사진 제외
- 공식 포스터·홍보물에 그룹·가수·연예인·공인이 포함된 경우 사용 가능
- **이미 승인된 source의 이용 가능 여부 반복 재조사 금지**
- 실제 이의제기 또는 조건 변경 발생 시: `HIDE_OR_REMOVE_AFFECTED_CONTENT_AND_REVIEW`

이미지 없는 83건 장소는 제외하지 않음.

---

## 6. 주요 Field Coverage (INDIVIDUAL 684건)

| 필드 | 보유 건수 | 비율 |
|---|---|---|
| address | 684 | 100% |
| city, lat, lng | 684 | 100% |
| name_ko | 684 | 100% |
| category | 684 | 100% |
| district | 683 | 99.9% |
| opening_hours_raw_text | 681 | 99.6% |
| phone | 677 | 98.9% |
| description_ko | 669 | 97.8% |
| signature_dishes | 662 | 96.8% |
| image_urls | 601 | 87.9% |
| name_en | 419 | 61.3% |
| description_en | 418 | 61.1% |
| closed_days | 270 | 39.5% |
| payment | 143 | 20.9% |

---

## 7. Payment / Reservation 확정 정책

### Payment

```
PAYMENT_LIST_SEMANTICS = CONFIRMED_SUPPORTED_METHODS_NON_EXHAUSTIVE
```

- `payment = ["credit_card"]`: 143건 (KTO chkcreditcardfood='가능' 기준)
- 목록에 없는 결제수단 = UNKNOWN (불가 판단 금지)
- '없음'(6건) · '지역화폐'(1건)은 list 구조에 안전하게 표현 불가 → 미반영

### Reservation

```
RESERVATION_AVAILABILITY_IS_NOT_RECOMMENDATION = YES
```

- KTO `reservationfood` raw evidence: 51건 보존 (`field_provenance._kto_detailIntro2_raw`)
- `required/recommended/not_needed` promotion: 0건 (현재 단계 미승인)

---

## 8. UNKNOWN 종료 항목

아래 항목은 현재 확보된 공식 source를 충분히 소진한 결과 evidence 없음 또는 안전한 매핑 불가 → **UNKNOWN으로 종료**:

| 항목 | 이유 |
|---|---|
| cuisine type | 공식 API에 cuisine category field 없음 |
| vegetarian / vegan / allergy | 공식 source 없음 |
| language.menu / language.staff | 공식 source 없음 |
| seating.solo_counter | 공식 source 없음 |
| accessibility.step_free | 공식 source 없음 |
| awards | 공식 source 없음 |
| neighborhood (정밀 동명) | address parsing 금지 |
| 남은 closed_days (414건) | 공식 source 소진 |
| 남은 signature_dishes (22건) | KTO/FoodService 정보 없음 |
| reservation recommendation | 승인된 vocabulary 없음 |
| payment negative/기타 | list 구조에 안전한 표현 불가 |
| image 없는 83건 | KTO DB 미등록 또는 source 소진 |
| EN content 없는 266건 | 현재 공식 EN inventory에 exact match 없음 |

**UNKNOWN ≠ NO (부정 사실 아님)**  
추가 수량 확보만을 위한 외부 재조사 금지.

---

## 9. 공식/공공 정보 사용 정책

```
OFFICIAL_PUBLIC_FACT_USE = ALLOWED_WITH_PROVENANCE
OFFICIAL_PUBLIC_IMAGE_USE = ALLOWED_WITH_REQUIRED_ATTRIBUTION
```

- VisitBusan / KTO / 지자체 / 공공데이터 API의 사실·이미지 이용 가능
- 이미 승인된 source의 이용 가능 여부 반복 재조사 금지
- 구체적 이의제기 또는 조건 변경 발생 시: `HIDE_OR_REMOVE_AFFECTED_CONTENT_AND_REVIEW`

---

## 10. Integrity / Schema

| 항목 | 결과 |
|---|---|
| TOTAL_RECORDS | 721 |
| NORMALIZATION_BYTE_IDENTICAL | YES |
| FINAL_SHA | `f3af0c8f112afaa66f63d2cd0ac14b225ef80621ef421c3746719c0acc193b3e` |
| UNAPPROVED_TOP_LEVEL_FIELDS | 0 |
| IMPROPER_FACT_PROMOTION | 0 |
| REVIEW_REQUIRED_ENTITY | 0 |
| NEW_SCHEMA_FIELD_COUNT | 0 |
| FIELD_PROVENANCE_MISSING (phone) | 0 |
| RESERVATION_IN_FACTS | 0 |

---

## 11. 부산·서울·경주 Food 수집 교훈 (MULTICITY_FOOD_COLLECTION_SPEC_FINAL_FREEZE 반영)

### KTO 시스템 관련

1. **KorService2 ≠ EngService2 contentId**: 동일 장소도 언어 서비스별 contentId 다름 → "같은 contentId + language 파라미터"로 다국어 회수 불가. 별도 EN 수집 후 lat/lng + 이름 identity 매칭 필수.

2. **FoodService(VisitBusan) vs KorService2**: 완전히 별개의 venue universe. UC_SEQ와 KorService2 contentId는 1:1 연결 불가 (phone_exact=0, latlng 50m 매칭도 false positive).

3. **detailImage2 totalCount=0 ≠ API 오류**: KTO DB에 이미지 미등록인 경우 정상 응답이지만 이미지 없음. 반드시 구분 보고.

4. **FoodService UC_SEQ = 다국어 공통 ID**: KO/EN/JA/ZHS/ZHT 모두 동일 UC_SEQ 사용 (99.8% 일치). 수집 시 UC_SEQ로 다국어 매칭 바로 가능.

5. **EngService2 FD 수**: 부산 EN inventory 171건 중 FD=9건만 food. 나머지는 AT/NA/HS 등 비식당 카테고리 → food venue 대부분 EngService2 미등록.

### 데이터 정책 관련

6. **payment 부정 사실 보존 불가**: `facts.payment` 리스트에 "credit_card 불가"를 안전하게 표현할 방법 없음 → negative는 field_provenance raw evidence만 보존.

7. **Reservation field 사전 설계 필요**: KTO `reservationfood` raw를 `required/recommended/not_needed` vocabulary로 매핑하는 규칙을 수집 전 확정해야 함.

8. **Collective 식음료 관광지 처리**: 시장·회타운·해녀촌 같은 복합 공간은 individual restaurant와 동일 파이프라인으로 처리 시 충돌. 별도 entity_type 구분 또는 사전 필터 설계 필요.

9. **VB FoodService ZHS/ZHT parser key**: `getFoodZhS` (대문자 S) 아닌 `getFoodZhs` (소문자 s) 사용 — 파서 오류 시 해당 언어 전체 누락.

10. **Phone gate 미확인 ≠ 폐업**: Naver 차단 환경에서 phone 미확인은 일반적 발생. `OPEN_PHONE_VERIFICATION` blocker 상태로 closeout 허용.

---

## 12. 다음 작업 순서

```
BUSAN_FOOD_CLOSEOUT = YES
NEXT_TASK = MULTICITY_FOOD_COLLECTION_SPEC_FINAL_FREEZE
```

부산 Food closeout 후 **Jeju로 바로 이동 금지.**

1. **MULTICITY_FOOD_COLLECTION_SPEC_FINAL_FREEZE** — 서울·경주·부산 교훈을 반영한 공통 Food 수집 규칙 FINAL freeze
2. **서울의 아직 끝나지 않은 non-Food/full data collection으로 복귀** → Seoul Final QA / handoff
3. 그 이후 Jeju

---

## 부록: Pipeline 커밋 이력 (food-discovery-v1 주요 태스크)

| 커밋 | 태스크 | 핵심 내용 |
|---|---|---|
| `3f4d260` | V1-MIGRATION-R2 | 721건 Food V1 envelope 이관 |
| `e00db20` | MAPPING-CLEANUP-R2 | legacy field 제거, phone 260건 이관 |
| `5893e77` | VISITBUSAN-FOODSERVICE-GAPFILL | FoodService phone/hours 112건 |
| `485f497` | ENTITY-REVIEW-PHONE-GATE-PREP | VB phone 334건, entity QA 305건 |
| `9d43870` | SCOPE-9-PHONE-GATE-6 | VB scope 9건, Naver gate 6건 |
| `335da97` | SCOPE-PERSISTENCE-CORRECTION | phone revert, gate v2(7건) |
| `6764c3a` | NAVER-PHONE-GATE-RETRY | BLOCKED, collective 3건 정리 |
| `c89d571` | EXISTING-SOURCE-RECOVERY-R2 | closed_days 9건, image rights |
| `0e6cf0a` | PAYMENT-RECOVERY-R2 | payment credit_card 143건 |
| `5c872ac` | EN-CROSSCAT-AUDIT-RECOVERY-R1 | K-00281 EN 1건 회수 |
| `0a174fc` | KTO-IMAGE-GAPFILL-R1 | 44건 NO_IMAGE_ITEM 확정 |
