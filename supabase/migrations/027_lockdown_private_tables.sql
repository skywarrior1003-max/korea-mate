-- ════════════════════════════════════════════════════════════════════════════
-- 027_lockdown_private_tables.sql
-- TASK-027-LOCKDOWN-PRIVATE-TABLES — 서버 전용 테이블 직접 접근 차단
--
-- 배경 (2026-07-26 운영 실측):
--   trip_moments 에 anon/PUBLIC 대상 전면 개방 정책 3개가 존재했다.
--     "anon read"   SELECT USING (true)
--     "anon insert" INSERT WITH CHECK (true)
--     "anon delete" DELETE USING (true)
--   anon 키는 클라이언트 번들에 공개되므로, 개인 메모(memo)·기기 식별자(device_id)·
--   사진 경로(storage_path)가 외부에서 읽히고 임의 삭제까지 가능한 상태였다.
--   user_emails / itinerary_helpful_votes 는 정책이 0개라 RLS 가 실질 차단 중이나,
--   anon/authenticated 테이블 권한이 남아 있어 정책이 하나라도 추가되면 즉시 개방된다.
--
-- 대상 3개 테이블의 공통점: 브라우저(anon) 직접 접근 경로가 없다.
--   trip_moments            → Cloudflare Pages Functions 4개 (service_role)
--   user_emails             → functions/api/save-email.ts (service_role)
--   itinerary_helpful_votes → SECURITY DEFINER RPC 경유 (owner=postgres,
--                             search_path 고정, EXECUTE 는 service_role 만)
--   따라서 anon 권한 회수로 인한 기능 회귀 가능성이 없다.
--
-- 적용 범위 (의도적으로 제한):
--   · spots / spot_reactions 의 SELECT·INSERT 정책은 건드리지 않는다 (앱이 사용 중)
--   · restaurants / events / planner_sessions 는 별도 작업으로 분리
--   · FORCE ROW LEVEL SECURITY 는 사용하지 않는다 (목적에 불필요, 소유자 동작 변경)
--   · service_role / postgres 권한은 유지한다 (적용 전 4종 privilege true 확인 완료)
--
-- 멱등성: DROP POLICY IF EXISTS / REVOKE(없는 권한은 no-op) — 재실행 안전
-- 적용 금지: supabase db push 사용 금지 — Supabase SQL Editor 에서 직접 실행
-- 브랜드: GoKoreaMate / gokoreamate.com
-- 작성일: 2026-07-26
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. 개방 정책 제거 ─────────────────────────────────────────────────────────
-- 운영 실측으로 확인된 실제 정책명 기준.
DROP POLICY IF EXISTS "anon read"   ON public.trip_moments;
DROP POLICY IF EXISTS "anon insert" ON public.trip_moments;
DROP POLICY IF EXISTS "anon delete" ON public.trip_moments;

-- 아래 2개는 현재 운영 DB에 존재하지 않으나, src/app/api/admin/migrate/route.ts 가
-- 과거에 생성하던 이름이다. 재실행 흔적이 남아 있을 경우를 대비해 방어적으로 제거한다.
DROP POLICY IF EXISTS "anon_insert_emails"    ON public.user_emails;
DROP POLICY IF EXISTS "anon_read_own_emails"  ON public.user_emails;

-- ── 2. 테이블 레벨 권한 회수 ──────────────────────────────────────────────────
-- PUBLIC 포함 — 향후 생성되는 역할이 PUBLIC 을 통해 권한을 상속하는 것을 차단.
REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.trip_moments            FROM anon, authenticated, PUBLIC;
REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.user_emails             FROM anon, authenticated, PUBLIC;
REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.itinerary_helpful_votes FROM anon, authenticated, PUBLIC;

-- ── 3. 컬럼 레벨 권한 회수 ────────────────────────────────────────────────────
-- 017 교훈: 테이블 REVOKE 후에도 컬럼 단위 권한이 남으면 해당 컬럼은 직접 접근 가능
-- (예: REVOKE 테이블 SELECT 후에도 SELECT device_id FROM ... 가능).
REVOKE SELECT (
  moment_id, itinerary_id, device_id, memo, category, lat, lng,
  location_label, captured_at, day_number, created_at,
  is_public, storage_path, city_spot_id
) ON public.trip_moments FROM anon, authenticated, PUBLIC;
REVOKE INSERT (
  moment_id, itinerary_id, device_id, memo, category, lat, lng,
  location_label, captured_at, day_number, created_at,
  is_public, storage_path, city_spot_id
) ON public.trip_moments FROM anon, authenticated, PUBLIC;
REVOKE UPDATE (
  moment_id, itinerary_id, device_id, memo, category, lat, lng,
  location_label, captured_at, day_number, created_at,
  is_public, storage_path, city_spot_id
) ON public.trip_moments FROM anon, authenticated, PUBLIC;
REVOKE REFERENCES (
  moment_id, itinerary_id, device_id, memo, category, lat, lng,
  location_label, captured_at, day_number, created_at,
  is_public, storage_path, city_spot_id
) ON public.trip_moments FROM anon, authenticated, PUBLIC;

REVOKE SELECT     (id, email, device_id, created_at) ON public.user_emails FROM anon, authenticated, PUBLIC;
REVOKE INSERT     (id, email, device_id, created_at) ON public.user_emails FROM anon, authenticated, PUBLIC;
REVOKE UPDATE     (id, email, device_id, created_at) ON public.user_emails FROM anon, authenticated, PUBLIC;
REVOKE REFERENCES (id, email, device_id, created_at) ON public.user_emails FROM anon, authenticated, PUBLIC;

REVOKE SELECT     (id, itinerary_id, device_id, created_at) ON public.itinerary_helpful_votes FROM anon, authenticated, PUBLIC;
REVOKE INSERT     (id, itinerary_id, device_id, created_at) ON public.itinerary_helpful_votes FROM anon, authenticated, PUBLIC;
REVOKE UPDATE     (id, itinerary_id, device_id, created_at) ON public.itinerary_helpful_votes FROM anon, authenticated, PUBLIC;
REVOKE REFERENCES (id, itinerary_id, device_id, created_at) ON public.itinerary_helpful_votes FROM anon, authenticated, PUBLIC;

-- ── 4. service_role 권한 재확인 (멱등 GRANT) ─────────────────────────────────
-- 3단계의 REVOKE 는 anon/authenticated/PUBLIC 만 대상으로 하므로 service_role 권한에
-- 영향을 주지 않는다. 다만 service_role 이 PUBLIC 을 통해 권한을 상속받는 구성이었다면
-- PUBLIC REVOKE 로 접근이 끊길 수 있으므로, 명시적 GRANT 로 확정해 둔다.
-- (2026-07-26 운영 SQL Editor 에서 동일 GRANT 를 이미 적용함 — 여기서는 재실행
--  안전성과 신규 환경 재현성을 위해 migration 에도 명시한다. 이미 있는 권한에 대한
--  GRANT 는 no-op 이다.)
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.trip_moments,
     public.user_emails,
     public.itinerary_helpful_votes
  TO service_role;

-- ── 5. RLS 활성 유지 ──────────────────────────────────────────────────────────
-- 세 테이블 모두 이미 relrowsecurity = true. 멱등 재확인만 수행한다.
-- 정책 0개 + 권한 0 → 비-bypassrls 역할은 전면 차단, service_role 은 정상 동작.
ALTER TABLE public.trip_moments            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_emails             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itinerary_helpful_votes ENABLE ROW LEVEL SECURITY;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- 적용 전 조회 (롤백 원본 확보 — 반드시 먼저 실행하고 결과를 보관할 것)
--
-- SELECT tablename, policyname, cmd, roles, qual, with_check
-- FROM pg_policies WHERE schemaname='public'
--   AND tablename IN ('trip_moments','user_emails','itinerary_helpful_votes');
--
-- SELECT table_name, grantee, privilege_type
-- FROM information_schema.role_table_grants WHERE table_schema='public'
--   AND table_name IN ('trip_moments','user_emails','itinerary_helpful_votes')
-- ORDER BY table_name, grantee;
--
-- SELECT has_table_privilege('service_role','public.trip_moments','SELECT')  AS s1,
--        has_table_privilege('service_role','public.trip_moments','INSERT')  AS s2,
--        has_table_privilege('service_role','public.trip_moments','UPDATE')  AS s3,
--        has_table_privilege('service_role','public.trip_moments','DELETE')  AS s4;
-- → 하나라도 false 이면 적용하지 말 것.
--
-- ── 적용 후 검증 ─────────────────────────────────────────────────────────────
-- ① 정책 0개 / anon·authenticated 권한 0행 (위 두 SELECT 재실행)
-- ② anon REST 직접 접근이 200 이 아닐 것 (401 또는 403 + 권한 오류 모두 정상):
--    curl -s -o /dev/null -w "%{http_code}" \
--      "$SUPABASE_URL/rest/v1/trip_moments?select=moment_id&limit=1" -H "apikey: $ANON"
--    (user_emails, itinerary_helpful_votes 도 동일)
-- ③ 운영 API E2E: moment 생성·조회·삭제, 사진 업로드·signed URL, 일정 삭제 시
--    moments 앱 레벨 명시 삭제, Save Email, Shared Story Helpful 투표
--
-- ── 롤백 원칙 ────────────────────────────────────────────────────────────────
-- 취약 정책(USING true) 복원은 기본 롤백이 아니다. 순서를 지킬 것:
--   1) service_role 권한·API 오류를 먼저 규명·수정한다
--   2) 그래도 막히면 실패한 동작에 필요한 최소 권한만 임시 부여한다
--   3) anon 전체 공개 정책 복원은 최후 수단이며, 복원 시 재잠금 기한과
--      종료 조건을 반드시 함께 기록한다
-- ════════════════════════════════════════════════════════════════════════════
