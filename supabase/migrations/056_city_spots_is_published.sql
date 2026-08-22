-- 056_city_spots_is_published.sql
-- TASK-FIVE-CITY-CORE-PREPROD-GATE-V1 · Gate B — 서비스 노출 게이트 최소 컬럼
--
-- 무엇을
--   city_spots.is_published boolean NOT NULL DEFAULT false  (데이터계약 v1 §5 의 첫 컬럼 — 동일 이름·타입·기본값)
--   인덱스 (city, is_published)                               (§5 인덱스 열과 동일)
--
-- 왜 지금 이것만
--   5도시 통합(4,8xx 행) 전에 "서비스 승인 행" 과 "보존하되 숨길 legacy 행" 을 구분할 수단이 필요하다.
--   §5 의 나머지 14개 컬럼(review_status·catalog_ready·scheduler_* …)과 §7 CHECK 관계식은 readiness
--   파이프라인과 함께 별도 migration 으로 온다 — 이 파일은 그 목록의 **부분집합**이라 충돌하지 않는다.
--   (§7 `NOT is_published OR catalog_ready` CHECK 는 catalog_ready 가 생길 때 같이 건다.)
--
-- 호환성 (migration 직후 Production 이 달라지지 않도록)
--   1) 컬럼 추가 직후 기존 714행을 전부 true 로 backfill 한다 → 지금 보이는 장소가 그대로 보인다.
--      런타임 코드는 DISCOVERY_VISIBILITY_GATE_ENABLED=false 인 동안 이 컬럼을 읽지 않으므로
--      migration 을 먼저 적용해도, 코드를 먼저 배포해도 사용자 경험은 변하지 않는다.
--   2) 기본값 false 는 §5 그대로 — 앞으로 INSERT 되는 행은 importer 가 명시적으로 true 를 준다.
--      "넣기만 하면 노출" 이 되지 않는다.
--   3) legacy 를 숨기는 UPDATE(231+3 행 → false)는 이 migration 이 아니라 importer apply 단계의
--      change manifest 에 행 단위로 실린다(사람이 승인한 목록만). 여기서 숨기지 않는다.
--
-- 하지 않는 것: DELETE · id 변경 · RLS/GRANT/POLICY 변경 · 다른 컬럼 변경 · 기존 데이터 손실.
-- 적용: Supabase Dashboard SQL Editor 에서 사람이 직접. `supabase db push` 금지.
-- 이 파일이 repo 에 있다는 것이 적용을 뜻하지 않는다 (적용 여부는 별도 기록).

alter table public.city_spots
  add column if not exists is_published boolean not null default false;

comment on column public.city_spots.is_published is
  'service visibility gate (data-contract v1 §5). true = discovery surfaces(Explore/planner/near-me/sitemap) may show. false = preserved but hidden; direct references (Saved/My Trip/Story/place/<id>) still resolve. Never delete rows to hide them.';

-- 기존 행은 지금 보이는 그대로 — backfill. (신규 행은 default false, importer 가 명시적으로 true)
update public.city_spots set is_published = true where is_published = false;

create index if not exists city_spots_city_is_published_idx
  on public.city_spots (city, is_published);
