# Busan + Gyeongju legacy retirement crosswalk v1 (2026-09-01)

SSOT: `busan-gyeongju-legacy-retirement-crosswalk-v1.json` (machine-readable). This file is a short human summary.

- OLD_MAIN_TOTAL 714 = busan 412 (food 327 / non-food 85) + gyeongju 302 (food 102 / non-food 200)
- Classification: {"FINAL_REPLACED_IN_PLACE": 369, "FINAL_REPLACED_BY_OTHER_ID": 8, "FINAL_RETIRED": 336, "STRATEGIC_MISSING_FROM_FINAL": 1} — busan {"FINAL_REPLACED_IN_PLACE": 164, "FINAL_REPLACED_BY_OTHER_ID": 7, "FINAL_RETIRED": 240, "STRATEGIC_MISSING_FROM_FINAL": 1}, gyeongju {"FINAL_REPLACED_IN_PLACE": 205, "FINAL_RETIRED": 96, "FINAL_REPLACED_BY_OTHER_ID": 1}
- PROD_RESIDUE_PUBLISHED 18 (all busan non-food): SAFE_RETIRE 13 ids [5, 6, 23, 32, 39, 50, 55, 57, 61, 64, 68, 81, 82]; Owner-override pending [7, 28, 29, 42]; strategic [94]
- Already hidden 327 · in-place current 369 · identity holds 0
- SQL `OWNER-RUN-BUSAN-GYEONGJU-LEGACY-RETIREMENT-V1.sql` sha256 af79904d10006101497dc47448b8488421ac36737c1b04aa295bc28a404cb7e9 (UPDATE is_published=false × 13, DELETE 0) — NOT executed. Supersedes P4 (id 6).
- 지밀레니얼 id 93 = FINAL_REPLACED_IN_PLACE (current verified canonical, CLOSED). 장산 id 6 → canonical id 30 (SET A); id 1392 distinct KTO geopark entry kept.
