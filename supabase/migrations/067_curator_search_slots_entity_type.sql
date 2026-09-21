-- 067: 주간 Search 하드캡 slot + trend entity_type (DRAFT — Staging 전용)
-- (V4-1 §D·§F·§G — 기존 curator_runs 만으로는 KST 주차·locale 유일 slot·원자적
--  예약을 보장할 수 없음을 감사로 확인 → 최소 추가)
--
-- ⚠ Production 적용 금지.
--
-- mytrip_curator_search_slots — Search Grounding 의 유일한 비용 원장.
--  · unique(week_kst, locale) 이 원자성의 근원이다: 예약 = INSERT, 충돌 = 즉시
--    실패(provider 0). 단순 SELECT count 후 호출 방식의 race 를 구조적으로 제거.
--  · locale 은 4종뿐이므로 주간 총 slot 은 스키마 수준에서 ≤4 로 보장된다
--    (env cap 은 4 이하로만 줄일 수 있다 — §H).
--  · provider 시작 이후의 실패·timeout·파싱 실패·후보 0건도 slot 을 반환하지
--    않는다(과금 가능 시도 = 소비). provider 시작 전 검증 실패만 slot 을 지운다.
--  · week_kst = KST(UTC+9) 기준 그 주 월요일 날짜("YYYY-MM-DD").
--  · 배포 Worker 는 서버 실제 시각만 쓴다 — test clock 은 이 테이블에 올 수 없다.

create table if not exists public.mytrip_curator_search_slots (
  id                  uuid primary key default gen_random_uuid(),
  week_kst            text not null,                  -- KST 주 시작(월) "YYYY-MM-DD"
  locale              text not null check (locale in ('ko-KR', 'ja-JP', 'en', 'zh-CN')),
  run_id              uuid not null,
  status              text not null default 'reserved'
                        check (status in ('reserved', 'provider_started', 'succeeded', 'failed')),
  reserved_at         timestamptz not null default now(),   -- observed_at(서버 실제 UTC)
  provider_started_at timestamptz,
  finished_at         timestamptz,
  model               text,
  billing_unit        text,
  grounded_prompts    integer not null default 0,
  search_queries      integer not null default 0,
  in_tok              integer, out_tok integer, think_tok integer,
  fail_code           text
);

create unique index if not exists mytrip_curator_search_slots_week_locale
  on public.mytrip_curator_search_slots (week_kst, locale);
create index if not exists mytrip_curator_search_slots_week
  on public.mytrip_curator_search_slots (week_kst);

alter table public.mytrip_curator_search_slots enable row level security;

-- §D — 표현/엔티티 분리: trend row 의 entity 분류(기본 phrase, 기존 rows 는
-- V4-1 재감사에서 백필). phrase 외에는 자동 활성 경로 진입 불가(코드 계약).
alter table public.mytrip_trend_packs
  add column if not exists entity_type text not null default 'phrase'
  check (entity_type in ('phrase', 'person', 'artist', 'group', 'brand', 'product', 'work_title', 'event', 'unknown'));
