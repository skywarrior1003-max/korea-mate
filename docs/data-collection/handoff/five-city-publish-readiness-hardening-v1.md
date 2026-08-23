# five-city PUBLISH readiness hardening v1 (TASK-FIVE-CITY-CORE-PUBLISH-READINESS-HARDENING-V1 · 2026-08-23)

PRODUCTION WRITE 0 · PUBLISH/deploy 미실행. start `01c1ba4` · branch `feature/five-city-core-publish-readiness-hardening-v1` · origin/master `69cc51a` · v3 run `aada6b5e6873c12f`. machine summary: `data/main-intake/five-city-core-v3/build-qa/publish-readiness-hardening-v1.json`.

## 1. stale fetch-cache — root cause(확정)
- `src/lib/place-detail/place-source.ts` 의 `fetchSpot()`·`fetchPublicSpotIds()` 가 옵션 없는 `fetch()` → Next 16 정적 생성은 이를 **"auto cache"** 로 Data Cache(`.next/cache/fetch-cache`)에 `revalidate: 31536000`(1년) 으로 저장하고, 디렉토리가 남아 있으면 다음 빌드에서 재사용(`next/dist/server/lib/patch-fetch.js`: cacheReason `auto cache` → `INFINITE_CACHE` → `CACHE_ONE_YEAR`).
- STAGE BUILD 실측: 2026-08-12 entry 716개가 legacy 714 id 의 `fetchSpot()` 을 대체 → /place/577 `스틸룸`·607 `화수브루어리`·640 `요석궁1779`(DB 는 STILLROOM/Whasoo Brewery/Yosukgung).

## 2. hardening(코드 변경 2파일 + 테스트 1파일)
- `place-source.ts`: `PLACE_FETCH_CACHE_POLICY = "no-store"` 를 두 fetch 에 적용(Data Cache 읽기·쓰기 모두 없음). visibility scope·keyset·실패 정책 불변. 값 import 를 상대 `.ts` 경로로(node --test 해석용, 동작 동일).
- `src/app/place/[id]/page.tsx`: `export const dynamic = "force-static"` 추가 — no-store fetch 가 정적 생성을 dynamic 으로 bail(E550) 시키지 않도록(sitemap.ts 와 동일 선언). 렌더 결과 불변.
- Explore/planner/near-me(supabase-js 런타임)·Functions 는 대상 아님(변경 0). 전체 fetch 에 일괄 no-store 적용하지 않음.
- 테스트 `src/lib/place-detail/place-source.test.ts` CACHE-1~5(no-store 계약 · 현재 응답 우선 · visibility 불변 · static export 계약 · keyset 불변) 5/5 PASS.

## 3. 빌드 증거
| build | 조건 | exit | 시간 | pages | sentinel(482: MATCH 368 + restore 94 + NEW 20) stale | fetch-cache 후 |
|---|---|---|---|---|---|---|
| A stale-injected | `.next` 삭제 후 2026-08-12 stale entry 5,009 를 `.next/cache/fetch-cache` 에 복원하고 빌드 | 0 | 76s | 5,064 | **0** (577/607/640 = DB) | 5,009 그대로(추가 0) |
| B clean | `.next`·`out` 삭제(BUILD_FROM_CLEAN_CACHE=YES) | 0 | 73s | 5,064 | **0** | **1**(Satori wasm `data:` URI, city_spots 0) — 하드닝 전 5,007 |
공통: ENVIRONMENT_FALLBACK 31(baseline) · DynamicServerError 0 · routes 5,005/5,005(missing 0·extra 0) · sitemap 738(/place 714 = published, hidden leak 0) · noindex hidden sample 477/477·published 0.
A 가 "동일 코드·동일 DB 2회 빌드" 의 resilience 증거를 겸함(값 동일, stale 재등장 0; sitemap lastModified 타임스탬프만 빌드별 상이).

## 4. Cloudflare(READ-ONLY)
`.next/`·`out/`·`.wrangler/` git-ignored · Pages 는 fresh clone, `build_config` 에 build caching 없음 · production env var 11개(NEXT_PUBLIC_SUPABASE_*, SERVICE_ROLE 등 이름만) · preview env var **0**. 최근 75 deployment: preview 67 → success 0 / build failure 66(`fetchPublicSpotIds=[]` → Next 16 export 가 빈 generateStaticParams 거부) · production 성공. → `PREVIEW_BUILD_ENV_CLASSIFICATION=EXPECTED_CONFIGURATION`(runbook 릴리스 경로는 master→production 뿐, preview 는 관측 구간 내 한 번도 성공한 적 없고 Production DB 접근이 설정되지 않음). preview 검증 surface 가 필요하면 Owner 의 env 결정 사항.

## 5. #910 전주 자매갈비전골 (READ-ONLY)
- identity: canonical `OFF-16133`(visitjeonju sid 16133 primary) + KTO 2870801(CONFIRMED_MERGE, EXACT_NAME) · city jeonju · restaurant · address(DB/package) `전주시 완산구 기린대로 121`(=kto_addr; 공식 게시판 주소는 `노송광장로 10`) · official_url tour.jeonju.go.kr dataSid=16133 · lat/lng **null**(package 도 null, owned_fields 에 lat/lng 포함 → FINAL_ABSENT) · image_url null(KTO 이미지는 `KTO_TYPE_UNKNOWN` → display_eligible false).
- pinned Final catalog(436fe37) row: `has_coord:false`, **`coord_source:"KTO_SUPPLEMENT"`**, `lat:""`, `lng:""`, `kto_lat:"35.8198804174"`, `kto_lng:"127.1534611530"`. ACTIVE 236 중 has_coord false 는 이 1건뿐(KTO 출처 133건은 lat/lng 채워져 있음).
- 분류: **CASE C** — Final 의 canonical lat/lng 는 비어 있으나 같은 artifact 가 지정한 KTO 병합 레코드에 exact 좌표가 있음. Main intake 는 canonical 필드만 읽음(kto_lat fallback = 휴리스틱 재해석 금지) → **Main bug NO**.
- 영향: Place Detail 렌더 OK·네비 링크 없음(hasCoord false) · Explore 마커 없음 · Near Me/스케줄러 후보 제외(`.not("lat","is",null)`) · Living Map 제외 · crash 0 → `NON_BLOCKING_WITH_EXPLICIT_EXCEPTION`(1건, hidden NEW).
- 권고: Owner 승인 targeted correction — #910 만 lat 35.8198804174 / lng 127.1534611530(KTO 2870801, coordinate_source=KTO_SUPPLEMENT) 적용(Secondary Final row 수정 + Main 단일 행 UPDATE receipt, 또는 Owner SQL Editor 단일 행). 주소 2종(공식 vs KTO) 은 적용 전 현위치 확인 권고. 대안: 명시적 예외(좌표 없이 공개) 또는 PUBLISH 시 hidden 유지. **데이터 수정 필요 YES · Owner 승인 필요 YES · 이번 TASK 미실행.**

## 6. HTTP image 82 (READ-ONLY)
final-active `city_spots.image_url` http:// 82(distinct 82, host `tong.visitkorea.or.kr` 100%) · gyeongju 65 · busan 7 · jeju 10 · 현재 published 65 / hidden 17 · `city_spot_images` http 행 506(eligible 82).
HTTPS_EQUIVALENT_OK **82/82**(https HEAD/GET 200 image/*) · redirect 0(http HEAD 405, redirect 없음) · HTTP_ONLY 0 · UNKNOWN 0.
영향: https 페이지의 http `<img>` = optionally-blockable mixed content — Chrome/Edge/Safari 는 https 로 자동 업그레이드(동작), Firefox 기본은 차단 가능(이미지 누락, 페이지 실패 없음). 65건은 이미 Production 에 published 상태 → PUBLISH 가 새로 만드는 위험 아님. 권고: Final image plan·`city_spots.image_url`·`city_spot_images` 에 http→https scheme normalization(동일 asset, 권리/provenance 불변, 재수집 0) 을 Owner 승인 targeted correction 으로. **데이터 수정 필요 YES · Owner 승인 필요 YES · 이번 TASK 미실행.**

## 7. 회귀
tests 2,412 / pass 2,404 / baseline fail 8(동일 8) / new 0 · tsc PASS · changed-files eslint 0 errors · 390px render 28 routes 200/404 계약 유지(`/trips` 404 · hidden NEW noindex) · `/explore/busan/` 로컬 python 서버 시퀀스에서만 클라이언트 오류 재현(Naver Maps 401·RSC prefetch 404 환경), 동일 시퀀스 Production 4/4 정상 · Production before=after 5,005/714/4,291/0 · user 68/0/4/9 · write 0.
