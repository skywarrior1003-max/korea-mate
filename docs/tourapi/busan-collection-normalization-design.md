# GoKoreaMate 부산 API 수집·정규화 설계

**작성일:** 2026-07-23  
**상태:** 설계 문서 (구현 전)  
**표기 원칙:** 사실(실측 확인) / 추정(미확인) / 권고(설계 판단)

---

## 1. API별 수집 방식

### 공통 인증

모든 API: `serviceKey={TOUR_API_KEY}` (환경변수)  
한국관광공사 + 부산광역시 3종 공통 키 사용 가능 (실측 확인)

### 스키마 분기 주의

파서는 API 계열별로 반드시 분리한다.

| 계열 | 성공 판정 기준 | 필드 방식 |
|---|---|---|
| 한국관광공사 (KorService2 / EngService2) | `response.header.resultCode == "0000"` | camelCase |
| 부산광역시 3종 | `{엔드포인트명}.header.code == "00"` | ALL_CAPS |
| 관광사진 (PhotoGallery) | `response.header.resultCode == "0000"` | camelCase |
| 행정안전부 | `data` 배열 존재 여부 | 한글 필드명 |

---

### API 1 — 한국관광공사 국문 (KorService2)

| 항목 | 내용 |
|---|---|
| Base | `https://apis.data.go.kr/B551011/KorService2` |
| 수집 엔드포인트 | `/areaBasedList2` (전체), `/searchKeyword2` (보완), `/areaBasedSyncList2` (증분) |
| 페이지네이션 | `numOfRows=100`, `pageNo` 순회 (`totalCount` 초과 시 중단) |
| 성공 코드 | `response.header.resultCode == "0000"` |
| items 경로 | `response.body.items.item[]` (단건 시 객체, 다건 시 배열) |
| source ID | `contentid` |
| 검증 상태 | **실측 확인** (부산 775건, 2026-07-22, areaCode=6, 전체 페이지 순회, 중복 제거 미확인) |
| 동기화 | `/areaBasedSyncList2?areaCode=6&modifiedtime=YYYYMMDDHHMMSS` 실측 확인 |
| 미확인 | `/detailCommon2` 응답 구조 파싱 실패 — 수집 시 제외 |

---

### API 2 — 한국관광공사 영문 (EngService2)

| 항목 | 내용 |
|---|---|
| Base | `https://apis.data.go.kr/B551011/EngService2` |
| 수집 엔드포인트 | `/areaBasedList2` (전체), `/locationBasedList2` (GPS 매칭 보완) |
| 페이지네이션 | `numOfRows=100`, `pageNo` 순회 |
| 성공 코드 | `response.header.resultCode == "0000"` |
| items 경로 | `response.body.items.item[]` |
| source ID | `contentid` |
| 검증 상태 | **실측 확인** (부산 194건, 2026-07-22, areaCode=6) |
| 주의 | KorService2 contentid와 동일성 보장 안 됨 — 해운대해수욕장: Kor=126081, Eng=264155 |

---

### API 3 — 부산광역시 명소 (AttractionService)

| 항목 | 내용 |
|---|---|
| Base | `https://apis.data.go.kr/6260000/AttractionService` |
| 수집 엔드포인트 | `/getAttractionKr` (국문), `/getAttractionEn` 등 언어별 |
| 페이지네이션 | `numOfRows`, `pageNo` (추정 — 구조는 명소 Kr 실측 기반) |
| 성공 코드 | `getAttractionKr.header.code == "00"` |
| items 경로 | `getAttractionKr.item[]` |
| source ID | `UC_SEQ` (부산광역시 자체 ID, 관광공사와 무관) |
| 검증 상태 | `/getAttractionKr` **실측 확인** / `/getAttractionEn` HTTP 200만 확인 / Ja·ZhS·ZhT **추정** |
| 주요 필드 | `MAIN_TITLE`, `LAT`, `LNG`, `ADDR1`, `GUGUN_NM`, `USAGE_DAY_WEEK_AND_TIME`, `USAGE_AMOUNT`, `MAIN_IMG_NORMAL`, `ITEMCNTNTS` |

---

### API 4 — 부산광역시 맛집 (FoodService)

| 항목 | 내용 |
|---|---|
| Base | `https://apis.data.go.kr/6260000/FoodService` |
| 수집 엔드포인트 | `/getFoodKr` 등 언어별 |
| 성공 코드 | `getFoodKr.header.code == "00"` (추정 — 명소 API 스키마 동일 예상) |
| items 경로 | `getFoodKr.item[]` (추정) |
| source ID | `UC_SEQ` (추정) |
| 검증 상태 | **HTTP 200 수신만 확인** — 필드 구조, 건수, 실제 언어 완전성 미확인 |
| 주의 | 다국어 엔드포인트(Ja/ZhS/ZhT) 존재 확인 필요 — 추정으로만 처리할 것 |

---

### API 5 — 부산광역시 축제 (FestivalService)

| 항목 | 내용 |
|---|---|
| Base | `https://apis.data.go.kr/6260000/FestivalService` |
| 수집 엔드포인트 | `/getFestivalKr` 등 언어별 |
| 성공 코드 | `getFestivalKr.header.code == "00"` (추정) |
| source ID | `UC_SEQ` (추정) |
| 검증 상태 | **HTTP 200 수신만 확인** — 행사 기간 필드(시작일·종료일)명 미확인 |
| 운영 원칙 | 축제는 city_spots가 아닌 events로 분리 저장 |

---

### API 6 — 관광사진 (PhotoGalleryService1)

| 항목 | 내용 |
|---|---|
| Base | `https://apis.data.go.kr/B551011/PhotoGalleryService1` |
| 수집 엔드포인트 | `/galleryList1` (전체), `/gallerySearchList1` (키워드), `/gallerySyncDetailList1` (증분) |
| 페이지네이션 | `numOfRows`, `pageNo` |
| 성공 코드 | `response.header.resultCode == "0000"` |
| source ID | `galContentId` |
| 검증 상태 | `/galleryList1` 전국 6,119건 확인 / `/gallerySearchList1` 해운대 657건 확인 / `/gallerySyncDetailList1` 실측 확인 |
| 미확인 | `/galleryDetailList1` — rc:11 오류 (필수 파라미터 추정: `galContentId`, 공식 명세 미확인) |
| 활용 범위 | 이미지 보완 전용 — 장소 원천으로 사용하지 않음 |

---

### API 7 — 행정안전부 공공서비스 (Gov24)

| 항목 | 내용 |
|---|---|
| Base | `https://api.odcloud.kr/api` |
| 수집 엔드포인트 | `/gov24/v3/serviceList` |
| 성공 코드 | `data` 배열 존재 |
| items 경로 | `data[]` |
| source ID | `서비스ID` |
| 검증 상태 | **실측 확인** (전국 10,978건) |
| 활용 판단 | 관광지 원천 부적합 — 대부분 국내 복지·행정 서비스 / 관광·문화 관련 항목 비율 미파악 |

---

## 2. 저장 구조

기존 경로 `data/tourapi/`를 유지하며 하위 구조를 확장한다.

```
data/tourapi/
  raw/
    busan/
      {YYYY-MM-DD}/
        kto-ko-{n}.json          # KorService2 areaBasedList2 페이지별
        kto-en-{n}.json          # EngService2 areaBasedList2 페이지별
        busan-attraction-ko.json # 부산시 AttractionService Kr
        busan-attraction-en.json # 부산시 AttractionService En
        busan-food-ko.json       # 부산시 FoodService Kr
        busan-festival-ko.json   # 부산시 FestivalService Kr
        photo-search-{keyword}.json
  normalized/
    busan/
      {YYYY-MM-DD}/
        spots.jsonl              # 정규화 완료 레코드 (1줄 1건)
        events.jsonl             # 축제·행사 분리
  candidates/
    busan/
      {YYYY-MM-DD}/
        lang-links.jsonl         # 다국어 연결 후보
        city-spots-diff.jsonl    # 기존 city_spots 비교 결과
  reports/
    busan/
      {YYYY-MM-DD}/
        collection-summary.md    # 수집 건수·오류 요약
        match-exceptions.csv     # 수동 검토 예외
  busan/
    busan-update-exceptions-20260722.csv  # 기존 파일 유지
```

**기존 파일 보존:** `data/tourapi/busan/` 하위 기존 파일은 그대로 유지하고 `raw/`, `normalized/` 등 새 하위 경로만 추가한다.

---

## 3. 공통 정규화 필드

API마다 응답 구조가 다르므로 수집 후 다음 공통 형식으로 변환한다.

```jsonc
{
  // 원천 식별자
  "source_provider":  "kto | busan | photo",        // 제공 기관
  "source_service":   "KorService2 | AttractionService | ...",
  "source_id":        "126081",                      // 원천 고유 ID
  "source_language":  "ko | en | ja | zh-s | zh-t",
  "raw_data_path":    "data/tourapi/raw/busan/2026-07-23/kto-ko-1.json",

  // 명칭
  "title":            "해운대해수욕장",
  "title_normalized": "해운대해수욕장",               // 괄호·특수문자 제거 후

  // 위치
  "address":          "부산광역시 해운대구 ...",
  "district":         "해운대구",                    // 구·군
  "latitude":         35.1587,
  "longitude":        129.1604,

  // 설명·분류
  "description":      "...",
  "content_type_id":  12,                            // KTO 분류 (부산시 API는 매핑 필요)
  "category":         "attraction | food | festival",

  // 이미지
  "image_url":        "https://...",
  "image_source":     "kto | visitbusan | photo-gallery",
  "image_license":    "공공누리1 | 공공누리3 | 미확인",  // 확인 전까지 미확인

  // 동기화
  "modified_at":      "20260722120000",              // 원천 수정시각
  "collected_at":     "2026-07-23T10:00:00Z",

  // 검증 상태
  "source_verified":  "confirmed | inferred | unverified"
}
```

**언어 간 연결 시 주의:** `source_service + source_id` 조합을 단일 장소 고유 키로 사용한다. `source_id`(contentId 등)만으로는 언어 간 동일 장소임을 보장하지 않는다.

---

## 4. 다국어·중복 연결 설계

### 연결 기준 (복수 근거 의무)

단일 기준으로 연결하지 않는다. 다음 점수를 합산해 후보 생성:

| 기준 | 조건 | 점수 |
|---|---|---|
| 좌표 거리 | ≤ 100m | +50 |
| 좌표 거리 | 100~200m | +30 |
| 주소 구·군 일치 | 동일 GUGUN_NM / sigunguCode | +20 |
| 정규화 명칭 유사도 | 한글 Jaro-Winkler ≥ 0.85 | +20 |
| 장소 유형 일치 | contentTypeId 동일 | +10 |
| 행정구역 일치 | 동·면 수준 일치 | +10 |

| 점수 범위 | 처리 |
|---|---|
| ≥ 80 | 자동 연결 후보 (candidates/lang-links.jsonl) |
| 50~79 | 수동 검토 후보 |
| < 50 | 연결 보류 |

### 장소 관계 유형

| 유형 | 정의 | 예시 |
|---|---|---|
| `same_place` | 동일 장소의 언어별 레코드 | 해운대해수욕장 Ko/En |
| `separate_places` | 다른 장소이나 GPS 근접 | 동백섬 산책로 / 누리마루 APEC하우스 |
| `parent_child` | 포함 관계 | 동백섬 > 누리마루 APEC하우스 |
| `nearby_related` | 근접하나 독립 장소 | 광안리 해변 / 광안대교 |
| `unknown` | 판단 불가 — 수동 검토 필요 | — |

현재 부산 예외 14건 중 ID 37/38, ID 4/16이 이 분류 부재로 수동 처리됐다 → 관계 유형 적용 시 자동 분류 가능.

---

## 5. 기존 city_spots 비교 결과 유형

API 수집 후 기존 city_spots와 비교해 다음으로 분류한다.

| 유형 | 정의 |
|---|---|
| `new_candidate` | 기존 city_spots에 없는 신규 장소 후보 |
| `field_update` | 기존에 있으나 주소·좌표·이미지 등 필드 보강 가능 |
| `duplicate_candidate` | 기존 city_spots 내 중복 의심 |
| `relation_candidate` | 독립 장소이나 기존 장소와 관계 존재 |
| `language_missing` | 기존 장소에 특정 언어 정보 없음 |
| `image_missing` | 기존 장소에 이미지 없음 |
| `wrong_match` | 기존 TourAPI contentId가 잘못 매칭됨 |
| `manual_review` | 자동 분류 불가 — 사람 판단 필요 |

**운영 원칙:** 어떤 유형이든 자동으로 city_spots에 반영하지 않는다. 비교 결과는 `candidates/city-spots-diff.jsonl`에 저장하고 사람 승인 후에만 적용한다.

---

## 6. 품질 평가 — Data Confidence / Trip Suitability

두 점수는 독립적으로 관리한다.

### Data Confidence (데이터 신뢰도, 0~100)

데이터가 얼마나 정확하고 완전한지 측정한다.

| 요소 | 최대 점수 |
|---|---|
| 원천 수 (1개: 30 / 2개: 50 / 3개 이상: 70) | 70 |
| 좌표·주소 일치 (복수 원천 비교) | 10 |
| 이미지 존재 + 라이선스 확인 | 10 |
| 수정일 최신성 (1년 이내: +10) | 10 |
| **합계** | 100 |

### Trip Suitability (여행 적합도, 0~100)

GoKoreaMate 일정 후보로 적합한지 평가한다.

| 요소 | 최대 점수 |
|---|---|
| 관광 목적성 명확 | 25 |
| 대중교통·도보 접근 가능 | 20 |
| 운영시간 정보 존재 | 15 |
| 영어 정보 존재 | 15 |
| 대표 이미지 존재 | 10 |
| 주변 장소 밀도 (500m 이내 다른 장소 수 기반) | 10 |
| 외국인 여행자 관련성 | 5 |
| **합계** | 100 |

**활용 방법:**
- Data Confidence < 50: 정보 보강 전까지 일정 후보 제외
- Trip Suitability < 40: 낮은 우선순위로 분류
- 두 점수 모두 ≥ 70: 자동 후보 승격 (사람 최종 승인은 여전히 필요)

---

## 7. 자동화 범위

| 작업 | 자동화 수준 | 설명 |
|---|---|---|
| API 호출·페이지 순회 | 95% | 성공 코드 확인 + totalCount 기반 중단 |
| 응답 저장 (raw/) | 95% | 날짜별 폴더 저장 |
| 호출 실패·재시도 | 95% | 최대 재시도 횟수 후 오류 로그 |
| 중단 후 재개 | 90% | 마지막 pageNo 상태 저장 |
| 필드 정규화 | 90% | HTML 제거·좌표 검증·언어 코드 통일 |
| 동일 원천 중복 제거 | 90% | source_service + source_id 기준 |
| 다국어 연결 후보 생성 | 70~85% | 점수 기반 후보 목록 생성 (확정 아님) |
| 기존 city_spots 매칭 | 75~90% | 비교 결과 유형 분류 |
| 관광 적합성 점수 | 60~80% | 규칙 기반 초안 — 실측 후 보정 필요 |
| **운영 반영 승인** | **사람 100%** | 어떤 단계도 자동 DB 반영 없음 |

---

## 8. 현재 부족한 데이터 및 추가 원천

### 부산 — 현재 부족한 항목

| 항목 | 현황 | 처리 원칙 |
|---|---|---|
| 운영시간·휴무일 | 부산시 API 일부 제공, KTO는 detailIntro2 필요 (미실측) | API 값 기본 사용, 공식 홈 우선, 충돌 시 manual_review |
| 이미지 라이선스 | URL은 있으나 공공누리 유형 필드 실측 안 됨 | 확인 전까지 `image_license: "미확인"` — 자동 사용 금지 |
| 장소 관계 | 상위·인접 관계 구조 없음 | 이번 설계의 관계 유형으로 단계적 구축 |
| 서비스 적합성 | API 등록 ≠ 여행 추천 대상 | Trip Suitability 점수로 필터링 |

### API 추가 신청 우선순위

| 우선순위 | 대상 | 이유 |
|---|---|---|
| 1 | `B551011/JpnService2` (일본어) | 현재 403, 서울·제주 확장 시 필수 |
| 1 | `B551011/ChsService2` (중국어 간체) | 현재 403, 동일 이유 |
| 1 | `B551011/ChtService2` (중국어 번체) | 현재 403, 동일 이유 |
| 2 | 무장애 관광 API | 고령·휠체어·유아 동반 여행자 지원 (MVP v2) |
| 3 | 공중화장실·응급실 | 여행 실행 지원 (MVP v2 이후) |

### 도시 확장 시 추가 원천

| 도시 | 추가 원천 |
|---|---|
| 서울 | 서울시 관광명소·문화행사 API, 서울시 다국어 관광정보, KTO 서울 전체 (areaCode=1) |
| 제주 | 제주관광공사 API, 제주도 공식 관광 API, 오름·올레길·기상·계절 정보 |
| 경주 | 경주시 문화유산 API, 문화재청 국가유산 데이터, 역사유적 관람시간 |

---

## 9. 정확성 주의사항

- **부산 city_spots 실제 건수**: 미확인. `state.json` 최대 ID=86이나 ID는 비연속 — 실제 count는 Supabase 조회 필요
- **부산 맛집 실제 건수**: 미확인. 이전 세션의 "194건"은 EngService2 전체 관광정보 건수이며 맛집만의 count가 아님
- **부산시 FoodService/FestivalService 다국어**: 엔드포인트 존재는 스키마 추정 기반 — 실제 Ja·ZhS·ZhT 데이터 완전성은 소규모 샘플 수집으로 확인 필요
- **KorService2 775건 / EngService2 194건**: 2026-07-22, areaBasedList2, areaCode=6, 중복 제거 미확인 기준

---

## 10. 다음 실행 단계 (우선순위 순)

1. 부산시 AttractionService 5개 언어 소규모 샘플 수집 (20~50건) → FoodService·FestivalService 동일
2. 정규화 파서 5종 검증 (KorService2, EngService2, 부산시 3종)
3. 다국어 연결 점수 실험 (부산 명소 20건으로 GPS+명칭 매칭 정확도 측정)
4. 기존 city_spots 실제 건수 확인 (Supabase 조회)
5. 예외율·매칭률 측정 후 임계값 보정
6. 부산 전체 배치 수집 설계 확정
7. 로컬 commit (부산 전체 완료 후)

---

*참고 문서: [approved-api-inventory.md](approved-api-inventory.md) | [gokoreamate-data-source-strategy.md](gokoreamate-data-source-strategy.md) | [busan-update-exceptions-20260722.md](busan-update-exceptions-20260722.md)*  
*최종 갱신: 2026-07-23*
