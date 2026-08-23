# Post-launch Place Delivery Scaling — SSOT v1 (2026-08-23)

기록 전용 문서(TASK-POST-LAUNCH-PLACE-DELIVERY-SCALING-RECORD-V1). 이 문서는 5도시 Production 공개 이후의 **확장 원칙**을 고정한다. 구현·배포·DB write·플랜 변경은 이 문서의 범위가 아니다.

## 1. 확정 상태
- `FIVE_CITY_PRODUCTION_RELEASE_COMPLETE=YES` · five-city data/release = **CLOSED** (master `63b0986`, Cloudflare production `c096f273`, DB 5,005 / published 4,678 / hidden 327). 기록: `data/main-intake/five-city-core-v3/release/`, `publish-precheck/`.
- 현재 최우선순위: **My Trip 완성 → 연결 기능 QA → 모바일/실서비스 QA → gokoreamate 오픈**.
- 오픈 전에는 전국 확장을 이유로 **추가 도시 수집 · Place delivery 재설계 · OpenNext/전면 SSR 전환을 진행하지 않는다.**
- `/place/[id]` on-demand 전환은 **POST-LAUNCH 확장 트랙으로 보류**한다.
- 다음 도시/전국 단위 확장을 실제로 시작하기 전에 **이 문서를 먼저 검토**한다.

## 2. 현재 전달 계층(delivery layer)의 한계 — 실측 사실
| 항목 | 값 |
|---|---|
| physical `/place` routes | 5,005 (published 4,678 + hidden 327, reference scope 로 전부 생성) |
| build output | 10,462 files (`scripts/build-static.mjs` 가 `/place` segment-prefetch `__next.*` 파일 제거 후; 제거 전 45,492) |
| `/place` 1개당 파일 | 2 (`index.html` + `index.txt`) · 비-place 고정분 452 |
| Cloudflare Pages 한도 | Free **20,000 files/deployment**(Paid 100,000) · 빌드 타임아웃 20분 · 현 프로젝트는 Free 한도에서 실패한 이력 있음(deployment `23dc4178`) |
| 현 정적 구조의 상한 | (20,000 − 452) / 2 ≈ **9,774 places** 에서 file limit 에 접근 · `build-static.mjs` 의 20k 가드가 초과를 배포 전에 차단 |
| 두 번째 상한 | 빌드 시간: Cloudflare 3 workers, 5,005 페이지(페이지당 Supabase REST 1회) build→deploy ≈ 2분 41초, 장소 수에 선형 비례 |

- **"7,000" 은 공식 한도가 아니다.** 과거 보고에서 쓴 보수적 경고 표현이며 기준으로 사용하지 않는다. 기준은 위 실측(≈9,774)과 Cloudflare 공식 한도다.
- 데이터 계층은 전국 확장에 재사용 가능: keyset pagination(PostgREST 1,000 상한 제거) · visibility gate(discovery/reference) · STAGE/PUBLISH 절차와 SQL generator · 50k synthetic 검증 · fetch cache `no-store` 하드닝(`2474e86`). **남은 확장 과제는 `/place` delivery layer 하나다.**

## 3. 향후 권장 방향(보류 중, 착수 전 재검토)
- **우선안: Pages Function + static shell 기반 on-demand `/place/[id]`** — Function 이 Supabase REST 로 행을 읽고(`is_published` 로 noindex 결정) `src/lib/place-detail/place-detail-core.ts` 로 title/description/OG/JSON-LD 를 생성·데이터 JSON 을 내장해 정적 shell 을 반환, Cloudflare Cache API TTL(수 분)로 캐시. 정적 `/place` 5,005 생성은 제거.
- repo 기존 패턴 재사용: `functions/shared/[id].ts`(REST 조회 → 동적 OG 주입 → `env.ASSETS` shell passthrough) 와 place-detail core 를 우선 검토.
- 목적: **장소 수와 build 파일 수/build 시간이 선형으로 함께 증가하지 않게** 한다(파일 ≈ 고정 450, 빌드 수십 초). 부가 효과: PUBLISH 후 2차 재빌드 불필요(noindex 가 DB 즉시 반영).
- 대안 비교(기록): Pages Paid 플랜(100k files)은 files 상한만 올리고 빌드 시간 상한(≈25–30k 장소)은 남음 · OpenNext/Workers SSR 은 4–7일 + 파이프라인 재구성·런타임 운영 비용 → 현 단계 부적합 · `index.txt` 제거(1 file/place)는 ≈19.5k 까지만이며 클라이언트 내비게이션이 full-load 로 퇴화.
- 전환 시 검증 항목: 20k/50k synthetic places · sitemap(50k URL 한도·분할)·noindex · metadata/OG/JSON-LD · locale · Explore→Place navigation · direct URL · cache freshness(stale 0) · Worker request/CPU/cost(Free 100k req/일·CPU 10ms, Paid CPU 30s) .

## 4. 재개 Trigger
- 홈페이지/서비스 오픈 후, 다음 도시 또는 대규모 지역 데이터 확장을 **실제 사업 일정에 올리는 시점**.
- 그때 `TASK-PLACE-DELIVERY-ON-DEMAND-V1` 착수 여부를 **먼저 결정**한 뒤 도시 확장을 진행한다(도시당 0.2–1.8k 장소 기준, 현 구조 여유 ≈ 4,700 장소).

## 5. 관련 기록(의미 변경 없음)
- 런북 `docs/data-collection/handoff/five-city-core-production-runbook-v1.md` §3 static `/place` 행(`PLACE_STATIC_BUILD_SCALE_REVIEW_REQUIRED`)
- `docs/data-collection/handoff/five-city-core-stage-build-v1.md` · `five-city-publish-readiness-hardening-v1.md` · `five-city-targeted-corrections-publish-precheck-v1.md`
- `data/main-intake/five-city-core-v3/release/five-city-final-release-summary-v1.json`
