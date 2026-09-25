# V2 환경 격리 계약 (V2-ENVIRONMENT-ISOLATION-V1 · 2026-09-25)

개발·Preview/Staging·Production 의 자원 경계와 fail-closed 규칙. AI 원가 감사·
결제·V2 공개는 이 계약이 Production 에 적용된 뒤에만 진행한다.

## 1. 환경 매트릭스

| 자원 | development | staging(Preview) | production |
|---|---|---|---|
| APP_ENV | development | staging | production |
| site origin | localhost | *.korea-mate.pages.dev | https://gokoreamate.com |
| Supabase DB/Storage | staging(또는 local) project | **staging project만** | **production project만** |
| service role | 로컬 `.env.local`/`.dev.vars`(staging 값) | CF Preview env | CF Production env |
| ADMIN_KEY | 로컬 전용 난수 | 미설정 → admin 503 fail-closed | production 전용 |
| AI | off | off (test 는 별도 staging key 있을 때만) | AI_MODE=live |
| Analytics(GA) | off | off (test property 만 예외) | live |
| Affiliate | off | test(외부 이동·귀속 0, UI 유지) | live |
| Payment(미구현) | disabled | 향후 sandbox only | 향후 live only |
| Google Auth(미구현) | 향후 dev redirect | 향후 staging client | 향후 production client |

- **APP_ENV 가 유일한 환경 SSOT** — `NODE_ENV` 로 환경을 판정하지 않는다
  (Cloudflare Preview 도 NODE_ENV=production 이다). 중복 식별자(ENV·STAGE 등)는
  저장소에 존재하지 않음을 감사로 확인했다(2026-09-25).
- 누락·오타 APP_ENV 는 **절대 production 으로 추정하지 않고** build/runtime 이
  차단한다.

## 2. 가드 배선

| 지점 | 파일 | 차단 내용 |
|---|---|---|
| 판정 코어 | `src/lib/env/app-env-core.ts` | 순수 로직(클라 안전·ref 상수 없음) |
| 클라이언트 | `src/lib/env/app-env-client.ts` | NEXT_PUBLIC_APP_ENV 기반 analytics/affiliate 게이트 |
| build | `scripts/verify-environment.mjs` (build-static 선행) | APP_ENV·origin·ref·CF branch 교차·mode live·클라 secret 명명 |
| runtime | `functions/api/_middleware.ts` + `functions/_lib/app-env.ts` | 전 /api 에서 DB query 이전 환경 불일치 503(상세 비노출) |
| AI | writing·generate-itinerary·import/analyze·trip/personalize 상단 | provider 호출 이전 차단·key fallback 없음 |
| GA | `src/app/layout.tsx`·`src/lib/analytics.ts` | 비-production 스크립트 미주입 + trackEvent no-op |
| Affiliate | `src/components/AffiliateLink.tsx` | 비-production href=`#partner-preview`·click 전송 0·SSOT 상수 불변 |

- public/server Supabase ref 일치·Storage 동일 project(별도 Storage URL 변수
  부재 — 감사 확인)는 ref 검증 하나로 함께 보장된다.
- 서버 전용 모듈은 마커(`gkm-server-env-guard-v1`)로 클라이언트 번들 미포함을
  테스트가 감시한다.

## 3. Cloudflare 변수 (이름만 — 값·secret 은 대시보드에만)

Production(기존 17종 이름): ADMIN_KEY · ADMIN_NOTIFICATION_EMAIL ·
AI_PERSONALIZATION_MODE · CONTACT_FROM_EMAIL · GEMINI_API_KEY · INTERNAL_KEY ·
KMA_API_KEY · MYTRIP_HASH_SECRET · MYTRIP_TREND_BUCKET_ACTIVE_PCT ·
MYTRIP_TREND_BUCKET_EXPERIMENTAL_PCT · NEXT_PUBLIC_GA4_ID ·
NEXT_PUBLIC_NAVER_MAP_CLIENT_ID · NEXT_PUBLIC_SITE_URL ·
NEXT_PUBLIC_SUPABASE_ANON_KEY · NEXT_PUBLIC_SUPABASE_URL · RESEND_API_KEY ·
SUPABASE_SERVICE_ROLE_KEY

Preview(기존 5종 + 이번 TASK 추가 7종): GEMINI_API_KEY · MYTRIP_HASH_SECRET ·
NEXT_PUBLIC_SUPABASE_ANON_KEY · NEXT_PUBLIC_SUPABASE_URL ·
SUPABASE_SERVICE_ROLE_KEY **+ APP_ENV=staging · NEXT_PUBLIC_APP_ENV=staging ·
SITE_ORIGIN · EXPECTED_SUPABASE_PROJECT_REF · AI_MODE=off · ANALYTICS_MODE=off ·
AFFILIATE_MODE=test**

> ⚠ Cloudflare 함정(2026-09-25 실측): API 로 `plain_text` 타입으로 넣은 변수는
> **런타임에는 보이지만 빌드 프로세스에는 주입되지 않는다**. 빌드 가드가 읽어야
> 하는 변수(APP_ENV 등)는 반드시 `secret_text`(대시보드 기본) 타입으로 설정한다.

## 4. Production 출시 전 Owner/release TASK 설정 항목 (이 값들이 없으면 Production build 가 의도적으로 실패한다)

Cloudflare **Production** env 에 추가(전부 비밀 아님):

```text
APP_ENV=production
NEXT_PUBLIC_APP_ENV=production
SITE_ORIGIN=https://gokoreamate.com
EXPECTED_SUPABASE_PROJECT_REF=<production ref — keepalive workflow 에 공개된 값>
AI_MODE=live
ANALYTICS_MODE=live
AFFILIATE_MODE=live
```

주의: 이 branch 를 master 에 반영하면 위 변수 설정 **이전의** Production 빌드는
verify-environment 가 차단한다(fail-closed 설계). 반영 릴리스 TASK 는 반드시
변수 설정 → push 순서를 지킨다.

## 5. 로컬 개발자 절차 (Production 오사용 방지)

1. `.env.local`/`.dev.vars` 는 **staging 자격만** 담는다(2026-09-24 이후 상태).
   Production URL/service role 을 로컬로 복사하지 않는다.
2. `APP_ENV=development` + `EXPECTED_SUPABASE_PROJECT_REF=<staging ref>` 필수 —
   없으면 build 가 실패한다.
3. Production 값이 필요한 작업(migration·릴리스 검증)은 로컬 env 가 아니라
   해당 TASK 의 Owner 승인 절차로만.
4. 로컬 wrangler(`pages dev`)의 /api 도 동일 미들웨어가 지킨다 — production
   DB 를 가리키면 503.

## 6. Preview 배포 전 체크리스트

- [ ] `node scripts/verify-environment.mjs` OK (CI 는 build 에 내장)
- [ ] `npm run test:*` env 가드 포함 그린
- [ ] Preview env 에 §3 의 12종 존재
- [ ] admin 은 ADMIN_KEY 부재로 503 (Preview 기본)
- [ ] affiliate 링크 href=`#partner-preview` (외부 이동 0)
- [ ] GA network 요청 0

## 7. AI 원가 감사 시작 전 충족 조건

- Preview AI 가 provider 를 호출하지 않음(AI_MODE=off 실측) — 충족(이 TASK)
- Production AI 경로가 AI_MODE=live 게이트 뒤에 있음 — 코드 반영됨(릴리스 대기)
- 원가 감사는 별도 TASK 에서 test key/모드로 수행

## 8. 장애 시 동작(fail-closed 요약)

- 환경 판정 불가 → build 실패 / API 503 (`service_unavailable` — 내부 상세 0)
- AI 비허용 환경 → provider 호출 전 `ai_unavailable_in_this_environment`
- admin key 부재 → 기존 fail-closed 503 유지
- 어떤 오류 응답·로그에도 secret·URL·ref 를 넣지 않는다

## 9. Payment · Google Auth 미래 계약(구현 없음 — 계약만)

- Payment: dev=disabled · staging=**sandbox only**(sandbox/live webhook secret
  분리) · production=live only. live secret 의 Preview 사용 금지. 금액·국가
  정책은 결제 TASK 에서.
- Google Auth: dev/staging/production redirect URI 와 OAuth client 를 각각
  분리. Production client secret 의 Preview 사용 금지. 전체 Auth Lab 은 V3,
  V2 는 AI 이용권 소유권용 최소 Google 로그인만 후속 구현.
