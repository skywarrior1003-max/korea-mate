-- 043: 장소 좋아요(place_likes) 테이블
--
-- 무엇인가
--   "이 장소 좋다" 는 공개 긍정 신호다.
--
-- 무엇이 아닌가
--   · Saved 가 아니다 — Saved 는 기기에만 있는 개인 북마크다.
--   · 신고의 반대편이 아니다 — 좋아요에서 신고 수를 빼는 점수를 만들지 않는다.
--     긍정 선호와 데이터 품질 위험은 서로 다른 축이고, 합치면 둘 다 못 읽게 된다.
--   · spot_reactions 가 아니다 — 그 테이블은 dislike 전용이고 운영 화면이
--     "신뢰도 이슈" 판정에 쓴다. 거기에 긍정 신호를 섞지 않는다.
--
-- 적용 방법
--   이 저장소는 원격 migration history 가 001~004 뿐이고, 운영 SQL 은 사용자가
--   Supabase SQL Editor 에서 직접 실행한다. 이 파일은 코드·감사 이력이며
--   `supabase db push` 로 적용하지 않는다.
--
--   기존 테이블을 DROP·ALTER 하지 않는다. 전부 IF NOT EXISTS 라 재실행해도 안전하다.
--
-- 적용 전 검증 (SQL Editor 에서 먼저 실행 — 0 이어야 한다)
--   select count(*) as table_exists from information_schema.tables
--     where table_schema='public' and table_name='place_likes';

create table if not exists public.place_likes (
  id          bigint generated always as identity primary key,

  -- 공개 관광 정보만 대상이다. My Places(user_spot)는 들어오지 않는다.
  target_type text not null,
  target_key  text not null,

  -- device_id 를 그대로 넣지 않는다. sha256(device_id | like:target) 이라
  -- 같은 사람이라도 장소가 다르면 값이 달라 취향 전체를 재구성할 수 없다.
  liker_key   text not null,

  created_at  timestamptz not null default now(),

  constraint place_likes_target_type_chk check (target_type in ('city_spot')),
  constraint place_likes_liker_key_chk   check (char_length(liker_key) = 64)
);

-- 한 사람은 한 장소에 좋아요 하나다. 여기서는 UNIQUE 가 옳다 —
-- 신고와 달리 좋아요는 "지금 눌러져 있는가" 하나의 상태이고,
-- 취소하면 행이 지워지므로 나중에 다시 누를 수 있다. 영구히 막는 것이 아니다.
create unique index if not exists uq_place_likes_liker_target
  on public.place_likes (liker_key, target_type, target_key);

-- 장소별 좋아요 수 집계용
create index if not exists idx_place_likes_target
  on public.place_likes (target_type, target_key);

-- ── 권한 ────────────────────────────────────────────────────────────────────
-- 브라우저는 이 테이블에 직접 손대지 못한다. 쓰기·읽기 모두 Pages Function
-- (service_role)만 한다. raw row 를 열면 누가 무엇을 좋아하는지 목록이 새므로
-- 집계만 서버가 계산해 내보낸다.
alter table public.place_likes enable row level security;

revoke all on public.place_likes from anon;
revoke all on public.place_likes from authenticated;
revoke all on public.place_likes from public;

-- RLS 정책을 만들지 않는다. 정책이 없으면 anon/authenticated 는 아무것도 못 한다.
-- service_role 은 RLS 를 우회하므로 서버 경로만 동작한다.

-- ── 적용 후 검증 (SQL Editor 에서 실행) ──────────────────────────────────────
--   select
--     (select count(*) from information_schema.tables
--       where table_schema='public' and table_name='place_likes')          as table_created,  -- 1
--     (select count(*) from pg_indexes where tablename='place_likes')      as indexes,        -- 3
--     (select count(*) from pg_policies where tablename='place_likes')     as policies,       -- 0
--     (select relrowsecurity from pg_class where relname='place_likes')    as rls_enabled,    -- true
--     (select count(*) from information_schema.role_table_grants
--       where table_name='place_likes'
--         and grantee in ('anon','authenticated','PUBLIC'))                as public_grants,  -- 0
--     (select count(*) from public.place_likes)                            as rows_present;   -- 0
--
-- ── rollback ────────────────────────────────────────────────────────────────
-- 신규 테이블만 만든다. 되돌리려면 아래 한 문장이면 되고 기존 데이터에 영향이 없다.
-- 좋아요가 쌓인 뒤에는 반드시 백업 후 실행할 것.
--   drop table if exists public.place_likes;
