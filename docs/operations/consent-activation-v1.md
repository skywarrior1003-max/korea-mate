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

## 6. LINKING-V1 확장(2026-09-27) — 자동 기기 연결

activate 가 동의 확보 후 현재 기기(검증된 x-device-id)를 계정에 **자동 연결**
한다(078 `account_devices`·원자 RPC — 같은 계정 멱등·타 계정 409
`device_already_linked`, overwrite 불가). account = 그 계정에 연결된 **전
기기**의 개인 데이터 scope(서버 판정기 `functions/_lib/ownership.ts` 단일 경로).
**linked device 는 무세션/타계정/미동의 접근이 전면 거부된다 — 익명 direct
fallback 없음(fail closed)**. 로그아웃은 `signOutAndReset()` 하나: 세션 종료
성공 시에만 device rotation(새 UUID)+개인 로컬 캐시 제거+reload. old device
mapping 은 서버에 유지(익명 재사용 금지). 078 FK 는 **ON DELETE RESTRICT** —
auth user 를 먼저 지울 수 없고, 계정 삭제 기능이 콘텐츠→mapping→user 순서로
명시 정리해야 한다(Staging 실측: mapping 보유 user admin delete = 500 거부).

## 7. DURABILITY-V1 확장(2026-09-27) — trip_drafts 작업 단위 동기화

This Trip 서버 draft(079 `trip_drafts`)는 이제 080 으로 `revision`(서버만
증가)·`applied_ops`(최근 64개 op_id — 멱등 판정용)·`context`(city/start/end)
를 갖고, 모든 변경이 `trip_draft_apply`/`trip_draft_merge_guest` RPC(row
lock·service_role 전용)로만 일어난다. **계정 삭제 정리 순서에 trip_drafts
의 owner_type='user' 행도 콘텐츠 단계에 포함**할 것 — applied_ops 는 행과
함께 지워지는 열이라 별도 파기 절차는 없다(op_id 는 무작위 UUID, PII 아님).
클라 pending queue(`koreamate_draft_ops_v1`)는 `koreamate_` prefix 라
로그아웃 rotation 의 로컬 정리 계약에 이미 포함된다(단, 로그아웃은 flush
성공 후에만 진행 — 실패 시 rotation·queue 삭제 없이 중단·안내).
