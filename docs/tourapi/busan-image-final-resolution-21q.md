# TASK-DATA-IMAGE-MISSING-FINAL-RESOLUTION-21Q — 완료 보고서

**상태**: 완료 (stage·commit·push 미실행)
**실행일**: 2026-07-27

---

## 검증 결과

전항목 PASS:

| 항목 | 결과 |
|---|---|
| 입력 1,642건 = 출력 1,642건 (CSV·JSONL) | ✓ |
| image_missing 2건 모두 해소 | ✓ |
| 이름 점수만으로 채택된 후보 0건 | ✓ |
| PG GPS null을 거리 검증 완료로 표시한 건수 0 | ✓ |
| 다른 entity 이미지 공유 0건 | ✓ |
| 기존 21P 산출물 무변경 | ✓ |
| 신규 출력 간 candidate_id 중복 0건 | ✓ |

---

## 작업 1 — 국제시장 최종 3건 선택

**candidate_id**: busan-K-00058  
**21P 상태**: image_missing → **21Q 상태**: image_partial

### 후보 검토 (5건)

| pg_source_id | title | location_raw | 주소 일치 | 선택 |
|---|---|---|---|---|
| 2927807 | 부산국제시장 | 중구 신창로4가 일원 | **정확 일치** | ✓ primary |
| 2927993 | 부산국제시장 | 중구 중구로 36 | 인근 — 신창로4가 아님 | ✗ |
| 3406729 | 부산국제시장 | 중구 신창동4가 | 동 단위 일치 | ✓ context |
| 3406739 | 부산국제시장 | 중구 신창동4가 | 동 단위 일치 | ✓ context |
| 3406740 | 부산국제시장 | 중구 신창동4가 | 동 단위 일치 | — (3건 한도 충족) |

**선택 근거**:

- **src:2927807 (primary)**: title="부산국제시장" + location_raw="중구 신창로4가 일원" = 후보 주소 정확 일치. keyword: 재래시장·전통시장·상설시장·부산관광공사. modified 2026-05-29. 2개 이상 근거(명칭+주소) 충족 → `high confidence`.
- **src:3406729 (context)**: title="부산국제시장" + location_raw="중구 신창동4가" → 신창로4가와 동 단위 일치. 2024-09 전문 촬영, 사진기자단·프레임코리아2기. 2개 근거 충족 → `medium confidence`.
- **src:3406739 (context)**: 3406729와 동일 그룹, 다른 컷. 동일 근거 적용.

**제외 사유**: src:2927993 (location=중구 중구로 36, 국제시장 주소인 신창로4가와 다른 인근 도로. primary 기준 미충족). src:3406740 (3건 한도 충족으로 불선택 — 동일 근거이나 추가 불필요).

### 채택된 curated_images

| photo_id | role | rights | match_evidence |
|---|---|---|---|
| busan-K-00058_pg_2927807 | primary | operational_assumed | location_address_match |
| busan-K-00058_pg_3406729 | context | operational_assumed | location_neighborhood_match |
| busan-K-00058_pg_3406739 | context | operational_assumed | location_neighborhood_match |

**최종 상태**: `image_partial` — 시각 확인 없이 대표 전경 역할 확정 불가. 수동 시각 확인 후 image_sufficient 상향 가능.

---

## 작업 2 — 아미산 외부 확인 및 최종 판정

**candidate_id**: busan-K-00109  
**21P 상태**: image_missing → **21Q 상태**: source_exhausted

### 외부 확인 결과 (2026-07-27)

| 출처 | 확인 내용 |
|---|---|
| [당근 마켓](https://www.daangn.com/kr/local-profile/아미산-해운대-중식당-6tjcwbt4qvqk/) | "아미산 해운대 중식당" — 해운대구 우동, 일반중식점 |
| [다이닝코드](https://www.diningcode.com/profile.php?rid=QY8XMpr0ErBc) | "아미산 — 해운대 중식 맛집" |
| [식신](https://www.siksinhot.com/P/367818) | "아미산 - 부산, 해운대" |
| [열린관광 모두의 여행 (visitkorea)](https://access.visitkorea.or.kr/food/detail.do?cotId=808b9aed-ce11-484a-afb8-2ffc01af4a1c) | 음식점 상세 등재 |
| [자체 홈페이지](https://chineserestaurant.co.kr/) | "해운대 중식당 아미산 \| 베이징덕 전문점 \| 30년 전통 맛집" |

**확인 결과**: 1996년 1월 개업, 해운대 마리나동원 8층, 현재 영업 중 확인. 베이징덕 전문 중식당. 영업시간 11:30~21:00.

### 소스별 이미지 소진 사유

| 소스 | 상태 | 사유 |
|---|---|---|
| KTO src=688610 | 이미지 공란 | 레코드 존재하나 image_url 미기재 |
| VB src=152 "다온 한정식" | 이미지 있으나 사용 불가 | 해운대해변로 154 마리나동원 8층 동일 건물의 **별개 사업체**. entity 다름 → 이미지 공유 금지 |
| PG 11건 (아미산둘레길) | 전량 무효 | 사하구 아미산 산악지역 사진 (place_identity_issue 확정). photo-gallery-rules.md 동명 장소 오매칭 방지 규칙 적용 |

**판정**: `source_exhausted` — 레스토랑은 실존·영업 중이나 우리 자동화 소스 내에서 이미지 획득 불가. KTO 재수집 또는 직접 계약 시 재검토 가능.

---

## 최종 상태 분포 (21Q 기준)

| image_status | 21P | 21Q | 변화 |
|---|---|---|---|
| image_sufficient | 1,506 | 1,506 | — |
| source_exhausted | 133 | 134 | +1 (아미산) |
| image_partial | 1 | 2 | +1 (국제시장) |
| image_missing | 2 | **0** | -2 |
| **합계** | **1,642** | **1,642** | — |

**image_missing 완전 해소**: 21N 감사 이래 5건 → 21P 후 2건 → 21Q 후 **0건**.

---

## 출력 파일

| 파일 | 행수 | 비고 |
|---|---|---|
| `data/tourapi/reports/busan/busan-image-status-21q.csv` | 1,642행 | 변경 2건 (국제시장·아미산) |
| `data/tourapi/reports/busan/busan-curated-images-21q.jsonl` | 1,642행 | 국제시장 curated_images 3건 추가, 아미산 source_exhausted 확정 |
| `data/tourapi/reports/busan/busan-image-final-resolution-metrics-21q.json` | — | validationGate: 전항목 PASS |
| `docs/tourapi/busan-image-final-resolution-21q.md` | 본 파일 | 완료 보고서 |

---

TASK-DATA-IMAGE-MISSING-FINAL-RESOLUTION-21Q 완료 — 국제시장·아미산 최종 정리, image_missing 전건 해소.
