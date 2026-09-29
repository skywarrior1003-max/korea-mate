# Auth Production DB 적용 원장 — 2026-09-29 (AUTH-PRODUCTION-DB-ROLLOUT-V1)

> Owner 승인 범위: 081 확인 · 077→080 · 파기 cron 비활성 선등록 · 082 → 083 · 관문 확인 후 cron 예정 등록 · 알림 키·URL.
> 승인 밖(미실행): Auth 코드 master 합류·Production 배포, 파기 활성화(`retention_purge_activate`), 시험 메일(`retention_alert_selftest`).
> 대상: Supabase `koreamate`(`tfulaxxtorbxhlgupktc`, ap-northeast-2, ACTIVE_HEALTHY). 실행 도구: Management API `database/query`, 파일마다 별도 요청. 원본 = `git show 0490cc75:<경로>`(작업 트리 파일 미사용).
> Production 은 `supabase_migrations.schema_migrations` 를 쓰지 않는다(001~004 만 존재) — 이 문서가 적용 원장이다. 비밀값은 기록하지 않는다.

## 적용 전(20:12 KST)

master `3390b12d` = Production 배포 `05b889b3` · 환경변수 24 · auth.users 0 · 신고 9 · 문의 2 · 여행 89 · 기록 8 · 나의 장소 10 · 저장 42 · city_spots 5015(공개 4647) · pg_net 0 · cron 2(모두 active) · Vault 0 · 077~083 객체 없음.
신고 지문 md5 `8abb99311e511835dba43b5905282749` · 문의 지문 md5 `b026201ec1a78a0edefc9e3d53e85f7a`.

## 단계

| # | 시각(KST) | 실행 | git 원본 SHA-256 | 결과 | 적용 후 검증 |
|---|---|---|---|---|---|
| 0 | 20:12 | 081 **확인만** | `7aa68b9dc9ca2f4abe2e01a4f06f2d46edb1b4707629d81508f86001b8fbdf5e`(미실행) | — | 정책 1건 `anon_authenticated_read_published_city_spots`, `(is_published = true)` |
| 1 | 20:13:04 | 077_user_consents | `429041d9ca691bfc8a5cf5df40a7db97ad960d2064a07a92f04020ff106c0db1` | HTTP 201 | RLS on · anon/authenticated select 불가 · 행 0 · 정책 0 · FK ON DELETE CASCADE |
| 2 | 20:13:20 | 078_account_devices | `0411951c30d18680bea0d2c443a0c36a4aa1ff632ffb2cd543e54c0d6cfa59fe` | HTTP 201 | RLS on · `link_device_to_account` 실행 = service_role 만 · 행 0 · FK RESTRICT |
| 3 | 20:13:32 | 079_trip_drafts | `ca57871d09eec9f24da690252258499ac96a5f083012561933f544acd08e8428` | HTTP 201 | RLS on · anon/authenticated 불가 · service_role insert · 행 0 |
| 4 | 20:13:44 | 080_trip_draft_operations | `b03b810c9c1caced01d7efff1324e6ce72e774d0c582781db74452ff26899c2e` | HTTP 201 | 함수 3(`trip_draft_apply`·`trip_draft_merge_guest`·`trip_draft_item_key`) · anon/authenticated 실행 불가 |
| 5 | 20:13:57 | 파기 cron **비활성 선등록** | `e239271c24bb3d8e122537f234f52e70557744fdfbbc891e5aa5b941ba0ce86f` | HTTP 201 | jobid 4 `gokoreamate-retention-purge-daily-v1` `27 18 * * *` **active=false** |
| 6 | 20:14:09 | 082_retention_purge_daily | `177ee1276663ea2121a6a86ca58f004d73abe12d3ada3853bee5c692d61a1497` | HTTP 201 | pg_net 1 · **jobid 4 그대로 active=false** · cron 3 · 원장 테이블 행 0 · 파기 함수 anon/authenticated 실행 불가 · 신고 9·문의 2 |
| 7 | 20:14:22 | 083_retention_purge_activation_gate | `e7deba3c017a64f60d5d876b0782557132fdb76e16018cb29524543ee1bebf0a` | HTTP 201 | 파기 함수에 관문(`blocked_no_alert`·`retention_purge_settings`) · 설정 행 0 · 대조 작업 등록(jobid 5) · 파기 작업 여전히 active=false · 관문 함수 5 · anon 활성화 불가 |
| 8 | 20:15:06 | 관문 확인 후 cron 예정 등록(enable SQL) | `a04113b6d72ec18b671206fa9bdd3631931cc49445b5b7d5c530506da02947b7` | HTTP 201 | 사전 관문 확인 true·설정 행 0 → cron 4개 모두 active(파기 03:27 KST, 대조 03:57 KST) |
| 9 | 20:15 | `select public.retention_purge_daily();` 1회(실행안 검증) | — | run_id 1 | `inactive` · 신고·문의 삭제 0 · 알림·probe 요청 없음 · net 대기열 0 |
| 10 | 20:16 | 알림 키·URL | — | Pages PATCH 200 · Vault 201×2 | Production secret `RETENTION_ALERT_KEY` 존재(환경변수 24→25, 다른 24개 이름 유지, Preview 무변경) · Vault `retention_alert_key`·`retention_alert_url` 존재 · `retention_alert_configured()` = true · 새 배포 발생 0 |

- 10 전 확인: Pages 프로젝트 PATCH 가 환경변수를 **병합**하는지 Preview 에 무해한 평문 변수로 먼저 실측(13→14→13, 다른 이름 유지, Production 무변경, 배포 0) 후 Production 에 적용. 키는 로컬 임시 파일(64 hex)로 만들어 두 곳에 넣고 즉시 삭제.

## 적용 후(20:16 KST)

| 항목 | 값 |
|---|---|
| 데이터(불변) | auth.users 0 · 신고 9 · 문의 2 · 여행 89 · 기록 8 · 나의 장소 10 · 저장 42 · city_spots 5015/공개 4647 · 신고·문의 지문 md5 **동일** |
| 객체 | 077~080·082·083 생성, city_spots 정책 1건 그대로 |
| pg_net | 1(신규) — 요청 대기열 0·응답 0 |
| cron | 4 모두 active: 1 place-usage · 2 cron-history · **4 retention-purge-daily(03:27 KST)** · **5 retention-alert-reconcile(03:57 KST)** |
| 파기 활성화 | **설정 행 0 · effective_from 없음** → 매일 `inactive` 만 기록, 삭제·네트워크 호출 없음 |
| Vault | 2(이름만 기록) |
| 환경변수 | Production 25(`RETENTION_ALERT_KEY` 추가), Preview 13 |
| 코드 | master `3390b12d` · Production 배포 `05b889b3` · Auth `0490cc75` 그대로 |

## 다음(코드 배포 승인 후에만)

실행안 D-4(시행일 한 줄 → Preview → master fast-forward) → D-5a selftest(202 = 발송 서비스 수락) → D-5b Owner 실수신 → D-5c `retention_purge_activate(시행일)`. 오늘 밤 03:27·03:57 작업은 `inactive` 기록·응답 대조만 한다(알림 엔드포인트는 아직 Production 에 없다).

## 코드 배포와 파기 활성화 (AUTH-PRODUCTION-CODE-RELEASE-V1)

| 시각(KST) | 단계 | 결과 |
|---|---|---|
| 20:22 | 배포 직전 대조 | master `3390b12d` · Production `05b889b3` · Auth `eeec2eb3` · DB 기준과 동일 · GA 두 동의 코드 master 와 동일 |
| 20:23 | 시행일 커밋 `7c7e623b` | `LEGAL_EFFECTIVE_DATE = "2026-09-29"` 한 줄 · 가드 95/95 · 앱 tsc 0 · Functions tsc 16(기존) |
| 20:25 | Preview `aab8bb95` | 4개 언어 DRAFT·OWNER INPUT 0 · 시행일 2026-09-29 · 버전 `legal-2026-09-29-v1`·`age-14-2026-09-29-v1` · Staging 합성 계정 흐름 PASS·잔여 0 |
| 20:26 | master fast-forward `3390b12d`→`7c7e623b` → Production 배포 `4cc1a4de` 성공 | 소스 커밋 일치 |
| 20:29 | 배포 직후 확인 | 페이지·API·거부 경로·GA 동의 전/거부 0·문서 4개 언어 정상 · DB 스냅숏 차이 0 |
| 20:30:59 | 시험 메일 1회(`retention_alert_selftest`) | 발송 서비스 **수락** 202 `{"accepted":true,"sent":true}` |
| 20:31 | Owner 운영자 메일함 **실수신** 확인(받은편지함, 발신 noreply@gokoreamate.com, 제목 `[gokoreamate Ops] Retention alert test`) | Owner 화면 캡처로 확인 |
| 20:41 | 활성화 전 재확인 | 파기 대상 문의 0·신고 0 · 알림 설정 true · selftest 202·1시간 이내 · 관문 있음 · cron 4 활성 · 배포·health 정상 |
| 20:41:55 | `retention_purge_activate('2026-09-29')` | effective_from 2026-09-29 · activated · alert_verified · health 200 `scheduled` · 신고 9·문의 2 불변 |

첫 실제 실행: 2026-09-30 03:27 KST(대상 0건 예상 — 첫 기한 2026-12-14). 외부 상태 감시: **미설정**.

## 파기 활성화 관문 기록 보강 (RETENTION-ACTIVATION-AND-GA-CONSENT-UX-REWORK-V1)

- **실수신 증거**: Owner 가 운영자 받은편지함에서 `[gokoreamate Ops] Retention alert test`(발신 noreply@gokoreamate.com, 2026-09-29 20:31 KST 도착)를 직접 확인하고 화면을 제공했다. 발송 서비스 202(수락, 20:30:59)와 별개의 **실수신** 증거다.
- 활성화는 이미 20:41:56 KST 에 1회 실행됨(시험 메일 후 1시간 이내, 직전 재확인 전항 정상·대상 0). 재실행하지 않았다(재실행은 활성화 시각만 덮어쓴다).
- 21:04 KST 재대조: 배포 `4cc1a4de` · 관문 함수 · cron 4 활성 · 알림 설정 true · effective_from 2026-09-29 · activated · alert_verified · `/api/health/retention` 200 `scheduled` · 오늘 기준 파기 대상 문의 0·신고 0 · 신고 9·문의 2 불변.
- **첫 예약 실행 전**: 실행 기록은 20:15 수동 검증 1건(`inactive`)뿐. 첫 예약 실행 = 2026-09-30 03:27 KST(파기) · 03:57 KST(대조). **실행 후 결과는 아직 없음** — 다음 확인 때 `retention_purge_runs` 로 기록한다.
- **외부 상태 감시: 미설정.**

## 첫 방문 동의 흐름 개편·운영 감시 (FIRST-VISIT-CONSENT-UX-AND-RETENTION-OPERATIONS-CLOSEOUT-V1)

- 첫 방문 안내(PreOpenNotice)의 역할: Owner 확정 데이터 초기화 안내(PRELAUNCH-DATA-NOTICE V1) — 필수 안내로 보존. Home 에서 브라우저 세션마다 1회(sessionStorage), 다른 곳에서 다시 읽는 경로는 없다.
- 개편(master `ecc5bf01`, Production 배포 `049a5a50`, 2026-09-29 21:59 KST): 통계 선택을 안내 **안의 한 구역**으로 통합(스크롤 밖에 항상 보임). 타이머·화면 이동 후 카드 폐기. 안내가 없는 화면으로 들어온 경우에만 들어온 그 화면에서 카드 1개. 보여 준 순간 '이번 세션에 물었음'(전체 새로고침으로 떠나도 다시 묻지 않음). 법적 고지·동의 버전·저장값 무변경.
- 안전 Preview: `preview-ga-fakeid-v3.korea-mate.pages.dev`(직접 업로드, staging 빌드, 가짜 측정 ID `G-TESTCONSENT1` — Production 속성 `G-C0NG56EH5Q` 문자열 0건 확인). 시험에서 gtag.js 는 로컬 사본·수집 요청은 로컬 204(Google 전달 0).
- 외부 상태 감시: GitHub Actions `Retention Health Monitor`(매시 17분 UTC, `/api/health/retention` 200·정상 상태가 아니면 실패 → GitHub 실패 알림). 수동 정상 실행 PASS(22:00 KST 전, HTTP 200 scheduled), 강제 실패 실행 22:00:27 KST(알림 경로 시험) — **GitHub 알림 수신은 Owner 확인 대기**. 공개 저장소 예약 워크플로는 저장소 활동이 60일 없으면 GitHub 가 멈춘다.
- **정정**: 20:44 KST 에 생성된 Production 계정(google, `legal-2026-09-29-v1`, 기기 1, 여행 1, 저장 +2)은 **소유자 미확인 실계정**이다. Owner 확인 전에는 Owner 계정으로 단정하지 않으며, 시험 데이터로 취급하거나 수정·삭제하지 않는다.
- 파기 첫 예약 실행(2026-09-30 03:27 KST)·대조(03:57): **미실측** — 실행 후 확인 SQL: `select id, status, reports_deleted, inquiries_deleted, alert_http_status, probe_http_status, run_at at time zone 'Asia/Seoul' from public.retention_purge_runs order by id;` · 신고 9·문의 2 보존 · `/api/health/retention` 200.
