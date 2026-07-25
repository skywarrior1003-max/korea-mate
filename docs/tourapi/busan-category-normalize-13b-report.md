# TASK-DATA-BUSAN-CATEGORY-NORMALIZE-13B 완료 보고서

**날짜:** 2026-07-24  
**상태:** **PASS ✓ — 665건 category 확정 완료**

---

## 작업 개요

busan-K-* 행 중 `category=unknown` 인 665건을 TourAPI KorService2 `contentTypeId` 기준으로 분류했습니다.  
운영 DB·Git·이미지·subcategory는 모두 무변경.

---

## contentTypeId → category 매핑 규칙

| contentTypeId | 명칭 | 적용 category | 비고 |
|---|---|---|---|
| 12 | 관광지 | `attraction` | |
| 14 | 문화시설 | `attraction` | |
| 15 | 축제·공연·행사 | `event` | |
| 25 | 여행코스 | — | `candidate_status` → `course_reference` |
| 28 | 레포츠 | `attraction` / `nature` | 키워드 기반 구분 |
| 32 | 숙박 | `accommodation` | |
| 38 | 쇼핑 | `attraction` | 시장·상권 = 관광지 |
| 39 | 음식점 | `restaurant` | |

**레포츠(28) 키워드 규칙:**  
실내 시설 키워드(`빙상`, `사격`, `아이스`, `수련관`, `클럽`, `레이저`, `태그`, `인라인`, `교육원`) 포함 → `attraction` / 그 외 → `nature`

**특수 처리: busan-K-00739**  
`linked_source_keys`가 파이프(`|`) 구분 다중 원천(`VisitBusanContent:shopping:549:ko|KorService2:3452166:ko`).  
KorService2 키(`3452166`) 분리 조회 → contentTypeId=12(관광지) → `attraction`.

---

## 처리 결과

| 구분 | 건수 |
|---|---|
| 총 처리 | 665 |
| attraction | 240 |
| restaurant | 266 |
| event | 31 |
| accommodation | 77 |
| nature | 29 |
| course_reference 재분류 | 22 |
| not_found | 0 |
| 이미 분류됨 (busan-K-00081) | 1 (skip) |

**attraction 240건 상세:**
- contentTypeId 12 (관광지): 138건
- contentTypeId 14 (문화시설): 37건
- contentTypeId 38 (쇼핑): 56건
- contentTypeId 28 (레포츠 실내): 9건

**레포츠 28 키워드 분류 결과:**

| category | 대표 장소 |
|---|---|
| attraction (9건) | 부산실내빙상장, 센텀시티아이스링크, 레이저태그스포츠, 영도실탄사격장, 아시아드컨트리클럽, 함지골청소년수련관 등 |
| nature (29건) | 광안리SUP, 해파랑길, 갈맷길, 요트투어, 서핑학교, 야영장·글램핑 등 |

---

## 여행코스(25) 22건 재분류

`api_only_existing` → `candidate_status = course_reference`  
category는 미배정(unknown 유지), `review_reason` = "여행코스(contentTypeId=25): 독립 장소 후보 아님 — 13B 재분류"

| 대표 항목 |
|---|
| 영도의 바다를 만나다 (busan-K-00178) |
| 용두산을 올라 부산포를 보다 (busan-K-00196) |
| 부산 앞바다를 한눈에 아우르다 (busan-K-00185) |
| 해파랑길(부산,울산 구간) (busan-K-00428) |
| … 외 18건 |

---

## 최종 수치 변화

| 항목 | 이전 | 이후 |
|---|---|---|
| 전체 행 수 | 1,767 | **1,767** |
| 활성 후보 | 1,664 | **1,642** (-22, 여행코스 course_reference 이동) |
| api_only_existing | 991 | **969** |
| course_reference | 49 | **71** |
| 활성 category=unknown | 661 | **0** |

**활성 후보 category 분포 (1,642건):**

| category | 건수 |
|---|---|
| attraction | 717 |
| restaurant | 721 |
| event | 72 |
| nature | 50 |
| accommodation | 82 |
| **합계** | **1,642** |

---

## 검증 조건

| 항목 | 결과 |
|---|---|
| 전체 행 수 유지 1,767 | ✓ |
| 활성 category=unknown 0건 | ✓ |
| busan-K-00081 (accommodation) 무변경 | ✓ |
| 여행코스 22건 course_reference 전환 | ✓ |
| not_found 0건 (파이프 구분 해결 포함) | ✓ |
| 운영 DB·Git·이미지·subcategory 무변경 | ✓ |

---

## subcategory 분류 가능 대상 (다음 TASK)

이번 작업으로 활성 행의 category가 모두 확정됐습니다.  
subcategory=unknown 잔여 대상:

| category | 건수 (추정) |
|---|---|
| attraction | ~473 |
| restaurant | ~455 |
| event | ~41 |
| nature | ~29 |
| accommodation | ~5 |

정확한 수치는 subcategory 분류 TASK에서 실측 확인.

---

## 변경 파일

| 파일 | 변경 내용 |
|---|---|
| `data/tourapi/candidates/busan/busan-integrated-candidates.csv` | 665건 category/content_type/ccm 업데이트, 22건 candidate_status 변경 |
| `data/tourapi/candidates/busan/busan-integrated-candidates.json` | 동일 갱신 |
| `data/tourapi/reports/busan/busan-integrated-candidates-metrics.json` | category_normalize_13b 섹션 추가 |
| `scripts/tourapi-busan-category-normalize-13b.mjs` | 신규 생성 |
| `docs/tourapi/busan-category-normalize-13b-report.md` | 신규 생성 (본 보고서) |

---

TASK-DATA-BUSAN-CATEGORY-NORMALIZE-13B busan-K-* 665건 category 정규화 완료.
