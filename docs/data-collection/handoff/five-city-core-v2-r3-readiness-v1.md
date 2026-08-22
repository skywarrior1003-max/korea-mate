# five-city-core-v2 — STAGE R3 readiness (TASK-GYEONGJU-FOOD-105-FIVE-CITY-REINTEGRATION-PREP-V1)

PRODUCTION WRITE 0 · STAGE R3 미실행 · plan/evidence only. v1(`data/main-intake/five-city-core-v1/`, run `f8abf0cf5f75e55f`, 4,826 plan)은 R2 historical evidence 로 보존(불변).

## 1. Main lineage
- start `34fdde0`(writer insert fix `7f72ab7` ⊂, Seoul correction `14d71c9` ⊂, Seoul final-freeze ⊂) · branch `feature/gyeongju-food-105-five-city-reintegration-v1` · origin/master `69cc51a`.

## 2. Production partial state (READ-ONLY 재확인, 변경 0)
- city_spots 714 · true 714 · false 0 · canonical 0 · sources 302(gyeongju-city 235 · kto 67 · visitgyeongju 0) · images 169 · busan 412 · gyeongju 302.
- R2 Phase A MATCH 462 완료(ID 변경 0) · NEW 0 · C/D 미착수. old GJ08 Food 102 → Production numeric 102행(bridge `gyeongju-city:gyeongju-GJ08-*`, 전부 published).
- R2 before-Phase-A snapshot: ops `3622e26` · 462행 · sha256 `10240f4f404c95fae71dc20b6599b14f83bcf3812173bd155d388ec76d6c6207`(git show 로만 읽음, 변경 0).

## 3. Source package (pinned)
- branch `data/gyeongju-food-105-multilingual-full-content-v1` @ **`a90fbed`**(origin 최신 = known SHA, 경우 A).
- service v2 105 · multilingual handoff v2 420(ko/en/ja/zh-CN 105×4) · raw content 420(provenance, runtime 미사용) · coverage QA PASS · parser sample QA 48/48 PASS · manifest `ai_translation_used=false`, `unofficial_source_used=false`.
- 공식 언어 커버리지: title/desc ko·en·ja·zh 105/105 · Main 번역/fallback/cross-locale 복사 0 · `zh-CN→zh` adapter(LOCALE_MAP).

## 4. Gyeongju universe
- OLD service: Attraction 197 + Food(GJ08) 102 = 299 (artifact 302 = ACTIVE 299 + EXCLUDED 3).
- NEW service: Attraction 197 + VisitGyeongju Food 105 = **302** (old 302 와 구성이 다름).
- Food transition: PRESERVE_ID_AND_REPLACE **8**(package MATCH 7 + 화수브루어리 targeted SAME) · NEW_INSERT **97** · RETIRE_FROM_SERVICE **94** · REVIEW 0. 검산 8+97=105 · 8+94=102.
- known MATCH numeric ids: GJ08-405→#577 · 6917→#607(화수) · 7128→#619 · 732→#633 · 733→#634 · 7510→#640 · 760→#644 · 87→#653.
- 화수브루어리: **SAME** — 두 공식 관광 source 의 등록 상호 완전 일치 + 동일 지번(보문로 465-67, 호실 표기만 다름), 좌표 동일; 전화(0507 안심번호 vs 010)만으로 분리하지 않음; 리뷰/사용자 데이터 0. basis `OWNER_TARGETED_RESOLUTION`.

## 5. five-city active universe (v2)
busan 958 · gyeongju 302 · seoul 1,837 · jeju 1,496 · jeonju 236 = **4,829**.
crosswalk: MATCH_REPLACE **368**(busan 163 + gyeongju 205) · NEW **4,291**(busan 625 · gyeongju 97 · seoul 1,837 · jeju 1,496 · jeonju 236) · CONFIRMED_TWIN 170 · REVIEW 0 → 368+4,291+170 = 4,829. RETIRED 94 · EXCLUDED 3 (non-active).

## 6. R2 Phase A reconcile (`five-city-r2-phase-a-reconcile-v1.jsonl`, 462)
KEEP_CURRENT_VALID 360(busan 163 + attraction 197) · REPLACE_WITH_NEW_FINAL 8 · RESTORE_PRE_R2_THEN_PUBLISH_HIDE 94 · REVIEW 0. restore plan(`five-city-r2-restore-plan-v1.jsonl`, 94행)은 snapshot `fields_to_write`(12 필드/행) 의 before 값만, id/source_type/external_id/is_published/runtime 필드 불가침, hard delete 0. 목적: 새 build/publish 전까지 잘못된 old Food Final 값을 유지하지 않기 위한 임시 복구(old 102 보존 아님) → PUBLISH 에서 hide.

## 7. publish-hide union
old hide 233(EXCLUDED 230 + DUPLICATE 3) ∪ Gyeongju retire 94 = **327** (overlap 0, id 기준). LEGACY_ONLY_VALID 15 · OWNER_OVERRIDE 4 유지.

## 8. Plans (v2)
- source plan **5,505**(= v1 5,502 − GJ08 102 + visitgyeongju 105; unresolved 0 · conflicts 0 · primary 0) · image plan **4,292**(= 4,394 − GJ08 images 102; VG 공식 이미지 0 → fallback/recrawl 0; rights 0).
- stage plan: UPDATE 368(4 chunk) · INSERT 4,291(22 chunk, is_published=false). 기대 STAGE 후 physical 5,005 = 714 + 4,291 · true 714 · false 4,291 · null 0 · per-city physical busan 1,037 · gyeongju 399 · seoul 1,837 · jeju 1,496 · jeonju 236. PUBLISH 후 visible 4,678 / hidden 327.
- hashes: run_id **`a4f3889fd3667e26`** · input manifest `fb3677b73d039e137043164bfa67a8fdd74e3710c99d1d085119d4df6f207480` · change manifest `c43ee6625b44498183ed440e9ef00a1bfe41693692ff00115c6ad21424e80bd3` · stage plan `23e0fae8ce848d1e12d7d6c1b77c29d7279d647cab2fdaa7a0f752ef2b41529d` · crosswalk `c72469b9da09e7000915507fcba3d7443ea506309fdef863349480b12d659a56` · sources `afcbbcf91fedc686296f2e557afa78ca3a689896d848f6283e25a11ba81c9832` · images `5603556bfaf8f7a2663848bd69eff363bed82803613d338b367377d5defa68cd`.

## 9. Coordinates / images
coord ready 8(package lat/lng, 기존 canonical 과 동일) · geocoding required 97 · ambiguous 0 · NAV_READY 8. centroid/guess 0. 좌표 없는 행은 INSERT 되지만 scheduler/AI 후보 자동 허용 아님(is_published=false 이기도 함). 공식 이미지 0/105 — blocker 아님.

## 10. R3 실행 전 필요 사항
- importer `--stage` 에 **Phase A3(restore)** 단계 구현 필요: `five-city-r2-restore-plan-v1.jsonl` 을 읽어 94행의 restore_fields 만 PATCH(is_published 불변). 현재 importer 는 A1/A2(UPDATE)·B·C·D·E 만 수행.
- Production PRECHECK(714/714/0 · canonical 0 · sources 302 · images 169) 동일 확인 후 `--package data/main-intake/five-city-core-v2 --confirm-manifest-hash fb3677b7… --expected-db-count 714`.
- PUBLISH 는 별도 Owner 승인(hide 327 · NEW 4,291 true 전환).
