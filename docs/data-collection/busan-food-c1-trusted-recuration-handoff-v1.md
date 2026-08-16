# Busan Food C1 Trusted Recuration — Handoff V1

**Task ID**: TASK-BUSAN-FOOD-TRUSTED-RECURATION-V1  
**Date**: 2026-08-14  
**Branch**: data/busan-food-discovery-v1  
**Common Policy Commit**: 2476cac (origin/data/multicity-common)  
**Authored by**: Claude Sonnet 4.6

---

## §0 Purpose

Common Food Trusted Curation Policy (RULE 1–15, commit 2476cac)를 부산 Food Discovery 파이프라인 전체에 적용하여, 부산 Food Trusted Publication Catalog를 최초 생성한다. Multi-city 공통 정책의 첫 번째 도시 적용 검증이다.

---

## §1 Source State

| 항목 | 수치 |
|------|------|
| BUSAN_FOOD_SOURCE_UNIVERSE | 721 records |
| 소스파일 | `data/tourapi/enriched/busan/busan-food-discovery-candidates-v1.jsonl` |
| Discovery SHA | `f3af0c8f112afaa66f63d2cd0ac14b225ef80621ef421c3746719c0acc193b3e` |
| Guide 카탈로그 | `out/data/restaurants.json`, 194 records |
| BUSAN_EXISTING_PUBLIC_BEFORE | 194 (restaurants.json, is_ai_usable=TRUE) |

**Source Universe 구성**

| 접두어 | 수 | 출처 |
|--------|----|------|
| busan-F-XXXXX | 437 | VisitBusan FoodService API |
| busan-K-XXXXX | 266 | KTO type39 (음식점) |
| busan-VB-XXXXX | 18 | VisitBusan web scraping |

**Entity 구분**

| 구분 | 수 | 처리 |
|------|----|------|
| INDIVIDUAL (유효) | 714 | 분류 대상 |
| COLLECTIVE | 3 | PUBLIC_SPECIAL_PURPOSE |
| FOOD_SCOPE_EXCLUDED | 4 | REFERENCE_ONLY |
| DUPLICATE_CONFIRMED | 30 | REFERENCE_ONLY |

---

## §2 Guide Catalog (WHY_RECOMMEND 증거)

| 출처 | 총수 | Discovery 매칭 | 미매칭(gap) |
|------|------|----------------|------------|
| michelin-2026 | 55 | 26 records / 3 unique restaurants¹ | 29 records (incl. 피오또 1star) |
| busan-mat-2026 | 119 | 80 | 39 |
| taegshlang-2025 | 20 | 5 | 15 |
| **합계** | **194** | **111 unique²** | **83** |

¹ 미쉐린 1star 4개: 르도헤·모리·팔레트(→ 매칭, PUBLIC_STRONG) / 피오또(→ 미매칭, gap)  
² 중복 레코드 포함 raw match = 129개 → 18개 DUPLICATE_CONFIRMED → 111 clean  
**GUIDE_CATALOG_NOT_IN_DISCOVERY_GAP = 83** (별도 task 대상)

---

## §3 Common Policy 적용 결과

### WHY_RECOMMEND 판단 기준

| 코드 | 적용 근거 | 부산 사례 |
|------|-----------|-----------|
| GUIDE_OR_STRONG_RECOGNITION | Michelin Korea 2026 등재 | 르도헤·모리·팔레트 + bib/selected |
| OFFICIAL_EDITORIAL | 부산시 공식 맛집 가이드 (busan-mat-2026) 선정 | 80개 |
| LOCAL_SIGNATURE | 부산 대표음식 + 상위 WHY_RECOMMEND 공동 부여 | 22개 (GUIDE/EDITORIAL 포함 시) |
| SPECIAL_FOOD_EXPERIENCE | 복합 식음료 관광지 (collective) | 3개 |
| DIRECTORY_ONLY → HOLD | VB FoodService / KTO 단순 등재 → RULE 4 적용 | 573개 |
| MENU_ONLY → HOLD | 부산 대표메뉴 판매만으로 PUBLIC 불가 → RULE 3 | 111개 signature 보유→ HOLD |

---

## §4 Publication 결과

| 상태 | 수 | 비고 |
|------|----|------|
| PUBLIC_STRONG | 10 | Michelin 1star(3) + Bib Gourmand(7) |
| PUBLIC_GOOD_CHOICE | 99 | Michelin Selected(14) + busan-mat(80) + taegshlang(5) |
| PUBLIC_SPECIAL_PURPOSE | 3 | Collective (영도해녀촌, 민락회타운, 해운대시장) |
| **PUBLICATION_READY 합계** | **112** | |
| AI_AUTO_FOOD_READY | 109 | 112 − 3 collective |
| HOLD_WEAK_EVIDENCE | 573 | directory-only, no guide evidence |
| HOLD_SUSPECTED_DUPLICATE | 2 | 팔레트 busan-F-00311/00359 |
| REFERENCE_ONLY | 34 | 30 dup + 4 excluded |

**PUBLICATION_CHECKSUM** = `ce97c65d6d19a9e1af3d9f62`  
**AI_AUTO_CHECKSUM** = `e774a2d5df8efe6c9ca9d416`

---

## §5 Zone Coverage

| 권역 | Discovery 총수 | PUBLIC | AI_AUTO |
|------|---------------|--------|---------|
| 해운대 (Haeundae) | 135 | 30 | 29 |
| 남포·부산역 (Nampo-Station) | 103 | 17 | 17 |
| 광안리·밀락 (Gwangalli) | 80 | 14 | 13 |
| 서면·전포 (Seomyeon) | 60 | 10 | 10 |
| 남구 (Nam-gu) | 37 | 8 | 8 |
| 동래 (Dongrae) | 45 | 7 | 7 |
| 영도 (Yeongdo) | 24 | 7 | 6 |
| 사상 (Sasang) | 25 | 4 | 4 |
| 강서·공항 (Gangseo) | 37 | 3 | 3 |
| 연제 (Yeonje) | 16 | 3 | 3 |
| 금정 (Geumjeong) | 26 | 3 | 3 |
| 기장 (Gijang) | 105 | 3 | 3 |
| 사하 (Saha) | 15 | 2 | 2 |
| 북구 (Buk-gu) | 12 | 1 | 1 |

**ZONE_COVERAGE = ALL_ZONES_COVERED**  
(14개 구군 중 모든 구군에서 최소 1개 이상 PUBLIC)

---

## §6 Reduction Analysis

| 항목 | 수치 |
|------|------|
| BEFORE (guide catalog 공개 수) | 194 |
| AFTER (discovery pipeline publication) | 112 |
| REDUCTION | −82 |
| 주의: 다른 데이터셋 비교 | BEFORE = restaurants.json(guide layer), AFTER = KTO/VB pipeline → cross-dataset |
| 실질 universe 감소 | 721 raw → 112 public = 84.5% HOLD/REFERENCE |
| HOLD 주요 이유 | directory-only 573건 (RULE 4: directory listing ≠ editorial) |
| MENU_ONLY HOLD | 111건 (RULE 3: menu presence ≠ recommendation) |

---

## §7 Guide Contribution Analysis

### Michelin 2026 기여

| 등급 | Guide수 | Discovery 매칭 | PUBLIC |
|------|---------|---------------|--------|
| 1star | 4 | 3 unique¹ | 3 |
| Bib Gourmand | 20 | ~7 | 7 |
| Selected | 31 | ~14 | 14 |
| **합계** | **55** | ~24 unique | 24 |

¹ 피오또(1star)는 discovery pipeline 미수집 — GUIDE_NOT_IN_DISCOVERY_GAP

### busan-mat-2026 기여

| 항목 | 수치 |
|------|------|
| 가이드 총수 | 119 |
| Discovery 매칭 | 80 |
| PUBLIC (OFFICIAL_EDITORIAL) | 80 |
| 미매칭 gap | 39 |

### taegshlang-2025 기여

| 항목 | 수치 |
|------|------|
| 가이드 총수 | 20 |
| Discovery 매칭 | 5 |
| PUBLIC (GUIDE, source_certainty=LOW) | 5 |
| 미매칭 gap | 15 |
| 주의 | 출처 불명확(curated_manual) — 추후 출처 확인 필요 |

---

## §8 False Positive / Negative Guards

| 검사 | 결과 | 기준 |
|------|------|------|
| FP-1: directory-only in PUBLIC | **0** ✓ | target=0 |
| FP-2: menu-only in PUBLIC | **0** ✓ | target=0 |
| FP-3: generic no-evidence in PUBLIC | **0** ✓ | target=0 |
| FN: guide-matched clean not in PUBLIC | **0** ✓ | target=0 |
| INTRA_PIPELINE_DUP detected | **2** (handled) | 팔레트 00311/00359 → HOLD |

---

## §9 Intra-Pipeline Duplicate 발견

**팔레트** (Michelin 1star, 해운대구 달맞이길65번길 154, 3층):

| candidate_id | 좌표 | guide 거리 | 처리 |
|--------------|------|-----------|------|
| busan-F-00311 | 35.131638, 129.11977 | 5,925m | HOLD_SUSPECTED_DUPLICATE |
| busan-F-00359 | 35.131638, 129.11977 | 5,925m | HOLD_SUSPECTED_DUPLICATE |
| busan-F-00410 | 35.156513, 129.17834 | 536m | **PUBLIC_STRONG (canonical)** |

- 00311/00359: 좌표 오류 (실제 위치에서 ~6km 이탈), review_flags에 ENTITY_QA: DUPLICATE_CONFIRMED 있음
- 00410: guide 좌표에 가장 근접, 정상적 달맞이길 권역
- 이 3건은 Discovery Closeout QA(busan-food-discovery-v1-closeout-handoff.md)에서 DUPLICATE로 미처리됨
- Source Universe는 수정하지 않음(불변 원칙). Publication layer에서만 처리.
- 별도 TASK: source_universe QA 보완 권장

---

## §10 Common Policy Regression (RULE 1–15)

| RULE | 상태 |
|------|------|
| RULE 1: Source Universe ≠ Public Catalog | PASS (721→112) |
| RULE 2: WHY_RECOMMEND required | PASS (all PUBLIC have reason) |
| RULE 3: Menu presence ≠ recommendation | PASS (111 menu-only → HOLD) |
| RULE 4: Directory listing ≠ editorial | PASS (573 dir-only → HOLD) |
| RULE 5: Guide ≠ auto include | PASS (contact/nav checked individually) |
| RULE 6: No quota | PASS |
| RULE 7: Underserved ≠ forced include | PASS |
| RULE 8: PUBLIC / AI_AUTO separated | PASS (pub=112, ai=109) |
| RULE 9: Contact semantics | PASS (phone types accepted, open_phone→no ai_auto) |
| RULE 10: Individual / Collective separated | PASS (collective=3→SPECIAL) |
| RULE 11: Nav required for AI_AUTO | PASS (all 714 have coords) |
| RULE 12: HOLD / REFERENCE preserved | PASS (not deleted, 609 preserved) |
| RULE 13: Manual decisions not generalized | PASS |
| RULE 14: No consumer reputation | PASS (api=0, scraping=0) |
| RULE 15: City-specific not in common | PASS (Jeju numbers not used) |

**COMMON_POLICY_REGRESSION = ALL_PASS**

---

## §11 Security / Safety

| 항목 | 값 |
|------|----|
| api_calls | 0 |
| external_lookups | 0 |
| review_scraping | 0 |
| google_maps_verification | 0 |
| naver_lookup | 0 |
| source_universe_deletion | 0 |
| common_branch_change | 0 |
| other_city_change | 0 |
| production_db_change | 0 |
| force_push | 0 |
| git_add_all | 0 |

---

## §12 산출물 파일

| 파일 | 종류 |
|------|------|
| `data/tourapi/normalized/busan/busan-food-c1-publication-curation-v1.json` | **SSOT** (721 records, publication layer) |
| `data/tourapi/manifests/busan/busan-food-c1-publication-manifest-v1.json` | Publication manifest (112 records) |
| `data/tourapi/manifests/busan/busan-food-c1-ai-auto-manifest-v1.json` | AI_AUTO manifest (109 records) |
| `data/tourapi/reports/busan/busan-food-guide-audit-v1.json` | Guide 매칭 감사 |
| `data/tourapi/reports/busan/busan-food-c1-hold-report-v1.json` | HOLD/REFERENCE 상세 |
| `data/tourapi/reports/busan/busan-food-c1-recuration-qa-v1.json` | QA 리포트 |
| `docs/data-collection/busan-food-c1-trusted-recuration-handoff-v1.md` | 이 문서 |

---

## §13 후속 과제

1. **GUIDE_NOT_IN_DISCOVERY_GAP = 85** — 85개 가이드 레코드가 discovery pipeline에 미수집
   - 피오또(Michelin 1star), busan-mat 39건, taegshlang 15건 포함
   - 별도 수집 task 필요: data/busan-food-discovery-v1 pipeline에 추가
2. **팔레트 intra-pipeline dup** — source universe QA 보완 (busan-F-00311, 00359 → DUPLICATE_CONFIRMED 추가 권장)
3. **taegshlang-2025 출처 확인** — curated_manual, source_certainty=LOW → 출처 명확화 후 신뢰도 재평가
4. **OPEN_PHONE_VERIFICATION 7건** — 기존 Naver 차단 7건 후속 확인 (busan-K-00284, 00285, 00512, 00536, 00668, busan-VB-1853, 2579)
5. **TASK-BUSAN-FOOD-FINAL-QA-V1** — 이 handoff 기반으로 최종 QA 진행
6. **서울 Food Recuration** — 동일 Common Policy 적용 (다음 도시)

---

## §14 최종 판정

```
TASK-BUSAN-FOOD-TRUSTED-RECURATION-V1 = COMPLETE
COMMON_POLICY_APPLIED = YES (RULE 1–15, commit 2476cac)
FP_ALL_ZERO = YES
FN_CLEAN_ZERO = YES
INTRA_DUP_HANDLED = YES (2건 held)
GUIDE_GAP_NOTED = YES (85건, 별도 task 필요)
PUBLICATION_READY = 112
AI_AUTO_FOOD_READY = 109
PUBLICATION_CHECKSUM = ce97c65d6d19a9e1af3d9f62
AI_AUTO_CHECKSUM = e774a2d5df8efe6c9ca9d416
SAFE_TO_START_BUSAN_FOOD_FINAL_QA = YES
```


---

## Correction Notice

**Corrected by**: `TASK-BUSAN-FOOD-GUIDE-COUNT-REPAIR-AND-ROOT-CAUSE-AUDIT-V1` (2026-08-16)

| Field | Old Value | Correct Value | Root Cause |
|-------|-----------|---------------|------------|
| `GUIDE_NOT_IN_DISCOVERY_GAP` | 83 | **85** | Per-source subtraction used discovery RECORDS (팔레트 3 records = 1 guide entity overcounted by 2) |
| `guide_not_in_discovery` (SSOT) | 65 | **85** | Cross-base subtraction: 194 guide entities − 129 discovery records (different units) |
| `michelin_not_in_discovery` | 29 | **31** | Same root cause as 83 (팔레트 overcounting) |

**Correct counting**:
- `GUIDE_UNIQUE_ENTITY_COUNT` = 194 (all distinct names in restaurants.json)
- `GUIDE_MATCHED_UNIQUE_ENTITY_COUNT` = 109 (unique guide names found in discovery)
- `GUIDE_UNMATCHED_UNIQUE_ENTITY_COUNT` = **85** (unique guide names NOT in discovery)
- Verification: 109 + 85 = 194 ✓
- Publication/AI_AUTO checksums unchanged: `ce97c65d6d19a9e1af3d9f62` / `e774a2d5df8efe6c9ca9d416`
