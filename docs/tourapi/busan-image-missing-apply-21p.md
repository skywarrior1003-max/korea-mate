# TASK-DATA-IMAGE-MISSING-APPLY-21P — 완료 보고서

**상태**: 완료 (stage·commit·push 미실행)
**실행일**: 2026-07-27

---

## 검증 결과

전항목 PASS:

| 항목 | 결과 |
|---|---|
| 입력 status 1,642건 = 출력 1,642건 | ✓ (CSV·JSONL 모두) |
| 고스락·다원 source_exhausted 정확히 2건 | ✓ |
| 국제시장·아미산 image_missing 유지 | ✓ |
| 천마산 반영 후보 3건 이하 | ✓ (3건) |
| 이름 점수만으로 채택된 후보 0건 | ✓ |
| PG GPS null을 거리 검증 완료로 표시한 건수 0 | ✓ |
| 기존 산출물 무변경 | ✓ |
| 신규 출력 간 candidate_id 중복 0건 | ✓ |
| 동일 입력 재실행 결정적 일치 | ✓ (정렬·조건 모두 고정) |

---

## 작업 1 — 아미산 거리 근거 검증: 유효

**검증 방법**: batch-normalized.json source record 좌표 비교 (PG GPS 미사용)

| 장소 | source_id | 좌표 | 행정구역 |
|---|---|---|---|
| 아미산 레스토랑 (K-00109) | KTO 688610 | 35.1581°N 129.1485°E | 해운대구 |
| 아미산전망대 (별개 entity) | VB 287 | 35.0527°N 128.9608°E | 사하구 |

**계산 결과**: 두 source record 좌표 간 거리 **약 20.4km**

**판정**: PASS — PG GPS가 아닌 KTO·VB source record 좌표를 사용했으므로 거리 수치 유효. 21O 보고서 표현 유지.

---

## 작업 2 — 상태 반영

### 5건 전후 상태

| candidate_id | 장소명 | 21H-REV2 | 21P | 변경 |
|---|---|---|---|---|
| busan-F-00289 | 고스락 | image_missing | **source_exhausted** | ✓ |
| busan-K-00058 | 국제시장 | image_missing | image_missing | 유지 |
| busan-K-00109 | 아미산 | image_missing | image_missing | 유지 |
| busan-K-00119 | 다원 | image_missing | **source_exhausted** | ✓ |
| busan-K-00306 | 천마산하늘전망대 | image_missing | **image_partial** | ✓ |

### 천마산하늘전망대 반영 후보 3건

| photo_id | pg_source_id | role | rights | match_evidence |
|---|---|---|---|---|
| busan-K-00306_pg_2927923 | 2927923 | primary | operational_assumed | location_address_match |
| busan-K-00306_pg_2927926 | 2927926 | context | operational_assumed | location_address_match |
| busan-K-00306_pg_2927929 | 2927929 | context | operational_assumed | location_address_match |

**match_evidence 근거**: location_raw="[부]산광역시 서구 해돋이로183번길 17-4" ← 후보 주소 "서구 해돋이로183번길 17-4"와 정확 일치. 출처: 부산관광공사, modified 2026-05-29.

**최종 image_status**: `image_partial` — 시각 확인 없이 "대표 전경" 역할을 확정할 수 없으므로 보수적 판정.

### 국제시장·아미산 보류 사유

**busan-K-00058 국제시장** (image_missing 유지):
- 37건 후보 중 5건 review_required 지정
- src:2927807 위치 증거 있으나 시각 확인 없음 → 자동 채택 불가
- pg_review_candidates: [2927807, 2927993, 3406729, 3406739, 3406740] — 수동 검증 후 상향 가능

**busan-K-00109 아미산** (image_missing 유지):
- duplicate_name_collision 확정 (KTO content_type=39 해운대 레스토랑 vs 사하구 아미산전망대)
- PG 11건 "아미산둘레길" 전량 사용 금지 (사하구 산악지역 사진)
- 레스토랑 실존 여부 미확인 — 별도 수동 확인 필요

---

## 작업 3 — 규칙 문서 변경

**파일**: `docs/automation/photo-gallery-rules.md`
**추가 섹션**: `## 동명 장소 오매칭 방지` (53줄, 기존 42줄 → +11줄)

추가된 규칙 6개:

| # | 규칙 | 근거 |
|---|---|---|
| 1 | 명칭 점수만으로 자동 채택 금지 — 주소·행정구역·카테고리 최소 2개 일치 필요 | 아미산 score 95 오매칭 |
| 2 | 강한 충돌 시 confidence manual_review 강제 + place_identity_issue 플래그 | 아미산 카테고리·구 충돌 |
| 3 | 동명 장소는 별도 entity 유지 — PG 사진 자동 공유 금지 | 아미산 중복 entity |
| 4 | PG GPS null → 거리 검증 완료 표시 금지 | PG mapX/mapY 부재 조항 |
| 5 | 보통명사·동명 관광지 후보는 location_raw 행정구역 대조 의무 | 고스락/다원 동명 오매칭 |
| 6 | 근거 없는 거리 수치 작성 금지 | 수치 투명성 원칙 |

---

## 최종 상태 분포 (21P 기준)

| image_status | 건수 |
|---|---|
| image_sufficient | 1,506 |
| source_exhausted | 133 (기존 131 + 고스락 + 다원) |
| image_partial | 1 (천마산하늘전망대 신규) |
| image_missing | 2 (국제시장·아미산 보류) |
| **합계** | **1,642** |

---

## 출력 파일

| 파일 | 행수 | 비고 |
|---|---|---|
| `data/tourapi/reports/busan/busan-image-status-21p.csv` | 1,642행 | 상태 변경 3건 |
| `data/tourapi/reports/busan/busan-curated-images-21p.jsonl` | 1,642행 | 천마산 curated_images 3건 추가 |
| `data/tourapi/reports/busan/busan-image-missing-apply-metrics-21p.json` | — | validationGate: PASS |
| `docs/automation/photo-gallery-rules.md` | 53줄 (+11줄) | 동명 장소 오매칭 방지 규칙 추가 |

---

TASK-DATA-IMAGE-MISSING-APPLY-21P 완료 — 근거 확정 변경 반영, 국제시장·아미산 보류 유지.
