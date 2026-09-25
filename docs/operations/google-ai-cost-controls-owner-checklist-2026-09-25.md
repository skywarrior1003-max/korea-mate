# Google 측 AI 비용 상한 — Owner 확인표 (V2-AI-HARDCAP §9)

작성 2026-09-25 · 공식 문서 접근 시각 2026-09-25 (KST)

우리 서버 원장(ai_ops_ledger)·DB 스위치가 **1차 방어선**이고, Google 측 설정은
provider 계정 차원의 **백업 방어선**이다. 아래는 코드로 확인할 수 없는 항목이라
Owner 가 Google 콘솔에서 직접 확인·설정해야 한다.

## A. 확인 항목 (Owner 체크리스트)

| # | 항목 | 확인할 것 | 권고 |
|---|------|-----------|------|
| 1 | Billing project | GEMINI_API_KEY 가 속한 Google Cloud project 와 연결된 billing account 가 무엇인지, 다른 서비스와 공유하는지 | AI 전용 project 분리(예산 오염 방지) |
| 2 | 사용 Tier | AI Studio → 프로젝트 usage tier (Free / Tier 1 / 2 / 3) | 결제 계정 연결 시 자동 Tier 1 승격 — 의도치 않은 상향 여부 확인 |
| 3 | RPM·TPM·RPD 현재값 | gemini-2.5-flash 의 project 별 실제 한도 (rate limit 은 **API key 가 아니라 project 단위**) | 콘솔 표시값을 기록해 두고 서버측 featureDailyCalls 와 비교 |
| 4 | Spend cap | Tier 별 spend cap (Tier 1 = $250, Tier 2 = $2,000, Tier 3 = $20,000+) | **$250 은 Google 이 Tier 1 에 부여하는 값일 뿐 Owner 승인값이 아니다.** 서버 월 초기값($60, 미승인 기술값) 대비 훨씬 크므로 Google cap 만으로는 부족 — 서버 원장이 1차인 이유 |
| 5 | Budget(예산) 설정 | Cloud Billing budget 존재 여부·금액·threshold (기본 50%/90%/100%) | **이번 TASK 에서 Google 예산·spend cap 을 설정하지 않는다.** 실제 금액은 결제·무료 이용 원장과 초기 허용 손실액 확인 후 별도 결정(live 전환 TASK) |
| 6 | 알림 수신자 | budget email 수신자(Billing admin/project owner)·Pub/Sub 연동 여부 | Owner 본인 수신 확인(테스트 알림) |
| 7 | 자동 정지 여부 | 기본 budget 은 **알림만** 하고 지출을 멈추지 않는다 | 자동 정지가 필요하면 spend-cap budget(preview) 또는 Pub/Sub→billing 해제 자동화 — 단, 우리 1차 정지는 DB 스위치(ai_master='off')다 |
| 8 | 반영 지연 | 사용→과금 데이터 반영에 지연이 있어 budget 알림이 늦을 수 있다 | "가용액보다 낮게" 원칙으로 budget 을 상한보다 여유 있게 낮춰 설정 |

## B. 공식 문서 근거 (인용)

### 1. Rate limits — https://ai.google.dev/gemini-api/docs/rate-limits (2026-09-25 접근)
- 한도 3축: **RPM**(분당 요청)·**TPM**(분당 입력 토큰)·**RPD**(일일 요청, 태평양 시간 자정 리셋).
- "Rate limits are applied **per project**, not per API key."
- Tier 승격: Free → (billing 연결) Tier 1(spend cap $250) → ($100 지불+3일) Tier 2($2,000) → ($1,000 지불+30일) Tier 3($20,000+). 승격은 자동이다.

### 2. Budgets — https://docs.cloud.google.com/billing/docs/how-to/budgets (2026-09-25 접근)
- "Setting an alerts-only budget **doesn't automatically cap** Google Cloud … usage or spending." — 기본 budget 은 알림 전용, 지출을 멈추지 않는다.
- Threshold 기본 50%/90%/100%, actual/forecasted 기준 선택, email + Pub/Sub 알림.
- "There is a **delay** between your use of Google Cloud resources, and the usage costs reporting to Cloud Billing. To account for the delay, we recommend **setting your budget below your available funds**." — 반영 지연 존재, 상한보다 낮게 설정 권고.
- 자동 정지가 필요하면 spend-cap budget(preview, 대상 서비스 한정) 또는 Pub/Sub 기반 billing 해제 자동화가 별도로 필요하다.

### 3. 단가 — https://ai.google.dev/gemini-api/docs/pricing (2026-09-25 접근, 감사 문서 §2 동일)
- gemini-2.5-flash: **$0.30 / 1M input tok · $2.50 / 1M output tok(thinking 포함)**.

## B-2. 이 문서가 정하지 않는 것 (CORRECTION-V1 §4)

- 본 문서의 어떤 금액도 **Owner 승인 예산이 아니다**. `$250` 등 Tier cap 은 Google
  의 부여값이고, 서버 `$5/$60` 은 072 의 기술적 초기값이다.
- **이번 트랙에서 Google 예산·spend cap 을 설정하지 않는다.** Google cap 은 서버
  원장보다 높은 **2차 절대 한도**로만 쓰며, 반영 지연과 in-flight 초과 가능성이
  있어 1차 방어선이 될 수 없다.
- 실제 금액은 결제 사용자·무료 사용자 원장과 초기 허용 손실액을 확인한 뒤
  live 전환 TASK 에서 Owner 가 별도로 결정한다.

## C. 결론 (설계 반영 사항)

1. **Google 쪽 어떤 장치도 실시간·정확한 자동 정지를 보장하지 않는다** — Tier cap 은 우리 상한의 4배 이상, budget 은 알림 전용 + 반영 지연. 따라서 배포 없는 즉시 정지(ai_ops_switches)와 요청 단위 원자 예약(ai_ops_reserve)은 Google 설정으로 대체 불가.
2. Owner 가 위 표 5·6 을 설정하면 서버 원장 장애 시에도 **이중 알림**이 생긴다(권고).
3. 이 문서의 수치·정책은 Google 이 변경할 수 있다 — live 전환 직전 재확인이 §9 게이트의 일부다.
