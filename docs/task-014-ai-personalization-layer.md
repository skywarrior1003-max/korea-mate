# GoKoreaMate — TASK-014: AI Personalization Layer 기획서

> 브랜드: GoKoreaMate / gokoreamate.com
> 작성일: 2026-06-17
> Task: TASK-014 — AI Personalization Layer 설계 및 구현
> 전제 조건: TASK-013 Rule-based Scheduler Engine (merged, master `5d9db29`)

---

## 1. 개요 및 비즈니스 목표

TASK-013에서 완성된 Rule-based Scheduler는 **결정론적(deterministic)** 엔진이다.
HC-1~HC-7 하드 제약과 Haversine 거리 + Zone Continuity 스코어링으로 빠르고 안정적인 일정을 생성한다.

그러나 결정론적 엔진은 두 가지 사용자 경험 문제를 해결하지 못한다:

| 문제 | 예시 |
|------|------|
| **"왜 이 장소인가?"** (추천 이유 불명) | "해동용궁사가 왜 09:30에 배치됐나요?" |
| **"마음에 안 들면?"** (대안 부재) | "사원 말고 다른 데 없나요?" |

TASK-014 **AI Personalization Layer**는 Rule-based Engine 위에 얹히는 **추론 레이어(Inference Layer)**다.
규칙 엔진이 생성한 `ScheduledDay`를 Gemini에게 넘겨 각 배치 결정에 대한 **자연어 설명**과 **대안 장소 목록**을 생성한다.

**비즈니스 목표**: "AI가 나를 위해 짜준 일정" 경험 → 사용자 신뢰도 및 재방문율 향상

---

## 2. 설계 원칙 (Non-negotiable)

```
원칙 1: Rule-based Engine은 훼손하지 않는다.
        AI는 항상 Post-processing 단계에서만 개입한다.
        runScheduler()의 출력이 AI Layer의 입력이다.

원칙 2: AI 실패 시 서비스는 중단되지 않는다.
        Fallback = rule-based 결과 그대로 반환. ai_used: false.

원칙 3: 기존 Gemini 호출 정책(2026-06-10 확정)을 100% 준수한다.
        MAX_RETRIES=2, 구조화 로그, FORCE_LIVE_API/HARNESS_SKIP_GEMINI 분기.

원칙 4: ScheduledDay.ai_used 는 AI Layer가 실제로 응답을 반환했을 때만 true.
        Mock 모드, AI 오류, Fallback 시에는 모두 false.

원칙 5: 새 npm 패키지 추가 금지. Gemini는 native fetch로 호출한다.
```

---

## 3. AI 개입 지점 분석 (Pipeline Position Mapping)

TASK-013 엔진은 5단계 파이프라인이다:

```
P1: Anchor Placer      ─┐
P2: Fixed Event Placer  ├─ Rule-based Core (TASK-013, 불변)
P3: Greedy Slot Fill    │
P4: Affiliate Inject    │
P5: Timeline Builder   ─┘
                         ↓
           ScheduledDay (ai_used: false, version: "rule-based-v1")
                         ↓
══════════════════════════════════════════════
  P6: AI Explanation Generator   ←── NEW (TASK-014)
  P7: AI Alternative Suggester   ←── NEW (TASK-014)
══════════════════════════════════════════════
                         ↓
  PersonalizedScheduledDay (ai_used: true, version: "ai-personalized-v1")
```

### 3.1 왜 Post-processing인가?

| 개입 시점 | 방식 | 채택 여부 | 이유 |
|-----------|------|-----------|------|
| **Pre-scoring** (P0) | AI가 후보 점수를 조정 후 엔진 실행 | ❌ | AI 오류 시 스케줄 자체가 생성 불가. 레이턴시 2배. |
| **In-pipeline** (P3 내부) | Greedy 루프 중 AI 호출 | ❌ | 슬롯당 1회 호출 → 최대 20회 API 콜. 비용 폭발 위험. |
| **Post-processing** (P6/P7) | 완성된 스케줄 위에 AI 레이어 적용 | ✅ | 1회 API 호출로 전체 일정 처리. Fallback이 명확. |

### 3.2 P6: AI Explanation Generator

- **입력**: `ScheduledDay` + `SchedulerInput` (사용자 컨텍스트)
- **역할**: 각 `ScheduledItem`의 배치 결정을 한국어/영어로 설명
- **출력 예시**:
  ```json
  {
    "place_id": "place-haedong-yonggungsa",
    "reason_ko": "사원(temple) 카테고리 최고 점수(79점) 후보. 부산 동쪽 Zone 3에 위치해 오전 시간대 Zone 이동 흐름에 적합. 이동 시간 30분 포함 90분 여유 슬롯에 정확히 배치.",
    "reason_en": "Highest-scored temple candidate (79pts). Located in eastern Zone 3, naturally fitting the morning zone progression. Fits the 90-min gap including 30-min travel."
  }
  ```

### 3.3 P7: AI Alternative Suggester

- **입력**: 동일 컨텍스트 + 해당 슬롯의 미배치 후보군(`remaining_candidates`)
- **역할**: "이 장소 대신" 선택 가능한 대안 2~3개 + 대안 이유 설명
- **출력 예시**:
  ```json
  {
    "place_id": "place-haedong-yonggungsa",
    "alternatives": [
      {
        "place_id": "place-beomeosa-temple",
        "reason_ko": "동일 temple 카테고리. Zone 3 내 위치. 등산로 포함으로 더 활동적인 여행자에게 적합.",
        "reason_en": "Same temple category. Within Zone 3. Includes hiking trail — better for active travelers."
      }
    ]
  }
  ```

---

## 4. 시스템 아키텍처

```
POST /api/scheduler/personalize
        │
        ▼
[1] isMockMode()? ──── true ──── [Mock Personalizer]
        │                              │
       false                    PersonalizedScheduledDay
        │                       (ai_used: false, mock)
        ▼
[2] runScheduler(input)
        │
    ScheduledDay (rule-based, ai_used: false)
        │
        ▼
[3] buildPersonalizationPrompt(day, input)
        │
    prompt: string (Gemini 입력)
        │
        ▼
[4] callGemini(prompt)  ── 실패/타임아웃 ──► [Fallback: return rule-based day]
        │
    GeminiRawResponse
        │
        ▼
[5] parseGeminiResponse(raw)  ── 파싱 실패 ──► [Fallback]
        │
    PlaceExplanation[]
        │
        ▼
[6] mergePersonalization(day, explanations)
        │
        ▼
PersonalizedScheduledDay
(ai_used: true, scheduler_version: "ai-personalized-v1")
        │
        ▼
HTTP 200 { data: PersonalizedScheduledDay }
```

---

## 5. 신규 타입 정의

```typescript
// src/lib/scheduler/ai/personalization-types.ts

// 대안 장소 (Alternative Place)
export interface AlternativePlace {
  place_id:  string;
  reason_ko: string;
  reason_en: string;
}

// 장소별 AI 설명 (Place Explanation)
export interface PlaceExplanation {
  place_id:     string;
  reason_ko:    string;
  reason_en:    string;
  alternatives: AlternativePlace[];  // 0~3개
}

// AI Personalization 결과 (PersonalizedScheduledDay)
// ScheduledDay를 확장하되 ai_used: true 강제
export interface PersonalizedScheduledDay
  extends Omit<ScheduledDay, "ai_used" | "scheduler_version"> {
  ai_used:           true;
  scheduler_version: "ai-personalized-v1";
  ai_model:          string;   // 예: "gemini-2.5-flash"
  explanations:      PlaceExplanation[];
}

// Personalizer 최종 반환 타입
export type PersonalizationResult =
  | { success: true;  data: PersonalizedScheduledDay }
  | { success: false; data: ScheduledDay; reason: string };  // fallback with rule-based
```

---

## 6. Prompt Engineering 전략

### 6.1 Prompt 구조 (Chain-of-Thought → JSON Output)

```
[System]
You are GoKoreaMate's trip personalization AI.
Analyze the rule-based schedule and explain each placement decision in Korean and English.
Return ONLY valid JSON. No markdown, no prose outside JSON.

[User]
Trip context:
- Date: {trip_date}
- City: {city_name}
- Pace: {pace} ({pace_description})
- Day window: {start_time} ~ {end_time}

Rule-based schedule ({N} items):
{scheduledDay JSON — place_id, start_time, end_time, stay_minutes, zone_id, stay_source}

Available unselected candidates:
{remaining_candidates JSON — place_id, category, score}

For each scheduled PLACE item (skip events, affiliates), produce:
1. reason_ko (2~3 sentences, Korean)
2. reason_en (2~3 sentences, English)
3. alternatives (0~2 items from unselected candidates with same or adjacent category)

Output format:
{
  "explanations": [
    {
      "place_id": "...",
      "reason_ko": "...",
      "reason_en": "...",
      "alternatives": [{ "place_id": "...", "reason_ko": "...", "reason_en": "..." }]
    }
  ]
}
```

### 6.2 설계 결정: 단일 프롬프트 vs. 장소별 호출

| 방식 | API 호출 수 | 비용 | 선택 |
|------|------------|------|------|
| **단일 프롬프트** (전체 일정 한 번에) | 1회 | 저비용 | ✅ |
| 장소별 호출 | N회 (최대 20회) | 고비용 | ❌ |

→ 단일 프롬프트, JSON 모드 (`response_mime_type: "application/json"`) 사용

### 6.3 Prompt 토큰 예산

| 컴포넌트 | 예상 토큰 |
|---------|----------|
| System prompt | ~150 |
| Trip context | ~100 |
| 10개 ScheduledItem JSON | ~500 |
| 10개 remaining candidates | ~300 |
| 지시문 | ~150 |
| **Total Input** | **~1,200 tokens** |
| **Expected Output** | **~1,500 tokens** |
| **MAX_TOKENS 설정** | **2,048** |

---

## 7. Gemini API 연동 설계

### 7.1 사용 모델 및 엔드포인트

```typescript
const GEMINI_MODEL   = "gemini-2.5-flash";
const GEMINI_API_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
```

### 7.2 요청 페이로드

```typescript
{
  contents: [{ role: "user", parts: [{ text: prompt }] }],
  systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
  generationConfig: {
    responseMimeType: "application/json",
    maxOutputTokens: 2048,
    temperature: 0.3,     // 낮은 temperature → 일관된 JSON 출력
    topP: 0.8,
  }
}
```

### 7.3 재시도 정책 (기존 Gemini 정책 준수)

```
MAX_RETRIES = 2

재시도 허용:  503 (일시적 오버로드) — 지수 백오프 (1s, 2s)
즉시 Fallback: 429 (쿼터 초과), 404 (모델 없음), 400 (잘못된 요청), 403 (인증 실패)
타임아웃:     10,000ms (10초) — 초과 시 즉시 Fallback
```

### 7.4 구조화 로그 (기존 정책 준수)

```json
// 호출 전
{"ts":"...", "requestId":"req_...", "action":"personalize-schedule",
 "model":"gemini-2.5-flash", "attempt":1, "maxAttempts":2,
 "scheduledItemCount":10, "promptLength":1247, "mockMode":false}

// 성공
{"ts":"...", "requestId":"req_...", "status":"success",
 "model":"gemini-2.5-flash", "explanationCount":8}

// Fallback
{"ts":"...", "requestId":"req_...", "status":"fallback",
 "reason":"Gemini timeout after 10000ms"}
```

---

## 8. Mock / Live 분기 전략

기존 `.env.local` 정책을 **그대로** 확장한다:

```typescript
// isMockMode() 우선순위 (기존 rule과 동일)
// 1. FORCE_LIVE_API=true  → Live
// 2. MOCK_GEMINI=1 OR HARNESS_SKIP_GEMINI=1 → Mock
// 3. NODE_ENV=development/test → Mock
// 4. 기본 → Live (프로덕션)

// TASK-014 추가 게이트 (추가 안전장치)
// GEMINI_PERSONALIZATION_ENABLED=true 가 없으면 Mock 강제
```

Mock 모드 반환:

```typescript
// Mock Personalizer가 반환하는 더미 PersonalizedScheduledDay
{
  ...ruleBasedDay,
  ai_used: true,    // Mock이지만 UI 미리보기를 위해 true
  scheduler_version: "ai-personalized-v1",
  ai_model: "mock",
  explanations: scheduledDay.items
    .filter(it => it.item_type === "place")
    .map(it => ({
      place_id: it.place_id!,
      reason_ko: "[Mock] 규칙 기반 최고 점수 후보로 선정되었습니다.",
      reason_en: "[Mock] Selected as the highest-scored rule-based candidate.",
      alternatives: [],
    }))
}
```

---

## 9. Fallback 전략 (3단계)

```
Tier 1 — AI 호출 성공, JSON 파싱 성공
         → PersonalizedScheduledDay (ai_used: true)

Tier 2 — AI 호출 성공, JSON 파싱 실패 (형식 오류)
         → 빈 explanations 배열로 부분 PersonalizedScheduledDay 반환
         → ai_used: false (파싱 실패는 AI 기여 없음으로 간주)

Tier 3 — AI 호출 실패 (네트워크, 타임아웃, 4xx/5xx)
         → runScheduler() 결과 그대로 반환 (ScheduledDay, ai_used: false)
         → HTTP 200 (클라이언트는 서비스 중단을 인식하지 못함)
```

---

## 10. API 엔드포인트 설계

### POST `/api/scheduler/personalize`

**Request body**: `SchedulerInput` (TASK-013 동일 타입)

**Response — 성공 (AI 포함)**:
```json
{
  "data": {
    "trip_date": "2026-10-04",
    "items": [...],
    "ai_used": true,
    "scheduler_version": "ai-personalized-v1",
    "ai_model": "gemini-2.5-flash",
    "generated_at": "2026-10-04T01:23:45.000Z",
    "explanations": [
      {
        "place_id": "place-haedong-yonggungsa",
        "reason_ko": "...",
        "reason_en": "...",
        "alternatives": [...]
      }
    ]
  }
}
```

**Response — Fallback (AI 실패, rule-based 반환)**:
```json
{
  "data": {
    "trip_date": "2026-10-04",
    "items": [...],
    "ai_used": false,
    "scheduler_version": "rule-based-v1",
    "generated_at": "..."
  }
}
```
→ HTTP 상태코드는 항상 **200**. 클라이언트는 `ai_used` 필드로 AI 기여 여부를 판단.

**Response — 스케줄 생성 실패 (HC 위반)**:
```json
{ "error": "...", "conflict": { "code": "HC-5", ... } }
```
→ HTTP **409** (TASK-013 동일)

---

## 11. 파일 구조 계획

```
src/lib/scheduler/ai/
├── personalization-types.ts    # AlternativePlace, PlaceExplanation, PersonalizedScheduledDay
├── prompt-builder.ts           # buildPersonalizationPrompt(day, input) → string
├── gemini-client.ts            # callGemini(prompt) → GeminiRawResponse, 재시도/로그 포함
├── response-parser.ts          # parseGeminiResponse(raw) → PlaceExplanation[]
└── personalizer.ts             # personalize(input) → PersonalizationResult (전체 오케스트레이터)

src/app/api/scheduler/personalize/
└── route.ts                    # POST /api/scheduler/personalize

docs/
└── task-014-ai-personalization-layer.md  (이 문서)
```

**총 신규 파일: 6개** (구현 Task 시)

---

## 12. 기존 엔드포인트와의 관계

| 엔드포인트 | 역할 | AI 포함 |
|-----------|------|---------|
| `POST /api/scheduler` (TASK-013) | 빠른 스케줄 생성 | ❌ (always rule-based) |
| `POST /api/scheduler/personalize` (TASK-014) | AI 설명 포함 스케줄 생성 | ✅ (with Fallback) |

→ 기존 `/api/scheduler`는 **변경하지 않는다**. 두 엔드포인트 공존.
→ 프론트엔드는 "AI 설명 보기" 토글 시 `/personalize` 호출.

---

## 13. 데이터 흐름 요약 (Sequence Diagram)

```
Client          /api/scheduler/personalize     runScheduler()    Gemini API
  │                       │                        │                 │
  │── POST (SchedulerInput) ──►                    │                 │
  │                       │── runScheduler(input) ─►                 │
  │                       │◄──── ScheduledDay ──────                 │
  │                       │── isMockMode()? ────────────────────────►│(skip if mock)
  │                       │── buildPrompt() ────────────────────────►│
  │                       │                                          │
  │                       │◄────── JSON response ────────────────────│
  │                       │── parseGeminiResponse()                  │
  │                       │── mergePersonalization()                  │
  │◄── 200 { data: PersonalizedScheduledDay } ─────                  │
```

---

## 14. 주요 제약사항 (TASK-014 범위)

```
금지 1: TASK-013 src/lib/scheduler/*.ts 파일 수정 금지
금지 2: ScheduledDay.ai_used를 true로 변경하는 로직을 엔진 내부에 추가 금지
금지 3: 새 npm 패키지 추가 금지 (Gemini는 native fetch)
금지 4: Supabase 쿼리 금지 (place_name 텍스트 직접 저장 금지)
금지 5: /api/scheduler (TASK-013 엔드포인트) 수정 금지
금지 6: GEMINI_API_KEY를 코드에 하드코딩 금지
금지 7: 재시도 정책 위반 금지 (MAX_RETRIES=2, 즉시 Fallback 조건 준수)
금지 8: gokoreamate 브랜딩 누락 금지
```

---

## 15. 작업 순서 계획 (구현 Task 승인 후)

```
Step 1.  git checkout -b feature/TASK-014-ai-personalization-layer

Step 2.  src/lib/scheduler/ai/ 디렉토리 생성

Step 3.  personalization-types.ts 작성
         (AlternativePlace, PlaceExplanation, PersonalizedScheduledDay, PersonalizationResult)

Step 4.  prompt-builder.ts 작성
         (buildPersonalizationPrompt: ScheduledDay + SchedulerInput → string)

Step 5.  gemini-client.ts 작성
         (callGemini: MAX_RETRIES=2, 구조화 로그, 타임아웃 10s, native fetch)

Step 6.  response-parser.ts 작성
         (parseGeminiResponse: JSON.parse + Zod 없이 수동 타입 가드)

Step 7.  personalizer.ts 작성
         (personalize: 전체 파이프라인 오케스트레이터, 3단계 Fallback)

Step 8.  src/app/api/scheduler/personalize/route.ts 작성
         (POST handler, isMockMode 분기, 409 conflict 전파)

Step 9.  docs/task-board.md 업데이트 (TASK-014 완료)

Step 10. node_modules/.bin/tsc --noEmit 검증

Step 11. npm run build 검증

Step 12. Selective git add (6 src 파일 + task-board.md) → commit → push → PR
```

---

## 16. 성공 지표 (Definition of Done)

- [ ] `tsc --noEmit` 오류 0개
- [ ] `npm run build` 성공, `/api/scheduler/personalize` 동적 라우트 목록에 출현
- [ ] Mock 모드에서 `POST /api/scheduler/personalize` → `ai_used: true`, `ai_model: "mock"` 반환
- [ ] `GEMINI_PERSONALIZATION_ENABLED` 미설정 시 Mock 강제 (안전장치 동작)
- [ ] HC-5 충돌 입력 → HTTP 409 반환 (rule-based 오류 전파)
- [ ] Gemini 응답 JSON 파싱 실패 시 → `ai_used: false` Fallback 반환 (HTTP 200)

---

*이 문서는 GoKoreaMate 2.0 AI Personalization Layer 구현 기획서입니다.*
*GoKoreaMate / gokoreamate.com*
