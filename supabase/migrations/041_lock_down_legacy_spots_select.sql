-- 041: legacy spots 공개 SELECT 회수
--
-- 배경
--   public.spots 는 초기 장소 카탈로그였다. 지금 사용자 화면의 장소 SSOT 는
--   city_spots(86행)이고, spots 는 0행이다. 그런데 anon·authenticated 에 SELECT
--   가 남아 있어 공개할 이유가 없는 테이블이 계속 열려 있다.
--
--   "legacy" 라고만 부르면 오해가 생기니 정확히 적는다. spots 는 버려진 테이블이
--   아니라 **관리자 CSV 업로드 대상**이다. 지금 0행일 뿐 경로는 살아 있다.
--     POST /api/admin/upsert-spots            쓰기   (service_role)
--     POST /api/admin/delete-spot             삭제   (service_role)
--     GET  /api/admin/spot-reactions-summary  제목 조회 (service_role)
--   세 경로 모두 service_role 이라 이 회수의 영향을 받지 않는다.
--
--   브라우저 읽기 경로였던 src/lib/spots.ts 의 helper 4종은 호출처가 0건인
--   dead code 였고 이번 커밋에서 제거했다. 그래서 회수해도 깨질 화면이 없다.
--
-- 적용 원칙
--   이 저장소는 원격 migration history 가 001~004 뿐이고, 운영 SQL 은 사용자가
--   Supabase SQL Editor 에서 직접 실행한다. 이 파일은 코드·감사 이력이며
--   `supabase db push` 로 적용하지 않는다.
--
--   데이터를 지우거나 고치지 않는다. 테이블·컬럼·인덱스·트리거도 건드리지
--   않는다. 권한과 정책만 닫는다. 되돌릴 때도 데이터는 그대로다.

-- ── 1. 사전검증 ─────────────────────────────────────────────────────────────
-- 적용 전에 아래를 실행해 현재 값을 기록한다. 특정 숫자를 SQL 로 강제하지 않는다 —
-- 행 수는 적용 전후 보존 여부를 비교하기 위한 기준값이다.
--
-- -- (a) 행 수 · 최근 데이터
-- select count(*) as rows, max(created_at)::text as latest from public.spots;
--
-- -- (b) RLS · 정책
-- select c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced,
--        (select count(*) from pg_policy p where p.polrelid=c.oid) as policy_count
--   from pg_class c join pg_namespace n on n.oid=c.relnamespace
--  where n.nspname='public' and c.relname='spots';
-- select polname from pg_policy p join pg_class c on c.oid=p.polrelid
--   join pg_namespace n on n.oid=c.relnamespace
--  where n.nspname='public' and c.relname='spots';
--
-- -- (c) role 별 privilege (PUBLIC 포함)
-- select grantee, string_agg(privilege_type, ',' order by privilege_type) as privs
--   from information_schema.role_table_grants
--  where table_schema='public' and table_name='spots'
--  group by grantee order by grantee;
-- select 'PUBLIC' as grantee, x.privilege_type
--   from pg_class c join pg_namespace n on n.oid=c.relnamespace,
--        lateral aclexplode(c.relacl) x
--  where n.nspname='public' and c.relname='spots' and x.grantee = 0;
--
-- 2026-08-06 실측: rows=0, latest=null, rls_enabled=true, rls_forced=false,
--   policy_count=1 (spots_anon_select / SELECT / anon / USING true),
--   anon=SELECT, authenticated=SELECT, PUBLIC=없음,
--   postgres·service_role=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE (각 7종),
--   inbound FK 0 · outbound FK 0 · trigger 0 · view 0 · function 참조 0.
--
-- 런타임 미사용은 SQL 로 증명할 수 없다. 코드·production bundle·운영 네트워크에서
-- 따로 확인한다(2026-08-06: 번들 내 .from("spots") 0건, 운영 9개 화면에서
-- /rest/v1/spots 요청 0건).

-- ── 2. 적용 ─────────────────────────────────────────────────────────────────
BEGIN;

-- 이미 켜져 있다. 꺼진 적이 없어야 하므로 명시적으로 다시 보장한다.
ALTER TABLE public.spots
  ENABLE ROW LEVEL SECURITY;

-- 정책을 남겨 두면 권한을 회수해도 정책만 보고 "열려 있다"고 오해하게 된다.
DROP POLICY IF EXISTS spots_anon_select
  ON public.spots;

-- 정책이 아니라 privilege 를 회수해야 REST 경로가 실제로 닫힌다.
-- PUBLIC 은 현재 0 이지만 나중에 다시 붙는 것을 막기 위해 함께 회수한다.
-- REVOKE ALL 은 컬럼 단위 권한(현재 anon·authenticated 각 11개)까지 함께 정리한다.
REVOKE ALL PRIVILEGES
  ON TABLE public.spots
  FROM PUBLIC;

REVOKE ALL PRIVILEGES
  ON TABLE public.spots
  FROM anon;

REVOKE ALL PRIVILEGES
  ON TABLE public.spots
  FROM authenticated;

COMMIT;

-- ── 3. service_role — 손대지 않는다 ─────────────────────────────────────────
-- GRANT 도 REVOKE 도 하지 않는다.
--
-- 038 초안에서 `GRANT ... TO service_role` 을 넣었다가 바로잡은 것과 같은 이유다.
-- service_role 은 이미 7종을 갖고 있고, 관리자 CSV 업로드(INSERT/UPDATE)·삭제
-- (DELETE)·제목 조회(SELECT)가 전부 그 권한으로 돈다. 일부만 적어 두면
-- "그만큼이면 충분하다"는 잘못된 기대가 남는다. 적용 전후 7종 그대로여야 한다.

-- ── 4. 적용 후 검증 ─────────────────────────────────────────────────────────
-- -- RLS on = true, 정책 수 = 0
-- select c.relrowsecurity as rls_enabled,
--        (select count(*) from pg_policy p where p.polrelid=c.oid) as policy_count
--   from pg_class c join pg_namespace n on n.oid=c.relnamespace
--  where n.nspname='public' and c.relname='spots';
--
-- -- anon / authenticated / PUBLIC = 0 행 (테이블·컬럼 권한 모두)
-- select grantee, privilege_type from information_schema.role_table_grants
--  where table_schema='public' and table_name='spots'
--    and grantee in ('anon','authenticated','PUBLIC');
-- select grantee, count(*) from information_schema.column_privileges
--  where table_schema='public' and table_name='spots'
--    and grantee in ('anon','authenticated') group by grantee;
--
-- -- service_role 은 적용 전과 같은 7종 유지 (7 행)
-- --   DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- select privilege_type from information_schema.role_table_grants
--  where table_schema='public' and table_name='spots' and grantee='service_role';
--
-- -- 데이터 무변경: 적용 전 행 수와 같아야 한다 (2026-08-06 기준 0)
-- select count(*) as rows from public.spots;
--
-- -- 운영 회귀 0: 사용자 화면은 city_spots·정적 데이터를 쓰므로 이 회수와 무관하다.
-- --   브라우저 네트워크에서 /rest/v1/spots 요청이 여전히 0 인지 보면 충분하다.
-- --   관리자 CSV 업로드·삭제·flagged 목록은 service_role 경로라 그대로 동작한다.

-- ── 5. 롤백 ─────────────────────────────────────────────────────────────────
-- 자동 실행하지 않는다. 되돌려야 할 때만 아래를 순서대로 실행한다.
-- PUBLIC 은 원래 권한이 없었으므로 롤백에서도 부여하지 않는다.
-- service_role 도 롤백에서 변경하지 않는다.
--
-- GRANT SELECT ON TABLE public.spots TO anon, authenticated;
-- CREATE POLICY spots_anon_select
--   ON public.spots
--   FOR SELECT
--   TO anon
--   USING (true);
--
-- 롤백해도 행 수는 그대로다. 이 migration 은 데이터를 건드리지 않는다.
