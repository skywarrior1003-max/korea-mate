# Auth Production 실행안 — 최종 (AUTH-PRODUCTION-RELEASE-CANDIDATE-FINAL-PREFLIGHT-V1, 2026-09-29)

> 이 문서는 **실행 자료**다. 실행은 Owner 의 두 승인(① DB ② 코드 배포) 뒤에만 한다. 이 TASK 에서는 아무것도 실행하지 않았다.
> 비밀값(키·Vault 값·메일 주소)은 어디에도 출력·기록하지 않는다. 081 은 **재실행 금지**, `USING (true)` 복원 금지.
> 상세 배경·실패 조치 원문: `auth-release-runbook-v1.md`(B·D·F). 이 문서가 순서·SQL·중단 조건의 최종 기준이다.

## 0. 기준값(2026-09-29 19:30 KST 실측)

| 항목 | 값 |
|---|---|
| master = Production | `3390b12d` = 배포 `05b889b3`(GA 동의판) |
| Auth 후보 | `feature/device-account-linking-security-v1`@`f64a3688`(master 를 조상으로 포함 → merge 는 fast-forward), Preview `f2f3bd7f`(시행일 null, DRAFT) |
| 시행일 검증용 | `preview/auth-rc-legal-date-check`@`b3885324`(후보 2026-10-01, **master 합류 금지**), Preview `0ee998ef` |
| Production DB | 081 정책 1건(`anon_authenticated_read_published_city_spots`, `is_published = true`) · 077~080·082·083 객체 없음 · pg_net 없음 · pg_cron 있음·작업 2 · Vault 0 · auth.users 0 · 신고 9 · 문의 2 |
| Production 환경변수 | 24개. 있음: ADMIN_KEY·INTERNAL_KEY·RESEND_API_KEY·ADMIN_NOTIFICATION_EMAIL·CONTACT_FROM_EMAIL·MYTRIP_HASH_SECRET(모두 secret). 없음: RETENTION_ALERT_KEY |

## 1. 실행 파일 — git 원본 SHA-256

추출: `git show f64a3688:<경로> > /tmp/<파일>` → `sha256sum` 대조(작업 트리의 줄바꿈 변환본을 쓰지 않는다).

| 파일 | SHA-256(git blob 내용) |
|---|---|
| `supabase/migrations/081_city_spots_published_read_rls.sql` | `7aa68b9dc9ca2f4abe2e01a4f06f2d46edb1b4707629d81508f86001b8fbdf5e` (**실행 안 함**) |
| `supabase/migrations/077_user_consents.sql` | `429041d9ca691bfc8a5cf5df40a7db97ad960d2064a07a92f04020ff106c0db1` |
| `supabase/migrations/078_account_devices.sql` | `0411951c30d18680bea0d2c443a0c36a4aa1ff632ffb2cd543e54c0d6cfa59fe` |
| `supabase/migrations/079_trip_drafts.sql` | `ca57871d09eec9f24da690252258499ac96a5f083012561933f544acd08e8428` |
| `supabase/migrations/080_trip_draft_operations.sql` | `b03b810c9c1caced01d7efff1324e6ce72e774d0c582781db74452ff26899c2e` |
| `docs/operations/sql/retention-cron-prestage-inactive.sql` | `e239271c24bb3d8e122537f234f52e70557744fdfbbc891e5aa5b941ba0ce86f` |
| `supabase/migrations/082_retention_purge_daily.sql` | `177ee1276663ea2121a6a86ca58f004d73abe12d3ada3853bee5c692d61a1497` |
| `supabase/migrations/083_retention_purge_activation_gate.sql` | `e7deba3c017a64f60d5d876b0782557132fdb76e16018cb29524543ee1bebf0a` |
| `docs/operations/sql/retention-cron-enable-after-083.sql` | `a04113b6d72ec18b671206fa9bdd3631931cc49445b5b7d5c530506da02947b7` |

## 2. 승인 ① — Production DB (각 행은 **별도 요청**, 확인 후 다음 행)

시각: KST 02:30~04:30 을 피한다(03:27 파기·03:57 대조 일정). 권장 10:00~17:00.

| # | 실행 | 적용 전 확인 SQL(기대값) | 적용 후 확인 SQL(기대값) | 중단 조건 |
|---|---|---|---|---|
| 0 | 081 **확인만** | `select policyname, qual from pg_policies where schemaname='public' and tablename='city_spots';` → 1행 `anon_authenticated_read_published_city_spots`, `(is_published = true)` | — | 다르면 전체 중단(081 재실행 금지) |
| 1 | 077 | `select to_regclass('public.user_consents');` → null | `select c.relrowsecurity, has_table_privilege('anon','public.user_consents','select') anon_sel from pg_class c where c.oid='public.user_consents'::regclass;` → `true`, `false` | 오류 시 077 원인 수정·재실행(멱등). 다음 행 금지 |
| 2 | 078 | `select to_regclass('public.account_devices');` → null | `select to_regclass('public.account_devices') is not null t, has_function_privilege('anon','public.link_device_to_account(uuid,uuid)','execute') anon_exec;` → `true`, `false` | 같음 |
| 3 | 079 | `select to_regclass('public.trip_drafts');` → null | `select c.relrowsecurity, has_table_privilege('anon','public.trip_drafts','select') from pg_class c where c.oid='public.trip_drafts'::regclass;` → `true`, `false` | 같음 |
| 4 | 080 | `select count(*) from pg_proc where proname in ('trip_draft_apply','trip_draft_merge_guest');` → 0 | 같은 쿼리 → 2, `has_function_privilege('anon','public.trip_draft_merge_guest(uuid,uuid)','execute')` → false | 같음 |
| 5 | 파기 작업 **비활성 선등록**(prestage SQL) | `select count(*) from cron.job where jobname like 'gokoreamate-retention-%';` → 0 | `select jobid, schedule, command, active from cron.job where jobname='gokoreamate-retention-purge-daily-v1';` → 1행, `27 18 * * *`, `active=false` | active 가 true 면 `cron.alter_job(<jobid>, active := false)` 후 중단 |
| 6 | 082 | 5의 결과가 `active=false` | ① `select count(*) from pg_extension where extname='pg_net';` → 1 ② 5와 같은 쿼리 → **같은 jobid·active=false** ③ `select to_regclass('public.retention_purge_runs') is not null;` → true | ②가 true 면 즉시 `cron.alter_job(<jobid>, active := false)` → 중단. **`retention_purge_daily()` 수동 호출 금지**(082 판은 관문 없음) |
| 7 | 083 | 6 완료 | `select to_regclass('public.retention_purge_settings') is not null, (select count(*) from public.retention_purge_settings) rows, (select count(*) from cron.job where jobname='gokoreamate-retention-alert-reconcile-v1') reconcile;` → true, 0, 1 | 083 실패 시 8 금지. 파기 작업은 비활성으로 남는다(아래 3절 증명). 원인 수정 후 083 만 재적용 |
| 8 | enable SQL(관문 확인 후 **작업 예정 상태로 켜기**) | `select position('blocked_no_alert' in pg_get_functiondef('public.retention_purge_daily()'::regprocedure)) > 0;` → true | `select jobname, active from cron.job where jobname like 'gokoreamate-retention-%' order by 1;` → 2행 모두 true, `select count(*) from cron.job;` → 4 | `gate_missing` 이면 083 미적용 — 7로 |
| 9 | `select public.retention_purge_daily();` 1회 | — | `select status, reports_deleted, inquiries_deleted from public.retention_purge_runs order by id desc limit 1;` → `inactive`, 0, 0 · 신고 9·문의 2 불변 | 삭제가 1건이라도 있으면 즉시 작업 비활성·중단 |

- **8은 '작업을 켜는 것'이지 '파기 활성화'가 아니다.** 설정 행(`retention_purge_activate`)이 없으면 매일 `inactive` 만 기록하고 지우지 않는다. 파기 활성화는 4절 D-5 에서만.
- 증가: pg_net 확장 0→1(DB 가 외부 HTTP 요청 가능 — 호출 함수는 anon·authenticated 실행 불가), cron 작업 2→4(`gokoreamate-retention-purge-daily-v1` KST 03:27, `gokoreamate-retention-alert-reconcile-v1` KST 03:57).

### 알림 키·주소(승인 ①의 마지막, 값 출력 금지)

| 항목 | 설정 위치 | 확인 |
|---|---|---|
| 전용 키 `RETENTION_ALERT_KEY` | 로컬 셸 변수에 무작위 값 생성 → ① Cloudflare Pages **Production** secret ② `select vault.create_secret(<같은 값>, 'retention_alert_key');` → 셸 변수 삭제 | `select name from vault.secrets where name like 'retention_alert_%';` |
| 알림 URL | `select vault.create_secret('https://gokoreamate.com/api/internal/retention-alert', 'retention_alert_url');` | 위 쿼리 2행, `select public.retention_alert_configured();` → true |
| 수신 메일함 | 기존 Production `ADMIN_NOTIFICATION_EMAIL`(설정됨) | D-5 실제 수신으로 확인 |

- Pages secret 추가는 **Production 환경변수 변경**(24→25)이다. 새 값은 다음 배포부터 읽히므로 **코드 배포(승인 ②) 전에** 넣는다.

## 3. 082 만 적용된 상태가 안전하다는 증명(Staging, 2026-09-29)

| 단계 | 결과 |
|---|---|
| Production prestage SQL 과 같은 형태로 전용 작업(매분 일정, 무해한 기록 명령) 비활성 선등록 | jobid 7, `active=false` |
| 082 의 스케줄 블록을 그대로(이름·명령만 대체) 실행 | **같은 jobid 7, `active=false` 유지** |
| 190초 대기(매분 일정 3회 경과) | 실행 기록 0·기록 행 0·`active=false` |
| 대조군: 활성화 후 130초 | 실행 기록 2·기록 행 2 — 켜져 있었다면 실행됐음 |
| 정리 | 시험 작업 0·시험 테이블 삭제·Staging 작업 수 원래대로 4 |

→ 5·6 순서를 지키면 082 가 적용된 채 083 이 실패해도 **시간이 지나도 파기 함수는 불리지 않는다**(비활성 작업은 pg_cron 이 실행하지 않음 + 082 블록이 비활성 작업을 건드리지 않음). anon·authenticated 는 함수를 직접 부를 수 없다.

## 4. 승인 ② — 코드 배포와 파기 활성화

| # | 실행 | 확인 | 중단 조건 |
|---|---|---|---|
| D-4a | Auth 브랜치에 커밋 1개: `src/lib/auth/consent-contract.ts` 의 `LEGAL_EFFECTIVE_DATE: string \| null = null;` → `= "<배포일 KST>";` **이 한 줄만**(예상 diff = `b3885324` 의 diff 와 같음) | 가드 전체 통과(시행일 있는 상태에서도 95/95 — 2026-10-01 로 실측), Preview 에서 4개 언어 `/privacy/`·`/terms/` DRAFT·OWNER INPUT 0·시행일 표시, 합성 계정 재동의 1회(`legal-<날짜>-v1`·`age-14-<날짜>-v1`) | 하나라도 다르면 merge 금지 |
| D-4b | `git push origin feature/device-account-linking-security-v1:master`(fast-forward) → **GitHub 연동이 Production 을 자동 빌드·배포** | Cloudflare Production 배포 성공·소스 커밋 일치 | 빌드 실패: 같은 커밋 재시도. 장애: 직전 배포(`05b889b3`, GA 동의판)로 되돌림 — **그 이전(`e0c1fc05`)으로는 되돌리지 않는다**(무동의 GA). DB 는 되돌리지 않는다(구 코드는 새 테이블을 쓰지 않아 공존) |
| D-5a | `select public.retention_alert_selftest();` → 요청 id 기록 → 10초 뒤 `select status_code, content from net._http_response where id = <id>;` | **202 `{"accepted":true,"sent":true}` = 발송 서비스 수락**(수신 확인 아님)을 원장에 기록 | 401 키·502 메일 설정·404/405 미배포 → 수정 후 재시도. 파기는 `inactive` 유지 |
| D-5b | **Owner 가 운영자 메일함에서 "[gokoreamate Ops] Retention alert test" 수신 확인**(10분, 스팸함 포함) → 수신 시각을 원장에 기록 | Owner 답 | **미수신이면 활성화하지 않는다** — 파기는 계속 `inactive` |
| D-5c | `select public.retention_purge_activate('<시행일>'::date);` | `select effective_from, activated_at is not null from public.retention_purge_settings;` | selftest 가 1시간 안에 202 가 아니면 함수가 거부 |
| D-6 | 출시 직후 확인(아래 5절) | | |

## 5. 출시 직후 확인(D-6) — Owner 실계정의 빨간 [영구 삭제] 버튼은 누르지 않는다

| 확인 | 방법·기대값 |
|---|---|
| 게스트 | 새 시크릿 창: 둘러보기·여행 만들기 정상, 로그인 요구 없음 |
| GA 동의 유지 | 첫 방문 GA 요청 0 · 두 동의 후에만 `/g/collect`(GA 문서 §9 와 같은 절차 — 반복 시험은 1회만) |
| 로그인·동의 | More → Google 로그인 → 동의 시트(체크 3개 전까지 진행 불가) → 활성 → `/api/auth/status` versions = `legal-<시행일>-v1` |
| This Trip / My Trips | 로그인 후 This Trip 항목 1개 → 다른 기기(또는 새 창)에서 같은 계정으로 보임 · My Trips 목록 |
| 삭제 게이트(안전한 거부만) | 게스트 `POST /api/account/delete-intent` → 403 · 세션 없는 `POST /api/account/delete` → 401 · `POST /api/admin/account-delete`(키 없음) → 401 |
| 파기 상태 | `https://gokoreamate.com/api/health/retention` → 200(`scheduled`/`ok`) |
| 문서 | `/privacy/`·`/terms/` 4개 언어 DRAFT 0·시행일 = 배포일 |

다음 날(KST 04:00 이후): `select run_at, status, reports_deleted, inquiries_deleted, alert_http_status, probe_http_status from public.retention_purge_runs order by id desc limit 3;` → `ok`·삭제 0·probe 200. 외부 감시(`/api/health/retention` 1시간 간격, 200 아니면 감시 서비스 자체 채널로 알림)는 runbook D-8.

## 6. 실패 시 어디서 멈추고 무엇이 비활성으로 남나

| 실패 지점 | 멈추는 곳 | 비활성으로 남는 것 | 서비스 영향 |
|---|---|---|---|
| 0(081 불일치) | 전체 | 전부 미적용 | 없음(현 Production 그대로) |
| 1~4(077~080) | 그 파일 | 파기 묶음 전체 미적용 | 없음 — 현 코드는 새 테이블을 쓰지 않는다 |
| 5(선등록) | 5 | 082·083 미적용 | 없음 |
| 6(082) | 6 | 파기 작업 **비활성**(3절 증명), 083 없음 | 없음 |
| 7(083) | 7 | 파기 작업 비활성, 관문 없는 082 함수는 **아무도 부르지 않음** | 없음 |
| 8(enable 거부) | 8 | 작업 비활성 | 없음 |
| 9(삭제 발생) | 즉시 작업 비활성 | — | 조사 후 재개 |
| 알림 키·URL | D-5 | 설정 행 없음 → 매일 `inactive`(켜진 작업이어도 삭제 0) | 없음 |
| D-4 빌드·장애 | D-5 | 파기 `inactive` | 되돌림은 `05b889b3` 까지만 |
| D-5 메일 미수신 | D-5c | 파기 `inactive` | 없음(문의·신고는 계속 보관 — 첫 기한 2026-12-14) |

## 7. 파기 대상(시행일 기준 재계산, 2026-09-29 읽기 전용)

| 대상 | 기준일 | 6개월 기한 | 성격 |
|---|---|---|---|
| 문의 `9eb34b23` | 접수 2026-06-14 | **2026-12-14** | 운영 시험 기록(관리자 메모 "테스트 문의") |
| 문의 `1c2e6e4d` | 접수 2026-09-26 | 2027-03-26 | 발송 감사 시험 기록 |
| 신고 9건(모두 종결) | 처리 완료 2026-08-08~08-18 | 2027-02-08 ~ 2027-02-18 | 운영 신고 |

→ 2026-12-14 이전 어떤 날에 출시해도 **출시일 기준 파기 대상 0건**. 출시일이 12-14 이후로 밀리면 D-1 에서 다시 계산한다.

## 8. Owner 실계정·Staging 데이터

Staging Owner 데이터(사용자 2·동의 1·기기 연결 3·draft 1 — 제주 draft 포함) 무접촉. 후보 시행일 Preview 에 Owner 가 로그인하면 재동의 화면이 뜬다(동의 기록 `preview-legal-v1` → 새 버전). Production 에는 계정이 0명이라 재동의 대상이 없다.
