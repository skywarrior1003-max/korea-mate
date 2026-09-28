-- Production 시험 문의 2건 조기 삭제 — **Owner 승인 후에만 실행** (FINAL-RELEASE-GATES-V1, 실행 안 함)
--
-- 두 건은 실제 이용자 문의가 아니라 운영 시험 기록이다(2026-09-28 읽기 전용 확인):
--   · 2026-06-14 접수 'Wrong map location' — 관리자 메모가 "테스트 문의. 관리자 상태 변경 확인용."
--   · 2026-09-26 접수 'General question' — 본문이 CONTACT-AUDIT-20260926 발송 시험("No response required")
-- 보관 목적이 없으므로 처리방침 제11조("보관 목적이 없어지면 기간 전이라도 삭제")에 따라
-- 지울 수 있다. 지우지 않아도 자동 파기가 활성화되면 2026-12-14·2027-03-26 에 지워진다.
-- 관리자 화면에는 삭제 기능이 없어 SQL 로만 가능하다. 운영자 메일함의 알림 사본 2통(원문 포함)도
-- 같은 날 지운다.

BEGIN;
SELECT id, type, status, created_at FROM public.contact_inquiries
 WHERE id IN ('9eb34b23-b756-4853-b6b3-4343b454c5a2', '1c2e6e4d-5daa-4ec3-9912-54b3b54a2c38');
-- 위 결과가 정확히 2행이고 유형·접수일이 위 설명과 같을 때만 계속한다.
DELETE FROM public.contact_inquiries
 WHERE id IN ('9eb34b23-b756-4853-b6b3-4343b454c5a2', '1c2e6e4d-5daa-4ec3-9912-54b3b54a2c38')
   AND (admin_note = '테스트 문의. 관리자 상태 변경 확인용.' OR message LIKE 'CONTACT-AUDIT-20260926%');
-- 삭제 행 수가 2 가 아니면 ROLLBACK;
COMMIT;
