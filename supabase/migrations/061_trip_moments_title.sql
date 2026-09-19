-- 061_trip_moments_title.sql
-- ⚠ DRAFT — DO NOT APPLY TO PRODUCTION WITHOUT EXPLICIT OWNER APPROVAL.
--   (MAIN-MYTRIP-AI-STORY-MAP-AND-SHARE-PREVIEW-V1, 2026-09-19 — 격리 DB 검증용 초안)
--
-- 순간 기록(trip_moments)에 제목 컬럼을 추가한다. AI 3안(제목+본문)에서 고른 뒤
-- 사용자가 수정해 저장하는 값으로, memo 와 함께 Story 표시의 SSOT 가 된다.
-- additive-only: 기존 행·기존 컬럼·기존 데이터는 건드리지 않는다(백필 없음 —
-- 예전 순간은 title 없음이 정상이며 화면은 memo 만으로 그대로 성립한다).
--
-- 멱등성: ADD COLUMN IF NOT EXISTS.
-- 적용 전 코드 배포 순서: 코드가 먼저 배포되어도 안전하다 — POST/PATCH/GET 은
-- missing-column fallback 으로 title 만 빼고 동작한다(055 stop_key 와 동일 원칙).

ALTER TABLE trip_moments
  ADD COLUMN IF NOT EXISTS title TEXT;

COMMENT ON COLUMN trip_moments.title IS
  '순간 제목(≤60자, 서버 검증). AI 3안 선택+사용자 수정의 최종값 — Story 는 이 저장값을 그대로 읽는다.';

-- ── rollback (초안 — 값 보존이 필요하면 실행 전 재검토) ──────────────────────
-- ALTER TABLE trip_moments DROP COLUMN IF EXISTS title;
