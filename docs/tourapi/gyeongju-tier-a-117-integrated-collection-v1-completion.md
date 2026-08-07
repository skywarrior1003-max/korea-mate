# TASK-GYEONGJU-TIER-A-117-INTEGRATED-FULL-COLLECTION-V1 완료보고서

**작업 ID**: TASK-GYEONGJU-TIER-A-117-INTEGRATED-FULL-COLLECTION-V1  
**완료 일시**: 2026-08-07T06:30:19Z (UTC)  
**브랜치**: data/gyeongju-tier-a-117-integrated-collection-v1  
**베이스**: data/gyeongju-kto-v3-final-correction-v1 @ 4f794153  
**HEAD**: (이 커밋)

---

## 1. 검증 결과 (실행 전)

### 1.1 사전 데이터 가용성 검증

| 항목 | 결과 |
|------|------|
| TIER_A 큐 (next_batch_tier=TIER_A_NEXT_RELEASE) | **117건 확인** |
| 두 hop 체인 (candidate_id→area_uid→mnu_uid/code_uid) | **117/117건 완성** |
| CORE27 ∩ TIER_A 중복 | **0건 (안전 분리 확인)** |
| KTO 623건 인덱스 캐시 | **사용 가능 (2026-08-07T09:00:00Z)** |
| VG 파일럿 캐시 (5건) | **area [52,68,72,91,380] 사용 가능** |
| 한국어 텍스트 인코딩 | **전건 유효 UTF-8** |

### 1.2 기술 방식 검증

- **VG URL 패턴**: `page.do?mnu_uid={}&code_uid={}&area_uid={}&cmd=2` → CONFIRMED
- **KTO API**: lDongRegnCd=47, lDongSignguCd=130 (areaCode/sigunguCode 금지 준수)
- **PhotoGallery**: gallerySearchList1 개별이미지 반환, gal_title 그룹화 → CONFIRMED
- **ID 네임스페이스**: gal_content_id ≠ kto_content_id (분리 설계 확인)
- **권리**: Type1/Type3 cpyrhtDivCd, PhotoGallery 이용허락범위=제한없음 → CONFIRMED

### 1.3 차단 이슈 / 개선 아이디어 여부

차단 이슈: **없음**  
개선 아이디어: **없음** (V3 검증 결과와 일치, 실행 결정)

---

## 2. 실행 결과

### 2.1 수집 스크립트

**파일**: `scripts/gyeongju_tier_a_117_integrated_v1.py`  
**실행 시간**: 약 7분 (백그라운드)  
**Exit code**: 0

### 2.2 소스별 수집 현황

#### S1: Visit Gyeongju (VG) 웹 HTML

| 항목 | 수량 |
|------|------|
| 파일럿 캐시 사용 | 5건 (area 52,68,72,91,380) |
| 신규 HTTP 성공 | **0건** |
| 신규 HTTP 실패 (HTTP 500) | **112건** |
| VG 좌표 추출 성공 | 5건 |
| VG 이미지 추출 성공 | 5건 |

> **⚠️ WARN-VG-HTTP500**: Visit Gyeongju 웹서버가 2026-08-07T06:30:19Z 시점에 HTTP 500을 반환했다. 파이럿 5건(캐시)을 제외한 112건의 VG HTML 수집이 불가능했다. 서버 오류로, 스크립트 오류가 아님을 확인 (응답 자체가 500). 향후 서버 복구 후 VG 재수집 보완 필요.

#### S2: KTO KorService2

| 항목 | 수량 |
|------|------|
| areaBasedList2 인덱스 (캐시) | 623건 |
| 인덱스 직접 매칭 | 78건 (66.7%) |
| searchKeyword2 추가 시도 | 39건 |
| searchKeyword2 성공 | 0건 |
| NO_KTO_RECORD (전체 탐색 후) | 39건 (33.3%) |
| detailCommon2 수집 | 78건 |
| detailImage2 수집 | 78건 |
| KTO 총 이미지 | **431장** |

**KTO 매칭 상세**:
- EXACT_MATCH: 46건 (정규화 이름 완전 일치)
- PARTIAL_MATCH: 26건 (정규화 부분 포함)
- PARTIAL_MATCH_MULTIPLE: 6건 (다중 부분 일치 중 첫 번째 선택)
- NO_KTO_RECORD: 39건 (인덱스+searchKeyword2 모두 실패)

#### S3: KTO PhotoGalleryService1

| 항목 | 수량 |
|------|------|
| gallerySearchList1 호출 | 117건 |
| 경주 소재 매칭 성공 | 26건 (22.2%) |
| galleryDetailList1 호출 | 26건 |
| 총 갤러리 이미지 | **551장** |

### 2.3 이미지 권리 감사

| 분류 | 장수 | 비율 |
|------|------|------|
| KTO Type1 (KOGL제1유형: 출처표시·변경O·상업O) | 207장 | 48.0% |
| KTO Type3 (KOGL제3유형: 출처표시·변경X·상업O) | 224장 | 52.0% |
| KTO 알수없음 | **0장** | 0% |
| **KTO 권리 검증 완료** | **431장** | **100.0%** |
| Gallery (공공데이터포털 이용허락범위=제한없음) | 551장 | 100% |

모든 이미지가 상업적 이용 가능. Type3는 변경 금지(원본 사용).

### 2.4 통합 스냅샷 릴리스 분류

| 분류 | 건수 | 비율 |
|------|------|------|
| READY_FOR_RELEASE | **71건** | 60.7% |
| PARTIAL_READY | 2건 | 1.7% |
| COORD_MISSING | 38건 | 32.5% |
| IMAGES_MISSING | 6건 | 5.1% |
| **합계** | **117건** | 100% |

**COORD_MISSING 38건 원인**: VG HTTP 500 + KTO 미매칭 복합. 38건 모두 NO_KTO_RECORD인 장소로 KTO 좌표도 없음. VG 서버 복구 후 재수집 시 해결 가능.

**IMAGES_MISSING 6건**: KTO에 등록되었으나 detailImage2 0장이고 갤러리에도 미등록. firstimage만 1장 있는 경우 PARTIAL_READY.

### 2.5 좌표 소스 분포

| 소스 | 건수 |
|------|------|
| KTO (mapx/mapy from detailCommon2/areaBasedList2) | 74건 |
| VG (var lat/lng, 파이럿 캐시) | 5건 |
| NONE (좌표 없음) | 38건 |

### 2.6 설명 소스 분포

| 소스 | 건수 |
|------|------|
| KTO_OVERVIEW (detailCommon2 overview 필드) | 78건 |
| NONE (KTO 미매칭, VG 설명 없음) | 39건 |

### 2.7 이미지 통계

| 항목 | 값 |
|------|-----|
| 평균 이미지 수 (전체) | 9.2장 |
| 중앙값 | 5.0장 |
| 최대 | 114장 |
| 0장 | 41건 |
| 1-5장 | 30건 |
| 6장 이상 | 46건 |

---

## 3. QA 검증

**QA 상태**: WARN (이슈 38건 — 전건 COORD_NONE, 비차단)  
**레코드 수**: 117/117 ✅  
**중복 candidate_id**: 0건 ✅  
**galContentId → KorService2 전달**: 없음 ✅  
**areaCode/sigunguCode 사용**: 없음 ✅  

QA 이슈 38건은 모두 `COORD_NONE` 타입 (VG HTTP 500 + KTO 미매칭으로 인한 좌표 없음). 데이터 무결성 이슈가 아니며 향후 VG 재수집으로 해결 가능.

---

## 4. Run1 SHA (재현성 기록)

| 파일 | SHA256 (첫 16자) |
|------|-----------------|
| integrated_snapshot | 460bb4cc19d0c616... |
| vg_snapshot | c0f68d820888475a... |
| kto_match_index | f84f741ec616d04e... |
| kto_images_audit | 3f67ba11f7fd429c... |
| photogallery_snapshot | 479f3afb67e5ac47... |
| release_classification | d2fa549b759345b3... |
| coverage_report | 16d5b876f732ac73... |
| qa_report | 7851b25f27521064... |
| batch_log | 0f62fabcba71178d... |

Run1 결과는 raw 파일(캐시)에서 결정론적으로 생성됨. VG HTTP 500 이슈로 인해 VG raw 파일이 없는 112건은 VG 수집 후 Run2에서 달라질 수 있음 (현재 Run1은 API 캐시 기반).

---

## 5. 금지 규칙 준수 확인

| 규칙 | 준수 |
|------|------|
| master checkout·merge·push 금지 | ✅ 신규 브랜치 사용 |
| force push 금지 | ✅ 해당 없음 |
| git add . / git add -A 금지 | ✅ 명시적 파일 지정 |
| EngService2 호출 금지 | ✅ KorService2·PhotoGalleryService1만 사용 |
| areaCode·sigunguCode 금지 | ✅ lDongRegnCd=47·lDongSignguCd=130 사용 |
| galContentId → KorService2 전달 금지 | ✅ 두 ID 체계 완전 분리 |
| galContentTypeId를 관광정보 contentTypeId로 사용 금지 | ✅ 준수 |
| 두 ID 체계 직접 JOIN 금지 | ✅ gal_content_id ≠ kto_content_id 별도 관리 |
| API 키 출력·저장·커밋 금지 | ✅ 로그·파일·커밋 내 API 키 없음 |
| 기존 candidate/source facts/frozen raw 수정 금지 | ✅ 신규 파일만 생성 |
| LLM/Gemini 사용 금지 (Run1=Run2) | ✅ 결정론적 파싱만 사용 |

---

## 6. 출력 파일 목록

### Normalized (data/tourapi/normalized/gyeongju/)

| 파일 | 레코드 | 크기 |
|------|--------|------|
| gyeongju-tier-a-117-integrated-snapshot-v1.jsonl | 117 | 216K |
| gyeongju-tier-a-117-kto-match-index-v1.jsonl | 117 | 52K |
| gyeongju-tier-a-117-kto-detail-snapshot-v1.jsonl | 78 | 164K |
| gyeongju-tier-a-117-photogallery-snapshot-v1.jsonl | 117 | 72K |
| gyeongju-tier-a-117-release-classification-v1.jsonl | 117 | 44K |
| gyeongju-tier-a-117-vg-snapshot-v1.jsonl | 117 | 56K |

### Validation (data/tourapi/validation/gyeongju/)

| 파일 | 설명 |
|------|------|
| gyeongju-tier-a-117-coverage-report-v1.json | 커버리지 통계 |
| gyeongju-tier-a-117-qa-report-v1.json | QA 이슈 38건 |
| gyeongju-tier-a-117-run1-sha-v1.json | Run1 SHA256 (9파일) |
| gyeongju-tier-a-117-batch-log-v1.jsonl | 6배치 실행 로그 |
| gyeongju-tier-a-117-kto-images-audit-v1.jsonl | KTO 이미지 권리 감사 (117건) |

### Raw (data/tourapi/raw/gyeongju/gyeongju-tier-a-117-v1/)

| 디렉토리 | 파일 수 |
|---------|---------|
| kto-detail/ | 150파일 (detailCommon2+detailImage2 × 78장소) |
| gallery/ | 141파일 (search+detail × 26매칭 + 91 search-only) |
| kto-search/ | 39파일 (searchKeyword2 × 39미매칭 장소) |

---

## 7. 후속 작업 계획

### HOLD 사항
- **VG 재수집 (필요)**: VG HTTP 500이 해소된 후 112건 신규 수집. COORD_MISSING 38건 및 이미지 없는 장소 보완 가능.
- **COORD_MISSING 38건 해소**: VG 재수집 후 좌표 확보. 또는 외부 POI 데이터 활용 검토.
- **KTO 미매칭 39건 재검토**: 일부는 경주시 지역이지만 KTO에 미등록 소규모 명소. 향후 KTO 업데이트 후 재시도.

### 브랜치 상태
현재 브랜치: `data/gyeongju-tier-a-117-integrated-collection-v1`  
상태: **PUSHED** (이 커밋 후)

---

*작업을 완료했습니다.*
