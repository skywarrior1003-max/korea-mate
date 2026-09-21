-- 066: 주간 curator 원장 + attempt 일일 집계 (DRAFT — Staging 전용)
-- (TREND-FREQUENCY-AUTO-CURATOR V3 §6·§7)
--
-- ⚠ Production 적용 금지. Staging(koreamate-staging) 전용.
--
--  · mytrip_curator_runs: 주간 자동 수집 실행의 비용·호출 원장(사용자 생성
--    원장(mytrip_ai_generations)과 완전 분리 — §6 주간 비용 상한 검증 근거).
--  · mytrip_ai_daily_stats: attempt 상세 row 90일 정리(§7) 전에 보존하는
--    비용·상태별 일일 집계. 사용자 원문·사진·raw id 는 어떤 형태로도 없다.
--  · RLS enable + 정책 0 = service-role 전용.

create table if not exists public.mytrip_curator_runs (
  id                  uuid primary key default gen_random_uuid(),
  started_at          timestamptz not null default now(),
  finished_at         timestamptz,
  trigger             text not null check (trigger in ('cron', 'manual')),
  locales             jsonb not null default '[]'::jsonb,
  grounded_requests   integer not null default 0,   -- 실제 검색 grounded 호출 수(주간 상한 4)
  search_queries      integer not null default 0,   -- grounding 메타의 webSearchQueries 합
  candidates_found    integer not null default 0,
  candidates_upserted integer not null default 0,
  db_mutations        integer not null default 0,   -- 실행당 상한 20
  cleanup_aggregated  integer not null default 0,   -- §7 90일 정리로 집계된 row 수
  cleanup_deleted     integer not null default 0,
  status              text not null default 'running' check (status in ('running', 'succeeded', 'failed', 'audit_only')),
  error_code          text,                          -- 민감정보 없는 코드만
  in_tok              integer, out_tok integer, think_tok integer
);

create index if not exists mytrip_curator_runs_started on public.mytrip_curator_runs (started_at desc);

create table if not exists public.mytrip_ai_daily_stats (
  day        date not null,
  feature    text not null,
  status     text not null,
  n          integer not null default 0,
  in_tok_sum bigint not null default 0,
  out_tok_sum bigint not null default 0,
  think_tok_sum bigint not null default 0,
  primary key (day, feature, status)
);

alter table public.mytrip_curator_runs enable row level security;
alter table public.mytrip_ai_daily_stats enable row level security;
