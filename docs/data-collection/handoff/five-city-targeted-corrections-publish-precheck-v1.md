# five-city targeted corrections + PUBLISH precheck v1 (2026-08-23)

branch `feature/five-city-core-targeted-corrections-publish-precheck-v1`(parent 2474e86) · v3 run `aada6b5e6873c12f` · PUBLISH/deploy/master 미실행.

## Owner-approved corrections (Production write 165 PATCH · DELETE 0 · is_published 변경 0)
- A `#910` 자매갈비전골(jeonju:OFF-16133, KTO 2870801): identity 재확인(name·external_id·visitjeonju 16133 primary·kto 2870801·lat/lng null) 후 lat 35.8198804174 / lng 127.1534611530 만 PATCH(provenance KTO_SUPPLEMENT). post: 좌표 exact, is_published false 유지, /place/910 JSON-LD geo 반영. 스케줄러/Near Me `.not("lat","is",null)` 통과, 네비 링크 생성 가능.
- B KTO http 이미지 82: `http-image-readiness-audit-v1.json` 의 HTTPS_EQUIVALENT_OK 82 URL 만 scheme 정규화 — `city_spots.image_url` 82행 + `city_spot_images`(display_eligible) 82행, 각 PATCH 는 `id=eq.&image_url=eq.<old>` 조건. post: http city_spots 0 · http eligible images 0 · https tong 82 · primary 충돌 0 · rights 위반 0 · cache↔primary 불일치 0. 비노출(display_eligible=false) http 행 426 은 대상 외(미변경).
- evidence `corrections/`: owner-approved-corrections-v1.json · correction-pre-snapshot-v1.<attempt>.jsonl(165행) · correction-receipts-v1.<attempt>.jsonl(165). Secondary artifact 불변.
- user tables 68/0/4/9 불변 · city_spots 5,005/714/4,291/0 불변 · null 좌표 잔여 1(#505 legacy manual, final active 아님).

## Clean build (2474e86 hardening 코드)
exit 0 · 78s · 5,064 pages · sentinel 482 stale 0 · routes 5,005 · sitemap /place 714(hidden leak 0) · noindex OK · fetch-cache 1(wasm) · tests 2412/2404/8(baseline)/new 0.

## PUBLISH precheck (dry-run, write 0) — `publish-precheck/`
SHOW 4,291(= 현재 false 전부, canonical, 도시 불일치 0) · HIDE 327(전부 현재 true, MATCH 와 overlap 0) · KEEP 19(LEGACY_ONLY_VALID 15 + OWNER_OVERRIDE 4) · MATCH 368 · overlap 0 · missing 0 · final active distinct 4,659 · SHOW 내 null 좌표 0 · http 이미지 0.
예상 post-publish: physical 5,005 · true **4,678** · false **327** · null 0 · sitemap /place 4,678 · per-city true busan 807 · gyeongju 302 · seoul 1,837 · jeju 1,496 · jeonju 236.
생성 SQL(`--publish-sql`, DB 0): `publish-cutover-aada6b5e6873c12f.sql`(sha256 f3303fc8…, 단일 트랜잭션, new 4,291/hide 327/keep 19 set == precheck set) + `publish-rollback-aada6b5e6873c12f.sql`. rollback 기준 `pre-publish-visibility-snapshot-v1.20260823T061852Z.jsonl`(5,005행, sha256 c6cff41a…). user_spots/trip_moments 의 hide set 참조 0.
post-publish verification plan: publish-precheck-v1.json `verification_plan`.
