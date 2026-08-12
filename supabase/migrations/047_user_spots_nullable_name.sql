-- ════════════════════════════════════════════════════════════════════════════
-- 047_user_spots_nullable_name.sql
--
-- My Place 를 만들 때 이름을 손으로 적는 것이 더 이상 필수가 아니다.
-- 018 이 name 을 NOT NULL 로 잡아 두어서, 좌표만 있는 장소를 저장할 수 없었다.
--
-- 대신 빈 행이 들어오는 것은 막아야 한다. 그래서 NOT NULL 을 푸는 대신
-- "최소 하나의 식별 정보" 를 요구하는 CHECK 로 바꾼다:
--
--     공백이 아닌 name      또는      lat 과 lng 가 모두 있음
--
-- API 도 같은 규칙을 검사한다. DB CHECK 는 API 를 우회한 경로(관리자 도구,
-- 향후 다른 클라이언트)에서도 규칙이 깨지지 않게 하는 마지막 방어선이다.
--
-- ── 적용 범위 ───────────────────────────────────────────────────────────────
-- 이 파일은 user_spots 세 가지만 바꾼다. 데이터를 지우거나 다시 쓰지 않는다.
--   ① name  NOT NULL 해제
--   ② user_spots_min_identity_chk   빈 행 금지
--   ③ user_spots_latlng_pair_chk    좌표 한쪽만 있는 상태 금지
--
-- publish_user_spot(025) 은 건드리지 않는다. 공개 게시는 지금처럼
-- name·city·category·lat·lng 를 모두 요구한다 — private 은 느슨해져도
-- public 에 나가는 장소는 사람이 알아볼 이름이 있어야 하기 때문이다.
--
-- ── 적용 전 확인한 것 (Production, 읽기 전용) ───────────────────────────────
--   전체 행 1 · name IS NULL 0 · name = '' 0
--   lat/lng 한쪽만 있는 행 0 · 좌표를 가진 행 0
--   기존 행은 세 변경 모두를 이미 만족한다 → 적용 시 위반 0
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── ① name NOT NULL 해제 ────────────────────────────────────────────────────
ALTER TABLE public.user_spots
  ALTER COLUMN name DROP NOT NULL;

-- ── ② 최소 식별 정보 ────────────────────────────────────────────────────────
-- BTRIM 으로 공백만 있는 이름을 이름으로 쳐 주지 않는다. 좌표는 짝이 맞아야
-- 위치로 인정한다(③ 이 이미 강제하지만, 이 조건만 따로 읽어도 뜻이 통하도록
-- 여기서도 둘 다 검사한다).
ALTER TABLE public.user_spots
  ADD CONSTRAINT user_spots_min_identity_chk CHECK (
    NULLIF(BTRIM(COALESCE(name, '')), '') IS NOT NULL
    OR (lat IS NOT NULL AND lng IS NOT NULL)
  );

-- ── ③ 좌표는 짝으로만 ───────────────────────────────────────────────────────
-- 위도만 있고 경도가 없는 행은 지도에 찍을 수도, 고칠 수도 없다.
ALTER TABLE public.user_spots
  ADD CONSTRAINT user_spots_latlng_pair_chk CHECK (
    (lat IS NULL) = (lng IS NULL)
  );

COMMIT;

-- ── 적용 후 확인 SQL ────────────────────────────────────────────────────────
-- SELECT is_nullable FROM information_schema.columns
--  WHERE table_schema = 'public' AND table_name = 'user_spots' AND column_name = 'name';
--   → 'YES' 여야 한다
--
-- SELECT conname FROM pg_constraint
--  WHERE conrelid = 'public.user_spots'::regclass AND contype = 'c'
--  ORDER BY conname;
--   → user_spots_min_identity_chk · user_spots_latlng_pair_chk 가 보여야 한다
--
-- SELECT count(*) FROM public.user_spots;
--   → 적용 전과 같아야 한다 (이 migration 은 행을 만들지도 지우지도 않는다)

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK  (되돌릴 때만, BEGIN/COMMIT 을 붙여 별도로 실행)
--
-- 순서를 지켜야 한다. CHECK 를 먼저 떼지 않으면 아래 확인 쿼리가 의미가 없다.
--
--   1) ALTER TABLE public.user_spots DROP CONSTRAINT IF EXISTS user_spots_latlng_pair_chk;
--      ALTER TABLE public.user_spots DROP CONSTRAINT IF EXISTS user_spots_min_identity_chk;
--
--   2) SELECT count(*) FROM public.user_spots
--       WHERE NULLIF(BTRIM(COALESCE(name, '')), '') IS NULL;
--
--   3) 위 count 가 0 이 아니면 여기서 멈춘다. NOT NULL 을 되살리면 그 행들이
--      막힌다. 가짜 이름을 채워 넣어 통과시키지 않는다 — 사용자가 적지 않은
--      이름을 우리가 지어내는 것이기 때문이다. 그 행들을 어떻게 할지는
--      (사용자에게 이름을 요청할지, 보관할지) 운영 판단이 필요하다.
--
--   4) count 가 0 일 때만:
--      ALTER TABLE public.user_spots ALTER COLUMN name SET NOT NULL;
-- ════════════════════════════════════════════════════════════════════════════
