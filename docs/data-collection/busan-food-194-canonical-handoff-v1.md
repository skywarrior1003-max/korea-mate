# Busan Food 194 Canonical — Task Handoff v1
## Task: TASK-BUSAN-FOOD-194-CANONICAL-ENRICHMENT-V1-R1
**Date**: 2026-08-16
**Outcome**: PASS_WITH_WARN
**Commit**: [TBD]

---

## Executive Summary

**194 Busan 미식가이드 식당이 새로운 서비스 SSOT로 등록 완료.**

| 항목 | 값 |
|---|---|
| Canonical entity count | 194 |
| CATALOG_CHECKSUM | `11617fcf04ad` |
| AI_AUTO count | 5 |
| AI_AUTO_CHECKSUM | `92875017f119` |
| OFFICIAL_IMAGE_RESOLVED | 116 |
| OFFICIAL_IMAGE_UNRESOLVED | 78 |
| PASS_WITH_WARN 이유 | 이미지 미확보 78건, 좌표 검증 필요 122건 |

---

## SSOT Supersession

| 구분 | 파일 | 상태 |
|---|---|---|
| **NEW (Service SSOT)** | `data/tourapi/normalized/busan/busan-food-194-canonical-v1.json` | `ACTIVE_SERVICE_SSOT` |
| OLD (Historical) | `data/tourapi/normalized/busan/busan-food-c1-publication-curation-v1.json` | `HISTORICAL_SUPERSEDED` |

구 SSOT (721 records, PUBLIC=112)는 삭제하지 않음. HISTORICAL/REFERENCE/AUDIT ARTIFACT로 보존.

---

## Match Status

| Match Status | Count |
|---|---|
| MATCHED | 109 |
| MATCH_FAILURE_HIGH_CONFIDENCE | 7 |
| MATCH_FAILURE_NEEDS_HUMAN_REVIEW | 5 |
| PHONE_MATCHED | 6 |
| UNMATCHED_STRONG_GUIDE | 52 |
| UNMATCHED_TAEGSHLANG | 15 |

**총계**: 194 = 194 ✓

---

## Coordinate Verification

| Coord Status | Count | Navigation Ready |
|---|---|---|
| CROSS_SOURCE_VERIFIED (<500m) | 5 | YES |
| COORD_PRESENT_NEEDS_VERIFICATION (500m-2km) | 73 | PENDING |
| ADDRESS_COORD_CONFLICT (>2km) | 49 | NO |
| GUIDE_COORD_ONLY (no disc comparison) | 67 | PENDING |

**주의**: 49건의 ADDRESS_COORD_CONFLICT 중 다수는 분점 혼용(guide=본점, discovery=다른 지점) 또는 TourAPI 행정 좌표 vs. 실제 GPS 차이로 추정. 타겟 검증(Naver Maps) 후 다수 복원 가능.

---

## Image Status

- **OFFICIAL_IMAGE_RESOLVED**: 116/194 — visitbusan.net 이미지 (rights=usable)
- **OFFICIAL_IMAGE_UNRESOLVED**: 78/194
  - PIXABAY_FALLBACK_REQUIRES_USER_APPROVAL = YES
  - Fallback 없이 PASS_WITH_WARN 종료

미확보 식당 목록: `data/tourapi/manifests/busan/busan-food-194-image-manifest-v1.json` → `unresolved_list` 참조

---

## AI_AUTO Gate

**AI_AUTO = YES: 5건**

| Block Reason | Count |
|---|---|
| COORD_NOT_CROSS_SOURCE_VERIFIED | 140 |
| CURRENT_STATE_TEMPORARILY_UNVERIFIED | 72 |
| ADDRESS_COORD_CONFLICT | 49 |
| NEEDS_HUMAN_IDENTITY_REVIEW | 5 |
| COLLECTIVE_ENTITY_NO_SINGLE_RESTAURANT | 2 |

**낮은 AI_AUTO 이유**: 구 pipeline은 discovery pipeline 좌표를 그대로 사용(교차검증 없음). 신규 canonical은 guide 좌표 vs discovery 좌표 Haversine 교차검증을 적용함. 73건의 COORD_PRESENT_NEEDS_VERIFICATION 타겟 검증 완료 시 AI_AUTO 대폭 상승 가능.

AI_AUTO=YES 식당:
- 동래할매파전
- 쥬가정효
- 거대갈비
- 피아크 카페&베이커리
- 평양집

---

## NEEDS_HUMAN_REVIEW Queue (5건)

이름 유사, 전화번호 불일치 → 동일 entity 여부 인간 확인 필요:

| canonical_id | guide_name | match_status |
|---|---|---|
| busan-G-00009 | 프랑스 과자점 브리앙 | MATCH_FAILURE_NEEDS_HUMAN_REVIEW |
| busan-G-00037 | 오스테리아 어부 | MATCH_FAILURE_NEEDS_HUMAN_REVIEW |
| busan-G-00045 | 해목 해운대점 | MATCH_FAILURE_NEEDS_HUMAN_REVIEW |
| busan-G-00135 | 야키토리 백탄 광안리 | MATCH_FAILURE_NEEDS_HUMAN_REVIEW |
| busan-G-00164 | 슌사이쿠보 화명 | MATCH_FAILURE_NEEDS_HUMAN_REVIEW |

---

## Artifacts Generated (7)

| # | 파일 | 설명 |
|---|---|---|
| A | `data/tourapi/normalized/busan/busan-food-194-canonical-v1.json` | 194 canonical SSOT (main) |
| B | `data/tourapi/manifests/busan/busan-food-194-source-relation-v1.json` | Guide → Discovery 관계 매핑 |
| C | `data/tourapi/reports/busan/busan-food-194-coordinate-report-v1.json` | 좌표 검증 상세 |
| D | `data/tourapi/manifests/busan/busan-food-194-image-manifest-v1.json` | 이미지 상태 + 미확보 목록 |
| E | `data/tourapi/manifests/busan/busan-food-194-ai-readiness-v1.json` | AI_AUTO gate 결과 |
| F | `data/tourapi/reports/busan/busan-food-194-gap-classification-v1.json` | 85 gap 분류 상세 |
| G | `docs/data-collection/busan-food-194-canonical-handoff-v1.md` | 이 문서 |

기존 SSOT 업데이트 (supersession):
| 파일 | 변경 |
|---|---|
| `data/tourapi/normalized/busan/busan-food-c1-publication-curation-v1.json` | ssot_status=HISTORICAL_SUPERSEDED 추가 |

---

## Security Constraints Applied

- NEW_EXTERNAL_LOOKUPS = 0
- REVIEW_SCRAPING = 0
- GOOGLE_MAPS_VERIFICATION = FORBIDDEN
- PIXABAY_FALLBACK_REQUIRES_USER_APPROVAL = YES
- 추정 좌표 생성 금지
- 권리 불명 이미지 사용 금지
- 부산 외 도시 수정 금지
- 부산 Source Universe 삭제 금지

---

## NEXT TASKS

1. **TASK-BUSAN-FOOD-194-FINAL-QA-V1** — 194 canonical 최종 품질 검증
2. **Coord Targeted Verification** — 49건 ADDRESS_COORD_CONFLICT + 73건 COORD_NEEDS_VERIFICATION
3. **Image Resolution** — 78건 OFFICIAL_IMAGE_UNRESOLVED → Pixabay 사용자 승인 요청 또는 공식 이미지 추가 탐색
4. **NEEDS_HUMAN_REVIEW** — 5건 identity 확인
