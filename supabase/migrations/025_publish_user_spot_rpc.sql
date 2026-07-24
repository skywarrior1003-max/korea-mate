-- ════════════════════════════════════════════════════════════════════════════
-- 025_publish_user_spot_rpc.sql
-- publish_user_spot(UUID, JSONB) — 사용자 장소 city_spots 단일 트랜잭션 게시
--
-- 호출 주체: 관리자 API (service_role 전용)
-- 보안: SECURITY DEFINER + SET search_path='' + REVOKE PUBLIC/anon/authenticated
-- 트랜잭션: city_spots INSERT + user_spots 역참조 갱신 원자적 처리
-- 동시성: FOR UPDATE 행 잠금 → IS NULL 재검사 → UNIQUE 인덱스(마지막 방어)
--
-- 오류 코드 5종 (Admin API allowlist와 1:1 대응):
--   USER_SPOT_NOT_FOUND         → API 404
--   USER_SPOT_NOT_APPROVED      → API 409
--   USER_SPOT_ALREADY_PUBLISHED → API 409
--   USER_SPOT_REQUIRED_FIELD    → API 400
--   USER_SPOT_INVALID_OVERRIDE  → API 400
--
-- overrides allowlist 14개:
--   name, city, category, subcategory, address, lat, lng,
--   description, image_url, district,
--   name_l10n, desc_l10n, why_it_matters, why_l10n
--
-- 강제 고정 (overrides 변경 불가):
--   source_type = 'user'
--   external_id = p_user_spot_id::text
--
-- 적용 전제: 024_user_spots_publish_columns.sql 적용 완료
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── STEP 1: 예상하지 않은 overload 사전 확인 ─────────────────────────────────
-- oidvectortypes: 인자 이름 무시, 타입만 비교 → pg_get_function_identity_arguments보다 안전
-- 예상 시그니처 'uuid, jsonb' 외 다른 타입 조합 존재 시 migration 즉시 중단
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM   pg_proc      p
    JOIN   pg_namespace n ON n.oid = p.pronamespace
    WHERE  n.nspname = 'public'
      AND  p.proname = 'publish_user_spot'
      AND  oidvectortypes(p.proargtypes) <> 'uuid, jsonb'
  ) THEN
    RAISE EXCEPTION
      'Unexpected publish_user_spot overload found — manual review required.';
  END IF;
END
$$;

-- ── STEP 2: RPC 생성 ──────────────────────────────────────────────────────────
-- DROP FUNCTION 금지: CREATE OR REPLACE로 동일 시그니처 교체
-- SET search_path = '': 스키마 인젝션 최고 수준 방어 (프로젝트 확립 패턴)
--   → 함수 body 내 모든 테이블을 public.* 완전 수식 필수
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
  v_orig_photo_url    TEXT;

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

  v_city_spot_id BIGINT;
BEGIN
  -- ── 1. FOR UPDATE 행 잠금 ────────────────────────────────────────────────────
  -- 관리자 버튼 중복 클릭·동시 요청 방지
  -- 잠금 획득 직후 city_spot_id IS NULL 재검사로 중복 게시 원천 차단
  SELECT
    submission_status,
    city_spot_id,
    name, city, category, address,
    lat, lng, note, photo_url
  INTO
    v_submission_status,
    v_existing_csid,
    v_orig_name, v_orig_city, v_orig_category, v_orig_address,
    v_orig_lat, v_orig_lng, v_orig_note, v_orig_photo_url
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
  v_image_url   := NULLIF(BTRIM(COALESCE(p_overrides->>'image_url',     v_orig_photo_url)),'');
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
END;
$$;

-- ── STEP 3: 권한 설정 ─────────────────────────────────────────────────────────
-- CREATE OR REPLACE 후 PostgreSQL이 PUBLIC에 EXECUTE 기본 부여 → 즉시 전면 회수
REVOKE ALL     ON FUNCTION public.publish_user_spot(UUID, JSONB) FROM PUBLIC;
REVOKE ALL     ON FUNCTION public.publish_user_spot(UUID, JSONB) FROM anon;
REVOKE ALL     ON FUNCTION public.publish_user_spot(UUID, JSONB) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.publish_user_spot(UUID, JSONB) TO service_role;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- 검증 SQL (운영 적용 후 별도 실행 — 읽기 전용)
--
-- ① 함수 존재 + SECURITY DEFINER 확인
-- SELECT routine_name, security_type
-- FROM information_schema.routines
-- WHERE routine_schema = 'public' AND routine_name = 'publish_user_spot';
-- → security_type: DEFINER 확인
--
-- ② 권한 확인 — service_role만 EXECUTE, 나머지 없음
-- SELECT grantee, privilege_type
-- FROM information_schema.routine_privileges
-- WHERE routine_name = 'publish_user_spot' AND routine_schema = 'public';
-- → PUBLIC/anon/authenticated: 행 없음 / service_role: EXECUTE 확인
--
-- ③ search_path 확인 (빈 문자열 = 최고 보안)
-- SELECT proname, proconfig
-- FROM pg_proc p
-- JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public' AND p.proname = 'publish_user_spot';
-- → proconfig: {search_path=} 확인
--
-- ④ overload 없음 확인 (예상 시그니처 1개만)
-- SELECT proname, oidvectortypes(proargtypes) AS argtypes
-- FROM pg_proc p
-- JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public' AND p.proname = 'publish_user_spot';
-- → 1행, argtypes = 'uuid, jsonb' 확인
-- ════════════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK (적용 취소 시만)
-- DROP FUNCTION IF EXISTS public.publish_user_spot(UUID, JSONB);
-- ════════════════════════════════════════════════════════════════════════════
