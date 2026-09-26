-- 075: refresh_open 정확 스냅숏화 — PLACE-USAGE ZERO-ROW 정합성 (V2 보완)
--
-- 074 의 refresh_open 은 "raw 가 존재하는 target"만 GROUP BY UPSERT 했다.
-- 그래서 현재 월 raw 가 N→0 으로 줄면(예: QA 정리) 기존 open 집계 행이
-- 이전 수치로 남았다 — Staging 재현으로 확정된 결함이다.
--
-- 교정: 현재 KST 월의 open 집계를 **정확한 전체 스냅숏**으로 다시 만든다.
--   ① 현재 월 open 행 전체 삭제 → ② raw 재계산 삽입 — plpgsql 함수 본문은
--   호출 트랜잭션 안에서 원자적이라 중간 실패 시 ①까지 통째로 롤백된다
--   (open 이 빈 채로 남는 상태 없음). advisory xact lock 이 동시 실행을
--   직렬화하고, 삽입 경합은 ON CONFLICT DO NOTHING 이 흡수한다(다음 실행이
--   반드시 수렴). finalized 행은 삭제 대상에서 제외되고 충돌 시에도 덮지
--   않는다(현재 월이 finalized 일 수는 없지만 이중 방어).
--
-- 074 파일은 수정하지 않는다(적용 이력·checksum 보존) — 함수만 교체한다.
-- 수동 +1/-1 증감 없음·권한 계약(service_role 전용) 그대로.

BEGIN;

CREATE OR REPLACE FUNCTION public.place_usage_monthly_refresh_open()
RETURNS TABLE (refreshed_rows BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month DATE := public.place_usage_kst_month(now());
  v_count BIGINT;
BEGIN
  -- 동시 실행 직렬화 — 두 refresh 가 겹쳐 삭제/삽입이 얽히지 않게
  PERFORM pg_advisory_xact_lock(hashtext('place_usage_monthly_refresh_open'));

  -- ① 현재 월 open 스냅숏 정리(finalized 는 절대 건드리지 않는다)
  DELETE FROM public.place_usage_monthly
   WHERE month_start = v_month AND status = 'open';

  -- ② raw 전체 재계산으로 재생성 — raw 0 이 된 target 은 자연히 행이 없다
  INSERT INTO public.place_usage_monthly
    (target_type, target_key, month_start, usage_count, status, aggregated_at, updated_at)
  SELECT u.target_type, u.target_key, v_month, count(*), 'open', now(), now()
    FROM public.place_usage u
   WHERE public.place_usage_kst_month(u.created_at) = v_month
   GROUP BY u.target_type, u.target_key
  ON CONFLICT (target_type, target_key, month_start) DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN QUERY SELECT v_count;
END $$;

-- 권한 재확인 — CREATE OR REPLACE 는 기존 GRANT 를 보존하지만 명시로 고정
REVOKE ALL ON FUNCTION public.place_usage_monthly_refresh_open() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.place_usage_monthly_refresh_open() TO service_role;

COMMIT;
