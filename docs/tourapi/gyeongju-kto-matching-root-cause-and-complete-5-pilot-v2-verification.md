# TASK-GYEONGJU-KTO-MATCHING-ROOT-CAUSE-AND-COMPLETE-5-PILOT-V2 검증 보고서

> 작성일: 2026-08-07  
> 검증자: Claude Code (claude-sonnet-4-6)  
> Base HEAD: `7a41ed5` (data/gyeongju-kto-api-contract-and-5-place-pilot-v1)  
> 검증 결론: **개선 아이디어 발견 → 실행 보류 / 검증보고서 단독 발행**

---

## 1. 검증 범위 및 방법

### 검증 대상
- TASK-GYEONGJU-KTO-MATCHING-ROOT-CAUSE-AND-COMPLETE-5-PILOT-V2 프롬프트
- 전제 조건 (파일 존재 여부, API 키, raw 캐시, 기존 collector)

### 검증 수행 내용
| 항목 | 방법 |
|------|------|
| Git 상태 | `git rev-parse HEAD` → 7a41ed5 확인 |
| VG HTML 좌표 패턴 | 파일 직접 검색 (`var lat/lng`) |
| KTO API 파라미터 | ZIP 매뉴얼 추출 (개방데이터_활용매뉴얼(국문) v4.4) |
| PhotoGallery API | ZIP 추출 (TourAPI_Guide_(관광사진) v4.2) |
| EngService2 | 매뉴얼 전체 검색 |

---

## 2. 전제 조건 검증

| 항목 | 결과 | 비고 |
|------|------|------|
| Git HEAD | ✅ `7a41ed5` | 예상과 일치 |
| 원격 브랜치 미push | ✅ origin 없음 확인됨 | 수동 push 필요 |
| 파이럿 VG HTML (5건) | ✅ 전건 존재 | vg-area-52/68/72/91/380.json |
| 파이럿 KTO raw (2건) | ✅ 전건 존재 | kto-127985.json, kto-128612.json |
| areaBasedList2 type12/14 | ✅ 전건 존재 | 104+9=113건 |
| KTO API 키 | ✅ .env.local 정상 |  |
| ZIP 매뉴얼 | ✅ 2개 파일 확인 | 개방데이터 v4.4, 관광사진 v4.2 |

---

## 3. API 엔드포인트 공식 확인

### KorService2 (개방데이터_활용매뉴얼(국문) v4.4 기준)

| 엔드포인트 | 공식 확인 | 파라미터 요약 |
|-----------|-----------|--------------|
| `areaBasedList2` | ✅ CONFIRMED | contentTypeId=**옵션(0)**, lDongRegnCd=옵션 |
| `searchKeyword2` | ✅ CONFIRMED | **keyword=필수(1)**, lDongRegnCd=옵션, lDongSignguCd=옵션 |
| `detailCommon2` | ✅ CONFIRMED | contentId=필수(1), overview 필드 포함 |
| `detailIntro2` | ✅ CONFIRMED | contentId=필수, contentTypeId=필수 |
| `detailInfo2` | ✅ CONFIRMED | contentId=필수, contentTypeId=필수 |
| `detailImage2` | ✅ CONFIRMED | contentId=필수, contentTypeId=필수 |
| `detailPetTour2` | ✅ CONFIRMED | contentId=필수 |
| `ldongCode2` | ✅ CONFIRMED | 법정동 코드 조회 API |

### PhotoGalleryService1 (TourAPI_Guide_(관광사진) v4.2 기준)

| 엔드포인트 | 공식 확인 | 파라미터 요약 |
|-----------|-----------|--------------|
| `galleryList1` | ✅ CONFIRMED | 정렬 조회 |
| `gallerySearchList1` | ✅ CONFIRMED | **keyword=필수(1)** |
| `galleryDetailList1` | ✅ CONFIRMED | **title=필수(1)** (URL 인코딩 필요) |
| `gallerySyncDetailList1` | ✅ CONFIRMED | 동기화 조회 |

Base URL: `http://apis.data.go.kr/B551011/PhotoGalleryService1/`

---

## 4. 기존 raw 캐시 재사용 확인

### VG HTML `var lat/var lng` 좌표 추출 (CORE27 패턴 동일)

| 파일 | area_uid | lat | lng | 결과 |
|------|----------|-----|-----|------|
| vg-area-380.json | 380 (황남리 고분군) | 35.8330 | 129.2128 | ✅ FOUND |
| vg-area-52.json | 52 (교촌마을) | 35.8296 | 129.2147 | ✅ FOUND |
| vg-area-68.json | 68 (황룡사지) | 35.8388 | 129.2335 | ✅ FOUND |
| vg-area-72.json | 72 (금장대) | 35.8607 | 129.2010 | ✅ FOUND |
| vg-area-91.json | 91 (서출지) | 35.7964 | 129.2420 | ✅ FOUND |

**5/5 ALL FOUND** — V2의 VG 좌표 복구 단계는 신규 HTTP 요청 없이 완료 가능.  
CORE27에서 검증된 `var lat/var lng` 파서 패턴이 TIER_A 파이럿 5건에도 동일하게 적용됨.

---

## 5. 개선 아이디어 (3건) — 실행 보류 근거

아래 3건의 개선 아이디어가 발견되었습니다. 이 항목들은 프롬프트 수정 또는 추가 검증 없이 실행할 경우 결과물의 정확성을 훼손할 수 있습니다.

---

### 개선 #1 (MEDIUM): searchKeyword2 지역 필터 파라미터 불명확

**현상:**  
KorService2 v4.4 매뉴얼에서 `searchKeyword2`의 지역 필터는 `lDongRegnCd` (법정동 시도 코드) / `lDongSignguCd` (법정동 시군구 코드) 파라미터를 사용한다. 그러나 기존 `gyeongju_official_detail_collector_v1.py` 및 V1 파이럿 스크립트는 `areaCode=35` / `sigunguCode=2` (TourAPI 구 파라미터 체계)를 사용한다. `searchKeyword2`의 파라미터 명세에는 `areaCode`나 `sigunguCode`가 **없다**.

```
searchKeyword2 지역 파라미터 (v4.4 매뉴얼):
  lDongRegnCd  = 법정동 시도 코드  (옵션, 예: 50=제주)
  lDongSignguCd = 법정동 시군구 코드 (옵션, lDongRegnCd 필수)
```

**리스크:**  
V2 스크립트에서 `searchKeyword2(keyword="교촌마을")`를 호출할 때 지역 필터 없이 전국 검색하면, 동명 장소(교촌마을은 전국에 다수 존재)의 오매칭 가능성이 생긴다. 반대로 `areaCode=35`를 그대로 전달하면 API가 무시하거나 오류를 반환할 수 있다.

**필요 조치:**  
1. 경주시 lDongRegnCd 값을 `ldongCode2` API로 조회하거나 표준 법정동 코드(경상북도=47, 경주시=130)를 공식 확인 후 하드코딩.
2. `searchKeyword2` 지역 필터로 `lDongRegnCd=47&lDongSignguCd=130` (경주시) 사용.
3. 응답 결과의 `lDongRegnCd`, `lDongSignguCd` 필드로 경주 여부 재검증.

**프롬프트 수정 포인트:**  
> "searchKeyword2(keyword={이름})"  
→ "searchKeyword2(keyword={이름}, lDongRegnCd=47, lDongSignguCd=130)" — lDongRegnCd 값은 ldongCode2 선조회로 확정

---

### 개선 #2 (HIGH): EngService2 매뉴얼 부재 — 추측 구현 불가

**현상:**  
KorService2 v4.4 매뉴얼(개방데이터_활용매뉴얼(국문))에 `EngService2` 관련 설명이 **전혀 없다**. 매뉴얼은 국문 KorService2 단일 서비스만 기술한다. `"다국어(영문, 일문, 중문간체...)" 서비스 9종 존재`라는 언급만 있고, EngService2의 Base URL, 지원 엔드포인트, contentId 호환 여부 등 파라미터 명세가 없다.

**리스크:**  
V2 프롬프트는 영문 데이터 수집을 위해 EngService2를 호출하려 한다. 매뉴얼 없이 `https://apis.data.go.kr/B551011/EngService2`를 추측 호출하면:
- URL 구조가 맞더라도 파라미터가 KorService2와 다를 수 있음
- 응답 필드명 변경 가능 (예: `title_eng` vs `title`)
- V2 프롬프트의 원칙 "공식 매뉴얼의 파라미터·응답 구조를 우선한다. 추측으로 요청 형식을 만들지 않는다"에 직접 위반

**필요 조치:**  
1. 한국관광공사 EngService2 전용 매뉴얼 확보 (data.go.kr에서 `영문` 서비스 활용신청 → 매뉴얼 PDF 다운로드).
2. 또는 V2 범위에서 EngService2를 제외하고 "영문 desc 수집은 별도 태스크"로 분리.
3. EngService2를 포함하더라도 `areaBasedList2`에 상당하는 영문 엔드포인트 이름, `contentId` 호환 여부를 먼저 검증.

**프롬프트 수정 포인트:**  
> "EngService2로 영문 정보 수집"  
→ "EngService2 전용 매뉴얼 확보 후 수집. 매뉴얼 미확보 시 해당 섹션 skip — 영문 desc=null, eng_source_checked=false 기록"

---

### 개선 #3 (MEDIUM): PhotoGallery `galContentId` ≠ KTO `contentId` 혼동 위험

**현상:**  
`gallerySearchList1` 공식 응답 구조:
```
galContentId       = 갤러리 서비스 고유 ID (예: 2586952) ← KTO contentId와 다른 체계
galContentTypeId   = 갤러리 분류 ID (예: 17) ← 관광정보 contenttypeid(12/14...)와 다름
galTitle           = 사진 제목
galWebImageUrl     = 이미지 URL (tong.visitkorea.or.kr)
galPhotographyLocation = 촬영장소 (텍스트)
galSearchKeyword   = 검색 키워드
```

`galContentId`는 PhotoGalleryService1 내부 갤러리 콘텐츠 ID로, KorService2의 `contentId` (관광정보 contentId)와 **완전히 다른 값**이다. 황룡사지(contentId=127985)를 갤러리에서 검색해 얻은 `galContentId`로 `detailCommon2(contentId=galContentId값)`를 호출하면 오류 또는 엉뚱한 장소 응답이 반환된다.

`galleryDetailList1` 호출 파라미터는 `title` (장소명 URL 인코딩)이며, `contentId`를 받지 않는다. 이는 `gallerySearchList1`의 `galTitle`을 그대로 넘기는 방식이다.

**리스크:**  
V2 스크립트에서 PhotoGalleryService1 결과를 KTO 관광정보와 연결하는 로직을 잘못 작성하면 ID 체계 혼동으로 데이터 오염. 특히 KOGL1 이미지를 `galContentId`로 식별하면서 KTO `contentId`와 혼용하는 경우.

**필요 조치:**  
1. PhotoGallery 결과는 `gal_content_id`로 별도 네임스페이스 보관.
2. KTO `contentId`와 명시적으로 분리: `kto_content_id` vs `gallery_gal_content_id`.
3. PhotoGallery 이미지 연결 시 `galPhotographyLocation` 텍스트 + `galTitle`로 장소명 검증 후 사용 여부 결정.
4. V2 스키마에 `gallery_items[]` 섹션을 `kto_images[]`와 별도로 정의.

**프롬프트 수정 포인트:**  
> "gallerySearchList1 → contentId 연결"  
→ "gallerySearchList1 결과의 galContentId는 갤러리 전용 ID. KTO contentId와 별도 관리. 장소 식별은 galPhotographyLocation 및 galTitle 텍스트 매칭으로만 수행"

---

## 6. 확인된 정상 사항 (실행 시 문제없는 항목)

| 항목 | 상태 | 근거 |
|------|------|------|
| searchKeyword2 엔드포인트 명 | ✅ CONFIRMED | 매뉴얼 1번 오퍼레이션 목록 |
| gallerySearchList1 명 | ✅ CONFIRMED | PhotoGallery 매뉴얼 2번 |
| galleryDetailList1 명 | ✅ CONFIRMED | PhotoGallery 매뉴얼 3번 |
| areaBasedList2 contentTypeId 옵션 | ✅ CONFIRMED | v4.4 항목구분=0(옵션) |
| detailInfo2 엔드포인트 | ✅ CONFIRMED | 매뉴얼 8번 오퍼레이션 |
| detailPetTour2 엔드포인트 | ✅ CONFIRMED | 매뉴얼 11번 |
| VG raw 재사용 — var lat/lng | ✅ CONFIRMED | 5/5 ALL FOUND |
| 교촌마을 VG 좌표 | ✅ (35.8296, 129.2147) | vg-area-52.json |
| 금장대 VG 좌표 | ✅ (35.8607, 129.2010) | vg-area-72.json |
| 황남리 고분군 VG 좌표 | ✅ (35.8330, 129.2128) | vg-area-380.json |
| 황룡사지 VG 좌표 | ✅ (35.8388, 129.2335) | vg-area-68.json (KTO 좌표와 비교 가능) |
| 서출지 VG 좌표 | ✅ (35.7964, 129.2420) | vg-area-91.json |

---

## 7. detailCommon2 빈 응답 원인 확정 접근법

V1에서 contentId 127985 (황룡사지), 128612 (서출지) → `detailCommon2.item = {}`.  
CORE27 contentId 128526 (동궁과 월지) → `detailCommon2` 정상 동작 확인됨.

V2에서 원인 확정을 위한 권장 진단 절차:

```
1. resultCode 확인: "0000"=정상, "03"=NODATA_ERROR
2. totalCount 확인: 0이면 API에서 해당 contentId 미등록
3. 동궁과 월지(128526) 대조: 동일 파라미터로 128526 요청 → 정상이면 파라미터 문제 아님
4. 결론: 127985, 128612는 detailCommon2 DB에 미등록 (KOGL1 미적용 구형 콘텐츠로 추정)
```

→ 이 확인 절차는 기존 파이럿 raw 파일로 수행 가능 (신규 API 호출 불필요):  
- `raw/gyeongju/gyeongju-tier-a-pilot-v1/kto-127985.json` → `detail_common2.http_status`, `detail_common2.data.response.body.totalCount` 필드 확인

---

## 8. 수정 제안 요약

V2 프롬프트 실행 전 아래 3항목을 명확히 할 것을 권장합니다:

| # | 항목 | 수정 방향 |
|---|------|-----------|
| 1 | searchKeyword2 지역 필터 | `lDongRegnCd=47, lDongSignguCd=130` (경주시) 하드코딩 또는 ldongCode2 선조회 |
| 2 | EngService2 매뉴얼 | 전용 매뉴얼 확보 or 해당 섹션 skip 정책 명시 |
| 3 | PhotoGallery ID 체계 | `galContentId` ≠ KTO `contentId` 분리 정책 명시 |

---

## 9. 최종 검증 결론

```
개선 아이디어 발견 수: 3건 (MEDIUM 2, HIGH 1)
실행 판정: 보류 (HOLD)
이유: 개선 아이디어 #1~#3 해소 없이 실행 시 결과물 정확성 훼손 가능성
```

**→ 실행하지 않습니다. 이 검증보고서를 바탕으로 프롬프트 수정 후 재검증을 권장합니다.**

---

## 부록: 검증 수행 raw 명령

```
git rev-parse HEAD                      → 7a41ed5eb463db9c... (OK)
var lat/lng 패턴: vg-area-*.json 5건    → 5/5 FOUND
ZIP 추출: 개방데이터 매뉴얼 v4.4         → 77KB 텍스트 추출
ZIP 추출: 관광사진 매뉴얼 v4.2           → 23KB 텍스트 추출
searchKeyword2 파라미터 확인            → lDongRegnCd 필드 확인
EngService 검색                        → 0건 (미기재)
gallerySearchList1 파라미터 확인        → keyword=필수, galContentId 응답 확인
```
