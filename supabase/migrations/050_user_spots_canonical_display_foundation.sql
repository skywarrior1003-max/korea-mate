-- ════════════════════════════════════════════════════════════════════════════
-- 050_user_spots_canonical_display_foundation.sql
--
-- 개인 기록이 들어갈 자리를 만든다. 컬럼 셋뿐이고, 아직 아무도 쓰지 않는다.
--
--   ① related_city_spot_id  이 개인 장소가 어떤 공개 장소와 관련 있는가
--   ② display_title         개인용 제목
--   ③ display_memo          개인용 짧은 기록
--
-- ── 왜 기존 컬럼을 쓰지 않는가 ──────────────────────────────────────────────
-- name 과 note 는 이미 공개로 나가는 값이다. publish_user_spot 이 승인된 장소를
-- city_spots 에 넣을 때 name → city_spots.name, note → city_spots.description
-- 으로 간다. 여기에 개인적인 제목이나 감상을 담으면, 승인 한 번에 그것이 다른
-- 여행자가 보는 카탈로그 문구가 된다.
--
-- city_spot_id 도 마찬가지다. 024 가 "게시 여부 기준: city_spot_id IS NOT NULL
-- (단일 기준)" 이라고 못 박아 두었고 관리자 화면이 그 값으로 게시 건수를 센다.
-- 여기에 "관련 있는 장소" 를 넣으면 게시된 적 없는 장소가 게시된 것으로
-- 집계되고, publish RPC 의 중복 게시 가드가 정상 게시를 막는다.
--
-- 그래서 세 값 모두 자기 자리를 새로 갖는다.
--
-- ── 이 파일이 하지 않는 것 ──────────────────────────────────────────────────
--   · 데이터 UPDATE / DELETE / INSERT / backfill — 한 줄도 없다
--   · 049 의 user_spots_min_identity_chk 변경 (아래 참조)
--   · photo privacy CHECK · latlng pair CHECK · RLS · 소유권
--   · publish_user_spot 등 함수 · 다른 테이블
--
-- ── related_city_spot_id 를 최소 식별 조건에 넣지 않는 이유 ─────────────────
-- 관계는 의미상 충분한 근거다 — 사용자가 그 장소를 직접 지목했기 때문이다.
-- 그런데 FK 가 ON DELETE SET NULL 이라, 공개 장소가 지워지면 관계만 있던
-- 개인 장소는 근거가 0 이 되면서 CHECK 를 어긴 채 남는다. 남의 데이터 삭제가
-- 내 기록을 깨뜨리는 구조는 만들지 않는다.
--
-- 그래서 다음 단계의 canonical 생성은 관계와 함께 그 시점 좌표를 복사해 둔다.
-- 좌표가 없는 공개 장소(적용 시점 714 중 116)에 대한 처리를 설계한 뒤에야
-- 관계를 CHECK 에 넣을지 다시 판단한다.
--
-- ── 적용 전 확인한 것 (Production, 읽기 전용) ───────────────────────────────
--   user_spots 1행 · 세 컬럼 모두 없음 · 현재 컬럼 18개
--   city_spots 714 · 좌표 있음 598 · 좌표 없음 116 · 한쪽만 0
--   ADD COLUMN 뿐이라 기존 행은 전부 NULL 로 채워지고 위반 0
--
-- 적용: Supabase SQL Editor 에서 직접 실행. `supabase db push` 사용 금지.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── ① 공개 장소와의 관계 ────────────────────────────────────────────────────
-- 소유가 아니라 참조다. 여러 사람의 개인 장소가 같은 공개 장소를 각각 가리킬
-- 수 있어야 하므로 UNIQUE 를 걸지 않는다. 공개 장소가 사라져도 개인 기록은
-- 남아야 하므로 CASCADE 가 아니라 SET NULL 이다.
ALTER TABLE public.user_spots
  ADD COLUMN IF NOT EXISTS related_city_spot_id BIGINT
    REFERENCES public.city_spots(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.user_spots.related_city_spot_id IS
  '이 개인 장소가 관련 있는 공개 city_spots 행. 참조일 뿐 게시 상태가 아니다(게시는 city_spot_id).';

-- 관계가 있는 행만 인덱싱한다. 대부분은 NULL 이다.
CREATE INDEX IF NOT EXISTS user_spots_related_city_spot_idx
  ON public.user_spots (related_city_spot_id)
  WHERE related_city_spot_id IS NOT NULL;

-- ── ② 개인용 제목 ───────────────────────────────────────────────────────────
-- name 과 길이를 맞춘다(300). 같은 자리에 보이는 값이라 한쪽만 더 길면
-- 화면에서 어느 쪽이 잘릴지가 값에 따라 달라진다.
ALTER TABLE public.user_spots
  ADD COLUMN IF NOT EXISTS display_title TEXT;

COMMENT ON COLUMN public.user_spots.display_title IS
  '개인용 제목. factual name 과 분리되며 공개 게시에 쓰이지 않는다.';

ALTER TABLE public.user_spots
  ADD CONSTRAINT user_spots_display_title_chk CHECK (
    display_title IS NULL
    OR (BTRIM(display_title) <> '' AND char_length(display_title) <= 300)
  );

-- ── ③ 개인용 짧은 기록 ──────────────────────────────────────────────────────
-- 상한 1000. note 는 2000 이지만 그건 사용자가 길게 적을 수 있는 메모다.
-- 이 값은 한두 문장짜리 기록이라, 넉넉하되 note 보다 작게 두어 두 컬럼의
-- 성격 차이를 길이로도 남긴다. address(500) 보다는 크다.
ALTER TABLE public.user_spots
  ADD COLUMN IF NOT EXISTS display_memo TEXT;

COMMENT ON COLUMN public.user_spots.display_memo IS
  '개인용 짧은 기록. note 와 분리되며 공개 description 으로 쓰이지 않는다.';

ALTER TABLE public.user_spots
  ADD CONSTRAINT user_spots_display_memo_chk CHECK (
    display_memo IS NULL
    OR (BTRIM(display_memo) <> '' AND char_length(display_memo) <= 1000)
  );

COMMIT;

-- ── 적용 후 확인 SQL (읽기 전용, 별도 실행) ─────────────────────────────────
--
-- ① 신규 컬럼 3개
-- SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--  WHERE table_schema='public' AND table_name='user_spots'
--    AND column_name IN ('related_city_spot_id','display_title','display_memo')
--  ORDER BY column_name;
--   → display_memo text YES · display_title text YES · related_city_spot_id bigint YES
--
-- ② FK 와 삭제 동작
-- SELECT c.conname,
--        confdeltype AS on_delete,          -- 'n' = SET NULL
--        pg_get_constraintdef(c.oid)        AS def
--   FROM pg_constraint c
--  WHERE c.conrelid = 'public.user_spots'::regclass AND c.contype = 'f'
--  ORDER BY c.conname;
--   → related_city_spot_id → city_spots(id) ON DELETE SET NULL 이 보여야 한다
--
-- ③ 부분 인덱스
-- SELECT indexname, indexdef FROM pg_indexes
--  WHERE schemaname='public' AND tablename='user_spots'
--    AND indexname='user_spots_related_city_spot_idx';
--   → WHERE (related_city_spot_id IS NOT NULL)
--
-- ④ CHECK 6종 (신규 2 + 기존 4)
-- SELECT conname FROM pg_constraint
--  WHERE conrelid='public.user_spots'::regclass AND contype='c' ORDER BY conname;
--   → user_spots_display_memo_chk
--     user_spots_display_title_chk
--     user_spots_latlng_pair_chk
--     user_spots_min_identity_chk
--     user_spots_photo_public_requires_photo_chk
--     user_spots_photo_storage_path_chk
--
-- ⑤ 049 조건이 그대로인지 (세 항 OR)
-- SELECT pg_get_constraintdef(oid) LIKE '%name%'               AS has_name,
--        pg_get_constraintdef(oid) LIKE '%lat%'                AS has_lat,
--        pg_get_constraintdef(oid) LIKE '%photo_storage_path%' AS has_photo
--   FROM pg_constraint
--  WHERE conrelid='public.user_spots'::regclass
--    AND conname='user_spots_min_identity_chk';
--   → true / true / true
--
-- ⑥ 데이터 무변화 · 신규 컬럼은 전부 비어 있음
-- SELECT count(*) AS total,
--        count(related_city_spot_id) AS related_set,
--        count(display_title)        AS title_set,
--        count(display_memo)         AS memo_set
--   FROM public.user_spots;
--   → total 은 적용 전과 동일, 나머지 셋은 0

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK  (문서용. 자동 실행하지 않는다. 실제 필요 시 오너 승인 후 수동 실행)
--
-- 컬럼을 떨어뜨리면 그 안의 값이 함께 사라진다. 사용자가 쓴 제목과 기록은
-- 다른 어디에도 사본이 없다. 그래서 세는 것이 먼저다.
--
--   1) 값이 들어 있는 행을 센다
--      SELECT count(related_city_spot_id) AS related_set,
--             count(display_title)        AS title_set,
--             count(display_memo)         AS memo_set
--        FROM public.user_spots;
--
--   2) 셋 중 하나라도 0 이 아니면 여기서 멈춘다. 사용자가 남긴 문장을
--      우리가 대신 버리지 않는다. 어떻게 할지는 운영 판단이 필요하다.
--
--   3) 전부 0 일 때만, 만든 역순으로 되돌린다:
--      ALTER TABLE public.user_spots DROP CONSTRAINT IF EXISTS user_spots_display_memo_chk;
--      ALTER TABLE public.user_spots DROP COLUMN IF EXISTS display_memo;
--      ALTER TABLE public.user_spots DROP CONSTRAINT IF EXISTS user_spots_display_title_chk;
--      ALTER TABLE public.user_spots DROP COLUMN IF EXISTS display_title;
--      DROP INDEX IF EXISTS public.user_spots_related_city_spot_idx;
--      ALTER TABLE public.user_spots DROP COLUMN IF EXISTS related_city_spot_id;
--      -- 컬럼을 떨어뜨리면 FK 도 함께 사라진다. 따로 DROP CONSTRAINT 하지 않는다.
-- ════════════════════════════════════════════════════════════════════════════
