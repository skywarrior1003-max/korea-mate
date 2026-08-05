-- 035: increment_trip_view 권한 결함 수정 (비공개 일정 조회수 조작 차단)
--
-- 무엇이 문제인가 (2026-08-05 운영 실측)
--   public.increment_trip_view(trip_id_param uuid) — SECURITY DEFINER, anon EXECUTE 허용
--     BEGIN
--       UPDATE itineraries SET view_count = view_count + 1 WHERE id = trip_id_param;
--     END;
--   is_public 조건이 없다. UUID 만 알면 **비공개 일정의 view_count 도 올릴 수 있다**.
--   적용 시점 실측: itineraries 65행 = 공개 50 / 비공개 15 → 비공개 15건이 노출돼 있었다.
--
--   이 함수는 카운터 4종 중 유일하게 anon·authenticated EXECUTE 를 가진다.
--     get_shared_itinerary       anon O  is_public 강제 O
--     increment_trip_view        anon O  is_public 강제 X   ← 이 파일이 고친다
--     increment_trip_helpful     anon X
--     increment_copy_count       anon X
--     add_itinerary_helpful_vote anon X
--   즉 외부에서 직접 닿는 카운터는 이것 하나뿐이다.
--
-- 017 이 예고한 Phase 2
--   017_lockdown_itineraries.sql:122-126 은 본문이 'UPDATE itineraries' 로 스키마
--   비수식이라 search_path='' 를 걸면 함수가 깨진다고 기록하고, 최소 조치로
--   search_path=public 만 적용한 뒤 "Phase 2에서 본문을 'UPDATE public.itineraries'
--   로 수정 후 재적용" 하라고 남겼다. 이 파일이 그 Phase 2 다.
--
-- 무엇을 바꾸는가
--   1. is_public IS TRUE 조건 추가       — 비공개·(향후 NULL) 일정 변경 0
--   2. COALESCE(view_count, 0) + 1       — view_count 가 nullable 이라 NULL 행을
--                                          만나면 NULL+1=NULL 로 카운터가 영구히 죽는다
--   3. SET search_path = ''              — 017 이 미룬 조치
--   4. public.itineraries 스키마 한정     — 3번의 전제
--
-- 무엇을 바꾸지 않는가
--   함수명·인자·반환형(void)·language(plpgsql)·volatility(VOLATILE)·strict(false)
--   owner(postgres)·SECURITY DEFINER·anon/authenticated/service_role EXECUTE
--   PUBLIC EXECUTE 는 원래 없고 부여하지 않는다.
--   테이블·컬럼·인덱스·트리거·RLS·정책·GRANT·데이터·다른 함수 전부 무변경.
--
--   DROP + CREATE 를 쓰지 않는다. ACL 이 기본값으로 초기화되어 anon·authenticated
--   EXECUTE 가 사라진다. CREATE OR REPLACE 는 owner 와 ACL 을 보존한다.
--
-- 이번 작업이 해결하지 않는 것
--   공개 일정 UUID 를 아는 외부 스크립트의 반복 호출은 여전히 가능하다.
--   브라우저 sessionStorage 는 보안 통제가 아니다. 근본 해결은 브라우저 직접 RPC 를
--   없애고 Pages Function 을 경유해 서버에서 중복을 제한하는 것이며 별도 작업이다.
--
-- 적용은 검증된 SQL 수동 적용으로만 한다. supabase db push 금지,
-- migration repair 금지, 원격 history 기록하지 않음
-- (데이터 계약 v1 "migration 수동 적용 운영 계약" HARD STOP).

BEGIN;

-- ── 0. 적용 전 baseline ──────────────────────────────────────────────────────
CREATE TEMP TABLE _035_baseline ON COMMIT DROP AS
SELECT
  p.oid                                              AS fn_oid,
  pg_get_function_identity_arguments(p.oid)          AS args,
  pg_get_function_result(p.oid)                      AS ret,
  l.lanname                                          AS lang,
  p.provolatile                                      AS vol,
  p.proisstrict                                      AS fn_strict,
  p.prosecdef                                        AS secdef,
  pg_get_userbyid(p.proowner)                        AS owner,
  coalesce(array_to_string(p.proconfig, ','), '')    AS cfg,
  (SELECT count(*) FROM public.itineraries)          AS n_rows,
  (SELECT md5(string_agg(i.id::text || ':' || coalesce(i.view_count, -1)::text || ':' || i.is_public::text,
                         '|' ORDER BY i.id::text))
     FROM public.itineraries i)                      AS data_fp,
  (SELECT md5(string_agg(q.pn || q.pa || q.pd, '|' ORDER BY q.pn, q.pa))
     FROM (SELECT p2.proname pn,
                  pg_get_function_identity_arguments(p2.oid) pa,
                  pg_get_functiondef(p2.oid) pd
             FROM pg_proc p2 JOIN pg_namespace n2 ON n2.oid = p2.pronamespace
            WHERE n2.nspname = 'public' AND p2.proname <> 'increment_trip_view') q) AS other_fn_fp,
  (SELECT coalesce(pg_catalog.array_to_string(c.relacl, ','), '') || ':' ||
          c.relrowsecurity::text || ':' ||
          (SELECT count(*) FROM pg_policies pl
            WHERE pl.schemaname = 'public' AND pl.tablename = 'itineraries')::text
     FROM pg_class c JOIN pg_namespace n3 ON n3.oid = c.relnamespace
    WHERE n3.nspname = 'public' AND c.relname = 'itineraries')  AS tbl_fp
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_language l ON l.oid = p.prolang
WHERE n.nspname = 'public' AND p.proname = 'increment_trip_view';

DO $baseline$
DECLARE b record; v_n bigint;
BEGIN
  SELECT count(*) INTO v_n FROM _035_baseline;
  IF v_n <> 1 THEN
    RAISE EXCEPTION '[035] increment_trip_view signature 가 1개가 아니다 (실측 %) — overload 존재', v_n;
  END IF;
  SELECT * INTO b FROM _035_baseline;

  IF b.args    <> 'trip_id_param uuid' THEN RAISE EXCEPTION '[035] 예상과 다른 인자: %', b.args; END IF;
  IF b.ret     <> 'void'               THEN RAISE EXCEPTION '[035] 예상과 다른 반환형: %', b.ret;  END IF;
  IF b.lang    <> 'plpgsql'            THEN RAISE EXCEPTION '[035] 예상과 다른 language: %', b.lang; END IF;
  IF b.vol     <> 'v'                  THEN RAISE EXCEPTION '[035] 예상과 다른 volatility: %', b.vol; END IF;
  IF b.fn_strict                       THEN RAISE EXCEPTION '[035] 예상과 달리 STRICT 다'; END IF;
  IF NOT b.secdef                      THEN RAISE EXCEPTION '[035] SECURITY DEFINER 가 아니다'; END IF;
  IF b.owner   <> 'postgres'           THEN RAISE EXCEPTION '[035] owner 가 postgres 가 아니다: %', b.owner; END IF;
  IF b.cfg     <> 'search_path=public' THEN RAISE EXCEPTION '[035] 예상과 다른 proconfig: %', b.cfg; END IF;

  -- 현재 본문에 is_public 가드가 없다는 사실이 이 migration 의 전제다
  IF pg_get_functiondef(b.fn_oid) ILIKE '%is_public%' THEN
    RAISE EXCEPTION '[035] 이미 is_public 조건이 있다 — baseline 이 아니다';
  END IF;

  -- 권한 baseline
  IF NOT has_function_privilege('anon',          b.fn_oid, 'EXECUTE') THEN RAISE EXCEPTION '[035] anon EXECUTE 가 없다'; END IF;
  IF NOT has_function_privilege('authenticated', b.fn_oid, 'EXECUTE') THEN RAISE EXCEPTION '[035] authenticated EXECUTE 가 없다'; END IF;
  IF NOT has_function_privilege('service_role',  b.fn_oid, 'EXECUTE') THEN RAISE EXCEPTION '[035] service_role EXECUTE 가 없다'; END IF;
  IF     has_function_privilege('public',        b.fn_oid, 'EXECUTE') THEN RAISE EXCEPTION '[035] PUBLIC EXECUTE 가 이미 있다'; END IF;

  -- 대상 컬럼 존재
  IF (SELECT count(*) FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'itineraries'
         AND column_name IN ('id', 'view_count', 'is_public')) <> 3 THEN
    RAISE EXCEPTION '[035] itineraries 의 id/view_count/is_public 중 없는 컬럼이 있다';
  END IF;

  RAISE NOTICE '[035] baseline OK — rows=% data_fp=%', b.n_rows, b.data_fp;
END
$baseline$;

-- ── 1. 함수 재정의 ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.increment_trip_view(trip_id_param uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  -- 공개 일정만 올린다. 존재하지 않는 id·비공개·(향후 NULL) 은 0행이 되어
  -- 아무 일도 일어나지 않는다. 존재 여부나 공개 여부를 예외로 흘리지 않는다.
  UPDATE public.itineraries
  SET view_count = COALESCE(view_count, 0) + 1
  WHERE id = trip_id_param
    AND is_public IS TRUE;
END;
$function$;

-- ── 2. 적용 후 검증 ─────────────────────────────────────────────────────────
DO $verify$
DECLARE
  b        record;
  v_n      bigint;
  v_oid    oid;
  v_def    text;
  v_before integer;
  v_after  integer;
  v_pub    uuid;
  v_priv   uuid;
BEGIN
  SELECT * INTO b FROM _035_baseline;

  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'increment_trip_view';
  IF v_n <> 1 THEN RAISE EXCEPTION '[035] 적용 후 signature 가 % 개다 — overload 생성', v_n; END IF;

  SELECT p.oid INTO v_oid
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'increment_trip_view';

  -- 2-1. 계약 보존 (oid 까지 동일해야 CREATE OR REPLACE 가 제자리 교체된 것이다)
  IF v_oid <> b.fn_oid THEN RAISE EXCEPTION '[035] 함수 oid 가 바뀌었다 — DROP+CREATE 로 교체됐다'; END IF;
  IF pg_get_function_identity_arguments(v_oid) <> b.args THEN RAISE EXCEPTION '[035] 인자가 바뀌었다'; END IF;
  IF pg_get_function_result(v_oid)             <> b.ret  THEN RAISE EXCEPTION '[035] 반환형이 바뀌었다'; END IF;
  IF (SELECT l.lanname FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang WHERE p.oid = v_oid) <> b.lang
    THEN RAISE EXCEPTION '[035] language 가 바뀌었다'; END IF;
  IF (SELECT p.provolatile  FROM pg_proc p WHERE p.oid = v_oid) <> b.vol    THEN RAISE EXCEPTION '[035] volatility 가 바뀌었다'; END IF;
  IF (SELECT p.proisstrict  FROM pg_proc p WHERE p.oid = v_oid) <> b.fn_strict THEN RAISE EXCEPTION '[035] strict 가 바뀌었다'; END IF;
  IF NOT (SELECT p.prosecdef FROM pg_proc p WHERE p.oid = v_oid)            THEN RAISE EXCEPTION '[035] SECURITY DEFINER 가 사라졌다'; END IF;
  IF (SELECT pg_get_userbyid(p.proowner) FROM pg_proc p WHERE p.oid = v_oid) <> 'postgres'
    THEN RAISE EXCEPTION '[035] owner 가 바뀌었다'; END IF;

  -- 2-2. search_path 가 빈 값으로 고정
  IF (SELECT coalesce(array_to_string(p.proconfig, ','), '') FROM pg_proc p WHERE p.oid = v_oid) <> 'search_path=""'
    THEN RAISE EXCEPTION '[035] search_path 가 빈 값으로 고정되지 않았다: %',
      (SELECT coalesce(array_to_string(p.proconfig, ','), '(none)') FROM pg_proc p WHERE p.oid = v_oid); END IF;

  -- 2-3. 정의 문자열 검사 (동작 검증과 함께 쓴다 — 문자열만으로 판정하지 않는다)
  v_def := pg_get_functiondef(v_oid);
  IF position('public.itineraries' in v_def) = 0        THEN RAISE EXCEPTION '[035] public.itineraries 스키마 한정이 없다'; END IF;
  IF v_def NOT ILIKE '%coalesce(view_count, 0) + 1%'    THEN RAISE EXCEPTION '[035] COALESCE(view_count, 0) + 1 이 없다'; END IF;
  IF v_def NOT ILIKE '%is_public is true%'              THEN RAISE EXCEPTION '[035] is_public IS TRUE 조건이 없다'; END IF;
  IF v_def ILIKE '%execute %'                           THEN RAISE EXCEPTION '[035] 동적 SQL 이 들어갔다'; END IF;

  -- 2-4. 권한 보존
  IF NOT has_function_privilege('anon',          v_oid, 'EXECUTE') THEN RAISE EXCEPTION '[035] anon EXECUTE 를 잃었다'; END IF;
  IF NOT has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN RAISE EXCEPTION '[035] authenticated EXECUTE 를 잃었다'; END IF;
  IF NOT has_function_privilege('service_role',  v_oid, 'EXECUTE') THEN RAISE EXCEPTION '[035] service_role EXECUTE 를 잃었다'; END IF;
  IF     has_function_privilege('public',        v_oid, 'EXECUTE') THEN RAISE EXCEPTION '[035] PUBLIC EXECUTE 가 생겼다'; END IF;

  -- 2-5. 실제 동작 — 공개 +1 / 비공개 +0. 이 트랜잭션 안에서만 확인하고
  --      아래에서 반드시 원래 값으로 되돌린다.
  SELECT i.id INTO v_pub  FROM public.itineraries i WHERE i.is_public IS TRUE  ORDER BY i.id LIMIT 1;
  SELECT i.id INTO v_priv FROM public.itineraries i WHERE i.is_public IS FALSE ORDER BY i.id LIMIT 1;

  IF v_pub IS NOT NULL THEN
    SELECT i.view_count INTO v_before FROM public.itineraries i WHERE i.id = v_pub;
    PERFORM public.increment_trip_view(v_pub);
    SELECT i.view_count INTO v_after  FROM public.itineraries i WHERE i.id = v_pub;
    IF v_after IS DISTINCT FROM coalesce(v_before, 0) + 1 THEN
      RAISE EXCEPTION '[035] 공개 일정이 +1 되지 않았다 (% -> %)', v_before, v_after;
    END IF;
    UPDATE public.itineraries SET view_count = v_before WHERE id = v_pub;   -- 원복
  END IF;

  IF v_priv IS NOT NULL THEN
    SELECT i.view_count INTO v_before FROM public.itineraries i WHERE i.id = v_priv;
    PERFORM public.increment_trip_view(v_priv);
    PERFORM public.increment_trip_view(v_priv);
    SELECT i.view_count INTO v_after  FROM public.itineraries i WHERE i.id = v_priv;
    IF v_after IS DISTINCT FROM v_before THEN
      RAISE EXCEPTION '[035] 비공개 일정이 변했다 (% -> %)', v_before, v_after;
    END IF;
  END IF;

  -- 존재하지 않는 UUID · NULL 입력 — 오류 없이 0행
  PERFORM public.increment_trip_view('00000000-0000-0000-0000-000000000000'::uuid);
  PERFORM public.increment_trip_view(NULL::uuid);

  -- 2-6. 데이터·스키마·다른 함수 불변
  IF (SELECT count(*) FROM public.itineraries) <> b.n_rows THEN RAISE EXCEPTION '[035] itineraries 행 수가 바뀌었다'; END IF;
  IF (SELECT md5(string_agg(i.id::text || ':' || coalesce(i.view_count, -1)::text || ':' || i.is_public::text,
                            '|' ORDER BY i.id::text)) FROM public.itineraries i) <> b.data_fp THEN
    RAISE EXCEPTION '[035] itineraries 데이터가 바뀌었다 — 검증용 변경이 원복되지 않았다';
  END IF;
  IF (SELECT md5(string_agg(q.pn || q.pa || q.pd, '|' ORDER BY q.pn, q.pa))
        FROM (SELECT p2.proname pn, pg_get_function_identity_arguments(p2.oid) pa, pg_get_functiondef(p2.oid) pd
                FROM pg_proc p2 JOIN pg_namespace n2 ON n2.oid = p2.pronamespace
               WHERE n2.nspname = 'public' AND p2.proname <> 'increment_trip_view') q) <> b.other_fn_fp THEN
    RAISE EXCEPTION '[035] 다른 함수 정의가 바뀌었다';
  END IF;
  IF (SELECT coalesce(pg_catalog.array_to_string(c.relacl, ','), '') || ':' || c.relrowsecurity::text || ':' ||
             (SELECT count(*) FROM pg_policies pl WHERE pl.schemaname = 'public' AND pl.tablename = 'itineraries')::text
        FROM pg_class c JOIN pg_namespace n3 ON n3.oid = c.relnamespace
       WHERE n3.nspname = 'public' AND c.relname = 'itineraries') <> b.tbl_fp THEN
    RAISE EXCEPTION '[035] itineraries 의 ACL·RLS·정책이 바뀌었다';
  END IF;

  RAISE NOTICE '[035] 검증 통과 — 공개만 +1, 비공개 불변, 계약·권한·데이터 보존';
END
$verify$;

-- 적용 결과 확인용 출력
SELECT
  p.proname,
  pg_get_function_identity_arguments(p.oid)       AS args,
  pg_get_function_result(p.oid)                   AS ret,
  p.prosecdef                                     AS secdef,
  pg_get_userbyid(p.proowner)                     AS owner,
  array_to_string(p.proconfig, ',')               AS cfg,
  has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon_exec,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
  has_function_privilege('public',        p.oid, 'EXECUTE') AS public_exec,
  has_function_privilege('service_role',  p.oid, 'EXECUTE') AS svc_exec
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'increment_trip_view';

COMMIT;


-- ── ROLLBACK (비상 복구 전용 — 정상 적용 절차가 아니다) ──────────────────────
--
-- 적용 직전 실측 스냅샷 (2026-08-05)
--   public.increment_trip_view(trip_id_param uuid) → void · plpgsql · VOLATILE
--   strict=false · SECURITY DEFINER · owner postgres · proconfig search_path=public
--   EXECUTE anon O · authenticated O · service_role O · PUBLIC X
--   본문: BEGIN UPDATE itineraries SET view_count = view_count + 1 WHERE id = trip_id_param; END;
--
--   BEGIN;
--   CREATE OR REPLACE FUNCTION public.increment_trip_view(trip_id_param uuid)
--   RETURNS void
--   LANGUAGE plpgsql
--   SECURITY DEFINER
--   SET search_path = public
--   AS $rb$
--   BEGIN
--     UPDATE itineraries
--     SET view_count = view_count + 1
--     WHERE id = trip_id_param;
--   END;
--   $rb$;
--   COMMIT;
--
--   CREATE OR REPLACE 라 owner·ACL 이 보존된다. GRANT 를 다시 주지 않는다.
--   복구 후 기대: proconfig=search_path=public · anon/authenticated/service_role EXECUTE 유지
--   ⚠ 이 복구는 비공개 일정 조회수 조작 취약점을 되살린다. 회귀 원인을 확인한 뒤에만 쓴다.
