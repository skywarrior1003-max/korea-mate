-- jeju-l10n-readback-v1.sql — 적용 직후 검증 (READ-ONLY)
-- 기대: en>=1482 · ja>=1483 · zh>=1482 · den>=1482 · ko>=1483 (기존값 보존 병합이라 이상 없음)
select count(*) filter (where name_l10n ? 'en') as en,
 count(*) filter (where name_l10n ? 'ja') as ja,
 count(*) filter (where name_l10n ? 'zh') as zh,
 count(*) filter (where name_l10n ? 'ko') as ko,
 count(*) filter (where desc_l10n ? 'en') as den,
 count(*) filter (where desc_l10n ? 'ja') as dja,
 count(*) filter (where desc_l10n ? 'zh') as dzh
from public.city_spots where lower(city)='jeju';
