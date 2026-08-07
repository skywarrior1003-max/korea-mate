# TASK-GYEONGJU-EN-CONTRACT-CORRECTION-REVIEW-AUDIT-AND-OFFICIAL-SITE-SUPPLEMENT-V1 완료보고서

**작성일시**: 2026-08-07  
**브랜치**: `data/gyeongju-en-contract-review-official-site-v1` @ `003075f` ✅  
**Base**: `data/gyeongju-en-235-full-collection-v1` @ `f319a1f`

---

## 1. 검증 단계 요약

| 검증 항목 | 결과 |
|---|---|
| Base HEAD f319a1f 확인 | ✅ |
| 영문 공식 매뉴얼 탐색 (data.go.kr) | ✅ 국문 매뉴얼만 존재, 영문 전용 없음 |
| ldongCode2 경주 코드 직접 확인 | ✅ lDongRegnCd=47, lDongSignguCd=130 |
| areaCode vs lDong 비교 | ✅ 64건 → 102건 (+38건) |
| 235건 재매칭 (102건 기준) | ✅ EXACT 41→46 (+5건) |
| REVIEW 92건 충돌 감사 | ✅ 유형별 분류 완료 |
| visitgyeongju 보강 (URL 패턴 추측 금지) | ✅ 직접 확인 0건 |
| 최종 EN coverage 재계산 | ✅ 완료 |
| Run1 → Run2 HTTP=0 확인 | ✅ |
| QA 종합 | ✅ PASS (FAIL=0, WARN=1) |

**판정: 이슈 없음 → 실행 완료**

---

## 2. 핵심 발견: EngService2 lDong 방식 계약 수정

### 2-1. ldongCode2 경주 코드 확정

| 항목 | Task5 (구방식) | Task6 (lDong 수정) |
|---|---|---|
| 파라미터 | `areaCode=35&sigunguCode=2` | `lDongRegnCd=47&lDongSignguCd=130` |
| 응답 건수 | **64건** | **102건** |
| 차이 | — | **+38건 (신규 발견)** |
| 역호환성 | — | 구방식 64건 전부 포함 + 추가 |

**lDong 방식이 상위 호환** — 구방식 누락 없음, 38건 추가 수집.

### 2-2. lDong 코드 직접 확인 경로

```
ldongCode2 (no params) → code=47 (Gyeongsangbuk-do)
ldongCode2 (lDongRegnCd=47) → code=130 (Gyeongju-si)
areaBasedList2 (lDongRegnCd=47, lDongSignguCd=130) → 102건 rc=0000
```

### 2-3. 신규 38건 중 주요 명소 (ContentType 76: Cultural Facility)

| contentId | EN title | 비고 |
|---|---|---|
| 264256 | Cheomseongdae Observatory (경주 첨성대) | **핵심 관광지** |
| 264367 | Donggung Palace and Wolji Pond (경주 동궁과 월지) | **핵심 관광지** |
| 804281 | Gyeongju Yangdong Village [UNESCO World Heritage] | **세계문화유산** |
| 950952 | Gyeongju EXPO Grand Park (경주엑스포대공원) | 대형 공원 |
| 1863267 | Silla Arts and Science Museum (신라역사과학관) | |
| 3403854 | Dokrakdang House (경주 독락당) | |
| 2818690 | Gyeongju Daereungwon Ancient Tomb Complex | 대릉원 일원 |
| 3492117 | Library of the Silla Millennium | 신라천년서고 |

나머지 30건: 주로 Tax Refund Shop (type=79) 23건 추가

---

## 3. 235건 EN Identity 재매칭 결과

### 3-1. Task5 → Task6 비교

| 판정 | Task5 | Task6 | 변화 |
|---|---|---|---|
| **EXACT_OFFICIAL_IDENTITY** | 41건 | **46건** | **+5건** ✅ |
| REVIEW_REQUIRED | 93건 | **92건** | -1건 |
| NO_EN_RECORD | 101건 | **97건** | -4건 |

### 3-2. 신규 EXACT 전환 5건

| candidate_id | name_ko | EN title | 증거 |
|---|---|---|---|
| GJ01-0017 | 동궁과 월지 | Donggung Palace and Wolji Pond (경주 동궁과 월지) | ko_name_subset_of_en_ko |
| GJ01-0036 | 첨성대 | Cheomseongdae Observatory (경주 첨성대) | ko_name_subset_of_en_ko |
| GJ01-0147 | 양동마을 | Gyeongju Yangdong Village [UNESCO World Heritage] (경주 양동마을…) | ko_name_subset_of_en_ko |
| GJ01-0128 | 신라역사과학관 | Silla Arts and Science Museum (신라역사과학관) | exact_ko_name_in_en_title |
| GJ01-0138 | 독락당 | Dokrakdang House (경주 독락당) | ko_name_subset_of_en_ko |

> **주의**: 동궁과 월지(GJ01-0017)는 Task5에서 REVIEW_REQUIRED로 `en_cid=264632` 배정 → Task6에서도 동일 `en_cid=264367`로 재배정. 신규 lDong 목록에서 이름 매칭 성공.

---

## 4. 최종 EN Coverage (235건)

### 4-1. 분포

| 분류 | Task5 | Task6 | 변화 |
|---|---|---|---|
| **EN_READY** | 6건 | **11건** | **+5건** ✅ |
| EN_PARTIAL | 35건 | **35건** | 동일 |
| EN_IDENTITY_REVIEW | 93건 | **92건** | -1건 |
| EN_SOURCE_MISSING | 101건 | **97건** | -4건 |

### 4-2. EN_READY 11건 목록

| candidate_id | name_ko | EN title |
|---|---|---|
| GJ01-0004 | 경주 월성 | Gyeongju Wolseong Palace Site |
| GJ01-0042 | 황리단길 | Gyeongju Hwangnidan Street |
| GJ01-0140 | 무열왕릉 | Gyeongju Tomb of King Muyeol |
| GJ01-0007 | 경주향교 | Gyeongjuhyanggyo Local Confucian School |
| GJ01-0025 | 성동시장 | Gyeongju Seongdong Market |
| GJ08-7510 | 요석궁1779 | Yosukgung 1779 |
| GJ01-0017 | 동궁과 월지 | Donggung Palace and Wolji Pond |
| GJ01-0036 | 첨성대 | Cheomseongdae Observatory |
| GJ01-0147 | 양동마을 | Gyeongju Yangdong Village |
| GJ01-0128 | 신라역사과학관 | Silla Arts and Science Museum |
| GJ01-0138 | 독락당 | Dokrakdang House |

---

## 5. REVIEW 92건 충돌 감사

| 충돌 유형 | 건수 | 의미 |
|---|---|---|
| EXACT_CLAIMED | 29건 | EXACT 매칭이 선점한 EN record에 좌표 근접 |
| MANY_TO_ONE | 52건 | 여러 KO 장소가 동일 EN record에 좌표 근접 |
| ONE_TO_ONE | 11건 | KO 1건이 EN 1건에만 좌표 근접 |
| **최대 경쟁자 수** | **8건** | 동일 EN record에 8개 KO 장소 근접 |

**해소 방법 (수동 검토 필요)**:
- EXACT_CLAIMED(29건): EXACT 매칭이 올바르면 REVIEW 건은 자동 해소 가능
- MANY_TO_ONE(52건): EN title vs KO name 직접 대조 필요
- ONE_TO_ONE(11건): EN title 확인 후 승격 가능성 있음

---

## 6. 공식 영문 매뉴얼 감사

| 항목 | 결과 |
|---|---|
| data.go.kr 영문 매뉴얼 | **미존재** (국문 매뉴얼만 제공) |
| Task5 계약(CONTRACT_FINALIZED) | 유효 유지 |
| 신규 발견 (lDong 방식) | 기존 계약에 추가 |

**결론**: EngService2 공식 영문 매뉴얼 없음 → `approved-api-inventory.md` + 파일럿 실측 계약 그대로 유효. 단, lDong 방식 사용으로 102건 접근 가능함을 계약에 추가.

---

## 7. visitgyeongju EN 보강

| 항목 | 결과 |
|---|---|
| visitgyeongju audit 건수 | 10건 |
| 직접 확인 URL | **0건** |
| 적용 건수 | 0건 (URL 패턴 추측 금지 준수) |

**이유**: Task 5에서 향화정(GJ08-7128) hexID URL만 직접 확인됨. 나머지 9건은 KO_VERIFIED_MULTILINGUAL_INFERRED 상태(직접 확인 아님). URL 패턴 추측 금지 규칙 준수.

---

## 8. QA 결과

| 규칙 | 결과 |
|---|---|
| 좌표 단독 HIGH_CONFIDENCE 없음 | ✅ PASS (0건) |
| contentId namespace 혼용 없음 | ✅ PASS |
| 임의 번역 없음 | ✅ PASS |
| 235건 전수 재호출 없음 (신규 5건만) | ✅ PASS |
| 입력 235건 정확 | ✅ PASS |
| URL 패턴 추측 없음 | ✅ PASS |
| API key 미노출 | ✅ PASS |
| EN 102건 좌표 coverage | ⚠️ WARN (1건 좌표 없음 — 데이터 원본 문제) |
| **QA 종합** | **PASS (FAIL=0, WARN=1)** |

> WARN 1건: lDong 102건 중 1건 좌표 없음 — EngService2 원본 데이터 문제이므로 조치 불가.

---

## 9. EngService2 계약 수정 확정

| 항목 | 수정 전 (Task5) | 수정 후 (Task6) |
|---|---|---|
| 지역 필터 파라미터 | `areaCode=35&sigunguCode=2` | `lDongRegnCd=47&lDongSignguCd=130` |
| EN 목록 건수 | 64건 | **102건** |
| ldongCode2 경주 | NOT_TESTED | **CONFIRMED** (lDongRegnCd=47, lDongSignguCd=130) |
| detailCommon2 파라미터 | defaultYN/firstImageYN 등 → INVALID | **contentId만 허용** (CONFIRMED) |
| 권장 방식 | areaCode | **lDong 방식 (상위 호환)** |

---

## 10. 재현성 / API 호출

| 항목 | Run 1 | Run 2 |
|---|---|---|
| 신규 HTTP 호출 | 5건 (신규 EXACT 5건 상세) | **0건** ✅ |
| 캐시 | 4건 | 9건 |
| 매칭 결과 | EXACT=46, REVIEW=92, NO_EN=97 | 동일 |
| Coverage 결과 | READY=11, PARTIAL=35 등 | 동일 |
| 논리 결과 동일 | — | ✅ |

---

## 11. 번역 대기열

| 버전 | 건수 | 구성 |
|---|---|---|
| Task5 v1 | 136건 | EN_SOURCE_MISSING 101 + EN_PARTIAL 35 |
| **Task6 v2** | **132건** | EN_SOURCE_MISSING 97 + EN_PARTIAL 35 |

개선: -4건 (신규 EXACT 전환으로 MISSING → READY/PARTIAL 변환)

---

## 12. 산출물

| # | 파일 | 위치 | 건수 |
|---|---|---|---|
| 1 | `gyeongju-engservice2-official-manual-audit-v1.json` | normalized/ | — |
| 2 | `gyeongju-engservice2-contract-correction-v1.json` | normalized/ | — |
| 3 | `gyeongju-engservice2-area-vs-ldong-comparison-v1.json` | normalized/ | — |
| 4 | `gyeongju-en-task6-newly-exact-v1.jsonl` | normalized/ | 5건 |
| 5 | `gyeongju-en-review-collision-audit-v1.jsonl` | validation/ | 92건 |
| 6 | `gyeongju-ko-en-identity-link-235-v2.jsonl` | normalized/ | 235건 |
| 7 | `gyeongju-en-235-snapshot-v2.jsonl` | normalized/ | 46건 |
| 8 | `gyeongju-engservice2-detail-audit-task6-new-v1.jsonl` | normalized/ | 5건 |
| 9 | `gyeongju-official-en-site-contract-v1.json` | normalized/ | — |
| 10 | `gyeongju-official-en-site-linkage-v1.jsonl` | normalized/ | 0건 |
| 11 | `gyeongju-en-235-final-official-coverage-v1.jsonl` | normalized/ | 235건 |
| 12 | `gyeongju-en-translation-fallback-queue-v2.jsonl` | normalized/ | 132건 |
| 13 | `gyeongju-en-correction-api-ops-v1.json` | validation/ | — |
| 14 | `gyeongju-en-235-final-coverage-stats-v1.json` | validation/ | — |
| 15 | `gyeongju-en-correction-qa-v1.json` | validation/ | — |
| 16 | `gyeongju-en-correction-sha-v1.json` | validation/ | — |
| — | `gyeongju_en_contract_review_official_site_v1.py` | scripts/ | — |

---

## 13. 다음 단계 권고

1. **EN_IDENTITY_REVIEW 92건 수동 검토**
   - EXACT_CLAIMED(29건): 현재 EXACT 매칭 선점 확인 후 자동 해소 가능
   - MANY_TO_ONE(52건): EN title vs KO name 대조로 개별 판단
   - ONE_TO_ONE(11건): 직접 대조 후 EXACT 승격 가능성 높음

2. **lDong 신규 38건 중 KO 미연결 확인**
   - 38건 중 5건만 235 KO record와 EXACT 연결됨
   - 나머지 33건(Tax Refund Shop 위주)은 현재 KO 후보 없음 → 향후 검토

3. **EN_SOURCE_MISSING 97건 번역 대기열 처리**
   - Restaurant 위주 — EngService2 미등록 → 번역 파이프라인

4. **EN_PARTIAL 35건 보강**
   - detailCommon2 overview 누락 → 향후 EngService2 재확인 또는 번역

5. **향후 EngService2 호출 시 lDong 방식 사용**
   - `areaCode=35/sigunguCode=2` 대신 `lDongRegnCd=47/lDongSignguCd=130`
   - 64건 → 102건 상위 호환

---

## Git

```
브랜치: data/gyeongju-en-contract-review-official-site-v1
커밋:   003075f
Base:   f319a1f (data/gyeongju-en-235-full-collection-v1)
Push:   ✅
```

작업을 완료했습니다
