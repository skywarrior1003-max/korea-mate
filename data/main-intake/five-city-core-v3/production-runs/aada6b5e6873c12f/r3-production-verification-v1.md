# Production STAGE R3 — verification record (TASK-FIVE-CITY-CORE-PRODUCTION-STAGE-V1-R3)

- Execution commit `01c1ba4` · package `five-city-core-v3` · run_id `aada6b5e6873c12f` · attempt `20260823T035242Z` · window 2026-08-23T03:52:41Z–03:53:39Z · runtime Production source `69cc51a`.
- Gates before write: lineage OK · 10 artifact hashes + stage plan hash OK · package pins a90fbed/323142e/f428ef9 OK · coordinate artifact sha 54841871… · R2 snapshot sha 10240f4f… · PRECHECK 714/714/0/0 · canonical 0 · sources 302 · images 169 · restore 94/94 NEEDS_RESTORE · user 68/0/4/9 · dry-run run_id match.

## Writer receipt (stage-receipt-v1.20260823T035242Z.json)
- MATCH (A1 360 + A2 8) planned 368 / completed 368 · RESTORE_PRE_R2 (A3) planned 94 / restored 94 / already 0 / drift 0 / identity mismatch 0 / snapshot missing 0 / failed 0 · NEW planned 4,291 / inserted 4,291 / reused 0 / mapping 4,291 / published_true 0 / missing 0 · same-entity skip 170.
- sources planned 5,505: reused_exact 197 · inserted 5,308 · unchanged 197 · failed 0 · legacy demoted 0 · images planned 4,397: inserted 4,332 · unchanged 65 · legacy suppressed 8 (old GJ08 images of the 8 preserved Food ids → display_eligible=false) · failed 0.
- db_pre 714 → db_post 5,005 · user counts pre==post (68/0/4/9) · delete 0 · error 0.

## READ-ONLY Production verification after STAGE
- city_spots 5,005 · true 714 · false 4,291 · null 0 · canonical rows 4,291 (distinct external_id 4,291, published true 0).
- per city: busan 1,037 (412/625) · gyeongju 399 (302/97) · seoul 1,837 (0/1,837) · jeju 1,496 (0/1,496) · jeonju 236 (0/236).
- integrity: identity dups 0 · source identity dups 0 · source primary conflicts 0 · source orphans 0 · image primary conflicts 0 · image orphans 0 · image↔source spot mismatch 0 · rights violations 0.
- physical: city_spot_sources 5,610 (302 + 5,308; visitgyeongju 105 primary) · city_spot_images 4,501 (169 + 4,332; VG official 105 eligible primary).
- Gyeongju Food 105 (visitgyeongju bridge): coords 105 · official image_url 105 · name_l10n 4-locale 105 · desc_l10n 4-locale 105 · category restaurant 105 · published 8 (matched) / 97 false (NEW).
- preserved ids #577 #607 #619 #633 #634 #640 #644 #653: published true, VG coordinates/image/l10n applied (#607 Whasoo Brewery SAME kept; #640 Yosukgung final coordinate applied).
- restore 94 post-classification: ALREADY_RESTORED 94 (published true 94, hard delete 0, publish hide NOT executed).
- Gyeongju non-Food legacy rows 200 (attraction 197 + excluded 3) published true unchanged.

## Not executed
PUBLISH (hide 327 · NEW true) · BUILD · master merge/push · Cloudflare deploy · migration · DELETE · AI calls.

## Evidence files (this directory)
pre-stage-match-snapshot-v1.20260823T035242Z.jsonl (368 rows, 46aaf2f3…) · r3-a3-pre-restore-snapshot-v1.20260823T035241Z.jsonl (94 rows, 145f2149…) · user-table-counts-pre-v1.20260823T035242Z.json · stage-chunk-receipts-v1.20260823T035242Z.jsonl (232 receipts, 94216f38…) · production-id-mapping-v1.jsonl (4,291, 5684a100…) · stage-receipt-v1.20260823T035242Z.json (7016838a…).
