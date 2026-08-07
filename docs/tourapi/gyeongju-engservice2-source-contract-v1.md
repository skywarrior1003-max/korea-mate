# EngService2 Source Contract V1

**작성일시**: 2026-08-07T09:13:05Z  
**Task**: TASK-GYEONGJU-EN-ENGSERVICE2-CONTRACT-AND-10-PLACE-PILOT-V1  

## 로컬 매뉴얼

`docs/tourapi/approved-api-inventory.md (Section 6)`

## Base Endpoint

`https://apis.data.go.kr/B551011/EngService2`

## 인증

환경변수: `TOUR_API_KEY`

## 경주 지역 필터

- areaCode: `35` (경상북도)  
- sigunguCode: `2` (경주시)  
- 계약 상태: `CONTRACT_CONFIRMED`  

## ContentId 네임스페이스

- KorService2 contentid ≠ EngService2 contentid (별도 체계)
- 해운대 예시: KOR=126081, ENG=264155
- 필드명: `kto_ko_content_id`, `kto_en_content_id` (JOIN KEY로 사용 금지)

## Operation 상태

| Operation | 상태 | 비고 |
|---|---|---|
| areaBasedList2 | CONFIRMED_ACTUAL | 부산 areaCode=6 → 194건 실측 |
| locationBasedList2 | CONFIRMED_ACTUAL | 현재 스크립트 사용 중 |
| searchKeyword2 | CONFIRMED_ACTUAL | 현재 스크립트 사용 중 |
| detailCommon2 | CONFIRMED_ACTUAL | rc:0000, contentId만 사용, YN 파라미터 금지 |
| areaCode2 | CONFIRMED_PARTIAL | 삭제예정 공식 미확인 |
| categoryCode2 | CONFIRMED_PARTIAL | 삭제예정 공식 미확인 |
| areaBasedSyncList2 | NOT_TESTED | 미실측 |
| searchFestival2 | NOT_TESTED | 미실측 |
| searchStay2 | NOT_TESTED | 미실측 |
| detailIntro2 | NOT_TESTED | 미실측 |
| detailInfo2 | NOT_TESTED | 미실측 |
| detailImage2 | NOT_TESTED | 미실측 |
| ldongCode2 | NOT_TESTED | 신규 endpoint 미실측 |
| lclsSystmCode2 | NOT_TESTED | 신규 endpoint 미실측 |

## EngService2 경주 목록

- 총 64건 조회됨

## 금지 사항

- detailPetTour2 금지
- YN 파라미터 금지 (detailCommon2: contentId만 사용)
- KorService2 파라미터 추정 적용 금지
- 한국어 문장 번역하여 EN 데이터로 사용 금지
