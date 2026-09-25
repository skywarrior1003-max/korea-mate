-- 071_community_ranking_rpcs.sql
-- (COMMUNITY-RECOMMENDATION-PAGINATION-AND-NEW-DISCOVERY-V1 §5 · 2026-09-25)
--
-- 왜 RPC 인가 (1,000행 절단 사고의 구조적 해결)
--   기존 API 는 Worker 가 city_spots 전 행을 REST 로 받아 메모리 정렬했다.
--   PostgREST max-rows(기본 1000)가 seoul(1846)·jeju(1496) 요청을 **order 미지정
--   임의 1000행**으로 절단해 846/496개가 순위에서 통째로 빠졌다(2026-09-25 실측).
--   이제 정렬·페이지네이션을 DB 가 전체 적격 집합 기준으로 수행하고 Worker 는
--   페이지(≤30행)만 받는다 — max-rows 영향 없음, Worker 전송량 상수화.
--
-- 비공개 계약: 반환 컬럼에 score·dislike 가 없다(정렬에만 쓰고 버린다).
-- 호출 권한: service_role 전용(REVOKE PUBLIC/anon/authenticated).
-- editorial tie-break 는 저장소 스냅숏(editorial-spot-order.json)을 Worker 가
-- bigint[] 인자로 전달한다 — DB 에 editorial 데이터를 이중 보관하지 않는다.

-- ── 인기(cold-start 연속) 순위 ──────────────────────────────────────────────
-- 정렬: score DESC → usage DESC → like DESC → editorialIndex ASC → id ASC
CREATE OR REPLACE FUNCTION public.community_rank_places(
  p_city text, p_editorial bigint[], p_limit int, p_offset int
) RETURNS TABLE (total bigint, rank bigint, id bigint, like_count bigint, usage_count bigint)
LANGUAGE sql STABLE
AS $$
  WITH likes AS (
    SELECT target_key::bigint AS k, count(*) AS c FROM public.place_likes
    WHERE target_type = 'city_spot' AND target_key ~ '^[0-9]{1,10}$' GROUP BY 1
  ), dislikes AS (
    SELECT target_key::bigint AS k, count(*) AS c FROM public.content_dislikes
    WHERE target_type = 'city_spot' AND target_key ~ '^[0-9]{1,10}$' GROUP BY 1
  ), used AS (
    SELECT target_key::bigint AS k, count(*) AS c FROM public.place_usage
    WHERE target_type = 'city_spot' AND target_key ~ '^[0-9]{1,10}$' GROUP BY 1
  ), scored AS (
    SELECT s.id,
           coalesce(l.c, 0) AS like_c,
           coalesce(u.c, 0) AS usage_c,
           coalesce(l.c, 0) - coalesce(d.c, 0) + 3 * coalesce(u.c, 0) AS score,
           coalesce(array_position(p_editorial, s.id), 2147483647) AS eidx
    FROM public.city_spots s
    LEFT JOIN likes    l ON l.k = s.id
    LEFT JOIN dislikes d ON d.k = s.id
    LEFT JOIN used     u ON u.k = s.id
    WHERE s.city = p_city AND s.is_published = true
  ), ranked AS (
    SELECT id, like_c, usage_c,
           row_number() OVER (ORDER BY score DESC, usage_c DESC, like_c DESC, eidx ASC, id ASC) AS rn,
           count(*)     OVER () AS tot
    FROM scored
  )
  SELECT tot, rn, id, like_c, usage_c
  FROM ranked
  ORDER BY rn
  LIMIT greatest(p_limit, 0) OFFSET greatest(p_offset, 0);
$$;

-- ── 신규(최근 60일 게시) 순위 ───────────────────────────────────────────────
-- pool: place_suggestion_publications ∩ 게시 유지 장소, first_published_at 이
--       p_now 기준 60일 창 안(엄격 미만·미래 시각은 age 0 취급), 최신순 상위 1000.
-- newScore = base + clamp(6 × (1 − ageDays/60), 0, 6)
-- 정렬: newScore DESC → base DESC → usage DESC → like DESC → first_published_at DESC → id ASC
CREATE OR REPLACE FUNCTION public.community_rank_new_places(
  p_city text, p_now timestamptz, p_limit int, p_offset int
) RETURNS TABLE (total bigint, rank bigint, id bigint, like_count bigint, usage_count bigint)
LANGUAGE sql STABLE
AS $$
  WITH pool AS (
    SELECT p.city_spot_id AS id, p.first_published_at
    FROM public.place_suggestion_publications p
    JOIN public.city_spots s ON s.id = p.city_spot_id
    WHERE s.city = p_city AND s.is_published = true
      AND (p_now - p.first_published_at) < interval '60 days'
    ORDER BY p.first_published_at DESC, p.city_spot_id ASC
    LIMIT 1000
  ), likes AS (
    SELECT target_key::bigint AS k, count(*) AS c FROM public.place_likes
    WHERE target_type = 'city_spot' AND target_key ~ '^[0-9]{1,10}$' GROUP BY 1
  ), dislikes AS (
    SELECT target_key::bigint AS k, count(*) AS c FROM public.content_dislikes
    WHERE target_type = 'city_spot' AND target_key ~ '^[0-9]{1,10}$' GROUP BY 1
  ), used AS (
    SELECT target_key::bigint AS k, count(*) AS c FROM public.place_usage
    WHERE target_type = 'city_spot' AND target_key ~ '^[0-9]{1,10}$' GROUP BY 1
  ), scored AS (
    SELECT po.id, po.first_published_at,
           coalesce(l.c, 0) AS like_c,
           coalesce(u.c, 0) AS usage_c,
           coalesce(l.c, 0) - coalesce(d.c, 0) + 3 * coalesce(u.c, 0) AS base,
           least(greatest(
             6 * (1 - greatest(extract(epoch FROM (p_now - po.first_published_at)), 0) / 86400.0 / 60.0)
           , 0), 6) AS bonus
    FROM pool po
    LEFT JOIN likes    l ON l.k = po.id
    LEFT JOIN dislikes d ON d.k = po.id
    LEFT JOIN used     u ON u.k = po.id
  ), ranked AS (
    SELECT id, like_c, usage_c,
           row_number() OVER (
             ORDER BY (base + bonus) DESC, base DESC, usage_c DESC, like_c DESC,
                      first_published_at DESC, id ASC
           ) AS rn,
           count(*) OVER () AS tot
    FROM scored
  )
  SELECT tot, rn, id, like_c, usage_c
  FROM ranked
  ORDER BY rn
  LIMIT greatest(p_limit, 0) OFFSET greatest(p_offset, 0);
$$;

REVOKE ALL ON FUNCTION public.community_rank_places(text, bigint[], int, int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.community_rank_new_places(text, timestamptz, int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.community_rank_places(text, bigint[], int, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.community_rank_new_places(text, timestamptz, int, int) TO service_role;
