-- gyeongju-gampo-ko-desc-v1.sql (MAIN-REMAINING-OFFICIAL-CONTENT-RECOVERY-V2, 2026-09-19)
-- 원천: 경주문화관광 동해권 관광지 상세 '감포항'
--   https://www.gyeongju.go.kr/tour/page.do?mnu_uid=4718&code_uid=1016&area_uid=160&cmd=2
-- 제공: 경주시청/경주문화관광 · 게시물 단위 이용제한 표기 없음(확인일 2026-09-19)
-- identity: 주소 '경주시 감포읍 감포로2길 93' · 좌표 35.8042/129.5046 ≈ DB 669(35.8037/129.5026)
-- idempotent: desc_l10n.ko 부재 시에만. Owner 승인 전 실행 금지.
BEGIN;
UPDATE city_spots SET desc_l10n = jsonb_set(COALESCE(desc_l10n,'{}'::jsonb), '{ko}', to_jsonb('2025년이면 개항 100주년을 맞이하는 경주 최대의 항구 감포항.
쉴 사이 없이 고깃배들이 드나들고, 활어 위판장에서는 매일 매일 신선한 생선이 경매로 오간다.
감포항에 머물다보면 절로 활력이 충전되는 느낌을 받는다.
유서깊은 항구답게 곳곳에 볼거리가 산재해 있다.
항구 주변에는 감포의 명물 참가자미회를 파는 횟집들이 즐비해 식도락 여행을 할 수 있다.'::text)), updated_at = now()
WHERE id = 669 AND city = 'gyeongju' AND name = '감포항'
  AND (desc_l10n IS NULL OR desc_l10n->>'ko' IS NULL OR desc_l10n->>'ko' = '');
COMMIT;
