# TASK-JEJU-FOOD-MISSING-CONTACT-TARGETED-VERIFICATION-V1

**Status**: COMPLETE
**SSOT**: f9af625 (`jeju-food-c4-publication-curation-v1.json`)
**Verification date**: 2026-08-14
**Source universe**: 1,870건 (불변)

---

## §1 Contact Audit Results (261 Publication-Ready Entities)

| 항목 | 수 |
|------|-----|
| PUBLICATION_READY total | 261 |
| DIRECT_CONTACT_PRESENT | 258 |
| DIRECT_CONTACT_MISSING | 3 |

### Contact Type Breakdown

| Type | 수 |
|------|-----|
| LANDLINE (일반 유선) | 159 |
| VOIP_050 (인터넷전화) | 91 |
| MOBILE_INDIVIDUAL (개별 식당, 모바일) | 2 |
| MOBILE_COLLECTIVE (집합/시장, 모바일) | 6 |
| NO_PHONE | 3 |

### NOT_AI_AUTO Gap Decomposition (261 → 223 AI_AUTO)

| 원인 | 수 |
|------|-----|
| SPECIAL_MANUAL_CURATION (집합/시장 엔티티) | 33 |
| MISSING_COORD (좌표 부재) | 3 |
| PHONE_NOT_LANDLINE (모바일만 보유) | 2 |

> **핵심**: AI_AUTO 미포함 38건 중 전화번호 자체가 없는 건은 3건뿐.
> 나머지 35건은 모바일 전화 보유(8건) 또는 좌표 부재(2건) 또는 집합 엔티티(25건).

---

## §2 Entity Type Classification (Verification Targets)

### P0 — Collective/Market Stall (전화번호 불필요)

| contentsid | title | 분류 | 결과 |
|------------|-------|------|------|
| CNTS_200000000012612 | 야시장맛통령 | COLLECTIVE_MARKET_STALL | COLLECTIVE_ENTITY_CONTACT_NOT_REQUIRED |
| CNTS_300000000013979 | 청춘이오란다 동문시장본점 탑동 | COLLECTIVE_MARKET_STALL | COLLECTIVE_ENTITY_CONTACT_NOT_REQUIRED |

**근거**: 두 엔티티 모두 제주 동문시장 내 야시장 노점/과자 판매점. 시장 내 개별 판매점은 공개 전화번호 미게시가 일반적.
시장 대표번호를 개별 식당 번호로 등재 금지 정책 적용.

### P1 — Individual Restaurant, No Phone

| contentsid | title | 결과 | 비고 |
|------------|-------|------|------|
| CNTS_300000000014742 | 베테랑회센터 | **UNRESOLVED** | 노형동 공항 근처 횟집, 2회 targeted search 실패 |

### P2 — Individual Restaurant, Mobile Phone

| contentsid | title | phone | 결과 |
|------------|-------|-------|------|
| CNTS_000000000018942 | 우도해녀식당 | 010-9090-3509 | **ACTIVE_CONTACT_VERIFIED** |
| CNTS_000000000022498 | 방모루 | 010-2691-5862 | **UNRESOLVED** |

---

## §3 Targeted Verification Detail

### 우도해녀식당 — ACTIVE_CONTACT_VERIFIED
- VisitJeju 공식 페이지(contentsid=CNTS_000000000018942)에서 010-9090-3509 확인
- 주소: 제주시 우도면 우도해안길 440 / 영업: 08:30~17:30
- 다이닝코드, triple.guide, 여기유 복수 소스 일치
- 우도 소규모 개인 운영 식당 특성상 모바일 번호 사용 정상

### 베테랑회센터 — UNRESOLVED
- 제주 노형동 공항 근처 횟집 (c4 tags: 제주공항맛집, 노형동횟집)
- 2회 targeted web search 수행 → 상호 발견 불가
- Google Maps = BLOCKED_BY_CURRENT_POLICY
- 폐업 증거 없음 → CLOSED 판정 금지
- 전화 및 좌표 모두 미보유 → 추후 수동 확인 권장

### 방모루 — UNRESOLVED
- 제주 구좌 해산물 전문점, 모바일 010-2691-5862 존재
- 2회 targeted web search 수행 → 상호 발견 불가
- Google Maps = BLOCKED_BY_CURRENT_POLICY
- 폐업 증거 없음 → CLOSED 판정 금지
- 소규모 구좌 지역 식당 온라인 노출 제한적 가능성 있음

---

## §4 Blocked Sources

| Source | 사유 |
|--------|------|
| Google Maps | GOOGLE_MAPS_VERIFICATION = FORBIDDEN (common policy dc6f9be §16.3) |
| Kakao Maps | KAKAO_VERIFICATION = FORBIDDEN |
| VisitJeju API | WAF_BLOCKED + WAF 우회 금지 |

---

## §5 Open Items

1. **베테랑회센터** (CNTS_300000000014742): 전화 + 좌표 모두 없음. Naver Place 수동 조회 권장.
2. **방모루** (CNTS_000000000022498): 010-2691-5862 현재 사용 여부 미확인. Naver Place 수동 조회 권장.

---

## §6 Safety Assertions

```
PUBLICATION_STATUS_CHANGED    = False
AI_AUTO_STATUS_CHANGED        = False
SOURCE_UNIVERSE_DELETED       = False
SOURCE_UNIVERSE_COUNT         = 1870 (불변)
CONSUMER_REVIEW_SCRAPED       = False
BULK_EXTERNAL_LOOKUP          = False
GOOGLE_MAPS_USED              = False
NAVER_TARGETED_SEARCH         = True (P1/P2 5건만)
VISITJEJU_API_CALLS           = 0
BUSAN_CHANGE                  = False
SEOUL_CHANGE                  = False
COMMON_POLICY_CHANGE          = False
```

---

## §7 Output Files

| 파일 | 설명 |
|------|------|
| `data/visitjeju/normalized/jeju/jeju-food-c4-contact-verification-v1.json` | 261건 전체 연락처 상태 매니페스트 |
| `data/visitjeju/reports/jeju/jeju-food-c4-contact-verification-qa-v1.json` | QA 보고서 (검증 대상 5건 상세) |
| `docs/data-collection/jeju/jeju-food-c4-contact-verification-v1.md` | 본 문서 |
