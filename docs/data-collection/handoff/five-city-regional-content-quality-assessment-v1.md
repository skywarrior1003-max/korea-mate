# Five-City Regional Content Quality Assessment v1

> Task: `TASK-FIVE-CITY-REGIONAL-CONTENT-FINAL-HANDOFF-V1`  
> Generated: 2026-08-22  
> Source: 실제 아티팩트 파일 직접 추출 (메모리값 재사용 없음)

---

## 1. Arithmetic Validation (산술 검증)

모든 5개 도시 canonical linkage 산술 합계 검증 통과.

| 도시 | REFS | EXACT+REL+EVT+NEW+UNC | 검증 |
|------|------|-----------------------|------|
| 부산 | 33 | 13+2+0+18+0=33 | **PASS** |
| 경주 | 19 | 13+3+0+2+1=19 | **PASS** |
| 서울 | 16 | 3+12+1+0+0=16 | **PASS** |
| 제주 | 23 | 16+6+1+0+0=23 | **PASS** |
| 전주 | 24 | 22+1+1+0+0=24 | **PASS** |
| **5-city** | **115** | **67+24+3+20+1=115** | **PASS** |

---

## 2. 도시별 QA 결과

### 부산 (Busan)

**완료 Task:** TASK-REGIONAL-RECOMMENDATIONS-BUSAN-V1 + JA-ZH-GAP-CLOSE  
**커밋:** `ae90ca5`

| 항목 | 값 | 비고 |
|------|-----|------|
| 코스(확정) | 3 | `final_courses` 키 사용 (legacy schema) |
| stops 구조 | dict by day | day1, day2 방식 |
| id_linkage_summary 기준 | stops_total=30 | 실제 JSON stops 물리 수=39(transit 포함 가능성) |
| EXACT 연결 | 12(코스)+1(RN)=13 | `busan-A-XXXXX` 형식 |
| NEW_CANDIDATE | 18 | 전포카페거리·해리단길 등 — 실제 생성 없음 |
| expired_excluded | 7 | 기준일(2026-08-21) 이전 종료 이벤트 |
| 가이드 | 25개 (EN7·JA7·ZH7) | visitbusan 공식 가이드 |

**Known Issue:** NEW_CANDIDATE 18건은 city_spots에 없는 장소. 미연결로 처리. 서비스 연동 시 "장소 미매핑" 처리 방침 결정 필요.

---

### 경주 (Gyeongju)

**완료 Task:** TASK-REGIONAL-RECOMMENDATIONS-GYEONGJU-V1  
**커밋:** `4f07e6d`

| 항목 | 값 | 비고 |
|------|-----|------|
| 코스(확정) | 3 | `final_courses` 키 사용 (legacy schema) |
| id_linkage_summary 기준 | total_stops_final_courses=14 | 최종 코스 stops만 집계 |
| EXACT 연결 | 11(코스)+2(RN)=13 | `gyeongju-GJ01-XXXX` 형식 |
| NEW_CANDIDATE | 2 | 중앙시장 야시장·플레이스씨 |
| UNCERTAIN | 1 | 불국사 (좌표 불일치, canonical ID 미확인) |
| stale_or_excluded | 6 | 계절 외 또는 종료 이벤트 |
| 가이드 | 5개 (KO전용) | EN/JA/ZH 공식 가이드 부재 |

**Known Issue:**  
- 불국사 UNCERTAIN: `gyeongju-canonical-places-v1.jsonl` 좌표(35.79°N) 불일치. 서비스 연동 시 수동 재확인 권장.  
- EN/JA/ZH 가이드 없음: 경주 공식 가이드 포털의 다국어 커버리지 부재를 반영한 실제 상황. 임의 채우기 없음.

---

### 서울 (Seoul)

**완료 Task:** TASK-REGIONAL-RECOMMENDATIONS-SEOUL-V1  
**QA Task:** TASK-SEOUL-REGIONAL-CANONICAL-LINKAGE-QA-V1  
**수정 Task:** TASK-SEOUL-REGIONAL-SPACE-K-LOCATION-FIX-V1  
**커밋:** `1cd2bdd` → `df2687f` → `be76d0a`

| 항목 | 값 | 비고 |
|------|-----|------|
| 코스(확정) | 3 | `final_recommended_courses` 키 (v2 schema) |
| stops 구조 | list | v2 표준 |
| EXACT | 3 | `seoul-KOP{6}` / `seoul-food-v1-{4}` 형식 |
| RELATION | 12 | 홍대지역·강남지역 등 지역 단위 참조 |
| EVENT | 1 | 이벤트성 추천 |
| stale_or_excluded | 3 | 계절 외 이벤트 |
| 가이드 | 34개 (EN11·JA8·ZH8) | visitseoul 공식 가이드 가장 풍부 |

**QA 결과 (df2687f):**  
EXACT=3 / PARTIAL=1 / RELATION=12 / EVENT=1 / FIX=1(아르코미술관 KOP018992 수정)  
SPACE-K 위치 오류: venue_note 과천주소→서울소재 정정 (be76d0a)

---

### 제주 (Jeju)

**완료 Task:** TASK-REGIONAL-RECOMMENDATIONS-JEJU-V1  
**커밋:** `c4fb8f6`

| 항목 | 값 | 비고 |
|------|-----|------|
| 코스(확정) | 3, 예비 2 | `final_recommended_courses` 키 (v2) |
| EXACT | 16 | VisitJeju(`jeju-CNTS_`) + KTO(`jeju-CONT_`) 혼재 |
| RELATION | 6 | 지역 단위 참조 |
| EVENT | 1 | 이벤트성 추천 |
| stale_or_excluded | 3 | 계절 외 이벤트 |
| 가이드 | 8개 (KO5·EN5·JA2·ZH2) | |
| REFS 집계 방식 | final+reserve 합산 | 경주·부산은 final_courses만 집계 — 차이 주의 |

---

### 전주 (Jeonju)

**완료 Task:** TASK-REGIONAL-RECOMMENDATIONS-JEONJU-V1  
**커밋:** `ee268ff`

| 항목 | 값 | 비고 |
|------|-----|------|
| 코스(확정) | 3, 예비 2 | `final_recommended_courses` 키 (v2) |
| EXACT | 22/24 (91.7%) | 5개 도시 중 최고 EXACT 비율 |
| RELATION | 1 | 비빔밥거리 (지역 단위) |
| EVENT | 1 | 전주세계소리축제 (canonical=null) |
| stale_or_excluded | 4 | JIFF/봄·막걸리축제·제야축제·세계소리축제 |
| 가이드 | 7개 (KO4·EN4·JA1·ZH1) | |
| 유틸리티 JA | **7** (per-item 실측) | utility_count_summary.locale_ja=6은 파일 내 오타 |

**Entity 결정사항:**
- 전주동물원(OFF-9784) canonical, 전주드림랜드(OFF-16676) sub
- 국립전주박물관(OFF-9756) canonical, 어린이박물관(OFF-16104) sub
- 남부시장 FUTURE_MERGE_REQUIRED: 청년몰(OFF-16084)+야시장(OFF-16085) 별도 active entity 유지

---

## 3. 스키마 일관성 검증

| 검증 항목 | 부산 | 경주 | 서울 | 제주 | 전주 |
|-----------|------|------|------|------|------|
| 코스 최상위 키 존재 | final_courses ✓ | final_courses ✓ | final_recommended_courses ✓ | final_recommended_courses ✓ | final_recommended_courses ✓ |
| reserve_courses 존재 | ✓ | ✓ | ✓ | ✓ | ✓ |
| stale/expired 키 존재 | expired_excluded ✓ | stale_or_excluded ✓ | stale_or_excluded ✓ | stale_or_excluded ✓ | stale_or_excluded ✓ |
| 가이드 총합 필드 | guides_count_by_locale ✓ | guide_count_summary ✓ | guide_count_summary ✓ | guide_count_summary ✓ | guide_count_summary ✓ |
| 유틸 locale_availability | list 형식 | list 형식 | dict 형식 | dict 형식 | dict 형식 |
| id_linkage_summary | top-level ✓ | top-level ✓ | 없음(stop-level) | 없음(stop-level) | 없음(stop-level) |

---

## 4. 알려진 데이터 이슈 (Known Issues)

| ID | 도시 | 유형 | 내용 | 권장 조치 |
|----|------|------|------|---------|
| KI-001 | 부산 | NEW_CANDIDATE | 18개 장소 canonical 미연결 | 서비스 측 미매핑 처리 방침 결정 |
| KI-002 | 경주 | UNCERTAIN | 불국사 canonical ID 좌표 불일치 | 수동 canonical 재확인 |
| KI-003 | 경주 | 가이드 | EN/JA/ZH 공식 가이드 0건 | 공식 소스 부재 — 의도적 공백 |
| KI-004 | 전주 | 유틸 summary | locale_ja=6(오타), 실제=7 | 파일 내 summary 필드 오타. 데이터 자체는 정상 |
| KI-005 | 전주 | 남부시장 | OFF-16084+OFF-16085 별도 entity | 서비스 구현 시 표시 방식 결정 |
| KI-006 | 서울 | 위치 | SPACE-K 과천→서울 정정 완료 | 완료(be76d0a) |

---

## 5. 정책 준수 최종 확인

| 정책 | 검증 결과 |
|------|----------|
| 신규 place 생성 없음 | PASS — NEW_CANDIDATE 20건은 목록만, DB 생성 없음 |
| AI/기계번역 금지 | PASS — 공식 source 원문 사용 |
| canonical 수정·삭제 없음 | PASS |
| common/master branch 수정 없음 | PASS |
| 추천 개수 억지 채우기 금지 | PASS — 경주 가이드 EN/JA/ZH=0 유지 |
| 블로그·리뷰어 이미지 금지 | 적용 없음 (이미지 없는 Task) |
| 새 비공식 source 탐색 금지 | PASS |
| 임의 데이터 점수 조작 금지 | PASS |

**FIVE_CITY_REGIONAL_CONTENT_QA = PASS**  
**SAFE_TO_CLOSE = YES**
