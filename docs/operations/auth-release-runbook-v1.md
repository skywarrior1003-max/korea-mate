# Auth + Legal + 보관 파기 Production 출시 런북 (FINAL-RELEASE-GATES-V1 개정)

> 실행은 Owner 승인 후에만. 준비 완료 판정과 Production 적용 승인은 별개다.
> 081 은 Production 기적용(2026-09-27) — **재실행 금지**. 어떤 단계에서도 081 의 구정책(`USING (true)`)으로 되돌리지 않는다.
> 비밀값(내부 키·Vault 값·수신 주소)은 화면·로그·문서·대화 어디에도 출력하지 않는다.
> 기준 코드: Auth 브랜치 `feature/device-account-linking-security-v1` 의 최종 커밋(시행일 커밋 포함).

## A. Owner 결정표(출시 전 — 이것만 채우면 된다)

> 최신 대조 결과와 묶음 질문은 `auth-final-release-packet-v1.md` 가 기준이다(OWNER-INPUT-RECONCILIATION-V1).

| # | 필요한 값·결정 | 현재 확인된 것 | Owner 가 볼 증빙 | 들어가는 곳 |
|---|---|---|---|---|
| 1 | 개인정보 처리 주체 법인명·공개 주소 | 후보 둘: 09-26 Owner 제공 **개인사업자 케이이엔지**(부산 남구 주소 포함) / 09-28 언급 **(주)비유피**(Drive 문서 제목상 법인). 어느 쪽이 처리 주체인지 근거 없음 | 사업자등록증 또는 법인등기부(상호·주소), gokoreamate.com 도메인 등록자, Cloudflare·Supabase·Resend·Google 계정의 결제·계약 주체, 제휴사(Agoda·Trip.com·Klook·KKday) 계약 주체 — 모두 같은 법인이어야 한다 | 처리방침 제1조, 약관 운영 주체 |
| 2 | 개인정보 보호책임자 성명 또는 담당 부서, 전화번호 등 연락처(법 제30조①6) | 없음 | 내부 지정 | 처리방침 제1조 |
| 3 | 개인정보 요청 수신·회신 이메일 | **완료** — `sup***@gokoreamate.com`(09-26 Owner 제공, Email Routing 수신·Send-As·왕복 시험 완료 진술). 4locale 반영 | 없음 | 처리방침 제12·16조, 약관 제15조 |
| 4 | 국외 이전 고지 잔여 항목 | 제공사별 역할·위치·운영 법인·연락처는 공식 방침 기준으로 문안에 반영(제7조) | 각 제공사 계약서·DPA 의 계약 주체, Cloudflare 로그·Google Analytics 데이터 보유기간 설정, Resend 요금제 | 처리방침 제7조 마커 |
| 5 | 법률 검토: 국외 이전 근거(법 제28조의8①의 해당 호)와 이전 시기·방법·거부 방법 문구, 약관 관할(아래 C), 신고 키 식별성, 제13조의 법정대리인 동의 비적용 전제 | 문안 후보 준비 | 법률 검토 의견 | 처리방침 제7·13조, 약관 제14조 |
| 6 | 미성년자 문안 최종 확인(제13조) | 코드 동작과 일치하는 4locale 후보 게시(만 14세 자기 확인·연령 검증 없음·법정대리인 절차 없음·비로그인 이용 가능) | 문안 확인, 만 14세 미만 계정을 알게 된 경우 처리 방침 결정 | 처리방침 제13조 |
| 7 | 인프라 로그·백업 보관기간 | Supabase Production = 무료 요금제: API·DB 로그 1일, 자동 백업 없음(공식 가격표·API 확인) | Cloudflare 로그 보관 설정(Claude 확인 가능) | 처리방침 제11조 |
| 8 | 외부 가동 감시 등록 | 상태 확인 URL 구현(`/api/health/retention`) | 감시 서비스 계정(메일 발송 서비스와 다른 채널로 Owner 에게 알림) | 아래 D-8 |
| 9 | 시행일 | 출시일(KST) | — | `LEGAL_EFFECTIVE_DATE` 한 줄 — 동의 버전 3종이 같은 값에서 생성된다 |
| 10 | 시험 문의 2건 처리 | 둘 다 운영 시험 기록(답변 불필요) | 아래 E | 선택 |

## B. 파기 경로 요약(왜 이 순서인가)

- 082·083 은 각자 `BEGIN…COMMIT` 이 있는 **별도 트랜잭션**이다. 한 요청으로 이어 보내도 원자적이지 않다 — Staging 실측: 082+실패하는 083 을 한 요청으로 보내면 082 는 커밋되고, 관문 없는 082 함수와 **활성** cron 이 남았다.
- 그래서 **082 전에 파기 cron 을 비활성으로 먼저 만든다**(`retention-cron-prestage-inactive.sql`). 082 의 멱등 블록은 이름·시각·명령이 같은 작업을 건드리지 않으므로 비활성이 유지된다(실측: 같은 jobid·active=false 유지). 083 적용 후 `retention-cron-enable-after-083.sql` 이 함수 본문에 관문이 있는지 확인하고서만 켠다(실측: 083 실패 상태에서 거부, 083 후 성공).
- 켜진 뒤에도 083 관문 때문에 활성화 설정·알림 확인 전에는 지우지 않는다.
- **Production pg_net 신규 설치**(082) — DB 가 외부 HTTP 요청을 보낼 수 있게 된다. 호출 함수는 anon·authenticated 가 실행할 수 없다.
- **Production cron 작업 2 → 4**: `gokoreamate-retention-purge-daily-v1`(KST 03:27), `gokoreamate-retention-alert-reconcile-v1`(KST 03:57).

## C. 약관 관할 — 법률 검토 대상 문안

현재 약관 제14조는 "이 약관은 대한민국 법을 따릅니다" 와 관할 마커뿐이다. 특정 법원의 전속 관할은 넣지 않았다.

- **후보 1(법정 관할 — 권장 검토안)**: "서비스 이용과 관련하여 분쟁이 생긴 경우 민사소송법 등 관계 법령에 따른 관할 법원에 소를 제기할 수 있습니다." / EN "Any dispute arising from the use of the service may be brought before the court having jurisdiction under the Civil Procedure Act and other applicable laws of the Republic of Korea." / JA 「本サービスの利用に関して紛争が生じた場合、民事訴訟法その他の関係法令に定める管轄裁判所に訴えを提起することができます。」 / ZH「因使用本服务发生争议的，可依《民事诉讼法》等相关法律向有管辖权的法院提起诉讼。」
- **후보 2(운영 주체 소재지 법원)**: 소비자에게 불리한 재판관할 합의는 약관 규제 법령상 무효가 될 수 있어 법률 검토 없이 쓰지 않는다.

## D. 출시 당일 — 시간 순서

### D-1. 사전 확인(읽기 전용) — 하나라도 다르면 중단

| 확인 | 기대값 |
|---|---|
| 시각 | KST **02:30~04:30 을 피한다**(03:27 파기·03:57 대조). 권장 10:00~17:00 |
| master·배포 | `1d3334fd`·`a007c7ac` 이후 변경 없음(있으면 Auth merge 충돌 목록 재확인) |
| DB | 081 정책 `anon_authenticated_read_published_city_spots` 1건, 077~083 객체 없음, pg_net 없음, cron 2개, `gokoreamate-retention-*` 작업 없음 |
| 파기 예상 | `retention-operations-v1.md` §5 쿼리를 **시행일 기준**으로 재계산 → 대상 0건(2026-09-28 기준 첫 대상 2026-12-14). 1건이라도 있으면 E 처리 전까지 중단 |
| Owner 결정표 A | 1~3·5~7·9 확정, 처리방침·약관 `ownerInput` 0 |

### D-2. DB 적용(Management API 또는 SQL Editor, 파일마다 **별도 실행**, 각 단계 확인 후 다음)

파일은 `git show <Auth 커밋>:<경로>` 로 추출해 sha256 을 대조한다.

| 순서 | 파일 | git 원본 sha256 | 적용 후 확인 |
|---|---|---|---|
| 0 | 081 | `7aa68b9dc9ca2f4abe2e01a4f06f2d46edb1b4707629d81508f86001b8fbdf5e` | **확인만** |
| 1 | 077_user_consents | `429041d9ca691bfc8a5cf5df40a7db97ad960d2064a07a92f04020ff106c0db1` | `user_consents` |
| 2 | 078_account_devices | `0411951c30d18680bea0d2c443a0c36a4aa1ff632ffb2cd543e54c0d6cfa59fe` | `account_devices`, `link_device_to_account` |
| 3 | 079_trip_drafts | `ca57871d09eec9f24da690252258499ac96a5f083012561933f544acd08e8428` | `trip_drafts` |
| 4 | 080_trip_draft_operations | `b03b810c9c1caced01d7efff1324e6ce72e774d0c582781db74452ff26899c2e` | `trip_draft_apply`, `trip_draft_merge_guest` |
| 5 | ops `retention-cron-prestage-inactive.sql` | `e239271c24bb3d8e122537f234f52e70557744fdfbbc891e5aa5b941ba0ce86f` | 작업 1개, `active=false` |
| 6 | 082_retention_purge_daily | `177ee1276663ea2121a6a86ca58f004d73abe12d3ada3853bee5c692d61a1497` | pg_net 설치, 같은 jobid 가 **여전히 active=false** — 아니면 즉시 `cron.alter_job(<jobid>, active := false)` 후 중단 |
| 7 | 083_retention_purge_activation_gate | `e7deba3c017a64f60d5d876b0782557132fdb76e16018cb29524543ee1bebf0a` | `retention_purge_settings` 존재, 설정 행 0, 대조 작업 등록 |
| 8 | ops `retention-cron-enable-after-083.sql` | `a04113b6d72ec18b671206fa9bdd3631931cc49445b5b7d5c530506da02947b7` | 파기 작업 active=true, cron 4개 |
| 9 | `select public.retention_purge_daily();` 1회 | — | 원장 `inactive`, 삭제 0, 신고·문의 수 불변 |

- **7에서 083 이 실패하면**: 8을 실행하지 않는다(실행해도 `gate_missing` 으로 거부된다). 파기 작업은 비활성이라 03:27 이 지나도 돌지 않는다. `select public.retention_purge_daily()` 를 **수동으로 부르지 않는다**(082 판은 관문이 없다). 원인을 고쳐 083 만 다시 적용하고 8로 간다. 당일 해결이 안 되면 작업은 비활성인 채로 두고 출시(D-4 이후)를 미룬다.
- **082 를 다시 실행해야 하면**: 먼저 파기 작업을 비활성으로 → 082 → 083 → 8. 083 뒤에 082 만 다시 돌리면 함수가 관문 없는 판으로 돌아간다.
- 077~080 실패는 그 파일만 원인 수정 후 재실행(멱등). 다음 단계로 가지 않는다.

### D-3. 알림 키·주소(값 출력 금지)

- 키: **B(권장)** 로컬 셸 변수로 무작위 값을 만들어 ① Cloudflare Pages Production secret `RETENTION_ALERT_KEY` ② `select vault.create_secret(<같은 변수>, 'retention_alert_key');` 에 넣고 변수를 지운다. Pages secret 은 읽을 수 없어 기존 `INTERNAL_KEY` 값을 옮길 수 없는 경우를 위한 것이며, Worker 의 키는 건드리지 않는다. **A** 기존 `INTERNAL_KEY` 값을 가진 사람이 있으면 그 값을 Vault 에 넣는다.
- URL: `select vault.create_secret('https://gokoreamate.com/api/internal/retention-alert', 'retention_alert_url');`
- 수신 주소: Production 의 `ADMIN_NOTIFICATION_EMAIL`(이미 설정됨)이 **Owner 가 실제로 여는 운영자 메일함**인지 Owner 가 Cloudflare 설정 화면에서 확인한다(값은 기록하지 않는다).
- 확인: `select name from vault.secrets where name like 'retention_alert_%';` → 2행, `select public.retention_alert_configured();` → true. 이 시점에도 설정 행이 없어 파기는 `inactive`.
- B 를 택했다면 **D-4 merge 전에** secret 을 넣어야 새 배포가 읽는다.

### D-4. 코드 — master 합류 = 자동 Production 배포

1. Auth 브랜치 커밋 1개: `LEGAL_EFFECTIVE_DATE = "<시행일>"` + 처리방침·약관 `ownerInput` 전부 확정 값으로(4locale).
2. 가드 통과: legal-content·retention·consent-activation·account-device-linking·i18n·durability.
3. Preview 확인: 4locale `/privacy/?lang=`·`/terms/?lang=` DRAFT 배너 없음·시행일 표시, 합성 계정 재동의 1회.
4. master merge → GitHub 연동이 Production 을 자동 빌드·배포한다(Legal 게시·정식 동의 버전·Auth 코드·알림·상태 확인 엔드포인트가 함께 나간다).
5. 중단 기준: 빌드 실패(next/font 일시 오류는 같은 커밋 재시도), Production 에 DRAFT 배너가 보이면 D-5 로 가지 않는다.

### D-5. 실제 메일 도착 확인 → 파기 활성화

1. `select public.retention_alert_selftest();` → 반환값(요청 id) 기록.
2. 10초 뒤 `select status_code, content from net._http_response where id = <id>;`
   - 202 `{"accepted":true,"sent":true}` = 발송 서비스 수락. **이것은 수신 확인이 아니다.**
   - 401 키 불일치(D-3) · 502 `not_configured`/`provider_error`/`network_error` 메일 설정·발송 서비스 · 404/405 엔드포인트 미배포 → 원인 수정 후 1부터.
3. **Owner 가 운영자 메일함에서 "[gokoreamate Ops] Retention alert test" 를 10분 안에 받았는지 확인**(스팸함 포함). 받지 못하면 **활성화하지 않는다** — 파기는 계속 `inactive` 로 안전하다.
4. `select public.retention_purge_activate('<시행일>'::date);` — selftest 가 1시간 안에 202 가 아니면 거부된다.
5. `select effective_from, activated_at is not null from public.retention_purge_settings;`

### D-6. 출시 직후 최소 확인

- 로그인 → 동의 시트(만 14세·약관·처리방침) → 활성(시행일 버전) → This Trip 1건 계정 귀속 → My Trips 목록.
- 게스트: 로그인 없이 둘러보기·여행 만들기 정상. 계정 삭제 게이트: 게스트 intent 403, 무세션 delete 401(실계정 삭제 버튼은 누르지 않는다).
- `https://gokoreamate.com/api/health/retention` → 200 `scheduled` 또는 `ok`.
- 문의 1건 제출 → 운영자 알림 메일에 이름·이메일·메시지가 없고 관리자 화면에서 열린다.

### D-7. 다음 날(KST 04:00 이후)

- `select run_at, status, reports_deleted, inquiries_deleted, alert, alert_http_status, probe_http_status from public.retention_purge_runs order by id desc limit 3;` → `ok`(삭제 0), `probe_http_status=200`.
- cron 4개 최근 실행 `succeeded`.

### D-8. 외부 가동 감시(메일 경로와 독립)

- 감시 서비스(예: 무료 가동 감시)가 `https://gokoreamate.com/api/health/retention` 을 1시간마다 호출하고, **200 이 아니면** 감시 서비스 자체 채널(앱 푸시·SMS·다른 메일 서비스)로 Owner 에게 알리게 한다. 응답은 상태 코드명뿐이다(건수·원문·설정값 없음, 60초 캐시).
- 503 상태별 조치: `blocked_no_alert`(Vault 값) · `blocked_alert_unverified`/`alert_path_unhealthy`(키·엔드포인트·메일 설정) · `reconcile_missing`(03:57 대조 작업) · `no_recent_run`(03:27 파기 작업·pg_cron) · `last_run_failed`(원장 error_code) · `alert_delivery_failed`(발송 서비스).
- 감시 등록 전까지는 주 1회 D-7 쿼리를 사람이 확인한다.

## E. Production 시험 문의 2건

읽기 전용 확인(2026-09-28): 두 건 모두 **실제 이용자 문의가 아니라 운영 시험 기록**이다 — 06-14 건은 관리자 메모가 "테스트 문의. 관리자 상태 변경 확인용.", 09-26 건은 연락 메일 발송 감사(CONTACT-AUDIT-20260926, "No response required"). 답변할 대상이 없다. 문의 알림 발송은 DB 원장에 기록되지 않아(원장은 신고 알림만) 외부 답장 여부는 DB 로 확인할 수 없지만, 시험 기록이라 답장이 필요 없다.

- 확인 경로: `https://gokoreamate.com/korea-mate-admin/inquiries/` → 접수일 2026-06-14·2026-09-26 행 → 상세.
- 선택 1(권장): Owner 승인 후 `docs/operations/sql/prod-test-inquiries-early-delete.sql` 로 두 행 삭제 + 운영자 메일함의 해당 알림 2통 삭제(원문 포함). 관리자 화면에는 삭제 기능이 없다.
- 선택 2: 상태를 `archived` 로 두고 자동 파기(2026-12-14·2027-03-26)에 맡긴다. 메일함 사본은 같은 날 수동 삭제.
- 실제 진행 중 문의가 6개월에 닿을 때만 보관 예외를 쓴다: 관리자 API `PATCH /api/admin/contact-inquiries` 의 `retentionHold: { until, reason, by }`(검토일 1년 이내·사유 5~500자). 시험 문의에는 쓰지 않는다.

## F. 실패 시 — 전방 수정만

| 상황 | 멈출 것 | 조치 |
|---|---|---|
| D-2 083 실패 | D-2-8 이후 | 작업 비활성 확인 → 083 재적용. 수동 파기 호출 금지 |
| D-2 082 후 작업이 active | 전부 | 즉시 `cron.alter_job(<jobid>, active := false)` → 083 → enable SQL |
| D-3 Vault 오류 | D-5 | `vault.update_secret` 로 재등록(값 출력 금지) |
| D-4 빌드 실패·장애 | D-5 | 재시도 또는 직전 Production 배포로 되돌림. DB 077~083 은 되돌리지 않는다(구 코드는 새 테이블을 쓰지 않아 공존). 되돌린 동안 파기를 활성화하지 않는다 |
| D-5 메일 미수신 | 활성화 | 발송·수신 설정 수정 후 selftest 재시도. 파기는 `inactive` 유지 |
| 운영 중 `blocked_*` | — | 083 이 스스로 삭제를 멈추고 매일 probe 로 복구를 기다린다. 경로가 살아나면 다음 실행이 밀린 대상을 한 번에 정리한다(Staging 실측: 막힘 2회 동안 대상 유지 → 회복 후 신고 2·문의 1 삭제). 막힘이 길수록 기한 지난 기록이 남으므로 감시 알림을 받은 날 조치한다 |
| 금지 | — | 6개월 기준·관문을 끄거나 우회하는 수정, 수동으로 082 판 함수 호출, 081 구정책 복원 |
