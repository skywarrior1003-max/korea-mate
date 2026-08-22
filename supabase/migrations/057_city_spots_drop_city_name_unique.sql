-- 057_city_spots_drop_city_name_unique.sql
-- TASK-FIVE-CITY-CORE-ARTIFACT-TRUST-AND-IDENTITY-CORRECTION-V1 — historical UNIQUE(city,name) 제거
--
-- 왜
--   013 은 CSV bulk upsert(onConflict city,name) 시대의 중복 방지 장치였다. 5도시 final artifact 에서는
--   서로 다른 정상 entity 가 같은 표시명을 가진다(진미반점 2지점 · Play with K 2회차 · Korea House 2곳 · Tonshou 2지점).
--   검증된 공식 표시명을 DB 제약 때문에 변형하거나(괄호 지역명·suffix) 서로 다른 entity 를 병합하지 않는다.
--   identity 는 numeric id · canonical_id · (source_type, external_id) 가 담당한다(idx_city_spots_source_external 유지).
--
-- 의존처 감사(2026-08-22)
--   · 런타임: (city,name) 으로 행을 찾는 쿼리 없음. place/Saved/My Trip/Story/Moment 전부 numeric id.
--   · matchCitySpot(이름 기반 표시용 매칭)은 이름이 여러 개일 때 임의 1건을 고르지 않도록 ambiguity-safe 로 보완.
--   · RPC 025/048 publish_user_spot: 8.5 단계의 EXISTS 사전검사(business rule)는 그대로 남는다.
--     unique_violation 핸들러의 'uq_city_spots_city_name' 분기는 더 이상 발생하지 않는 경로가 된다(무해).
--   · scripts/import-spots.ts(legacy CSV, package.json 미연결)는 onConflict "city,name" 이라 이 migration 후 동작하지 않는다 — 폐기 대상.
--
-- 하지 않는 것: DELETE · id 변경 · RLS/GRANT/POLICY 변경 · 다른 컬럼 변경.
-- 적용: Supabase Dashboard SQL Editor 에서 사람이 직접. `supabase db push` 금지. 056 과 함께 Production 통합 TASK 에서 순서 확정.
-- 이 파일이 repo 에 있다는 것이 적용을 뜻하지 않는다.

alter table public.city_spots
  drop constraint if exists uq_city_spots_city_name;

-- 같은 도시 안에서 이름으로 찾는 조회(검색·관리)를 위한 비유니크 인덱스
create index if not exists city_spots_city_name_idx
  on public.city_spots (city, name);
