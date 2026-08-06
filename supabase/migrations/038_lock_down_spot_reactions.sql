-- 038: spot_reactions 브라우저 직접 쓰기·읽기 차단 + 중복 방지
--
-- 배경
--   dislike 는 브라우저가 anon key 로 spot_reactions 에 직접 INSERT 했다.
--   정책이 `WITH CHECK (true)` 이고 unique 제약이 없어 같은 장소에 무한히 넣을 수
--   있었고, device_id 도 클라이언트가 보내는 값이라 위조가 가능했다. 관리자 화면이
--   이 행 수로 "신뢰도 이슈 스팟"을 판정하므로 집계 조작 = 관리자 판단 오염이다.
--
--   코드는 먼저 서버로 옮겼다.
--     POST /api/spots/reactions              (service_role, 사용자 dislike)
--     GET  /api/admin/spot-reactions-summary (service_role + x-admin-key, 집계)
--   이 파일은 그 뒤에 남은 anon/authenticated 경로를 닫는다.
--
-- 적용 원칙
--   이 저장소는 원격 migration history 가 001~004 뿐이고, 운영 SQL 은 사용자가
--   Supabase SQL Editor 에서 직접 실행한다. 이 파일은 코드·감사 이력이며
--   `supabase db push` 로 적용하지 않는다.
--
--   SQL Editor 는 문장을 트랜잭션으로 감싸므로 CREATE INDEX CONCURRENTLY 를 쓰지
--   않는다. 대상 9행 규모라 일반 인덱스로 충분하다.
--
--   기존 데이터를 삭제·병합·수정하지 않는다. 사전검증이 하나라도 0 이 아니면
--   적용하지 않고 멈춘다.

-- ── 1. 사전검증 ─────────────────────────────────────────────────────────────
-- 아래 7개 값이 모두 0 이어야 적용한다. 하나라도 0 이 아니면 중단하고 보고한다.
--
-- select
--   (select count(*) from public.spot_reactions where device_id is null) as null_device,
--   (select count(*) from public.spot_reactions where place_id  is null) as null_place,
--   (select count(*) from public.spot_reactions where reaction  is null) as null_reaction,
--   (select count(*) from (select device_id, place_id, reaction
--      from public.spot_reactions group by 1,2,3 having count(*) > 1) d) as dup_groups,
--   (select count(*) from public.spot_reactions where reaction <> 'dislike') as bad_reaction,
--   (select count(*) from public.spot_reactions where length(device_id) > 64)  as long_device,
--   (select count(*) from public.spot_reactions where length(place_id)  > 128) as long_place;
--
-- 2026-08-05 운영 실측: 7개 모두 0, 총 9행.

-- ── 적용 이력 ───────────────────────────────────────────────────────────────
-- 2026-08-06 사용자가 Supabase SQL Editor 에서 아래 본문을 그대로 실행했다.
-- 이 파일은 그때 실행된 SQL 과 문자 그대로 일치해야 한다. 나중에 실제로 돈 것과
-- 다른 내용이 남아 있으면 감사 이력이 거짓이 된다.
BEGIN;

-- ── 2. RLS 유지 ─────────────────────────────────────────────────────────────
-- 이미 켜져 있다. 꺼진 적이 없어야 하므로 명시적으로 다시 보장한다.
ALTER TABLE public.spot_reactions ENABLE ROW LEVEL SECURITY;

-- ── 3. 중복 방지 ────────────────────────────────────────────────────────────
-- 같은 기기가 같은 장소에 같은 reaction 을 두 번 남길 수 없다.
-- 서버는 23505 를 "이미 반영됨"으로 처리하므로 사용자 화면은 그대로다.
-- 기존 이름(spot_reactions_pkey, idx_spot_reactions_place_id)과 겹치지 않는다.
CREATE UNIQUE INDEX IF NOT EXISTS spot_reactions_device_place_reaction_uniq
  ON public.spot_reactions (device_id, place_id, reaction);

-- ── 4. anon 정책 제거 ───────────────────────────────────────────────────────
-- 남겨 두면 권한을 회수해도 정책만 보고 "열려 있다"고 오해하게 된다.
DROP POLICY IF EXISTS anon_read_reactions   ON public.spot_reactions;
DROP POLICY IF EXISTS anon_insert_reactions ON public.spot_reactions;

-- ── 5. 권한 회수 ────────────────────────────────────────────────────────────
-- 정책이 아니라 privilege 를 회수해야 REST 경로가 실제로 닫힌다.
-- PUBLIC 은 현재 0 이지만 나중에 다시 붙는 것을 막기 위해 함께 회수한다.
REVOKE ALL PRIVILEGES ON TABLE public.spot_reactions FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.spot_reactions FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.spot_reactions FROM authenticated;

COMMIT;

-- ── 6. 서버 경로 — 손대지 않는다 ────────────────────────────────────────────
-- service_role 에는 GRANT 도 REVOKE 도 하지 않는다.
--
-- 초안에는 `GRANT SELECT, INSERT ... TO service_role` 이 있었는데 이는 잘못이었다.
-- service_role 은 이 테이블에 이미 7종(DELETE·INSERT·REFERENCES·SELECT·TRIGGER·
-- TRUNCATE·UPDATE)을 갖고 있고, 그중 DELETE 는 관리자 장소 삭제 Function 이
-- spot_reactions 를 FK 순서상 먼저 지울 때 필요하다. SELECT·INSERT 두 개만
-- 적어 두면 "이 둘만 있으면 된다"는 잘못된 기대를 남긴다.
--
-- 실제 적용 SQL 에는 이 GRANT 가 없으며, 적용 전후 service_role 권한은 7종 그대로다.

-- ── 7. 적용 후 검증 ─────────────────────────────────────────────────────────
-- 아래를 실행해 기대값과 대조한다.
--
-- -- unique index 존재 (1 행)
-- select indexname from pg_indexes
--  where schemaname='public' and indexname='spot_reactions_device_place_reaction_uniq';
--
-- -- RLS on = true, 정책 수 = 0
-- select c.relrowsecurity as rls_enabled,
--        (select count(*) from pg_policy p where p.polrelid=c.oid) as policies
--   from pg_class c join pg_namespace n on n.oid=c.relnamespace
--  where n.nspname='public' and c.relname='spot_reactions';
--
-- -- anon/authenticated/PUBLIC privilege = 0 행
-- select grantee, privilege_type from information_schema.role_table_grants
--  where table_schema='public' and table_name='spot_reactions'
--    and grantee in ('anon','authenticated','PUBLIC');
--
-- -- service_role 은 적용 전과 같은 7종 유지 (7 행)
-- --   DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- -- DELETE 가 빠지면 관리자 장소 삭제 Function 이 깨진다.
-- select privilege_type from information_schema.role_table_grants
--  where table_schema='public' and table_name='spot_reactions' and grantee='service_role';
--
-- -- 데이터 무변경: 9행 유지, 중복 0
-- select count(*) as rows from public.spot_reactions;
-- select count(*) as dup_groups from (select device_id, place_id, reaction
--   from public.spot_reactions group by 1,2,3 having count(*) > 1) d;

-- ── 8. 롤백 ─────────────────────────────────────────────────────────────────
-- 자동 실행하지 않는다. 되돌려야 할 때만 아래를 순서대로 실행한다.
--
-- DROP INDEX IF EXISTS public.spot_reactions_device_place_reaction_uniq;
-- GRANT SELECT, INSERT ON TABLE public.spot_reactions TO anon, authenticated;
-- CREATE POLICY anon_read_reactions   ON public.spot_reactions
--   FOR SELECT TO anon USING (true);
-- CREATE POLICY anon_insert_reactions ON public.spot_reactions
--   FOR INSERT TO anon WITH CHECK (true);
--
-- 롤백해도 기존 9행은 그대로다. 이 migration 은 데이터를 건드리지 않는다.
