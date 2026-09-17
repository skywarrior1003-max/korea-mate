-- gukje-market-image v1 — 실행 금지(Owner 승인 후 정확 1회)
-- 대상: id 22 국제시장 — image_url IS NULL 일 때만(현값 실측 NULL, 정상 최신값 보호).
-- 출처: VisitBusan 공식 게시물 uc_seq=399 "골목골목 와글와글 국제시장"
--   source_url: https://www.visitbusan.net/kr/index.do?menuCd=DOM_000000201003001000&uc_seq=399&lang_cd=ko
--   확인 이미지 18장 중 대표 1180x680 선택(국제시장 대형 간판 정면 — 장소 동일성 시각 확인, 2026-09-17).
--   게시물 내 이용조건 표시: 상업적 이용금지·재사용금지·공공누리 표기 '명시 없음'(실측) — Owner 정책(명시 금지 없으면 사용)에 따라 적용.
--   ('공공누리 제1유형'·'허가 완료' 등 확인되지 않은 표기는 기록하지 않는다.)
BEGIN;

UPDATE city_spots SET image_url = 'https://www.visitbusan.net/uploadImgs/files/cntnts/20191230184115413_oen', updated_at = now()
 WHERE id = 22 AND image_url IS NULL;

DO $$
DECLARE ok int;
BEGIN
  SELECT count(*) INTO ok FROM city_spots WHERE id = 22 AND image_url = 'https://www.visitbusan.net/uploadImgs/files/cntnts/20191230184115413_oen';
  IF ok <> 1 THEN RAISE EXCEPTION 'gukje image verification failed'; END IF;
END $$;

COMMIT;
-- rollback(값조건): UPDATE city_spots SET image_url = NULL WHERE id = 22 AND image_url = '<위 URL>';
