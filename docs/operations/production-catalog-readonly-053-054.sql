-- Production READ-ONLY catalog 확인 — migration 053·054 적용 전
--
-- 무엇인가
--   053·054 를 운영에 적용해도 되는지 판단하기 위해, 지금 운영 schema 가
--   실제로 어떤 상태인지 사람이 SQL Editor 에서 직접 확인하는 묶음이다.
--
-- 이 파일의 계약
--   **SELECT / WITH 뿐이다.** INSERT·UPDATE·DELETE·ALTER·DROP·CREATE·
--   TRUNCATE·GRANT·REVOKE·CALL·DO·SET ROLE 이 실행문으로 들어가지 않는다.
--   이 계약은 `src/lib/migration-054-guard.test.ts` 가 자동으로 지킨다.
--
-- 개인 데이터를 읽지 않는다
--   memo·사진 경로·device_id·좌표·신고 본문은 어느 질의에도 없다.
--   나오는 것은 schema·제약·권한·집계 수치뿐이다.
--
-- 쓰는 법
--   Supabase Dashboard > SQL Editor 에 통째로 붙여 넣고 실행한다.
--   결과 7묶음(A~G)을 그대로 전달하면 된다.

-- ═══════════════════════════════════════════════════════════════════════════
-- A. migration history
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠ 먼저 읽을 것
--   이 저장소는 운영 SQL 을 사람이 SQL Editor 에서 직접 실행한다
--   (`supabase db push` 를 쓰지 않는다). 그래서 이 표에는 042·052 같은
--   수동 적용분이 **기록되지 않는다.** 여기서 052 가 안 보이는 것은 정상이며
--   "052 미적용" 을 뜻하지 않는다.
--   052/053/054 의 실제 적용 여부는 아래 B·C·D 의 schema 결과가 정본이다.

-- A-1. history 표가 존재하는지, 컬럼 이름이 무엇인지 (컬럼명을 짐작하지 않는다)
SELECT table_schema, table_name, column_name, data_type
  FROM information_schema.columns
 WHERE table_schema = 'supabase_migrations'
 ORDER BY table_name, ordinal_position;

-- A-2. 기록된 version 목록 (최근 20개). A-1 에 표가 없으면 이 질의는 건너뛴다.
SELECT version
  FROM supabase_migrations.schema_migrations
 ORDER BY version DESC
 LIMIT 20;

-- ═══════════════════════════════════════════════════════════════════════════
-- B. trip_moments 컬럼 — 053 의 전제
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 기대: place_name·public_consent_at·public_consent_version 세 줄이 **없어야**
--       한다(053 미적용). 나머지는 있어야 한다.
SELECT column_name, data_type, udt_name, is_nullable, column_default
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name   = 'trip_moments'
   AND column_name IN (
     'moment_id','itinerary_id','device_id','is_public','city_spot_id',
     'storage_path','place_name','public_consent_at','public_consent_version'
   )
 ORDER BY column_name;

-- ═══════════════════════════════════════════════════════════════════════════
-- C. place_reports 제약 — 054 의 가장 중요한 전제
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 여기서 볼 것: target_type CHECK 와 category CHECK 의 **실제 이름**.
-- 054 는 `place_reports_target_type_chk` / `place_reports_category_chk` 를
-- DROP 대상으로 적어 두었다. 실제 이름이 다르면 그 DROP 은 아무것도 하지 않고
-- 옛 제약이 살아남아 shared_story 를 계속 거부한다.
-- (054 안의 자기검증이 이 경우 EXCEPTION 을 던지고 전부 되돌린다.)
SELECT c.conname       AS constraint_name,
       c.contype       AS constraint_type,   -- c=CHECK, u=UNIQUE, f=FK, p=PK
       c.convalidated  AS validated,
       pg_get_constraintdef(c.oid) AS definition
  FROM pg_constraint c
 WHERE c.conrelid = 'public.place_reports'::regclass
 ORDER BY c.contype, c.conname;

-- ═══════════════════════════════════════════════════════════════════════════
-- D. itineraries moderation baseline — 054 가 더할 자리
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 기대: is_public 은 있고, moderation_hidden_at 은 **없어야** 한다.
SELECT column_name, data_type, udt_name, is_nullable, column_default
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name   = 'itineraries'
   AND column_name IN ('is_public','moderation_hidden_at')
 ORDER BY column_name;

-- D-2. 이름이 겹칠 만한 기존 제약·인덱스가 있는지
SELECT c.conname AS constraint_name,
       pg_get_constraintdef(c.oid) AS definition
  FROM pg_constraint c
 WHERE c.conrelid = 'public.itineraries'::regclass
   AND pg_get_constraintdef(c.oid) LIKE '%moderation%'
 ORDER BY c.conname;

SELECT indexname, indexdef
  FROM pg_indexes
 WHERE schemaname = 'public'
   AND tablename  = 'itineraries'
 ORDER BY indexname;

-- ═══════════════════════════════════════════════════════════════════════════
-- E. RLS 상태 — 053·054 적용 전후로 바뀌면 안 되는 값
-- ═══════════════════════════════════════════════════════════════════════════
SELECT c.relname,
       c.relrowsecurity      AS rls_enabled,
       c.relforcerowsecurity AS rls_forced
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public'
   AND c.relname IN ('trip_moments','trip_moment_photos','place_reports','itineraries')
 ORDER BY c.relname;

-- E-2. 정책 개수 (042 는 place_reports 에 정책을 두지 않는 것이 의도다)
SELECT tablename, policyname, roles, cmd
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename IN ('trip_moments','trip_moment_photos','place_reports','itineraries')
 ORDER BY tablename, policyname;

-- ═══════════════════════════════════════════════════════════════════════════
-- F. 권한 — anon/authenticated 에 직접 접근이 열려 있으면 안 된다
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 두 가지 방법으로 본다. information_schema 쪽은 보는 사람의 권한에 따라
-- 일부가 빠질 수 있어서, catalog(relacl) 결과를 함께 확인한다.
SELECT table_name, grantee, privilege_type
  FROM information_schema.role_table_grants
 WHERE table_schema = 'public'
   AND table_name IN ('trip_moments','trip_moment_photos','place_reports','itineraries')
   AND grantee IN ('anon','authenticated','service_role','postgres','PUBLIC')
 ORDER BY table_name, grantee, privilege_type;

-- F-2. catalog 원본. relacl 이 NULL 이면 기본 권한(소유자만)이라는 뜻이다.
SELECT c.relname,
       a.grantee::regrole::text AS grantee,
       a.privilege_type
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  LEFT JOIN LATERAL aclexplode(c.relacl) a ON TRUE
 WHERE n.nspname = 'public'
   AND c.relname IN ('trip_moments','trip_moment_photos','place_reports','itineraries')
 ORDER BY c.relname, grantee, a.privilege_type;

-- ═══════════════════════════════════════════════════════════════════════════
-- G. 집계 — 개인 데이터 값 없이 수치만
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 직전 precheck 값과 달라졌는지 본다.
--   trip_moments 0 / is_public=true 0 / place_reports 5 / itineraries 65(50·15)
WITH moments AS (
  SELECT count(*) AS total,
         count(*) FILTER (WHERE is_public IS TRUE)  AS public_true,
         count(*) FILTER (WHERE is_public IS FALSE) AS public_false,
         count(*) FILTER (WHERE is_public IS NULL)  AS public_null
    FROM public.trip_moments
),
trips AS (
  SELECT count(*) AS total,
         count(*) FILTER (WHERE is_public IS TRUE)  AS public_true,
         count(*) FILTER (WHERE is_public IS FALSE) AS public_false,
         count(*) FILTER (WHERE is_public IS NULL)  AS public_null
    FROM public.itineraries
),
photos AS (SELECT count(*) AS total FROM public.trip_moment_photos),
reports AS (SELECT count(*) AS total FROM public.place_reports)
SELECT 'trip_moments'       AS table_name, m.total, m.public_true, m.public_false, m.public_null
  FROM moments m
UNION ALL
SELECT 'itineraries', t.total, t.public_true, t.public_false, t.public_null FROM trips t
UNION ALL
SELECT 'trip_moment_photos', p.total, NULL, NULL, NULL FROM photos p
UNION ALL
SELECT 'place_reports', r.total, NULL, NULL, NULL FROM reports r;

-- G-2. 신고 분포 — 054 의 새 CHECK 를 기존 행이 위반하지 않는지 본다.
--      note(사용자가 쓴 글)·reporter_key 는 읽지 않는다.
SELECT target_type, category, status, count(*) AS rows
  FROM public.place_reports
 GROUP BY target_type, category, status
 ORDER BY target_type, category, status;
