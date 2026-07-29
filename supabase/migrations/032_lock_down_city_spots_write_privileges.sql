-- 032_lock_down_city_spots_write_privileges.sql
-- Security-0: city_spots 에서 anon / authenticated 의 쓰기 권한을 회수한다.
--
-- 배경
--   실측(2026-07-28) 결과 city_spots 의 ACL 이 아래와 같았다.
--     postgres      = arwdDxtm/postgres
--     anon          = arwdDxtm/postgres   ← INSERT/UPDATE/DELETE/TRUNCATE 보유
--     authenticated = arwdDxtm/postgres   ← 동일
--     service_role  = arwdDxtm/postgres
--   027 이 trip_moments·user_emails·itinerary_helpful_votes 를 잠글 때
--   city_spots 는 빠져 있었다.
--
--   현재 RLS 에 INSERT/UPDATE/DELETE 정책이 없어 실제 쓰기는 거부된다.
--   즉 이 migration 은 동작을 바꾸지 않는다. 다만 정책이 하나라도 잘못
--   추가되거나 RLS 가 꺼지는 순간 anon 이 곧바로 쓰기·TRUNCATE 를 할 수 있는
--   상태였으므로, 권한 자체를 없애 방어선을 하나 더 둔다.
--
-- 하지 않는 것
--   - RLS 정책 DROP/CREATE 하지 않는다 (anon_read_city_spots 유지)
--   - SELECT 권한을 건드리지 않는다 (공개 읽기는 그대로)
--   - service_role / postgres 권한을 건드리지 않는다
--   - 데이터·컬럼·스키마를 변경하지 않는다
--
-- 멱등성: REVOKE 는 없는 권한에 대해 no-op 이므로 재실행해도 안전하다.
--
-- 자기검증: 섹션 0 에서 적용 전 상태를 스냅샷하고 섹션 3 에서 COMMIT 직전에
--   대조한다. 하나라도 어긋나면 RAISE EXCEPTION 으로 트랜잭션 전체가 중단되어
--   운영에 반영되지 않는다. 파일 바깥에서 사후 검사 후 되돌리는 구조는 이 파일이
--   스스로 COMMIT 하므로 성립하지 않는다.
--
-- 적용은 검증된 SQL 수동 적용으로만 한다. supabase db push 금지,
-- migration history repair 금지 (SSOT v1.1 "migration 수동 적용 운영 계약" 참조).

BEGIN;

-- ── 0. 적용 전 baseline 스냅샷 ───────────────────────────────────────────────
-- 이 migration 은 COMMIT 직전에 스스로를 검증한다(섹션 3). 검증의 "불변" 항목은
-- 특정 숫자를 하드코딩하지 않고 여기서 찍은 적용 전 값과 비교한다. 행 수 86 같은
-- 현재 운영 실측값을 파일에 박아 두면 데이터가 늘어난 뒤나 복구 환경에서
-- 이유 없이 실패하기 때문이다. 지금 운영이 올바른 상태인지는 파일이 아니라
-- 적용 전 사전검증 절차가 판정한다.
--
-- ON COMMIT DROP 이므로 트랜잭션 종료와 함께 사라진다. 같은 트랜잭션에서 이
-- 파일을 두 번 실행하는 경우를 위해 먼저 DROP 한다(멱등성).
DROP TABLE IF EXISTS pg_temp._032_baseline;

CREATE TEMP TABLE _032_baseline ON COMMIT DROP AS
SELECT
  (SELECT count(*) FROM public.city_spots) AS row_count,
  (SELECT count(*) FROM pg_attribute
    WHERE attrelid = 'public.city_spots'::regclass
      AND attnum > 0 AND NOT attisdropped) AS col_count,
  (SELECT relrowsecurity FROM pg_class
    WHERE oid = 'public.city_spots'::regclass) AS rls_enabled,
  -- 정책 이름·명령·대상 역할·USING·WITH CHECK 를 모두 포함한 지문.
  -- 정책이 바뀌거나 사라지면 문자열이 달라진다.
  (SELECT coalesce(string_agg(
            policyname || '|' || cmd || '|' || roles::text || '|' ||
            coalesce(qual, '<null>') || '|' || coalesce(with_check, '<null>'),
            E'\n' ORDER BY policyname), '')
     FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'city_spots') AS rls_fingerprint,
  -- 관리 역할의 실효 권한 8종. 이 migration 이 건드리면 안 되는 값이다.
  (SELECT string_agg(r || ':' || p || '=' ||
            has_table_privilege(r, 'public.city_spots', p)::text,
            ' ' ORDER BY r, p)
     FROM unnest(ARRAY['postgres', 'service_role']) AS r,
          unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE',
                       'TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) AS p
  ) AS admin_privs;

-- ── 1. 테이블 레벨 쓰기 권한 회수 ────────────────────────────────────────────
-- PUBLIC 포함 — 현재 PUBLIC 별도 grant 는 없지만(실측 확인), 향후 생성되는
-- 역할이 PUBLIC 을 통해 권한을 상속하는 것을 미리 차단한다.
-- SELECT 는 목록에 넣지 않는다.
--
-- MAINTAIN 은 PostgreSQL 17 에서 도입된 권한이며(현재 운영 17.6), ACL 문자열의
-- 'm' 이 이에 해당한다. information_schema.role_table_grants 는 SQL 표준 7종만
-- 열거하므로 MAINTAIN 을 보여주지 않는다. 그 뷰만 보고 판정하면 누락된다.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
  ON public.city_spots FROM anon, authenticated, PUBLIC;

-- ── 2. 컬럼 레벨 쓰기 권한 회수 ──────────────────────────────────────────────
-- 017·027 교훈: 테이블 REVOKE 후에도 컬럼 단위 권한이 남으면 해당 컬럼은
-- 직접 접근이 가능하다.
--
-- 실측상 pg_attribute.attacl 이 34개 컬럼 전부 NULL 이므로 현재 명시적 컬럼
-- GRANT 는 존재하지 않는다(information_schema.column_privileges 의 34행은
-- 테이블 권한에서 파생된 값이다). 따라서 아래는 현재 no-op 이지만,
-- 누군가 컬럼 단위로 GRANT 한 뒤 이 파일을 재실행하는 경우를 위해 남긴다.
--
-- 컬럼 목록을 하드코딩하면 컬럼이 추가될 때 누락되므로, public.city_spots 의
-- 실제 컬럼을 조회해 동적으로 만든다. 대상 테이블·역할은 고정 문자열이고
-- 컬럼명은 quote_ident 로 감싸므로 주입 여지가 없다.
--
-- 컬럼 단위 권한이 존재하는 것은 INSERT / UPDATE / REFERENCES / SELECT 뿐이다.
-- MAINTAIN 은 테이블 단위 권한이므로 아래 동적 SQL 에 넣지 않는다(문법 오류).
-- SELECT 는 공개 읽기라 애초에 회수 대상이 아니다.
DO $$
DECLARE
  col_list text;
BEGIN
  SELECT string_agg(quote_ident(attname), ', ' ORDER BY attnum)
    INTO col_list
    FROM pg_attribute
   WHERE attrelid = 'public.city_spots'::regclass
     AND attnum > 0
     AND NOT attisdropped;

  -- 컬럼이 없는 경우는 있을 수 없지만, 빈 목록으로 잘못된 SQL 을 만들지 않는다
  IF col_list IS NULL OR col_list = '' THEN
    RAISE NOTICE '[032] public.city_spots 컬럼을 찾지 못해 컬럼 레벨 REVOKE 를 건너뛴다';
    RETURN;
  END IF;

  EXECUTE format(
    'REVOKE INSERT (%s) ON public.city_spots FROM anon, authenticated, PUBLIC', col_list);
  EXECUTE format(
    'REVOKE UPDATE (%s) ON public.city_spots FROM anon, authenticated, PUBLIC', col_list);
  EXECUTE format(
    'REVOKE REFERENCES (%s) ON public.city_spots FROM anon, authenticated, PUBLIC', col_list);
END $$;

-- ── 3. 자기검증 (COMMIT 직전) ────────────────────────────────────────────────
-- 여기서 RAISE EXCEPTION 이 발생하면 아래 COMMIT 에 도달하지 못하고 트랜잭션
-- 전체가 중단된다. 즉 기대와 다른 결과는 운영에 반영되지 않는다.
--
-- 주의: has_table_privilege 의 'public' 은 PUBLIC 의사역할을 가리키는 소문자
--       특수값이다. pg_roles 에 public 이라는 역할은 존재하지 않으며,
--       PostgreSQL 이 이 리터럴 소문자 문자열만 PUBLIC 으로 해석한다.
--       'PUBLIC' 으로 바꾸면 ERROR 42704 role "PUBLIC" does not exist 가 난다.
DO $verify$
DECLARE
  b       record;
  v_num   bigint;
  v_bool  boolean;
  v_text  text;
  v_bad   text;
BEGIN
  SELECT * INTO b FROM _032_baseline;

  IF to_regrole('anon') IS NULL OR to_regrole('authenticated') IS NULL THEN
    RAISE EXCEPTION '[032] anon 또는 authenticated 역할이 존재하지 않는다';
  END IF;

  -- 3-1. 데이터 불변 (적용 전 스냅샷과 비교, 절대값 하드코딩 없음)
  SELECT count(*) INTO v_num FROM public.city_spots;
  IF v_num <> b.row_count THEN
    RAISE EXCEPTION '[032] city_spots 행 수가 변경됐다: % -> %', b.row_count, v_num;
  END IF;

  -- 3-2. 컬럼 불변
  SELECT count(*) INTO v_num FROM pg_attribute
   WHERE attrelid = 'public.city_spots'::regclass
     AND attnum > 0 AND NOT attisdropped;
  IF v_num <> b.col_count THEN
    RAISE EXCEPTION '[032] 컬럼 수가 변경됐다: % -> %', b.col_count, v_num;
  END IF;

  -- 3-3. RLS 활성 상태·정책 불변
  SELECT relrowsecurity INTO v_bool FROM pg_class
   WHERE oid = 'public.city_spots'::regclass;
  IF v_bool IS DISTINCT FROM b.rls_enabled THEN
    RAISE EXCEPTION '[032] RLS 활성 상태가 변경됐다: % -> %', b.rls_enabled, v_bool;
  END IF;

  SELECT coalesce(string_agg(
           policyname || '|' || cmd || '|' || roles::text || '|' ||
           coalesce(qual, '<null>') || '|' || coalesce(with_check, '<null>'),
           E'\n' ORDER BY policyname), '')
    INTO v_text
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'city_spots';
  IF v_text IS DISTINCT FROM b.rls_fingerprint THEN
    RAISE EXCEPTION '[032] RLS 정책이 변경됐다 / 적용 전: % / 적용 후: %',
      b.rls_fingerprint, v_text;
  END IF;

  -- 3-4. postgres / service_role 실효 권한 8종 불변
  SELECT string_agg(r || ':' || p || '=' ||
           has_table_privilege(r, 'public.city_spots', p)::text,
           ' ' ORDER BY r, p)
    INTO v_text
    FROM unnest(ARRAY['postgres', 'service_role']) AS r,
         unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE',
                      'TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) AS p;
  IF v_text IS DISTINCT FROM b.admin_privs THEN
    RAISE EXCEPTION '[032] postgres/service_role 권한이 변경됐다 / 적용 전: % / 적용 후: %',
      b.admin_privs, v_text;
  END IF;

  -- 3-5. anon / authenticated 공개 읽기 보존
  SELECT string_agg(r, ', ' ORDER BY r) INTO v_bad
    FROM unnest(ARRAY['anon', 'authenticated']) AS r
   WHERE NOT has_table_privilege(r, 'public.city_spots', 'SELECT');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION '[032] 공개 읽기 권한이 사라졌다: %', v_bad;
  END IF;

  -- 3-6. anon / authenticated 쓰기·관리 권한 7종 전부 제거
  SELECT string_agg(r || '.' || p, ', ' ORDER BY r, p) INTO v_bad
    FROM unnest(ARRAY['anon', 'authenticated']) AS r,
         unnest(ARRAY['INSERT','UPDATE','DELETE','TRUNCATE',
                      'REFERENCES','TRIGGER','MAINTAIN']) AS p
   WHERE has_table_privilege(r, 'public.city_spots', p);
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION '[032] 공개 역할에 쓰기·관리 권한이 남았다: %', v_bad;
  END IF;

  -- 3-7. PUBLIC 실효 권한 8종 전부 없음 (SELECT 포함 — PUBLIC 에는 준 적이 없다)
  SELECT string_agg(p, ', ' ORDER BY p) INTO v_bad
    FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE',
                      'TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) AS p
   WHERE has_table_privilege('public', 'public.city_spots', p);
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION '[032] PUBLIC 실효 권한이 남았다: %', v_bad;
  END IF;

  -- 3-8. PUBLIC 직접 테이블 ACL 0건 (aclexplode 에서 grantee = 0 이 PUBLIC)
  SELECT count(*) INTO v_num
    FROM pg_class c, aclexplode(c.relacl) a
   WHERE c.oid = 'public.city_spots'::regclass AND a.grantee = 0;
  IF v_num <> 0 THEN
    RAISE EXCEPTION '[032] PUBLIC 직접 테이블 ACL 이 % 건 남았다', v_num;
  END IF;

  -- 3-9. anon / authenticated / PUBLIC 대상 컬럼 쓰기 ACL 0건
  SELECT count(*) INTO v_num
    FROM pg_attribute at, aclexplode(at.attacl) a
   WHERE at.attrelid = 'public.city_spots'::regclass
     AND at.attnum > 0 AND NOT at.attisdropped
     AND a.privilege_type IN ('INSERT', 'UPDATE', 'REFERENCES')
     AND a.grantee IN (0, to_regrole('anon')::oid, to_regrole('authenticated')::oid);
  IF v_num <> 0 THEN
    RAISE EXCEPTION '[032] 공개 역할 컬럼 쓰기 ACL 이 % 건 남았다', v_num;
  END IF;

  RAISE NOTICE '[032] 자기검증 통과 — 행 % · 컬럼 % 불변, 공개 역할은 SELECT 전용',
    b.row_count, b.col_count;
END $verify$;

COMMIT;

-- ── 검증 1. ACL 문자열 ───────────────────────────────────────────────────────
--
--   SELECT unnest(relacl)::text FROM pg_class WHERE oid='public.city_spots'::regclass;
--   기대: anon=r/postgres · authenticated=r/postgres
--         postgres=arwdDxtm/postgres · service_role=arwdDxtm/postgres
--
-- ── 검증 2. 실효 권한 8종 (information_schema 로 최종 판정하지 않는다) ───────
--
-- role_table_grants 는 SQL 표준 7종만 열거하므로 MAINTAIN 을 놓친다. 또한
-- 직접 GRANT 만 보여 주므로 역할 상속·PUBLIC 경유로 얻은 실효 권한을 놓친다.
-- 최종 판정은 아래 has_table_privilege 결과로 한다.
--
-- 주의: 아래 'public' 은 PUBLIC 의사역할을 가리키는 소문자 특수값이다.
--       pg_roles 에 public 이라는 역할은 존재하지 않으며, PostgreSQL 이 이
--       리터럴 소문자 문자열만 PUBLIC 으로 해석한다. 'PUBLIC' 으로 바꾸면
--       ERROR 42704 role "PUBLIC" does not exist 로 검증이 통째로 깨진다.
--
--   SELECT r AS role,
--          has_table_privilege(r,'public.city_spots','SELECT')     AS sel,
--          has_table_privilege(r,'public.city_spots','INSERT')     AS ins,
--          has_table_privilege(r,'public.city_spots','UPDATE')     AS upd,
--          has_table_privilege(r,'public.city_spots','DELETE')     AS del,
--          has_table_privilege(r,'public.city_spots','TRUNCATE')   AS tru,
--          has_table_privilege(r,'public.city_spots','REFERENCES') AS ref,
--          has_table_privilege(r,'public.city_spots','TRIGGER')    AS trg,
--          has_table_privilege(r,'public.city_spots','MAINTAIN')   AS mnt
--     FROM unnest(ARRAY['anon','authenticated','public']) AS r;
--   기대: anon          → SELECT 만 true, 나머지 7종 false
--         authenticated → SELECT 만 true, 나머지 7종 false
--         public        → 8종 모두 false
--
-- ── 검증 3. 권한 출처 (직접 ACL 해석) ────────────────────────────────────────
--
-- 검증 2 는 "가지고 있는가"만 답한다. "어디서 왔는가"는 아래로 확인한다.
-- 문자열 LIKE 매칭 대신 aclexplode 로 실제 ACL 항목을 해석한다.
-- aclexplode 에서 grantee = 0 이 PUBLIC 이다.
--
--   SELECT a.grantee, a.privilege_type
--     FROM pg_class c, aclexplode(c.relacl) a
--    WHERE c.oid='public.city_spots'::regclass AND a.grantee = 0;
--   기대: 0행 (PUBLIC 직접 테이블 ACL 없음)
--
--   SELECT at.attname, a.grantee::regrole::text, a.privilege_type
--     FROM pg_attribute at, aclexplode(at.attacl) a
--    WHERE at.attrelid='public.city_spots'::regclass
--      AND at.attnum > 0 AND NOT at.attisdropped;
--   기대: 0행 (컬럼 단위 명시 ACL 없음)
--   주: attacl 이 NULL 인 컬럼은 aclexplode 가 0행을 반환하므로 자연히 제외된다.
--
-- ── 검증 4. 불변 확인 ────────────────────────────────────────────────────────
--
-- 아래 두 항목은 섹션 3 자기검증이 COMMIT 전에 이미 대조한다. COMMIT 이
-- 성공했다면 통과한 것이며, 아래는 사후 육안 확인용이다.
--
--   SELECT policyname, cmd, roles::text, qual FROM pg_policies
--    WHERE schemaname='public' AND tablename='city_spots';
--   기대: anon_read_city_spots | SELECT | {anon} | qual=true  (변경 없음)
--
--   SELECT count(*) FROM public.city_spots;
--   기대: 적용 전과 동일. 2026-07-28 적용 시점 운영 실측값은 86 이었다.
--   이 숫자는 파일이 강제하는 불변식이 아니라 그날의 관측값이다. 운영이
--   올바른 상태인지는 적용 전 사전검증 절차가 판정한다.
--
-- ── ROLLBACK (비상 복구 전용 — 정상 적용 절차가 아니다) ──────────────────────
--
-- 아래는 이 migration 을 적용한 뒤 문제가 확인됐을 때만 실행한다.
-- 정상 배포 과정에서는 실행하지 않는다.
--
-- 무조건 전 권한을 재부여하지 않는다. 2026-07-28 실측 스냅샷
-- anon=arwdDxtm/postgres, authenticated=arwdDxtm/postgres 를 복원하는 것이며,
-- 컬럼 단위 명시 GRANT 는 당시 존재하지 않았으므로 복원 대상이 아니다.
--
--   BEGIN;
--   GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
--     ON TABLE public.city_spots TO anon, authenticated;
--   GRANT MAINTAIN
--     ON TABLE public.city_spots TO anon, authenticated;
--   COMMIT;
--
--   rollback 후 기대: anon=arwdDxtm/postgres · authenticated=arwdDxtm/postgres
--
--   -- MAINTAIN 을 빠뜨리면 anon=arwdDxt/postgres 가 되어 원상 복구가 아니다.
--   -- PUBLIC 에는 재부여하지 않는다. 적용 전에도 PUBLIC grant 는 없었다.
--   -- SELECT 는 회수한 적이 없으므로 복원 대상이 아니다.
