-- ════════════════════════════════════════════════════════════════════════════
-- 031_add_itinerary_trip_cover.sql
-- TASK-TRIP-COVER-V1B — 개인 Memory 사진 커버 상태 컬럼
--
-- 목적:
--   일정마다 커버 소스를 auto(테마 자동) / asset(승인 관광 사진) /
--   moment(사용자 Memory 사진 1장) 중 하나로 저장한다.
--
-- ⚠ trip_moments.is_public 은 건드리지 않는다.
--   "Memory 전체 공개"와 "커버 사진 한 장 공개"는 서로 다른 상태이며,
--   커버 공개의 SSOT 는 여기 추가하는 (cover_kind, cover_moment_id, 동의 2필드)다.
--
-- ⚠ cover_updated_at 을 만들지 않는다.
--   itineraries.updated_at 이 이미 있고 get_shared_itinerary 가 반환하므로
--   OG 캐시 버전으로 그대로 쓴다. (RPC 재생성 회피 — 030 에서 확인한
--   PUBLIC EXECUTE 자동 부여 위험을 반복하지 않기 위함)
--
-- ── FK 를 ON DELETE SET NULL 로 두는 이유 ────────────────────────────────────
--   RESTRICT/NO ACTION 이면 사진 삭제와 일정 전체 삭제가 FK 때문에 실패한다.
--   특히 functions/api/itinerary/[id].ts 의 삭제는
--     Storage 삭제 → trip_moments DELETE → itineraries DELETE
--   순서라, 4단계에서 아직 itineraries.cover_moment_id 가 그 행을 가리킨다.
--   RESTRICT 였다면 "Storage 는 지워졌는데 DB 는 남는" 부분 삭제가 된다.
--   사진 삭제는 사용자 권리이므로 DB 제약이 이를 막아서는 안 된다.
--
-- ── moment 상태에서 cover_moment_id NULL 을 허용하는 이유 ────────────────────
--   SET NULL 이 동작하면 cover_kind='moment' 인 채 cover_moment_id 만 NULL 이
--   된다. 이때 CHECK 가 NOT NULL 을 요구하면 삭제 자체가 check_violation 으로
--   실패한다. 따라서 moment 분기는 "동의 2필드"만 강제하고 moment_id 는
--   NULL 을 허용한다. 이 상태는 사진 삭제 직후의 안전한 복구 상태이며,
--   프록시·UI 가 무효 개인 커버로 보고 V1A 관광 커버로 fallback 한다.
--   즉 DB 는 "동의 없는 개인 커버"라는 위험한 조합만 막고,
--   "가리킬 사진이 없는 커버"라는 무해한 조합은 허용한다.
--
-- 적용 금지: supabase db push 사용 금지 — Management API 또는 SQL Editor 직접 실행
-- 이번 태스크에서는 운영 DB 에 적용하지 않는다.
-- 브랜드: GoKoreaMate / gokoreamate.com
-- 작성일: 2026-07-27
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. 컬럼 추가 (idempotent) ────────────────────────────────────────────────
ALTER TABLE public.itineraries
  ADD COLUMN IF NOT EXISTS cover_kind            text NOT NULL DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS cover_asset_id        text,
  ADD COLUMN IF NOT EXISTS cover_moment_id       text,
  ADD COLUMN IF NOT EXISTS cover_consent_at      timestamptz,
  ADD COLUMN IF NOT EXISTS cover_consent_version text;

-- ── 2. cover_kind 허용값 ─────────────────────────────────────────────────────
ALTER TABLE public.itineraries
  DROP CONSTRAINT IF EXISTS itineraries_cover_kind_check;

ALTER TABLE public.itineraries
  ADD CONSTRAINT itineraries_cover_kind_check
  CHECK (cover_kind IN ('auto', 'asset', 'moment'));

-- ── 3. 상태 일관성 CHECK ─────────────────────────────────────────────────────
--   auto   : 나머지 전부 NULL
--   asset  : cover_asset_id 만 존재
--   moment : 동의 2필드 필수, cover_asset_id 는 NULL, cover_moment_id 는 NULL 허용
ALTER TABLE public.itineraries
  DROP CONSTRAINT IF EXISTS itineraries_cover_state_check;

ALTER TABLE public.itineraries
  ADD CONSTRAINT itineraries_cover_state_check
  CHECK (
    (
      cover_kind = 'auto'
      AND cover_asset_id        IS NULL
      AND cover_moment_id       IS NULL
      AND cover_consent_at      IS NULL
      AND cover_consent_version IS NULL
    )
    OR (
      cover_kind = 'asset'
      AND cover_asset_id        IS NOT NULL
      AND cover_moment_id       IS NULL
      AND cover_consent_at      IS NULL
      AND cover_consent_version IS NULL
    )
    OR (
      cover_kind = 'moment'
      AND cover_asset_id        IS NULL
      AND cover_consent_at      IS NOT NULL
      AND cover_consent_version IS NOT NULL
      -- cover_moment_id 는 의도적으로 NULL 을 허용한다 (위 주석 참조)
    )
  );

-- ── 4. cover_moment_id FK ────────────────────────────────────────────────────
--   trip_moments.moment_id 는 text PK 이고 값은 항상 UUID 형식이다
--   (functions/api/trip-moments/index.ts 가 UUID_RE 로 검증).
--   따라서 text ↔ text FK 가 성립한다.
--   반면 trip_moments.itinerary_id(text) ↔ itineraries.id(uuid) 는
--   타입이 달라 FK 를 만들지 않는다. 소유권·일정 관계는 애플리케이션이
--   각각 조회해 문자열로 비교한다.
ALTER TABLE public.itineraries
  DROP CONSTRAINT IF EXISTS itineraries_cover_moment_id_fkey;

ALTER TABLE public.itineraries
  ADD CONSTRAINT itineraries_cover_moment_id_fkey
  FOREIGN KEY (cover_moment_id)
  REFERENCES public.trip_moments(moment_id)
  ON DELETE SET NULL;

-- ── 5. 조회 인덱스 (프록시가 id 로만 조회하므로 PK 로 충분 — 추가 없음) ──────
-- 의도적으로 인덱스를 추가하지 않는다. 커버 조회는 항상 itineraries PK 단건이다.

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- 적용 전 확인
--   SELECT count(*) FROM public.itineraries;                       -- 55 (2026-07-27)
--   SELECT conname FROM pg_constraint
--    WHERE conrelid='public.itineraries'::regclass AND contype='c'; -- 기존 0건
--   → 기존 행은 cover_kind 기본값 'auto' + 나머지 NULL 이므로 전부 CHECK 통과.
--
-- 적용 후 검증
--   ① 컬럼 5개 존재, cover_kind NOT NULL DEFAULT 'auto'
--   ② CHECK 2개(itineraries_cover_kind_check, itineraries_cover_state_check)
--   ③ FK itineraries_cover_moment_id_fkey, confdeltype='n'(SET NULL)
--   ④ 기존 55행 전부 cover_kind='auto'
--   ⑤ RLS·GRANT 무변경 (이 migration 은 정책·권한을 건드리지 않는다)
--
-- 롤백
--   ALTER TABLE public.itineraries
--     DROP CONSTRAINT IF EXISTS itineraries_cover_moment_id_fkey,
--     DROP CONSTRAINT IF EXISTS itineraries_cover_state_check,
--     DROP CONSTRAINT IF EXISTS itineraries_cover_kind_check;
--   ALTER TABLE public.itineraries
--     DROP COLUMN IF EXISTS cover_consent_version,
--     DROP COLUMN IF EXISTS cover_consent_at,
--     DROP COLUMN IF EXISTS cover_moment_id,
--     DROP COLUMN IF EXISTS cover_asset_id,
--     DROP COLUMN IF EXISTS cover_kind;
-- ════════════════════════════════════════════════════════════════════════════
