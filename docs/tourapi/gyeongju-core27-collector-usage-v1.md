# 경주 CORE27 공식 스냅샷 수집기 사용 가이드 v1

**스크립트**: `scripts/gyeongju_core27_snapshot_runner_v1.py`  
**의존 스크립트**: `scripts/gyeongju_official_detail_collector_v1.py`  
**작성일**: 2026-08-06  
**태스크**: TASK-GYEONGJU-CORE27-FULL-OFFICIAL-SNAPSHOT-V1

---

## 1. 사전 준비

### 1-1. 환경 변수

`.env.local`에 KTO API 키 설정 (선택적 — VG 수집만 시 불필요):

```bash
TOUR_API_KEY=your_encoded_api_key_here
```

또는 환경 변수로 직접 설정:
```bash
export TOUR_API_KEY=your_encoded_api_key_here
```

### 1-2. 필수 입력 파일 (동결 — 수정 금지)

| 경로 | 용도 |
|------|------|
| `data/tourapi/normalized/gyeongju/gyeongju-candidates-full-v1.jsonl` | 후보 목록 (831건) |
| `data/tourapi/normalized/gyeongju/source-facts-full-v1.jsonl` | source facts (1158건) |
| `data/tourapi/normalized/gyeongju/gyeongju-course-waypoint-relations-v1.jsonl` | course waypoints (29건) |
| `data/tourapi/raw/gyeongju/kto-list/kto-list-type12-full-v1.json` | KTO 관광지 목록 |

### 1-3. 의존성

Python 표준 라이브러리만 사용 (외부 패키지 없음):
- `hashlib`, `html`, `json`, `os`, `re`, `sys`, `time`, `urllib`
- 선택적: `requests` (설치 시 사용, 없으면 `urllib.request` fallback)

---

## 2. 실행 방법

### 2-1. Run1: 전체 수집 + 처리 (HTTP 요청 포함)

```bash
cd c:\기본저장\나의 프로젝트\KoreaMate\korea-mate
python scripts/gyeongju_core27_snapshot_runner_v1.py
```

- VG 27건 HTTP 수집 → raw 저장
- KTO API 7건 호출 → raw 저장
- 처리 → 산출물 생성
- Run2 자동 실행 → BYTE_IDENTICAL 검증

### 2-2. Run2만 실행 (raw 존재 시, HTTP 요청 0건)

```bash
python scripts/gyeongju_core27_snapshot_runner_v1.py --skip-collection
```

- raw 파일에서 읽기만 함 (HTTP 요청 없음)
- 처리 → 산출물 재생성
- Run1 대비 BYTE_IDENTICAL 검증
- **TOUR_API_KEY 없어도 실행 가능**

### 2-3. 파일럿만 실행 (5건 테스트)

```bash
python scripts/gyeongju_core27_snapshot_runner_v1.py --pilot-only
```

---

## 3. CORE_TIER_1 27건 목록

| 후보 ID | 이름 | area_uid | KTO contentId |
|---------|------|----------|---------------|
| gyeongju-GJ01-0001 | 경주 계림 | 288 | - |
| gyeongju-GJ01-0002 | 경주 동궁원 | 25 | - |
| gyeongju-GJ01-0003 | 경주 엑스포대공원 | 29 | 127487 |
| gyeongju-GJ01-0004 | 경주 월성 | 51 | - |
| gyeongju-GJ01-0005 | 경주읍성 | 57 | 2756611 |
| gyeongju-GJ01-0006 | 국립경주박물관 | 48 | - |
| gyeongju-GJ01-0007 | 나정 | 98 | 128635 |
| gyeongju-GJ01-0008 | 대릉원 | 203 | 3101699 |
| gyeongju-GJ01-0009 | 동궁과 월지 | 50 | 128526 |
| gyeongju-GJ01-0010 | 동리목월문학관 | 85 | - |
| gyeongju-GJ01-0011 | 무열왕릉 | 131 | - |
| gyeongju-GJ01-0012 | 민속공예촌 | 84 | - |
| gyeongju-GJ01-0013 | 박목월 생가 | 128 | - |
| gyeongju-GJ01-0014 | 보문관광단지 | 39 | - |
| gyeongju-GJ01-0015 | 분황사 | 54 | - |
| gyeongju-GJ01-0016 | 불국사 | 79 | - |
| gyeongju-GJ01-0017 | 삼릉 | 97 | - |
| gyeongju-GJ01-0018 | 석굴암 | 80 | - |
| gyeongju-GJ01-0019 | 양동마을 | 106 | - |
| gyeongju-GJ01-0020 | 오릉 | 99 | - |
| gyeongju-GJ01-0021 | 옥산서원 | 129 | - |
| gyeongju-GJ01-0022 | 우양미술관 | 32 | - |
| gyeongju-GJ01-0023 | 월정교 | 49 | - |
| gyeongju-GJ01-0024 | 중앙시장 야시장 | 61 | - |
| gyeongju-GJ01-0025 | 첨성대 | 47 | 3101689 |
| gyeongju-GJ01-0026 | 포석정 | 96 | 126208 |
| gyeongju-GJ01-0027 | 황리단길 | 53 | - |

---

## 4. 산출물 목록 (33개)

### normalized (10개)

| 파일 | 설명 |
|------|------|
| `gyeongju-core27-identity-bundle-v1.jsonl` | 후보별 식별·연결 정보 |
| `gyeongju-core27-official-detail-snapshot-v1.jsonl` | VG 공식 페이지 파싱 결과 |
| `gyeongju-core27-kto-detail-snapshot-v1.jsonl` | KTO API 파싱 결과 |
| `gyeongju-core27-field-inventory-v1.jsonl` | 필드별 취득 현황 |
| `gyeongju-core27-field-comparison-v1.jsonl` | 신규 vs 기존 필드 비교 |
| `gyeongju-core27-description-overlay-v1.jsonl` | 설명 선택 결과 |
| `gyeongju-core27-image-inventory-v1.jsonl` | 이미지 목록 |
| `gyeongju-core27-full-detail-overlay-v1.jsonl` | 전체 통합 overlay |
| `gyeongju-core27-release-proposal-v1.jsonl` | RELEASE/HOLD 제안 |
| `gyeongju-core27-remaining-queue-v1.jsonl` | 추가 수집 필요 항목 |

### validation (11개)

| 파일 | 설명 |
|------|------|
| `gyeongju-core27-web-att-link-audit-v1.jsonl` | WEB-ATT 연결 감사 |
| `gyeongju-core27-area-uid-link-audit-v1.jsonl` | area_uid 연결 감사 |
| `gyeongju-core27-kto-contentid-link-audit-v1.jsonl` | KTO contentId 연결 감사 |
| `gyeongju-core27-pilot-v1.json` | 파일럿 5건 결과 |
| `gyeongju-core27-coverage-summary-v1.json` | 커버리지 요약 |
| `gyeongju-core27-image-selection-v1.jsonl` | 이미지 선택 결과 |
| `gyeongju-core27-defect-register-v1.jsonl` | 결함 등록부 |
| `gyeongju-core27-frozen-sha-audit-v1.json` | 동결 파일 SHA 감사 |
| `gyeongju-core27-reproducibility-v1.json` | Run1=Run2 재현성 결과 |
| `gyeongju-core27-travel-suitability-v1.jsonl` | 여행 적합성 분석 |
| `gyeongju-core27-category-coverage-v1.json` | 카테고리별 커버리지 |

### docs (3개)

| 파일 | 설명 |
|------|------|
| `gyeongju-official-web-content-policy-v1.md` | 콘텐츠 이용 정책 |
| `gyeongju-core27-collector-usage-v1.md` | 본 문서 |
| `gyeongju-core27-full-official-snapshot-v1-completion.md` | 완료보고서 |

### raw (9개)

| 경로 | 설명 |
|------|------|
| `data/tourapi/raw/gyeongju/gyeongju-core27-vg-detail/vg-area-{N}.json` | VG HTML raw (27개) |
| `data/tourapi/raw/gyeongju/gyeongju-core27-kto-detail/kto-{ID}.json` | KTO API raw (6개) |

---

## 5. 재현성 보장 방법 (Run1=Run2)

수집(collection) phase와 처리(processing) phase가 분리되어 있다.

```
Run1:
  수집 phase  → HTTP 요청 → raw 저장  ← 비결정적 (네트워크 의존)
  처리 phase  → raw 읽기 → 산출물 생성 ← 결정적

Run2 (--skip-collection):
  수집 phase  → SKIP (HTTP 요청 0건)
  처리 phase  → raw 읽기 → 산출물 생성 ← 결정적 (Run1과 동일)
```

처리 phase 결정성 보장 요소:
- LLM·Gemini 사용 금지
- `sort_keys=True` JSON 직렬화
- `extract_sentences()` 정규식 기반 (결정적)
- 이미지 정렬: `index` 오름차순 (수집 순서)
- 카테고리·방법별 집계: `sorted()` 사용

---

## 6. 주요 함수 참조

| 함수 | 모듈 | 역할 |
|------|------|------|
| `normalize_name(name)` | collector | 이름 정규화 (경주 접두사 제거) |
| `fetch_vg_detail(area_uid, url, raw_dir)` | collector | VG HTML 수집 및 raw 저장 |
| `parse_vg_detail(raw)` | collector | VG HTML 파싱 (이름·이미지·주소·설명) |
| `fetch_kto_detail(content_id, ...)` | collector | KTO API 3종 수집 및 raw 저장 |
| `parse_kto_detail(raw)` | collector | KTO API 파싱 |
| `select_description(kto_overview, vg_paragraphs, ...)` | collector | 설명 우선순위 선택 |
| `select_representative_image(vg_images, kto_firstimage)` | collector | 이미지 우선순위 선택 |
| `build_overlay(identity, vg, kto, kto_list_item, sf)` | collector | 통합 overlay 생성 |
| `process_candidates(candidates, ...)` | collector | 전체 처리 루프 |
| `build_identity_bundles(core27, ...)` | runner | 후보별 식별 번들 생성 |
| `generate_outputs(results, ...)` | runner | 산출물 파일 생성 (20개) |
| `check_run1_run2(results, ...)` | runner | BYTE_IDENTICAL 검증 |

---

## 7. 알려진 제약 및 주의사항

| 항목 | 내용 |
|------|------|
| KTO overview 데이터 | CORE_TIER_1 7건 KTO 매칭 중 overview HTTP 200이나 items 비어있음 — KTO API 데이터 미수록 |
| official_external_url 버그 | WEB-ATT 159건 전건 `https://황리단길.kr` (DEF-CORE27-W01 등록) — area_uid 경로로 우회 |
| 좌표 6/27 | KTO list API에서 mapx/mapy 취득; 나머지 21건은 별도 좌표 수집 필요 |
| GJ03·04·05 금지 | CDN URL 추측 금지, 장소 설명 사용 금지 (CLAUDE.md 규칙) |
| LLM 금지 | 전 처리 결정적 — Gemini 등 생성형 API 사용 금지 |
| 동결 파일 | 기존 normalized·raw 파일 수정 금지 |

---

## 8. 버전 이력

| 날짜 | 버전 | 내용 |
|------|------|------|
| 2026-08-06 | v1 | 최초 작성 — CORE_TIER_1 27건 수집 완료 후 |
