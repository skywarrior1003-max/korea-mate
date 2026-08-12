-- ════════════════════════════════════════════════════════════════════════════
-- 048_user_spots_photo_privacy_foundation.sql
--
-- My Places 사진 기능을 만들기 전에, "사진" 과 "그 사진을 남에게 보여도 되는가"
-- 를 DB 수준에서 먼저 갈라 둔다. 둘을 한 컬럼으로 묶으면 나중에 반드시
-- 한쪽을 바꾸려다 다른 쪽이 따라 움직인다.
--
-- 이 파일이 하는 것은 셋뿐이다.
--   ① user_spots.photo_storage_path  — private 원본이 있는 내부 경로
--   ② user_spots.photo_public        — 공개해도 된다는 사용자 동의 (기본 false)
--   ③ publish_user_spot 에서 "사용자 사진을 공개 장소 이미지로 자동 승격" 제거
--
-- ── ③ 을 지금 하는 이유 ─────────────────────────────────────────────────────
-- 025 는 city_spots.image_url 을 정할 때 관리자 override 가 없으면
-- user_spots.photo_url 을 그대로 썼다. 사진 기능이 없던 동안은 그 값이 항상
-- NULL 이라 아무 일도 일어나지 않았다. 사진을 붙이는 순간 이 경로는
-- "사용자가 올린 개인 사진이 관리자 승인만으로 공개 테이블에 실리는" 길이
-- 된다. 사진을 만들기 전에 이 길을 먼저 닫는다.
--
-- ── 이 파일이 하지 않는 것 ──────────────────────────────────────────────────
--   · 데이터 UPDATE / DELETE / INSERT / backfill — 한 줄도 없다
--   · photo_url 컬럼 변경 — legacy/external URL 필드로 그대로 둔다
--   · 최소 식별 조건(047) 변경 — 여전히 name 또는 lat/lng 쌍이다
--   · RLS · 소유권 · device_id · 다른 테이블 · 다른 함수
--   · 사진 업로드 / 삭제 / signed URL / 공개 서빙 — 전부 후속 작업
--
-- ── photo_public = false 의 의미 ────────────────────────────────────────────
-- 사진을 지운다는 뜻이 아니다. 공개 장소 화면에서 다른 여행자에게 보이지
-- 않는다는 뜻뿐이다. 원본도, My Place 의 사진도, Trip/Memory 가 쓰는 사진도
-- 그대로 남고 장소 자체의 공개 상태도 유지된다. 실제 삭제는 사용자가
-- "사진 삭제" 를 눌렀을 때만 후속 photo API 가 한다.
--
-- Memory Share 의 사진 공유와 이 동의는 서로 다른 동의다. 어느 쪽도 다른
-- 쪽을 자동으로 켜지 않는다.
--
-- ── 적용 전 확인한 것 (Production, 읽기 전용) ───────────────────────────────
--   user_spots 전체 1행 · photo_url IS NOT NULL 0
--   pending 0 · approved 0 · rejected 0 · city_spot_id NOT NULL 0
--   photo_storage_path · photo_public 컬럼 없음
--   기존 행은 신규 CHECK 둘 다 이미 만족 → 적용 시 위반 0
--
-- 적용: Supabase SQL Editor 에서 직접 실행. `supabase db push` 사용 금지.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── ① photo_storage_path ────────────────────────────────────────────────────
-- private bucket 안의 내부 경로다. signed URL 도 public URL 도 아니다.
-- 값을 정하는 것은 서버(전용 photo API)이고, 일반 Create/Update API 로
-- 사용자가 임의 경로를 밀어 넣는 길은 이번에 열지 않는다.
ALTER TABLE public.user_spots
  ADD COLUMN IF NOT EXISTS photo_storage_path TEXT;

COMMENT ON COLUMN public.user_spots.photo_storage_path IS
  'private Storage 내부 경로(server-owned). signed URL·public URL 아님. city_spots 로 복사 금지.';

-- 공백만 있는 경로는 경로가 아니다. 길이는 moments 계열 경로 형식
-- ({prefix}/{uuid}/{uuid}.jpg) 대비 넉넉한 상한으로 둔다.
ALTER TABLE public.user_spots
  ADD CONSTRAINT user_spots_photo_storage_path_chk CHECK (
    photo_storage_path IS NULL
    OR (BTRIM(photo_storage_path) <> '' AND char_length(photo_storage_path) <= 500)
  );

-- ── ② photo_public ──────────────────────────────────────────────────────────
-- 동의 플래그다. true 라고 해서 어딘가로 자동 서빙되지 않는다. 공개 판단을
-- 하는 레이어가 생겼을 때 그 레이어가 읽는 값이다.
ALTER TABLE public.user_spots
  ADD COLUMN IF NOT EXISTS photo_public BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.user_spots.photo_public IS
  '사용자가 이 사진을 다른 여행자에게 공개해도 된다고 동의했는지. 기본 false. false 는 삭제가 아니라 비노출.';

-- 사진이 없는데 동의만 남아 있는 상태를 만들지 않는다. 사진을 지웠는데
-- 플래그만 살아남으면, 나중에 다시 사진을 올리는 순간 사용자가 동의한 적
-- 없는 사진이 공개 후보가 된다.
ALTER TABLE public.user_spots
  ADD CONSTRAINT user_spots_photo_public_requires_photo_chk CHECK (
    NOT photo_public
    OR photo_storage_path IS NOT NULL
  );

-- ── ③ publish_user_spot — 사용자 사진 자동 승격 제거 ────────────────────────
-- 025 와 달라지는 곳은 두 군데뿐이다.
--   · v_orig_photo_url 을 더 이상 읽지 않는다 (선언·SELECT 대상에서 제거)
--   · v_image_url 이 관리자가 명시한 overrides.image_url 만 쓴다
-- 시그니처·반환형·SECURITY DEFINER·search_path·상태 전이·검증·중복 처리·
-- 예외 매핑은 025 그대로다. 040 은 이 함수를 건드리지 않으므로
-- (trigger 함수 3개만 ALTER 한다) 025 의 search_path = '' 가 최종 상태다.
--
-- v_orig_photo_url 을 "쓰지 않는 변수" 로 남기지 않고 아예 읽지 않는다.
-- 값이 함수 안에 들어와 있으면 다음 사람이 다시 쓰게 된다.
CREATE OR REPLACE FUNCTION public.publish_user_spot(
  p_user_spot_id UUID,
  p_overrides    JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  -- 원본 user_spot 조회 값
  v_submission_status TEXT;
  v_existing_csid     BIGINT;
  v_orig_name         TEXT;
  v_orig_city         TEXT;
  v_orig_category     TEXT;
  v_orig_address      TEXT;
  v_orig_lat          DOUBLE PRECISION;
  v_orig_lng          DOUBLE PRECISION;
  v_orig_note         TEXT;
  -- v_orig_photo_url 제거(048): 사용자 사진은 공개 이미지 출처가 아니다.

  -- 최종 삽입값 (원본 + overrides 병합 후)
  v_name        TEXT;
  v_city        TEXT;
  v_category    TEXT;
  v_subcategory TEXT;
  v_address     TEXT;
  v_lat         DOUBLE PRECISION;
  v_lng         DOUBLE PRECISION;
  v_description TEXT;
  v_image_url   TEXT;
  v_district    TEXT;
  v_name_l10n   JSONB;
  v_desc_l10n   JSONB;
  v_why         TEXT;
  v_why_l10n    JSONB;

  v_city_spot_id    BIGINT;
  v_constraint_name TEXT;
BEGIN
  -- ── 1. FOR UPDATE 행 잠금 ────────────────────────────────────────────────────
  -- 관리자 버튼 중복 클릭·동시 요청 방지
  -- 잠금 획득 직후 city_spot_id IS NULL 재검사로 중복 게시 원천 차단
  -- 048: photo_url 을 더 이상 읽지 않는다.
  SELECT
    submission_status,
    city_spot_id,
    name, city, category, address,
    lat, lng, note
  INTO
    v_submission_status,
    v_existing_csid,
    v_orig_name, v_orig_city, v_orig_category, v_orig_address,
    v_orig_lat, v_orig_lng, v_orig_note
  FROM public.user_spots
  WHERE id = p_user_spot_id
  FOR UPDATE;

  -- ── 2. 존재 여부 확인 ────────────────────────────────────────────────────────
  IF NOT FOUND THEN
    RAISE EXCEPTION 'USER_SPOT_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  -- ── 3. 상태 가드 ─────────────────────────────────────────────────────────────
  -- pending 상태에서 직접 publish 호출 방지
  IF v_submission_status <> 'approved' THEN
    RAISE EXCEPTION 'USER_SPOT_NOT_APPROVED' USING ERRCODE = 'P0001';
  END IF;

  -- 이미 게시된 장소 재반영 방지
  IF v_existing_csid IS NOT NULL THEN
    RAISE EXCEPTION 'USER_SPOT_ALREADY_PUBLISHED' USING ERRCODE = 'P0001';
  END IF;

  -- ── 4. overrides JSONB 타입 확인 ─────────────────────────────────────────────
  -- NULL은 허용 (overrides 없음), 그 외는 object만 허용
  IF p_overrides IS NOT NULL AND jsonb_typeof(p_overrides) <> 'object' THEN
    RAISE EXCEPTION 'USER_SPOT_INVALID_OVERRIDE' USING ERRCODE = 'P0001';
  END IF;

  -- ── 4b. overrides 허용 키 외 입력 명시적 거부 ───────────────────────────────
  -- silent ignore가 아닌 명시적 차단 — 호출자 오류를 즉시 감지
  IF p_overrides IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM jsonb_object_keys(p_overrides) AS k
      WHERE k NOT IN (
        'name', 'city', 'category', 'subcategory', 'address',
        'lat', 'lng', 'description', 'image_url', 'district',
        'name_l10n', 'desc_l10n', 'why_it_matters', 'why_l10n'
      )
    ) THEN
      RAISE EXCEPTION 'USER_SPOT_INVALID_OVERRIDE' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- ── 5. allowlist 14개 추출 + 원본과 병합 (overrides 우선) ────────────────────
  -- 텍스트: overrides 우선, NULL/공백이면 원본 사용
  v_name        := NULLIF(BTRIM(COALESCE(p_overrides->>'name',          v_orig_name)),     '');
  v_city        := NULLIF(BTRIM(COALESCE(p_overrides->>'city',          v_orig_city)),     '');
  v_category    := NULLIF(BTRIM(COALESCE(p_overrides->>'category',      v_orig_category)), '');
  v_subcategory := NULLIF(BTRIM(p_overrides->>'subcategory'),                               '');
  v_address     := NULLIF(BTRIM(COALESCE(p_overrides->>'address',       v_orig_address)),  '');
  v_description := NULLIF(BTRIM(COALESCE(p_overrides->>'description',   v_orig_note)),     '');
  -- 048: 관리자가 명시한 public-safe 이미지만 쓴다. 원본 fallback 없음.
  v_image_url   := NULLIF(BTRIM(p_overrides->>'image_url'),                                 '');
  v_district    := NULLIF(BTRIM(p_overrides->>'district'),                                  '');
  v_why         := NULLIF(BTRIM(p_overrides->>'why_it_matters'),                            '');

  -- JSONB 필드: overrides에 키 있으면 사용, 없으면 NULL (user 장소는 원본 없음)
  v_name_l10n := p_overrides->'name_l10n';
  v_desc_l10n := p_overrides->'desc_l10n';
  v_why_l10n  := p_overrides->'why_l10n';

  -- 좌표: overrides에 키 있을 때만 교체 (타입 검증 포함), 없으면 원본
  IF p_overrides IS NOT NULL AND p_overrides ? 'lat' THEN
    IF jsonb_typeof(p_overrides->'lat') <> 'number' THEN
      RAISE EXCEPTION 'USER_SPOT_INVALID_OVERRIDE' USING ERRCODE = 'P0001';
    END IF;
    v_lat := (p_overrides->>'lat')::DOUBLE PRECISION;
  ELSE
    v_lat := v_orig_lat;
  END IF;

  IF p_overrides IS NOT NULL AND p_overrides ? 'lng' THEN
    IF jsonb_typeof(p_overrides->'lng') <> 'number' THEN
      RAISE EXCEPTION 'USER_SPOT_INVALID_OVERRIDE' USING ERRCODE = 'P0001';
    END IF;
    v_lng := (p_overrides->>'lng')::DOUBLE PRECISION;
  ELSE
    v_lng := v_orig_lng;
  END IF;

  -- ── 6. 필수값 hard block (원본 + overrides 병합 후 최종값 기준) ───────────────
  -- 좌표 없는 장소는 거리 기반 일정 배치 불가 → 반영 금지
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'USER_SPOT_REQUIRED_FIELD' USING ERRCODE = 'P0001';
  END IF;
  IF v_city IS NULL THEN
    RAISE EXCEPTION 'USER_SPOT_REQUIRED_FIELD' USING ERRCODE = 'P0001';
  END IF;
  IF v_category IS NULL THEN
    RAISE EXCEPTION 'USER_SPOT_REQUIRED_FIELD' USING ERRCODE = 'P0001';
  END IF;
  IF v_lat IS NULL OR v_lng IS NULL THEN
    RAISE EXCEPTION 'USER_SPOT_REQUIRED_FIELD' USING ERRCODE = 'P0001';
  END IF;

  -- ── 7. category 5종 검증 ─────────────────────────────────────────────────────
  IF v_category NOT IN ('attraction', 'nature', 'restaurant', 'event', 'accommodation') THEN
    RAISE EXCEPTION 'USER_SPOT_INVALID_OVERRIDE' USING ERRCODE = 'P0001';
  END IF;

  -- ── 8. 좌표 범위 검증 ────────────────────────────────────────────────────────
  IF v_lat < -90 OR v_lat > 90 THEN
    RAISE EXCEPTION 'USER_SPOT_INVALID_OVERRIDE' USING ERRCODE = 'P0001';
  END IF;
  IF v_lng < -180 OR v_lng > 180 THEN
    RAISE EXCEPTION 'USER_SPOT_INVALID_OVERRIDE' USING ERRCODE = 'P0001';
  END IF;

  -- ── 8.5 이름+도시 중복 사전 검사 ────────────────────────────────────────────
  -- uq_city_spots_city_name 충돌 선제 차단 → 관리자에게 정확한 원인 전달
  -- 병합 후 최종값 기준: 스텝 5 이후에만 유효
  IF EXISTS (
    SELECT 1 FROM public.city_spots
    WHERE city = v_city AND name = v_name
  ) THEN
    RAISE EXCEPTION 'USER_SPOT_DUPLICATE_NAME' USING ERRCODE = 'P0001';
  END IF;

  -- ── 9. city_spots INSERT ──────────────────────────────────────────────────────
  -- source_type='user', external_id=UUID::text 강제 (overrides 변경 불가)
  -- UNIQUE INDEX (source_type, external_id) WHERE external_id IS NOT NULL:
  --   FOR UPDATE + IS NULL 재검사 이후의 마지막 동시성 방어선
  INSERT INTO public.city_spots (
    city, name, category, subcategory,
    address, lat, lng,
    description, image_url, district,
    name_l10n, desc_l10n, why_it_matters, why_l10n,
    source_type, external_id,
    created_at, updated_at
  ) VALUES (
    v_city, v_name, v_category, v_subcategory,
    v_address, v_lat, v_lng,
    v_description, v_image_url, v_district,
    v_name_l10n, v_desc_l10n, v_why, v_why_l10n,
    'user', p_user_spot_id::TEXT,
    NOW(), NOW()
  )
  RETURNING id INTO v_city_spot_id;

  -- ── 10. user_spots 역참조 갱신 ───────────────────────────────────────────────
  -- INSERT 성공 직후 동일 트랜잭션 내 업데이트 → 원자적 보장
  UPDATE public.user_spots
  SET city_spot_id = v_city_spot_id,
      published_at = NOW(),
      updated_at   = NOW()
  WHERE id = p_user_spot_id;

  RETURN jsonb_build_object('city_spot_id', v_city_spot_id);

EXCEPTION
  WHEN unique_violation THEN
    -- 사전 검사(8.5)를 통과한 뒤 INSERT에서 동시 충돌이 발생하는 경우 최종 방어
    -- CONSTRAINT_NAME: PostgreSQL은 CREATE UNIQUE INDEX 충돌 시 인덱스명을 반환
    GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;
    IF v_constraint_name = 'uq_city_spots_city_name' THEN
      RAISE EXCEPTION 'USER_SPOT_DUPLICATE_NAME' USING ERRCODE = 'P0001';
    ELSIF v_constraint_name = 'idx_city_spots_source_external' THEN
      -- external_id 충돌 = 동일 user_spot 재게시 시도 (정상 경로에서는 발생 불가)
      RAISE EXCEPTION 'USER_SPOT_ALREADY_PUBLISHED' USING ERRCODE = 'P0001';
    ELSE
      RAISE;
    END IF;
END;
$$;

-- CREATE OR REPLACE 는 기존 ACL 을 유지하지만, 최종 상태를 문서와 코드가
-- 같은 말을 하도록 025 와 동일한 권한을 다시 명시한다 (멱등).
REVOKE ALL     ON FUNCTION public.publish_user_spot(UUID, JSONB) FROM PUBLIC;
REVOKE ALL     ON FUNCTION public.publish_user_spot(UUID, JSONB) FROM anon;
REVOKE ALL     ON FUNCTION public.publish_user_spot(UUID, JSONB) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.publish_user_spot(UUID, JSONB) TO service_role;

COMMIT;

-- ── 적용 후 확인 SQL (읽기 전용, 별도 실행) ─────────────────────────────────
--
-- ① 신규 컬럼 2개
-- SELECT column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--  WHERE table_schema = 'public' AND table_name = 'user_spots'
--    AND column_name IN ('photo_storage_path', 'photo_public')
--  ORDER BY column_name;
--   → photo_public       : boolean · NO  · false
--   → photo_storage_path : text    · YES · (null)
--
-- ② CHECK 제약 4종 (신규 2 + 047 기존 2)
-- SELECT conname FROM pg_constraint
--  WHERE conrelid = 'public.user_spots'::regclass AND contype = 'c'
--  ORDER BY conname;
--   → user_spots_latlng_pair_chk
--     user_spots_min_identity_chk
--     user_spots_photo_public_requires_photo_chk
--     user_spots_photo_storage_path_chk
--
-- ③ 데이터 무변화 · 기존 행 호환
-- SELECT count(*) AS total,
--        count(*) FILTER (WHERE photo_public)              AS photo_public_true,
--        count(*) FILTER (WHERE photo_storage_path IS NOT NULL) AS has_path
--   FROM public.user_spots;
--   → total 은 적용 전과 동일, photo_public_true = 0, has_path = 0
--
-- ④ publish RPC 보안 속성 (본문 전체를 출력할 필요 없다)
-- SELECT p.prosecdef AS security_definer, p.proconfig AS config
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--  WHERE n.nspname = 'public' AND p.proname = 'publish_user_spot';
--   → security_definer = true · config = {search_path=""}
--
-- ⑤ 사용자 사진이 공개 이미지 출처로 남아 있지 않은지
-- SELECT (pg_get_functiondef(p.oid) LIKE '%photo_url%')          AS references_photo_url,
--        (pg_get_functiondef(p.oid) LIKE '%photo_storage_path%') AS references_storage_path
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--  WHERE n.nspname = 'public' AND p.proname = 'publish_user_spot';
--   → 둘 다 false 여야 한다
--
-- ⑥ EXECUTE 권한
-- SELECT has_function_privilege('service_role',   'public.publish_user_spot(uuid,jsonb)', 'EXECUTE') AS service_role,
--        has_function_privilege('anon',           'public.publish_user_spot(uuid,jsonb)', 'EXECUTE') AS anon,
--        has_function_privilege('authenticated',  'public.publish_user_spot(uuid,jsonb)', 'EXECUTE') AS authenticated;
--   → true · false · false

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK  (문서용. 자동 실행하지 않는다. 실제 필요 시 오너 승인 후 수동 실행)
--
-- 순서를 지킨다. 함수를 먼저 되돌리고 컬럼을 나중에 떼야, 되돌린 함수가
-- 이미 없는 컬럼을 참조하는 창이 생기지 않는다.
--
--   1) publish_user_spot 을 048 이전 정의로 복원
--      = 025 의 CREATE OR REPLACE 블록 전문을 그대로 다시 실행한다.
--        (025 는 SECURITY DEFINER + SET search_path = '' 를 이미 포함한다.
--         040 은 이 함수를 건드리지 않으므로 025 만으로 보안 상태가 완전하다.)
--        이어서 025 의 REVOKE 3줄 + GRANT 1줄도 함께 실행한다.
--
--   2) 신규 CHECK 제거
--      ALTER TABLE public.user_spots DROP CONSTRAINT IF EXISTS user_spots_photo_public_requires_photo_chk;
--      ALTER TABLE public.user_spots DROP CONSTRAINT IF EXISTS user_spots_photo_storage_path_chk;
--
--   3) 컬럼을 떼기 전에 데이터가 있는지 먼저 센다
--      SELECT count(*) FILTER (WHERE photo_storage_path IS NOT NULL) AS has_path,
--             count(*) FILTER (WHERE photo_public)                   AS consented
--        FROM public.user_spots;
--
--   4) 위 두 값이 0 이 아니면 여기서 멈춘다. 컬럼을 떨어뜨리면 사용자가
--      올린 사진의 경로와 공개 동의 기록이 함께 사라진다. Storage 의 파일은
--      남는데 그것을 가리키는 참조만 없어지는, 회수 불가능한 상태다.
--      그 행들을 어떻게 할지는 운영 판단이 필요하다.
--
--   5) 0 일 때만:
--      ALTER TABLE public.user_spots DROP COLUMN IF EXISTS photo_public;
--      ALTER TABLE public.user_spots DROP COLUMN IF EXISTS photo_storage_path;
-- ════════════════════════════════════════════════════════════════════════════
