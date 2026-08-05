-- 037: increment_trip_view 의 공개 EXECUTE 회수 (서버 경유 전환 완료 후)
--
-- 순서가 중요하다
--   036 이 dedupe 테이블과 서버 전용 recorder 를 만들고,
--   Pages Function /api/itinerary/view/:id 가 배포되어 브라우저가 그쪽을 쓰기
--   시작한 **뒤에** 이 파일을 적용한다. 먼저 적용하면 아직 옛 경로를 쓰는
--   브라우저의 조회수 집계가 조용히 끊긴다.
--
-- 무엇을 하는가
--   public.increment_trip_view(uuid) 의 anon·authenticated·PUBLIC EXECUTE 회수.
--   이제 이 함수는 외부에서 직접 호출할 수 없다.
--
-- 무엇을 하지 않는가
--   - 함수를 DROP 하지 않는다. 035 하드닝 상태 그대로 보존해 비상 복구 경로로 둔다.
--   - 함수 본문·signature·반환형·owner·search_path 를 바꾸지 않는다.
--   - service_role EXECUTE 를 유지한다.
--   - 다른 함수·테이블·정책·데이터를 건드리지 않는다.
--
-- 적용은 검증된 SQL 수동 적용으로만 한다. supabase db push 금지, migration repair
-- 금지, 원격 history 기록하지 않음 (데이터 계약 v1 HARD STOP).

BEGIN;

-- ── 0. 적용 전 baseline ──────────────────────────────────────────────────────
CREATE TEMP TABLE _037_baseline ON COMMIT DROP AS
SELECT
  p.oid                                                     AS fn_oid,
  pg_get_functiondef(p.oid)                                 AS fn_def,
  pg_get_userbyid(p.proowner)                               AS owner,
  coalesce(array_to_string(p.proconfig, ','), '')            AS cfg,
  (SELECT count(*) FROM public.itineraries)                 AS n_rows,
  (SELECT md5(string_agg(i.id::text || ':' || coalesce(i.view_count, -1)::text || ':' || i.is_public::text,
                         '|' ORDER BY i.id::text)) FROM public.itineraries i) AS data_fp,
  (SELECT md5(string_agg(q.pn || q.pa || coalesce(q.pc, ''), '|' ORDER BY q.pn, q.pa))
     FROM (SELECT p2.proname pn,
                  pg_get_function_identity_arguments(p2.oid) pa,
                  pg_catalog.array_to_string(p2.proacl, ',') pc
             FROM pg_proc p2 JOIN pg_namespace n2 ON n2.oid = p2.pronamespace
            WHERE n2.nspname = 'public' AND p2.proname <> 'increment_trip_view') q) AS other_fn_fp
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'increment_trip_view';

DO $baseline$
DECLARE b record; v_n bigint;
BEGIN
  SELECT count(*) INTO v_n FROM _037_baseline;
  IF v_n <> 1 THEN RAISE EXCEPTION '[037] increment_trip_view signature 가 % 개다', v_n; END IF;
  SELECT * INTO b FROM _037_baseline;

  -- 035 하드닝 상태여야 한다
  IF b.owner <> 'postgres'          THEN RAISE EXCEPTION '[037] owner 가 postgres 가 아니다'; END IF;
  IF b.cfg   <> 'search_path=""'    THEN RAISE EXCEPTION '[037] search_path 가 빈 값이 아니다 — 035 미적용'; END IF;
  IF b.fn_def NOT ILIKE '%is_public is true%' THEN RAISE EXCEPTION '[037] is_public 가드가 없다 — 035 미적용'; END IF;

  -- 회수 대상 권한이 실제로 있어야 이 migration 이 의미가 있다
  IF NOT has_function_privilege('anon',          b.fn_oid, 'EXECUTE') THEN
    RAISE EXCEPTION '[037] anon EXECUTE 가 이미 없다 — 예상 baseline 이 아니다'; END IF;
  IF NOT has_function_privilege('authenticated', b.fn_oid, 'EXECUTE') THEN
    RAISE EXCEPTION '[037] authenticated EXECUTE 가 이미 없다 — 예상 baseline 이 아니다'; END IF;
  IF     has_function_privilege('public',        b.fn_oid, 'EXECUTE') THEN
    RAISE EXCEPTION '[037] PUBLIC EXECUTE 가 있다 — 예상 baseline 이 아니다'; END IF;
  IF NOT has_function_privilege('service_role',  b.fn_oid, 'EXECUTE') THEN
    RAISE EXCEPTION '[037] service_role EXECUTE 가 없다'; END IF;

  -- 서버 경유 전환의 전제: 036 이 적용돼 있어야 한다
  IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                  WHERE n.nspname = 'public' AND c.relname = 'itinerary_view_dedup') THEN
    RAISE EXCEPTION '[037] itinerary_view_dedup 가 없다 — 036 을 먼저 적용해야 한다';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'public' AND p.proname = 'record_public_itinerary_view') THEN
    RAISE EXCEPTION '[037] record_public_itinerary_view 가 없다 — 036 을 먼저 적용해야 한다';
  END IF;

  RAISE NOTICE '[037] baseline OK';
END
$baseline$;

-- ── 1. 공개 EXECUTE 회수 ────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.increment_trip_view(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.increment_trip_view(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_trip_view(uuid) FROM PUBLIC;

-- 서버 경로는 유지한다 (비상 복구·수동 보정용).
GRANT EXECUTE ON FUNCTION public.increment_trip_view(uuid) TO service_role;

-- ── 2. 적용 후 검증 ─────────────────────────────────────────────────────────
DO $verify$
DECLARE b record; v_oid oid;
BEGIN
  SELECT * INTO b FROM _037_baseline;

  SELECT p.oid INTO v_oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'increment_trip_view';
  IF v_oid <> b.fn_oid THEN RAISE EXCEPTION '[037] 함수 oid 가 바뀌었다'; END IF;

  -- 2-1. 권한 최종 상태
  IF has_function_privilege('anon',          v_oid, 'EXECUTE') THEN RAISE EXCEPTION '[037] anon EXECUTE 가 남았다'; END IF;
  IF has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN RAISE EXCEPTION '[037] authenticated EXECUTE 가 남았다'; END IF;
  IF has_function_privilege('public',        v_oid, 'EXECUTE') THEN RAISE EXCEPTION '[037] PUBLIC EXECUTE 가 남았다'; END IF;
  IF NOT has_function_privilege('service_role', v_oid, 'EXECUTE') THEN RAISE EXCEPTION '[037] service_role EXECUTE 를 잃었다'; END IF;
  IF NOT has_function_privilege('postgres',     v_oid, 'EXECUTE') THEN RAISE EXCEPTION '[037] postgres EXECUTE 를 잃었다'; END IF;

  -- 2-2. 함수 자체는 무변경 (본문·signature·owner·search_path)
  IF pg_get_functiondef(v_oid) <> b.fn_def THEN RAISE EXCEPTION '[037] 함수 정의가 바뀌었다 — 권한만 바꿔야 한다'; END IF;
  IF (SELECT pg_get_userbyid(p.proowner) FROM pg_proc p WHERE p.oid = v_oid) <> b.owner THEN
    RAISE EXCEPTION '[037] owner 가 바뀌었다'; END IF;

  -- 2-3. recorder 는 그대로 service_role 전용
  IF has_function_privilege('anon', 'public.record_public_itinerary_view(uuid, text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.record_public_itinerary_view(uuid, text)', 'EXECUTE')
     OR has_function_privilege('public', 'public.record_public_itinerary_view(uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION '[037] recorder 가 일반 role 에 열렸다';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.record_public_itinerary_view(uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION '[037] recorder 의 service_role EXECUTE 가 사라졌다'; END IF;

  -- 2-4. 다른 함수 권한·데이터 무변경
  IF (SELECT md5(string_agg(q.pn || q.pa || coalesce(q.pc, ''), '|' ORDER BY q.pn, q.pa))
        FROM (SELECT p2.proname pn, pg_get_function_identity_arguments(p2.oid) pa,
                     pg_catalog.array_to_string(p2.proacl, ',') pc
                FROM pg_proc p2 JOIN pg_namespace n2 ON n2.oid = p2.pronamespace
               WHERE n2.nspname = 'public' AND p2.proname <> 'increment_trip_view') q) <> b.other_fn_fp THEN
    RAISE EXCEPTION '[037] 다른 함수의 정의나 권한이 바뀌었다';
  END IF;
  IF (SELECT count(*) FROM public.itineraries) <> b.n_rows THEN
    RAISE EXCEPTION '[037] itineraries 행 수가 바뀌었다'; END IF;
  IF (SELECT md5(string_agg(i.id::text || ':' || coalesce(i.view_count, -1)::text || ':' || i.is_public::text,
                            '|' ORDER BY i.id::text)) FROM public.itineraries i) <> b.data_fp THEN
    RAISE EXCEPTION '[037] itineraries 데이터가 바뀌었다'; END IF;

  RAISE NOTICE '[037] 검증 통과 — 공개 EXECUTE 회수, 함수 본문·service_role·다른 자산 보존';
END
$verify$;

-- 적용 결과 확인용 출력
SELECT
  p.proname,
  coalesce(pg_catalog.array_to_string(p.proacl, ' | '), '(none)')  AS acl,
  has_function_privilege('anon',          p.oid, 'EXECUTE')         AS anon_exec,
  has_function_privilege('authenticated', p.oid, 'EXECUTE')         AS auth_exec,
  has_function_privilege('public',        p.oid, 'EXECUTE')         AS public_exec,
  has_function_privilege('service_role',  p.oid, 'EXECUTE')         AS svc_exec
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('increment_trip_view', 'record_public_itinerary_view')
ORDER BY p.proname;

COMMIT;


-- ── ROLLBACK (비상 복구 전용 — 정상 절차가 아니다) ──────────────────────────
--
-- 서버 경로(Pages Function)가 실패해 조회수 집계가 끊긴 경우에만 쓴다.
-- 함수 본문은 035 하드닝 상태 그대로이며 되돌리지 않는다.
--
--   BEGIN;
--   GRANT EXECUTE ON FUNCTION public.increment_trip_view(uuid) TO anon, authenticated;
--   COMMIT;
--
--   PUBLIC 에는 복원하지 않는다 — 적용 전에도 PUBLIC EXECUTE 는 없었다.
--   service_role 은 회수한 적이 없다.
--   복구 후 기대: anon=X · authenticated=X · service_role=X · PUBLIC 없음
