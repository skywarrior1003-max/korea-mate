-- 039: legacy restaurants 공개 SELECT 회수
--
-- 배경
--   public.restaurants 는 초기 식당 카탈로그였다. 지금 화면이 쓰는 것은
--   정적 public/data/restaurants.json 과 city_spots 이고, 이 테이블을 읽는
--   런타임 코드는 브라우저에도 Pages Function 에도 없다. 그런데 anon·
--   authenticated 에 SELECT 가 남아 있어 100행이 계속 공개돼 있다.
--
--   공개해야 할 이유가 없는 데이터는 닫는다. 실제로 필요한 SELECT 는 유지한다는
--   원칙에 따라, 여기서는 "필요하지 않음"을 코드·번들·운영 네트워크 세 곳에서
--   확인한 뒤에만 회수한다.
--
-- 적용 원칙
--   이 저장소는 원격 migration history 가 001~004 뿐이고, 운영 SQL 은 사용자가
--   Supabase SQL Editor 에서 직접 실행한다. 이 파일은 코드·감사 이력이며
--   `supabase db push` 로 적용하지 않는다.
--
--   데이터를 지우거나 고치지 않는다. 테이블·컬럼·인덱스·트리거도 건드리지 않는다.
--   권한과 정책만 닫는다. 되돌릴 때도 데이터는 그대로다.

-- ── 1. 사전검증 ─────────────────────────────────────────────────────────────
-- 적용 전에 아래를 실행해 현재 값을 기록한다. 특정 숫자를 강제하지 않는다 —
-- 행 수는 적용 전후 보존 여부를 비교하기 위한 기준값일 뿐이다.
--
-- -- (a) 테이블 존재 · 행 수 · 최근 데이터
-- select count(*) as rows, max(created_at)::text as latest from public.restaurants;
--
-- -- (b) RLS 상태 · 정책 수
-- select c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced,
--        (select count(*) from pg_policy p where p.polrelid=c.oid) as policy_count
--   from pg_class c join pg_namespace n on n.oid=c.relnamespace
--  where n.nspname='public' and c.relname='restaurants';
--
-- -- (c) restaurants_anon_select 정책 존재 여부
-- select polname from pg_policy p join pg_class c on c.oid=p.polrelid
--   join pg_namespace n on n.oid=c.relnamespace
--  where n.nspname='public' and c.relname='restaurants';
--
-- -- (d) role 별 privilege (PUBLIC 포함)
-- select grantee, string_agg(privilege_type, ',' order by privilege_type) as privs
--   from information_schema.role_table_grants
--  where table_schema='public' and table_name='restaurants'
--  group by grantee order by grantee;
-- select 'PUBLIC' as grantee, x.privilege_type
--   from pg_class c join pg_namespace n on n.oid=c.relnamespace,
--        lateral aclexplode(c.relacl) x
--  where n.nspname='public' and c.relname='restaurants' and x.grantee = 0;
--
-- 2026-08-06 실측: rows=100, latest=2026-06-10, rls_enabled=true, rls_forced=false,
--   policy_count=1 (restaurants_anon_select / SELECT / anon / USING true),
--   anon=SELECT, authenticated=SELECT, PUBLIC=없음,
--   service_role=DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE (7종),
--   FK 참조 0 · function 0 · trigger 0 · view 0.
--
-- 런타임 미사용은 SQL 로 증명할 수 없다. 코드·production bundle·운영 네트워크에서
-- 따로 확인한다(2026-08-06: /rest/v1/restaurants 요청 0 — Home·Explore·Picks·
-- Trips·all-spots·trending·restaurants·admin·Planner 9개 화면).

-- ── 2. 적용 ─────────────────────────────────────────────────────────────────
BEGIN;

-- 이미 켜져 있다. 꺼진 적이 없어야 하므로 명시적으로 다시 보장한다.
ALTER TABLE public.restaurants
  ENABLE ROW LEVEL SECURITY;

-- 정책을 남겨 두면 권한을 회수해도 정책만 보고 "열려 있다"고 오해하게 된다.
DROP POLICY IF EXISTS restaurants_anon_select
  ON public.restaurants;

-- 정책이 아니라 privilege 를 회수해야 REST 경로가 실제로 닫힌다.
-- PUBLIC 은 현재 0 이지만 나중에 다시 붙는 것을 막기 위해 함께 회수한다.
REVOKE ALL PRIVILEGES
  ON TABLE public.restaurants
  FROM PUBLIC;

REVOKE ALL PRIVILEGES
  ON TABLE public.restaurants
  FROM anon;

REVOKE ALL PRIVILEGES
  ON TABLE public.restaurants
  FROM authenticated;

COMMIT;

-- ── 3. service_role — 손대지 않는다 ─────────────────────────────────────────
-- GRANT 도 REVOKE 도 하지 않는다.
--
-- 038 초안에서 `GRANT SELECT, INSERT ... TO service_role` 을 넣었다가 바로잡은
-- 것과 같은 이유다. service_role 은 이 테이블에 이미 7종을 갖고 있고, 일부만
-- 적어 두면 "그만큼이면 충분하다"는 잘못된 기대가 남는다. 적용 전후 7종이
-- 그대로여야 한다.

-- ── 4. 적용 후 검증 ─────────────────────────────────────────────────────────
-- -- RLS on = true, 정책 수 = 0
-- select c.relrowsecurity as rls_enabled,
--        (select count(*) from pg_policy p where p.polrelid=c.oid) as policy_count
--   from pg_class c join pg_namespace n on n.oid=c.relnamespace
--  where n.nspname='public' and c.relname='restaurants';
--
-- -- anon / authenticated / PUBLIC = 0 행
-- select grantee, privilege_type from information_schema.role_table_grants
--  where table_schema='public' and table_name='restaurants'
--    and grantee in ('anon','authenticated','PUBLIC');
-- select 'PUBLIC' as grantee, x.privilege_type
--   from pg_class c join pg_namespace n on n.oid=c.relnamespace,
--        lateral aclexplode(c.relacl) x
--  where n.nspname='public' and c.relname='restaurants' and x.grantee = 0;
--
-- -- service_role 은 적용 전과 같은 7종 유지 (7 행)
-- --   DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- select privilege_type from information_schema.role_table_grants
--  where table_schema='public' and table_name='restaurants' and grantee='service_role';
--
-- -- 데이터 무변경: 적용 전 행 수와 같아야 한다 (2026-08-06 기준 100)
-- select count(*) as rows from public.restaurants;
--
-- -- 운영 화면 회귀 0: Home·all-spots·restaurants 는 /data/restaurants.json 을 쓰므로
-- --   이 회수와 무관하다. 확인은 브라우저 네트워크에서 /rest/v1/restaurants 요청이
-- --   여전히 0 인지 보는 것으로 충분하다.

-- ── 5. 롤백 ─────────────────────────────────────────────────────────────────
-- 자동 실행하지 않는다. 되돌려야 할 때만 아래를 순서대로 실행한다.
-- PUBLIC 은 원래 권한이 없었으므로 롤백에서도 부여하지 않는다.
-- service_role 도 롤백에서 변경하지 않는다.
--
-- GRANT SELECT ON TABLE public.restaurants TO anon, authenticated;
-- CREATE POLICY restaurants_anon_select
--   ON public.restaurants
--   FOR SELECT
--   TO anon
--   USING (true);
--
-- 롤백해도 100행은 그대로다. 이 migration 은 데이터를 건드리지 않는다.
