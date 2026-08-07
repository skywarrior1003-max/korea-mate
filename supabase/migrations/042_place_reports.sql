-- 042: 장소 제보(place_reports) 테이블
--
-- 무엇인가
--   사용자가 공개 장소 정보의 오류·현장 문제를 알려 주는 통로다.
--   공개 리뷰가 아니다. 별점도 아니다. 내부 moderation 데이터다.
--
-- 왜 공개하지 않나
--   신고는 접수 시점에 사실이 아니다. "바가지" · "불친절" · "위험" 같은 말이
--   한 건의 신고만으로 화면에 뜨면 그건 검증되지 않은 주장을 우리가 사실처럼
--   퍼뜨리는 것이 된다. 그래서 raw row 에 public SELECT 를 주지 않는다.
--
-- 적용 방법
--   이 저장소는 원격 migration history 가 001~004 뿐이고, 운영 SQL 은 사용자가
--   Supabase SQL Editor 에서 직접 실행한다. 이 파일은 코드·감사 이력이며
--   `supabase db push` 로 적용하지 않는다.
--
--   SQL Editor 는 문장을 트랜잭션으로 감싸므로 CREATE INDEX CONCURRENTLY 를
--   쓰지 않는다. 신규 빈 테이블이라 일반 인덱스로 충분하다.
--
--   기존 테이블을 DROP·ALTER 하지 않는다. 기존 데이터를 지우지 않는다.
--   전부 IF NOT EXISTS 라 재실행해도 안전하다.
--
-- 적용 전 검증 (SQL Editor 에서 먼저 실행 — 전부 0 이어야 한다)
--   select
--     (select count(*) from information_schema.tables
--       where table_schema='public' and table_name='place_reports') as table_exists,
--     (select count(*) from pg_type where typname='place_report_status') as type_exists;

-- ── 상태 ────────────────────────────────────────────────────────────────────
-- 신고가 어느 단계인지 반드시 남는다. 접수 = 사실 확정이 아니다.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'place_report_status') then
    create type public.place_report_status as enum (
      'pending',              -- 아직 아무도 보지 않음
      'reviewing',            -- 검토 중
      'resolved_corrected',   -- 확인해서 데이터를 고침
      'resolved_no_change',   -- 확인했으나 문제 없음
      'resolved_hidden',      -- 공개에서 내림
      'resolved_removed',     -- 목록에서 제외
      'rejected',             -- 잘못된·악의적 신고
      'duplicate'             -- 같은 내용 중복
    );
  end if;
end $$;

-- ── 테이블 ──────────────────────────────────────────────────────────────────
create table if not exists public.place_reports (
  id           bigint generated always as identity primary key,

  -- 공개 관광 정보만 대상이다. My Places(user_spot)는 여기 들어오지 않는다.
  target_type  text not null,
  target_key   text not null,

  category     text not null,

  -- 사용자가 직접 쓴 말. **공개하지 않는다.** 그래서 원문 그대로 보관한다.
  note         text,

  -- device_id 를 그대로 넣지 않는다. sha256(device_id | target) 이라
  -- 같은 사람이라도 대상이 다르면 값이 달라 행적을 이어 붙일 수 없다.
  -- 같은 대상 안에서는 안정적이라 중복 방지와 "몇 명이 신고했나" 는 그대로 된다.
  reporter_key text not null,

  status       public.place_report_status not null default 'pending',
  resolution_note text,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  resolved_at  timestamptz,

  constraint place_reports_target_type_chk
    check (target_type in ('city_spot')),
  constraint place_reports_category_chk
    check (category in (
      'hours_or_holiday','price_or_fee','location','closed_or_unavailable',
      'construction_or_access','facility_info','accessibility',
      'maintenance','cleanliness','facility_broken','staff_service',
      'overcharge_suspected','safety','service_mismatch','other'
    )),
  constraint place_reports_note_len_chk
    check (note is null or char_length(note) <= 500),
  constraint place_reports_reporter_key_chk
    check (char_length(reporter_key) = 64)
);

-- 운영 화면이 "이 장소에 무슨 신고가 있나" 를 볼 때 쓴다
create index if not exists idx_place_reports_target
  on public.place_reports (target_type, target_key, created_at desc);

-- 미검토 대기열
create index if not exists idx_place_reports_status
  on public.place_reports (status, created_at desc);

-- 최근 중복 신고 조회를 받쳐 준다.
--
-- 여기에 UNIQUE 를 걸면 안 된다. 처음엔 걸었다가 되돌렸다.
-- 영구 unique 는 "같은 사람이 같은 장소의 같은 문제를 두 번 다시 신고할 수 없다" 는
-- 뜻이 된다. 8월에 영업시간 오류를 신고해 고쳤는데 10월에 또 바뀌면 그 사람은
-- 영원히 알려줄 수 없다. 그건 우리가 원하는 정책이 아니다.
--
-- 중복 판정은 시간 창의 문제이고, 시간 창은 스키마가 아니라 서버가 판단한다.
-- (Postgres 는 NOW() 기준 sliding window 를 인덱스로 표현하지 못한다.)
create index if not exists idx_place_reports_recent_duplicate
  on public.place_reports (reporter_key, target_type, target_key, category, created_at desc);

-- ── 권한 ────────────────────────────────────────────────────────────────────
-- 브라우저는 이 테이블에 손댈 수 없다. 쓰기는 Pages Function(service_role)만.
-- 읽기도 주지 않는다 — 검증되지 않은 신고를 아무나 열람하면 안 된다.
alter table public.place_reports enable row level security;

revoke all on public.place_reports from anon;
revoke all on public.place_reports from authenticated;
revoke all on public.place_reports from public;

-- RLS 정책을 만들지 않는다. 정책이 없으면 anon/authenticated 는 아무것도 못 한다.
-- service_role 은 RLS 를 우회하므로 서버 경로만 동작한다.

-- ── 적용 후 검증 (SQL Editor 에서 실행) ──────────────────────────────────────
--   select
--     (select count(*) from information_schema.tables
--       where table_schema='public' and table_name='place_reports')            as table_created,   -- 1
--     (select count(*) from pg_indexes where tablename='place_reports')        as indexes,         -- 4
--     (select count(*) from pg_policies where tablename='place_reports')       as policies,        -- 0
--     (select relrowsecurity from pg_class where relname='place_reports')      as rls_enabled,     -- true
--     (select count(*) from information_schema.role_table_grants
--       where table_name='place_reports' and grantee in ('anon','authenticated','PUBLIC'))
--                                                                             as public_grants,   -- 0
--     (select count(*) from public.place_reports)                             as rows_present;    -- 0
--
-- ── rollback ────────────────────────────────────────────────────────────────
-- 이 migration 은 신규 테이블만 만든다. 되돌리려면 아래 두 문장이면 되고
-- 기존 데이터에 영향이 없다. (신고가 쌓인 뒤에는 백업 후 실행할 것)
--   drop table if exists public.place_reports;
--   drop type  if exists public.place_report_status;
