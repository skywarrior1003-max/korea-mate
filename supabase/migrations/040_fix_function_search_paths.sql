-- 040: trigger 함수 3종의 search_path 고정
--
-- 배경
--   Supabase Security Advisor 의 `function_search_path_mutable` WARN 3건이다.
--   search_path 가 고정되지 않은 함수는 호출자가 search_path 를 바꿔 같은 이름의
--   object 를 앞에 끼워 넣는 방식(shadowing)에 노출된다. 세 함수 모두 trigger 로만
--   불리므로 지금 당장 악용 경로가 뚜렷하지는 않지만, 고정해 두는 쪽이 옳다.
--
-- 왜 body 를 고치지 않고 ALTER 만 하는가
--   세 함수의 본문은 전부 아래 한 형태다(2026-08-06 Production 실측).
--
--     BEGIN
--       NEW.updated_at = now();
--       RETURN NEW;
--     END;
--
--   쓰는 것은 trigger pseudo-record `NEW` 와 `now()` 뿐이다. NEW 는 record 필드라
--   schema 해석이 없고, now() 는 pg_catalog 함수다. pg_catalog 는 search_path 가
--   비어 있어도 항상 암묵적으로 먼저 검색되므로 빈 search_path 에서도 해석된다.
--   unqualified 사용자 테이블·시퀀스·확장 함수·custom type·dynamic SQL 이 전부
--   0건이라 body 를 바꿀 이유가 없다.
--
--   추정이 아니라 이 DB 안에 이미 근거가 있다. `record_public_itinerary_view` 와
--   `publish_user_spot` 은 `search_path=""` 를 달고도 now() 를 쓰며 운영에서
--   정상 동작 중이다(036·018 이후 검증 완료).
--
-- 왜 `public` 을 넣지 않는가
--   본문이 public schema object 를 하나도 참조하지 않는다. public 을 넣으면
--   Advisor 경고만 사라지고 shadowing 위험은 그대로 남는다.
--
-- 적용 원칙
--   이 저장소는 원격 migration history 가 001~004 뿐이고, 운영 SQL 은 사용자가
--   Supabase SQL Editor 에서 직접 실행한다. 이 파일은 코드·감사 이력이며
--   `supabase db push` 로 적용하지 않는다.
--
--   body·owner·security 속성·EXECUTE 권한·trigger·table·데이터를 건드리지 않는다.

-- ── 1. 적용 전 읽기 전용 검증 ───────────────────────────────────────────────
--
-- -- (a) 대상 3종의 정확한 signature · owner · security 속성 · 현재 search_path
-- --     기대: 각 1행, ident_args 는 빈 문자열(무인자), returns trigger,
-- --           owner postgres, plpgsql, prosecdef false, proconfig 없음
-- select n.nspname, p.proname,
--        pg_get_function_identity_arguments(p.oid) as ident_args,
--        pg_get_function_result(p.oid)             as returns,
--        pg_get_userbyid(p.proowner)               as owner,
--        p.prosecdef                               as security_definer,
--        coalesce(array_to_string(p.proconfig,','), '(없음)') as proconfig,
--        md5(pg_get_functiondef(p.oid))            as def_md5
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname = 'public'
--    and p.proname in ('set_updated_at','update_places_updated_at','update_events_updated_at')
--  order by p.proname;
--
-- 2026-08-06 실측 def_md5 (적용 후에도 body 가 그대로면 값이 유지된다):
--   set_updated_at            914509d020712d0c31f308be3acaa811
--   update_events_updated_at  b6d31bf91f76a9a3f272d6284ecf8b53
--   update_places_updated_at  09f08495b4f4bbb5b22bc012ad065bb2
--
-- -- (b) overload 가 없는지 (위 조회가 정확히 3행이어야 한다)
--
-- -- (c) trigger 연결 — 각 함수당 1개, 전부 BEFORE UPDATE FOR EACH ROW, enabled 'O'
-- select p.proname, t.tgname, c.relname as tbl, t.tgenabled
--   from pg_trigger t join pg_proc p on p.oid = t.tgfoid
--   join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
--  where not t.tgisinternal and n.nspname = 'public'
--    and p.proname in ('set_updated_at','update_places_updated_at','update_events_updated_at')
--  order by 1;
--
-- 2026-08-06 실측:
--   set_updated_at           → trg_contact_inquiries_updated_at ON contact_inquiries
--   update_events_updated_at → trg_events_updated_at            ON events
--   update_places_updated_at → trg_places_updated_at            ON places
--
-- -- (d) EXECUTE grants — 적용 후에도 같아야 한다
-- select p.proname,
--        (select string_agg(coalesce(pg_get_userbyid(a.grantee),'PUBLIC')||':'||a.privilege_type, ', ')
--           from aclexplode(p.proacl) a) as grants
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname = 'public'
--    and p.proname in ('set_updated_at','update_places_updated_at','update_events_updated_at')
--  order by 1;
--
-- 2026-08-06 실측: 세 함수 모두 PUBLIC · postgres · anon · authenticated ·
--   service_role 에 EXECUTE (trigger 함수의 기본 형태).
--
-- Security Advisor 현재값: ERROR 0 · WARN 5 · INFO 10

-- ── 2. 적용 ─────────────────────────────────────────────────────────────────
-- 세 함수 모두 무인자이므로 signature 는 `()` 다.
BEGIN;

ALTER FUNCTION public.set_updated_at()
  SET search_path = '';

ALTER FUNCTION public.update_places_updated_at()
  SET search_path = '';

ALTER FUNCTION public.update_events_updated_at()
  SET search_path = '';

COMMIT;

-- ── 3. 적용 후 검증 ─────────────────────────────────────────────────────────
--
-- -- (a) search_path 가 고정됐는가 — 세 행 모두 proconfig = search_path=""
-- --     동시에 body(def_md5)·owner·security 속성이 그대로인지 함께 본다
-- select p.proname,
--        coalesce(array_to_string(p.proconfig,','), '(없음)') as proconfig,
--        pg_get_userbyid(p.proowner) as owner,
--        p.prosecdef                 as security_definer,
--        md5(pg_get_functiondef(p.oid)) as def_md5
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname = 'public'
--    and p.proname in ('set_updated_at','update_places_updated_at','update_events_updated_at')
--  order by 1;
--
-- 기대:
--   proconfig  = search_path=""   (3행 모두)
--   owner      = postgres         (불변)
--   security_definer = false      (불변)
--   def_md5    = 위 §1 의 값과 동일 (body 불변 — ALTER 는 body 를 건드리지 않는다)
--
-- 주의: pg_get_functiondef 는 SET 절을 포함해 출력하므로, 적용 후 md5 가 달라질 수
--   있다. 그때는 md5 대신 prosrc 로 body 만 비교한다.
-- select p.proname, md5(p.prosrc) as body_md5
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname = 'public'
--    and p.proname in ('set_updated_at','update_places_updated_at','update_events_updated_at')
--  order by 1;
--
-- -- (b) EXECUTE grants 불변 — §1 (d) 와 같은 결과
-- -- (c) trigger 연결 불변 — §1 (c) 와 같은 결과
--
-- Security Advisor 예상: ERROR 0 · WARN 2 · INFO 10
--   사라지는 것: function_search_path_mutable 3건
--   남는 것:
--     - get_shared_itinerary anon EXECUTE
--     - get_shared_itinerary authenticated EXECUTE
--   이 2건은 이번 작업 대상이 아니며 손대지 않는다.
--   INFO 10 은 변하지 않는다.

-- ── 4. 롤백 ─────────────────────────────────────────────────────────────────
-- 자동 실행하지 않는다. 되돌려야 할 때만 아래를 실행한다.
-- 적용 전 세 함수의 proconfig 는 비어 있었으므로 RESET 이 정확한 원상복구다.
--
-- ALTER FUNCTION public.set_updated_at()           RESET search_path;
-- ALTER FUNCTION public.update_places_updated_at() RESET search_path;
-- ALTER FUNCTION public.update_events_updated_at() RESET search_path;
--
-- 롤백에서도 body·owner·EXECUTE 권한·security 속성·trigger·table·데이터를
-- 변경하지 않는다.
