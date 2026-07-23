# GoKoreaMate 데이터 소스 전략

**작성일:** 2026-07-23  
**목적:** 다국어 참여형 플랫폼 GoKoreaMate의 장소·콘텐츠 데이터 수집 전략  
**범위:** 부산 현재 상황 → 전국 도시 확장 방향 → 다국어 연결 구조

---

## 목차

- [A. 데이터 소스 우선순위 원칙](#a-데이터-소스-우선순위-원칙)
- [B. 부산 현황 — 커버·미커버·보완 필요](#b-부산-현황--커버미커버보완-필요)
- [C. 추가로 필요한 API 및 신청 현황](#c-추가로-필요한-api-및-신청-현황)
- [D. 도시 확장 계획 — 서울·제주·경주](#d-도시-확장-계획--서울제주경주)
- [E. 다국어 연결 전략 — GPS+명칭 매칭](#e-다국어-연결-전략--gps명칭-매칭)
- [F. 서비스 데이터 구조 방향](#f-서비스-데이터-구조-방향)
- [G. 자동화 방향 및 스크립트 현황](#g-자동화-방향-및-스크립트-현황)

---

## A. 데이터 소스 우선순위 원칙

### 1계층: 국문 TourAPI (KorService2)

`B551011/KorService2` — 한국관광공사 국문 서비스

**이유:**
- areaBasedList2 전체 수집 기준 (2026-07-22 실측):
  KorService2 **775건** / EngService2 **194건**
  - endpoint: `areaBasedList2`
  - areaCode: `6` (부산광역시)
  - contentTypeId filter: 없음 (전체)
  - pagination: numOfRows=100, 전체 페이지 순회
  - checked_at: 2026-07-22
  - raw count (중복 제거 미확인)
  - 수치는 조회 시점·조건에 따라 달라질 수 있다
- 현재 승인된 `TOUR_API_KEY`로 작동 확인 완료
- `areaBasedSyncList2` 지원 → 변경분 증분 동기화 가능
- 전국 관광지 원천 DB — 다른 언어 서비스의 마스터

**전환 경위:** 기존 스크립트는 `EngService2`만 사용했다. 영문 데이터 194건으로 운영하면 누락이 크다. KorService2를 1계층으로 격상하고, 영문은 보완 역할로 재정의한다.

### 2계층: 부산광역시 API (AttractionService / FoodService / FestivalService)

`6260000/AttractionService` 등 — 부산광역시 자체 데이터

**이유:**
- 한국관광공사 미등록 부산 명소 포함 가능
- 다국어 내장 (Kr/En/Ja/ZhS/ZhT — 단일 서비스에서 제공)
- 실측 필드: UC_SEQ, 운영시간, 요금, 교통정보, 고화질 이미지(visitbusan.net)

**주의:** 부산광역시 API는 JSON 스키마가 한국관광공사와 다르다. 파서를 별도로 구현해야 한다.

```
부산광역시 응답 구조:
{ "getAttractionKr": { "header": { "code": "00" }, "item": [...] } }
필드: ALL_CAPS (MAIN_TITLE, LAT, LNG, UC_SEQ 등)
```

### 3계층: 영문 TourAPI (EngService2)

`B551011/EngService2` — 한국관광공사 영문 서비스

**역할:** KorService2로 수집한 장소의 영문 제목·설명 보완.  
직접 수집 원천으로 단독 사용 금지 (부산 194건으로는 부족).

### 4계층: PhotoGalleryService1

`B551011/PhotoGalleryService1` — 한국관광공사 관광사진

**역할:** city_spots 이미지 없는 장소에 공공사진 후보 제공.  
직접 원천보다 이미지 보강 용도.

### 5계층: 행정안전부 (선택적·제한적)

관광지 원천 데이터 부적합 (대부분 국내 복지·행정 서비스). 관광·문화 관련 항목 샘플링 후 실제 활용 가능 비율 확인 후 결정.

---

## B. 부산 현황 — 커버·미커버·보완 필요

### 현재 city_spots 처리 현황

| 상태 | 건수 | 내용 |
|---|---|---|
| manual_review | 17 | contentId 매칭됨, 수동 확인 대기 |
| duplicate_conflict | 6 | 3개 그룹, 중복 contentId 충돌 |
| no_match | 7 | TourAPI 미매칭, 한국어 재검색 필요 |
| wrong_match | 1 | 오매칭 확인 (207km 거리 오류) |

자세한 내역: [busan-update-exceptions-20260722.md](busan-update-exceptions-20260722.md)

### KorService2로 커버 가능한 영역

- 해변·해수욕장: 해운대, 광안리, 송정, 송도, 다대포 (실측 확인)
- 시장: 자갈치, 국제시장, BIFF광장
- 사찰·역사: 범어사, 해동용궁사
- 문화마을: 감천문화마을
- 생태공원: 삼락생태공원
- no_match 7건: KorService2 한국어 검색으로 대부분 해소 예상

### 현재 미커버 또는 보완 필요 영역

| 분류 | 항목 | 현황 |
|---|---|---|
| 등산로·트레일 | 황령산 야경 트레일, 이기대 해안산책로, 동백섬 산책로 | no_match / separate_places |
| 산 | 장산, 금정산, 백양산, 봉래산 | no_match |
| 복합명소 | 태종대유원지 | no_match (대형 명소이나 영문 검색 실패) |
| 교량 | 광안대교 | 광안리 beach와 분리 여부 미결 |
| 음식점 | 부산 전체 | FoodService 미사용 |
| 축제·행사 | 부산 전체 | FestivalService 미사용 |

### 부산 데이터 보강 우선 순위

1. no_match 7건 → KorService2 한국어 키워드 재검색 (일부 장산 contentId 2614727 실측 확인)
2. wrong_match 1건(ID 30 장산) → contentId 658477 거부, KorService2 재매칭
3. duplicate_conflict 3건 그룹 → 수동 검토 후 DB 정리
4. 음식점·축제 데이터 → FoodService / FestivalService 연동 계획 수립

---

## C. 추가로 필요한 API 및 신청 현황

### 일본어·중국어 TourAPI (현재 미승인)

| 서비스 | 엔드포인트 | 현재 상태 |
|---|---|---|
| 일본어 | `B551011/JpnService2` | **403 Forbidden** — 별도 data.go.kr 신청 필요 |
| 중국어 간체 | `B551011/ChsService2` | **403 Forbidden** — 별도 신청 필요 |
| 중국어 번체 | `B551011/ChtService2` | **403 Forbidden** — 별도 신청 필요 |

**권고:** 부산광역시 API 3종은 Ja/ZhS/ZhT 내장. 한국관광공사 다국어 서비스(JpnService2 등)는 추가 신청 진행.

플랫폼 다국어 원칙 (영·일·중·한 기본): 별도 TourAPI 미승인 전까지 부산광역시 다국어 API를 주 소스로, KorService2 + GPS 매칭으로 보완.

### 현재 신청 API 7종 현황

| # | 서비스명 | 상태 | 키 |
|---|---|---|---|
| 1 | 부산광역시_부산맛집정보 | 승인 완료 | TOUR_API_KEY |
| 2 | 부산광역시_부산명소정보 | 승인 완료 | TOUR_API_KEY |
| 3 | 부산광역시_부산축제정보 | 승인 완료 | TOUR_API_KEY |
| 4 | 한국관광공사_국문 관광정보 서비스_GW (KorService2) | 승인 완료 | TOUR_API_KEY |
| 5 | 한국관광공사_관광사진 정보_GW | 승인 완료 | TOUR_API_KEY |
| 6 | 한국관광공사_영문 관광정보서비스_GW (EngService2) | 승인 완료 | TOUR_API_KEY |
| 7 | 행정안전부_대한민국 공공서비스(혜택) 정보 | 승인 완료 | TOUR_API_KEY |

---

## D. 도시 확장 계획 — 서울·제주·경주

### 확장 원칙

KorService2 `areaCode` 파라미터로 도시를 바꾸면 된다.  
스크립트 재작성 불필요 — areaCode + city_spots만 추가하면 자동화 적용 가능.

### areaCode 참조

| 도시 | areaCode |
|---|---|
| 부산광역시 | 6 |
| 서울특별시 | 1 |
| 제주특별자치도 | 39 |
| 경상북도 (경주) | 35 |
| 전국 | 없음 (생략) |

경주는 경상북도(areaCode=35)로 조회 후 `sigunguCode`로 경주시 필터링 필요.

### 도시별 예상 데이터 규모

KorService2 areaBasedList2 예상 건수 (미실측 — 계획 수치):
- 서울: 600~1,000건 예상
- 제주: 300~500건 예상
- 경주(경북 전체): 200~400건 예상

실측 확인 후 계획 보완.

### 확장 우선순위

**부산 데이터 안정화 → 서울 → 제주 → 경주** 순서 권장.  
이유: 부산 피드백으로 스크립트·파서 안정화 후 다른 도시 적용.

---

## E. 다국어 연결 전략 — GPS+명칭 매칭

### contentId — 언어 서비스 간 동일성 미보장

언어 서비스 간 contentId 동일성을 보장하지 않는다. (실측 1건 확인)

실측 확인:
```
해운대해수욕장
  KorService2 contentId = 126081
  EngService2 contentId = 264155
```

식별자는 `source_service + contentId` 조합으로 관리한다.  
언어 간 장소 연결은 좌표·주소·정규화 명칭 등 복수 근거로 수행한다.

### 언어 서비스 간 장소 연결 방법

**GPS 좌표 + 명칭 유사도 매칭**을 사용한다.

```
연결 기준:
1. 두 서비스의 장소 GPS(mapx, mapy) 거리 ≤ 200m
2. 명칭 유사도 (한국어 ↔ 영문 변환 또는 romanization)
3. contentTypeId 일치 (같은 관광타입)

세 조건 모두 만족 → 같은 장소로 연결
```

**구현 방향:**
- KorService2로 장소 수집 → city_spots에 `kor_content_id` 저장
- EngService2 locationBasedList2로 주변 영문 후보 조회 → GPS 매칭
- 매칭된 경우 `eng_content_id` 별도 저장
- 일본어·중국어도 동일 GPS 매칭 구조 적용

### 부산광역시 API ↔ KorService2 연결

부산광역시 `UC_SEQ`와 KorService2 `contentId`도 별개다.

연결 방법:
```
LAT/LNG (부산광역시) ↔ mapy/mapx (KorService2) 거리 비교
+ MAIN_TITLE ↔ title 유사도
```

### 다국어 DB 구조 권고

```
city_spots 테이블:
  id, city, category, ...
  kor_content_id    -- KorService2 contentId
  eng_content_id    -- EngService2 contentId (GPS 매칭)
  jpn_content_id    -- JpnService2 (신청 후)
  chs_content_id    -- ChsService2 (신청 후)
  busan_uc_seq      -- 부산광역시 API UC_SEQ (부산만 해당)
  lat, lng          -- GPS (매칭 기준, 마스터)
```

---

## F. 서비스 데이터 구조 방향

### city_spots 필드 목표

KorService2 + EngService2 + 부산광역시 API 조합으로 확보 가능한 필드:

| 필드 | 원천 | 상태 |
|---|---|---|
| 국문명 | KorService2 title | 확보 가능 |
| 영문명 | EngService2 title | 확보 가능 (GPS 매칭 후) |
| 일문명 | JpnService2 / 부산광역시 Ja | JpnService2 신청 필요 |
| 중문명 | ChsService2 / 부산광역시 ZhS | ChsService2 신청 필요 |
| 좌표 (위도/경도) | KorService2 mapy/mapx | 확보 가능 |
| 주소 | KorService2 addr1 | 확보 가능 |
| 전화 | KorService2 tel | 확보 가능 |
| 대표 이미지 | KorService2 firstimage / 부산광역시 MAIN_IMG_NORMAL | 확보 가능 |
| 운영시간 | 부산광역시 USAGE_DAY_WEEK_AND_TIME | 부산만 |
| 요금 | 부산광역시 USAGE_AMOUNT | 부산만 |
| 교통정보 | 부산광역시 TRFC_INFO | 부산만 |
| 홈페이지 | KorService2 homepage | 확보 가능 |
| 수정일 | KorService2 modifiedtime | 확보 가능 (동기화 기준) |

### 이미지 전략

**우선순위:**
1. KorService2 `firstimage` — TourAPI 원본
2. 부산광역시 `MAIN_IMG_NORMAL` — visitbusan.net 고화질
3. PhotoGalleryService1 `gallerySearchList1` — 키워드 보완

**주의:** 이미지별 공공누리 유형 확인 후 사용. 자동 반영 전 라이선스 확인 필수.

---

## G. 자동화 방향 및 스크립트 현황

### 현재 스크립트 파일

| 파일 | 역할 | 현황 |
|---|---|---|
| `scripts/tourapi-batch.mjs` | 공통 유틸리티 (TOURAPI_BASE=EngService2) | EngService2만 지원 |
| `scripts/tourapi-nightly.mjs` | 야간 배치 (update 모드) | EngService2 기반 |
| `scripts/tourapi-pilot.mjs` | 초기 탐색 스크립트 | KorService1 실패 주석 남아있음 |

### 수정이 필요한 사항 (현재 코드 문제점)

1. **`tourapi-batch.mjs`**: `TOURAPI_BASE`가 EngService2 고정 → KorService2를 1계층으로 지원하려면 언어별 base URL 분기 필요
2. **`tourapi-nightly.mjs`**: Korean fallback(`if (candidates.length === 0 && spot.koName)`) 이 EngService2로 한국어 검색을 시도 → KorService2로 변경 필요
3. **`tourapi-pilot.mjs`**: 주석 `KorService1 — 미승인` → 실제로는 KorService2가 정상 작동 (KorService1이 아님), 주석 정정 필요

**현재 no_match 7건 공통 원인:** koName이 null인 city_spots은 한국어 폴백이 작동하지 않음. koName 보충 또는 GPS 기반 KorService2 locationBasedList2 대체 필요.

### 권장 자동화 흐름 (목표)

```
[1단계] KorService2 areaBasedList2 전체 수집 (부산 775건)
  → 신규 장소 발견 → city_spots 후보 등록

[2단계] EngService2 locationBasedList2 GPS 매칭
  → eng_content_id 연결 (200m 이내 + 명칭 유사도)

[3단계] 부산광역시 AttractionService GPS 매칭
  → 운영시간·요금·부산 이미지 보완

[4단계] areaBasedSyncList2 증분 동기화
  → modifiedtime 기준 변경분만 업데이트

[5단계] no_match → KorService2 한국어 재검색 자동화
  → 영문 검색 실패 → spot.koName으로 KorService2 searchKeyword2 재시도
```

### 지금 바로 실행 가능한 작업

- KorService2 `searchKeyword2`로 no_match 7건 수동 재검색
  - 장산: contentId `2614727` 확인 완료 (`장산 (부산 국가지질공원)`, 해운대구)
  - 나머지 6건: 권장 한국어 검색어 [busan-update-exceptions-20260722.md](busan-update-exceptions-20260722.md) 참조

- 스크립트 수정 없이 API 호출 테스트:
  ```
  GET https://apis.data.go.kr/B551011/KorService2/searchKeyword2
    ?serviceKey={TOUR_API_KEY}
    &keyword=태종대
    &areaCode=6
    &MobileOS=ETC&MobileApp=GoKoreaMate&_type=json
  ```

---

*최종 갱신: 2026-07-23*  
*관련 파일: [approved-api-inventory.md](approved-api-inventory.md) | [busan-update-exceptions-20260722.md](busan-update-exceptions-20260722.md)*
