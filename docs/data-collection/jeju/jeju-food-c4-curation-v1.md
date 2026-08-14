# TASK-JEJU-FOOD-OFFICIAL-CURATION-AND-COVERAGE-V1-R1

**Branch:** `data/jeju-collection-v2`
**Generated:** 2026-08-14
**SSOT:** Food Research commit `b5802ba`
**Common Policy:** `dc6f9be`
**Status:** PASS_WITH_WARN
**API_CALLS:** 0

---

## 검증 노트 (프롬프트 R1 vs V1)

V1에서 발견된 CRITICAL 2건 모두 R1에서 수정 확인:
- ✅ 존재하지 않는 "common Food 정책" 참조 제거
- ✅ `b5802ba` 연구 결과 명시적 참조
- ✅ 백년가게 auto-include → STRONG_PUBLIC_TRUST_SIGNAL (FINAL_SERVICE_AUTO_INCLUDE=NO)
- ✅ zone quota 강제 금지 명시

구현 중 처리한 사항:
- Tier C: score-based zone ranking 사용 (deterministic, arbitrary new score 아님)
- S1~S10 weights: source universe pre-computed raw_score/raw_signals 재사용

---

## 핵심 결과

| 항목 | 값 |
|------|-----|
| SOURCE_UNIVERSE | 1870 |
| OFFICIAL_POSITIVE_CANDIDATE_POOL | 891 |
| BAEKNYEON_AUTO_FINAL_INCLUDE | 0 |
| P1_HIGH | 211 |
| P2_MEDIUM | 533 |
| P3_LOW | 163 |
| NO_EXTERNAL_LOOKUP | 963 |
| FULL_1870_EXTERNAL_LOOKUP_REQUIRED | NO |
| RECOMMENDED_FIRST_EXTERNAL_BATCH | 211 (P1_HIGH) |

---

## 4-Tier 분포

| Tier | 건수 | 의미 |
|------|-----:|------|
| TIER_A | 638 | 제주 시그니처 음식 + phone + coord |
| TIER_B | 79 | 백년가게 / 공식 품질 태그 |
| TIER_C | 94 | 권역별 coverage 후보 (score-based) |
| TIER_D | 21 | 제주 재료 특화 카페 |
| COLLECTIVE | 59 | 시장 / 집합 식품 목적지 |
| REVIEW_REQUIRED | 75 | 모바일 전화 등 확인 필요 |
| REFERENCE_ONLY | 904 | Jeju identity/품질 신호 부재 |

---

## 권역 Coverage 요약

- Top 2 zone 집중도: 45.5%
- 제주시내 후보: 253
- 서귀포시내 후보: 98
- UNDERSERVED/THIN zones: ['비양도', '가파도']

---

## QA 결과

- FALSE_POSITIVE_GENERIC_COUNT: 2 → demoted
- FALSE_NEGATIVE_STRONG_SIGNAL_COUNT: 31 → promoted
- TITLE_ONLY_CLASSIFICATION: 0
- TAG_ONLY_MENU_ASSERTION: 0
- PHONE_BASED_EXCLUSION: 0
- REGION_QUOTA_FORCED_INCLUDE: 0
- Curation checksum: `a6c5319f74c7e825adf82441c4fa1697c4a8893aab953f8b4c395d54d567df93`

---

## Safety

- VISITJEJU_API_CALLS: 0
- KTO_API_CALLS: 0
- NAVER_API_CALLS: 0
- GOOGLE_API_CALLS: 0
- WEB_COLLECTION: 0
- RAW_SOURCE_DELETION: 0
- MASTER_CHANGE: 0
- COMMON_CHANGE: 0

## WARN 사항

1. TIER_C zone selection = score>=7.0 ranking (deterministic, not arbitrary)
2. COLLECTIVE 59건 Phone Gate 제외 (common policy §18)
3. Research JSON의 photo_ok_pct=0.0는 버그 — repphoto_url 필드는 정상 입력됨
4. 모바일 전화 123건 REVIEW 상태, 인간 검증 필요

## 출력 파일

| 파일 | 크기 | 설명 |
|------|------|------|
| `data/visitjeju/normalized/jeju/jeju-food-c4-curation-v1.json` | 2722KB | 1,870건 curation 결과 |
| `data/visitjeju/reports/jeju/jeju-food-c4-curation-qa-v1.json` | 15KB | QA + 요약 |
| `data/visitjeju/manifests/jeju/jeju-food-c4-external-verification-manifest-v1.json` | 366KB | P1/P2/P3 외부 검증 manifest |
| `docs/data-collection/jeju/jeju-food-c4-curation-v1.md` | — | 이 문서 |

## Common Policy

COMMON_POLICY_FOOD_CURATION_CANDIDATE: YES
