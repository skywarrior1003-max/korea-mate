# TASK-GYEONGJU-CORE27-FULL-OFFICIAL-SNAPSHOT-V1 완료보고서

**완료일**: 2026-08-06  
**브랜치**: `data/gyeongju-core27-full-official-snapshot-v1`  
**기준 브랜치**: `data/gyeongju-core-attraction-nature-enrichment-v1` (HEAD: ed2e0bc)  
**수집 기준일**: 2026-08-05T04:08:00Z

---

## 1. 태스크 개요

경주 CORE_TIER_1 27건 관광지의 공식 상세 스냅샷을 수집·처리하여  
설명(description_ko), 이미지, 주소, 좌표 필드를 보강하고  
각 관광지의 RELEASE/HOLD 판정을 산출한다.

수집 원천:
1. **경주문화관광 공식 사이트** (`gyeongju.go.kr/tour`) — 공공누리 제1유형 (KOGL1)
2. **KTO TourAPI** (`apis.data.go.kr/B551011/KorService2`) — detailCommon2/detailIntro2/detailImage2

---

## 2. 수집·처리 결과

### 2-1. 커버리지 요약

| 항목 | 수치 | 비율 |
|------|------|------|
| **대상 후보** | **27건** | 100% |
| VG 페이지 HTTP 200 | 27건 | **100%** |
| VG 파싱 성공 | 27건 | **100%** |
| **설명(description_ko) 확보** | **27건** | **100%** |
| **이미지 확보** | **27건** | **100%** |
| 이미지 공공누리 KOGL1 | 27건 | **100%** |
| 주소(address) 확보 | 27건 | **100%** |
| 좌표(lat/lng) 확보 | **6건** | 22% |
| KTO API 응답 | 6건 | — |

### 2-2. 설명 방법 분포

| 방법 | 건수 | 설명 |
|------|------|------|
| `OFFICIAL_WEB_DESCRIPTION_EXCERPT_OWNER_APPROVED` | **27건** | VG 공식 페이지 div.detail |
| `KTO_OVERVIEW_NORMALIZED` | 0건 | KTO API overview 데이터 없음 (HTTP 200, items 빈값) |
| `STRUCTURED_FACTS_ONLY` | 0건 | — |
| `CONTENT_STILL_MISSING` | 0건 | — |

### 2-3. 이미지 통계

| 항목 | 수치 |
|------|------|
| 이미지 보유 관광지 | 27/27 |
| 총 이미지 수 | **187장** |
| 이미지 출처 | VG 공식 페이지 (`/upload/content/thumb/`) |
| 권리 판정 | 전건 `VERIFIED_ALLOWED_BY_PUBLIC_LICENSE_KOGL_TYPE1` |

### 2-4. RELEASE/HOLD 판정

| 판정 | 건수 | 대상 |
|------|------|------|
| **RELEASE_READY_OWNER_APPROVED_WEB_CONTENT** | **6건** | 경주읍성, 대릉원, 동궁과 월지, 첨성대, 나정, 포석정 |
| HOLD_LOCATION_INCOMPLETE | 21건 | 좌표(lat/lng) 미보유 |
| HOLD_CONTENT_MISSING | 0건 | — |

RELEASE_READY 판정 조건 (6건 공통):
- ✅ 설명 확보 (VG 공식, KOGL1)
- ✅ 이미지 확보 (VG 공식, KOGL1)
- ✅ 주소 확보
- ✅ 좌표 확보 (KTO list API mapx/mapy)
- ✅ identity 고신뢰도

---

## 3. 재현성 (Run1=Run2)

| 항목 | 결과 |
|------|------|
| **Run1=Run2 verdict** | **BYTE_IDENTICAL_PASS** |
| 검증 파일 수 | 11개 |
| PASS | 11/11 |
| FAIL | 0/11 |

수집 phase (HTTP): 비결정적 — raw 파일로 저장  
처리 phase: 완전 결정적 — LLM/Gemini 사용 0건

---

## 4. 파일럿 검증 (5건)

| 파일럿 후보 | parse_ok | 설명 | 이미지 | 좌표 |
|-----------|---------|------|-------|------|
| 동궁과 월지 | ✅ | ✅ | ✅ | ✅ |
| 불국사 | ✅ | ✅ | ✅ | ✗ |
| 삼릉 | ✅ | ✅ | ✅ | ✗ |
| 국립경주박물관 | ✅ | ✅ | ✅ | ✗ |
| 경주 엑스포대공원 | ✅ | ✅ | ✅ | ✗ |

파일럿 판정: **PASS** (parse_ok=5/5, desc=5/5)

---

## 5. 결함 등록부

| DEF ID | 등급 | 상태 | 내용 |
|--------|------|------|------|
| DEF-CORE27-W01 | WARNING | DOCUMENTED (비차단) | WEB-ATT source facts 159건 전건 `official_external_url=https://황리단길.kr` — 이전 수집 태스크 버그. 본 태스크는 area_uid 기반 VG URL로 우회 |

---

## 6. 코드 버그 수정 내역 (실행 중 발견·수정)

### BUG-01: VG 이미지 href 정규식 오류 (`gyeongju_official_detail_collector_v1.py:222`)

**원인**: `href=["\']([^"\']+/upload/[^"\']+)["\']` — `[^"\']+` 는 최소 1자를 요구하지만 실제 VG href는 `/upload/`로 시작 (앞에 문자 없음)

**수정**: `href=["\'](/upload/[^"\']+)["\']` — `/upload/`로 시작하는 경로만 직접 캡처

**영향**: 이미지 0/27 → 27/27 (187장)

### BUG-02: KTO 캐시 로드 게이트 오류 (`gyeongju_official_detail_collector_v1.py:783`)

**원인**: `if kto_content_id and api_key:` — Run2에서 `api_key=None`이면 raw 파일이 있어도 KTO 데이터 로드 안 됨

**수정**: 수집 게이트(api_key 필요)와 캐시 로드 게이트 분리  
```python
if kto_content_id:
    if skip_collection and raw_p.exists():
        kto_raw = json.loads(raw_p.read_text("utf-8"))
    elif not skip_collection and api_key:
        kto_raw = fetch_kto_detail(...)
    elif raw_p.exists():
        kto_raw = json.loads(raw_p.read_text("utf-8"))
```

**영향**: Run1=Run2 5개 파일 FAIL → 11/11 BYTE_IDENTICAL_PASS

---

## 7. 동결 파일 무결성

| 항목 | 결과 |
|------|------|
| 기존 normalized 파일 수정 | 0건 |
| 기존 raw 파일 수정 | 0건 |
| 기존 source facts 수정 | 0건 |
| 기존 스크립트 재실행 | 0건 |

---

## 8. 생성 파일 목록

### 스크립트 (2개)
- `scripts/gyeongju_official_detail_collector_v1.py`
- `scripts/gyeongju_core27_snapshot_runner_v1.py`

### Normalized (10개)
`data/tourapi/normalized/gyeongju/`
- `gyeongju-core27-identity-bundle-v1.jsonl`
- `gyeongju-core27-official-detail-snapshot-v1.jsonl`
- `gyeongju-core27-kto-detail-snapshot-v1.jsonl`
- `gyeongju-core27-field-inventory-v1.jsonl`
- `gyeongju-core27-field-comparison-v1.jsonl`
- `gyeongju-core27-description-overlay-v1.jsonl`
- `gyeongju-core27-image-inventory-v1.jsonl`
- `gyeongju-core27-full-detail-overlay-v1.jsonl`
- `gyeongju-core27-release-proposal-v1.jsonl`
- `gyeongju-core27-remaining-queue-v1.jsonl`

### Validation (9개)
`data/tourapi/validation/gyeongju/`
- `gyeongju-core27-web-att-link-audit-v1.jsonl`
- `gyeongju-core27-area-uid-link-audit-v1.jsonl`
- `gyeongju-core27-kto-contentid-link-audit-v1.jsonl`
- `gyeongju-core27-pilot-v1.json`
- `gyeongju-core27-coverage-summary-v1.json`
- `gyeongju-core27-image-selection-v1.jsonl`
- `gyeongju-core27-defect-register-v1.jsonl`
- `gyeongju-core27-frozen-sha-audit-v1.json`
- `gyeongju-core27-reproducibility-v1.json`

### Reports (2개)
`data/tourapi/reports/gyeongju/`
- `gyeongju-core27-travel-suitability-v1.jsonl`
- `gyeongju-core27-category-coverage-v1.json`

### Raw VG 상세 페이지 (27개)
`data/tourapi/raw/gyeongju/gyeongju-core27-vg-detail/`
- `vg-area-{area_uid}.json` × 27

### Raw KTO 상세 API (6개)
`data/tourapi/raw/gyeongju/gyeongju-core27-kto-detail/`
- `kto-{contentId}.json` × 6

### 문서 (3개)
`docs/tourapi/`
- `gyeongju-official-web-content-policy-v1.md`
- `gyeongju-core27-collector-usage-v1.md`
- `gyeongju-core27-full-official-snapshot-v1-completion.md` (본 문서)

**총 신규 파일**: 59개

---

## 9. 다음 단계

| 항목 | 내용 |
|------|------|
| **좌표 보강** | 21건 HOLD_LOCATION_INCOMPLETE — KTO 좌표 조회 또는 지도 API 보강 |
| **RELEASE_READY 6건 검토** | 경주읍성, 대릉원, 동궁과 월지, 첨성대, 나정, 포석정 → release pipeline 진입 가능 |
| **KTO detail 수집 확장** | CORE_TIER_2 121건 + SUPPORTING 226건 — 384건 표적 수집 queue 이어받기 |
| **DEF-CORE27-W01 해소** | WEB-ATT official_external_url 버그 — 별도 수집 태스크 필요 |

---

## 10. 검증 근거

| 항목 | 확인 방법 | 결과 |
|------|----------|------|
| HTTP 수집 성공 | raw 파일 `http_status=200` | 27/27 |
| 설명 품질 | `description_paragraphs` 길이 ≥ 20자 | 27/27 |
| 이미지 URL 유효성 | `/upload/content/thumb/` 패턴 확인 | 187장 |
| 공공누리 판정 | HTML 내 `img_opentype01.png` 또는 `제1유형` | 27/27 |
| 재현성 | Run2 `--skip-collection` 재처리 → SHA 비교 | PASS 11/11 |
| 동결 무결성 | `gyeongju-core27-frozen-sha-audit-v1.json` | 이상 없음 |
| 인증키 노출 | `credential_values_exposed=false` | 확인됨 |
| LLM 사용 | 소스 코드 전수 검사 | 0건 |

---

작업을 완료했습니다
