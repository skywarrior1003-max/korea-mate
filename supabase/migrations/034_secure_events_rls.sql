-- 034: public.events 보안 잠금 (RLS ENABLE + 클라이언트 권한 전면 회수)
--
-- 무엇이 문제인가 (2026-08-05 운영 실측)
--   Supabase Security Advisor 의 유일한 ERROR
--     rls_disabled_in_public · public.events
--   실측 상태
--     RLS off · force_rls off · 정책 0 · owner postgres · **0행**
--     relacl: postgres=arwdDxtm | anon=r | authenticated=r | service_role=arwdDxtm
--     → PUBLIC 직접 grant 없음, anon/authenticated 는 SELECT 만 (033 의 쓰기 revoke 반영됨)
--
-- 왜 지금 잠그는가
--   저장소 전체에서 이 테이블에 닿는 경로가 0 이다.
--     from("events") · .from('events') · /rest/v1/events  → 전부 0건
--   행사 화면이 실제로 쓰는 것은 city_spots · local-info.json · /data/events.json 이다
--     HomeClient.tsx:716 · ExploreCity.tsx:171 · trending/page.tsx:85 · all-spots/page.tsx:145
--   즉 행사 기능을 없애는 것이 아니라, 아무도 쓰지 않는 legacy DB 접근 경로를 닫는다.
--
-- 033 계약의 의도적 폐기
--   033 은 "읽기 계약을 이번에 바꿀 이유가 없다" 며 anon/authenticated SELECT 를
--   보존했고, 섹션 3-3 에 SELECT 가 사라지면 RAISE 하는 자기검증까지 두었다.
--   034 는 그 결정을 **의도적으로 대체한다**. 근거는 그 이후 확인된 사실이다 —
--   테이블이 0행이고 읽는 코드가 하나도 없다. 읽을 것이 없는 경로를 열어 둘
--   이유가 없다. 따라서 033 을 다시 실행하면 3-3 에서 실패하는 것이 정상이며,
--   033 은 코드 이력으로만 보존한다(데이터 계약 v1: 적용 여부는 DB 구조로 검증).
--
-- 무엇을 하지 않는가
--   - 행·컬럼·인덱스·트리거를 건드리지 않는다 (DROP/TRUNCATE/UPDATE/DELETE 없음)
--   - anon/authenticated 용 정책을 만들지 않는다. RLS on + 정책 0 이면 두 롤은
--     행을 한 건도 볼 수 없다. 권한 회수와 정책 부재의 두 겹으로 잠근다.
--   - service_role·postgres 를 건드리지 않는다. 두 롤은 rolbypassrls=true 라
--     RLS 를 켜도 서버 계약(src/app/api/admin/*)이 그대로 유지된다.
--   - 다른 테이블·함수를 건드리지 않는다. 이 파일은 public.events 전용이다.
--
-- 재실행에 대하여
--   baseline 검증이 RLS 활성 상태에서 RAISE 하도록 되어 있어 **재실행되지 않는다**.
--   조용히 두 번 적용되는 것보다 크게 실패하는 편이 낫다(033 과 같은 방식).
--
-- 적용은 검증된 SQL 수동 적용으로만 한다. supabase db push 금지,
-- migration history repair 금지 (데이터 계약 v1 "migration 수동 적용 운영 계약").

BEGIN;

-- ── 0. 적용 전 baseline ──────────────────────────────────────────────────────
--
-- 034는 public.events가 0행·코드 사용 경로 0인 legacy 테이블임을
-- 확인한 뒤 033에서 보존했던 anon/authenticated SELECT 계약을
-- 의도적으로 폐기한다.
DO $baseline$
DECLARE
  v_row_count    bigint;
  v_policy_count bigint;
  v_rls_enabled  boolean;
BEGIN
  SELECT count(*) INTO v_row_count
  FROM public.events;

  SELECT count(*) INTO v_policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'events';

  SELECT c.relrowsecurity
    INTO v_rls_enabled
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'events';

  IF v_row_count <> 0 THEN
    RAISE EXCEPTION 'public.events baseline changed: expected 0 rows, got %', v_row_count;
  END IF;

  IF v_policy_count <> 0 THEN
    RAISE EXCEPTION 'public.events baseline changed: expected 0 policies, got %', v_policy_count;
  END IF;

  IF v_rls_enabled THEN
    RAISE EXCEPTION 'public.events baseline changed: RLS already enabled';
  END IF;
END
$baseline$;

-- 구조 스냅샷 — 이 migration 이 권한 외에는 아무것도 바꾸지 않았음을 섹션 2 에서 대조한다
CREATE TEMP TABLE _034_baseline ON COMMIT DROP AS
SELECT
  (SELECT count(*) FROM pg_attribute a
     JOIN pg_class c ON c.oid = a.attrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'events'
      AND a.attnum > 0 AND NOT a.attisdropped)                       AS n_columns,
  (SELECT count(*) FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'events')             AS n_indexes,
  (SELECT count(*) FROM pg_trigger t
     JOIN pg_class c ON c.oid = t.tgrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'events'
      AND NOT t.tgisinternal)                                        AS n_triggers;

-- ── 1. 잠금 ─────────────────────────────────────────────────────────────────
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.events FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.events FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.events FROM authenticated;

-- ── 2. 적용 후 검증 ─────────────────────────────────────────────────────────
DO $verify$
DECLARE
  v_rls_enabled  boolean;
  v_policy_count bigint;
  v_row_count    bigint;
  v_priv         text;
  v_base         record;
BEGIN
  SELECT c.relrowsecurity
    INTO v_rls_enabled
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'events';

  SELECT count(*) INTO v_policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'events';

  SELECT count(*) INTO v_row_count
  FROM public.events;

  IF NOT v_rls_enabled THEN
    RAISE EXCEPTION 'public.events RLS was not enabled';
  END IF;

  IF v_policy_count <> 0 THEN
    RAISE EXCEPTION 'public.events must have 0 client policies, got %', v_policy_count;
  END IF;

  IF v_row_count <> 0 THEN
    RAISE EXCEPTION 'public.events row count changed unexpectedly: %', v_row_count;
  END IF;

  IF has_table_privilege('anon', 'public.events', 'SELECT')
     OR has_table_privilege('anon', 'public.events', 'INSERT')
     OR has_table_privilege('anon', 'public.events', 'UPDATE')
     OR has_table_privilege('anon', 'public.events', 'DELETE') THEN
    RAISE EXCEPTION 'anon still has privileges on public.events';
  END IF;

  IF has_table_privilege('authenticated', 'public.events', 'SELECT')
     OR has_table_privilege('authenticated', 'public.events', 'INSERT')
     OR has_table_privilege('authenticated', 'public.events', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.events', 'DELETE') THEN
    RAISE EXCEPTION 'authenticated still has privileges on public.events';
  END IF;

  -- 2-1. 나머지 권한도 남지 않았는가 (TRUNCATE·REFERENCES·TRIGGER·MAINTAIN)
  --      REVOKE ALL 이 전부 걷어 갔는지 이름으로 확인한다.
  FOREACH v_priv IN ARRAY ARRAY['TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'] LOOP
    IF has_table_privilege('anon', 'public.events', v_priv) THEN
      RAISE EXCEPTION 'anon still has % on public.events', v_priv;
    END IF;
    IF has_table_privilege('authenticated', 'public.events', v_priv) THEN
      RAISE EXCEPTION 'authenticated still has % on public.events', v_priv;
    END IF;
  END LOOP;

  -- 2-2. PUBLIC 의사역할에도 직접 권한이 남지 않았는가
  FOREACH v_priv IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'] LOOP
    IF has_table_privilege('public', 'public.events', v_priv) THEN
      RAISE EXCEPTION 'PUBLIC still has % on public.events', v_priv;
    END IF;
  END LOOP;

  -- 2-3. 컬럼 단위 잔여 권한 0
  --      information_schema 는 테이블 GRANT 를 컬럼으로 상속해 보여준다.
  --      테이블 권한을 걷었으면 여기도 0 이어야 한다.
  IF (SELECT count(*) FROM information_schema.column_privileges
       WHERE table_schema = 'public' AND table_name = 'events'
         AND grantee IN ('anon', 'authenticated', 'PUBLIC')) <> 0 THEN
    RAISE EXCEPTION 'column-level privileges remain on public.events';
  END IF;

  -- 2-4. service_role·postgres 서버 계약 보존 — 이 검증이 없으면 서버 기능이
  --      끊긴 채로 COMMIT 될 수 있다.
  FOREACH v_priv IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'] LOOP
    IF NOT has_table_privilege('service_role', 'public.events', v_priv) THEN
      RAISE EXCEPTION 'service_role lost % on public.events', v_priv;
    END IF;
    IF NOT has_table_privilege('postgres', 'public.events', v_priv) THEN
      RAISE EXCEPTION 'postgres lost % on public.events', v_priv;
    END IF;
  END LOOP;

  -- 2-5. 구조 무변경 (컬럼·인덱스·트리거)
  SELECT * INTO v_base FROM _034_baseline;
  IF (SELECT count(*) FROM pg_attribute a
        JOIN pg_class c ON c.oid = a.attrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relname = 'events'
         AND a.attnum > 0 AND NOT a.attisdropped) <> v_base.n_columns THEN
    RAISE EXCEPTION 'public.events column count changed';
  END IF;
  IF (SELECT count(*) FROM pg_indexes
       WHERE schemaname = 'public' AND tablename = 'events') <> v_base.n_indexes THEN
    RAISE EXCEPTION 'public.events index count changed';
  END IF;
  IF (SELECT count(*) FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relname = 'events'
         AND NOT t.tgisinternal) <> v_base.n_triggers THEN
    RAISE EXCEPTION 'public.events trigger count changed';
  END IF;

  RAISE NOTICE '[034] 검증 통과 — public.events RLS on, 클라이언트 권한 0, service_role 유지';
END
$verify$;

-- 적용 결과 확인용 출력
SELECT
  c.relname                                              AS table_name,
  c.relrowsecurity                                       AS rls,
  coalesce(pg_catalog.array_to_string(c.relacl, ' | '), '(none)') AS acl,
  (SELECT count(*) FROM pg_policies p
    WHERE p.schemaname = 'public' AND p.tablename = 'events') AS policies,
  (SELECT count(*) FROM public.events)                   AS row_count
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'events';

COMMIT;


-- ── ROLLBACK (비상 복구 전용 — 정상 적용 절차가 아니다) ──────────────────────
--
-- 적용 직전 실측 스냅샷 (2026-08-05)
--   public.events  RLS off · force_rls off · 정책 0 · 0행
--   relacl: postgres=arwdDxtm/postgres | anon=r/postgres
--         | authenticated=r/postgres | service_role=arwdDxtm/postgres
--   PUBLIC 직접 grant 없음 · 컬럼 단위 명시 GRANT 없음
--
--   BEGIN;
--   ALTER TABLE public.events DISABLE ROW LEVEL SECURITY;
--   GRANT SELECT ON TABLE public.events TO anon, authenticated;
--   COMMIT;
--
--   복구 후 기대: RLS off · anon=r · authenticated=r · service_role=arwdDxtm
--   PUBLIC 에는 재부여하지 않는다 — 적용 전에도 PUBLIC grant 는 없었다.
--   쓰기 권한도 재부여하지 않는다 — 033 이 이미 걷어 간 상태가 baseline 이다.
