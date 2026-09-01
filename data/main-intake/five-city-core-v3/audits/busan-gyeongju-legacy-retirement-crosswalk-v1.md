# Busan + Gyeongju legacy retirement crosswalk v1 (r2, 2026-09-01)

SSOT: `busan-gyeongju-legacy-retirement-crosswalk-v1.json`. Short human summary.

- OLD_MAIN_TOTAL 714 = busan 412 (food 327 / non-food 85) + gyeongju 302 (food 102 / non-food 200)
- Classification: IN_PLACE 369 · BY_OTHER_ID 8 · RETIRED 336 · STRATEGIC 1 (id 94) · HOLD 0
- PROD_RESIDUE_PUBLISHED 18 = SAFE_RETIRE 17 [5, 6, 7, 23, 28, 29, 32, 39, 42, 50, 55, 57, 61, 64, 68, 81, 82] + STRATEGIC 1 [94]. Historical OWNER_OVERRIDE 7/28/29/42 are metadata only (r2) and are inside SET A.
- Final SQL `OWNER-RUN-BUSAN-GYEONGJU-LEGACY-RETIREMENT-V1-FINAL.sql` sha256 116cc06509cf85e29b05710dd764dafd88dec664d2abb2cac4e160643d086e43 (is_published=false × 17, DELETE 0, preserves 94/30/93/1392) — NOT executed. Supersedes the 13-row V1 SQL and P4.
- Static contract: /place is pre-rendered for reference rows with robots noindex baked at build; sitemap = discovery rows at build → after the SQL a same-SHA Cloudflare retry is required (RECOMMENDED_RELEASE_SEQUENCE = SQL_THEN_SAME_SHA_RETRY).
- Static residue audit (2026-09-01): user-facing static duplicates of retired rows removed — events.json spot-busan-010 (Oryukdo Skywalk), local-info.json 13/14/15/20/24/31, HomeClient BUSAN_SPOTS 13/14/15, src/data/cities/busan.ts staticSpots ×3 → residue 14 → 0; independent events kept. Final release plan = NEW_COMMIT (FF to master → Production build), not same-SHA retry.
