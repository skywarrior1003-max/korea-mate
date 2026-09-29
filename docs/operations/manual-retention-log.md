# 문의·신고 6개월 보관 — 수동 운영 기록 (082 자동 파기 출시 전까지)

> 공개 개인정보처리방침(제10조)은 "문의 기록은 접수일부터 6개월, 신고 기록은 처리 완료일부터 6개월 보관한 뒤 지체 없이 파기"한다고 적는다.
> 이를 매일 자동으로 지키는 082(파기 cron)는 Auth 와 함께 출시된다. **그 전까지는 이 문서로 수동 운영한다.** 082 가 Production 에서 활성화되면 이 문서의 남은 행은 082 원장(`retention_purge_runs`)으로 넘어간다.

## 절차

1. **기한 7일 전** — Main(Claude)이 Production 을 읽기 전용으로 조회해 대상·기한을 다시 계산하고, 아래 표의 '확인일'을 채운다. 행을 지우지 않는다.
   - 문의: `select id, type, status, created_at, (created_at + interval '6 months')::date as due from public.contact_inquiries order by created_at;`
   - 신고: `select id, status, resolved_at, (resolved_at + interval '6 months')::date as due from public.place_reports where resolved_at is not null order by resolved_at;`
2. **판단** — Owner 가 '파기' 또는 '보존 예외'를 정한다. 보존 예외는 사유와 새 검토일을 적는다(진행 중 문의 등, 처리방침 제10조 범위 안에서만).
3. **파기 실행** — Owner 승인 후 Main 이 해당 id 만 지정해 삭제한다(`delete from public.contact_inquiries where id = '<id>';` 등, 실행 전 행 수 확인). 운영자 메일함의 해당 문의 알림 메일(082 이전 알림은 원문 포함)도 같은 날 삭제한다.
4. **기록** — 아래 표에 실행일·결과를 남긴다(개인정보 원문은 적지 않는다 — id 앞 8자리·유형·날짜만).

## 대상과 기록

| 대상 | 기준일 | 파기 기한 | 담당 | 확인일(7일 전) | 판단 | 실행·결과 |
|---|---|---|---|---|---|---|
| 문의 `9eb34b23` — 운영 시험 기록(관리자 메모 "테스트 문의") | 접수 2026-06-14 | **2026-12-14** | 확인·실행 Main, 판단 Owner | 2026-12-07 예정 | (미정 — 시험 기록이라 보존 예외 사유 없음이 예상) | — |
| 문의 `1c2e6e4d` — 발송 감사 시험(CONTACT-AUDIT-20260926) | 접수 2026-09-26 | 2027-03-26 | 같음 | 2027-03-19 예정 | 미정 | — |
| 신고 9건(모두 종결) | 처리 완료 2026-08-08~08-18 | 2027-02-08 ~ 2027-02-18 | 같음 | 2027-02-01 예정 | 미정 | — |

기한 계산 근거: 2026-09-28 Production 읽기 전용 조회(Auth 준비 작업 기록). 이번 작업에서는 어떤 행도 삭제하지 않았다.
