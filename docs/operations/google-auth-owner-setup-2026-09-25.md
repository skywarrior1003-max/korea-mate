# Google 로그인 Owner 설정표 (V2-MINIMAL-GOOGLE-AUTH-V1 §5·§14)

작성 2026-09-25 · 상태: **OWNER CONFIGURATION REQUIRED**

코드는 완성돼 있다(PKCE·callback·서버 검증·AI 경로 인증 관문). 실제 Google
로그인은 아래 Owner 설정이 끝나야 동작한다. 이 작업 중 어떤 Google 계정·
Supabase Dashboard 도 임의 조작하지 않았다(§14 계약).

현재 실측 상태(2026-09-25, Management API read-only):
- Staging·Production 모두 `external_google_enabled: false`, client_id 미설정
- 양쪽 모두 `site_url: http://localhost:3000` (교정 필요), redirect allow list 비어 있음

## A. Google Cloud Console (Owner)

| # | 항목 | 입력값 형식 | 비고 |
|---|------|-------------|------|
| 1 | Google Cloud project | 기존 gokoreamate 용 프로젝트 또는 신규 | AI billing project 와 분리 여부는 Owner 판단 |
| 2 | OAuth consent screen 앱 이름 | `gokoreamate` | 소문자 브랜드 표기 계약 |
| 3 | 지원 이메일 | Owner 선택 | consent 화면에 노출됨 |
| 4 | 개발자 연락 이메일 | Owner 선택 | Google 통지 수신 |
| 5 | 홈페이지 URL | `https://gokoreamate.com` | |
| 6 | Privacy Policy URL | 실제 게시된 정책 URL | **현재 저장소에 별도 정책 페이지 없음 — 실제 서비스 내용과 맞는 문서를 Owner 가 준비**(임의 법률 문서 생성 금지 계약) |
| 7 | Terms URL | 동일 | 동일 |
| 8 | Authorized domain | `gokoreamate.com`, `supabase.co` | Supabase callback 도메인 포함 |
| 9 | **Production OAuth client** (Web) | client ID + secret 발급 | secret 은 Supabase Dashboard 에만 입력 — 저장소·Cloudflare 변수·브라우저 금지 |
| 10 | **Staging OAuth client** (Web, 별도 권장) | client ID + secret 발급 | Production 과 분리 |
| 11 | Authorized redirect URI (Production client) | `https://<production-ref>.supabase.co/auth/v1/callback` | ref 는 Cloudflare 의 `EXPECTED_SUPABASE_PROJECT_REF`(Production) 값 |
| 12 | Authorized redirect URI (Staging client) | `https://<staging-ref>.supabase.co/auth/v1/callback` | ref 는 `scratchpad/staging-secrets.json` 의 ref |
| 13 | Publishing status | Testing → (검증 후) Production | Testing 상태면 테스트 사용자 목록에 있는 계정만 로그인 가능 |
| 14 | 테스트 사용자 | Testing 단계에서 Owner QA 계정 등록 | |
| 15 | 브랜드 검증 | scope 이 openid/email/profile 뿐이라 통상 별도 검증 불요 | Google 정책 변경 시 재확인 |

## B. Supabase Dashboard (Owner) — 프로젝트별

각 프로젝트(Authentication → Providers → Google / URL Configuration):

| 항목 | Production | Staging |
|------|-----------|---------|
| Google provider | Enable + Production client ID/secret | Enable + Staging client ID/secret |
| Site URL | `https://gokoreamate.com` | 고정 Preview alias origin (아래 C) |
| Redirect URLs (allow list) | `https://gokoreamate.com/auth/callback` (+`https://www.gokoreamate.com/auth/callback` — www 는 canonical 로 정리되지만 명시 등록 권장) | `<고정 Preview alias>/auth/callback`, 로컬 개발용 `http://localhost:8788/auth/callback`·`http://localhost:3000/auth/callback` |

원칙(§5): wildcard 금지 — `https://*.pages.dev` 같은 전면 허용을 넣지 않는다.
Staging 은 branch 고정 alias(예: `https://feature-v2-minimal-google-auth.korea-mate.pages.dev`)만 등록한다.

## C. 앱 쪽 redirect 표 (코드 기준 — 이미 구현됨)

| 환경 | 로그인 시작 redirectTo | Google 에 등록하는 URI |
|------|------------------------|------------------------|
| Production | `https://gokoreamate.com/auth/callback` | Production Supabase `/auth/v1/callback` |
| Staging/Preview | `<해당 origin>/auth/callback` | Staging Supabase `/auth/v1/callback` |
| 로컬 | `http://localhost:8788/auth/callback` | (Staging client 공유) |

앱 → Google → **Supabase callback** → 앱 `/auth/callback`(PKCE code 교환·URL 정리·안전 복귀) 순서다.
교차 환경 token 은 서버 helper 가 각 환경의 Supabase 로 검증하므로 자동 거부된다.

## D. 설정 완료 후 검증 절차 (Owner 또는 후속 TASK)

1. Staging Preview 에서 `Google로 계속하기` → Google 화면 → 복귀 → More 에 이름 표시
2. 새로고침 세션 유지 · 로그아웃 · 취소 복귀
3. AI 옵트인 카드: 비로그인 → 로그인 안내 → 로그인 후 confirm 단계(현재 AI off 라 이후 '잠시 사용할 수 없어요')
4. Staging 계정 token 으로 Production API 호출 → 401 `invalid_session` 확인

## E. 이번 TASK 에서 하지 않은 것

- Google Cloud·Supabase Dashboard 조작 0 · Production Auth 설정 변경 0
- Privacy/Terms 문서 생성 0 (실서비스와 맞지 않는 임의 문서 금지)
- 무료 횟수·크레딧·결제·계정 통합 0 (후속: V2-FREE-ENTITLEMENT-AND-PAID-CREDIT-LEDGER-V1)
