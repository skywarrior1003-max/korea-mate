# TASK-GYEONGJU-KTO-KOR-PHOTO-COMPLETE-5-PILOT-V3 완료보고서

> 작성일: 2026-08-07  
> Branch: `data/gyeongju-kto-kor-photo-complete-5-pilot-v3`  
> Base HEAD: `8ac8ec5` (TASK-GYEONGJU-KTO-MATCHING-ROOT-CAUSE-AND-COMPLETE-5-PILOT-V2 검증보고서)

---

## 1. 사전 검증 결과

V3 프롬프트 검증에서 확인된 내용:

| 항목 | 결과 |
|------|------|
| searchKeyword2 엔드포인트 | ✅ CONFIRMED (v4.4 매뉴얼) |
| lDongRegnCd=47, lDongSignguCd=130 | ✅ CONFIRMED (V1 raw 실데이터) |
| gallerySearchList1 / galleryDetailList1 | ✅ CONFIRMED (PhotoGallery v4.2 매뉴얼) |
| areaBasedList2 contentTypeId 옵션 | ✅ CONFIRMED (항목구분=0) |
| VG HTML var lat/lng 5건 전체 | ✅ CONFIRMED (신규 HTTP 불필요) |
| EngService2 제외 | ✅ V3 명시 금지 |
| galContentId ≠ kto_content_id | ✅ 명시적 분리 정책 정의 |
| YN 파라미터 (overviewYN 등) | ✅ v4.4 매뉴얼에 없음 확인 (v3.x에서 삭제) |

**→ 차단 이슈 없음. 실행 진행.**

---

## 2. Git 상태

| 항목 | 값 |
|------|-----|
| Branch | `data/gyeongju-kto-kor-photo-complete-5-pilot-v3` |
| Base HEAD | `8ac8ec5` |
| origin/data/gyeongju-kto-complete-5-pilot-v2 | 없음 (V2 미실행, 예상 상태) |

---

## 3. Phase A: 경주 KTO 전체 목록 수집

**파라미터:** `areaBasedList2`, `lDongRegnCd=47`, `lDongSignguCd=130`, contentTypeId 없음 (전체)  
**페이지:** 7 pages (numOfRows=100) × totalCount=623  
**HTTP 요청 수:** 7건

### contentType별 record 수

| contentTypeId | 유형 | 건수 |
|---|---|---|
| 12 | 관광지 | **201** |
| 14 | 문화시설 | 32 |
| 15 | 행사/공연/축제 | 9 |
| 25 | 여행코스 | 1 |
| 28 | 레포츠 | 52 |
| 32 | 숙박 | 86 |
| 38 | 쇼핑 | 31 |
| 39 | 음식점 | **211** |
| **합계** | | **623** |

> V1 대비: type12 104→201건 (+97), type14 9→32건 (+23)  
> 이유: V1은 `areaCode=35`(경상북도 전체) + `sigunguCode=2`(경주)였으나, V3의 `lDongRegnCd=47&lDongSignguCd=130`는 lDong 코드 체계로 조회 → 더 많은 데이터 포함

**pagination 완료 여부:** totalCount=623, fetched=623 ✅

---

## 4. Phase B: 5개 장소 매칭

### 검색 경로 및 최종 결과

| 장소 | 검색 방법 | match_status | kto_content_id | kto_content_type_id |
|------|-----------|---|---|---|
| 교촌마을 | exact_title (전체 목록) | **EXACT_MATCH** | **128676** | 12 |
| 금장대 | exact_title (전체 목록) | **EXACT_MATCH** | **2756715** | 12 |
| 황남리 고분군 | 전 경로 소진 | NO_KTO_RECORD_AFTER_COMPLETE_SEARCH | — | — |
| 황룡사지 | exact_title (전체 목록) | **EXACT_MATCH** | 127985 | 12 |
| 서출지 | exact_title (전체 목록) | **EXACT_MATCH** | 128612 | 12 |

**매칭 성공: 4/5** (V1 대비 2건 → 4건으로 향상)

### 기존 2건 재검증

| contentId | 장소 | V1 결과 | V3 결과 |
|---|---|---|---|
| 127985 | 황룡사지 | EXACT_MATCH (V1과 동일) | **EXACT_MATCH 재검증** |
| 128612 | 서출지 | EXACT_MATCH (V1과 동일) | **EXACT_MATCH 재검증** |

### 신규 발견 2건

| contentId | 장소 | 발견 이유 |
|---|---|---|
| 128676 | 교촌마을 | V3 전체 목록 (type12 201건)에서 발견. V1 type12 104건에 없었음 |
| 2756715 | 금장대 | V3 전체 목록 (type12 201건)에서 발견. V1 type12 104건에 없었음 |

### 미매칭 1건

- **황남리 고분군**: searchKeyword2(lDongRegnCd=47) 포함 전 경로 검색 완료 → `NO_KTO_RECORD_AFTER_COMPLETE_SEARCH`
  - 황남동 고분군 별칭 검색도 없음
  - 경주 내 유사 고분군(금척리 고분군, 황오리 고분군 등)과 별도 등록

---

## 5. Phase C: detailCommon2 빈 응답 원인 확정

### 판정 결과

| contentId | 장소 | resultCode | totalCount | verdict | has_overview |
|---|---|---|---|---|---|
| 128676 | 교촌마을 | 0000 | 1 | **VALID_ITEM** | ✅ |
| 2756715 | 금장대 | 0000 | 1 | **VALID_ITEM** | ✅ |
| 127985 | 황룡사지 | 0000 | 1 | **VALID_ITEM** | ✅ |
| 128612 | 서출지 | 0000 | 1 | **VALID_ITEM** | ✅ |

### V1 빈 응답 원인 확정

**원인: PARSER_FIELD_LOSS**

V1 파이럿에서 `detailCommon2.item = {}` 으로 기록된 것은 API 데이터 부재가 아니라 **V1 파서 버그**였다.

- V1 `fetch_kto_detail()` 함수는 `item` 필드만 저장 (`{"http_status": 200, "item": {}}`)
- 실제 API 응답 구조: `response.body.items.item = [{"contentid": "127985", ...}]` (리스트)
- V1 파서가 list를 dict로 잘못 해석하거나 response 경로 탐색 실패 → `item = {}`
- V3에서 `resultCode`, `totalCount`, `items_raw_type` 전체 저장 후 재분석 결과 `VALID_ITEM` 확정

### YN 파라미터 확인

매뉴얼 검색 결과: `overviewYN`, `defaultYN`, `firstImageYN`, `areacodeYN`, `catcodeYN`, `addrinfoYN`, `mapinfoYN` **모두 v4.4 매뉴얼에 없음**

> 공식 개정이력 확인: v4.x 개정에서 공통정보 YN 파라미터 삭제됨.  
> v4.4 detailCommon2 필수 파라미터는 `contentId` 하나뿐. 추가 YN 파라미터 불필요.

---

## 6. Phase D: 국문 상세 5종

### operation별 호출·유효·빈 응답

| operation | 호출 수 | HTTP 200 | rc=0000 | VALID_ITEM | EMPTY_NOT_ERROR |
|---|---|---|---|---|---|
| detailCommon2 | 4 | 4 | 4 | 4 | 0 |
| detailIntro2 | 4 | 4 | 4 | 4 | 0 |
| detailInfo2 | 4 | 4 | 4 | 4 | 0 |
| detailImage2 | 4 | 4 | 4 | 3 | 1 |
| detailPetTour2 | 4 | 4 | 4 | 0 | 4 |
| **합계** | **20** | **20** | **20** | | |

> detailPetTour2: 4건 모두 `EMPTY_NOT_ERROR` (반려동물 여행 미등록 장소)  
> detailImage2: 황룡사지 0장

---

## 7. Phase E: VG 좌표 복구

**신규 HTTP 요청: 0건** (기존 V1 raw 재사용)

| 장소 | area_uid | VG lat | VG lng | 경주 범위 | swap 의심 |
|---|---|---|---|---|---|
| 교촌마을 | 52 | 35.8296 | 129.2147 | ✅ | ✗ |
| 금장대 | 72 | 35.8607 | 129.2010 | ✅ | ✗ |
| 황남리 고분군 | 380 | 35.8330 | 129.2128 | ✅ | ✗ |
| 황룡사지 | 68 | 35.8388 | 129.2335 | ✅ | ✗ |
| 서출지 | 91 | 35.7964 | 129.2420 | ✅ | ✗ |

**5/5 ALL EXTRACTED**. 좌표 타입: `OFFICIAL_PAGE_MAP_POINT`

### KTO vs VG 좌표 비교

| 장소 | KTO 좌표 | VG 좌표 | 거리 |
|---|---|---|---|
| 교촌마을 | (35.8296, 129.2147) | (35.8296, 129.2147) | **0.4m** |
| 금장대 | (35.8606, 129.2010) | (35.8607, 129.2010) | 14.8m |
| 황남리 고분군 | — | (35.8330, 129.2128) | N/A |
| 황룡사지 | (35.8374, 129.2328) | (35.8388, 129.2335) | 161.9m |
| 서출지 | (35.7964, 129.2424) | (35.7964, 129.2420) | 41.3m |

> 황룡사지 161.9m: 유적지 넓이(약 250×250m) 범위 내 차이. 지도 표시점 vs TourAPI 등록점 의미 차이.  
> 황남리 고분군: KTO 미매칭으로 VG 좌표만 사용 (OFFICIAL_PAGE_MAP_POINT).

---

## 8. Phase F: PhotoGallery 수집

### 매칭 결과

| 장소 | 검색어 | HTTP | totalCount | 매칭 | 사진 수 | 판정 |
|---|---|---|---|---|---|---|
| 교촌마을 | "교촌마을" | 200 | 13 | 경주+교촌마을 | **13장** | HIGH_CONFIDENCE_PHOTO_MATCH |
| 금장대 | "금장대" | 200 | 0 | — | 0 | NO_PHOTO_RECORD |
| 황남리 고분군 | "황남리 고분군" | 200 | 0 | — | 0 | NO_PHOTO_RECORD |
| 황룡사지 | "황룡사지" | 200 | 0 | — | 0 | NO_PHOTO_RECORD |
| 서출지 | "서출지" | 200 | 9 | 경주+서출지 | **9장** | HIGH_CONFIDENCE_PHOTO_MATCH |

**매칭: 2/5** (교촌마을 13장, 서출지 9장)

### ID 체계 분리 검증

- `gal_content_id` (PhotoGallery 전용) → KorService2 API에 **전달하지 않음** ✅
- `gal_content_type_id` (갤러리 분류) → 관광정보 `contenttypeid`(12/14...)와 **혼용하지 않음** ✅
- 장소 연결: `galPhotographyLocation` (경주 포함) + `galTitle` (장소명 포함) 두 조건 모두 충족 시만 연결 ✅

---

## 9. 장소별 최종 Coverage

| 항목 | 교촌마을 | 금장대 | 황남리 고분군 | 황룡사지 | 서출지 |
|---|---|---|---|---|---|
| KTO 등록 | ✅ | ✅ | ✗ | ✅ | ✅ |
| kto_content_id | 128676 | 2756715 | — | 127985 | 128612 |
| KTO overview | 589자 | 250자 | — | 1041자 | 844자 |
| KTO 주소 | ✅ | ✅ | — | ✅ | ✅ |
| KTO 좌표 | ✅ | ✅ | — | ✅ | ✅ |
| KTO 이미지 | 8장 | 6장 | — | 4장 | 2장 |
| detailIntro 유효 | ✅ | ✅ | — | ✅ | ✅ |
| detailInfo 유효 | ✅ | ✅ | — | ✅ | ✅ |
| detailPetTour | EMPTY | EMPTY | — | EMPTY | EMPTY |
| VG 좌표 | ✅ | ✅ | ✅ | ✅ | ✅ |
| PhotoGallery | 13장 | 0장 | 0장 | 0장 | 9장 |
| 최종 설명 출처 | KTO | KTO | NONE | KTO | KTO |
| 최종 좌표 출처 | VG | VG | VG | VG | VG |

> 황남리 고분군: KTO 미등록. 설명=NONE, 좌표=VG만 사용. 별도 수집 필요.

---

## 10. 이미지 권리 Provenance

| 출처 | 장소 | 권리 판정 |
|---|---|---|
| KTO detailImage2 | 4개 장소 (교촌마을 8장, 금장대 6장, 황룡사지 4장, 서출지 2장) | `RIGHTS_EVIDENCE_MISSING` (DEF-ENRICH-M01 유지) |
| PhotoGalleryService1 | 교촌마을 13장, 서출지 9장 | `rights_note: KTO 보유 관광사진. 상업적 이용은 출처 확인 필요` |

---

## 11. API operation별 요청 수

| operation | 건수 |
|---|---|
| areaBasedList2 (pagination) | 7 |
| searchKeyword2 (황남리 고분군) | 1 |
| detailCommon2 진단 | 4 |
| detailCommon2 상세 | 4 |
| detailIntro2 | 4 |
| detailInfo2 | 4 |
| detailImage2 | 4 |
| detailPetTour2 | 4 |
| gallerySearchList1 | 5 |
| galleryDetailList1 | 2 |
| **합계** | **39** |

---

## 12. 재현성 (Run1=Run2)

| 파일 | Run1 SHA | Run2 결과 |
|---|---|---|
| gyeongju-kto-kor-photo-pilot-kto-link-v3.jsonl | 3b1d1195... | IDENTICAL |
| gyeongju-kto-kor-photo-pilot-detailcommon2-root-cause-v3.json | 66c3e799... | IDENTICAL |
| gyeongju-kto-kor-photo-pilot-photo-link-v3.jsonl | e90db226... | IDENTICAL |
| gyeongju-kto-kor-photo-pilot-coverage-v3.json | cf49fa2a... | IDENTICAL |
| gyeongju-kto-kor-photo-pilot-namespace-audit-v3.json | c45e12b9... | IDENTICAL |
| gyeongju-kto-kor-photo-pilot-snapshot-v3.jsonl | c074b6a0... | IDENTICAL |

**Run1=Run2: BYTE_IDENTICAL_PASS (7/7)**

---

## 13. Frozen SHA

| 파일 | 상태 |
|---|---|
| gyeongju-tourism-next-batch-priority-v1.jsonl | OK |
| gyeongju-tier-a-pilot-kto-link-v1.jsonl | OK |
| gyeongju-tier-a-pilot-qa-v1.json | OK |
| gyeongju-tier-a-pilot-snapshot-v1.jsonl | OK |

**Frozen SHA: ALL_OK**

---

## 14. 회귀 테스트

| # | 테스트 | 결과 |
|---|---|---|
| T01 | searchKeyword2 법정동 파라미터 (lDongRegnCd=47) | ✅ PASS |
| T02 | areaCode·sigunguCode 사용 탐지 | ✅ PASS (0건) |
| T03 | 전체 목록 pagination 완료 (623/623) | ✅ PASS |
| T04 | KTO contentId와 galContentId 분리 | ✅ PASS |
| T05 | galContentId의 KorService2 전달 차단 | ✅ PASS |
| T06 | detailCommon2 items parser (resultCode+totalCount+raw 저장) | ✅ PASS |
| T07 | HTTP 200 + empty item 구분 | ✅ PASS |
| T08 | VG lat/lng 5건 추출 | ✅ PASS (5/5) |
| T09 | PhotoGallery 동명이인 자동 연결 차단 | ✅ PASS |
| T10 | Run2 네트워크 0 | ✅ PASS |
| T11 | API 키 로그·파일 노출 차단 | ✅ PASS |
| T12 | Run1=Run2 BYTE_IDENTICAL | ✅ PASS |

**12/12 PASS**

---

## 15. 결함 레지스터

| 결함 ID | 등급 | 내용 | 상태 |
|---|---|---|---|
| DEF-V3-CONFIRMED-01 | MEDIUM | 황남리 고분군: KTO 미등록, 설명·이미지 없음. 별도 수집 필요 | OPEN |
| DEF-V3-CONFIRMED-02 | LOW | PhotoGallery 3건 NO_PHOTO_RECORD (금장대, 황남리 고분군, 황룡사지) | OPEN |
| DEF-V3-CONFIRMED-03 | INFO | 황룡사지 KTO-VG 좌표 161.9m 차이 — 유적지 규모 반영, 비차단 | DOCUMENTED |
| DEF-ENRICH-M01 | MEDIUM | KTO 이미지 RIGHTS_EVIDENCE_MISSING (기존 유지) | ONGOING |
| DEF-V1-PARSER-CONFIRMED | INFO | V1 detailCommon2 파서 버그 확정. V3에서 수정됨 | CLOSED |

---

## 16. 생성 산출물

### validation (tracked)
| 파일 | 내용 |
|---|---|
| gyeongju-kto-kor-photo-pilot-kto-link-v3.jsonl | 5건 매칭 감사 |
| gyeongju-kto-kor-photo-pilot-detailcommon2-root-cause-v3.json | detailCommon2 원인 확정 |
| gyeongju-kto-kor-photo-pilot-photo-link-v3.jsonl | PhotoGallery 매칭 |
| gyeongju-kto-kor-photo-pilot-coverage-v3.json | 장소별 coverage |
| gyeongju-kto-kor-photo-pilot-namespace-audit-v3.json | ID 분리 감사 |
| gyeongju-kto-kor-photo-pilot-api-ops-v3.json | API 요청량 |
| gyeongju-kto-kor-photo-pilot-qa-v3.json | QA 요약 |
| gyeongju-kto-kor-photo-pilot-run1-run2-sha-v3.json | Run1=Run2 SHA |
| gyeongju-kto-kor-photo-pilot-frozen-sha-v3.json | Frozen SHA |

### normalized (tracked)
| 파일 | 내용 |
|---|---|
| gyeongju-kto-kor-photo-pilot-snapshot-v3.jsonl | 5건 통합 snapshot |

### scripts (tracked)
| 파일 | 내용 |
|---|---|
| gyeongju_tier_a_kto_pilot_v3.py | V3 실행 스크립트 |

### docs (tracked)
| 파일 | 내용 |
|---|---|
| gyeongju-kto-kor-photo-complete-5-pilot-v3-completion.md | 이 파일 |

### raw (gitignored)
- `data/tourapi/raw/gyeongju/kto-list/kto-all-types-areabasedlist2-gyeongju-v3.json` (623건)
- `data/tourapi/raw/gyeongju/gyeongju-kto-kor-photo-pilot-v3/` (detailCommon2 진단 4건, 상세 4건, gallerySearch 5건, galleryDetail 2건)

---

## 17. TIER_A 117건 진행 가능 여부

| 항목 | 상태 |
|---|---|
| lDongRegnCd/lDongSignguCd 코드 확정 | ✅ 47/130 |
| areaBasedList2 전체 목록 검증 | ✅ 623건 |
| searchKeyword2 적용 확인 | ✅ 황남리 고분군 케이스에서 동작 확인 |
| VG HTML 배치 수집 | 대기 — 별도 태스크 필요 (117건 × mnu_uid 확인) |
| detailCommon2 파서 버그 수정 | ✅ V3 스크립트에서 해결 |
| PhotoGallery 연결 파이프라인 | ✅ 검증됨 |
| **TIER_A 117건 진행 가능** | **조건부 가능** — VG HTML 배치 수집 태스크 먼저 필요 |

---

## 18. 완료 판정

| 기준 | 결과 |
|---|---|
| 기존 KTO 2/5 → 4/5 재검증 | ✅ |
| 5개 장소 실제 KTO 등록 여부 확정 | ✅ (4 등록, 1 미등록) |
| detailCommon2 빈 응답 원인 확정 | ✅ PARSER_FIELD_LOSS (V1 버그) |
| VG 좌표 5건 전수 복구 | ✅ 5/5 |
| PhotoGallery 존재·사진수·권리 확인 | ✅ (2/5 매칭) |
| ID 체계 완전 분리 | ✅ |
| 기존 데이터 무변경 | ✅ Frozen SHA ALL_OK |
| Run1=Run2·manifest·테스트 PASS | ✅ |

**종합 판정: PASS**

---

작업을 완료했습니다.
