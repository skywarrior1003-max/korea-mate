# 동의·계정 활성화 V1 (CONSENT-AND-AUTH-ACTIVATION-V1)

작성 2026-09-27 · 적용: Staging(077) + Preview 전용 — Production 미배포

## 1. 흐름

`Google로 계속하기` → 동의 sheet(만 14세·약관·처리방침, 전부 기본 미선택)
→ `POST /api/auth/consent-intent`(서명 HttpOnly cookie ≤10분) → PKCE OAuth
→ callback code 교환 → `POST /api/auth/activate`(session 검증 + cookie 검증
→ `user_consents` 기록·멱등) → 성공 시에만 active. 실패 = 즉시 signOut +
`/more?auth=…` 복귀. `GET /api/auth/status` 가 활성 여부의 단일 판정.

AI 4개 경로(generate-itinerary·import/analyze·mytrip/writing·trip/personalize)
는 `requireActiveUser`(session+현재 버전 동의)로 교체 — 동의 없는 session 은
403 `consent_required`.

## 2. 문서 버전 — ⚠ Preview 전용

단일 정의: `src/lib/auth/consent-contract.ts`
- terms/privacy: `preview-legal-v1` · age gate: `preview-age-14-v1`

**Production 출시 전 필수 절차**: Owner 확정 Legal(시행일 포함)로 버전을
교체한다(예: `2026-10-XX-v1`). Preview 버전 동의는 그 순간 구버전이 되어
**모든 사용자 재동의**가 요구된다(activate 가 409 reconsent 로 안내).
Preview/Staging QA 동의 행은 Production 으로 이전하지 않는다.

## 3. 077 user_consents

user_id(auth.users CASCADE)·3개 버전·locale·true 강제 플래그·시각만 저장.
이름·이메일·생년월일·IP·UA·device·hash·token·nonce 컬럼 없음.
RLS ON + policy 0 + anon/authenticated REVOKE — service_role API 전용.
UNIQUE(user, 3버전) = activate 멱등. **Staging 적용(sha 429041d9…)·
Production 미적용 — 별도 Owner 릴리스에서 적용.**

## 4. 미활성 auth 사용자

OAuth callback 은 동의 전에 `auth.users` 행을 만들 수 있다. 이 행은
active 아님(모든 접근 통제에서 배제)이며, 자동 삭제는 계정 삭제 Phase 에서
함께 설계한다. Production 출시 전 cleanup 계약 필요.

## 5. 로컬 검증 함정

wrangler pages dev 는 `.dev.vars` 편집·`--binding` 후 재기동해도 **기존
값(예: AI_MODE)을 stale 하게 유지하는 사례**가 재확인됐다(이번엔 binding 도
기존 var 를 못 덮음). 포트에 고아 workerd 리스너가 남는 사례도 있다 —
`netstat -ano | findstr :PORT` 로 전부 kill 후 단일 기동으로 판정할 것.
