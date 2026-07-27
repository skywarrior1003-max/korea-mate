# TASK-DATA-IMAGE-MISSING-RESOLUTION-21O — 완료 보고서

**상태**: 완료 (stage·commit·push 미실행)
**실행일**: 2026-07-27
**대상**: busan-image-missing-audit-21n.csv 5건 정체·후보 구분

---

## 검증 결과

전항목 PASS:

| 항목 | 결과 |
|---|---|
| 대상 정확히 5건 | ✓ |
| 출력 정확히 5건 | ✓ |
| 신규 API 호출 없음 | ✓ |
| 외부 웹 조사 없음 | ✓ |
| 이미지 육안 판정 없음 | ✓ |
| 21F·21G·21H·21N 파일 변경 없음 | ✓ |
| image_status·curated_images 실제 변경 없음 | ✓ |
| 이름 점수만으로 후보 채택 0건 | ✓ |
| 아미산 원본 필드와 PG 후보 별도 비교 | ✓ |
| 국제시장 후보 최대 5건 제시 | ✓ (5건) |
| 천마산 후보 최대 3건 제시 | ✓ (3건) |
| 고스락·다원 source_exhausted 근거 명시 | ✓ |

---

## 5건 최종 판정 요약

| candidate_id | 장소명 | verdict | 권고 상태 | 채택 후보 수 |
|---|---|---|---|---|
| busan-F-00289 | 고스락 | no_existing_candidate | source_exhausted | 0 |
| busan-K-00058 | 국제시장 | ambiguous_candidate | image_missing 유지 | 5 |
| busan-K-00109 | 아미산 | **duplicate_name_collision** | image_missing 유지 | 0 |
| busan-K-00119 | 다원 | no_existing_candidate | source_exhausted | 0 |
| busan-K-00306 | 천마산하늘전망대 | ambiguous_candidate | image_missing 유지 | 3 |

---

## 작업 1 — 고스락·다원: source_exhausted 근거

### busan-F-00289 — 고스락 (restaurant, 기장군 장안읍 해맞이로 286)

**조회 결과:**

| 원천 | 결과 |
|---|---|
| KTO batch-normalized | src=1577 (busan provider), image_url 공란 |
| VB rights (21h-rev2) | 미수록 (이미지 없음) |
| PG match CSV | matched_candidate_id=busan-F-00289: **0건** |
| PG integrated JSONL title 검색 "고스락" | **22건** — 전라북도 익산시 전통마을 사진 |

**21N pg_manual_count=22의 실체:**
integrated JSONL에 "고스락"이 포함된 22건은 전원 `location: 전라북도 익산시`로, 익산시의 전통마을 관광지 "고스락"(장독대·항아리·한옥) 사진이다. 부산 기장군 음식점과 완전 무관. PG 매칭 알고리즘이 명칭 유사도를 인식했으나 행정구역·카테고리 충돌로 matched_candidate_id 미부여.

**결론**: KTO·VB·PG 모두 이미지 없음. → `source_exhausted` 전환 가능.

---

### busan-K-00119 — 다원 (restaurant, 부산진구 서면문화로 23-1)

**조회 결과:**

| 원천 | 결과 |
|---|---|
| KTO batch-normalized | src=850217 (kto), image_url 공란 |
| VB rights (21h-rev2) | 미수록 (이미지 없음) |
| PG match CSV | matched_candidate_id=busan-K-00119: **0건** |
| PG integrated JSONL title 검색 "다원" | **31건** — 전남·제주 녹차밭(茶園) 사진 |

**21N pg_manual_count=31의 실체:**
integrated JSONL에 "다원"이 포함된 31건은 "제주 서광다원", "보성다원", "강진다원" 등 전남·제주 녹차밭(茶園) 사진이다. "다원(茶園)"이 보통명사로서 전국에 분포하므로 명칭 매칭에 포함됐으나, 부산 서면 식당 "다원"과는 완전 무관.

**결론**: KTO·VB·PG 모두 이미지 없음. → `source_exhausted` 전환 가능.

---

## 작업 2 — 아미산 원본 장소 식별

### busan-K-00109 원본 필드

| 필드 | 값 |
|---|---|
| candidate_id | busan-K-00109 |
| title_ko | 아미산 |
| category | restaurant |
| subcategory | other_restaurant |
| address | 부산광역시 해운대구 해운대해변로 154 |
| district | 16 (해운대구) |
| latitude | 35.1581353515 |
| longitude | 129.1485450604 |
| source_provider | kto |
| source_service | KorService2 |
| source_id | 688610 |
| content_type_id | 39 (KTO: 음식점) |
| image_url | 없음 |
| modified_at | 20250311134900 |

### 동명 비교 — 아미산전망대 (별개 entity)

| 필드 | 값 |
|---|---|
| source_id | 287 (VB) / 2947925 (KTO-EN) |
| title | 아미산전망대 / Amisan Observatory (아미산 전망대) |
| address | 부산광역시 사하구 다대낙조2길 77 |
| latitude | 35.052727 |
| longitude | 128.96075 |
| content_type | 없음(VB attraction) / 76(KTO) |
| image_url | 있음 (VB) |
| description | 낙동강 삼각주 관련 자연 전망대 (사하구 다대포) |

### 거리 비교

| 장소 | 위치 | 행정구역 |
|---|---|---|
| 아미산 레스토랑 (K-00109) | 35.1581°N 129.1485°E | 해운대구 |
| 아미산전망대 (별개) | 35.0528°N 128.9607°E | 사하구 |
| **거리** | **약 20.4km** | **다른 구** |

### PhotoGallery 후보 비교 (11건 "아미산둘레길")

| 항목 | 분석 |
|---|---|
| PG GPS | null (photo-gallery-rules.md: "전 엔드포인트에 mapX/mapY 없음") |
| 매칭 기준 | 제목 유사도만 (score 95: "아미산둘레길" ↔ "아미산") |
| 실제 장소 | 사하구 아미산 산악지역 등산로 사진 |
| 레스토랑과의 관계 | 무관 (20km 이격, 다른 카테고리) |
| 채택 가능 여부 | **불가** |

### 판정: `duplicate_name_collision`

- **busan-K-00109는 해운대 음식점(restaurant_place_confirmed)**이 맞다. KTO content_type=39, 주소·구 모두 해운대.
- **아미산전망대**는 사하구의 완전히 별개 entity (자연 전망대)로, 동일 candidate ID 내에 통합되지 않았으며 각자 별도로 존재.
- PG가 제목 유사도만으로 산악지역 사진을 이 레스토랑에 연결한 것이 **명칭 충돌에 의한 오매칭**.
- 이름 점수(95) 기반 채택 금지 규칙 적용 → PG 11건 전량 사용 불가.

---

## 작업 3 — 국제시장: 후보 5건 선정

**전체 37건 분석:**
- 제목: 전건 "부산국제시장" (동일)
- 저작권: 전건 공란 (KTO 공공누리 표준)
- 매칭 score: 전건 65 (명칭 부분 일치: "부산국제시장" ⊃ "국제시장")
- URL 형식: resource_photo(신형) 2건 + cms2/website(구형) 35건

**메타데이터 기반 TOP 5 선정 기준:**
1. 위치 직접 일치 우선 (location_raw = 후보 주소)
2. 수정일 최신 우선 (modified_at 내림차순)
3. 최신 URL 형식(resource_photo) 우선
4. 촬영 다양성 확보 (시기·키워드 다른 것)

| 순위 | source_id | modified_at | location_raw | 키워드 | 선정 근거 |
|---|---|---|---|---|---|
| 1 | **2927807** | 2026-05-29 | 중구 신창로4가 일원 | 재래시장·전통시장·상설시장 | 후보 주소(중구 신창로4가 일원)와 **정확 일치** + 최신 |
| 2 | **3406729** | 2024-11-05 | 중구 신창동4가 | 9월 버킷·사진기자단·프레임코리아 | 2024-09 촬영·전문 사진기자 |
| 3 | **3406739** | 2024-11-05 | 중구 신창동4가 | 9월 버킷·사진기자단·프레임코리아 | 동일 시기 다른 컷 |
| 4 | **3406740** | 2024-11-05 | 중구 신창동4가 | 9월 버킷·사진기자단·프레임코리아 | 동일 시기 다른 컷 (최고 src_id) |
| 5 | **2927993** | 2026-05-29 | 중구 중구로 36 | 충무김밥·부산국제시장 | 시장 내부 음식 장면 (역할 다양성) |

**판정**: `ambiguous_candidate` 유지 — 위치 증거(src:2927807 정확 일치) 존재하나 시각 확인 미수행. 실제 반영 금지.

---

## 작업 4 — 천마산하늘전망대: 후보 3건 선정

**전체 4건 분석:**

| source_id | title | location_raw | keyword | modified_at |
|---|---|---|---|---|
| 2927923 | 천마산 | [부]산광역시 서구 해돋이로183번길 17-4 | 천마산, 서구, 부산관광공사 | 2026-05-29 |
| 2927926 | 천마산 | [부]산광역시 서구 해돋이로183번길 17-4 | 천마산, 서구, 부산관광공사 | 2026-05-29 |
| 2927929 | 천마산 | [부]산광역시 서구 해돋이로183번길 17-4 | 천마산, 서구, 부산관광공사 | 2026-05-29 |
| 2927930 | 천마산 | [부]산광역시 서구 해돋이로183번길 17-4 | 천마산, 서구, 부산관광공사 | 2026-05-29 |

**주소 일치 분석:**
- location_raw: "산광역시 서구 해돋이로183번길 17-4" ("부" 1자 절단 오류 → 실제: "부산광역시 서구 해돋이로183번길 17-4")
- 후보 주소: "서구 해돋이로183번길 17-4"
- **행번지까지 정확 일치** (photo-gallery-rules.md GPS 부재 조항에도 불구하고 location_raw 문자열 직접 매칭)
- 출처: 부산관광공사, modified 2026-05-29 (최신)

**선정**: 3건 (2927923, 2927926, 2927929) — 4건 모두 동일 메타데이터이므로 최대 3건 규칙에 따라 최소 source_id인 2927930 제외.

**판정**: `ambiguous_candidate` 유지 — 주소 정확 일치로 신뢰도 높으나 시각 확인 전까지 이미지 반영 금지.

---

## 자동화 규칙 개선안 (아미산 duplicate_name_collision 사례)

> 이번 작업에서 규칙 문서는 수정하지 않음. 다음 작업에서 반영 여부 결정 대기.

| 개선 대상 | 현행 문제 | 제안 |
|---|---|---|
| PG 명칭 고득점 매칭 | score 95이어도 지리·카테고리 검증 없이 후보 포함 | 행정구역(location_raw 키워드)이 후보 district와 불일치하면 confidence=manual_review 강제 하향 |
| 동명 장소 자동 매칭 금지 | "아미산"이라는 제목만으로 다른 카테고리·구의 entity에 사진 연결 | PG location_raw 행정구역 ≠ 후보 district인 경우 matched_candidate_id 미부여 |
| GPS 부재 보완 | photo-gallery-rules.md: 좌표 항상 null → 지리 검증 불가 | location_raw 텍스트를 district/gu 레벨로 파싱하여 행정구역 일치 검증 추가 |
| 동명 entity 분리 유지 | 동명 장소가 별개 candidate로 유지됨에도 PG 매칭 시 혼동 | 동명 candidate 존재 확인 시 keyword 중 특정 구 이름 여부 교차 검증 |

**적용 대상 문서**: docs/automation/photo-gallery-rules.md (PG 매칭 정책 추가)

---

## 최종 판정 정리

### 즉시 상태 전환 가능 건수: **2건**

| candidate_id | 현재 | 전환 |
|---|---|---|
| busan-F-00289 고스락 | image_missing | → source_exhausted |
| busan-K-00119 다원 | image_missing | → source_exhausted |

### 이미지 후보가 명확한 건수: **1건**

- busan-K-00306 천마산하늘전망대 (3건 선정, 주소 정확 일치, 신뢰도 high) → 수동 시각 확인 후 image_partial 상향 가능

### 이미지 후보가 있으나 검증 필요 건수: **1건**

- busan-K-00058 국제시장 (5건 선정, 명칭+위치 복합 증거, 신뢰도 medium) → 수동 시각 확인 후 판단

### 계속 보류 건수: **1건**

- busan-K-00109 아미산 (duplicate_name_collision, PG 후보 전량 무효, 레스토랑 실존 여부 미확인)

---

## 다음 실행 권고

1. **즉시**: busan-F-00289, busan-K-00119 → image_status `source_exhausted` 전환 (status 파일 업데이트 작업)
2. **수동 검증**: 국제시장 5건, 천마산 3건 시각 확인 → 통과 시 image_partial 상향
3. **별도 작업**: 아미산(K-00109) 레스토랑 실존 여부 수동 확인 (영업 중인지 확인 후 place 유지 여부 결정)
4. **규칙 개선**: photo-gallery-rules.md에 행정구역 불일치 시 자동 매칭 금지 조항 추가 검토

---

## 출력 파일

`data/tourapi/reports/busan/busan-image-missing-resolution-21o.csv` — 5행

---

TASK-DATA-IMAGE-MISSING-RESOLUTION-21O 완료 — 이미지 누락 5건 정체·후보 구분 완료, 상태 반영 결정 대기.
