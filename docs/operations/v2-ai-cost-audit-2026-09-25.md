# V2 AI 원가 감사 (V2-AI-COST-AUDIT-V1)

조사: 2026-09-25 04:45~05:2x UTC (13:45~14:2x KST) · 기준 commit `74ab775`
(origin/master = Production source) · branch `audit/v2-ai-cost-audit-v1`
재현: `node --experimental-strip-types src/lib/ai-cost/cost-model.test.ts` (7/7)
계산기: `src/lib/ai-cost/cost-model.ts` · secret 값 비노출(테스트가 자체 검사)

## 1. Executive Summary

- **현재 AI를 켜도 되는가 → 아니오.** 4개 공개 축 중 3축(일정·분석·개인화)에
  rate limit 이 전혀 없고, 일정 생성은 **출력 토큰 무제한(UNBOUNDED)** —
  행동 1회 최악 약 **226원**, 봇이 붙으면 상한은 Google 프로젝트 quota 뿐이다.
- **5,900원 이용권 → SAFE ONLY WITH HARD CAP.** 가용액 ≈5,187원(부가세 포함가
  ·PG 3.3% 가정) 기준: 대표 사용은 100회도 흑자(마진 ≈3,695원), **무캡 최악은
  22회에서 적자 전환**(30회 −1,598원 · 100회 −17,428원). 일정 출력을 8,192tok
  으로 캡하면 100회 최악도 흑자(≈+2,192원, 환율 1,300~1,450 전 구간 유지).
- 서버 하드캡 없이 판매 → **불가**. writing 축(20/day device·100/day global
  원장)이 유일한 기존 예산 모델 — 이 패턴을 전 축으로 확장하는 것이 §11 계약.

## 2. AI 호출 경로 전수표 (인벤토리 100%)

| 사용자 행동 | 공개 API | 인증 | 내부 경로 | provider 성공호출/행동 | 과금 재시도 | AI_MODE=off 차단 위치 |
|---|---|---|---|---|---|---|
| 일정 생성 | POST /api/generate-itinerary | 없음 | callGemini | 1 | 0(503만 재시도·무과금, 429 즉시중단, parse 재호출 0) | handler 최상단 aiAllowed |
| Story/AI Writing | POST /api/mytrip/writing | x-device-id 소유 | AI_WRITING Worker(binding)·직호출 fallback | 1(single-flight·캐시) | 0(Worker 재시도 0·8s timeout) | handler 최상단 |
| 가져오기 분석 | POST /api/import/analyze | 없음 | analyzeWithAi | 1 | 0 | handler 최상단 |
| 여행 개인화 | POST /api/trip/personalize | 없음 | profile-gemini-provider | 1 | 0(8s timeout) | handler 최상단 |
| 관리자 canary | POST /api/admin/ai-personalization-canary | x-admin-key | personalize handler 경유 | 1 | 0 | personalize 게이트 승계 |
| (비공개) trend curator | Worker cron 주 1회(월 19:00Z) | — | workers/trend-curator | locale당 1(grounding) | 0 | Staging 전용 선언·CURATOR_ALLOWED_MODEL 게이트 |
| (로컬 전용) legacy | src/app/api/generate-itinerary | — | 정적 export 미포함 | — | — | Production 도달 불가 |

provider 호출부 파일 집합(9개)은 테스트가 고정 — 새 경로가 생기면 실패한다.
**ai-writing Worker 는 `workers_dev=true`로 외부 노출되나 `x-internal-auth`
(INTERNAL_KEY·sha256 상수시간) fail-closed** — 무키/키부재 401(§8 참조).

## 3. 모델·토큰·상한 (코드 증거)

모델: 전 경로 **gemini-2.5-flash 단일**(테스트 고정). 멀티모달은 writing 의
이미지 1장(base64 ≤400,000 chars)뿐 — 오디오·PDF 없음.

| 축 | 입력 상한(코드) | maxOutputTokens | timeout | route rate limit |
|---|---|---|---|---|
| 일정 | 프롬프트 템플릿 ≤~12k chars·**numDays 무상한**(날짜차 검증 없음) | **없음 = UNBOUNDED(모델 65,536)** | 없음 | **없음** |
| writing | 필드별 40/160/220/400 chars·facts 120×N·이미지 400k | 700(hero)/1,800(witty)/3,000(moment3)/3,400(멀티모달) | 8~12s | 20s cooldown·3/h entity·**20/day device·100/day global**(063 원장) |
| 분석 | 추출 텍스트 18,000 chars·fetch 1.5MB·redirect 캡 | 4,096 | fetch timeout | **없음** |
| 개인화 | 프롬프트 6,000 chars | 700 | 8s | **없음** |
| curator | 고정 프롬프트 | 8,000 | — | cron 주1회·locale 수 |

기타: 요청 body 크기 route 자체 상한 없음(3축) · 사용자/IP 제한 없음(3축) ·
동시 다탭 호출 가능(3축) — 전부 §11 하드캡 입력.

## 4. 공식 가격 원장

출처: **https://ai.google.dev/gemini-api/docs/pricing** (조사 04:5x UTC).
`gemini-2.5-flash` paid tier — input(text/image/video) **$0.30/1M tok** ·
output **$2.50/1M tok (thinking 포함)** · cache $0.03/1M(+저장 $1.00/1M/h,
현재 미사용) · 오디오 input $1.00/1M(미사용). Grounding(Maps/Search) 별도
과금 — curator 만 해당(무료 RPD 내 설계). Free tier 존재(과금 0·낮은 RPD).
Rate-limit 문서(공식): 수치는 프로젝트별 AI Studio 표시 — **현 프로젝트의
tier(Free/Tier1)와 RPM/RPD = UNKNOWN(Owner Google 콘솔 확인 항목)**.
환율: 1 USD = **1,368.6 KRW** (open.er-api.com, 2026-09-25 00:02 UTC) ·
시나리오 1,300/1,450 — 결론 뒤집힘 없음(테스트로 고정).

## 5. 기능별 원가 (환산: 3 chars/tok 보수)

| 기능 | 대표 in/out(tok) | 최대 in/out | 대표 원가 | 최악 원가(행동 1회) |
|---|---|---|---|---|
| 일정 생성 | 3,000/4,000 | 4,667/**65,536** | $0.0109 (15원) | **$0.1652 (226원)** |
| Writing | 1,500/1,200 | 3,500/3,400 | $0.0034 (5원) | $0.0095 (13원) |
| 분석 | 4,000/1,500 | 6,334/4,096 | $0.0050 (7원) | $0.0121 (17원) |
| 개인화 | 1,500/500 | 2,167/700 | $0.0017 (2원) | $0.0024 (3원) |

과금 재시도 0(503 재시도는 provider 실패=무과금) — 최악도 성공 1회 기준.
p50/p95 는 실계측 부재로 **제시하지 않음**(대표 fixture·코드 최대·이론 최악만).

## 6. 5,900원 이용권 경제성

가정(문서 미확정 → 범위): 부가세 포함가(공급가 5,364원) · PG 2.5~3.5%
(계산 대표 3.3%) → **가용 ≈5,187원**(2.5%면 5,230원). 무료 제공량·크레딧 수
·환불 정책 = **UNKNOWN**(handoff 문서 `gokoreamate-ai-cost-payment-system-
handoff-2026-09-21.md` 는 저장소·인접 폴더에 부재 — 재작성하지 않음).

| 시나리오(전량 최고가 기능=일정) | 대표 비용/마진 | 무캡 최악 비용/마진 | 출력 8,192캡 최악 마진 |
|---|---|---|---|
| 30회 | 448원 / +4,739 | 6,784원 / **−1,598** | +4,288 |
| 50회 | 746원 / +4,441 | 11,307원 / **−6,121** | (흑자) |
| 100회 | 1,492원 / +3,695 | 22,615원 / **−17,428** | **+2,192** (환율 1,300→+2,342 · 1,450→+2,014) |

무캡 손익분기 **22회**. 혼합 사용(writing 위주)이면 대표 비용은 위보다 더
낮다(13원/회). **판정: SAFE ONLY WITH HARD CAP** — 평균이 싸도 최대비용을
서버가 제한하지 못하는 현재 구조로는 SAFE 아님.

## 7. 악용·비용 폭주 매트릭스 (live 가정)

| 공격 | 판정 | 근거 |
|---|---|---|
| 비로그인 반복 호출(일정/분석/개인화) | **OPEN** | route rate limit 0·인증 0 |
| device 변경/IP·VPN/다탭/봇/replay (3축) | **OPEN** | 위와 동일 — 상한은 Google quota 뿐 |
| 긴 prompt·대량 장소 주입 | PARTIALLY | 일정: 프롬프트는 서버 템플릿(입력 필드만)·**numDays 무상한**은 출력 폭주 벡터 / 분석 18k·개인화 6k 캡 |
| writing 반복(모든 벡터) | **BLOCKED** | 원장 20/day·100/day global·cooldown·single-flight·캐시 |
| JSON parse 실패 유도 재호출 | BLOCKED | 재호출 코드 없음(429 break·503만 재시도) |
| client 잔여횟수 조작·무료권 반복·국가 우회 | UNKNOWN(미구현) | 크레딧 시스템 부재 — §8 계약으로 서버 원장 필수 |
| canary/admin 오용 | BLOCKED | x-admin-key fail-closed |
| Worker 직접 호출 | PARTIALLY | workers_dev 노출이나 x-internal-auth 401 — 잔여=INTERNAL_KEY 유출 시(키 회전 절차 문서화 권고) |
| 크레딧 차감 전 연결종료·성공 후 DB실패·timeout 후 성공 | **OPEN(설계 필요)** | 원장 부재 — §8 reserve/commit/release 로 해결 |

`AI_MODE=off` 는 현재 비용 0 을 보장하지만 **live 방어책으로 계상하지 않음**.

## 8. 현재 방어 vs 누락 방어

있음: AI_MODE=off 게이트(4 route handler 최상단·테스트 고정) · writing 원장
(캐시·rate limit·single-flight·글로벌 100/day ≈ 최악 $0.95/day) · 과금
재시도 0 설계 · Worker 내부 인증 · curator 모델 allow-list.
없음: 3축 rate limit · 일정 출력 캡·일수 캡 · 사용자/글로벌 예산 · 크레딧
원장 · route별 kill switch(일정/분석/개인화) · 비용 계측 로그(토큰 usage 기록).

## 9. V2 공개 차단 조건 (전부 충족 전 AI_MODE=live 금지)

1. 일정 생성 `maxOutputTokens ≤ 8,192` + `numDays ≤ 14` 서버 강제
2. 4축 공통 서버 크레딧 원장(§10 계약) + 무료분도 동일 원장
3. 최소 Google 로그인(크레딧 소유권) + 결제
4. route별·전체 kill switch + 글로벌 일일 예산(writing 100/day 패턴 확장)
5. Google 프로젝트 billing tier·quota 확인 + 콘솔 예산 알림(Owner)

## 10. 다음 하드캡 TASK 입력 계약

- 행동 단위 = 공개 route POST 1회(=과금 성공 provider 호출 1회, 표 §2 대응).
- credit 차감 후보: 일정 3 · 분석 1 · writing 1 · 개인화 1 (최악 원가 비례).
- **reserve→commit→release** 필수: provider 호출 전 원자적 예약(잔액·일일
  상한·글로벌 예산 동시 판정 — DB 함수 1개, 잔액 음수 불가), 성공 시 commit
  (+usage tok 기록), provider 실패 시 release, **timeout/응답유실은 release
  하지 않고 'unknown-billed' 로 보존**(비용 0 가정 금지).
- idempotency key = 요청 UUID(클라 생성)+actor, 동시요청은 예약 행 잠금.
- 상한 축: actor/기능/일 · actor/분 · 글로벌/일(기능별+전체) · provider 예산.
- kill switch: 기능별 env(기존 MYTRIP_AI_WRITING_MODE·URL_IMPORT_MODE·
  AI_PERSONALIZATION_MODE 관례 재사용 + 일정용 신설) + 전체 = AI_MODE.
- audit ledger 필드: ts·actor해시·기능·모델·in/out tok(usageMetadata)·비용
  USD·상태(reserved/committed/released/unknown)·idempotency key — **prompt
  원문·개인정보 저장 금지**(토큰 수·해시만).
- 클라이언트 숫자 불신·서버 원자 판정·예약 실패 시 provider 미호출 원칙 고정.

## 11. 사실 / 추정 / UNKNOWN

- 사실: §2·§3 전부 코드 증거, 가격 §4 공식 문서, off 차단은 Production 실측
  (2026-09-25 릴리스: 4 route 503 `ai_unavailable_in_this_environment`).
- 추정: 토큰 환산 3 chars/tok(보수) · 대표 입출력 크기 · PG 수수료 범위.
- UNKNOWN: Google 프로젝트 tier/RPM/RPD·billing 연결 여부(Owner 콘솔) ·
  handoff 문서 소재 · 무료 제공량/크레딧 수/환불 정책 · Preview GEMINI 키가
  Production 과 동일한지(SAME/DIFFERENT 판별 불가).
