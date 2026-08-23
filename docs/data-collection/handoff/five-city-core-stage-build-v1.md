# five-city-core STAGE BUILD QA v1 (TASK-FIVE-CITY-CORE-STAGE-BUILD-V1 · 2026-08-23)

PRODUCTION WRITE 0 · PUBLISH 미실행 · deploy 미실행. 실행 commit `01c1ba4` · QA branch `qa/five-city-core-stage-build-v1` · origin/master `69cc51a` · final `five-city-core-v3` · run_id `aada6b5e6873c12f` · STAGE R3 evidence `caa821d`.
machine-readable: `data/main-intake/five-city-core-v3/build-qa/stage-build-summary-v1.json` (+ route/sitemap · visibility · sample · stale-cache · build log 2종).

## 1. Production state (READ-ONLY, build 전 = build 후)
city_spots 5,005 · true 714 · false 4,291 · null 0 · sources 5,610 · images 4,501 · busan 1,037(412/625) · gyeongju 399(302/97) · seoul 1,837 · jeju 1,496 · jeonju 236 · user 68/0/4/9. PATCH/POST/DELETE 0.

## 2. Build
`npm run build:static` (= `STATIC_EXPORT=true next build`, Next 16.2.6 Turbopack). 두 번 실행:
- **1차(04:03:55–04:05:53Z, exit 0)** — 로컬 `.next/cache/fetch-cache`(Next Data Cache, 5,009 entries, 716개가 2026-08-12 생성, `revalidate 31536000`)가 `fetchSpot()` 응답을 재사용 → legacy 714 id 의 `/place` 페이지가 **pre-R3 내용**으로 렌더(예: /place/607 title `화수브루어리`, /place/577 `스틸룸`, /place/640 `요석궁1779`; DB 는 `Whasoo Brewery`/`STILLROOM`/`Yosukgung`). NEW 4,291 은 cache 부재 → fresh. 이 artifact 는 **무효** (stale evidence 로 보존: `stage-build-log-first-stale-cache-v1.txt`, `stage-build-stale-fetch-cache-evidence-v1.json`; cache 디렉토리는 scratchpad 로 이동).
- **2차 clean(04:32:20–04:34:11Z, 111s, exit 0)** — cache 제거 후 재빌드. 모든 QA 는 이 artifact 기준. 577/607/640/47 title = DB final 값 일치. fetch-cache 5,007 entries 전부 2026-08-23.
- 공통: Compiled OK · TypeScript OK · static pages **5,064** (= /place 5,005 + 59; 직전 release 773 = 714 + 59) · `Generating static pages` 31 workers 26.3s · ENVIRONMENT_FALLBACK **31** (= baseline 31, nonfatal) · lockfile root warning(baseline) · 그 외 warning/error 0 · OG .png alias 4 cities. out/ 45,497 files · 425.5 MB.
- Cloudflare 연관: Pages 는 매 빌드 fresh clone, 프로젝트 `build_config` 에 build caching 설정 없음(GET). R3 이후 모든 branch preview build 는 **preview 환경에 Supabase env 부재 → `fetchPublicSpotIds=[]` → Next 16 `output:export` 가 빈 generateStaticParams 를 오류로 처리**하여 실패(기존 현상, Production 환경은 env 보유). 따라서 post-R3 DB 상태를 Cloudflare 가 빌드한 기록은 아직 없다. 권고: Production REBUILD 전 `fetchSpot`/`fetchPublicSpotIds` 의 fetch cache 정책(no-store 또는 revalidate) 하드닝 — 코드 변경이므로 별도 승인 TASK.

## 3. Data universe (혼용 금지)
PHYSICAL_DB 5,005 · FINAL_ACTIVE_SOURCE 4,829(MATCH 368 · NEW 4,291 · SKIP_TWIN 170 · REVIEW 0 · unresolved 0 · wrong city 0) → **final active DB rows 4,659**(busan 788 · gyeongju 302 · seoul 1,837 · jeju 1,496 · jeonju 236) · CURRENT_PUBLISHED 714 · STAGED_HIDDEN_NEW 4,291 · FUTURE_HIDE 327(233 ∪ 94, overlap 0, 전부 현재 true, final active 와 overlap 0) · GYEONGJU_FINAL_FOOD 105.
PUBLISH 투영: visible 4,678 = final active 4,659 + legacy 19(`LEGACY_ONLY_VALID` 15 + `OWNER_OVERRIDE_KEEP_PUBLISHED` 4 — busan manual: id 5·6·7·23·28·29·32·39·42·50·55·57·61·64·68·81·82·93·94) · hidden 327. (plan 문서의 4,678 과 일치)

## 4. Route / pagination / sitemap
- `/place/[id]` generateStaticParams(reference scope): 생성 5,005 = DB id 5,005 · missing 0 · extra 0 · duplicate 0 · final-active missing 0 · published missing 0 · hidden generated 4,291.
- keyset(1,000/page) 전량 수집 확인: 5,005 > 1,000 절단 0 · Seoul 1,837 전부 생성 · `POSTGREST_1000_CAP_TRUNCATION=NO`.
- sitemap.xml 738 URL = /place 714(= published 714 exact) + 24 static/blog · hidden leak 0 · published missing 0 · duplicate 0 · unknown id 0 · trailing slash 100%. QA final-active readiness 4,659 routes 존재 · PUBLISH 후 sitemap /place 투영 4,678(50k 한도 내).

## 5. Visibility gate
- build: hidden 4,291 page 전부 `<meta name="robots" content="noindex, follow">` (4,291/4,291) · published noindex 0. hidden direct route = 200 + noindex + sitemap 미수록 (runbook §6 BUILD 계약 그대로, bypass 추가 0, 코드 변경 0).
- runtime(local static server + Production anon REST, Playwright): Explore busan/gyeongju/seoul/jeju/jeonju 의 city_spots 호출 전부 `is_published=eq.true` + keyset → rows 412/302/0/0/0, hidden rows 0. Home·all-spots·trending 은 city_spots 호출 0(정적 데이터). `PUBLIC_HIDDEN_NEW_LEAK_COUNT=0`.
- Explore busan 표시 423 = DB 412 + local-info/events 정적 11(기존 병합 동작).

## 6. Place detail / locale / coords / images (final active 4,659, DB snapshot 구조 검증)
- name/category empty 0 · address 4,632 · primary source 4,659/4,659 · image_url cache 3,700(= eligible primary 3,700) · official_url 891 · map_url/naver_map_url 64(runtime derived).
- locale: name ko 4,659 · en 2,535 · ja 2,034 · zh 2,028 / desc ko 4,231 · en 2,483 · ja 2,168 · zh 2,161. 도시별 4-locale desc: busan 355 · gyeongju 105 · seoul 1,615 · jeju 0 · jeonju 0. **Jeju 1,496 은 ko 전용(en name 0)**, 설명 없음 281(jeonju 150 · gyeongju 65 · busan 56 · jeju 10). Main 번역 생성 0(`ai_translation` true 0). build 는 locale 결손에서 실패하지 않음.
- coords 5,005: type/NaN/string 0 · out of range 0 · null 2(#505 legacy manual 경주생활체육공원 · #910 jeonju 자매갈비전골 — Final 에도 좌표 없음, final active 1). final active invalid 0.
- images: package 4,567 rows = plan 4,397 + twin 170(SKIP) · plan resolved 4,397/4,397 · flag mismatch 0 · primary conflict 0 · eligible 3,794 · empty URL 0 · rights violation 0 · legacy fallback 0. http:// scheme(KTO tong.visitkorea) 82(gyeongju 65 · busan 7 · jeju 10).

## 7. Gyeongju Food 105 (전수)
total 105 · visitgyeongju bridge 105(key unique 105) · name/desc 4-locale 105/105 · official image_url 105 · image relation eligible primary 105 · lat/lng 105(경주 범위 105) · NAV 105 · coordinate_quality ENTITY_EXACT 94 + ADDRESS_NUMBER_LEVEL 11 · DB 좌표 = final package(coordinates-final-v2) 105/105(ε 1e-9) · old GJ08 image fallback 0 · non-VG eligible image 0 · MATCH 8(#577 #607 #619 #633 #634 #640 #644 #653 published) · NEW 97 hidden+noindex 97 · page 105 생성 · retired 94 published true(hide 미실행)·final active 포함 0.
render(390px): #577 STILLROOM · #607 Whasoo Brewery(VG 공식 이미지·ko 설명·영업시간·주소) · #640 Yosukgung · NEW #1527 옛고을 토속 순두부 · #1528 달개비 — title/설명/이미지/좌표 정상, legacy GJ08 텍스트 0.

## 8. Seoul / other-city freeze
- Seoul 1,837: DB desc_l10n·description·name = final package 1,837/1,837 · regression 0 · max 5,141자 보존(>4,000 1건, 절단 0) · angle-bracket title 102 보존 · style/script/data-sheets 0(패턴 1건 = `<DIVINITY>` 전시 제목, package 동일).
- busan 788 · jeju 1,496 · jeonju 236 · gyeongju attraction 197 · gyeongju food 105: owned field + 좌표 diff **0**. busan `district` 64 / `why_it_matters` 50 는 package None·DB legacy 유지 = `NOT_OWNED` no-op 정책(unapproved diff 아님).

## 9. Render / mobile / route contract (local static server, 390×844)
28 routes: `/`, 5 city, 5 explore, all-spots, trending, picks(noindex), `/my-trips/`(200, noindex) , `/trips` & `/trips/` **404**, `/place/` 10종(47·577·607·640·1527·1528·3127·1659·727·927) 200, `/place/999999/` 404. overflow-x 0 · broken img 0 · route crash 0.
예외: `/explore/busan/` 이 render 시퀀스(같은 context 7번째 페이지)에서 2/2 회 클라이언트 오류 화면(`Cannot read properties of null (reading 'capitalize')`, app 소스에 해당 속성 접근 없음 · 로컬 127.0.0.1 은 Naver Maps auth 401) — 단독/시퀀스 재현 0/9, Production(gokoreamate.com) 동일 시퀀스 4/4 정상. 데이터 release blocking 아님(로컬 환경 분류, 배포 후 재확인 권고).

## 10. Tests
`node --test src/lib/**/*.test.ts` 2,407 / pass 2,399 / fail 8(baseline: migration-041 guard 6 · color-token 1 · brand JSX 1) / new 0. `tsc --noEmit` PASS. `eslint`(전체 tree) exit 1: 130 errors/60 files 는 전부 master(69cc51a) 대비 미변경 파일(pre-existing) + 1,848 은 untracked 로컬 `.wrangler/` 산출물; **이 lineage 가 변경한 파일의 error 0**.

## 11. Owner 판단 항목 (PUBLISH PRECHECK 로 이관)
1. Next fetch cache 하드닝(코드 변경) 및 Cloudflare build cache OFF 확인 후 REBUILD.
2. legacy 19(busan manual) 유지 확정 → visible 4,678.
3. Final 데이터 완전성(Main 수정 금지): Jeju ko 전용 1,496 · 설명 없음 281 · 좌표 없음 #910 · http 이미지 82 · Seoul Final name HTML entity 5(`&#39;` 등, package 동일) · legacy GJ08 description entity 38(hide 후보).
4. preview 빌드 실패(preview env 부재) — 의도된 것인지 확인(Production 무관).
