-- 064: Trend Pack DB SSOT (DRAFT — Staging 전용)
-- (MAIN-MULTILOCALE-TREND-DB-AUTO-CURATION-AND-COST-GUARD-PREVIEW-V2 §3)
--
-- ⚠ Production 적용 금지 — Owner 가 4locale 실결과·비용 원장을 확인하기 전.
--
-- 코드(trend-packs.ts)의 런타임 SSOT 역할을 이 테이블로 이전한다:
--  · 코드 재배포 없이 status·next_review_at·pack_version 변경 가능
--  · Owner 는 표현별 승인을 하지 않는다 — 자동 판정(§4)이 기본이고,
--    정치·혐오·성적·브랜드 오인·법적 위험 같은 예외만 manual_review 로 보낸다.
--  · service-role 전용: RLS enable + 정책 0 (브라우저 직접 조회 0, 공개 API 노출 0)
--  · next_review_at 은 삭제일이 아니라 재검증 예정일이다. 선택 시에는 지난 row 를
--    쓰지 않는다(재검증 강제) — row 자체는 보존된다.

create table if not exists public.mytrip_trend_packs (
  id                      text primary key,          -- 안정 슬러그(예: ko-duahonna-2026)
  locale                  text not null check (locale in ('ko-KR','ja-JP','en','zh-CN','zh-TW','zh-HK')),
  region_scope            text not null,             -- 'KR'·'JP'·'global-safe'·'CN-neutral'·'TW'·'HK'
  phrase                  text not null,             -- 실제 사용 표기
  canonical_form          text not null,             -- 정규화 표기(중복 방지 키)
  meaning                 text not null,
  usage_context           text not null,
  safe_example            text not null,
  avoid_context           text not null,
  source_urls             jsonb not null default '[]'::jsonb,
  source_types            jsonb not null default '[]'::jsonb,  -- 예: ["origin_video","fan_reproduction","press","dictionary"]
  first_verified_at       date not null,
  last_verified_at        date not null,
  next_review_at          date not null,
  lifecycle_type          text not null check (lifecycle_type in ('artist_fandom','fast_sns','established','colloquial')),
  status                  text not null check (status in ('candidate','experimental_active','active','cooling','archived','blocked','manual_review')),
  confidence_score        numeric not null default 0.5 check (confidence_score >= 0 and confidence_score <= 1),
  risk_score              numeric not null default 0.5 check (risk_score >= 0 and risk_score <= 1),
  brand_or_artist_related boolean not null default false,
  activation_reason       text,
  decision_actor          text not null default 'auto-curation-v1',  -- 자동 판정 주체·규칙 버전
  pack_version            text not null,
  -- §10 익명 품질 집계(사용자 원문 저장 0)
  shown_count             integer not null default 0,
  selected_count          integer not null default 0,
  saved_count             integer not null default 0,
  heavily_edited_count    integer not null default 0,
  regenerated_after_count integer not null default 0,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create unique index if not exists mytrip_trend_packs_locale_canonical
  on public.mytrip_trend_packs (locale, region_scope, canonical_form);
create index if not exists mytrip_trend_packs_selection
  on public.mytrip_trend_packs (locale, status, next_review_at);

alter table public.mytrip_trend_packs enable row level security;
