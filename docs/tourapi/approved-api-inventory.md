# GoKoreaMate 승인 API 인벤토리

**작성일:** 2026-07-23  
**상태:** 7종 승인 완료 (data.go.kr 활용기간 2026-05-31 ~ 2028-05-31)  
**인증 환경변수:** `TOUR_API_KEY` (모든 한국관광공사·부산광역시 API 공통)  
**원칙:** 사실(실측 확인) / 추정(응답 미확인) / 확인필요로 구분

---

## 목차

1. [부산광역시_부산맛집정보 서비스](#1-부산광역시_부산맛집정보-서비스)
2. [부산광역시_부산명소정보 서비스](#2-부산광역시_부산명소정보-서비스)
3. [부산광역시_부산축제정보 서비스](#3-부산광역시_부산축제정보-서비스)
4. [한국관광공사_국문 관광정보 서비스_GW](#4-한국관광공사_국문-관광정보-서비스_gw)
5. [한국관광공사_관광사진 정보_GW](#5-한국관광공사_관광사진-정보_gw)
6. [한국관광공사_영문 관광정보서비스_GW](#6-한국관광공사_영문-관광정보서비스_gw)
7. [행정안전부_대한민국 공공서비스(혜택) 정보](#7-행정안전부_대한민국-공공서비스혜택-정보)

---

## 공통 주의사항

### JSON 스키마 분기

부산광역시 API 3종과 한국관광공사 API 3종은 **응답 구조가 완전히 다르다.**

| 구분 | 최상위 키 | 성공 코드 | 필드 방식 |
|---|---|---|---|
| 한국관광공사 (KorService2 / EngService2) | `response.header.resultCode` | `"0000"` | camelCase |
| 부산광역시 3종 | `getFoodKr.header.code` 등 엔드포인트명 | `"00"` | ALL_CAPS |
| 행정안전부 | `currentCount` / `data[]` | 별도 코드 없음 | 한글 필드명 |

파서(parser)를 API별로 분기 구현해야 한다.

### contentId — 언어 서비스 간 동일성 미보장

언어 서비스 간 contentId 동일성을 보장하지 않는다. (실측 1건 확인)

실측 확인:
- 해운대해수욕장 KorService2 contentId = `126081`
- 해운대해수욕장 EngService2 contentId = `264155`

식별자는 `source_service + contentId` 조합으로 관리한다.  
언어 간 장소 연결은 좌표·주소·정규화 명칭 등 복수 근거로 수행한다.

---

## 1. 부산광역시_부산맛집정보 서비스

| 항목 | 내용 |
|---|---|
| 서비스명 | 부산광역시_부산맛집정보 서비스 |
| 제공 기관 | 부산광역시 |
| Base Endpoint | `https://apis.data.go.kr/6260000/FoodService` |
| 인증 환경변수 | `TOUR_API_KEY` |
| Swagger / 명세 URL | data.go.kr 개발계정 상세 페이지 |
| 일일 호출 한도 | 추정: 상세기능별 10,000회 (공식 문서 확인 필요) |

### 상세기능 경로

| 엔드포인트 | 언어 | 실측 여부 |
|---|---|---|
| `/getFoodKr` | 국문 | 추정 (스키마만 확인, 상세 미확인) |
| `/getFoodEn` | 영문 | 추정 |
| `/getFoodJa` | 일본어 | 추정 |
| `/getFoodZhS` | 중국어 간체 | 추정 |
| `/getFoodZhT` | 중국어 번체 | 추정 |

### 주요 요청 파라미터

```
serviceKey, numOfRows, pageNo, resultType=json
```

추정: 구·군명(`GUGUN_NM`), 키워드 필터 파라미터 존재 가능 (명세 확인 필요)

### 주요 응답 필드 (명소 API 실측 기반 추정)

부산광역시 3종은 동일 스키마를 사용하는 것으로 추정:

```
UC_SEQ          — 고유 식별자 (부산광역시 자체 ID)
MAIN_TITLE      — 장소명
GUGUN_NM        — 구·군명
LAT             — 위도
LNG             — 경도
ADDR1           — 주소
CNTCT_TEL       — 전화번호
HOMEPAGE_URL    — 홈페이지
USAGE_DAY_WEEK_AND_TIME — 영업시간
USAGE_AMOUNT    — 이용요금
HLDY_INFO       — 휴무 정보
MAIN_IMG_NORMAL — 대표 이미지 URL (visitbusan.net 호스팅)
MAIN_IMG_THUMB  — 썸네일 이미지 URL
ITEMCNTNTS      — 상세 설명
```

맛집 전용 필드(`MENU`, 업종 분류 등)는 명세 확인 필요.

### 페이지네이션

`numOfRows` + `pageNo` 방식 (추정)

### 고유 식별자 후보

`UC_SEQ` (부산광역시 자체 ID, 한국관광공사 contentId와 무관)

### 이미지 및 라이선스

- `MAIN_IMG_NORMAL`, `MAIN_IMG_THUMB`: visitbusan.net 호스팅
- 이미지 이용 조건 공식 확인 필요 (공공누리 유형 미확인)

### GoKoreaMate 활용 대상

- 부산 음식점 데이터 보완
- 다국어 음식점 명칭 확보 (Kr/En/Ja/ZhS/ZhT 내장)

### 아직 확인되지 않은 사항

- 음식점 카테고리·업종 분류 필드
- 수정일·삭제 여부 필드
- 이미지 라이선스 조건
- 전체 맛집 수 (부산 기준)
- 필터링 가능 파라미터 목록

---

## 2. 부산광역시_부산명소정보 서비스

| 항목 | 내용 |
|---|---|
| 서비스명 | 부산광역시_부산명소정보 서비스 |
| 제공 기관 | 부산광역시 |
| Base Endpoint | `https://apis.data.go.kr/6260000/AttractionService` |
| 인증 환경변수 | `TOUR_API_KEY` |
| Swagger / 명세 URL | data.go.kr 개발계정 상세 페이지 |
| 일일 호출 한도 | 추정: 상세기능별 10,000회 |

### 상세기능 경로

| 엔드포인트 | 언어 | 실측 여부 |
|---|---|---|
| `/getAttractionKr` | 국문 | **실측 확인** (HTTP 200, code:00) |
| `/getAttractionEn` | 영문 | HTTP 200 수신, 필드 구조 미확인 |
| `/getAttractionJa` | 일본어 | 추정 |
| `/getAttractionZhS` | 중국어 간체 | 추정 |
| `/getAttractionZhT` | 중국어 번체 | 추정 |

### 주요 요청 파라미터

```
serviceKey, numOfRows, pageNo, resultType=json
```

### 주요 응답 필드 (실측 확인)

```json
{
  "getAttractionKr": {
    "header": { "code": "00", "message": "NORMAL_CODE" },
    "item": [
      {
        "UC_SEQ": 255,
        "MAIN_TITLE": "흰여울문화마을",
        "GUGUN_NM": "영도구",
        "LAT": 35.07885,
        "LNG": 129.04402,
        "PLACE": "흰여울문화마을",
        "TITLE": "가파른 절벽 끝에 흰여울문화마을",
        "SUBTITLE": "흰여울길에서 만난 느림의 미학",
        "ADDR1": "부산광역시 영도구 흰여울길",
        "CNTCT_TEL": "051-419-4067",
        "HOMEPAGE_URL": "http://...",
        "TRFC_INFO": "도시철도 1호선 ...",
        "USAGE_DAY": "",
        "HLDY_INFO": "",
        "USAGE_DAY_WEEK_AND_TIME": "매일",
        "USAGE_AMOUNT": "무료",
        "MIDDLE_SIZE_RM1": "장애인 주차장(...))",
        "MAIN_IMG_NORMAL": "https://www.visitbusan.net/...",
        "MAIN_IMG_THUMB": "https://www.visitbusan.net/...",
        "ITEMCNTNTS": "절영해안산책로 ..."
      }
    ]
  }
}
```

### 페이지네이션

`numOfRows` + `pageNo` (실측 확인)

### 고유 식별자 후보

`UC_SEQ` (부산광역시 내부 ID)

### 수정일·삭제 여부 필드

**확인되지 않음.** 변경분 동기화 기능 존재 여부 미확인.

### 이미지 및 라이선스

- `MAIN_IMG_NORMAL` / `MAIN_IMG_THUMB`: visitbusan.net 서버 호스팅
- 공공누리 유형 미확인 → 상업 서비스 자동 반영 전 이용 조건 확인 필요

### GoKoreaMate 활용 대상

- 부산 관광명소 국문 원천
- 다국어 명칭 확보 (Kr/En/Ja/ZhS/ZhT 단일 서비스 내장)
- 한국관광공사 미등록 부산 명소 보완
- 운영시간·요금·교통정보 확보

### 아직 확인되지 않은 사항

- `getAttractionEn` 이하 언어별 필드 완전 확인
- 전체 명소 수
- 수정일·삭제 여부 필드
- 이미지 라이선스

---

## 3. 부산광역시_부산축제정보 서비스

| 항목 | 내용 |
|---|---|
| 서비스명 | 부산광역시_부산축제정보 서비스 |
| 제공 기관 | 부산광역시 |
| Base Endpoint | `https://apis.data.go.kr/6260000/FestivalService` |
| 인증 환경변수 | `TOUR_API_KEY` |
| 일일 호출 한도 | 추정: 상세기능별 10,000회 |

### 상세기능 경로

| 엔드포인트 | 언어 | 실측 여부 |
|---|---|---|
| `/getFestivalKr` | 국문 | HTTP 200 수신, 구조 미확인 |
| `/getFestivalEn` | 영문 | HTTP 200 수신 |
| `/getFestivalJa` | 일본어 | 추정 |
| `/getFestivalZhS` | 중국어 간체 | 추정 |
| `/getFestivalZhT` | 중국어 번체 | 추정 |

### 주요 응답 필드 (추정 — 명소 API와 동일 스키마 예상)

```
UC_SEQ, MAIN_TITLE, GUGUN_NM, LAT, LNG, ADDR1
CNTCT_TEL, HOMEPAGE_URL, MAIN_IMG_NORMAL, MAIN_IMG_THUMB
```

축제 전용 추정 필드:
```
EVENT_START_DATE  — 행사 시작일 (확인 필요)
EVENT_END_DATE    — 행사 종료일 (확인 필요)
```

### GoKoreaMate 활용 대상

- 부산 축제·행사 데이터
- 다국어 행사명 확보
- 한국관광공사 searchFestival2 대비 부산 특화 데이터 보완

### 아직 확인되지 않은 사항

- 행사 시작·종료일 필드명
- 기간 필터 파라미터 (날짜 범위 조회 가능 여부)
- 전체 행사 수

---

## 4. 한국관광공사_국문 관광정보 서비스_GW

| 항목 | 내용 |
|---|---|
| 서비스명 | 한국관광공사_국문 관광정보 서비스_GW |
| 제공 기관 | 한국관광공사 |
| Base Endpoint | `https://apis.data.go.kr/B551011/KorService2` |
| 인증 환경변수 | `TOUR_API_KEY` |
| 일일 호출 한도 | 추정: 상세기능별 1,000회 |

### 상세기능 경로

| 엔드포인트 | 기능 | 실측 결과 |
|---|---|---|
| `/searchKeyword2` | 키워드 검색 | **✓** rc:0000, 부산 장산 contentId=2614727 확인 |
| `/locationBasedList2` | 위치 기반 조회 | **✓** 정상 |
| `/areaBasedList2` | 지역 기반 전체 조회 | **✓** 부산 775건 확인 |
| `/areaBasedSyncList2` | 변경분 동기화 | **✓** rc:0000 (파라미터: modifiedtime 필요) |
| `/searchFestival2` | 축제 검색 | 미실측 |
| `/searchStay2` | 숙박 검색 | 미실측 |
| `/detailCommon2` | 공통 상세정보 | 응답 파싱 실패 (구조 확인 필요) |
| `/detailIntro2` | 소개 상세 | **✓** rc:0000 |
| `/detailInfo2` | 반복 정보 | 미실측 |
| `/detailImage2` | 이미지 목록 | **✓** (imageYN=Y 파라미터 필요) |
| `/ldongCode2` | 행정동 코드 (신규) | **✓** rc:0000 |
| `/lclsSystmCode2` | 분류체계 코드 (신규) | **✓** rc:0000 |
| `/areaCode2` | 지역 코드 (기존) | **✓** rc:0000 (현재 작동, 삭제예정 공식 공지 미확인) |
| `/categoryCode2` | 분류 코드 (기존) | **✓** rc:0000 (현재 작동, 삭제예정 공식 공지 미확인) |
| `/ldongCode2` | 행정동 코드 | **✓** |
| `/lclsSystmCode2` | 분류체계 코드 | **✓** |

> **주의:** `/areaCode2`, `/categoryCode2`는 신규 엔드포인트(`ldongCode2`, `lclsSystmCode2`)로 전환이 권장된다는 정보가 있으나, 현재 두 기존 엔드포인트 모두 정상 작동 중이며 공식 삭제 일정 공지 출처를 확인하지 못했다. 공식 문서 확인 전 기존 엔드포인트 제거 금지.

### 주요 요청 파라미터

```
serviceKey, MobileOS, MobileApp, _type=json
keyword          — 키워드 검색용
areaCode         — 지역 코드 (6 = 부산광역시)
contentTypeId    — 관광타입 (12=관광지, 14=문화시설, 15=축제, 28=레포츠, 32=숙박, 38=쇼핑, 39=음식점)
numOfRows, pageNo
mapX, mapY, radius  — 위치 기반
contentId        — 상세 조회용
modifiedtime     — 동기화 기준 시각 (areaBasedSyncList2)
```

### 주요 응답 필드

```
contentid        — 고유 식별자 (KorService2 내부, EngService2와 다름)
contenttypeid    — 콘텐츠 유형
title            — 한국어 장소명
addr1, addr2     — 주소
mapx, mapy       — 경도, 위도
tel              — 전화번호
homepage         — 홈페이지
firstimage       — 대표 이미지 URL
firstimage2      — 썸네일
modifiedtime     — 수정 시각
createdtime      — 생성 시각
```

### 고유 식별자

`contentid` — KorService2 전용, EngService2와 다른 값

### 전체 수집 기능

`/areaBasedList2?areaCode=6` → 부산 **775건** 전체 수집 가능  
페이지 순회: `numOfRows=100`씩 반복

### 변경분 동기화 기능

`/areaBasedSyncList2?areaCode=6&modifiedtime=YYYYMMDDHHMMSS`

### GoKoreaMate 활용 대상

- city_spots 국문 원천 (부산 775건, EngService2 194건의 4배)
- 장소별 좌표·주소·전화·홈페이지
- 수정일 기반 증분 동기화
- 관광지 대표 이미지

### 아직 확인되지 않은 사항

- `/detailCommon2` 응답 구조 (파싱 실패)
- `/searchFestival2`, `/searchStay2` 파라미터
- `/detailInfo2` 반복 정보 구조
- contentTypeId별 부산 건수 분포
- `ldongCode2` / `lclsSystmCode2` 실제 활용 방법

---

## 5. 한국관광공사_관광사진 정보_GW

| 항목 | 내용 |
|---|---|
| 서비스명 | 한국관광공사_관광사진 정보_GW |
| 제공 기관 | 한국관광공사 |
| Base Endpoint | `https://apis.data.go.kr/B551011/PhotoGalleryService1` |
| 인증 환경변수 | `TOUR_API_KEY` |
| 일일 호출 한도 | 추정: 상세기능별 1,000회 |

### 상세기능 경로

| 엔드포인트 | 기능 | 실측 결과 |
|---|---|---|
| `/galleryList1` | 전체 사진 목록 | **✓** 전국 6,119건 |
| `/gallerySearchList1` | 키워드 사진 검색 | **✓** 해운대 키워드 657건 |
| `/gallerySyncDetailList1` | 변경분 동기화 | **✓** rc:0000 (modifiedtime 파라미터) |
| `/galleryDetailList1` | 사진 그룹 상세 | ✗ rc:11 (필수 파라미터 누락 — `galContentId` 추정) |

### 주요 요청 파라미터

```
serviceKey, MobileOS, MobileApp, _type=json
numOfRows, pageNo
keyword          — gallerySearchList1 키워드 검색
modifiedtime     — gallerySyncDetailList1 동기화 기준
galContentId     — galleryDetailList1 필수 파라미터 (확인 필요 — 공식 명세 미확인)
```

galleryList1 필터 파라미터(areaCode, galContentId 등)는 동작 미확인 — 공식 명세 확인 필요.

### 주요 응답 필드 (추정)

```
galContentId     — 사진 그룹 ID
galTitle         — 사진 제목
galWebImageUrl   — 이미지 URL
galPhotographyMonth — 촬영월
galPhotographyLocation — 촬영 장소
galSearchKeyword — 검색 키워드
galCreatedtime   — 등록일
galModifiedtime  — 수정일
```

### 이미지 라이선스

한국관광공사는 공공누리 1유형 및 3유형 이미지를 포함한다고 안내.  
이미지별 공공누리 유형 필드 존재 여부 확인 필요.  
상업 서비스 자동 반영 전 조건 확인 필수.

### GoKoreaMate 활용 대상

- city_spots 대표 이미지 보완
- 장소 갤러리 이미지 확보
- 이미지 없는 city_spots에 후보 이미지 제공

### 아직 확인되지 않은 사항

- galleryList1 지역·장소 필터 파라미터
- galleryDetailList1 정확한 필수 파라미터
- 이미지별 공공누리 유형 필드명
- galContentId와 KorService2 contentId의 관계

---

## 6. 한국관광공사_영문 관광정보서비스_GW

| 항목 | 내용 |
|---|---|
| 서비스명 | 한국관광공사_영문 관광정보서비스_GW |
| 제공 기관 | 한국관광공사 |
| Base Endpoint | `https://apis.data.go.kr/B551011/EngService2` |
| 인증 환경변수 | `TOUR_API_KEY` |
| 일일 호출 한도 | 추정: 상세기능별 1,000회 |

### 상세기능 경로

| 엔드포인트 | 기능 | 실측 결과 |
|---|---|---|
| `/searchKeyword2` | 키워드 검색 | **✓** 현재 스크립트 사용 중 |
| `/locationBasedList2` | 위치 기반 조회 | **✓** 현재 스크립트 사용 중 |
| `/areaBasedList2` | 지역 기반 전체 조회 | **✓** 부산 194건 |
| `/areaBasedSyncList2` | 변경분 동기화 | 미실측 |
| `/searchFestival2` | 축제 검색 | 미실측 |
| `/searchStay2` | 숙박 검색 | 미실측 |
| `/detailCommon2` | 공통 상세정보 | 응답 파싱 실패 (KorService2와 동일 문제) |
| `/detailIntro2` | 소개 상세 | 미실측 |
| `/detailInfo2` | 반복 정보 | 미실측 |
| `/detailImage2` | 이미지 목록 | 미실측 |
| `/areaCode2` | 지역 코드 | **✓** (삭제예정 공식 미확인) |
| `/categoryCode2` | 분류 코드 | **✓** (삭제예정 공식 미확인) |
| `/ldongCode2` | 행정동 코드 (신규) | 미실측 |
| `/lclsSystmCode2` | 분류체계 (신규) | 미실측 |

### 주요 응답 필드

KorService2와 동일 구조, 필드명 동일.  
`title`은 영어로 제공됨.

### 고유 식별자

`contentid` — EngService2 전용, KorService2와 다른 값

실측 예시: 해운대해수욕장
- KorService2 contentid = `126081`
- EngService2 contentid = `264155`

### 전체 수집 기능

`/areaBasedList2?areaCode=6` → 부산 **194건** (KorService2의 25% 수준)

### GoKoreaMate 활용 대상

- city_spots 영문 제목·설명
- 현재 `tourapi-nightly.mjs` 스크립트의 매칭 데이터 원천
- KorService2 장소의 영문 연결 후보 (좌표 매칭 기반)

### 아직 확인되지 않은 사항

- KorService2 대비 영문 미등록 장소 비율
- contentId 매핑 없는 장소의 영문 처리 방식
- `/detailCommon2` 응답 구조

---

## 7. 행정안전부_대한민국 공공서비스(혜택) 정보

| 항목 | 내용 |
|---|---|
| 서비스명 | 행정안전부_대한민국 공공서비스(혜택) 정보 |
| 제공 기관 | 행정안전부 |
| Base URL | `https://api.odcloud.kr/api` |
| Swagger URL | `https://infuser.odcloud.kr/api/stages/44436/api-docs` |
| 인증 환경변수 | `TOUR_API_KEY` |
| 일일 호출 한도 | 확인 필요 |

### 상세기능 경로

| 엔드포인트 | 기능 | 실측 결과 |
|---|---|---|
| `GET /gov24/v3/serviceList` | 서비스 목록 | **✓** 전국 10,978건 |
| `GET /gov24/v3/serviceDetail` | 서비스 상세 | HTTP 200 수신 |
| `GET /gov24/v3/supportConditions` | 지원 조건 | HTTP 200 수신 |

### 주요 요청 파라미터

```
serviceKey, page, perPage
cond[필드명::EQ]=값  — 필터 (동작 확인 필요)
```

### 주요 응답 필드 (실측 확인)

```json
{
  "currentCount": 1,
  "data": [
    {
      "등록일시": "20201217142613",
      "부서명": "영유아재정과",
      "사용자구분": "개인",
      "상세조회URL": "https://www.gov.kr/...",
      "서비스ID": "000000465790",
      "서비스명": "유아학비 (누리과정) 지원",
      "서비스목적요약": "...",
      "서비스분야": "보육·교육",
      "선정기준": "..."
    }
  ],
  "totalCount": 10978
}
```

### GoKoreaMate 활용 범위 및 주의사항

**이 API를 관광지 원천 데이터로 사용하지 않는다.**

실측 데이터는 대부분 대한민국 거주민(시민·주민) 대상 복지·행정 서비스다.  
("유아학비 지원", "누리과정", "보육·교육" 등)

여행자·외국인과 관련 가능한 데이터가 포함될 수 있으나:
- 전체 10,978건 중 관련 비율 미파악
- 외국인 필터 파라미터 동작 미확인
- 단기 관광객 vs 등록 외국인·유학생·근로자 구분 필요

**권고:** 전체 서비스 목록에서 관광·교통·다국어·문화 관련 항목을 샘플링한 뒤 실제 활용 가능 비율을 측정하고 GoKoreaMate 적용 범위를 결정해야 한다.

### 아직 확인되지 않은 사항

- 외국인·여행자 관련 서비스 비율
- 필터 파라미터 정확한 사용법
- 서비스별 신청 가능 대상 구분
- GoKoreaMate 실제 활용 여부

---

*최종 갱신: 2026-07-23*
