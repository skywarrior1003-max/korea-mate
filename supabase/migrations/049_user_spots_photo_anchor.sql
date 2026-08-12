-- ════════════════════════════════════════════════════════════════════════════
-- 049_user_spots_photo_anchor.sql
--
-- 사진을 저장 근거(Anchor)로 인정한다.
--
-- 지금까지 My Place 를 만들려면 이름을 적거나 좌표가 있어야 했다. 그런데
-- "여기, 이 사진" 만 남기고 싶은 순간이 있다. 위치 권한을 거부했거나 실내라
-- 좌표가 안 잡히는데 사진은 있는 경우도 있다. 그때 사용자에게 이름을
-- 지어내라고 요구하면, 우리가 강요해서 만들어진 가짜 이름이 남는다.
--
-- ── 이 파일이 바꾸는 것 ─────────────────────────────────────────────────────
--   user_spots_min_identity_chk 하나뿐이다.
--
--   전:  공백 아닌 name  OR  (lat AND lng)
--   후:  공백 아닌 name  OR  (lat AND lng)  OR  photo_storage_path 있음
--
--   조건은 OR 이다. AND 는 좌표 짝(lat AND lng) 안에서만이며 그 규칙은
--   user_spots_latlng_pair_chk 가 계속 따로 강제한다.
--
-- ── name 을 남기는 이유 ─────────────────────────────────────────────────────
-- 최종 제품에서 사용자가 손으로 적는 이름은 identity 가 아니다. 제목은
-- 장소를 이해하는 근거가 아니라 표현 값이다.
--
-- 그런데 지금 화면에는 아직 사진 입력이 없다. DB 에서 name 항을 먼저 빼면
-- 이름만으로 만든 기존 행이 다음 수정에서 막히고, 지금 살아 있는 저장
-- 경로도 함께 막힌다. 그래서 이번에는 **호환용으로만** 남긴다.
--
-- 이 조항의 존재를 "이름이 identity 다" 로 읽지 않는다. 사진 입력 UI 와
-- Anchor 기반 저장 조건이 함께 들어가는 다음 단계에서 제거 대상이다.
--
-- ── 이 파일이 하지 않는 것 ──────────────────────────────────────────────────
--   · 데이터 UPDATE / DELETE / INSERT / backfill — 한 줄도 없다
--   · latlng_pair · photo_storage_path · photo_public_requires_photo CHECK 무변경
--   · RLS · 소유권 · device_id · publish RPC · 다른 테이블 · Memory Share
--   · 새 컬럼 추가 (canonical relation · display_title · trip context 는 별도 단계)
--
-- ── 적용 전 확인한 것 (Production, 읽기 전용) ───────────────────────────────
--   user_spots 전체 1행 · photo_storage_path NOT NULL 0 · photo_public true 0
--   name NULL & lat NULL 0 · orphan lat/lng 0
--   새 조건은 기존 조건에 OR 항을 더한 것뿐이라, 지금 통과하는 행은 전부
--   그대로 통과한다 → 적용 시 위반 0
--
-- 적용: Supabase SQL Editor 에서 직접 실행. `supabase db push` 사용 금지.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- 이름을 바꾸지 않고 같은 이름으로 교체한다. 제약 이름이 바뀌면 이 규칙을
-- 참조하는 문서·검증 SQL·운영 절차가 전부 갈라진다.
ALTER TABLE public.user_spots
  DROP CONSTRAINT IF EXISTS user_spots_min_identity_chk;

ALTER TABLE public.user_spots
  ADD CONSTRAINT user_spots_min_identity_chk CHECK (
    -- ① legacy 호환. 최종 Anchor 가 아니다 (위 주석 참조).
    NULLIF(BTRIM(COALESCE(name, '')), '') IS NOT NULL
    -- ② 좌표는 짝일 때만 위치다.
    OR (lat IS NOT NULL AND lng IS NOT NULL)
    -- ③ 사진. 공백 문자열은 user_spots_photo_storage_path_chk 가 이미 막는다.
    OR photo_storage_path IS NOT NULL
  );

COMMIT;

-- ── 적용 후 확인 SQL (읽기 전용, 별도 실행) ─────────────────────────────────
--
-- ① CHECK 4종이 모두 있는지
-- SELECT conname FROM pg_constraint
--  WHERE conrelid = 'public.user_spots'::regclass AND contype = 'c'
--  ORDER BY conname;
--   → user_spots_latlng_pair_chk
--     user_spots_min_identity_chk
--     user_spots_photo_public_requires_photo_chk
--     user_spots_photo_storage_path_chk
--
-- ② min_identity 정의에 세 항이 모두 들어갔는지
-- SELECT pg_get_constraintdef(oid) LIKE '%name%'               AS has_name,
--        pg_get_constraintdef(oid) LIKE '%lat%'                AS has_lat,
--        pg_get_constraintdef(oid) LIKE '%photo_storage_path%' AS has_photo
--   FROM pg_constraint
--  WHERE conrelid = 'public.user_spots'::regclass
--    AND conname  = 'user_spots_min_identity_chk';
--   → true / true / true
--
-- ③ 데이터 무변화
-- SELECT count(*) AS total,
--        count(*) FILTER (WHERE photo_storage_path IS NOT NULL) AS has_photo,
--        count(*) FILTER (WHERE photo_public)                   AS consented
--   FROM public.user_spots;
--   → total 은 적용 전과 동일, 나머지는 적용 전 값 그대로
--
-- ④ 기존 행 위반 0 (새 조건을 손으로 재현해 센다)
-- SELECT count(*) FROM public.user_spots
--  WHERE NOT (
--        NULLIF(BTRIM(COALESCE(name, '')), '') IS NOT NULL
--     OR (lat IS NOT NULL AND lng IS NOT NULL)
--     OR photo_storage_path IS NOT NULL
--  );
--   → 0

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK  (문서용. 자동 실행하지 않는다. 실제 필요 시 오너 승인 후 수동 실행)
--
-- 되돌리면 조건이 좁아진다. 사진만으로 만들어진 행은 새 조건에서는 정상이지만
-- 옛 조건에서는 위반이다. 그 행이 하나라도 있으면 ADD CONSTRAINT 가 실패하거나,
-- 통과시키려고 가짜 이름·가짜 좌표를 채우게 된다. 둘 다 하지 않는다.
--
--   1) 사진만으로 존재하는 행이 있는지 먼저 센다
--      SELECT count(*) FROM public.user_spots
--       WHERE NULLIF(BTRIM(COALESCE(name, '')), '') IS NULL
--         AND lat IS NULL
--         AND photo_storage_path IS NOT NULL;
--
--   2) 위 count 가 0 이 아니면 여기서 멈춘다. 그 행들을 어떻게 할지는
--      (사용자에게 위치·이름을 요청할지, 보관할지) 운영 판단이 필요하다.
--      우리가 대신 값을 지어내지 않는다.
--
--   3) count 가 0 일 때만 047 의 조건으로 되돌린다:
--      ALTER TABLE public.user_spots DROP CONSTRAINT IF EXISTS user_spots_min_identity_chk;
--      ALTER TABLE public.user_spots
--        ADD CONSTRAINT user_spots_min_identity_chk CHECK (
--          NULLIF(BTRIM(COALESCE(name, '')), '') IS NOT NULL
--          OR (lat IS NOT NULL AND lng IS NOT NULL)
--        );
-- ════════════════════════════════════════════════════════════════════════════
