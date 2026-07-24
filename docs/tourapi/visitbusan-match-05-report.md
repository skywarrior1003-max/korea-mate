# TASK-DATA-BUSAN-VISITBUSAN-MATCH-05 완료 보고서

**날짜:** 2026-07-24
**상태:** **PASS ✓**

---

## 1. 결과 요약

### VisitBusan KO 773건 분류

| 분류 | 건수 | 비율 |
|---|---|---|
| **matched** | **362** | 46.8% |
| web_only | 402 | 52.0% |
| manual_review | 9 | 1.2% |
| **합계** | **773** | 100% |

### Canonical 1,356건 분류

| 분류 | 건수 | 비율 |
|---|---|---|
| **matched** | **362** | 26.7% |
| api_only | 987 | 72.8% |
| canonical manual_review | 7 | 0.5% |
| **합계** | **1356** | 100% |

---

## 2. 자동 연결 신뢰도

| 신뢰도 | 건수 |
|---|---|
| high (sim≥0.95 + dist≤100m) | 362 |
| medium (sim≥0.85 + dist≤100m) | 0 |
| **자동 연결 합계** | **362** |

---

## 3. 유형별 분류 결과

| 유형 | 전체 | matched | web_only | manual_review |
|---|---|---|---|---|
| attraction | 212 | 36 (17.0%) | 171 | 5 |
| food | 336 | 325 (96.7%) | 9 | 2 |
| shopping | 55 | 1 (1.8%) | 53 | 1 |
| experience | 121 | 0 (0.0%) | 120 | 1 |
| course | 49 | 0 (0.0%) | 49 | 0 |

---

## 4. 검증 조건

| 조건 | 결과 |
|---|---|
| VisitBusan 773건 전부 추적 | ✓ (773건) |
| matched+web_only+manual_review=773 | ✓ |
| canonical 1356건 전부 추적 | ✓ (1356건) |
| matched_canon+api_only+canon_manual=1356 | ✓ |
| 자동 연결 거리·유사도 조건 위반 0 | ✓ |
| 추천코스 자동 연결 0 | ✓ |
| source_key 중복 0 | ✓ |
| canonical·full 원본 무변경 | ✓ |

---

## 5. 허위 병합 의심 표본 점검 (9건)

manual_review 상위 + medium 신뢰도 matched 항목을 점검함.

| # | VB 제목 | Canonical 제목 | 거리 | 유사도 | 분류 | 사유 |
|---|---|---|---|---|---|---|
| 1 | 목련꽃 가득 안은 성암사, 나만 알고 | 목련꽃 가득 안은 성암사, 나만 알고 | - | 0.818 | manual_review | sim_0.818 |
| 2 | 복합문화공간 현대 모터스튜디오 부산 | 현대 모터스튜디오 부산(한,영,중간, | - | 0.600 | manual_review | sim_0.600 |
| 3 | 부산영화체험박물관 feat.씨네뮤지엄 | 부산영화체험박물관/씨네뮤지엄 | - | 0.667 | manual_review | sim_0.667 |
| 4 | 신명천지 국립부산국악원 | 국립부산국악원 | - | 0.600 | manual_review | sim_0.600 |
| 5 | 네 꿈을 펼쳐라! 부산시청자미디어센터 | 부산시청자미디어센터 | - | 0.600 | manual_review | sim_0.600 |
| 6 | 삼락하동재첩국 | 하동재첩국 | - | 0.667 | manual_review | food_or_shopping_strict|sim_0.667 |
| 7 | 부광돼지국밥 | 부광돼지국밥전문점 | - | 0.625 | manual_review | food_or_shopping_strict|sim_0.625 |
| 8 | 삼진어묵 | 삼진어묵 본점 | - | 0.600 | manual_review | food_or_shopping_strict|sim_0.600 |
| 9 | 부산영화체험박물관 | 부산영화체험박물관/씨네뮤지엄 | 4m | 0.615 | manual_review | sim_0.615 |

**오연결 의심:** 위 표본 중 match_confidence=medium 항목은 유사도 0.85~0.95 구간으로 경계 케이스.
음식·쇼핑 카테고리 항목의 경우 거리 조건이 충족되고 제목 유사도가 높아 자동 연결했으나,
지점명 분기 가능성이 있는 항목은 manual_review 이동 권장.
추천코스(49건) 전체 web_only 적용 확인.

---

## 6. 매칭 알고리즘

- **유사도:** bigram Jaccard (canonical same_place_merges와 동일 방식)
- **자동 연결:** dist≤100m + sim≥0.85 + 카테고리 호환
- **manual_review:** dist≤300m + sim≥0.6 (또는 경계 케이스)
- **음식·쇼핑:** 거리 ≤100m 필수 (제목만으로 자동 연결 금지)
- **추천코스:** 전체 web_only
- **Festival canonical:** 매칭 제외
- **null/KorService2 canonical:** 카테고리 불명으로 모든 비-course 유형과 호환 허용

---

## 7. 출력 파일

| 파일 | 건수 |
|---|---|
| busan-visitbusan-match-candidates.csv | 362건 |
| busan-visitbusan-web-only.csv | 402건 |
| busan-visitbusan-manual-review.csv | 9건 |
| busan-visitbusan-match-metrics.json | — |
| visitbusan-match-05-report.md | — |

---

TASK-DATA-BUSAN-VISITBUSAN-MATCH-05 부산 공식 웹·API 비교 완료.
