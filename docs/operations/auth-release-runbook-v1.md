# Auth + Legal + 보관 파기 Production 출시 런북 (ROLLOUT-SAFETY-V1 개정)

> 실행은 Owner 승인 후에만. 준비 완료 판정과 Production 적용 승인은 별개다.
> 순서: **DB(비활성 설치) → 알림 키 → 코드(master merge = 자동 Production 배포) → 알림 시험 → 파기 활성화**.
> 081 은 Production 기적용(2026-09-27) — **재실행 금지**. 어떤 단계에서도 081 의 구정책(`USING (true)`)으로 되돌리지 않는다.
> 비밀값(내부 키·Vault 값)은 화면·로그·문서·대화 어디에도 출력하지 않는다.

## 0. Owner 입력(출시 전 확정)

| 입력 | 들어가는 곳 |
|---|---|
| 운영 법인명(개인정보 처리 주체)·주소 | 처리방침 제1조, 약관 운영 주체 |
| 개인정보 보호책임자 성명 또는 담당 부서, 전화번호 등 연락처 | 처리방침 제1조(법 제30조①6) |
| 개인정보 요청 수신 이메일(실제 수신 확인된 주소) | 처리방침 제12·16조, 약관 문의처 |
| 미성년자 정책 문안(만 14세 로그인 연령 확인은 구현됨) | 처리방침 제13조 |
| 인프라 로그·백업 보관기간(Cloudflare·Supabase 설정 확인) | 처리방침 제11조 |
| 법률 검토 결과: 관할, 위탁·국외 이전 고지 항목(법 제28조의8②), 신고 키 식별성 | 약관 제14조, 처리방침 제7조 |
| 시행일 = 5단계를 실행하는 날(KST) | `LEGAL_EFFECTIVE_DATE` 한 줄 |

## 1. 사전 확인과 중단 기준(읽기 전용)

| 확인 | 기대값 | 다르면 |
|---|---|---|
| master | `1d3334fd` 이후 Auth 브랜치 외 변경 없음(있으면 merge 충돌 해소 목록 재확인) | 중단 |
| Production DB | 081 정책 `anon_authenticated_read_published_city_spots` 1건, 077~080·082·083 객체 없음, pg_net 미설치, cron 2개 | 중단·원인 확인 |
| 파기 예상 | `retention-operations-v1.md` §5 쿼리를 시행일 기준으로 재계산 → **시행일 첫 실행 대상 0건** | 대상이 있으면 답변·보관 예외 처리 전까지 중단 |
| 실행 시각 | KST 03:10~03:40 을 피한다(03:27 파기, 03:57 대조) | 시각 조정 |
| Owner 입력 | 0단계 전 항목 확정, 처리방침·약관에 `ownerInput` 0 | 2단계 이후 진행 금지 |

## 2. Production DB — 비활성 설치(Management API 또는 SQL Editor)

파일은 `git show <Auth 커밋>:supabase/migrations/<파일>` 로 추출해 sha256 을 대조한 뒤 적용한다.

| 순서 | 파일 | git 원본 sha256 | 적용 후 확인 |
|---|---|---|---|
| 0 | 081_city_spots_published_read_rls | `7aa68b9dc9ca2f4abe2e01a4f06f2d46edb1b4707629d81508f86001b8fbdf5e` | **확인만(재실행 금지)** |
| 1 | 077_user_consents | `429041d9ca691bfc8a5cf5df40a7db97ad960d2064a07a92f04020ff106c0db1` | `user_consents` |
| 2 | 078_account_devices | `0411951c30d18680bea0d2c443a0c36a4aa1ff632ffb2cd543e54c0d6cfa59fe` | `account_devices`, `link_device_to_account` |
| 3 | 079_trip_drafts | `ca57871d09eec9f24da690252258499ac96a5f083012561933f544acd08e8428` | `trip_drafts` |
| 4 | 080_trip_draft_operations | `b03b810c9c1caced01d7efff1324e6ce72e774d0c582781db74452ff26899c2e` | `trip_draft_apply`, `trip_draft_merge_guest` |
| 5 | 082_retention_purge_daily **+** 083_retention_purge_activation_gate | 082 `177ee1276663ea2121a6a86ca58f004d73abe12d3ada3853bee5c692d61a1497` · 083 `e7deba3c017a64f60d5d876b0782557132fdb76e16018cb29524543ee1bebf0a` | 아래 |

- **082 와 083 은 한 요청으로 이어서 적용한다**(082 → 083 순, 두 파일을 이어 붙인 본문 1회). 082 만 적용된 채로 KST 03:27 을 넘기면 관문 없는 파기가 한 번 돈다.
- **082 는 Production 에 `pg_net` 확장을 새로 설치한다**(Staging 0.20.4). DB 가 외부 HTTP 요청을 보낼 수 있게 되는 변경이며, 호출하는 함수는 anon·authenticated 실행 권한이 없다.
- 5단계 확인: pg_net 설치, `retention_purge_runs`·`retention_purge_settings` 존재, cron 4개(기존 2 + `gokoreamate-retention-purge-daily-v1` 03:27 + `gokoreamate-retention-alert-reconcile-v1` 03:57), 설정 행 0, `select public.retention_purge_daily();` 1회 → 원장 `inactive`, 삭제 0, 신고 9·문의 2 불변.
- 이 상태에서 코드 배포가 늦어지거나 실패해도 매일 `inactive` 1행만 쌓이고 아무것도 지우지 않는다. 알림 엔드포인트 호출도 없다.

## 3. 알림 키와 Vault(값 출력 금지)

Cloudflare Pages 의 secret 은 저장 후 읽을 수 없다. 기존 Production `INTERNAL_KEY` 값을 지금 손에 가진 사람이 없으면 A 가 불가능하므로 B 를 쓴다.

- **A. 기존 `INTERNAL_KEY` 사용**: 값을 가진 사람이 로컬 셸 변수에만 담아 `select vault.create_secret(<값>, 'retention_alert_key');` 를 실행한다. 검증은 4단계 이후 probe 로만 한다(401 이면 불일치).
- **B. 전용 키(권장)**: 로컬에서 무작위 값을 셸 변수로 만들고(출력하지 않음) 같은 변수로 ① Cloudflare Pages **Production** secret `RETENTION_ALERT_KEY` 추가 ② `vault.create_secret(<같은 변수>, 'retention_alert_key')` 를 실행한 뒤 변수를 지운다. 엔드포인트는 `RETENTION_ALERT_KEY` 가 있으면 그것만 받는다. **4단계 merge 전에** 설정해야 새 배포가 읽는다. 기존 Worker 의 `INTERNAL_KEY` 는 건드리지 않는다.
- URL: `select vault.create_secret('https://gokoreamate.com/api/internal/retention-alert', 'retention_alert_url');`
- 확인은 이름·존재만: `select name from vault.secrets where name like 'retention_alert_%';` → 2행. `select public.retention_alert_configured();` → true.
- Vault 를 채워도 설정 행이 없으므로 파기는 여전히 `inactive` 다.

## 4. 코드 — 시행일·고유 정보 반영 후 master 합류(자동 Production 배포)

1. Auth 브랜치 커밋 1개: `src/lib/auth/consent-contract.ts` 의 `LEGAL_EFFECTIVE_DATE = "YYYY-MM-DD"`(5단계 실행일) + 처리방침·약관 `ownerInput` 전부 확정 값으로 치환(4locale).
2. 가드: legal-content·retention·consent-activation·account-device-linking·i18n·durability — 전부 통과.
3. Preview 에서 4locale `/privacy`·`/terms`(DRAFT 배너 없음·시행일 표시)와 합성 계정 재동의 1회.
4. master merge → GitHub 연동이 Production 을 자동 빌드·배포(Legal 게시·정식 동의 버전·Auth 코드·알림 엔드포인트가 한 번에 나간다). 빌드가 next/font 일시 오류로 실패하면 같은 커밋으로 재시도한다.
5. 배포 완료 전까지 DB 는 `inactive` — 2단계 설명과 같다.

## 5. 알림 시험과 파기 활성화(시행일 당일, 배포 확인 후)

1. `select public.retention_alert_selftest();` → 운영자에게 시험 메일 1통 요청.
2. 10초 뒤 `select status_code, content from net._http_response where id = <1의 반환값>;`
   - 202 `{"accepted":true,"sent":true}` = 발송 서비스 수락 → 3으로.
   - 401 = 키 불일치(3단계 재확인) · 502 `not_configured`/`provider_error`/`network_error` = 메일 설정·발송 서비스 문제 · 404/405 = 엔드포인트 미배포 → 원인을 고치고 1부터.
3. **Owner 가 운영자 메일함에서 "[gokoreamate Ops] Retention alert test" 수신을 확인**(스팸함 포함). 미수신이면 활성화하지 않는다.
4. `select public.retention_purge_activate('<LEGAL_EFFECTIVE_DATE>'::date);` — selftest 가 1시간 안에 202 가 아니면 거부된다.
5. `select * from public.retention_purge_settings;` → 시행일·activated_at·alert_verified_at 채워짐.

## 6. 출시 직후 최소 확인

- 로그인 → 동의 시트 → 활성(시행일 버전) · This Trip 1건 계정 귀속 · My Trips 목록.
- 계정 삭제 게이트: 게스트 intent 403, 무세션 delete 401. **실계정 삭제 버튼은 누르지 않는다.**
- `/privacy`·`/terms` 4locale: DRAFT 배너 없음, 시행일 표시.
- 문의 1건 제출 → 운영자 알림 메일에 원문이 없고 관리자 화면에서 열리는지.
- 다음 날: 원장에 `ok` 1행(삭제 0 — §1 재계산 기준), `probe_http_status = 200`(03:57 대조 후), cron 4개 `succeeded`.
- 1주 후: 원장에 `blocked_*`·`failed` 없음.

## 7. 실패 시(전방 수정만)

| 단계 | 멈출 것 | 전방 수정 |
|---|---|---|
| 2 DB | 다음 migration | 원인 수정 후 같은 파일 재실행(각 파일 멱등). 082 만 들어가고 083 이 실패했다면 03:27 전에 083 을 반드시 마친다 — 못 마치면 `select cron.alter_job((select jobid from cron.job where jobname='gokoreamate-retention-purge-daily-v1'), active := false);` 로 그 작업만 일시 정지하고 083 적용 후 `active := true` |
| 3 Vault | 4단계 | 값 재등록(`vault.update_secret`). 값은 출력하지 않는다 |
| 4 코드 | 5단계 | 빌드 실패는 재시도. 배포 후 장애는 직전 Production 배포로 되돌리되 DB 는 되돌리지 않는다(구 코드는 새 테이블을 쓰지 않아 공존). 되돌린 동안 파기는 활성화하지 않는다 |
| 5 활성화 | 활성화 | selftest 실패 원인 수정 후 재시도. 활성 후 알림 경로가 끊기면 083 이 스스로 `blocked_*` 로 파기를 멈추고 probe 로 복구를 기다린다 |
| 운영 중 | — | 파기 기준(6개월)·관문을 끄거나 우회하는 수정은 하지 않는다. 문의 보관 예외는 관리자 API 의 사유·검토일 절차로만 |
