# TASK-JEJU-FOOD-FINAL-QA-V1-R1

**QA 판정**: PASS_WITH_WARN
**날짜**: 2026-08-14
**SSOT 커밋**: b4e595d
**Common Policy**: dc6f9be563983d369f400e4e8b0eea139f82da7c

---

## Source Universe Reconciliation

| 항목 | 값 |
|------|----|
| SOURCE_UNIVERSE | 1,870 |
| TOTAL_RECONCILED | 1870 |
| UNACCOUNTED | 0 |
| DUPLICATE_CONTENTSID | 0 |

## Publication Status Distribution

| Status | 수 |
|--------|----|
| PUBLIC_STRONG | 78 |
| PUBLIC_GOOD_CHOICE | 150 |
| PUBLIC_SPECIAL_PURPOSE | 32 |
| HOLD_WEAK_EVIDENCE | 631 |
| REFERENCE_ONLY | 904 |
| REVIEW_REQUIRED | 75 |
| **합계** | **1870** |

## Publication QA

| 항목 | 값 | 결과 |
|------|----|----|
| FINAL_PUBLICATION_READY_COUNT | **260** | — |
| WHY_RECOMMEND_MISSING | 0 | PASS |
| PUBLIC_MENU_ONLY_FP | 0 | PASS |

## Manual Decisions (5건)

`MANUAL_DECISIONS_5_OF_5_MATCH = True`

| entity | 결과 | 비고 |
|--------|------|------|
| 우도해녀식당 | PASS | PUBLIC_GOOD_CHOICE, MOBILE_VERIFIED_DIRECT_CONTACT |
| 방모루 | PASS | PUBLIC_GOOD_CHOICE, manual_verified_phoneno=064-784-1312 |
| 베테랑회센터 | PASS | PUBLIC_GOOD_CHOICE, manual_entity_type=COLLECTIVE_FOOD_CENTER, AI_AUTO=NO |
| 야시장맛통령 | PASS | HOLD_WEAK_EVIDENCE (publication 제외) |
| 청춘이오란다 | PASS | PUBLIC_SPECIAL_PURPOSE 유지 |

## Contact Analysis

| Type | 수 |
|------|----|
| COLLECTIVE | 33 |
| LANDLINE_VERIFIED | 145 |
| MOBILE_VERIFIED | 1 |
| VOIP_VERIFIED | 81 |
| **INDIVIDUAL_UNVERIFIED** | **0** |

## AI_AUTO Final Recomputation

| 항목 | 값 |
|------|----|
| OLD_AI_AUTO (historical) | 223 |
| **FINAL_AI_AUTO_FOOD_READY** | **225** |
| AI_AUTO_DELTA | +2 |

**Delta 원인:**
- +1: 우도해녀식당 — MOBILE_VERIFIED_DIRECT_CONTACT (수동 검증)
- +1: 방모루 — MANUAL_VERIFIED_LANDLINE=064-784-1312

**Gate 정책:**
- COLLECTIVE → AI_AUTO=NO (SPECIAL_MANUAL_CURATION_REQUIRED)
- INDIVIDUAL + contact_ready + nav_ready → AI_AUTO=YES

**AI_AUTO=NO 엔티티 (35건):**
- COLLECTIVE (33건): 모두 SPECIAL_MANUAL_CURATION_REQUIRED
- INDIVIDUAL MISSING_COORD (2건): 신세계제과, 고집돌우럭(함덕점)

## Zone Coverage

| Zone | pub | ai | hold |
|------|-----|----|------|
| 제주시/제주시내 | 95 | 78 | 180 |
| 서귀포시/서귀포시내 | 37 | 24 | 93 |
| 서귀포시/성산 | 27 | 27 | 39 |
| 서귀포시/안덕 | 19 | 18 | 30 |
| 제주시/한림 | 16 | 16 | 40 |
| 제주시/구좌 | 15 | 15 | 44 |
| 제주시/조천 | 12 | 11 | 36 |
| 제주시/애월 | 10 | 10 | 54 |
| 서귀포시/중문 | 7 | 6 | 27 |
| 섬 속의 섬/우도 | 6 | 6 | 25 |
| 서귀포시/대정 | 6 | 4 | 17 |
| 서귀포시/표선 | 5 | 5 | 16 |
| 제주시/한경 | 4 | 4 | 17 |
| 서귀포시/남원 | 1 | 1 | 5 |
| 섬 속의 섬/추차도 | 0 | 0 | 4 |
| 섬 속의 섬/마라도 | 0 | 0 | 4 |

**Underserved zones (pub<3):** 서귀포시/남원(1), 섬속의섬/마라도(0), 섬속의섬/추차도(0)

## Warnings

- 베테랑회센터: COLLECTIVE_FOOD_CENTER(USER_MANUAL), source intro 충돌. AI_AUTO=NO (COLLECTIVE_SPECIAL_MANUAL_CURATION_REQUIRED)
- 신세계제과: MISSING_COORD → AI_AUTO=NO (좌표 미보강 유지)
- 고집돌우럭(함덕점): MISSING_COORD → AI_AUTO=NO (좌표 미보강 유지)
- 서귀포시/남원 pub=1, 섬속의섬/마라도·추차도 pub=0 → 자체 수집 한계, 강제 include 없음
- EXTERNAL_REPUTATION_POLICY: Naver/Google rating 기반 검증 정책 미수립 (D코드 evidence 향후 설계 필요)

## Common Promotion

`JEJU_FOOD_FINAL_QA = PASS_WITH_WARN`
`JEJU_FOOD_COMPLETE = YES`
`READY_TO_PROMOTE_FOOD_CURATION_POLICY_TO_COMMON = YES`

## Output Files

| 파일 | 내용 |
|------|------|
| `data/visitjeju/reports/jeju/jeju-food-c4-final-qa-v1.json` | 전체 QA 보고서 |
| `data/visitjeju/manifests/jeju/jeju-food-c4-final-publication-manifest-v1.json` | 260건 publication manifest |
| `data/visitjeju/manifests/jeju/jeju-food-c4-final-ai-auto-manifest-v1.json` | 225건 AI_AUTO manifest |
| `data/visitjeju/normalized/jeju/jeju-food-c4-publication-curation-v1.json` | SSOT (ai_auto_food_ready 갱신됨) |
