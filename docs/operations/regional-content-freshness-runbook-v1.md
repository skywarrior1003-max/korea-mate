# 정기 콘텐츠 갱신 — 약속 대비 실제 상태와 게시 경로 (REGIONAL-CONTENT-FRESHNESS-V1, 2026-09-29)

> "조사함", "파일에 기록됨", "사이트 데이터에 들어감", "홈페이지에 보임"은 서로 다른 상태다.
> 이 문서의 표는 저장소·Production DB(읽기 전용)·Production 화면을 직접 대조한 결과다.

## 1. 약속된 정기 갱신 전수

문서로 약속된 정기 갱신은 **하나**다: `docs/product/gokoreamate-product-data-closeout-priority-ssot-v1.md:77·97-101` — City Hub **Events** 와 **Travel Essentials**(교통 패스·공항 연결·안내소·짐 보관 등 변동 정보)를 "각 지역 공식 원천을 매주 확인한다". 안정적인 장소·유적 정보는 주간 대상이 아니다.

| 항목 | 원천·약속 주기 | 마지막 조사·확인 | 사이트 데이터 반영 | 읽는 방식 | Production 화면(2026-09-29) | 다음 책임 |
|---|---|---|---|---|---|---|
| City Hub Events(23행 중 기간 19) | 공식 원천, **매주** | 수집 as_of 08-21/22, 링크 확인 09-06 → **09-29(이번)** | 저장소 JSON `regional-places-v1.json`(마지막 반영 09-06) | 빌드에 구움 → **데이터 변경 = 재배포 필요** | 제주 유일 행사가 8월 종료 축제(TBC), 전주 소리축제 "가을 예고"(실제 8/12~16 종료) 노출 | 주간 확인(Claude 조사 → Owner 반영 승인) |
| City Hub Travel Essentials(50) | 공식 원천, **매주** | as_of 08-21/22, 링크 확인 09-06 → **09-29(서울 2건)** | 저장소 JSON `regional-essentials-v1.json` | 빌드에 구움 → 재배포 필요 | 서울 지하철 1,400원(실제 1,550원), 종료된 기후동행카드 30일권 65,000원 안내 | 같음 |
| 레거시 이벤트 피드 `public/data/events.json`(90) | 약속 없음(일회성 스크립트) | 09-01 커밋 | 정적 파일 | 브라우저가 실행 시 fetch(파일 교체는 재배포) | **/trending 이 종료 행사 23건 노출**(예: 부산바다축제 8/31 종료), /all-spots 9건 | 목록 필터로 해결(이번) |
| 부산 행사·프로모션 정책 `data/tourapi/reports/busan/*promotion*` | 주 1회·14일 등(08-03 정책 파일) | 08-03 | **사이트 미연결**(src·functions 참조 0) | — | 보이지 않음 | 연결 여부 Owner 결정 |
| My Trip AI 트렌드 팩 | 행별 14~180일 재검토, 주간 수집 Worker | 09-21 | Production DB 10행(다음 검토 10-05·10-21·12-20) | 실행 시 API(AI 경로) | **AI 전면 off → 사용자에게 안 보임** | AI 활성화 전 |
| 블로그 후보 공급 | 주기 **Owner 미확정** | 09-07 | 후보만(게시 글 3편은 수기) | 빌드 | 가격·날짜 없는 글 | 주기 결정 대기 |
| 경주 "이달의 추천"(1~8월 8건) | 약속 없음 | 09-19 | 저장소 JSON | 빌드 | 9월 이후 항목 없음 — 지난 달 테마 노출 | 별도 결정 |
| 날씨 | 실시간(KMA) | 실시간 | — | 실행 시 API | 정상 | 없음 |
| Production `events` 테이블 | — | — | **0행**(읽는 곳 없음) | — | — | 없음 |

## 2. 이번에 복구한 게시 경로

조사 → 원천 확인 → 정식 데이터 반영 → 화면 갱신 → 반영 기록:

1. **조사·원천 확인**: 공식 누리집·공식 공지를 직접 연다. 날짜·요금·운영 여부는 공식 원문 또는 공식 원문을 인용한 복수 보도로만 확정한다. 원천이 불확실하면 게시하지 않고 아래 4의 대기 목록에 둔다.
2. **정식 데이터 반영**: `src/data/regional/regional-places-v1.json`·`regional-essentials-v1.json` 을 고치고 `asOf`·`source`(URL·as_of·freshness_note)를 함께 갱신한다.
3. **교정 기록**: `data/regional-recommendations/corrections/freshness-YYYY-MM-DD.json` 에 전·후 값, 원천 URL, 확인일, 검토 상태를 남긴다.
4. **확인 기록**: `src/data/regional/content-freshness-v1.json` 의 `checks` 에 그날 1행을 추가한다(교정이 없어도 추가 — "확인했다"는 기록).
5. **가드**: `node --experimental-strip-types --test src/lib/regional/regional-content-freshness-guard.test.ts src/data/regional/regional-recommendations.test.ts`
6. **Preview 확인**: 브랜치 push → Preview 에서 해당 City Hub·Essentials 화면과 `/api/health/content` 확인.
7. **Production 반영**: Owner 승인 후 master merge → 자동 배포. 데이터가 빌드에 구워지므로 **merge 없이는 화면이 바뀌지 않는다.**

## 3. 밀림을 알아차리는 방법

- `GET /api/health/content` — 배포된 빌드의 마지막 확인일이 7+2일을 넘기면 503 `weekly_check_overdue`, 종료일을 계산할 수 없는 행사가 있으면 503 `event_without_end_date`, Essentials `reviewBy` 가 지나면 503 `essentials_review_overdue`. 응답은 상태명·날짜·건수뿐이다.
- 외부 가동 감시에 `/api/health/retention` 과 함께 등록한다(Auth 런북 D-8 과 같은 서비스).
- 코드 쪽 재발 방지: 달만 적힌 행사("2026-08 (exact date TBC)")는 그 달 말일에 목록에서 빠진다. /trending·/all-spots 는 `displayUntil`·`endDate` 가 지난 행사를 목록에서 뺀다(공용 `isListableEvent`).

## 4. 원천 확인이 필요한 대기 목록(이번에 고치지 않음)

| 위치 | 값 | 이유 |
|---|---|---|
| seoul-U-006 T-money Mpass | 15,000~64,500원 | 판매 지속 여부·가격 공식 원문 미확인 |
| jeju-U-003 버스 기본요금 / jeju-U-004 택시 / jeju-U-006 마라도 | "2025년 기준" 표기 | 2026 공식 요금표 미확인 |
| jeonju 택시(essentials :825) | "2024년 기준" | 공식 요금 미확인 |
| 주요 운영시간(busan-U-001 등) | 05:00~23:59 등 | 노선별 변경 여부 미확인 |
| 가을 이후 행사 | 5도시 모두 신규 행사 0건 추가 | 새 행사는 공식 일정 확인 후 별도 반영(이번 범위는 오표시 교정) |
| 경주 "이달의 추천" | 1~8월만 | 월별 갱신 약속 여부 Owner 결정 |
| `public/data/events.json` 레거시 | 종료 23건 | 목록에서는 빠짐. 파일 정리·레거시 화면 존치는 별도 결정 |
