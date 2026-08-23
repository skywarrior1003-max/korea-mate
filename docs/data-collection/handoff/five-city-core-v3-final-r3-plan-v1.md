# five-city-core-v3 — FINAL STAGE R3 plan (TASK-FIVE-CITY-CORE-R3-FINAL-PLAN-REGENERATION-V1)

PRODUCTION WRITE 0 · STAGE R3 미실행. v3 = v2(interim, run `a4f3889fd3667e26`) + Gyeongju Food final coordinates(`f428ef9`) + official images(`323142e`). v1(R2 evidence)·v2 불변.

## Main lineage
start `0744946`(⊇ 7f72ab7 writer fix · 34fdde0 Seoul final-freeze · a9e755f Food 105 reintegration · 4f91977 A3 restore writer · 0744946 lat/lng serialization tolerance) · branch `feature/five-city-core-r3-final-plan-v2`.

## Pinned secondary packages (join key = vg_id only)
| package | branch | SHA | artifact | contract |
|---|---|---|---|---|
| CORE | data/gyeongju-food-105-multilingual-full-content-v1 | a90fbed | gyeongju-vg-food-105-service-v2.jsonl | 105 · vg_id unique 105 · parser QA 48/48 · ai_translation false |
| MULTILINGUAL | same | a90fbed | gyeongju-vg-food-105-multilingual-handoff-v2.jsonl | 420 = 105×4 · ko/en/ja/zh title+desc 105/105 |
| IMAGE | data/gyeongju-food-105-media-nav-completion-v1 | 323142e | gyeongju-vg-food-105-official-images-v1.jsonl | 105 · READY 105 · VisitGyeongju official · rights OFFICIAL_TOURISM_BODY_NO_EXPLICIT_PROHIBITION · provenance OWNER_APPROVED_PUBLIC_SOURCE_USE_WITH_ATTRIBUTION_AND_TAKEDOWN (이 branch 의 coordinates-v1 은 runtime 미사용) |
| COORD | data/gyeongju-food-105-coordinates-final-v1 | f428ef9 | gyeongju-vg-food-105-coordinates-final-v2.jsonl (sha256 5484187130a26b0a1b3418d0bc2a8053752e924f0432f979097f3ee902f334bd) | 105 · NAV_READY 105 · ENTITY_EXACT 94 + ADDRESS_NUMBER_LEVEL 11 · REVIEW 0 · outside 0 · Main geocoding 0 |

## Gyeongju Food 105 (v3 runtime)
- 4 locale name/desc 105/105 · Main 번역/fallback 0 · zh-CN→zh.
- lat/lng 105(경주 범위) · NAV 105 · provenance.coordinate_quality EXACT 94 / ADDRESS 11 · `city_spots.image_url` cache = VisitGyeongju official primary(105) · `city_spot_images` relation 105(display_eligible, primary, attribution).
- identity 불변: PRESERVE_ID_AND_REPLACE 8(#577 #607 #619 #633 #634 #640 #644 #653) · NEW 97 · RETIRE 94 · REVIEW 0. 화수브루어리 #607 SAME.
- 8 matched rows 좌표도 final package(ENTITY_EXACT, Kakao place 확정) 값으로 교체 — 기존 gyeongju-city 좌표 대비 Δ ≤3.1e-5 deg(≈3 m) 7건, 요석궁 #640 Δ≈2.6e-4 deg(≈27 m) 1건. Main 재판단 0(package authoritative), R3 A2 에서 적용.

## Five-city v3
active 4,829(busan 958 · gyeongju 302 · seoul 1,837 · jeju 1,496 · jeonju 236) · crosswalk MATCH 368 · NEW 4,291 · twin 170 · REVIEW 0 (v2 와 byte-identical) · RETIRED 94 · EXCLUDED 3.
source plan **5,505**(visitgyeongju 105, unresolved 0, conflict 0) · image plan **4,397** = v2 4,292 + VG official 105(rights 위반 0, primary 충돌 0).
reconcile 360/8/94/0 · restore plan 94(R2 snapshot 3622e26 / 10240f4f…, v2 와 byte-identical) · publish-hide union 233 ∪ 94 = 327.

## R3 stage plan
A1 KEEP 360 → A2 VisitGyeongju replace 8(content+image+coords) → A3 restore 94(R2-changed 12 fields, is_published 불변, lat/lng ε=1e-10) → B NEW 4,291(false, 22 chunk) → C mapping → D sources → E images → VERIFY.
기대 post-STAGE physical 5,005 = 714 + 4,291 · true 714 · false 4,291 · null 0 · per-city busan 1,037 · gyeongju 399 · seoul 1,837 · jeju 1,496 · jeonju 236. PUBLISH 후 visible 4,678 / hidden 327.

## Hashes (run_id `aada6b5e6873c12f`)
input manifest `01c549eb6a44e1f01bb82605cb9fd08ffdb4d53e1a1f8d2677172cdebc852502` · change manifest `78a09b3030547deb4d1de2f2b1fa4b46a55d32f611114857cadb8bae3b64fc8c` · stage plan `5876d1edf6d64ee5f146910da28cd8799ec343deb3e2ba179a8968474d2bed5c` · crosswalk `c72469b9…`(=v2) · mapping `f08bfdff44398612de37675eb72dc144ba0e938be7bb0068ecd920b8b0a3ee02` · reconcile `2b0f706c…`(=v2) · restore `17aad049…`(=v2) · sources `afcbbcf9…`(=v2) · images `a3c2720cc87c96d47a81e1f28f042669c651523d21cb45162bc1a5c0edc226e8` · hide union `7d782977…`(=v2).

## R3 실행 명령(승인 후)
PRECHECK(714/714/0 · canonical 0 · sources 302 · images 169 · restore 94 NEEDS_RESTORE · drift 0) → `--stage --package data/main-intake/five-city-core-v3 --confirm-manifest-hash 01c549eb… --expected-db-count 714`(env FIVE_CITY_CORE_APPLY=YES · TARGET_HOST · RELEASE_SHA=69cc51a). PUBLISH/BUILD 별도.
