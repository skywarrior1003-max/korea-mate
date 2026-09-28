# 문의·신고 기록 보관·파기 운영 절차 (LEGAL-RETENTION-FINAL-V1)

> 상태: **초안 — Owner 가 보관 기간을 확정하기 전에는 아래 삭제 SQL 을 실행하지 않는다.**
> 이 문서는 처리방침 제11조("보관 기간이 끝나면 파기합니다")를 실제로 지키기 위한 절차다.
> 법이 정한 것은 파기 의무(개인정보 보호법 제21조)와 요청 처리 기한(제35·36조, 시행령 제41조④·제43조③)이며,
> 아래의 보관 기간 N 은 **사업자가 정하는 운영 값**이다(법정 기간 아님).

## 1. 대상과 기준 필드

| 기록 | 테이블 | 파기 기준 시각 | 근거 필드(현행 스키마) | 비고 |
|---|---|---|---|---|
| 신고 | `place_reports` | **처리 완료 시각 + N_report** | `resolved_at`(처리 종결 시 기록) + `status` 종결값 | 종결값: `resolved_corrected`·`resolved_no_change`·`resolved_hidden`·`resolved_removed`·`rejected`·`duplicate`. `pending`·`reviewing` 은 파기 대상 아님 |
| 문의 | `contact_inquiries` | **접수 시각 + N_inquiry** (권고) | `created_at` | `updated_at` 은 메모만 고쳐도 바뀌어 "처리 완료 시각"으로 쓸 수 없다. 처리 완료 기준을 원하면 §6 의 필드 추가가 선행 조건 |
| 문의 알림 메일 | 운영자 메일함(`ADMIN_NOTIFICATION_EMAIL`) | 같은 문의의 DB 파기와 같은 회차 | 제목 `[gokoreamate Inquiry] …`, 본문의 관리자 링크 `inquiries/detail?id=<문의 id>` | 본문에 이름·이메일·메시지 원문 포함 |
| 메일 발송 서비스 기록 | Resend | Resend 계정의 보관 설정을 따름 | — | **미확인**: 보관 기간·삭제 가능 여부를 Owner 가 Resend 대시보드에서 확인 |

신고 알림 메일(마일스톤)은 대상·건수·사유 분류만 담고 메모·신고 키를 담지 않는다(코드 확인) — 메일함 정리 대상에서 제외한다.

## 2. 담당·주기·기록

- **담당**: Owner(현재 단독 운영자).
- **주기**: 매월 1회(첫 영업일). 건수가 적어(2026-09-28 기준 Production 신고 9·문의 2) 월 1회 수동 점검으로 충분하다.
- **파기 기록**: 회차마다 날짜·대상 테이블·건수·실행자·실행 SQL 을 남긴다. 원문·이메일·신고 키는 기록하지 않는다.

## 3. 월간 점검 절차

1. **대상 추출(읽기 전용)** — 아래 SELECT 로 건수와 id 만 확인한다.
2. **수동 확인** — 진행 중인 분쟁·수사 협조 등 보존이 필요한 건이 있는지 id 로 관리자 화면에서 확인한다. 해당 건은 이번 회차에서 제외하고 사유를 기록한다.
3. **메일함 정리(문의)** — 추출한 문의 id 각각에 대해 운영자 메일함에서 관리자 링크의 id 로 알림 메일을 찾아 삭제하고, 휴지통 비우기까지 수행한다.
4. **DB 파기** — 아래 삭제 SQL 을 트랜잭션으로 실행하고 반환 건수가 1단계 건수와 같은지 대조한다.
5. **기록** — §2 형식으로 남긴다.
6. **실패 시** — 트랜잭션이 실패하면 아무것도 지워지지 않는다. 원인을 기록하고 같은 회차에 재실행한다. 메일 삭제만 실패하면 해당 id 를 다음 회차 첫 항목으로 이월한다.

```sql
-- 1) 대상 추출 — 신고 (N_report 를 Owner 확정값으로 치환)
select id, status, resolved_at::date
from public.place_reports
where status in ('resolved_corrected','resolved_no_change','resolved_hidden','resolved_removed','rejected','duplicate')
  and resolved_at < now() - interval '<N_report>';

-- 1) 대상 추출 — 문의
select id, status, created_at::date
from public.contact_inquiries
where created_at < now() - interval '<N_inquiry>';

-- 4) DB 파기 — 기간 확정 전 실행 금지
begin;
delete from public.place_reports
where status in ('resolved_corrected','resolved_no_change','resolved_hidden','resolved_removed','rejected','duplicate')
  and resolved_at < now() - interval '<N_report>'
returning id;
delete from public.contact_inquiries
where created_at < now() - interval '<N_inquiry>'
returning id;
commit;
```

## 4. 이용자 요청 처리(열람·정정·삭제)

법정 흐름: 요청을 받으면 **지체 없이** 확인해 필요한 조치를 하고(법 제36조②), **요청을 받은 날부터 10일 이내**에 결과를 알린다(시행령 제43조③, 열람은 제41조④). 10일은 결과 통지의 상한이지 대기 기간이 아니다.

**문의 기록** — 로그인 계정과 연결되어 있지 않다.
1. 요청 메일의 발신 주소가 문의에 적힌 이메일과 같은지 확인한다. 다르면 그 주소로 확인 메일을 보내 회신을 받은 뒤 진행한다.
2. 이메일 + 대략의 접수일로 문의를 찾는다. 이름만으로는 찾지 않는다.
3. 일치하는 건이 여러 개면 각 건의 접수일·유형을 알려 주고 대상을 확인받는다.
4. DB 행과 메일함 알림 사본을 함께 삭제하고 결과를 회신한다.

**신고 기록** — 신고 키는 브라우저 기기 식별자로 계산되며, 운영자는 이용자의 기기 식별자를 알지 못한다.
1. 신고 대상·날짜·사유·메모 내용을 받아 해당 건을 특정한다.
2. 하나로 특정되지 않으면 삭제하지 않는다(다른 사람의 신고를 지울 위험). 특정할 수 없다는 사실과 이유를 10일 이내에 알린다.

## 5. 식별 가능성 판단(요약)

- 신고 메모(자유 입력 500자)는 이름·연락처가 적힐 수 있어 **개인정보로 취급**한다.
- 신고 키는 기기 식별자와 대상으로 다시 계산할 수 있다. 계정 삭제 후 운영자는 기기 식별자를 보유하지 않지만, 이용자 브라우저에 남은 식별자와 결합하면 대조할 수 있다. 법상 "다른 정보와 쉽게 결합하여 알아볼 수 있는 정보"(제2조제1호나목)에 해당하는지는 **법률 검토 필요**.
- 이 신고 키는 법이 말하는 가명처리(추가 정보를 분리 보관하는 처리)로 설계된 값이 아니므로 가명정보로 분류하지 않는다.
- 결론: 보관·파기 운영에서는 **신고 기록 전체를 개인정보로 보고** 위 절차를 적용한다.

## 6. 선택형 코드 변경 — 문의를 "처리 완료 후 N" 으로 운영하려는 경우

현행 스키마로는 문의 처리 완료 시각을 알 수 없다. 이 기준을 택하면:
- migration(가칭 082): `contact_inquiries` 에 `resolved_at timestamptz` 추가.
- 관리자 PATCH(`functions/api/admin/contact-inquiries.ts`)에서 상태를 `resolved`·`archived`·`spam` 으로 바꿀 때 `resolved_at` 기록, 다시 열면 비움.
- 기존 행은 `resolved_at` 이 비어 있으므로 `created_at` 기준으로 보조 파기한다.
- 시험: 상태 변경 3종의 `resolved_at` 기록과 재오픈 시 해제.
