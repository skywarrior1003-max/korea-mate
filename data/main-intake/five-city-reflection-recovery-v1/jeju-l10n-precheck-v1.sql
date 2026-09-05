-- jeju-l10n-precheck-v1.sql — 적용 직전 현재 상태 확인 (READ-ONLY)
-- 기대: pub=1496 · en=ja=zh=0 (0이 아니면 값 존재 row 수를 보고하고 병합 규칙[기존 키 우선] 확인 후 진행)
select count(*) filter (where is_published) as pub,
 count(*) filter (where name_l10n ? 'en') as en,
 count(*) filter (where name_l10n ? 'ja') as ja,
 count(*) filter (where name_l10n ? 'zh') as zh,
 count(*) filter (where desc_l10n ? 'en') as den
from public.city_spots where lower(city)='jeju';
