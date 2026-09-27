-- 080: trip_drafts 작업 단위 동기화 (THIS-TRIP-SYNC-DURABILITY-AND-CONCURRENCY-V1)
--
-- 079(스냅숏 모델)의 위험 — 700ms debounce 유실·전체 PUT 의 last-write 덮어쓰기·
-- 재시도 중복 — 을 서버 원자 연산으로 제거한다. 079 파일은 무수정(additive).
--
-- 추가 컬럼:
--  · revision    — 서버만 증가시키는 변경 세대(클라이언트 결정 불가·음수 금지).
--  · applied_ops — 최근 적용 operation id 목록(최대 64개 순환 보관 — 무한 로그
--                  없음·행 삭제(계정 삭제)와 함께 소멸하므로 별도 cleanup 불요).
--  · context     — '이 조건으로 시작' 으로 확정된 여행 조건(city/start/end)만.
--
-- 원자 RPC 두 개(service_role 전용·SECURITY DEFINER·search_path=public·외부 호출 0):
--  · trip_draft_apply — row FOR UPDATE 잠금 후 add/remove/update/reorder/clear/
--    set_trip_context 를 서버에서 적용. 같은 op_id 재요청은 상태·revision 을
--    바꾸지 않는다(응답 유실 재시도 안전). "읽기→메모리→조건 없는 UPDATE" 없음.
--  · trip_draft_merge_guest — 로그인 병합도 같은 잠금 규율로(§4.2 내부 전용 경로).
--    합집합 규칙은 기존 TS 병합과 동일: account 순서 유지·guest 신규만 뒤에.
--
-- 항목 identity = tripCity + '|' + coalesce(sourceKey, id) — 로컬 카트가 같은
-- 장소를 도시별 별도 선택으로 보관하는 모델과 1:1. reorder 는 membership 을 바꾸지
-- 않는다 — 목록에 없는(동시 추가된) 항목은 기존 상대 순서로 뒤에 보존된다.

BEGIN;

ALTER TABLE public.trip_drafts
  ADD COLUMN IF NOT EXISTS revision    BIGINT NOT NULL DEFAULT 0 CHECK (revision >= 0),
  ADD COLUMN IF NOT EXISTS applied_ops JSONB  NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS context     JSONB;

-- ── 항목 identity helper ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trip_draft_item_key(item JSONB)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS
$$ SELECT COALESCE(item->>'tripCity','') || '|' ||
          COALESCE(NULLIF(item->>'sourceKey',''), item->>'id', '') $$;

-- ── 원자 적용 ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trip_draft_apply(
  p_owner_type TEXT, p_owner_id UUID, p_op_id TEXT, p_op_type TEXT, p_payload JSONB
)
RETURNS TABLE (revision BIGINT, applied BOOLEAN, items JSONB, context JSONB)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_row   public.trip_drafts%ROWTYPE;
  v_items JSONB;
  v_ctx   JSONB;
  v_key   TEXT;
  v_new   JSONB := '[]'::jsonb;
  v_it    JSONB;
  v_max   NUMERIC := 0;
  v_seen  BOOLEAN;
  v_ord   INT := 0;
BEGIN
  IF p_owner_type NOT IN ('device','user') THEN RAISE EXCEPTION 'bad owner_type'; END IF;
  IF p_op_id IS NULL OR length(p_op_id) < 8 OR length(p_op_id) > 64 THEN RAISE EXCEPTION 'bad op_id'; END IF;

  -- 행 확보 + 잠금(여러 Functions 인스턴스 동시 요청 직렬화)
  INSERT INTO public.trip_drafts (owner_type, owner_id)
  VALUES (p_owner_type, p_owner_id)
  ON CONFLICT (owner_type, owner_id) DO NOTHING;

  SELECT * INTO v_row FROM public.trip_drafts t
   WHERE t.owner_type = p_owner_type AND t.owner_id = p_owner_id
   FOR UPDATE;

  -- 멱등: 이미 적용된 op — 상태·revision 불변으로 현재 상태만 반환
  IF v_row.applied_ops @> to_jsonb(ARRAY[p_op_id]) THEN
    RETURN QUERY SELECT v_row.revision, false, v_row.items, v_row.context;
    RETURN;
  END IF;

  v_items := COALESCE(v_row.items, '[]'::jsonb);
  v_ctx   := v_row.context;

  IF p_op_type = 'add_item' THEN
    v_it := p_payload->'item';
    IF v_it IS NULL OR jsonb_typeof(v_it) <> 'object' THEN RAISE EXCEPTION 'bad item'; END IF;
    v_key := public.trip_draft_item_key(v_it);
    IF v_key = '' THEN RAISE EXCEPTION 'item without identity'; END IF;
    IF jsonb_array_length(v_items) >= 120 THEN RAISE EXCEPTION 'draft full'; END IF;
    SELECT EXISTS (SELECT 1 FROM jsonb_array_elements(v_items) e
                    WHERE public.trip_draft_item_key(e.value) = v_key) INTO v_seen;
    IF NOT v_seen THEN
      SELECT COALESCE(max((e.value->>'sortOrder')::numeric), 0) INTO v_max
        FROM jsonb_array_elements(v_items) e;
      v_items := v_items || jsonb_set(v_it, '{sortOrder}', to_jsonb(v_max + 1));
    END IF; -- 이미 있으면 no-op(중복 0) — op 는 기록되고 revision 은 증가한다

  ELSIF p_op_type = 'update_item' THEN
    v_key := p_payload->>'key';
    v_it  := p_payload->'item';
    IF v_key IS NULL OR v_it IS NULL OR jsonb_typeof(v_it) <> 'object' THEN RAISE EXCEPTION 'bad update'; END IF;
    SELECT COALESCE(jsonb_agg(CASE WHEN public.trip_draft_item_key(e.value) = v_key
                                   THEN jsonb_set(v_it, '{sortOrder}', COALESCE(e.value->'sortOrder', v_it->'sortOrder', '0'::jsonb))
                                   ELSE e.value END ORDER BY e.ord), '[]'::jsonb)
      INTO v_items
      FROM jsonb_array_elements(v_items) WITH ORDINALITY e(value, ord);
    -- 없는 key 는 no-op(membership 은 add/remove 만 바꾼다)

  ELSIF p_op_type = 'remove_item' THEN
    v_key := p_payload->>'key';
    IF v_key IS NULL THEN RAISE EXCEPTION 'bad remove'; END IF;
    SELECT COALESCE(jsonb_agg(e.value ORDER BY e.ord), '[]'::jsonb) INTO v_items
      FROM jsonb_array_elements(v_items) WITH ORDINALITY e(value, ord)
     WHERE public.trip_draft_item_key(e.value) <> v_key;

  ELSIF p_op_type = 'reorder_items' THEN
    -- membership 불변: 목록에 있는 기존 항목은 그 순서로, 목록이 모르는
    -- (동시 추가된) 항목은 기존 상대 순서 그대로 뒤에 — 결정적 최종 순서.
    IF jsonb_typeof(p_payload->'keys') <> 'array' THEN RAISE EXCEPTION 'bad reorder'; END IF;
    FOR v_it IN
      SELECT e.value FROM jsonb_array_elements_text(p_payload->'keys') WITH ORDINALITY k(key, ki)
      JOIN LATERAL (
        SELECT e2.value FROM jsonb_array_elements(v_items) e2
         WHERE public.trip_draft_item_key(e2.value) = k.key LIMIT 1
      ) e ON true
      ORDER BY k.ki
    LOOP
      v_ord := v_ord + 1;
      v_new := v_new || jsonb_set(v_it, '{sortOrder}', to_jsonb(v_ord));
    END LOOP;
    FOR v_it IN
      SELECT e.value FROM jsonb_array_elements(v_items) WITH ORDINALITY e(value, ord)
       WHERE NOT (p_payload->'keys' @> to_jsonb(ARRAY[public.trip_draft_item_key(e.value)]))
       ORDER BY e.ord
    LOOP
      v_ord := v_ord + 1;
      v_new := v_new || jsonb_set(v_it, '{sortOrder}', to_jsonb(v_ord));
    END LOOP;
    v_items := v_new;

  ELSIF p_op_type = 'clear_items' THEN
    v_items := '[]'::jsonb;

  ELSIF p_op_type = 'set_trip_context' THEN
    IF jsonb_typeof(p_payload->'context') <> 'object' THEN RAISE EXCEPTION 'bad context'; END IF;
    v_ctx := jsonb_build_object(
      'city',      p_payload->'context'->>'city',
      'startDate', p_payload->'context'->>'startDate',
      'endDate',   p_payload->'context'->>'endDate');

  ELSE
    RAISE EXCEPTION 'unknown op %', p_op_type;
  END IF;

  UPDATE public.trip_drafts t SET
    items       = v_items,
    context     = v_ctx,
    revision    = t.revision + 1,
    updated_at  = now(),
    applied_ops = (
      SELECT COALESCE(jsonb_agg(o.value ORDER BY o.ord), '[]'::jsonb)
        FROM (
          SELECT value, ord FROM jsonb_array_elements(t.applied_ops || to_jsonb(p_op_id))
                 WITH ORDINALITY x(value, ord)
          ORDER BY ord DESC LIMIT 64
        ) o
    )
  WHERE t.owner_type = p_owner_type AND t.owner_id = p_owner_id;

  SELECT * INTO v_row FROM public.trip_drafts t
   WHERE t.owner_type = p_owner_type AND t.owner_id = p_owner_id;
  RETURN QUERY SELECT v_row.revision, true, v_row.items, v_row.context;
END $$;

REVOKE ALL ON FUNCTION public.trip_draft_apply(TEXT, UUID, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trip_draft_apply(TEXT, UUID, TEXT, TEXT, JSONB) TO service_role;

-- ── 로그인 병합(내부 전용) — 잠금·revision 규율 하에서 ─────────────────────
CREATE OR REPLACE FUNCTION public.trip_draft_merge_guest(p_user UUID, p_device UUID)
RETURNS TABLE (merged BOOLEAN, revision BIGINT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_guest  public.trip_drafts%ROWTYPE;
  v_user   public.trip_drafts%ROWTYPE;
  v_items  JSONB;
  v_max    NUMERIC := 0;
  v_it     JSONB;
BEGIN
  -- 잠금 순서 고정(user → device)으로 교착 방지
  INSERT INTO public.trip_drafts (owner_type, owner_id) VALUES ('user', p_user)
  ON CONFLICT (owner_type, owner_id) DO NOTHING;
  SELECT * INTO v_user  FROM public.trip_drafts t WHERE t.owner_type='user'   AND t.owner_id=p_user   FOR UPDATE;
  SELECT * INTO v_guest FROM public.trip_drafts t WHERE t.owner_type='device' AND t.owner_id=p_device FOR UPDATE;

  IF v_guest.owner_id IS NULL OR COALESCE(jsonb_array_length(v_guest.items),0) = 0 THEN
    DELETE FROM public.trip_drafts WHERE owner_type='device' AND owner_id=p_device;
    RETURN QUERY SELECT false, v_user.revision;
    RETURN;
  END IF;

  v_items := COALESCE(v_user.items, '[]'::jsonb);
  SELECT COALESCE(max((e.value->>'sortOrder')::numeric),0) INTO v_max FROM jsonb_array_elements(v_items) e;
  FOR v_it IN SELECT e.value FROM jsonb_array_elements(v_guest.items) WITH ORDINALITY e(value, ord) ORDER BY e.ord LOOP
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_items) x
                    WHERE public.trip_draft_item_key(x.value) = public.trip_draft_item_key(v_it)) THEN
      v_max := v_max + 1;
      v_items := v_items || jsonb_set(v_it, '{sortOrder}', to_jsonb(v_max));
    END IF;
  END LOOP;

  UPDATE public.trip_drafts t SET
    items = v_items,
    context = COALESCE(t.context, v_guest.context),
    revision = t.revision + 1, updated_at = now()
  WHERE t.owner_type='user' AND t.owner_id=p_user;

  DELETE FROM public.trip_drafts WHERE owner_type='device' AND owner_id=p_device;
  SELECT t.revision INTO v_max FROM public.trip_drafts t WHERE owner_type='user' AND owner_id=p_user;
  RETURN QUERY SELECT true, v_max::bigint;
END $$;

REVOKE ALL ON FUNCTION public.trip_draft_merge_guest(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trip_draft_merge_guest(UUID, UUID) TO service_role;

COMMIT;
