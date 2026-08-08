# 경주 데이터 수집 최종 핸드오프 문서

**문서명**: gyeongju-main-laptop-handoff-v1.md
**작성일**: 2026-08-08
**상태**: GYEONGJU_DATA_COLLECTION_STATUS = **CLOSED**
**브랜치**: `data/gyeongju-final-closeout-handoff-v1`
**기반 커밋**: `05ad3ac` (data/gyeongju-kto-service2-final-recovery-v2)

---

## 1. FINAL READY 요약

| 항목 | 수량 |
|------|------|
| **FINAL_READY 합계** | **302** |
| Set A — 야간 배치 (235) + V4 신규 (2) | 237 |
| Set B — KTO74 복구 신규 (V2) | 63 |
| Set C — HOLD_IMAGE 해소 (감포항/강동워터파크) | 2 |
| **교집합 A∩B, A∩C, B∩C** | **모두 공집합** |

### Set union 검증 결과
- A∩B = 공집합 (KTO_CACHE_MISS 74건은 베이스라인 237에 없음)
- A∩C = 공집합 (감포항/강동워터파크는 VG_COLLECTION_PENDING → 베이스라인 아님)
- B∩C = 공집합 (감포항 128677, 강동워터파크 2044527은 74 KTO_CACHE_MISS에 없음)
- **FINAL UNION = ARITHMETIC SUM = 302** (중복 없음)

---

## 2. 카테고리 분류

| 카테고리 | 수량 |
|----------|------|
| 관광지/자연 (attraction/nature) | **200** |
| 식당 (restaurant) | **102** |
| 합계 | **302** |

### 소스별 구성
| 소스 | prefix | 카테고리 | 수량 |
|------|--------|----------|------|
| VG 공식 관광지 | GJ01 | attraction | 133 |
| VG 레스토랑 | GJ08 | restaurant | 102 |
| KTO12 V4 신규 | KTO12 | attraction | 2 |
| KTO12 복구 V2 | KTO12 | attraction | 63 |
| KTO12 이미지 해소 | KTO12 | attraction | 2 |

---

## 3. HOLD 동결 현황

| HOLD 유형 | 수량 |
|-----------|------|
| HOLD_IMAGE_FINAL (이미지 권리 미해소) | 11 |
| V4 기타 HOLD (KTO_CACHE_MISS 포함) | 112 |
| **총 동결** | **123** |

HOLD 항목은 `gyeongju-final-hold-freeze-v1.jsonl` 에 동결 기록됨.
향후 이미지 권리 확보 시 별도 수집 태스크로 재개.

---

## 4. 품질 지표 (N=302)

### 필수 필드 (전수 확인)

| 필드 | 수량 | 커버리지 |
|------|------|----------|
| has_description | 302/302 | 100.0% |
| has_address | 302/302 | 100.0% |
| has_coords | 302/302 | 100.0% |
| has_images | 302/302 | 100.0% |

### 운영 정보 — 신규 65 KTO 항목 (n=65)

| 필드 | 수량 | 커버리지 |
|------|------|----------|
| homepage | 49/65 | 75.4% |
| usetime | 57/65 | 87.7% |
| restdate | 57/65 | 87.7% |
| tel | 0/65 | 0.0% |
| usefee | 0/65 | 0.0% |

**주의**: 베이스라인 235 항목의 운영 정보는 정규화 파일에 포함되지 않음.
- CORE27(27): 공식 사이트 phone/hours/admission 보유
- TIER_A(106): KTO detailcommon2 cache에 homepage ~70/75 보유
- RESTAURANT(102): VG 소스, 운영시간 미포착

---

## 5. 품질 등급

| 등급 | 기준 | 수량 |
|------|------|------|
| **TIER_A** (고품질) | 필수 4개 필드 + 운영정보 (homepage/usetime/phone 중 1개 이상) | 193 |
| **TIER_B** (서비스 가능) | 필수 4개 필드만 (운영정보 미포착) | 109 |

---

## 6. EN 커버리지 (N=302)

| 상태 | 수량 |
|------|------|
| EN_READY | 11 |
| EN_PARTIAL | 127 |
| EN 미수집/없음 | 164 |
| EN 제목 있음 | 138 |
| EN 설명 있음 | 19 |

**비고**: 신규 67개 항목(V4 new 2 + KTO74 new 63 + HOLD_IMAGE 2)은 EN 수집 페이즈 이전에 추가됨.
EN 수집은 별도 태스크로 수행 필요.

---

## 7. 이미지 권리

| 권리 유형 | 수량 |
|-----------|------|
| VG 공식 (공공저작물) | 102 |
| KTO Type1 (공공저작물, 자유이용) | 0 |
| KTO Type3 (출처 표기 필요) | 0 |
| IMAGE_RIGHTS_CLEARED | 2 |
| 기타 | 2 |

---

## 8. 위치/라우팅

| 항목 | 수량 |
|------|------|
| 좌표 보유 (has_coords) | 302/302 (100%) |
| 공식 관광 코스 연결 | 22개 코스 연결 |
| 문화 해설 관계 | 10건 |

---

## 9. 파이프라인 이력 요약

| 태스크 | 브랜치/커밋 | 결과 |
|--------|-------------|------|
| 야간 배치 (overnight) | — | 235 READY |
| V4 소스 해소 | 5d3d95d | +2 READY (총 237) |
| V4 EN 수집 | — | EN_READY 11, EN_PARTIAL 25 |
| KTO HTTP 400 진단 | — | KorService2 vs KorService1 원인 확인 |
| KTO74 복구 V2 | 05ad3ac (PUSHED) | +63 READY, +2 HOLD_IMAGE 해소 = 302 |
| **최종 핸드오프** | **이 브랜치** | **302 CLOSED** |

---

## 10. 후속 태스크 목록 (메인 랩톱)

### 즉시
- [ ] 이 브랜치 PR 리뷰 및 머지
- [ ] gyeongju-final-release/ 데이터 DB 반영 검토

### 단기 (선택)
- [ ] 신규 67개 항목 EN 수집 (KTO EN Service 별도 태스크)
- [ ] HOLD_IMAGE_FINAL 11건 재검토 (이미지 권리 해소 여부)
- [ ] TIER_B 항목 운영정보 보강 (레스토랑 시간, 가격 등)

### 부산 연결
- [ ] busan-gap-audit-application-v1.md 갱신 (경주 교훈 반영)
- [ ] Busan 스크립트 YN 파라미터 검사 (`grep -n "YN"`)
- [ ] Busan 최종 READY 집합 합산 시 set union 방식 적용

---

## 11. 출력 파일 목록

| 파일명 | 설명 |
|--------|------|
| `gyeongju-final-set-audit-v1.json` | 집합 합산 증명 (A|B|C) |
| `gyeongju-final-ready-302-v1.jsonl` | 최종 302 READY 후보 목록 |
| `gyeongju-final-hold-freeze-v1.jsonl` | 동결 HOLD 목록 |
| `gyeongju-final-quality-metrics-v3.json` | 전체 품질 지표 |
| `gyeongju-final-quality-tier-v1.jsonl` | TIER A/B 분류 |
| `gyeongju-final-en-coverage-302-v1.jsonl` | EN 커버리지 302건 |
| `gyeongju-final-image-rights-302-v1.jsonl` | 이미지 권리 302건 |
| `gyeongju-final-location-routing-v1.json` | 위치/라우팅 요약 |
| `gyeongju-final-busan-gap-check-v1.json` | 부산 간극 감사 체크 |
| `gyeongju-main-laptop-handoff-v1.md` | 이 문서 |
| `gyeongju-final-closeout-summary-v1.json` | 클로즈아웃 요약 |
| `gyeongju-final-common-rules-check-v1.json` | 공통 규칙 준수 확인 |

---

**GYEONGJU_DATA_COLLECTION_STATUS = CLOSED**
**NEXT_STEP = MAIN_LAPTOP_REVIEW_AND_INTEGRATION**

---
*생성: gyeongju_final_closeout_handoff_v1.py | 2026-08-08*
