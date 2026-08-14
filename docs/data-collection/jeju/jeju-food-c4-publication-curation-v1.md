# TASK-JEJU-FOOD-TRUSTED-EDITORIAL-CURATION-V1

**완료보고서** | Branch: `data/jeju-collection-v2`

## Commit / Inputs

| 항목 | 값 |
|---|---|
| FOOD_RESEARCH_COMMIT | `b5802ba` |
| OFFICIAL_CURATION_COMMIT | `d69f16e` |
| COMMON_POLICY_COMMIT | `dc6f9be` |
| SOURCE_UNIVERSE | 1870 |
| ORIGINAL_POSITIVE_POOL | 891 |
| ORIGINAL_TIER_A | 638 |

## 핵심 방향 전환

Source Universe (1,870) ≠ Public Food Catalog.
모든 공개 후보는 "왜 외국인 여행자에게 추천하는가"에 답할 수 있어야 함.

**QUALITY_TAG 정정**: 기존 curation의 QUALITY_TAG signal은 `맛집`, `도민맛집`, `BTS추천` 등 소비자 해시태그를 포함.
이번 레이어에서는 공식 인증(`향토음식인증`, `착한가격업소`, `백년가게`)만 B(GUIDE_OR_STRONG_RECOGNITION) 이유로 인정.

## 결과

| 상태 | 건수 |
|---|---|
| PUBLIC_STRONG | 78 |
| PUBLIC_GOOD_CHOICE | 150 |
| PUBLIC_SPECIAL_PURPOSE | 33 |
| HOLD_WEAK_EVIDENCE | 630 |
| REFERENCE_ONLY | 904 |
| REVIEW_REQUIRED | 75 |
| **PUBLICATION_READY** | **261** |

PUBLICATION_RANGE_ASSESSMENT = `APPROPRIATE`

## TIER_A Recheck

| 분류 | 건수 |
|---|---|
| TIER_A_ORIGINAL | 638 |
| SIGNATURE_STRONG | 55 |
| SIGNATURE_SUPPORTING_REASON_ONLY | 163 |
| SIGNATURE_MENU_ONLY | 406 |
| SIGNATURE_WEAK_OR_AMBIGUOUS | 14 |

## Zone Coverage

| Zone | Source | Public | Coverage |
|---|---|---|---|
| 제주시내 | 653 | 96 | HEALTHY |
| 서귀포시내 | 234 | 37 | HEALTHY |
| 성산 | 102 | 27 | HEALTHY |
| 안덕 | 98 | 19 | HEALTHY |
| 한림 | 107 | 16 | HEALTHY |
| 구좌 | 130 | 15 | HEALTHY |
| 조천 | 105 | 12 | ADEQUATE |
| 애월 | 151 | 10 | ADEQUATE |
| 중문 | 47 | 7 | THIN |
| 대정 | 53 | 6 | THIN |
| 우도 | 47 | 6 | THIN |
| 표선 | 40 | 5 | THIN |
| 한경 | 41 | 4 | THIN |
| 남원 | 36 | 1 | UNDERSERVED |
| 마라도 | 6 | 0 | UNDERSERVED |
| 추차도 | 17 | 0 | UNDERSERVED |
| 가파도 | 1 | 0 | UNDERSERVED |
| 비양도 | 2 | 0 | UNDERSERVED |

Top-2 zone concentration: 51.0%
Underserved: 남원, 마라도, 추차도, 가파도, 비양도

## Common Candidate

### GENERAL (다른 도시 적용 가능)
- Source Universe ≠ Public Food Catalog
- Every public restaurant needs a WHY_RECOMMEND
- Official hashtag (맛집) ≠ official quality certification
- Jeju cuisine menu presence alone = insufficient
- Local food menu presence alone = insufficient
- Regional utility supplements quality, does not replace it
- No quota filling
- Weak/unverified restaurants remain source/reference only
- WHY_RECOMMEND taxonomy: A~H reason codes

### JEJU_SPECIFIC
- Jeju signature taxonomy from b5802ba
- Food zones via VisitJeju region2
- VisitJeju c4-specific signals
- COLLECTIVE entity type = market/collective food destination

## Safety

NEW_EXTERNAL_LOOKUPS=0 · CONSUMER_MAP_SCRAPING=0 · REVIEW_SCRAPING=0
SOURCE_UNIVERSE_DELETION=0 · BUSAN_CHANGE=0 · SEOUL_CHANGE=0
COMMON_CHANGE=0 · MASTER_CHANGE=0 · PRODUCTION_CHANGE=0

## Checksum

`bb473bb0a467f53d0357f1ed`
