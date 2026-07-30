-- 033: legacy 공개 콘텐츠 테이블의 익명 쓰기 차단
--
-- 무엇이 문제인가 (2026-07-30 운영 실측)
--   events        RLS off  · anon=arwdDxtm · 정책 0    → 익명이 읽기·쓰기·삭제·TRUNCATE 전부 가능
--   restaurants   RLS on   · anon=arwdDxtm · anon_all(ALL, USING true, CHECK true) · 100행
--                                            → 익명이 100행을 수정·삭제할 수 있다
--   spots         RLS on   · anon=arwdDxtm · anon_all(ALL) + spots_anon_select · 0행
--
--   RLS 를 켜 두어도 grant 가 남아 있고 정책이 ALL/true 면 아무 제한이 없다.
--   032 가 city_spots 에 대해 한 것과 같은 문제이며, 대상만 다르다.
--
-- 무엇을 하는가
--   세 테이블에서 anon·authenticated·PUBLIC 의 **쓰기 권한만** 회수한다.
--   restaurants·spots 의 광범위한 anon_all 정책을 SELECT 전용으로 교체한다.
--
-- 무엇을 하지 않는가
--   - SELECT 를 회수하지 않는다. src/lib/spots.ts 가 anon 클라이언트로 spots 를
--     읽는다(5곳, 전부 .select). events·restaurants 는 앱이 읽지 않지만 읽기
--     계약을 이번에 바꿀 이유가 없다.
--   - 읽기 계약을 **넓히지도** 않는다. 적용 전 실측(2026-07-30)
--       events       RLS off  → anon O / authenticated O   (grant 만으로 성립)
--       restaurants  RLS on   → anon O / authenticated X   (정책이 anon 단독)
--       spots        RLS on   → anon O / authenticated X   (정책이 anon 단독)
--     이 표를 그대로 유지한다. 쓰기를 잠그는 migration 이 읽기를 넓히면 안 된다.
--   - events 의 RLS 를 켜지 않는다. 켜는 순간 정책이 0개라 익명 SELECT 까지
--     끊긴다. 쓰기 차단이라는 이 파일의 목적을 넘어서는 변경이다.
--   - service_role·postgres 권한을 건드리지 않는다. 관리자 경로
--     (src/app/api/admin/*)는 SUPABASE_SERVICE_ROLE_KEY 를 쓴다.
--   - spot_reactions 를 건드리지 않는다. anon INSERT+SELECT 는 dislike 기능이
--     쓰는 **설계된** 공개 권한이다(src/lib/spots.ts dislikeSpot).
--   - 행·컬럼·인덱스·트리거·데이터를 바꾸지 않는다.
--
-- 컬럼 단위 GRANT 에 대하여
--   information_schema.column_privileges 는 세 테이블 모두 anon/authenticated 에
--   INSERT·UPDATE·REFERENCES 를 보고하지만, pg_attribute.attacl 은 전 컬럼 NULL 이다.
--   즉 컬럼별 개별 GRANT 는 없고 테이블 GRANT 가 상속돼 보이는 것이다.
--   테이블 권한을 회수하면 함께 사라진다. 섹션 3 에서 실제로 0 이 되는지 확인한다.
--
-- 자기검증: 섹션 0 에서 적용 전 상태를 찍고 섹션 3 에서 COMMIT 직전에 대조한다.
--   하나라도 어긋나면 RAISE EXCEPTION 으로 트랜잭션 전체가 중단되어 운영에
--   반영되지 않는다.
--
-- 적용은 검증된 SQL 수동 적용으로만 한다. supabase db push 금지,
-- migration history repair 금지 (SSOT v1.1 "migration 수동 적용 운영 계약" 참조).

BEGIN;

-- ── 0. 적용 전 baseline ──────────────────────────────────────────────────────
--
-- 행 수 같은 실측값을 파일에 하드코딩하지 않는다. 데이터가 늘어난 뒤나 복구
-- 환경에서 이유 없이 실패하기 때문이다. 지금 찍은 값과만 비교한다.
DROP TABLE IF EXISTS pg_temp._033_baseline;
CREATE TEMP TABLE _033_baseline ON COMMIT DROP AS
SELECT
  c.relname::text                              AS tbl,
  c.relrowsecurity                             AS rls,
  c.relforcerowsecurity                        AS force_rls,
  (SELECT count(*) FROM pg_policies p
     WHERE p.schemaname = 'public' AND p.tablename = c.relname)  AS n_policies,
  (SELECT count(*) FROM pg_indexes i
     WHERE i.schemaname = 'public' AND i.tablename = c.relname)  AS n_indexes,
  (SELECT count(*) FROM pg_trigger t
     WHERE t.tgrelid = c.oid AND NOT t.tgisinternal)             AS n_triggers,
  (SELECT count(*) FROM pg_attribute a
     WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped) AS n_columns,
  pg_catalog.array_to_string(c.relacl, ',')    AS acl
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('events', 'restaurants', 'spots', 'spot_reactions');

-- 행 수는 별도로 센다 (동적 SQL 없이 명시적으로)
CREATE TEMP TABLE _033_rowcount ON COMMIT DROP AS
SELECT 'events'::text         AS tbl, count(*) AS n FROM public.events
UNION ALL SELECT 'restaurants',       count(*) FROM public.restaurants
UNION ALL SELECT 'spots',             count(*) FROM public.spots
UNION ALL SELECT 'spot_reactions',    count(*) FROM public.spot_reactions;

DO $baseline$
-- 변수명이 임시 테이블 컬럼과 겹치면 PL/pgSQL 이 어느 쪽인지 판단하지 못해
-- 42702 ambiguous column 이 난다. v_ 접두어로 분리한다.
DECLARE v_count bigint;
BEGIN
  SELECT count(*) INTO v_count FROM _033_baseline;
  IF v_count <> 4 THEN
    RAISE EXCEPTION '[033] 대상 테이블 4개를 찾지 못했다 (실측 %). events·restaurants·spots·spot_reactions 가 모두 있어야 한다', v_count;
  END IF;

  -- 적용 전에 실제로 쓰기가 열려 있어야 이 migration 이 의미가 있다.
  -- 이미 잠겨 있다면 다른 변경이 선행된 것이므로 멈추고 사람이 확인한다.
  IF NOT (has_table_privilege('anon', 'public.events',      'INSERT')
       OR has_table_privilege('anon', 'public.restaurants', 'INSERT')
       OR has_table_privilege('anon', 'public.spots',       'INSERT')) THEN
    RAISE EXCEPTION '[033] 적용 전 anon INSERT 가 이미 없다 — 예상한 baseline 이 아니다';
  END IF;
END $baseline$;

-- ── 1. 쓰기 권한 회수 ────────────────────────────────────────────────────────
--
-- SELECT 는 목록에 넣지 않는다. MAINTAIN 은 PG17 에 도입된 권한으로 REVOKE ALL
-- 없이 개별 회수하려면 이름을 적어야 한다.
--
-- 'public' 은 소문자 그대로 둔다 — PUBLIC 의사역할을 가리키는 특수값이라
-- 대문자로 바꾸면 존재하지 않는 롤로 해석된다.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
  ON TABLE public.events, public.restaurants, public.spots
  FROM anon, authenticated, public;

-- ── 2. 광범위한 ALL 정책 정리 ────────────────────────────────────────────────
--
-- grant 를 회수해도 정책이 남아 있으면 나중에 grant 가 다시 붙는 순간(예:
-- ALTER DEFAULT PRIVILEGES 로 만들어진 새 테이블 관행) 그대로 열린다.
-- 정책과 grant 두 겹을 함께 좁힌다.
--
-- restaurants: anon_all(ALL) 을 없애면 RLS on + 정책 0 이 되어 SELECT 까지
-- 막힌다. 지금 익명이 읽을 수 있는 상태이므로 읽기 계약을 유지하기 위해
-- SELECT 전용 정책으로 교체한다.
--
-- 역할은 anon **단독**이다. 원본 anon_all 의 polroles 가 {anon} 이었고
-- (pg_policy.polroles = {16484}) authenticated 에는 적용되지 않았다.
-- 즉 적용 전 authenticated 는 grant 가 있어도 정책이 없어 restaurants 를
-- 읽지 **못했다**. 여기에 authenticated 를 넣으면 쓰기를 잠그는 migration 이
-- 읽기를 넓히는 셈이 된다. 계약을 그대로 옮긴다.
DROP POLICY IF EXISTS anon_all ON public.restaurants;
CREATE POLICY restaurants_anon_select ON public.restaurants
  FOR SELECT TO anon
  USING (true);

-- spots: spots_anon_select(SELECT, USING true) 가 이미 있으므로 anon_all 만
-- 제거하면 읽기가 그대로 유지된다. 새 정책을 만들지 않는다.
DROP POLICY IF EXISTS anon_all ON public.spots;

-- events 는 RLS 가 꺼져 있다. 여기서 켜면 정책이 없어 익명 SELECT 가 끊긴다.
-- 이 파일의 목적은 쓰기 차단이므로 RLS 상태를 그대로 둔다.

-- ── 3. 적용 후 검증 ──────────────────────────────────────────────────────────
DO $verify$
-- 변수명에 v_ 접두어를 쓴다. 임시 테이블 _033_rowcount 에 n 컬럼이 있어
-- 로컬 변수 n 과 겹치면 42702 ambiguous column 이 난다(2026-07-30 실제 발생).
DECLARE
  v_tbl    text;
  v_priv   text;
  v_count  bigint;
  v_base   record;
BEGIN
  -- 3-1. anon·authenticated·PUBLIC 쓰기 권한 0
  FOREACH v_tbl IN ARRAY ARRAY['public.events', 'public.restaurants', 'public.spots'] LOOP
    FOREACH v_priv IN ARRAY ARRAY['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'] LOOP
      IF has_table_privilege('anon', v_tbl, v_priv) THEN
        RAISE EXCEPTION '[033] anon 이 % 에 대해 % 를 아직 가진다', v_tbl, v_priv;
      END IF;
      IF has_table_privilege('authenticated', v_tbl, v_priv) THEN
        RAISE EXCEPTION '[033] authenticated 가 % 에 대해 % 를 아직 가진다', v_tbl, v_priv;
      END IF;
      IF has_table_privilege('public', v_tbl, v_priv) THEN
        RAISE EXCEPTION '[033] PUBLIC 이 % 에 대해 % 를 아직 가진다', v_tbl, v_priv;
      END IF;
    END LOOP;
  END LOOP;

  -- 3-2. 컬럼 단위 쓰기 경로도 남지 않았는가
  SELECT count(*) INTO v_count
    FROM information_schema.column_privileges
   WHERE table_schema = 'public'
     AND table_name IN ('events', 'restaurants', 'spots')
     AND grantee IN ('anon', 'authenticated', 'PUBLIC')
     AND privilege_type IN ('INSERT', 'UPDATE', 'REFERENCES');
  IF v_count <> 0 THEN
    RAISE EXCEPTION '[033] 컬럼 단위 쓰기 권한이 % 건 남았다', v_count;
  END IF;

  -- 3-3. 읽기 계약을 **그대로** 유지 — 줄지도 늘지도 않아야 한다.
  --
  --      grant 만 보면 RLS 때문에 실제로는 못 읽는 경우를 놓치고, 정책만 보면
  --      grant 가 없는 경우를 놓친다. 두 겹을 role 별로 함께 본다.
  FOREACH v_tbl IN ARRAY ARRAY['public.events', 'public.restaurants', 'public.spots'] LOOP
    IF NOT has_table_privilege('anon', v_tbl, 'SELECT') THEN
      RAISE EXCEPTION '[033] anon SELECT grant 가 % 에서 사라졌다 — 읽기 회귀', v_tbl;
    END IF;
    IF NOT has_table_privilege('authenticated', v_tbl, 'SELECT') THEN
      RAISE EXCEPTION '[033] authenticated SELECT grant 가 % 에서 사라졌다 — 읽기 회귀', v_tbl;
    END IF;
  END LOOP;

  -- anon 은 세 테이블 모두 읽을 수 있어야 한다. events 는 RLS off 라 grant 만으로
  -- 성립하고, 나머지 둘은 SELECT 정책이 있어야 한다.
  FOREACH v_tbl IN ARRAY ARRAY['restaurants', 'spots'] LOOP
    SELECT count(*) INTO v_count FROM pg_policies
     WHERE schemaname = 'public' AND tablename = v_tbl
       AND cmd = 'SELECT' AND 'anon' = ANY (roles);
    IF v_count < 1 THEN
      RAISE EXCEPTION '[033] % 에 anon SELECT 정책이 없다 — RLS on 상태에서 읽기가 막힌다', v_tbl;
    END IF;
  END LOOP;

  -- authenticated 는 적용 전에도 restaurants·spots 를 읽지 못했다(정책 0).
  -- 여기서 정책이 생기면 이 migration 이 읽기를 넓힌 것이므로 중단한다.
  FOREACH v_tbl IN ARRAY ARRAY['restaurants', 'spots'] LOOP
    SELECT count(*) INTO v_count FROM pg_policies
     WHERE schemaname = 'public' AND tablename = v_tbl
       AND 'authenticated' = ANY (roles);
    IF v_count <> 0 THEN
      RAISE EXCEPTION '[033] % 에 authenticated 정책이 % 개 생겼다 — 적용 전 계약(0)을 넓히면 안 된다', v_tbl, v_count;
    END IF;
  END LOOP;

  -- PUBLIC 대상 정책도 생기면 안 된다.
  SELECT count(*) INTO v_count FROM pg_policies
   WHERE schemaname = 'public' AND tablename IN ('restaurants', 'spots')
     AND 'public' = ANY (roles);
  IF v_count <> 0 THEN
    RAISE EXCEPTION '[033] restaurants·spots 에 PUBLIC 정책이 % 개 생겼다', v_count;
  END IF;

  -- 3-4. 쓰기 정책이 남아 있지 않은가 (ALL·INSERT·UPDATE·DELETE)
  SELECT count(*) INTO v_count FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename IN ('restaurants', 'spots')
     AND cmd <> 'SELECT'
     AND ('anon' = ANY (roles) OR 'authenticated' = ANY (roles) OR 'public' = ANY (roles));
  IF v_count <> 0 THEN
    RAISE EXCEPTION '[033] restaurants·spots 에 익명 쓰기 정책이 % 개 남았다', v_count;
  END IF;

  -- 3-5. service_role·postgres 보존
  FOREACH v_tbl IN ARRAY ARRAY['public.events', 'public.restaurants', 'public.spots'] LOOP
    FOREACH v_priv IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'] LOOP
      IF NOT has_table_privilege('service_role', v_tbl, v_priv) THEN
        RAISE EXCEPTION '[033] service_role 이 % 에 대한 % 를 잃었다', v_tbl, v_priv;
      END IF;
      IF NOT has_table_privilege('postgres', v_tbl, v_priv) THEN
        RAISE EXCEPTION '[033] postgres 가 % 에 대한 % 를 잃었다', v_tbl, v_priv;
      END IF;
    END LOOP;
  END LOOP;

  -- 3-6. 구조·데이터 무변경 (행 수·RLS·컬럼·인덱스·트리거)
  FOR v_base IN SELECT bl.* FROM _033_baseline AS bl LOOP
    IF (SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
         WHERE ns.nspname = 'public' AND c.relname = v_base.tbl) IS DISTINCT FROM v_base.rls THEN
      RAISE EXCEPTION '[033] % 의 RLS 플래그가 바뀌었다', v_base.tbl;
    END IF;
    IF (SELECT count(*) FROM pg_indexes i WHERE i.schemaname = 'public' AND i.tablename = v_base.tbl) <> v_base.n_indexes THEN
      RAISE EXCEPTION '[033] % 의 인덱스 수가 바뀌었다', v_base.tbl;
    END IF;
    IF (SELECT count(*) FROM pg_trigger tg JOIN pg_class c ON c.oid = tg.tgrelid
         JOIN pg_namespace ns ON ns.oid = c.relnamespace
         WHERE ns.nspname = 'public' AND c.relname = v_base.tbl AND NOT tg.tgisinternal) <> v_base.n_triggers THEN
      RAISE EXCEPTION '[033] % 의 트리거 수가 바뀌었다', v_base.tbl;
    END IF;
    IF (SELECT count(*) FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
         JOIN pg_namespace ns ON ns.oid = c.relnamespace
         WHERE ns.nspname = 'public' AND c.relname = v_base.tbl
           AND a.attnum > 0 AND NOT a.attisdropped) <> v_base.n_columns THEN
      RAISE EXCEPTION '[033] % 의 컬럼 수가 바뀌었다', v_base.tbl;
    END IF;
  END LOOP;

  IF (SELECT count(*) FROM public.events)         <> (SELECT rc.n FROM _033_rowcount AS rc WHERE rc.tbl = 'events')      THEN RAISE EXCEPTION '[033] events 행 수가 바뀌었다'; END IF;
  IF (SELECT count(*) FROM public.restaurants)    <> (SELECT rc.n FROM _033_rowcount AS rc WHERE rc.tbl = 'restaurants') THEN RAISE EXCEPTION '[033] restaurants 행 수가 바뀌었다'; END IF;
  IF (SELECT count(*) FROM public.spots)          <> (SELECT rc.n FROM _033_rowcount AS rc WHERE rc.tbl = 'spots')       THEN RAISE EXCEPTION '[033] spots 행 수가 바뀌었다'; END IF;

  -- 3-7. spot_reactions 완전 무변경 (권한·정책·행 수)
  IF (SELECT bl.acl FROM _033_baseline AS bl WHERE bl.tbl = 'spot_reactions')
     IS DISTINCT FROM
     (SELECT pg_catalog.array_to_string(c.relacl, ',') FROM pg_class c
        JOIN pg_namespace ns ON ns.oid = c.relnamespace
       WHERE ns.nspname = 'public' AND c.relname = 'spot_reactions') THEN
    RAISE EXCEPTION '[033] spot_reactions 의 권한이 바뀌었다 — 이번 대상이 아니다';
  END IF;
  IF (SELECT bl.n_policies FROM _033_baseline AS bl WHERE bl.tbl = 'spot_reactions')
     <> (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'spot_reactions') THEN
    RAISE EXCEPTION '[033] spot_reactions 의 정책 수가 바뀌었다';
  END IF;
  IF (SELECT count(*) FROM public.spot_reactions) <> (SELECT rc.n FROM _033_rowcount AS rc WHERE rc.tbl = 'spot_reactions') THEN
    RAISE EXCEPTION '[033] spot_reactions 행 수가 바뀌었다';
  END IF;

  RAISE NOTICE '[033] 검증 통과 — events·restaurants·spots 익명 쓰기 차단, 읽기 유지';
END $verify$;

-- 적용 결과 확인용 출력
SELECT
  c.relname                                   AS table_name,
  c.relrowsecurity                            AS rls,
  pg_catalog.array_to_string(c.relacl, ' | ') AS acl,
  (SELECT count(*) FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS policies
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('events', 'restaurants', 'spots', 'spot_reactions')
ORDER BY c.relname;

COMMIT;


-- ── ROLLBACK (비상 복구 전용 — 정상 적용 절차가 아니다) ──────────────────────
--
-- 아래는 이 migration 을 적용한 뒤 문제가 확인됐을 때만 실행한다.
-- 정상 배포 과정에서는 실행하지 않는다.
--
-- 무조건 전 권한을 재부여하지 않는다. 2026-07-30 실측 스냅샷
--   events       anon=arwdDxtm/postgres · authenticated=arwdDxtm/postgres · RLS off · 정책 0
--   restaurants  anon=arwdDxtm/postgres · authenticated=arwdDxtm/postgres · RLS on
--                anon_all           cmd=ALL    polroles={anon} USING true CHECK true  permissive
--   spots        anon=arwdDxtm/postgres · authenticated=arwdDxtm/postgres · RLS on
--                anon_all           cmd=ALL    polroles={anon} USING true CHECK true  permissive
--                spots_anon_select  cmd=SELECT polroles={anon} USING true             permissive
--
-- 세 정책 모두 polroles 가 {anon} 단독이다(pg_policy.polroles = {16484}).
-- PUBLIC 도 authenticated 도 아니므로 rollback 에서 TO anon 으로 복원하는 것이
-- 곧 원상 복구다.
-- 를 복원하는 것이며, 컬럼 단위 명시 GRANT 는 당시 존재하지 않았으므로
-- (pg_attribute.attacl 전 컬럼 NULL) 복원 대상이 아니다.
--
--   BEGIN;
--   GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
--     ON TABLE public.events, public.restaurants, public.spots TO anon, authenticated;
--   GRANT MAINTAIN
--     ON TABLE public.events, public.restaurants, public.spots TO anon, authenticated;
--
--   DROP POLICY IF EXISTS restaurants_anon_select ON public.restaurants;
--   CREATE POLICY anon_all ON public.restaurants FOR ALL TO anon
--     USING (true) WITH CHECK (true);
--   CREATE POLICY anon_all ON public.spots       FOR ALL TO anon
--     USING (true) WITH CHECK (true);
--   -- FOR ALL · TO anon · USING true · WITH CHECK true 는 적용 전 원본과
--   -- cmd·polroles·USING·WITH CHECK 가 모두 일치한다. permissive 가 기본값이라
--   -- AS PERMISSIVE 를 명시하지 않아도 같은 정책이 된다.
--   COMMIT;
--
--   rollback 후 기대
--     anon=arwdDxtm/postgres · authenticated=arwdDxtm/postgres (세 테이블 모두)
--     restaurants 정책 1개(anon_all, TO anon)
--     spots 정책 2개(anon_all TO anon, spots_anon_select TO anon)
--     authenticated·PUBLIC 대상 정책은 적용 전에도 0개라 복원 대상이 아니다
--
--   -- MAINTAIN 을 빠뜨리면 anon=arwdDxt/postgres 가 되어 원상 복구가 아니다.
--   -- PUBLIC 에는 재부여하지 않는다. 적용 전에도 PUBLIC grant 는 없었다.
--   -- SELECT 는 회수한 적이 없으므로 복원 대상이 아니다.
--   -- events 의 RLS 는 이 migration 이 건드리지 않았으므로 복원 대상이 아니다.
--   -- spot_reactions 는 이 migration 이 건드리지 않았으므로 복원 대상이 아니다.
