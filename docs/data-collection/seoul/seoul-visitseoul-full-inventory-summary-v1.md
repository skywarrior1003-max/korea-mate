# VisitSeoul Full LIST Inventory 실행 결과 요약 v1

| 항목 | 값 |
|---|---|
| TASK | TASK-SEOUL-VISITSEOUL-FULL-INVENTORY-LIST-ONLY-V1 |
| 실행일 | 2026-08-10 |
| branch | data/seoul-collection-v1 |
| HEAD 시작 | 55e7d10 |
| as_of | 2026-08-10 |
| 실행 모드 | FULL_LIST (--allow-full-inventory) |
| 수집기 | scripts/run-visitseoul-full-inventory-v1.py (v2.0.0-list-only) |

---

## A. FINAL SMOKE

**연유**: 첫 smoke에서 UNRESOLVED_CATEGORY = 3 (gate FAIL). 2개 코드 추가 후 재실행.

| 게이트 | 결과 |
|---|---|
| FINAL_SMOKE_PAGES | 5 (≤ 5) ✅ |
| FINAL_SMOKE_DETAIL_CALLS | 0 ✅ |
| FINAL_SMOKE_UNRESOLVED (1차) | **3 — GATE FAIL** |
| 신규 코드 추가 | Cl2d2s1(교육시설), Co6c2n2(자연관광) + 20개 예방 코드 추가 |
| FINAL_SMOKE_UNRESOLVED (재실행) | **0 — PASS** |
| DUPLICATE_DETECTION | PASS (0) |
| SOURCE_MUTATION_GUARD | PASS |
| SECRET_LEAK | 0 |
| **FINAL_SMOKE_PASS** | **YES** |

**smoke FAIL 원인 (코드맵 부재):**

| code | category path | UNRESOLVED 건수 | 추가 track |
|---|---|---|---|
| `Cl2d2s1` | 문화관광 > 교육시설 (도서관 등) | 2 | PLACE_CONDITIONAL_REVIEW |
| `Co6c2n2` | 자연관광 (하위 분류 없음) | 1 | PLACE_CONDITIONAL_REVIEW |

---

## B. FULL INVENTORY 실행 결과

| 항목 | 값 |
|---|---|
| 실행 시점 total_count | **3,765건** |
| page_size | 50 |
| expected_pages | **76** |
| pages_success | **76** |
| pages_failed | **0** |
| records_received | **3,765건** |
| unique CIDs | **3,765** |
| duplicate CIDs | **0** |
| page_overlap_count | **0** |
| SOURCE_MUTATED_DURING_RUN | **NO** |
| INVENTORY_SNAPSHOT_STATUS | **COMPLETE** |
| DETAIL_CALLS | **0** |
| TOTAL_API_CALLS | **76** (≤ 90 ✅) |
| output_sort | CID 오름차순 (deterministic) |

---

## C. CATEGORY CODE COVERAGE

| 항목 | 값 |
|---|---|
| 스크립트 보유 코드 수 | 43개 (21 original + 22 smoke-added) |
| 전체 observed codes | **59개** |
| 매핑된 코드 | **43개** |
| 미매핑(unmapped) 코드 | **16개** (text fallback 처리 중) |
| FULL_INVENTORY_UNRESOLVED_CATEGORY | **22건** (0.6%) |

**신규 발견 16개 미매핑 코드 (text fallback 처리 현황):**

| code | category path | count | text fallback 결과 | 권장 추가 track |
|---|---|---|---|---|
| `Cm1y8v1` | 음식 > 외국식 > 중식 | 54 | RESTAURANT_TRACK ✓ | RESTAURANT_TRACK |
| `Cn7k2s5` | 음식 > 외국식 > 기타외국식 | 36 | RESTAURANT_TRACK ✓ | RESTAURANT_TRACK |
| `Cr6o1h2` | 체험관광 > 산업관광 | 18 | EXPERIENCE_CANDIDATE ✓ | EXPERIENCE_CANDIDATE |
| `Cp3b3j9` | 자연관광 > 자연공원 | 17 | PLACE_CORE ✓ | PLACE_CORE_CANDIDATE |
| **`Cw8j0y7`** | **자연관광 > 자연경관(하천)** | **13** | **UNRESOLVED** | PLACE_CONDITIONAL_REVIEW |
| `Cx3e9k9` | 음식 > 외국식 > 퓨전음식 | 11 | RESTAURANT_TRACK ✓ | RESTAURANT_TRACK |
| `Ce7q5s7` | 숙박 > 호텔 | 11 | GENERAL_ACCOMMODATION_EXCLUDE ✓ | GENERAL_ACCOMMODATION_EXCLUDE |
| **`Cy5h2x9`** | **문화관광 > 테마공원** | **8** | **UNRESOLVED** | PLACE_CONDITIONAL_REVIEW |
| `Cp5i3g2` | 쇼핑 > 면세점 | 5 | SHOPPING_REVIEW ✓ | SHOPPING_REVIEW |
| `Cl1k5b1` | 역사관광 > 역사유적지 | 5 | PLACE_CORE ✓ | PLACE_CORE_CANDIDATE |
| `Ch4v8z7` | 숙박 | 4 | GENERAL_ACCOMMODATION_EXCLUDE ✓ | GENERAL_ACCOMMODATION_EXCLUDE |
| `Cp7e6o3` | 문화관광 > 행사시설 | 4 | PLACE_CONDITIONAL ✓ | PLACE_CONDITIONAL_REVIEW |
| `Cx2j0n1` | 음식 > 외국식 | 4 | RESTAURANT_TRACK ✓ | RESTAURANT_TRACK |
| `Ct1z4k9` | 쇼핑 > 대형마트 | 3 | SHOPPING_REVIEW ✓ | SHOPPING_REVIEW |
| `Ct9n1n3` | 숙박 > 호스텔 | 2 | GENERAL_ACCOMMODATION_EXCLUDE ✓ | GENERAL_ACCOMMODATION_EXCLUDE |
| **`Ca1z6p7`** | **역사관광** | **2** | **UNRESOLVED** | PLACE_CONDITIONAL_REVIEW |

**UNRESOLVED 발생 코드 (text fallback 미매칭 — 다음 코드맵 업데이트 필요):**

| code | path | UNRESOLVED 건수 | sample titles |
|---|---|---|---|
| `Cw8j0y7` | 자연관광 > 자연경관(하천) | ~13 | 청계천, 불광천, 홍제천 |
| `Cy5h2x9` | 문화관광 > 테마공원 | ~8 | 씨라이프 코엑스아쿠아리움, 서울랜드, 롯데월드 |
| `Ca1z6p7` | 역사관광 | ~2 | 중랑망우공간, 감사의 정원 |

> **원칙**: 22건 UNRESOLVED는 보존(raw inventory에 routing_track=UNRESOLVED_CATEGORY로 기록됨). 임의 승격 금지. 다음 코드맵 업데이트 시 추가.

---

## D. TRACK 정확 건수

| Track | 건수 | 비율 |
|---|---|---|
| RESTAURANT_TRACK | **1,259** | 33.4% |
| EVENT_TRACK | **1,190** | 31.6% |
| PLACE_CONDITIONAL_REVIEW | **577** | 15.3% |
| PLACE_CORE_CANDIDATE | **316** | 8.4% |
| SHOPPING_REVIEW | **262** | 7.0% |
| EXPERIENCE_CANDIDATE | **120** | 3.2% |
| UNRESOLVED_CATEGORY | **22** | 0.6% |
| GENERAL_ACCOMMODATION_EXCLUDE | **17** | 0.5% |
| TEMPLE_STAY_CANDIDATE | **2** | 0.1% |
| **TOTAL** | **3,765** | 100% |

> **비교**: dry-run 5페이지 추정치 vs 실제 전수
>
> | Track | 추정치 (× 3765) | 실제값 |
> |---|---|---|
> | RESTAURANT_TRACK | ~614건 | **1,259건** (2× 이상) |
> | EVENT_TRACK | ~825건 | **1,190건** (비슷) |
> | PLACE_CORE | ~384건 | **316건** (예상보다 적음) |
> | PLACE_CONDITIONAL | ~666건 | **577건** (예상보다 적음) |
>
> **핵심**: dry-run 표본 편향 확인. 실제 restaurant/event 비중이 훨씬 높고, place 비중이 낮음.

---

## E. RETAINED DETAIL PLAN (정확값)

> 기존 추정: ~1,050~1,715건 → **실제: 1,277건 (EXACT)**

| 항목 | 건수 |
|---|---|
| DETAIL_PRIORITY_CORE | 316 |
| DETAIL_PRIORITY_CONDITIONAL | 577 |
| DETAIL_PRIORITY_SHOPPING_REVIEW | 262 |
| DETAIL_PRIORITY_EXPERIENCE | 120 |
| DETAIL_PRIORITY_TEMPLE_STAY | 2 |
| **EXACT_PRELIMINARY_RETAINED_COUNT** | **1,277** |
| MAX_POSSIBLE_DETAIL_CALLS | 1,277 |
| RECOMMENDED_FIRST_DETAIL_BATCH | 300 (CORE+CONDITIONAL 우선) |

**SHOPPING pre-gate (list evidence):**

| 분류 | 건수 |
|---|---|
| STRONG_AUTO_INCLUDE | 플래그십/시장 키워드 포함 건 |
| STRONG_AUTO_EXCLUDE | 편의점/약국 등 명확 체인 건 |
| AMBIGUOUS_REVIEW | USER_REVIEW 필요 건 |

> shopping 상세 건수는 `docs/data-collection/seoul/seoul-visitseoul-detail-candidate-plan-v1.json` 참조.

---

## F. RESTAURANT / EVENT 정확 규모

| Track | 건수 | 비고 |
|---|---|---|
| RESTAURANT_TRACK | **1,259건** | 카페/한식/주점 포함. 별도 collector task 필요. |
| EVENT_TRACK | **1,190건** | 축제/공연/행사/전시회 포함. 별도 event collector task 필요. |

> 이 task에서 detail 호출 금지. 규모 산정 용도.

---

## G. ACCOMMODATION / TEMPLE STAY

| 항목 | 건수 |
|---|---|
| GENERAL_ACCOMMODATION_EXCLUDE | **17건** (curated place에서 제외) |
| TEMPLE_STAY_CANDIDATE | **2건** (숙박 제외 예외 적용) |
| TEMPLE_STAY_WRONGLY_EXCLUDED | **0** ✅ |

---

## H. MULTILINGUAL COVERAGE

| 언어 | 건수 | 비율 |
|---|---|---|
| ko | 3,765 | 100.0% |
| en | 3,610 | 95.9% |
| ja | 3,408 | 90.5% |
| zh-CN | 3,395 | 90.2% |
| zh-TW | 3,386 | 89.9% |

| 항목 | 값 |
|---|---|
| multi_lang_list 보유율 | **100% (3765/3765)** |
| ZH_VARIANT_DECISION | **PENDING** (zh-CN vs zh-TW 미결) |
| CID_SUFFIX_AUTOGENERATION | **NO** |
| RU/MS | 이 task에서 사용 안 함 |

---

## I. SAFETY

| QA 플래그 | 값 |
|---|---|
| VISITSEOUL_API_KEY_AVAILABLE | YES |
| API_KEY_EXPOSED | NO |
| FINAL_SMOKE_PASS | YES |
| FINAL_SMOKE_DETAIL_CALLS | 0 |
| FULL_LIST_INVENTORY_COMPLETED | YES |
| FULL_DETAIL_COLLECTION | NOT_STARTED |
| DETAIL_API_CALLS | 0 |
| TOTAL_API_CALLS | **76 / 90** |
| EXPECTED_PAGES | 76 |
| PAGES_SUCCESS | 76 |
| FAILED_PAGES | 0 |
| UNIQUE_CID_COUNT | 3,765 |
| DUPLICATE_CID_COUNT | 0 |
| PAGE_OVERLAP_COUNT | 0 |
| SOURCE_MUTATED_DURING_RUN | NO |
| FULL_INVENTORY_UNRESOLVED_CATEGORY | **22** (0.6%) |
| RESTAURANT_TRACK_PRESERVED | YES |
| EVENT_TRACK_PRESERVED | YES |
| GENERAL_ACCOMMODATION_EXCLUDED | YES |
| TEMPLE_STAY_WRONGLY_EXCLUDED | 0 |
| MULTILINGUAL_LINK_PRIMARY | multi_lang_list |
| CID_SUFFIX_AUTOGENERATION | NO |
| SEOUL_BULK_DETAIL_COLLECTION | NOT_STARTED |
| DB_CHANGE | 0 |
| SRC_CHANGE | 0 |
| UI_CHANGE | 0 |
| SECRET_LEAK | 0 |

---

## J. 산출물

| 파일 | 위치 | 설명 |
|---|---|---|
| `seoul-visitseoul-full-inventory-v1.jsonl` | `data/seoul-source-audit/` | 전체 inventory (3,765건, CID 정렬) |
| `seoul-visitseoul-full-inventory-attempts-v1.jsonl` | `data/seoul-source-audit/` | 76 page 호출 기록 |
| `seoul-visitseoul-full-inventory-manifest-v1.json` | `data/seoul-source-audit/` | run manifest + QA flags |
| `seoul-visitseoul-full-category-distribution-v1.json` | `docs/data-collection/seoul/` | track 분포 + category coverage (신규) |
| `seoul-visitseoul-detail-candidate-plan-v1.json` | `docs/data-collection/seoul/` | retained detail plan EXACT (신규) |
| `scripts/run-visitseoul-full-inventory-v1.py` | `scripts/` | 수집기 v2.0.0-list-only (신규) |

---

## K. 다음 단계 (MAIN 결정 필요)

### 즉시 가능 (별도 승인 필요):
1. **Retained Detail 수집**: `EXACT_PRELIMINARY_RETAINED_COUNT = 1,277건` detail API 호출
   - CORE 316 + CONDITIONAL 577 = 893건 (highest priority)
   - SHOPPING 262건 (pre-gate 후 실행)
   - EXPERIENCE 120건 + TEMPLE_STAY 2건
2. **코드맵 업데이트**: `Cw8j0y7`, `Cy5h2x9`, `Ca1z6p7` → UNRESOLVED 22건 해소
3. **Multi-lang 정책**: ZH_VARIANT_DECISION (zh-CN vs zh-TW 선택)

### 별도 task (규모 큼):
4. **Restaurant collector**: 1,259건 food/cafe detail — 규모 산정 완료
5. **Event collector**: 1,190건 event detail — 규모 산정 완료
6. **KTO credential**: collision 해소 후 targeted detail
