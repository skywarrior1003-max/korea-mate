-- 036: 조회수 서버 집계 기반 — 기기별 24시간 중복 방지 테이블 + 서버 전용 RPC
--
-- 왜 필요한가
--   035 가 비공개 일정 조작은 막았지만, 공개 일정 UUID 를 아는 스크립트가
--   increment_trip_view 를 무한 반복 호출해 조회수를 부풀리는 경로는 그대로다.
--   브라우저 sessionStorage 는 보안 통제가 아니다(지우면 그만이고 curl 은 아예 무관).
--   Popular·Trending 순위가 view_count 를 쓰므로 사업 지표 무결성 문제이기도 하다.
--
-- 이 파일이 만드는 것
--   1. public.itinerary_view_dedup   — (itinerary_id, viewer_hash) 당 1행
--   2. public.record_public_itinerary_view(uuid, text) → boolean  (service_role 전용)
--
--   집계 정책: 같은 공개 일정 + 같은 기기 = rolling 24시간당 1회
--
-- 기기 식별
--   viewer_hash 는 **서버가 SHA-256 한 소문자 64자리 hex** 만 받는다.
--   raw device_id 는 DB 에 저장하지 않는다. IP·User-Agent·fingerprint 는 쓰지 않는다.
--   (참고: 기존 itinerary_helpful_votes 는 device_id 원문을 저장한다. 그 테이블은
--    이번 범위가 아니며 건드리지 않는다 — 별도 항목으로 남긴다.)
--
-- 원자성이 핵심이다
--   "SELECT 로 중복 확인 → UPDATE 로 증가" 로 나누면 동시 요청 두 건이 모두
--   통과해 +2 가 된다. 그래서 dedupe upsert **한 문장**의 RETURNING 결과로
--   집계 여부를 결정한다.
--     ON CONFLICT ... DO UPDATE ... WHERE last_counted_at <= now() - 24h
--   충돌한 쪽은 WHERE 가 거짓이면 아무 행도 돌려주지 않는다(=0). 즉 같은 키의
--   동시 요청 중 정확히 하나만 1을 받는다. 두 번째 트랜잭션은 유니크 인덱스에서
--   첫 번째가 커밋될 때까지 기다린 뒤 DO UPDATE 경로로 들어가고, 그때
--   last_counted_at 은 방금 now() 라 조건이 거짓이 된다.
--
-- 이 파일이 하지 않는 것
--   - increment_trip_view 를 건드리지 않는다 (권한 회수는 037, 서버 전환 후)
--   - 다른 테이블·함수·정책·데이터를 바꾸지 않는다
--   - IP·User-Agent·분석 컬럼을 만들지 않는다
--
-- 적용은 검증된 SQL 수동 적용으로만 한다. supabase db push 금지, migration repair
-- 금지, 원격 history 기록하지 않음 (데이터 계약 v1 HARD STOP).

BEGIN;

-- ── 0. 적용 전 baseline ──────────────────────────────────────────────────────
CREATE TEMP TABLE _036_baseline ON COMMIT DROP AS
SELECT
  (SELECT count(*) FROM public.itineraries)                    AS n_rows,
  (SELECT md5(string_agg(i.id::text || ':' || coalesce(i.view_count, -1)::text || ':' || i.is_public::text,
                         '|' ORDER BY i.id::text)) FROM public.itineraries i) AS data_fp,
  (SELECT coalesce(pg_catalog.array_to_string(c.relacl, ','), '') || ':' || c.relrowsecurity::text || ':' ||
          (SELECT count(*) FROM pg_policies pl WHERE pl.schemaname = 'public' AND pl.tablename = 'itineraries')::text
     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'itineraries')  AS itin_fp,
  (SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'increment_trip_view')          AS itv_oid,
  (SELECT md5(pg_get_functiondef(p.oid) ||
              coalesce(pg_catalog.array_to_string(p.proacl, ','), ''))
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'increment_trip_view')          AS itv_fp;

DO $baseline$
DECLARE b record;
BEGIN
  SELECT * INTO b FROM _036_baseline;

  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
              WHERE n.nspname = 'public' AND c.relname = 'itinerary_view_dedup') THEN
    RAISE EXCEPTION '[036] itinerary_view_dedup 가 이미 있다 — 이중 적용';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public' AND p.proname = 'record_public_itinerary_view') THEN
    RAISE EXCEPTION '[036] record_public_itinerary_view 가 이미 있다 — 이중 적용';
  END IF;

  -- 대상 컬럼 존재
  IF (SELECT count(*) FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'itineraries'
         AND column_name IN ('id', 'is_public', 'view_count')) <> 3 THEN
    RAISE EXCEPTION '[036] itineraries 의 id/is_public/view_count 중 없는 컬럼이 있다';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint con
                   JOIN pg_class c ON c.oid = con.conrelid
                   JOIN pg_namespace n ON n.oid = c.relnamespace
                  WHERE n.nspname = 'public' AND c.relname = 'itineraries' AND con.contype = 'p') THEN
    RAISE EXCEPTION '[036] itineraries 에 기본키가 없다 — 외래키를 걸 수 없다';
  END IF;

  -- 035 하드닝 상태가 그대로인지 (036 은 이 함수를 건드리지 않는다)
  IF b.itv_oid IS NULL THEN RAISE EXCEPTION '[036] increment_trip_view 가 없다'; END IF;
  IF NOT (SELECT pg_get_functiondef(b.itv_oid) ILIKE '%is_public is true%') THEN
    RAISE EXCEPTION '[036] increment_trip_view 가 035 하드닝 상태가 아니다';
  END IF;

  RAISE NOTICE '[036] baseline OK — itineraries rows=%', b.n_rows;
END
$baseline$;

-- ── 1. dedupe 테이블 ────────────────────────────────────────────────────────
--
-- 컬럼은 집계에 필요한 최소만 둔다. IP·User-Agent·분석용 컬럼을 만들지 않는다.
CREATE TABLE public.itinerary_view_dedup (
  itinerary_id     uuid        NOT NULL
                     REFERENCES public.itineraries(id) ON DELETE CASCADE,
  -- 서버가 SHA-256 한 소문자 64자리 hex 만 허용한다. 원문 device_id 가 들어오면
  -- 형식에서 걸린다(UUID 는 36자, hex 아님).
  viewer_hash      text        NOT NULL
                     CONSTRAINT itinerary_view_dedup_hash_format
                     CHECK (viewer_hash ~ '^[0-9a-f]{64}$'),
  first_counted_at timestamptz NOT NULL DEFAULT now(),
  last_counted_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT itinerary_view_dedup_pkey PRIMARY KEY (itinerary_id, viewer_hash)
);

COMMENT ON TABLE public.itinerary_view_dedup IS
  '공개 일정 조회수 중복 방지. (itinerary_id, viewer_hash) 당 1행, rolling 24시간 1회 집계. viewer_hash 는 서버가 SHA-256 한 값이며 raw device_id 를 저장하지 않는다.';

-- 기본키 인덱스가 조회·충돌 판정을 모두 담당한다. 외래키 CASCADE 는 itineraries 의
-- 기본키 인덱스를 쓴다. 추가 인덱스를 만들지 않는다.

-- ── 2. 테이블 보안 ──────────────────────────────────────────────────────────
--
-- RLS 를 켜고 정책을 만들지 않는다. 서버(service_role)는 BYPASSRLS 라 영향이 없고
-- anon·authenticated 는 grant 와 정책 두 겹으로 막힌다.
ALTER TABLE public.itinerary_view_dedup ENABLE ROW LEVEL SECURITY;

-- 새 테이블은 ALTER DEFAULT PRIVILEGES 로 anon/authenticated 에 권한이 붙는다.
-- Data API 로 노출되지 않도록 전부 걷는다.
REVOKE ALL PRIVILEGES ON TABLE public.itinerary_view_dedup FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.itinerary_view_dedup FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.itinerary_view_dedup FROM authenticated;
GRANT  ALL PRIVILEGES ON TABLE public.itinerary_view_dedup TO   service_role;

-- ── 3. 서버 전용 집계 함수 ──────────────────────────────────────────────────
CREATE FUNCTION public.record_public_itinerary_view(
  p_itinerary_id uuid,
  p_viewer_hash  text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_counted integer := 0;
BEGIN
  -- 입력 검증 — 어떤 경우에도 예외를 밖으로 흘리지 않는다.
  -- 일정의 존재 여부·공개 여부를 응답으로 구분할 수 없어야 한다.
  IF p_itinerary_id IS NULL OR p_viewer_hash IS NULL THEN
    RETURN false;
  END IF;
  IF p_viewer_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN false;
  END IF;

  -- 중복 판정과 집계 인정을 한 문장으로 처리한다(원자성).
  --   · 대상이 공개가 아니면 WHERE EXISTS 가 거짓이라 INSERT 자체가 없다
  --   · 첫 요청이면 INSERT → 1행 반환
  --   · 24시간 지난 재요청이면 DO UPDATE 조건 통과 → 1행 반환
  --   · 24시간 이내 재요청이면 DO UPDATE 의 WHERE 가 거짓 → 0행
  -- 시각은 전부 DB 의 now() 다. 브라우저·서버 시계를 신뢰하지 않는다.
  WITH counted AS (
    INSERT INTO public.itinerary_view_dedup AS d (itinerary_id, viewer_hash)
    SELECT p_itinerary_id, p_viewer_hash
     WHERE EXISTS (
       SELECT 1 FROM public.itineraries i
        WHERE i.id = p_itinerary_id
          AND i.is_public IS TRUE
     )
    ON CONFLICT (itinerary_id, viewer_hash) DO UPDATE
       SET last_counted_at = now()
     WHERE d.last_counted_at <= now() - interval '24 hours'
    RETURNING 1 AS hit
  )
  SELECT count(*) INTO v_counted FROM counted;

  IF v_counted = 1 THEN
    -- 인정된 요청만 정확히 +1. 증가량은 클라이언트가 넣을 수 없다.
    UPDATE public.itineraries
       SET view_count = COALESCE(view_count, 0) + 1
     WHERE id = p_itinerary_id
       AND is_public IS TRUE;
    RETURN true;
  END IF;

  RETURN false;
END;
$function$;

ALTER FUNCTION public.record_public_itinerary_view(uuid, text) OWNER TO postgres;

-- 함수는 기본으로 PUBLIC EXECUTE 를 갖는다. 서버 전용이므로 전부 걷고
-- service_role 에만 준다.
REVOKE ALL ON FUNCTION public.record_public_itinerary_view(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_public_itinerary_view(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.record_public_itinerary_view(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.record_public_itinerary_view(uuid, text) TO service_role;

COMMENT ON FUNCTION public.record_public_itinerary_view(uuid, text) IS
  '공개 일정 조회수를 기기별 24시간 1회로 집계한다. service_role 전용. true=이번 요청으로 증가함.';

-- ── 4. 적용 후 검증 ─────────────────────────────────────────────────────────
DO $verify$
DECLARE
  b      record;
  v_oid  oid;
  v_priv text;
  v_n    bigint;
BEGIN
  SELECT * INTO b FROM _036_baseline;

  -- 4-1. 테이블 구조
  IF (SELECT count(*) FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'itinerary_view_dedup') <> 4 THEN
    RAISE EXCEPTION '[036] dedupe 테이블 컬럼 수가 4가 아니다';
  END IF;
  IF (SELECT count(*) FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'itinerary_view_dedup'
         AND column_name IN ('itinerary_id', 'viewer_hash', 'first_counted_at', 'last_counted_at')) <> 4 THEN
    RAISE EXCEPTION '[036] dedupe 테이블 컬럼 이름이 예상과 다르다';
  END IF;
  -- raw device id 를 담을 만한 컬럼이 없어야 한다
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'itinerary_view_dedup'
                AND (column_name ILIKE '%device%' OR column_name ILIKE '%ip%'
                  OR column_name ILIKE '%agent%' OR column_name ILIKE '%fingerprint%')) THEN
    RAISE EXCEPTION '[036] dedupe 테이블에 기기 식별 원문 컬럼이 있다';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'itinerary_view_dedup_pkey') THEN
    RAISE EXCEPTION '[036] 기본키가 없다';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'itinerary_view_dedup_hash_format') THEN
    RAISE EXCEPTION '[036] viewer_hash 형식 제약이 없다';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint con
                   JOIN pg_class c ON c.oid = con.conrelid
                   JOIN pg_namespace n ON n.oid = c.relnamespace
                  WHERE n.nspname = 'public' AND c.relname = 'itinerary_view_dedup'
                    AND con.contype = 'f' AND con.confdeltype = 'c') THEN
    RAISE EXCEPTION '[036] itineraries 외래키(ON DELETE CASCADE)가 없다';
  END IF;

  -- 4-2. 테이블 보안
  IF NOT (SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relname = 'itinerary_view_dedup') THEN
    RAISE EXCEPTION '[036] dedupe 테이블 RLS 가 꺼져 있다';
  END IF;
  IF (SELECT count(*) FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'itinerary_view_dedup') <> 0 THEN
    RAISE EXCEPTION '[036] dedupe 테이블에 정책이 있다';
  END IF;
  FOREACH v_priv IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'] LOOP
    IF has_table_privilege('anon',          'public.itinerary_view_dedup', v_priv) THEN
      RAISE EXCEPTION '[036] anon 이 dedupe 테이블에 % 를 가진다', v_priv; END IF;
    IF has_table_privilege('authenticated', 'public.itinerary_view_dedup', v_priv) THEN
      RAISE EXCEPTION '[036] authenticated 가 dedupe 테이블에 % 를 가진다', v_priv; END IF;
    IF has_table_privilege('public',        'public.itinerary_view_dedup', v_priv) THEN
      RAISE EXCEPTION '[036] PUBLIC 이 dedupe 테이블에 % 를 가진다', v_priv; END IF;
    IF NOT has_table_privilege('service_role', 'public.itinerary_view_dedup', v_priv) THEN
      RAISE EXCEPTION '[036] service_role 이 dedupe 테이블의 % 를 잃었다', v_priv; END IF;
  END LOOP;
  IF (SELECT count(*) FROM information_schema.column_privileges
       WHERE table_schema = 'public' AND table_name = 'itinerary_view_dedup'
         AND grantee IN ('anon', 'authenticated', 'PUBLIC')) <> 0 THEN
    RAISE EXCEPTION '[036] dedupe 테이블에 컬럼 단위 권한이 남았다';
  END IF;

  -- 4-3. 함수
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'record_public_itinerary_view';
  IF v_n <> 1 THEN RAISE EXCEPTION '[036] recorder 함수가 % 개다 — overload', v_n; END IF;

  SELECT p.oid INTO v_oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'record_public_itinerary_view';

  IF NOT (SELECT p.prosecdef FROM pg_proc p WHERE p.oid = v_oid) THEN
    RAISE EXCEPTION '[036] recorder 가 SECURITY DEFINER 가 아니다'; END IF;
  IF (SELECT pg_get_userbyid(p.proowner) FROM pg_proc p WHERE p.oid = v_oid) <> 'postgres' THEN
    RAISE EXCEPTION '[036] recorder owner 가 postgres 가 아니다'; END IF;
  IF (SELECT coalesce(array_to_string(p.proconfig, ','), '') FROM pg_proc p WHERE p.oid = v_oid) <> 'search_path=""' THEN
    RAISE EXCEPTION '[036] recorder search_path 가 빈 값이 아니다'; END IF;
  IF pg_get_function_result(v_oid) <> 'boolean' THEN
    RAISE EXCEPTION '[036] recorder 반환형이 boolean 이 아니다'; END IF;
  IF     has_function_privilege('anon',          v_oid, 'EXECUTE') THEN RAISE EXCEPTION '[036] anon 이 recorder 를 실행할 수 있다'; END IF;
  IF     has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN RAISE EXCEPTION '[036] authenticated 가 recorder 를 실행할 수 있다'; END IF;
  IF     has_function_privilege('public',        v_oid, 'EXECUTE') THEN RAISE EXCEPTION '[036] PUBLIC 이 recorder 를 실행할 수 있다'; END IF;
  IF NOT has_function_privilege('service_role',  v_oid, 'EXECUTE') THEN RAISE EXCEPTION '[036] service_role 이 recorder 를 실행할 수 없다'; END IF;
  IF pg_get_functiondef(v_oid) ILIKE '%execute %' THEN RAISE EXCEPTION '[036] recorder 에 동적 SQL 이 있다'; END IF;

  -- 4-4. 기존 자산 무변경
  IF (SELECT md5(pg_get_functiondef(p.oid) || coalesce(pg_catalog.array_to_string(p.proacl, ','), ''))
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'increment_trip_view') <> b.itv_fp THEN
    RAISE EXCEPTION '[036] increment_trip_view 의 정의나 권한이 바뀌었다';
  END IF;
  IF (SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'increment_trip_view') <> b.itv_oid THEN
    RAISE EXCEPTION '[036] increment_trip_view 의 oid 가 바뀌었다';
  END IF;
  IF (SELECT count(*) FROM public.itineraries) <> b.n_rows THEN
    RAISE EXCEPTION '[036] itineraries 행 수가 바뀌었다'; END IF;
  IF (SELECT md5(string_agg(i.id::text || ':' || coalesce(i.view_count, -1)::text || ':' || i.is_public::text,
                            '|' ORDER BY i.id::text)) FROM public.itineraries i) <> b.data_fp THEN
    RAISE EXCEPTION '[036] itineraries 데이터가 바뀌었다'; END IF;
  IF (SELECT coalesce(pg_catalog.array_to_string(c.relacl, ','), '') || ':' || c.relrowsecurity::text || ':' ||
             (SELECT count(*) FROM pg_policies pl WHERE pl.schemaname = 'public' AND pl.tablename = 'itineraries')::text
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relname = 'itineraries') <> b.itin_fp THEN
    RAISE EXCEPTION '[036] itineraries 의 ACL·RLS·정책이 바뀌었다'; END IF;
  IF (SELECT count(*) FROM public.itinerary_view_dedup) <> 0 THEN
    RAISE EXCEPTION '[036] dedupe 테이블이 비어 있지 않다'; END IF;

  RAISE NOTICE '[036] 검증 통과 — dedupe 테이블·서버 전용 recorder 생성, 기존 자산 무변경';
END
$verify$;

-- 적용 결과 확인용 출력
SELECT
  'itinerary_view_dedup' AS obj,
  (SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'itinerary_view_dedup')                    AS rls,
  (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'itinerary_view_dedup') AS policies,
  (SELECT coalesce(pg_catalog.array_to_string(c.relacl, ' | '), '(none)') FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'itinerary_view_dedup')                    AS acl,
  (SELECT coalesce(pg_catalog.array_to_string(p.proacl, ' | '), '(none)') FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'record_public_itinerary_view')            AS recorder_acl;

COMMIT;


-- ── ROLLBACK (비상 복구 전용 — 정상 적용 절차가 아니다) ──────────────────────
--
-- 036 은 새 객체만 만들고 기존 자산을 건드리지 않는다. 되돌리려면 새 객체만 지운다.
-- 단, 이미 집계된 dedupe 행이 사라지면 그 기기들이 24시간 안에 한 번 더 집계될 수
-- 있다. view_count 는 되돌리지 않는다(실제 조회 기록이다).
--
--   BEGIN;
--   DROP FUNCTION IF EXISTS public.record_public_itinerary_view(uuid, text);
--   DROP TABLE    IF EXISTS public.itinerary_view_dedup;
--   COMMIT;
--
--   ⚠ 037 을 이미 적용했다면 먼저 037 rollback 으로 increment_trip_view 의
--     anon·authenticated EXECUTE 를 복원해야 조회수 경로가 살아난다.
