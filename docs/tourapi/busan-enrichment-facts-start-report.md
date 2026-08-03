# 부산 사실 조사 브랜치 시작 보고서

**작업**: TASK-BUSAN-SCHEMA-INDEPENDENT-ENRICHMENT-START  
**실행일**: 2026-07-28  
**판정**: PASS

---

## 브랜치 및 기준 정보

| 항목 | 값 |
|---|---|
| 신규 브랜치 | `research/busan-enrichment-facts-20260728` |
| base_ref | `origin/master` |
| base_commit | `297f6b41d41fa3bad8b5f68d0141f8827e72f0f5` |
| SSOT 버전 | 1.0 (v1.1 대기 중 — schema-independent 작업 범위 내 진행) |
| SSOT 상태 | ACTIVE |
| research_ref | `origin/research/tourapi-nightly-20260722` @ `fe43388` |
| integration_ref | `origin/integration/busan-linkage-index-20260727` @ `c19ea21` |

---

## canonical 입력 자산 (8종)

| id | 분류 | 소스 브랜치 | 크기(B) | 행수 |
|---|---|---|---|---|
| linkage_index | canonical_linkage_index | integration | 753,150 | 1,642 |
| integrated_candidates | source_identity_registry | research | 994,815 | 1,767 |
| image_rights_audit | image_rights_record | research | 721,908 | — |
| batch_normalized | normalized_source_data | research | 5,814,602 | 4,135 |
| image_status_21q | final_image_status | research | 201,015 | 1,642 |
| curated_images_21q | final_curated_images | research | 646,460 | 1,642 |
| pg_place_summary | photo_gallery_summary | integration | 237,401 | — |
| visitbusan_rights_21h_rev2 | visitbusan_rights_reclassified | integration | 307,004 | — |

manifest 경로: `data/tourapi/manifests/busan-enrichment-facts-input-manifest.json`

---

## 조사 대상 수치 (canonical 기준: busan-linkage-index-21r.csv)

| 항목 | 수치 |
|---|---|
| 전체 canonical 대상 | **1,642건** |
| 우선순위 1 (P1) | **1,593건** (96.9%) |
| 우선순위 2 (P2) | **49건** (3.1%) |

### 유형별 조사 대상 수

| 카테고리 | 건수 | 전체 대비 |
|---|---|---|
| attraction | 717 | 43.7% |
| restaurant | 721 | 43.9% |
| accommodation | 82 | 5.0% |
| event | 72 | 4.4% |
| nature | 50 | 3.0% |

### 조사 항목별 대상 수

| 조사 항목 | 대상 건수 | 비고 |
|---|---|---|
| 영어 대표명 확인 | 1,642 | 0/1,642 확인됨 (SSOT 기준) |
| 설명 확보 | 1,642 | 687건 확보, 955건 미확보 (SSOT 기준) |
| district 숫자코드 디코딩 | 644 | 코드값 16·3·12·1·7 등 |
| district 명칭 확인 | 311 | 완전 누락 |
| 공식 URL 조사 | 969 | busan_official_api 326 + kto_tourapi 643 |
| 사용자 안내 URL 조사 | 1,395 | display_url 미확보 |
| 대체 이미지 탐색 | 134 | image_status = source_exhausted |
| 이미지 보완 | 2 | image_status = image_partial |

### district 상태

| 상태 | 건수 |
|---|---|
| 올바른 명칭 | 687 |
| 숫자코드 오염 | 644 |
| 누락 | 311 |

### 원천 유형 분포

| 원천 | 건수 |
|---|---|
| visitbusan_web | 673 |
| kto_tourapi | 643 |
| busan_official_api | 326 |

---

## 즉시 조사 가능 수

- 로컬 파일 접근 필요 없이 linkage_index 기반 district 디코딩 가능: 644건
- 추가 원천 없이 목록 구조 확인 가능: 1,642건 전체

---

## 금지 항목 이행 확인

| 항목 | 상태 |
|---|---|
| 최종 places-ready.jsonl 생성 | 0건 |
| numeric city_spots.id 생성 | 0건 |
| catalog_ready / scheduler_ready / featured_ready 확정 | 0건 |
| 운영 DB / migration | 0건 |
| research/tourapi-nightly-20260722 수정 | 0건 |
| local master checkout / pull | 0건 |

---

## 산출물

| 파일 | 크기(B) |
|---|---|
| `data/tourapi/manifests/busan-enrichment-facts-input-manifest.json` | 5,856 |
| `data/tourapi/reports/busan/busan-enrichment-facts-worklist.csv` | 301,891 |
| `docs/tourapi/busan-enrichment-facts-start-report.md` | 이 파일 |

---

TASK-BUSAN-SCHEMA-INDEPENDENT-ENRICHMENT-START 완료 — 부산 사실 조사 브랜치와 보강 대상 준비 완료.
