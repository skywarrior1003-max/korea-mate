# TASK-JEJU-FOOD-CURATION-SOURCE-AND-RANKING-RESEARCH-V1

**Branch:** `data/jeju-collection-v2`  
**Generated:** 2026-08-13  
**Status:** RESEARCH_COMPLETE  
**API_CALLS:** 0 (VisitJeju API WAF_BLOCKED; data extracted from existing repo raw pages)  
**COMMON_POLICY_COMMIT:** `dc6f9be` (ACTIVE_FINAL, 2026-08-12 freeze)

---

## 핵심 발견

### VisitJeju API 상태
VisitJeju API(`api.visitjeju.net/vsjApi/contents/searchList`) = **WAF_BLOCKED** (IP 172.25.62.103 / 58.238.169.144).  
c1 포함 모든 카테고리 차단. KTO_API_KEY = UNAVAILABLE.

### c4 데이터 이미 repo에 존재
c1 Place 수집 시 API가 **ALL 카테고리 5938건을 한 번에 수집**했음을 확인.  
60개 raw pages (`data/visitjeju/raw/jeju/2026-08-13/kr/`) = c1+c2+c3+c4+c5+c6+c7+c9 전체.  
`contentscd.value == 'c4'` 필터로 **1870건 추출 완료. API 재호출 불필요.**

---

## Section 1: c4 Universe 확정

| 항목 | 값 |
|------|-----|
| VISITJEJU_C4_CONFIRMED_TOTAL | 1,870 |
| VISITJEJU_C4_UNIQUE_ENTITY_COUNT | 1,870 |
| Duplicates | 0 |
| SHA256 | `a6a055123a8a12d2cfd3808e7ea9a41b8c367a55b79030403fc5aa9d2d4f3658` |
| 수집 시점 | 2026-08-13T06:56:21Z |
| Source | `data/visitjeju/raw/jeju/2026-08-13/kr/page-001 ~ page-060.json` |

---

## Section 2: Field Coverage

| 필드 | 건수 | % | 비고 |
|------|-----:|--:|------|
| title | 1,870 | 100% | 전수 |
| alltag | 1,870 | 100% | 태그 전수 |
| address | 1,869 | 99.9% | |
| roadaddress | 1,869 | 99.9% | |
| repPhoto | 1,864 | 99.7% | 이미지 URL (권리 미확인) |
| phoneno | 1,853 | 99.1% | c1 89.2% 대비 현저히 높음 |
| latitude | 1,841 | 98.4% | |
| longitude | 1,841 | 98.4% | |
| introduction (≥12자) | 1,841 | 98.4% | |
| postcode | 491 | 26.3% | 미보유 다수 — 비차단 |

> **c4 품질 > c1**: 전화번호 99.1% (c1 89.2%), 좌표 98.4% (c1 97.6%). 식당으로 등록된 업체가 관광지보다 연락처/위치 등록률 높음.

### 전화번호 유형 분포
| 유형 | 건수 | % |
|------|-----:|--:|
| 064 (제주 지역번호) | 853 | 45.6% |
| 타 지역번호 (033, 031 등) | 862 | 46.1% |
| 모바일 (010/011) | 123 | 6.6% |
| 미입력 | 17 | 0.9% |

> 모바일 번호 123건 = 개인 전화 가능성. Phone Gate 시 review 대상.

---

## Section 3: Source Universe vs Product Catalog 분리

```
SOURCE_UNIVERSE  = 1,870 (VisitJeju c4 공식 원천 전체 — 삭제 없음 원칙)
FOOD_PRODUCT_CATALOG = GoKoreaMate가 외국인 여행자에게 추천할 식당
  → 250~350 is GUIDANCE, not quota
  → 좋은 근거가 230개면 230. 강한 후보가 430면 430.
```

---

## Section 4: 제주 Food Taxonomy

### 핵심 제주 음식 카테고리

| 분류 | 대표 키워드 | 건수 (추정) | 특징 |
|------|------------|----------:|------|
| 제주 흑돼지 | 흑돼지, 흑돼지구이 | 271 | 14.5% — 제주 대표 먹거리 |
| 제주 해산물 | 갈치, 옥돔, 전복, 성게, 자리돔 | 450 | 24.1% — 최다 |
| 해녀 음식 | 해녀, 해녀국, 해녀밥 | 40 | 2.1% — 유네스코 문화, 고관광가치 |
| 제주 육류 | 고기국수, 몸국, 돔베고기 | 378 | 20.2% |
| 향토 전통 | 향토음식, 메밀, 제주 전통 | 166 | 8.9% |
| 카페/커피 | 카페, 아메리카노, 에스프레소 | 617 | 33.0% |
| 일반 한식 | 한식, 김치찌개, 국밥, 구이 | ~600 | 32.0% |
| 시장 관련 | 시장, 오일장, 재래시장 | 60 | 3.2% |

### 백년가게 (8건) — Auto-include
| 식당 | 지역 | Score |
|------|------|------:|
| 성안식당 | 애월 | 12.5 |
| 옹포별장가든 | 한림 | 12.5 |
| 제주뚝배기 | 성산 | 12.5 |
| 도라지식당 | 제주시내 | 12.0 |
| 신설오름 | 제주시내 | 12.0 |
| 해원횟집 | 제주시내 | 9.5 |
| 향원복집 | 서귀포시내 | 8.5 |
| 신세계제과 | 대정 | 8.5 |

---

## Section 5: 지역별 Food Coverage

| 지역 | c4 건수 | % |
|------|--------:|--:|
| 제주시내 | 653 | 34.9% |
| 서귀포시내 | 234 | 12.5% |
| 애월 | 151 | 8.1% |
| 구좌 | 130 | 7.0% |
| 한림 | 107 | 5.7% |
| 조천 | 105 | 5.6% |
| 성산 | 102 | 5.5% |
| 안덕 | 98 | 5.2% |
| 우도 | 47 | 2.5% |
| 기타 섬 | 26 | 1.4% |

> 섬(우도/마라도/가파도/추자도) 식당은 접근성이 특수 — 관광 가치 높으므로 별도 취급.

---

## Section 6: Signal 품질/비용 분석

| Signal | Coverage | 비용 | 소스 | 품질 |
|--------|---------|------|------|------|
| S1: phone | 99.1% | 0 | VisitJeju phoneno | HIGH |
| S2: coord | 98.4% | 0 | VisitJeju lat/lon | HIGH |
| S3: intro | 98.4% (≥12자) | 0 | VisitJeju introduction | MEDIUM |
| S4: photo | 99.7% | 0 | VisitJeju repPhoto | HIGH (rights 미확인) |
| S5: tags | 100% | 0 | VisitJeju alltag | HIGH |
| S6: 제주 음식 태그 | 24.1% | 0 | alltag: 흑돼지,갈치 등 | HIGH |
| S7: 맛집/백년가게 태그 | ~5% | 0 | alltag: 맛집,백년가게 | HIGH (희귀, 강력) |
| S8: KTO type39 상세 | TBD | API 1회/식당 | detailIntro2 | HIGH (영업시간, 메뉴) |
| S9: Naver Place | 수동 | HIGH | Naver Place | HIGH (현재 전화) |

**금지 소스:**
- AI 추론 사실 → FORBIDDEN
- Google Maps / Kakao → FORBIDDEN
- 블로그/후기 snippet → fact 승격 FORBIDDEN

---

## Section 7: 단계별 압축 모델

```
Stage 1: Source Universe = 1,870
Stage 2: Source Phone Gate = 1,853 (99.1%) [17건 Naver 필요]
Stage 3: + Coord Gate = 1,826 (97.6%)
Stage 4: + Score≥5 (Phone+Coord+2more) = 1,668 (89.2%)
Stage 5: + Jeju Identity / Quality Tag = 1,092 (58.4%)
Stage 6: Score≥8 (고강도 시그널) = 675 (36.1%)
```

> **핵심 발견:** c4 universe 자체가 매우 고품질. 일반 필터(phone/coord/intro)로는 250-350에 도달 불가 — 대부분 통과. **Positive curation (관광 가치 선별)** 방식이 필요.

### 권장 접근 방식: Positive Curation 4-Tier
| Tier | 기준 | 예상 건수 |
|------|------|----------:|
| TIER_A: 제주 시그니처 | 흑돼지/갈치/전복/해녀/고기국수 + phone + coord | ~200-250 |
| TIER_B: 품질 로컬 | 백년가게 + 맛집태그 + 풍부한 intro | ~50-80 |
| TIER_C: 지역 대표 | 권역별 coverage 확보용 best-in-region | ~50-80 |
| TIER_D: 제주 카페 select | 우도 땅콩/감귤/제주 재료 특화 카페 | ~30-50 |
| COLLECTIVE | 시장/먹거리거리 (Phone Gate 적용 안 함) | ~20-30 |
| **예상 합계** | | **~350-490** |

---

## Section 8: Pilot 검증 (상위 10건)

| Rank | 식당 | 지역 | Score | 핵심 Signal |
|------|------|------|------:|-------------|
| 1 | 성안식당 | 애월 | 12.5 | 백년가게+흑돼지+맛집 |
| 2 | 옹포별장가든 | 한림 | 12.5 | 백년가게+갈치+맛집 |
| 3 | 제주뚝배기 | 성산 | 12.5 | 백년가게+전복+맛집 |
| 4 | 도라지식당 | 제주시내 | 12.0 | 백년가게+고기+맛집 |
| 5 | 신설오름 | 제주시내 | 12.0 | 백년가게+흑돼지+맛집 |
| 6 | 죽성고을 | 제주시내 | 11.5 | 갈치+전복+맛집 |
| 7 | 일품순두부 하귀점 | 애월 | 11.5 | 흑돼지+맛집 |
| 8 | 쉐프의스시이야기 | 제주시내 | 11.5 | 전복+맛집 |
| 9 | 24시누름돌김치찌개 | 제주시내 | 11.5 | 흑돼지+맛집 |
| 10 | 협재칼국수 | 한림 | 11.5 | 갈치+맛집 |

> 모델 유효성 확인: 상위 후보들이 외국인 여행자 대상 제주 식당 추천에 적합한 실제 명소들임.

---

## Section 9: 다음 태스크 설계 (TASK-JEJU-FOOD-COLLECTION-V1)

### 전제 조건
| 항목 | 상태 | 비고 |
|------|------|------|
| VisitJeju c4 raw data | **AVAILABLE** | repo에 이미 존재 |
| VisitJeju API | WAF_BLOCKED | 재시도 필요 |
| KTO_API_KEY | UNAVAILABLE | type39 gap-fill 불가 |
| Naver 수동 검증 | Available | Phone Gate 실패 건만 |

### 실행 설계
1. **Source**: 기존 raw pages에서 c4 1870건 추출 (완료)
2. **Phone Gate**: 99.1% pass. 17건 missing → Naver 확인
3. **Coord**: 29건 missing → 관광 가치 감소 아님. NAVIGATION_UNRESOLVED 유지
4. **Curation**: Positive 4-Tier approach (TIER_A~D + COLLECTIVE)
5. **KTO gap-fill**: KTO_API_KEY 등록 후 type39 detailIntro2 → opentimefood/firstmenu/infocenterfood
6. **Multilingual**: VisitJeju API 복구 후 en/jp/cn locale 수집
7. **Image rights**: VISITJEJU_UNCLEARED 상태로 보존. Product use 전 clearance 필요

### 차단 항목
- **KTO_API_KEY 미등록** → 영업시간/메뉴/전화 보강 불가
- **VisitJeju API WAF 차단** → 다국어 수집 불가
- **Naver 수동 검증** → 자동화 불가

---

## Common Policy 준수 확인

| 원칙 | 상태 |
|------|------|
| UNKNOWN != NO | 확인 (phone/hours 없으면 absent) |
| AI_INFERRED_RESTAURANT_FACT = FORBIDDEN | 확인 |
| KTO type39 phone = detailIntro2.infocenterfood | 확인 |
| Phone Gate = individual restaurant only | 확인 |
| 시장/collective = Phone Gate 제외 | 확인 |
| Naver ONLY 외부 검증 | 확인 (Google/Kakao 금지) |
| FIELD_PROVENANCE = REQUIRED | 확인 |
| IMAGE_RIGHTS = VISITJEJU_UNCLEARED | 확인 |
| RAW_SOURCE_OVERWRITE = FORBIDDEN | 확인 |
| COMMON_POLICY_CURATION_CANDIDATE = YES | 4-Tier 모델 승격 후보 |

---

## 출력 파일

| 파일 | 설명 |
|------|------|
| `data/visitjeju/normalized/jeju/jeju-food-c4-source-universe-v1.json` | 1,870건 c4 raw universe |
| `data/visitjeju/reports/jeju/jeju-food-c4-research-v1.json` | 연구 결과 전문 |
| `data/visitjeju/manifests/jeju/jeju-food-c4-research-manifest-v1.json` | 태스크 요약 manifest |
| `docs/data-collection/jeju/jeju-food-c4-research-v1.md` | 이 문서 |
