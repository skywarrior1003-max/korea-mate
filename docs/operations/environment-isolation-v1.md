# 환경 분리 계약 v1 (GOKOREAMATE-V2-PRELAUNCH-ENVIRONMENT-ISOLATION-V1 · 2026-09-24)

V2 공개 전 순서 1번 "환경 분리"의 확정 계약. 이후 AI 원가 감사·하드캡·로그인·
결제 개발은 이 계약이 PASS 된 상태를 전제로 한다.

## 1. 환경 역할 (확정)

| 환경 | 앱 | Supabase | 자격증명 위치 |
|---|---|---|---|
| Production | Cloudflare Pages Production (gokoreamate.com, branch=master) | **Production** (유일하게 허용) | Cloudflare 대시보드 Production env 만 |
| Preview | Cloudflare Pages Preview (branch push 자동 + 고정 alias) | **Staging** | Cloudflare 대시보드 Preview env 만 |
| Local | `next dev` / `wrangler pages dev` | **Staging 또는 격리된 Local Supabase** | `.env.local` · `.dev.vars` (git 미추적) |

- **Production 자격증명(URL·anon·service role)은 로컬 파일에 두지 않는다.**
  2026-09-24 이전의 `.env.local`·`.dev.vars` 는 Production 을 가리켰고, 본 계약으로
  Staging 지향으로 교체되었다. Production 값을 로컬로 다시 복사하지 않는다.
- `.env.local`·`.dev.vars` 는 commit 금지(.gitignore 등재). 템플릿은
  `.env.example`·`.dev.vars.example`(placeholder 전용).
- 예외적으로 로컬에 남는 관리성 자격증명(Owner 승인 범위):
  `SUPABASE_ACCESS_TOKEN`(Supabase Management API — Owner 승인 migration TASK 전용),
  `CLOUDFLARE_API_TOKEN`(배포·조회 계약 전용). 이 둘은 앱 데이터 경로가 아니다.

## 2. 가드 (fail-closed)

판정 코어: `src/lib/env-guard/data-env-core.ts` (CJS 사본 `scripts/env-guard/data-env.cjs`,
동기화는 테스트가 검사). Production 식별은 **공개된 project ref 문자열**만 사용한다
(keepalive workflow 로 이미 공개). key·service role·Secret 파생값은 코드에 없다.

| 지점 | 차단 대상 | 통과 |
|---|---|---|
| `next.config.ts` | Local `next dev`·`next build` 가 Production/판정불가 URL | Cloudflare CI(`CF_PAGES=1`), Staging |
| `scripts/build-static.mjs` | Local `npm run build:static`/`deploy` 동일 조건 | CI, Staging(주입값 우선) |
| `package.json` `predev` | `npm run dev` 시작 전 `.env.local` 검사 | Staging |
| `package.json` `dev:pages` | 시작 전 `.env.local`+`.dev.vars` 검사 | Staging |
| `functions/api/_middleware.ts` | loopback host(로컬 wrangler)에서 /api 전 요청 503 | 배포 host 는 무조건 통과(무변경) |

- 판정 불가(URL 부재·형식 불명)도 Local 에서는 **실패**다.
- 우회 env 변수는 없다. wrangler 직접 실행도 미들웨어가 막는다.
- 오류 문구는 고정: `Local development is blocked because the configured data
  environment is not verified as Staging or Local.` (값·존재 여부 비출력)

## 3. 로컬 설정 절차 (Owner/개발자)

1. Supabase **Staging** 프로젝트 대시보드 → Settings → API 에서 URL·anon·service role 확인.
2. `.env.example`/`.dev.vars.example` 를 복사해 `.env.local`/`.dev.vars` 생성 후 Staging 값 입력.
3. `npm run dev`(Next) 또는 `npm run dev:pages`(Functions 포함, korea-mate cwd 필수) 실행 —
   가드 통과가 곧 Staging 연결 확인이다.
4. Production 값이 필요한 작업(migration·Production 검증)은 로컬 env 파일이 아니라
   해당 TASK 의 Owner 승인 절차로만 진행한다.

## 4. legacy `src/app/api/*` 위험 메모

- `next dev`/plain `next build` 에서만 활성화되는 legacy Next API route 13개가 있다
  (`admin/*`, `generate-itinerary`, `scheduler/*` 등 — service role 사용).
  Production(정적 export)에는 포함되지 않는다.
- 본 계약으로 이 route 들은 로컬에서 **Staging 으로만** 동작한다(가드 + Staging env).
- 삭제·통합은 별도 후속 TASK 제안: `LEGACY-NEXT-API-ROUTE-RETIREMENT-V1`
  (Functions 경로와의 중복 판정 포함). 이번 TASK 에서는 구조 무변경.

## 5. Owner 확인 항목 (Cloudflare 값 수준 — 코드로 조회 불가)

Cloudflare Pages secret 은 API 로 원문 조회가 불가하다. 아래는 Owner 대시보드 확인:

1. dash.cloudflare.com → Pages → `korea-mate` → Settings → Environment variables
2. **Preview** 탭의 `NEXT_PUBLIC_SUPABASE_URL` 이 **Staging** 프로젝트인지
3. **Production** 탭의 동일 변수와 **다른** 프로젝트인지
4. 회신은 값이 아니라 다음 중 하나로만: `Preview=Staging 확인` / `Preview≠Production 확인` / `확인 불가`

확인 전까지 값 수준 판정은 `UNVERIFIED` 로 유지한다(기능 실증은 Staging).

## 6. Secret 설정 체크리스트

- [ ] `.env.local`·`.dev.vars` 에 Production URL/anon/service role 없음
- [ ] 두 파일 git 미추적 (`git ls-files` 에 없음)
- [ ] 예시 파일은 placeholder 만 (실 key·ref·마스킹값·길이·해시 금지)
- [ ] Production Secret 은 Cloudflare Production env 에만 존재
- [ ] Preview env 에 admin/internal 급 secret 없음 (감사 기준 유지)
- [ ] 새 secret 추가 시 이 문서의 환경 역할 표에 따라 배치
