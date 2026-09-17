-- 1633-mislink-repair v1 — 실행 금지(Owner 승인 후 정확 1회)
-- 사실: 1633 = 해리단길 내 기프트샵 '바다처럼'(visitbusan VB-2581) — 거리 아님.
-- content-recovery(f79ccbad)가 주입한 desc_l10n.ko(해리단길 거리 본문)만 제거한다.
-- 값조건: 주입 본문과 정확히 일치할 때만 — 이후 정상 수정 보호. 매장의 name·
-- name_l10n.ko('바다처럼')·image·address·EN 본문·source 는 원본이며 무접촉.
-- before 원상(스냅숏 실측): desc_l10n = {en}(매장 소개만).
BEGIN;

UPDATE city_spots SET desc_l10n = desc_l10n - 'ko', updated_at = now()
 WHERE id = 1633 AND desc_l10n->>'ko' = '부산 해운대 도시철도역 4번 출구에서 옛 해운대 기차역 뒤편 기찻길을 건너면 해리단길이 시작된다. 해리단길은 서울의 경리단길에서 아이디어를 얻은 이름이다. 좁은 도로를 따라 다양한 개성의 카페와 음식점들이 속속 생겨나면서 해운대 인기 명소로 자리매김했다.
골목길 담벼락에 그려진 위트 넘치는 벽화를 비롯해 자유로운 거리 분위기를 즐길 수 있어 시민들은 물론 관광객들도 일부러 찾아오는 곳이다. 사진 찍기 좋은 아기자기한 외관의 카페와 식당, 색다른 기념품을 판매하는 소품샙, 비정기적으로 열리는 플리마켓 등 다채로운 볼거리가 발길을 끌어모은다.';

DO $$
DECLARE ok int;
BEGIN
  SELECT count(*) INTO ok FROM city_spots WHERE id = 1633 AND NOT coalesce(desc_l10n,'{}'::jsonb) ? 'ko' AND coalesce(desc_l10n,'{}'::jsonb) ? 'en';
  IF ok <> 1 THEN RAISE EXCEPTION '1633 repair verification failed'; END IF;
END $$;

COMMIT;
-- rollback: 같은 본문을 다시 || jsonb_build_object('ko', <원문>) — 단 오연결 정정 취지상 재주입은 Owner 명시 지시 시에만.
