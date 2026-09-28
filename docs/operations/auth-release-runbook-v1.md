# Auth + Legal Production 출시 런북 (LEGAL-RETENTION-IMPLEMENTATION-V1)

> 실행은 Owner 승인 후에만. 순서를 바꾸지 않는다: **DB 먼저 → 코드(master merge = 자동 Production 배포)**.
> 081 은 Production 기적용(2026-09-27) — **재실행 금지**.

## 0. 출시 전 확정(Owner)
- 운영 주체 법인명·주소·개인정보 보호책임자, 개인정보 요청 수신 이메일, 관할(법률 검토) — 처리방침·약관의 `ownerInput` 이 모두 사라져야 DRAFT 가 해제된다.
- 시행일 = 이 런북 3단계를 실행하는 날.

## 1. Production DB (Management API 또는 SQL Editor, 파일은 `git show <commit>:<path>` 로 추출)

| 순서 | 파일 | git 원본 sha256 | 확인 |
|---|---|---|---|
| 0 | 081 | 7aa68b9d… | **확인만**: `city_spots` SELECT 정책이 `anon_authenticated_read_published_city_spots` 1건 |
| 1 | 077_user_consents | 429041d9… | `user_consents` 존재 |
| 2 | 078_account_devices | 0411951c… | `account_devices` 존재, `link_device_to_account` 존재 |
| 3 | 079_trip_drafts | ca57871d… | `trip_drafts` 존재 |
| 4 | 080_trip_draft_operations | b03b810c… | `trip_draft_apply`·`trip_draft_merge_guest` 존재 |
| 5 | 082_retention_purge_daily | 177ee127… | pg_net 설치, `retention_purge_runs`, cron `gokoreamate-retention-purge-daily-v1` |

의존: 077~080 의 외부 의존은 `auth.users` 뿐, 082 는 `place_reports`·`contact_inquiries`·pg_cron. 서로·081 과 무관.
중단 기준: 한 단계라도 실패하면 다음 단계로 가지 않는다. 되돌리지 않고 원인을 고쳐 같은 파일을 재실행한다(각 파일 멱등).

5-1. Production Vault 에 `retention_alert_url` = `https://gokoreamate.com/api/internal/retention-alert`, `retention_alert_key` = Production `INTERNAL_KEY` 값을 등록(값은 기록하지 않는다).
5-2. `select public.retention_purge_daily();` 1회 → 원장 `ok`, 삭제 0건(2026-09-28 계산 기준 대상 0) 확인.

## 2. 코드 준비(Auth 브랜치, 같은 커밋 하나로)
- `src/lib/auth/consent-contract.ts` 의 `LEGAL_EFFECTIVE_DATE` 에 시행일(YYYY-MM-DD) 입력 → 처리방침·약관 시행일과 동의 버전 3종이 함께 바뀐다.
- 처리방침·약관 `ownerInput` 을 확정 값으로 치환(4locale), 가드 실행(legal-content·retention·consent-activation).
- Preview 에서 4locale 처리방침·약관 화면과 합성 계정 재동의 1회 확인.

## 3. master 합류
- Auth 브랜치를 master 에 merge → GitHub 연동이 Production 을 자동 빌드·배포한다(Legal 게시·동의 버전·Auth 코드가 한 번에 나간다).
- Preview 의 시험용 `INTERNAL_KEY` 는 Preview 전용 값이다. Production `INTERNAL_KEY` 는 기존 값을 그대로 쓴다.

## 4. 출시 직후 최소 확인
- 로그인 → 동의 시트 → 활성(시행일 버전) · This Trip 1건 계정 귀속 · My Trips 목록.
- 계정 삭제 게이트: 게스트 intent 403, 무세션 delete 401. **실계정 삭제 버튼은 누르지 않는다.**
- `/privacy`·`/terms` 4locale: DRAFT 배너 없음, 시행일 표시.
- 문의 1건 제출 → 운영자 알림 메일에 원문이 없고 관리자 화면에서 열리는지.
- 다음 날 `retention_purge_runs` 에 `ok` 1행.

## 5. 문제 시
- DB 단계 실패: 다음 단계 중단, 전방 수정.
- 코드 배포 후 장애: 이전 Production 배포로 되돌리되 DB(077~082)는 되돌리지 않는다(구 코드는 새 테이블을 쓰지 않아 공존 가능).
- 081 정책은 어떤 경우에도 `USING (true)` 로 복원하지 않는다.
