# Five-City Regional Content Final Handoff v1

> Task: `TASK-FIVE-CITY-REGIONAL-CONTENT-FINAL-HANDOFF-V1`  
> Branch: `data/five-city-regional-content-handoff-v1`  
> Base commit: `ee268ff` (TASK-REGIONAL-RECOMMENDATIONS-JEONJU-V1)  
> Generated: 2026-08-22

---

## 1. 개요

5개 도시(부산·경주·서울·제주·전주) 지역 추천 콘텐츠 파이프라인 전체 완료. 총 20개 아티팩트 파일이 `data/regional-recommendations/` 하위 도시별 디렉터리에 존재한다. 본 handoff는 서비스 연동 전 최종 인계 문서이다.

도시별 완료 Task 순서: Busan → Gyeongju → Seoul → Jeju → Jeonju  
Branch 선형 계보: `data/busan-regional-recommendations-v1` → `data/gyeongju-regional-recommendations-v1` → `data/seoul-regional-recommendations-v1` → `data/jeju-regional-recommendations-v1` → `data/jeonju-regional-recommendations-v1` → `data/five-city-regional-content-handoff-v1`

---

## 2. 아티팩트 파일 목록 (20개)

| # | 파일 경로 | 도시 | 파일 유형 |
|---|-----------|------|-----------|
| 1 | `data/regional-recommendations/busan/busan-recommended-courses-v1.json` | 부산 | courses |
| 2 | `data/regional-recommendations/busan/busan-recommended-now-v1.json` | 부산 | recommended_now |
| 3 | `data/regional-recommendations/busan/busan-official-guides-v1.json` | 부산 | official_guides |
| 4 | `data/regional-recommendations/busan/busan-travel-utility-v1.json` | 부산 | travel_utility |
| 5 | `data/regional-recommendations/gyeongju/gyeongju-recommended-courses-v1.json` | 경주 | courses |
| 6 | `data/regional-recommendations/gyeongju/gyeongju-recommended-now-v1.json` | 경주 | recommended_now |
| 7 | `data/regional-recommendations/gyeongju/gyeongju-official-guides-v1.json` | 경주 | official_guides |
| 8 | `data/regional-recommendations/gyeongju/gyeongju-travel-utility-v1.json` | 경주 | travel_utility |
| 9 | `data/regional-recommendations/seoul/seoul-recommended-courses-v1.json` | 서울 | courses |
| 10 | `data/regional-recommendations/seoul/seoul-recommended-now-v1.json` | 서울 | recommended_now |
| 11 | `data/regional-recommendations/seoul/seoul-official-guides-v1.json` | 서울 | official_guides |
| 12 | `data/regional-recommendations/seoul/seoul-travel-utility-v1.json` | 서울 | travel_utility |
| 13 | `data/regional-recommendations/jeju/jeju-recommended-courses-v1.json` | 제주 | courses |
| 14 | `data/regional-recommendations/jeju/jeju-recommended-now-v1.json` | 제주 | recommended_now |
| 15 | `data/regional-recommendations/jeju/jeju-official-guides-v1.json` | 제주 | official_guides |
| 16 | `data/regional-recommendations/jeju/jeju-travel-utility-v1.json` | 제주 | travel_utility |
| 17 | `data/regional-recommendations/jeonju/jeonju-recommended-courses-v1.json` | 전주 | courses |
| 18 | `data/regional-recommendations/jeonju/jeonju-recommended-now-v1.json` | 전주 | recommended_now |
| 19 | `data/regional-recommendations/jeonju/jeonju-official-guides-v1.json` | 전주 | official_guides |
| 20 | `data/regional-recommendations/jeonju/jeonju-travel-utility-v1.json` | 전주 | travel_utility |

---

## 3. 도시별 핵심 지표 (실제 파일 기반 재산출)

> 아래 수치는 모두 실제 JSON 파일에서 직접 추출한 값이다. 메모리·이전 보고서 복사 금지.

### 3-A. 코스/추천나우/가이드/유틸리티 수량

| 도시 | 코스(확정+예비) | 추천나우(확정+예비) | 제외_Stale | 가이드(총) | KO | EN | JA | ZH | 유틸(총) | KO | EN | JA | ZH |
|------|----------------|---------------------|------------|-----------|----|----|----|----|---------|----|----|----|----|
| 부산 | 3+1 | 2+1 | 7 | 25 | 4 | 7 | 7 | 7 | 7 | 7 | 4 | 1 | 1 |
| 경주 | 3+1 | 3+2 | 6 | 5 | 4 | 0 | 0 | 0 | 8 | 8 | 5 | 3 | 3 |
| 서울 | 3+1 | 3+2 | 3 | 34 | 5 | 11 | 8 | 8 | 13 | 13 | 12 | 9 | 9 |
| 제주 | 3+2 | 3+2 | 3 | 8 | 5 | 5 | 2 | 2 | 12 | 12 | 8 | 5 | 4 |
| 전주 | 3+2 | 3+2 | 4 | 7 | 4 | 4 | 1 | 1 | 10 | 10 | 10 | 7† | 5 |
| **합계** | **15+7** | **14+9** | **23** | **79** | **22** | **27** | **18** | **18** | **50** | **50** | **39** | **25** | **22** |

†전주 유틸리티 JA=7(항목별 실측값). `utility_count_summary.locale_ja`=6은 파일 내 오타 — 기반 데이터 정상.

### 3-B. Canonical 연결 검증 (산술 합계)

| 도시 | REFS | EXACT | RELATION | EVENT | NEW_CANDIDATE | UNCERTAIN | 산술 |
|------|------|-------|----------|-------|---------------|-----------|------|
| 부산 | 33 | 13 | 2 | 0 | 18 | 0 | 13+2+0+18+0=33 ✓ |
| 경주 | 19 | 13 | 3 | 0 | 2 | 1 | 13+3+0+2+1=19 ✓ |
| 서울 | 16 | 3 | 12 | 1 | 0 | 0 | 3+12+1+0+0=16 ✓ |
| 제주 | 23 | 16 | 6 | 1 | 0 | 0 | 16+6+1+0+0=23 ✓ |
| 전주 | 24 | 22 | 1 | 1 | 0 | 0 | 22+1+1+0+0=24 ✓ |
| **합계** | **115** | **67** | **24** | **3** | **20** | **1** | **67+24+3+20+1=115 ✓** |

> NEW_CANDIDATE: canonical에 연결되지 않은 장소 후보. 실제 신규 place 생성은 없음(정책 준수).  
> UNCERTAIN(경주 1): 불국사 — 좌표 불일치로 canonical ID 미확인; RELATION 또는 AREA 처리 적합.

---

## 4. 도시별 Canonical ID 형식

| 도시 | ID 형식 | 예시 |
|------|---------|------|
| 부산 | `busan-A-XXXXX` | `busan-A-00001` |
| 경주 | `gyeongju-GJ01-XXXX` | `gyeongju-GJ01-0009` |
| 서울 | `seoul-KOP{6}` / `seoul-food-v1-{4}` | `seoul-KOP018992` |
| 제주 | `jeju-CNTS_XXX` / `jeju-CONT_XXX` | `jeju-CNTS_0000000001` |
| 전주 | `OFF-XXXXX` / `KTO-XXXXXX` | `OFF-10115` |

---

## 5. JSON 스키마 차이 (도시별)

초기 도시(부산·경주)와 후기 도시(서울·제주·전주) 간 스키마가 다르다. 서비스 연동 시 반드시 처리 필요.

| 항목 | 부산·경주 (초기) | 서울·제주·전주 (후기) |
|------|-----------------|---------------------|
| 코스 최상위 키 | `final_courses` | `final_recommended_courses` |
| 코스 stops 구조 | dict (day1: [...], day2: [...]) | list |
| 장소 ID 필드명 | `existing_city_spots_id` / `existing_canonical_id` | `canonical_id` + `linkage_type` |
| Stale 제외 키 | `expired_excluded` (부산) / `stale_or_excluded` (경주) | `stale_or_excluded` |
| Locale 가용 형식 | list `["ko","en"]` | dict `{"ko": true, "en": true}` |
| Canonical 연결 요약 | `id_linkage_summary` 최상위 | stop 항목별 `linkage_type` 필드 |

---

## 6. 주요 콘텐츠 결정사항

### 부산
- 18개 NEW_CANDIDATE(전포카페거리, 해리단길 등): canonical 미연결 — 신규 place 생성 없음(정책 준수). 서비스 측 "미연결 장소" 처리 필요.
- expired_excluded 7건: 기준일(2026-08-21) 이전 종료 이벤트

### 경주
- UNCERTAIN 1건(불국사): 좌표 불일치. 현재 city_spots에서 경주 좌표(35.79°N)와 맞는 ID 미확인. 서비스 연동 시 수동 재확인 권장.
- 공식 가이드 5건 모두 한국어(KO). EN/JA/ZH 가이드 없음 — 경주 official 다국어 가이드 부재 반영.

### 서울
- RELATION 12건: 서울 콘텐츠는 지역·구역 단위 참조가 많음(홍대 지역, 강남 지역 등). EXACT 연결 3건만.
- Canonical QA 별도 수행(TASK-SEOUL-REGIONAL-CANONICAL-LINKAGE-QA-V1, commit df2687f).
- SPACE-K 위치 오류 수정(commit be76d0a): venue_note 과천→서울 정정.

### 제주
- EXACT 16건, RELATION 6건, EVENT 1건 — 3개 도시 중 EXACT 비율 가장 높음.
- VisitJeju(`jeju-CNTS_`) + KTO(`jeju-CONT_`) 두 ID 체계 혼재.

### 전주
- EXACT 22/24(91.7%) — 5개 도시 중 최고 EXACT 비율.
- 남부시장 2 entity(OFF-16084 청년몰·OFF-16085 야시장) FUTURE_MERGE_REQUIRED 표시.

---

## 7. 정책 준수 확인

| 항목 | 상태 |
|------|------|
| 신규 place 생성 없음 | ✓ (NEW_CANDIDATE는 목록만, 실제 생성 없음) |
| AI/기계번역 사용 없음 | ✓ |
| canonical 수정·삭제 없음 | ✓ |
| common/master 수정 없음 | ✓ |
| git add . / force push 없음 | ✓ |
| 새 비공식 source 탐색 없음 | ✓ |
| 웹/API 수집 없음(이 Task) | ✓ |
| 임의 데이터 점수 조작 없음 | ✓ |

---

## 8. Branch 계보 및 커밋 이력

| 커밋 | Task | 도시 |
|------|------|------|
| `ae90ca5` | TASK-REGIONAL-RECOMMENDATIONS-BUSAN-V1+JA-ZH-GAP-CLOSE | 부산 |
| `4f07e6d` | TASK-REGIONAL-RECOMMENDATIONS-GYEONGJU-V1 | 경주 |
| `1cd2bdd` | TASK-REGIONAL-RECOMMENDATIONS-SEOUL-V1 | 서울 |
| `df2687f` | TASK-SEOUL-REGIONAL-CANONICAL-LINKAGE-QA-V1 | 서울 QA |
| `be76d0a` | TASK-SEOUL-REGIONAL-SPACE-K-LOCATION-FIX-V1 | 서울 수정 |
| `c4fb8f6` | TASK-REGIONAL-RECOMMENDATIONS-JEJU-V1 | 제주 |
| `ee268ff` | TASK-REGIONAL-RECOMMENDATIONS-JEONJU-V1 | 전주 (BASE) |

---

## 9. 다음 단계 (NEXT)

- 서비스 연동: 도시별 4파일을 서비스 레이어로 통합. 스키마 차이(§5) 처리 필수.
- 부산 18 NEW_CANDIDATE 처리 방침 결정 필요 (미연결 장소).
- 경주 불국사 UNCERTAIN 1건 수동 재확인.
- 전주 남부시장 FUTURE_MERGE: 서비스 구현 시 OFF-16084+OFF-16085 표시 방식 결정.
