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

## 2. 운영 계약 — 주간 원천 확인에서 실화면까지

**자동화된 것과 아닌 것**: 자동인 것은 (a) 날짜가 지난 행사를 화면에서 빼는 일(브라우저의 한국 날짜로 방문할 때마다 계산)과 (b) 주간 확인이 밀렸는지 판정하는 일(`/api/health/content`)뿐이다. **원천 확인·데이터 수정·배포는 사람이 한다 — 자동 갱신이 아니다.** 자동 감지가 503 을 내도 누가 보지 않으면 아무 일도 일어나지 않는다(§3).

| 단계 | 담당 | 주기 | 완료 증거(없으면 미완료) |
|---|---|---|---|
| ① 원천 확인·변경 제안 | Data Track(조사 담당 — 다른 LLM 포함) | 매주 월요일 | 항목별 공식 URL·확인일·전/후 값을 담은 제안. **조사만 끝난 상태는 '제안'이지 반영이 아니다** |
| ② 원천 재검증·데이터 반영 | Main(Claude) | ① 수령 후 | 공식 원문을 직접 열어 대조 → JSON 수정 + `data/regional-recommendations/corrections/freshness-YYYY-MM-DD.json`(원천·검토 상태) + `content-freshness-v1.json` checks 1행(status `preview_verified`) + 가드 통과. 원천이 불확실하면 반영하지 않고 `pending` 에 사유를 남긴다 |
| ③ Preview 확인 | Main(Claude) | ② 직후 | Preview 배포 id, 바뀐 화면 실측(전/후), `/api/health/content` 200 |
| ④ Production 게시 | Owner 승인 → Main 이 master merge | 승인 즉시 | Production 배포 id(자동 배포). **데이터는 빌드에 구워지므로 merge 없이는 화면이 바뀌지 않는다** |
| ⑤ 게시 후 실화면 확인 | Main(Claude) | 배포 당일 | Production 에서 바뀐 화면과 `/api/health/content` 200 확인 → 다음 확인 행의 `previous_publish` 에 배포 id·확인 결과를 남긴다(게시 증거는 배포 뒤에야 생기므로) |

미게시 항목은 `content-freshness-v1.json` 의 `pending`(id·대기 이유)에 남는다. 원천 재확인 대기 Essentials 는 `recheckPending` 이 있어 상세 화면에 '다시 확인하는 중' 안내가 붙는다(요금이 최신 확정값처럼 보이지 않게).

### 날짜 경계(자동)

- 기준일은 **한국 날짜**다(`kstToday` — UTC 15:00 = KST 다음 날 00:00).
- 종료일(`validTo`·`endDate`)·표시 기한(`displayUntil`)은 **당일까지 보이고 다음 날 빠진다**.
- 달만 적힌 날짜("2026-08 (exact date TBC)")는 **그 달 말일까지** 보인다. 진행 중·예정 상태는 ISO 날짜가 있을 때만 붙인다.
- City Hub 행사 목록은 **브라우저에서만** 계산한다(정적 HTML·hydration 중에는 목록을 그리지 않음) — 빌드한 날 기준 목록이 HTML 에 남지 않는다. /trending·/all-spots 는 행사 파일을 실행 시 받아 매번 계산한다.
- 재배포가 필요한 것은 **데이터 내용이 바뀔 때뿐**이다. 날짜가 지나 행사가 빠지는 데는 재배포가 필요 없다.

## 3. 밀림을 알아차리는 방법

- `GET https://gokoreamate.com/api/health/content`(콘텐츠 브랜치 게시 후 존재) — 마지막 확인이 7+2일을 넘기면 503 `weekly_check_overdue`, 종료일을 계산할 수 없는 행사가 있으면 503 `event_without_end_date`, Essentials `reviewBy` 초과는 503 `essentials_review_overdue`. 응답은 상태명·날짜·건수뿐이고 5분 캐시된다.
- **현재 외부 감시는 연결돼 있지 않다**(등록된 감시 서비스 기록 없음). 연결할 때의 설정: 위 URL, 방법 GET, 정상=200, 간격 60분, 연속 2회 실패 시 알림, 알림 채널은 메일 발송 서비스(Resend)와 다른 것(앱 푸시·SMS). Auth 출시 후에는 `/api/health/retention` 도 같은 방식으로 추가한다. 등록은 Owner 계정에서 하는 외부 설정이다.
- **연결 전 절차**: 매주 월요일 Main 작업 세션을 시작할 때 `curl -s -o /dev/null -w "%{http_code}" https://gokoreamate.com/api/health/content` 와 `content-freshness-v1.json` 의 마지막 확인일을 먼저 본다. 503 이거나 마지막 확인이 7일을 넘었으면 그 주 첫 작업을 ① 로 둔다. 선택: Owner 가 Claude 예약 실행(매주 월 09:00 KST 위 확인 후 결과 보고)을 만들 수 있다.

## 4. 원천 확인이 필요한 대기 목록(이번에 고치지 않음)

| 위치 | 값 | 이유 |
|---|---|---|
| seoul-U-006 T-money Mpass | 15,000~64,500원 | 판매 지속 여부·가격 공식 원문 미확인 — 화면에 재확인 중 안내 |
| jeju-U-003 버스 기본요금 / jeju-U-004 택시 / jeju-U-006 마라도 | "2025년 기준" 표기 | 2026 공식 요금표 미확인 |
| jeonju 택시(essentials :825) | "2024년 기준" | 공식 요금 미확인 |
| 주요 운영시간(busan-U-001 등) | 05:00~23:59 등 | 노선별 변경 여부 미확인 |
| 가을 이후 행사 | 5도시 모두 신규 행사 0건 추가 | 새 행사는 공식 일정 확인 후 별도 반영(이번 범위는 오표시 교정) |
| 경주 "이달의 추천" | 1~8월만 | 월별 갱신 약속 여부 Owner 결정 |
| `public/data/events.json` 레거시 | 종료 23건 | 목록에서는 빠짐. 파일 정리·레거시 화면 존치는 별도 결정 |

## 5. 이번 콘텐츠 교정의 Production 반영 단위

- **단위**: 브랜치 `fix/regional-content-freshness-v1` 을 master 에 merge(= Cloudflare 자동 Production 빌드·배포). DB·환경변수·Auth·Legal 변경 없음(파일 목록은 merge 요청에 첨부).
- **배포 전 확인**: master 가 브랜치의 base(`1d3334fd`)에서 앞서 나갔으면 merge 충돌·가드를 다시 확인. 가드 `regional-content-freshness-guard`·`regional-recommendations` 통과.
- **배포 후 확인(10분 안)**: `/trending` 에 부산바다축제 없음 · `/city/jeju/events`·`/city/jeonju/events` 에 관악제·소리축제 없음 · `/city/seoul/essentials/seoul-U-001` 1,550원 · `seoul-U-007` 단기권 문구 · `/api/health/content` 200.
- **중단 기준**: 빌드 실패(next/font 일시 오류는 같은 커밋 재시도), 위 확인 중 하나라도 다르면 게시 중단.
- **복구**: Cloudflare Pages 에서 직전 Production 배포로 되돌린다(데이터 변경뿐이라 DB 조치 없음). 원인은 브랜치에서 고친 뒤 다시 merge.
