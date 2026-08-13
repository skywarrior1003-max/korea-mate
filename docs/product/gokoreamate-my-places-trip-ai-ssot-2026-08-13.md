# gokoreamate My Places · Trip AI SSOT 결정문

- 작성일: 2026-08-13
- 목적: GPT·Claude Code·오너가 My Places, This Trip, AI Scheduler, 제목·메모 AI에 대해 같은 기준으로 작업하기 위한 단일 기준 문서
- 상태: 2026-08-13 대화에서 재검증·정정·확정한 제품/기술 방향
- 중요: 이 문서는 과거 설계안, 감사 제안, 현재 코드 구현을 구분한다. 과거 문서와 충돌하면 아래의 오너 확정 결정을 제품 방향 SSOT로 우선한다. 현재 코드 사실은 별도로 존중하며, 변경이 필요하면 별도 TASK로 검증 후 수행한다.

> **개정 이력**
> **rev.2 (2026-08-13, TASK-SCHEDULER-SSOT-REAUDIT-AND-DOC-SYNC-01)** — 코드 읽기 전용 재감사 후 정정.
> ① §0·§3-1·§11·§16의 "This Trip이 스케줄러의 **유일한 입력**"이라는 문언을 정정했다. This Trip은 **사용자 선택 입력이자 최우선 배치 대상**이며, 실제 빈 시간은 검증된 일반 관광 후보 풀로 보완할 수 있다. 초판 문언은 §3-4의 "부족한 일정 보완"과 서로 모순이었다.
> ② 고정 일정(§3-7)과 This Trip 과다 처리(§3-8)를 신규 명시했다.
> ③ GPS context V1 범위 제한(§9-1)을 신규 명시했다. 전국 reverse-geocoding을 새로 만들지 않는다.
> ④ 코드 재감사 결과를 §17에 **제품 결정과 분리해** 기록했다. **§17은 현재 사실이지 목표가 아니다. §17을 근거로 위의 제품 결정을 약화시키지 않는다.**
> **rev.3 (2026-08-13, TASK-SCHEDULER-PREVIOUS-PLACE-AND-FIXED-EGRESS-01)** — §3-7에 Invariant 1(직전 장소)·Invariant 2(고정 앞 이동시간)를 명시하고 엔진에 구현했다. 구현 내역은 §17-10.
> **rev.4 (2026-08-13, TASK-SCHEDULER-GENERAL-INSERTION-FEASIBILITY-01)** — Invariant 2 를 고정 항목 전용에서 **모든 다음 배치 항목**으로 확장하고, 다음 항목의 위치를 알 수 없을 때의 fail-closed 정책을 명시했다. 일반 항목 앞 중간 삽입에서 순간이동 일정이 실제로 재현됐다(§17-11).

---

## 0. 절대 혼동하지 말아야 할 기본 흐름

### 장소 발견/보관/일정 입력

```text
Explore
  ↓ 일반 하트/저장
Saved
  ↓ 사용자가 이번 여행에 쓰겠다고 명시적으로 선택
This Trip
  ↓
자동/AI Scheduler
  ↓
My Trip
  ↓
사용자가 직접 넣기 / 빼기 / 이동 / 수정
```

개인 장소는 다음 흐름이다.

```text
My Places
  ↓ 사용자가 이번 여행에 쓰겠다고 명시적으로 선택
This Trip
  ↓
자동/AI Scheduler
  ↓
My Trip
```

### 각 영역의 목적

- `Explore`: 장소 발견
- `Saved`: 북마크/나중에 볼 장소 보관
- `My Places`: 사용자가 직접 만든 개인 장소 보관
- `This Trip`: 사용자가 이번 여행에 쓰기로 명시적으로 선택한 집합. **스케줄러의 사용자 선택 입력이자 최우선 배치 대상**
- `My Trip`: 생성된 실제 일정 + 사용자가 직접 편집하는 결과물

`Saved`와 `My Places`는 스케줄러 입력 풀 자체가 아니다. 어떤 장소든 사용자가 `This Trip`에 넣은 뒤에만 **사용자 선택 장소**가 된다.

단, This Trip 장소를 모두 배치한 뒤 실제로 빈 시간이 남으면 스케줄러/AI는 **검증된 일반 관광 후보 풀**로 그 시간을 보완할 수 있다(§3-1-A). 보완 후보 풀은 `Saved`도 `My Places`도 아니다.

---

## 1. `off | mock | live`의 의미와 상태

### 오너 확정 결정

`off | mock | live`는 현재 My Places AI의 기술적 control contract로 이해한다. 이것을 사용자-facing 제품 개념이나 영구 제품정책으로 확대 해석하지 않는다.

현재 My Places 구현 변수는 `MY_PLACES_AI_MODE`이며, 기존 Trip AI의 `AI_PERSONALIZATION_MODE`와 분리한다.

### 현재 구현 사실

- `MY_PLACES_AI_MODE = off | mock | live`
- Production 기본 상태는 `off`
- 현재 `live`는 실제 provider에 연결되어 있지 않음
- My Places AI와 Trip Scheduler AI는 서로 다른 기능이므로 환경변수를 공유하지 않는 것이 맞음

### 의미

- `off`: My Places AI enrichment 비활성
- `mock`: 개발/자동 QA용 가짜 provider
- `live`: 실제 AI provider를 연결하는 운영 모드 개념

`off | mock | live`가 과거 Trip AI의 패턴에서 영향을 받은 것은 사실이지만, 현재 My Places에서 독립된 control로 구현되어 있다는 사실과 제품 최종 방향을 혼동하지 않는다.

---

## 2. `mock`의 정확한 역할

### 오너 확정 결정

`mock`은 개발 및 자동 QA 전용이다.

Production 사용자에게 mock이 생성한 고정/가짜 결과를 실제 AI가 사진이나 여행 상황을 분석해서 만든 결과처럼 보여주면 안 된다.

### 반드시 구분할 것

```text
MOCK
= 개발/테스트 장치

STYLE / PHRASE LIBRARY
= 실제 서비스에서 사용자 반응을 통해 발전시키는 제품 자산
```

이 둘은 완전히 다른 개념이다.

### 권장 운영 원칙

- Local/QA: `off`, `mock`, 필요 시 통제된 `live`
- Production: 기본 `off`, 검증 후 실제 `live`
- Production에서 `mock` 결과가 사용자에게 노출되는 경로는 허용하지 않는 방향

---

## 3. `This Trip` · Scheduler · `AI_PERSONALIZATION_MODE`

### 3-1. Scheduler 입력 SSOT

`This Trip` = 사용자가 이번 여행에 사용하기로 **명시적으로 선택한 장소 집합**이며 **최우선 배치 대상**이다.

다음은 자동 스케줄 대상이 아니다.

- `Saved`에만 있는 장소
- `My Places`에만 있는 장소
- Explore에서 발견했지만 This Trip에 넣지 않은 장소

`Saved` 전체 / `My Places` 전체를 자동 스케줄러 후보로 사용하는 것을 **금지**한다.
장소의 원래 출처가 무엇이든 사용자가 This Trip에 넣은 뒤에는 이번 여행의 직접 입력이 된다.

> **rev.2 정정** — 초판은 "오직 This Trip 장소만 대상으로 한다"였다. 이 문언은 §3-4의 "부족한 일정 보완"과 모순이었고, 실제 제품 의도는 **"사용자가 고르지 않은 장소가 사용자 선택 장소를 밀어내지 않는다"**이지 "추천 보완 자체를 하지 않는다"가 아니다. §3-1-A로 정정한다.

### 3-1-A. 부족한 일정 보완

This Trip 장소를 현실적으로 배치한 뒤 **실제 빈 시간이 있으면** 스케줄러/AI는 검증된 일반 관광 후보 풀로 보완할 수 있다.

조건:

- This Trip 장소를 일반 추천과 **동급으로 경쟁시키지 않는다**
- **사용자 선택 장소가 우선**이다
- 보완 후보는 취향 · 여행 목적 · 거리 · zone/area · 운영시간 · pace · 동선 등 최적화 조건을 반영한다
- `Saved`나 `My Places` **전체를 보완 후보 풀처럼 사용하지 않는다**

따라서 후보 풀이 `This Trip + 일반 추천 후보`로 구성되어 있다는 사실 자체는 결함이 아니다. **판정 기준은 구조가 아니라 실제 배치 우선순위와 사용 조건이다.**

### 3-2. Explore 저장 흐름

일반적인 Explore 하트/저장 액션은 `Saved`로 간다.

```text
Explore → Saved → This Trip → Scheduler → My Trip
```

`Explore → This Trip`을 기본 흐름으로 설명하지 않는다. 향후 별도의 명시적 `Add to This Trip` 액션을 설계하는 경우에만 별도 제품 결정으로 취급한다.

### 3-3. My Places 흐름

```text
My Places → This Trip → Scheduler → My Trip
```

My Places에 존재한다는 사실만으로 자동 스케줄 대상이 되지 않는다.

### 3-4. 규칙 엔진과 AI는 하나의 일정 생성 과정에서 함께 작동

규칙 엔진과 AI를 서로 독립된 두 개의 일정 생성기로 이해하지 않는다.

하나의 일정 생성 과정에서 다음 두 종류의 판단이 함께 반영된다.

**현실성/하드 제약 계층**

- 거리
- zone/area
- 도착/출발 시간
- fixed events
- pace
- 영업/방문 가능 조건
- 중복/불가능 동선 방지

**AI 판단 계층**

- 사용자 취향
- 여행 조건
- 비슷한 후보 중 우선순위
- 부족한 일정 보완
- 여행 맥락에 맞는 선택

AI는 현실성 규칙을 깨고 일정을 임의 재작성하는 독재자가 아니다. 반대로 AI가 단순 설명만 붙이는 장식도 아니다. 하드 제약 안에서 실제 후보 선택·취향·보완에 영향을 주는 역할이다.

### 3-5. `AI_PERSONALIZATION_MODE`

`AI_PERSONALIZATION_MODE`는 기존 Trip Scheduler AI 개인화 신호를 켜고 끄는 변수로 이해한다.

이 변수는:

- This Trip 참여 여부를 결정하는 스위치가 아님
- My Place의 zone/district 참여 여부를 결정하는 스위치가 아님
- My Places 제목·메모 AI의 변수도 아님

즉 기본 Scheduler는 AI가 꺼져도 현실성 규칙으로 동작할 수 있어야 하고, AI가 켜지면 그 일정 생성 과정 안에 개인화 신호가 추가되는 구조다.

### 3-6. My Trip 편집권

자동/AI 일정 생성 후에도 사용자는 My Trip에서 장소를:

- 넣기
- 빼기
- 다른 날로 이동
- 순서 변경
- 직접 수정

할 수 있어야 한다.

### 3-7. 고정 일정 (hard constraint)

This Trip 장소에는 필요 시 **고정 날짜·시간·장소 조건**을 지정할 수 있어야 한다.

예: 친구 약속 · 출장/회의 · BTS 등 공연 · 예약 · 교통 · 그 밖에 반드시 지켜야 하는 일정.

이 조건은 **hard constraint**이며 AI/Scheduler가 임의로 이동하거나 침범하면 안 된다.
취향 보정·거리 최적화·식사 보장 등 어떤 소프트 규칙도 고정 일정을 밀어낼 수 없다.

#### Invariant 1 — 직전 장소

> Scheduler의 "직전 장소"는 하루 전체에서 가장 늦은 item이 아니라 **현재 gap 직전의 시간축상 가장 가까운 실제 item**이다. 미래 anchor/fixed item은 current gap의 previous place로 취급하지 않는다.

이동시간·거리 페널티·zone 판단이 모두 이 하나의 기준점을 쓴다.

#### Invariant 2 — 다음 일정까지의 물리적 타당성 (Insertion Egress Feasibility)

> 이미 배치된 두 일정 사이에 새로운 장소를 자동 삽입하려면 **이전 장소에서 후보까지의 이동, 후보의 체류, 후보에서 다음 배치 장소까지의 이동**이 실제 시간축 안에서 모두 가능해야 한다.

후보의 체류 종료시각과 다음 일정 시작시각이 같다는 이유만으로 배치해서는 안 된다.
**fixed든 일반이든 구분하지 않는다** — 사람은 우선순위가 높다고 순간이동하지 못한다.
이 계약은 supplemental 추천과 This Trip 장소에 **동일하게** 적용된다.

> 다음 배치 장소는 있으나 위치를 확인할 수 없어 이동 가능성을 검증할 수 없는 경우, Scheduler는 가짜 이동시간을 추정하지 않고 **해당 중간 gap에 자동 삽입하지 않는다**(fail-closed).

예외는 하나다 — 다음 배치 항목이 **아예 없는** 하루 마지막 자리는 진입 이동과 체류만 본다.

> Invariant 1과 Invariant 2의 fixed 부분은 `TASK-SCHEDULER-PREVIOUS-PLACE-AND-FIXED-EGRESS-01`에서, Invariant 2의 일반 항목 확장과 fail-closed 정책은 `TASK-SCHEDULER-GENERAL-INSERTION-FEASIBILITY-01`에서 구현·검증되었다. 구현 상태는 §17-4·§17-10 참조. **This Trip 장소에 날짜·시간을 지정하는 입력 경로는 여전히 없다.**

### 3-8. This Trip 과다

물리적으로 모두 배치할 수 없는 경우:

- **임의 삭제/누락 금지**
- 가능한 배치를 계산한다
- **미배치 장소와 충돌 원인을 사용자에게 알려야 한다**
- 사용자가 우선순위를 선택한 뒤 재계산하는 방향

My Trip 생성 후에는 사용자가 장소를 넣기/빼기/이동/수정할 수 있어야 한다(§3-6).

> 현재 구현 수준은 §17-5 참조. 조용히 삭제하지는 않지만 **전 일정 미배치 사유를 알리는 경로가 없다.**

---

## 4. `name/note`와 `display_title/display_memo`

### 오너 확정 결정

My Place에는 사실/공개 레이어와 개인 기억 레이어를 분리한다.

| 필드 | 의미 |
|---|---|
| `name` | 사실/공개 workflow용 이름 |
| `note` | 공개 workflow에 연결되는 설명/메모 |
| `display_title` | 사용자 개인 전용 제목 |
| `display_memo` | 사용자 개인 전용 기록 |

### AI가 다루는 대상

제목·메모 AI는 기본적으로 개인 기억 레이어인:

- `display_title`
- `display_memo`

를 보조한다.

AI가 장소의 객관적 사실이나 공개 설명을 임의로 창작해 `name`/`note`를 덮어쓰는 방향으로 가면 안 된다.

### 사용자 값 보호

자동 enrichment는 사용자가 이미 작성/수정한 개인 제목·메모를 조용히 덮어쓰면 안 된다.

향후 재제안 기능을 만들더라도:

- 기존 사용자 값 유지
- 새 제안을 별도 후보로 제시
- 사용자 명시적 선택 후 반영

방향이 맞다.

---

## 5. `POST /api/user-spots/[id]/enrich`와 저장 분리

### 오너 확정 결정

My Place 저장과 AI enrichment는 분리한다.

```text
My Place 저장
  ↓ 성공
AI enrichment
  ↓ 성공/실패와 무관하게 My Place 유지
```

AI provider 장애, timeout, 출력 오류 때문에 이미 저장된 My Place를 rollback하면 안 된다.

### 현재 구현

현재 enrichment action endpoint는:

```text
POST /api/user-spots/[id]/enrich
```

이다.

과거 감사에서 PATCH가 제안된 적이 있어도 현재 endpoint는 "필드 값을 직접 지정하는 수정"보다 "enrichment 작업을 실행하는 command/action" 성격이므로 POST를 유지해도 기술적으로 자연스럽다.

HTTP 동사를 과거 제안에 맞추기 위해 불필요하게 변경하지 않는다. 중요한 계약은 다음이다.

- 사용자 작성값 보호
- AI 실패가 저장 rollback을 일으키지 않음
- 불필요한 AI 호출 방지
- 개인정보 최소전송

---

## 6. Rate/Cost Guard와 Live Canary

### 오너 확정 원칙

실제 AI를 전체 사용자에게 광범위하게 켜기 전에 rate/cost guard와 통제된 live canary가 필요하다.

다만 정확한 제한 수치, 예산, 사용자당 호출량, canary 범위, 다음 TASK 실행 여부는 별도 설계·승인을 거친다. 현재 문서에 임의 숫자를 확정하지 않는다.

### Rate Guard 목적

- 중복 클릭/더블탭으로 AI 중복 호출 방지
- 같은 사용자/장소에서 과도한 반복 요청 제한
- 버그나 악성 반복 호출이 비용으로 직결되지 않도록 방어

### Cost Guard 목적

- 기능별 AI 사용량 파악
- 일정 수준 이상 비용이 발생하지 않도록 방어
- 실제 사용자 증가에 따라 비용이 예측 가능하도록 유지

### Live Canary 목적

실제 provider를 붙인 뒤 곧바로 전체 Production 사용자에게 열지 않는다.

통제된 실제 요청으로 다음을 확인한다.

- 출력 품질
- latency
- 오류율
- 실제 비용
- 개인정보 전달 범위
- DB write 안전성
- fallback 동작

---

## 7. AI Provider 정책

### 오너 확정 결정

My Places 제목·메모 AI provider는 아직 미확정이다.

현재 foundation의 provider-neutral 구조를 유지한다.

기존 Trip Scheduler에 Gemini 사용 경험이 있다는 이유만으로 My Places/Memory 제목·메모 AI도 Gemini로 고정하지 않는다.

### 초기 canary

초기 canary는 문제 원인을 명확히 보기 위해:

- 한 provider
- 한 모델
- 제한된 실제 요청

으로 시작할 수 있다.

이것은 영구 provider lock-in을 의미하지 않는다.

### provider 평가 기준

- 사진/멀티모달 이해 품질
- 장소/여행 맥락 이해
- 짧은 제목·메모의 자연스러움
- EN/JA/ZH/KO 품질
- 비용
- latency
- 구조화 응답 안정성
- 개인정보/데이터 처리 정책
- provider 교체 가능성

---

## 8. 제목·메모 AI + 진화형 스타일/문구 라이브러리

### 오너 확정 최종 방향

처음부터 GPT/AI에게 50~100개의 제목·메모 문구를 한 번에 만들어 DB에 넣지 않는다.

그렇게 하면 실제 사용자의 취향이 반영되지 않은 비슷하고 식상한 문구가 대량 생성될 가능성이 높다.

### 초기 서비스

초기에는 실제 AI가 다음 맥락을 활용해 개인 제목·메모를 제안하는 방향이다.

- 사용자 사진
- GPS에서 해석한 위치 맥락
- 시간/시간대
- 장소
- This Trip/My Trip 맥락
- 여행 날짜/Day 맥락
- 향후 필요한 사용자 여행 context

사용자는 제안을:

- 그대로 사용
- 일부 수정
- 크게 수정
- 거절
- 필요 시 다시 요청

할 수 있다.

### 실제 사용과 함께 라이브러리 성장

실제 사용자 행동을 통해 좋은 표현과 스타일을 점진적으로 선별한다.

```text
AI 제안
  ↓
사용자 채택 / 수정 / 거절
  ↓
좋은 표현·스타일의 실제 사용 신호
  ↓
상황별 분류·선별
  ↓
작은 활성 스타일/문구 라이브러리로 축적
```

### 50~100개의 정확한 의미

`50~100개`는 초기 seed를 한 번에 만드는 숫자가 아니다.

실제 사용을 거치면서 상황별로 살아남은 좋은 제목·메모/스타일을 관리하는 작고 관리 가능한 활성 라이브러리 규모의 개념이다.

정확한 최종 개수는 실제 사용 데이터를 보고 조정한다.

### 장기 목표

라이브러리가 충분히 성장하면 비슷한 상황에서는 기존 좋은 표현/스타일을 활용해 AI 호출을 줄인다.

```text
사용자 상황
  ↓
기존 라이브러리에 충분히 좋은 후보가 있는가?
  ├─ YES → 라이브러리 활용
  └─ NO  → 실제 AI 호출
```

AI는 시간이 지나도 완전히 없어지는 것이 아니라:

- 새로운 상황
- 시대감
- 유머 코드
- 최신 표현
- 새로운 여행 유형

을 계속 보충하는 역할을 한다.

목표는 비용 감소 + 촌스럽지 않은 표현 + 시간이 흐를수록 나아지는 gokoreamate 고유의 표현 자산이다.

### 적용 범위 방향

이 철학은 My Places에만 한정하지 않고 향후:

- My Place
- My Trip의 사진/추억
- Trip Moment
- Memory
- Story

등 개인 여행 기억 표현 계층에 공통적으로 확장 가능한 방향으로 본다.

---

## 9. GPS 저장·사용·AI 전달 정책

### 오너 확정 결정

gokoreamate 내부에는 My Place의 정확한 GPS를 저장·보유해야 한다.

정확한 좌표는 핵심 제품 기능에 필요하다.

### 내부 사용

- 지도 표시
- 길찾기/안내 연결
- This Trip Scheduler 동선 계산
- 거리 계산
- 주변 장소 탐색
- zone/area 판단
- canonical/주변 지역 해석

### 외부 AI provider 전달

정확한 GPS를 gokoreamate 내부에서 보유하는 것과 raw GPS를 외부 AI provider에 전달하는 것은 다른 문제다.

기본 원칙은:

```text
정확한 GPS
  ↓ gokoreamate 내부
장소/지역/시간/여행 맥락으로 해석
  ↓
AI에는 의미 있는 context 전달
```

예:

```text
35.xxxxxx, 129.xxxxxx
  ↓ 내부 해석
Gwangalli / Busan / late evening / beach area
  ↓
AI 제목·메모 context
```

AI에게 raw lat/lng를 직접 넘기는 것을 기본값으로 삼지 않는다. 향후 특별히 제품상 꼭 필요한 이유가 검증되기 전까지 최소전송 원칙을 유지한다.

### 9-1. context builder V1 범위 (과개발 금지)

위의 `Gwangalli / Busan / late evening / beach area` 예시는 **최종 지향점이지 V1 구현 명세가 아니다.**

**V1에서 전국 reverse-geocoding 시스템을 새로 만들지 않는다.**

V1은 이미 존재하는 정보만 사용한다.

- related canonical place (`city_spots`의 name·city·category·subcategory·district)
- Trip city
- 이미 존재하는 area/zone/district 값
- 시간대
- Trip context

실제 AI 품질 부족이 **확인된 뒤에만** 위치 해석 기능을 확대한다.

> 주의: `assignZoneId()`의 `zone_id`는 **기준점으로부터의 거리 등급(1~3)이지 지역명이 아니다.** 이것을 area 명칭으로 AI에 넘기지 않는다. 현재 재사용 가능한 요소는 §17-6 참조.

### 외부 공유물

SNS, OG 이미지, 이메일, 외부 공유 카드 등 gokoreamate 밖으로 나가는 콘텐츠에는 다음을 노출하지 않는다.

- raw GPS
- 상세 주소
- 직접 지도 링크
- 실제 이동 경로

반면 gokoreamate 내부의 Private My Place 및 승인된 내부 Traveler Place는 실제 여행/길찾기에 필요한 정확한 위치를 사용할 수 있다.

---

## 10. 사진 AI · Timeout · Retry

### 10-1. 사진 AI

**현재 구현 사실**

현재 My Places AI foundation은 private photo를 외부 AI provider에 보내지 않도록 차단되어 있다.

이는 최종적으로 사진 AI를 포기했다는 의미가 아니라, 실제 provider와 개인정보 범위를 확정하기 전 안전하게 멈춘 foundation으로 본다.

**오너 확정 제품 방향**

장기적으로 사진은 제목·메모 AI의 중요한 입력이 될 수 있어야 한다.

특히 My Place/Trip Memory에서 사용자의 실제 사진을 이해하면 장소명만으로는 만들기 어려운 개인적인 제목·메모를 제안할 수 있다.

**활성화 원칙**

- 사진이 있다고 무조건 외부 AI에 전송하지 않음
- AI 제목·메모 기능을 사용하는 맥락에서 필요한 경우에만 분석
- 외부 provider 전송에 대한 적절한 고지/동의와 개인정보 설계 필요
- 필요한 최소 데이터만 전송
- AI 실패가 사진/장소/Memory 저장 실패로 이어지지 않음

### 10-2. Timeout

AI 호출에는 timeout이 필요하다.

하지만 `8초` 같은 특정 숫자를 영구 제품정책으로 확정하지 않는다.

실제 provider/model, 텍스트-only인지 이미지 분석인지, canary latency 등을 보고 합리적인 값을 정한다.

### 10-3. Retry

초기 live 단계에서는 자동 retry 0을 안전한 기본값으로 한다.

이유:

- 사용자는 1회 요청했는데 비용이 2~3배 발생하는 것을 방지
- provider 장애 시 호출 폭증 방지
- 중복 비용 억제

초기에는 자동 retry보다 사용자 주도 재요청을 우선한다.

향후 실제 운영 데이터를 본 뒤 특정 transient error에 대해 제한된 1회 retry가 유리한지 별도로 판단할 수 있다.

---

## 11. 1~10을 하나의 제품 흐름으로 연결

```text
[장소 발견]
Explore → Saved
My Places
      ↓ 사용자가 명시적으로 선택
[This Trip]
자동/AI Scheduler의 사용자 선택 입력 · 최우선 배치
      ↓
현실성 규칙 + AI 개인화 판단을 함께 반영
빈 시간이 남으면 검증된 일반 관광 후보로 보완 (Saved·My Places 아님)
      ↓
[My Trip]
사용자가 자유롭게 수정
      ↓
실제 여행
      ↓
사진 / 위치 / 시간 / 장소 / 여행 맥락
      ↓
[개인 제목·메모 시스템]
      ↓
내부 context builder
- 정확한 GPS는 내부 보유
- 위치/시간을 의미 있는 context로 변환
- 기존 스타일 라이브러리 확인
      ↓
기존 좋은 후보로 충분한가?
  ├─ YES → 라이브러리 활용
  └─ NO  → 실제 AI 필요
              ↓
        필요 시 사진 분석
              ↓
        rate/cost guard
        timeout
        초기 retry 0
              ↓
        AI 제목·메모 제안
              ↓
사용자 채택 / 수정 / 거절
              ↓
좋은 스타일을 점진 축적
              ↓
시간이 흐를수록
AI 호출비용 감소 + 표현 품질 향상
```

---

## 12. 현재 구현과 최종 방향을 반드시 구분

### 현재 구현 사실

- master 직전 기준: `a9014c6`
- My Places AI enrichment foundation 구현
- Production AI는 off
- 실제 provider 미연결
- `MY_PLACES_AI_MODE` 존재
- `POST /api/user-spots/[id]/enrich` 존재
- `display_title`, `display_memo` 존재
- raw lat/lng, private photo path, device id가 현재 provider context에 없음
- AI 실패가 저장된 My Place를 rollback하지 않음

### 아직 구현 완료라고 보면 안 되는 최종 제품 방향

- 실제 사진 기반 AI 제목·메모
- 실제 GPS/시간/Trip context의 안전한 context builder
- 사용자 채택/수정/거절을 활용한 스타일 라이브러리 성장
- library-first / AI-when-needed 하이브리드 비용 구조
- 최종 provider 선정
- 최종 rate/cost limit
- 실제 canary 범위
- 사진 외부 AI 분석 고지/동의 정책

현재 foundation이 이 최종 방향을 방해하지 않도록 후속 작업을 설계한다.

---

## 13. Claude Code가 앞으로 절대 혼동하면 안 되는 사항

1. **Saved/My Places 전체를 자동으로 읽어 Scheduler 후보화하지 않는다.** This Trip은 사용자 선택 입력이자 최우선 배치 대상이다. 단 실제 빈 시간을 검증된 일반 관광 후보로 보완하는 것은 허용된다(§3-1-A) — 이것을 "This Trip only 위반"으로 오판하지 않는다.
2. Explore 일반 save/heart는 Saved로 간다. 기본 `Explore → This Trip` 흐름을 새로 만들지 않는다.
3. My Places는 사용자 개인 장소 저장소이며, This Trip에 명시적으로 추가된 My Place만 스케줄 대상이다.
4. 규칙 Scheduler와 AI를 별도 두 일정 생성기로 만들지 않는다. 하나의 스케줄링 과정 안에서 하드 제약과 AI 판단이 함께 작동한다.
5. `AI_PERSONALIZATION_MODE`와 `MY_PLACES_AI_MODE`를 혼동하거나 결합하지 않는다.
6. `mock`을 Production 사용자-facing AI 콘텐츠로 사용하지 않는다.
7. `display_title/display_memo`와 `name/note`를 혼동하지 않는다.
8. AI 실패로 이미 생성된 My Place/Memory를 삭제하거나 rollback하지 않는다.
9. 처음부터 50~100개 AI 문구를 일괄 생성해 seed DB를 채우지 않는다.
10. 실제 사용자 채택/수정/거절을 거치며 좋은 표현을 점진 축적하는 방향을 보존한다.
11. 정확한 GPS는 gokoreamate 내부에 유지한다. raw GPS를 없애거나 흐리게 저장하지 않는다.
12. 외부 AI에는 raw GPS를 기본적으로 직접 보내지 말고 의미 있는 context로 변환하는 방향을 우선한다.
13. private photo의 외부 AI 분석은 현재 자동 허용된 상태가 아니다. 별도 privacy/동의 설계 전 임의 활성화 금지.
14. 기존 Trip Scheduler가 Gemini를 사용했다는 이유만으로 My Places provider를 Gemini로 고정하지 않는다.
15. 과거 감사보고서의 제안과 현재 오너 확정 제품방향이 충돌하면 코드부터 수정하지 말고 충돌을 보고한다.
16. 고정 일정(§3-7)은 hard constraint다. 어떤 소프트 규칙도 이것을 밀어낼 수 없다.
17. This Trip 과다 시 조용히 누락하지 않는다(§3-8). 미배치와 사유를 사용자에게 알린다.
18. GPS context V1에서 **전국 reverse-geocoding을 새로 만들지 않는다**(§9-1). 기존 정보만 재사용한다.
19. `zone_id`는 거리 등급이지 지역명이 아니다. area 명칭으로 AI에 넘기지 않는다.

---

## 14. 다음 작업을 설계할 때의 검증 질문

후속 TASK를 작성하기 전에 다음을 먼저 확인한다.

- 이 작업이 This Trip only 계약을 깨지 않는가?
- Saved와 My Places 목적을 섞고 있지 않은가?
- 현재 구현 사실을 과거 제품 결정으로 잘못 승격하고 있지 않은가?
- 과거 Opus/GPT 제안을 오너 최종결정처럼 취급하고 있지 않은가?
- AI가 사용자 값이나 공개 사실 데이터를 덮어쓰지 않는가?
- AI 호출이 실패해도 핵심 사용자 행동이 완료되는가?
- 실제 AI 비용을 불필요하게 증가시키지 않는가?
- 장기적인 스타일 라이브러리 전략을 막는 구조가 아닌가?
- 정확한 GPS의 내부 제품가치는 유지되는가?
- 외부 provider로 보내는 개인정보는 최소화되는가?
- Production에 fake/mock 콘텐츠가 노출될 가능성이 없는가?

---

## 15. Claude Code 전달용 지시

이 문서를 Claude Code에 전달할 때 다음 기준으로 사용한다.

> 이 문서를 2026-08-13 기준 gokoreamate My Places · This Trip · Trip Scheduler · 제목/메모 AI의 오너 확정 SSOT로 읽어라. 저장소의 현재 구현 사실과 이 문서의 제품 방향을 구분하라. 과거 문서, 감사보고서, 기존 코드와 충돌이 있더라도 임의로 수정하지 말고 먼저 `CURRENT IMPLEMENTATION / SSOT DECISION / CONFLICT / RECOMMENDATION` 형식으로 읽기 전용 충돌 보고를 하라. 사용자의 명시적 TASK 승인 전에는 재설계·migration·운영 DB 변경·provider 연결·환경변수 변경·Production AI 활성화를 하지 마라. 특히 This Trip 최우선 배치와 Saved/My Places 자동 후보화 금지(추천 보완은 §3-1-A 조건 아래 허용), 고정 일정 hard constraint, 과다 시 미배치 고지, mock Production 금지, 정확한 GPS 내부 보유, raw GPS 외부 AI 최소전송, 진화형 제목·메모 스타일 라이브러리 방향을 변경하지 마라.

---

## 16. 한 줄 SSOT

> gokoreamate는 사용자가 직접 `This Trip`에 넣은 장소를 **최우선**으로 두고 현실성 규칙과 AI 판단을 함께 사용해 일정을 만들되 남는 시간은 검증된 추천으로 보완하고, 여행 중 사진·위치·시간·맥락을 바탕으로 개인 제목·메모를 보조하되 실제 사용자 반응으로 좋은 표현을 점진 축적하여 시간이 갈수록 AI 호출비용은 줄이고 표현 품질은 높이는 참여형 여행 플랫폼을 지향한다.

---

**아래 §17은 §1~§16의 제품 결정과 별개다. 현재 코드가 이렇다는 사실 기록이며, 이것을 근거로 위의 결정을 약화시키지 않는다.**

---

## 17. 부록 — 2026-08-13 코드 재감사 결과 (현재 구현 사실)

읽기 전용 감사. 기준 커밋 `a9014c6`. 코드는 변경하지 않았다.

### 17-1. 후보 구조와 우선순위

| 구분 | 출처 | 스케줄러 반영 |
|---|---|---|
| **This Trip** | `getCart()` → `cartHints` → `cart_coord_hints` | `cartCandidates`, **score 999**, `category:"event"` 고정 |
| **보완 추천** | `city_spots` → NearMe → `adaptToSchedulerCandidates` | `dedupedBaseCandidates`, score **최대 195** (F1 100 + F4 20 + F5 50 + F6 25) |
| **Saved** | `getSavedSpotsData()` (localStorage) | **후보 아님.** `liked_place_ids` → NearMe 스코어러의 취향 신호로만 사용 |
| **My Places** | — | **후보 아님.** 스케줄러 코드에 `user_spot` 참조 0건. This Trip에 담겼을 때만 cart 경로로 진입 |

**일반 추천이 This Trip을 밀어낼 수 없음 — 수치로 확인:**
`adjusted_score = score + zoneBonus − consecutiveDistancePenalty + profileBias`
- This Trip 최악: `999 − 90(최대 거리 페널티) − 10(zone 역행) − 30(profileBias 하한) = 869`
- 일반 추천 최선: `195 + 15(zone 동일) + 30(profileBias 상한) = 240`

**869 > 240.** 어떤 조합으로도 역전이 불가능하다. `engine.ts:46`의 기존 주석(909 vs 205)은 profileBias 도입 전 수치이나 결론은 동일하다.

식사 보장 로직도 This Trip을 밀어내지 않는다 — `engine.ts:205`가 최상위 후보가 사용자 선택이면 대체 풀 자체를 만들지 않고, `mealPicks` 필터도 `!isUserSelected`를 건다(`engine.ts:217`).

**판정: §3-1 / §3-1-A 준수.** `cartCandidates + baseCandidates` 구조는 결함이 아니다.

### 17-2. Saved 취급

`itinerary/page.tsx:474` 주석 그대로다 — "Saved(하트)는 취향 신호다. cart로 승격하지 않는다 — 일정에 강제로 넣지 않는다."
`mergePreferenceIds(liked_place_ids, cartPreferenceIds)` → NearMe 스코어러의 liked 카테고리 신호. `preferred_items`에는 **cart만** 들어간다(`plan.ts:449`)이므로 Saved가 `isUserSelected()`로 승격되지 않는다.

**판정: 준수.**

### 17-3. This Trip의 `user_spot`

`getPlannerHintKey()`가 city_spot은 순수 숫자로, 그 밖의 소스는 sourceKey 원문으로 보낸다. user_spot은 어떤 DB 후보와도 매칭되지 않아 dedupe 대상이 아니며 score 999 후보로 정상 진입한다.

**판정: 준수.**

### 17-4. 고정 일정 (§3-7)

- 엔진: `placeAnchors`(P1) · `placeFixedEvents`(P2)가 greedy **이전에** 배치하고 `is_fixed: true`를 단다. 능력 있음
- API: `anchors` · `fixed_events`를 body에서 받는다(`plan.ts:458-459`)
- **입력 경로 없음**: `src/app/itinerary/page.tsx`는 `anchors`도 `fixed_events`도 **보내지 않는다**
- This Trip 장소가 가진 시간 조건은 `preferred_time_slot`(morning/afternoon/evening) 하나뿐이고 **soft**다. `cartFallbackMode`에서는 이 검사를 통째로 건너뛴다(`engine.ts:161`)

**판정: 미구현.** 엔진 능력은 있고 UI·전달 경로가 없다. `picks-trip-memory-lifecycle-decision-v1.md` §5-1이 이미 "날짜·시간 지정 UI 형태 미확정"으로 기록하고 있다.

### 17-5. This Trip 과다·부족 (§3-8)

- **삭제하지 않는다**: 배치 못 한 픽은 `remainingCartHints`에 남아 다음 날 재평가된다
- 알림 2종: 좌표 없는 픽 이름 목록(`skippedCartNames`), 다음 날로 미룬 경우 문구 1줄("Some of your picks were saved for a later day…")
- **없는 것**: `SchedulerResult`에 미배치 필드가 없다(`success|error` 두 갈래뿐). 여행 전체가 끝나도록 배치되지 못한 픽과 **그 사유를 알리는 경로가 없다**. 우선순위 재선택 후 재계산 흐름도 없다

**판정: 부분 구현.** "조용히 지우지 않는다"는 지켜지고 "미배치와 사유를 알린다"는 미구현.

### 17-6. GPS context V1 재사용 가능 요소

| 요소 | 상태 |
|---|---|
| canonical `district` | ✅ 이미 사용 중 — `enrich.ts:128` select, `enrichment-core.ts:108` → `ctx.area` |
| canonical `city`·`name`·`category`·`subcategory` | ✅ 이미 사용 중 |
| `user_spots.city` | ✅ 이미 사용 중 (canonical 없을 때 fallback) |
| **시간대** | ❌ 미사용. `EnrichmentContext`에 시간 필드가 없고 enrich의 select에 `created_at`도 없다 |
| **Trip context** | ❌ 미사용. day·trip 소속이 전달되지 않는다 |
| `zone_id` | ⚠ **사용 불가.** 기준점 거리 등급(1~3)이지 지역명이 아니다 |
| reverse-geocoding | ❌ 존재하지 않음. §9-1에 따라 V1에서 만들지 않는다 |

현재 공개 장소와 연결되지 않은 My Place는 AI에 위치 맥락이 전혀 가지 않는다(`hasLocation` 불리언만 전달).

### 17-7. AI와 하드 제약의 결합 (§5)

`profileBias`는 HC-3·HC-4·HC-6·HC-1·gap 크기·식사창 검사를 **모두 통과한 뒤** `adjusted_score`에만 더해진다(`engine.ts:172-185`). 상한 ±30으로 클램프된다(`profile-bias.ts:74`).
즉 AI는 후보 **순서**만 바꾸고 현실성 규칙을 깨지 못한다. 프로필이 없으면 보정 0이라 기존 동작과 완전히 동일하다.

**판정: §5 준수.**

### 17-8. 문서·메모리 충돌

- 이 문서 초판 §3-1 / §13-1 문언 → **rev.2에서 정정** (§3-1-A 신설)
- `project_scheduler_candidate_pool_conflict.md`(미판정 충돌 메모리) → **오너 판정으로 해소, 삭제**
- "50~100개 seed" → 이미 §8에서 정정 완료. `project_my_places_traveler_place.md` §4에도 정정 표시 있음
- `AI_PERSONALIZATION_MODE`와 My Places AI 혼동 → docs 내 다른 문서에 해당 기록 없음
- `gokoreamate-product-constitution-v1.md` · `content-action-semantics-v1.md` · `picks-trip-memory-lifecycle-decision-v1.md` → 이 SSOT와 충돌 없음
- 테스트에 "This Trip only" 단정 없음

### 17-10. Invariant 1·2 구현 (2026-08-13, `TASK-SCHEDULER-PREVIOUS-PLACE-AND-FIXED-EGRESS-01`)

§17-4의 "미구현" 판정 중 **엔진 쪽 두 결함**이 해소되었다. 입력 경로(UI)는 여전히 없다.

| 항목 | 이전 | 현재 |
|---|---|---|
| 직전 장소 기준 | `[...placed].sort(asc).at(-1)` = 그날 최댓값 | `itemBeforeGap()` = gap 시작 전 끝난 항목 중 가장 늦은 것 |
| 좌표 해석 | `place`만, `event`는 base로 폴백 | `place`는 `candidates`, `event`는 `fixed_events`에서 |
| 고정 앞 이동시간 | 검사 없음 | `hc8FixedEgressFits` — 체류 종료 + egress ≤ 고정 시작 |

**원인은 회귀가 아니라 최초 구현부터의 미구현이었다**(직전 감사 `TASK-SCHEDULER-TELEPORT-HISTORY-REAUDIT-01`). `lastItem`은 `0bf6491`부터, egress 검사는 rule engine에 존재한 적이 없다.

기준점 결함은 **고정 일정과 무관하게 이미 활성 상태**였다 — `gaps`가 `greedyLoop` 진입 시 1회만 계산되고 바깥 while이 최대 20회 재호출하므로, 2회차부터 이른 gap을 채울 때 늦은 항목이 기준이 되었다.

회귀 테스트 9개: `src/lib/scheduler/previous-place-and-egress.test.ts`

### 17-11. Invariant 2 일반화 (2026-08-13, `TASK-SCHEDULER-GENERAL-INSERTION-FEASIBILITY-01`)

HC-8 이 고정 항목에만 걸려 있어 **일반 항목 앞 중간 삽입**이 무방비였다. 순수 harness 에서 재현됐다.

```text
09:08–10:08  bfast
10:16–10:36  near      ← 식사 이연이 만든 구멍에 삽입
11:00–12:00  lunch     ← 이미 배치된 일반 항목

near(끝 10:36) → lunch(시작 11:00) : 여유 24분 / 필요 40분
```

운영 기본값 `start_time="09:00"` 에서 도달한다. cart fallback pass 에서는 **This Trip 항목**이 같은 자리에 놓였다.

| 항목 | 이전 | 현재 |
|---|---|---|
| 다음 항목 탐색 | `fixedItemAfterGap` — `is_fixed` 만 | `nextPlacedItemAfterGap` — 모든 배치 항목 |
| 검사 이름 | `hc8FixedEgressFits` | `hc8InsertionEgressFits` |
| 좌표 미확인 | 검사 건너뜀(통과) | **fail-closed** — 그 gap 에 삽입 안 함 |
| 마지막 자리 | 진입+체류 | 변화 없음 |

회귀 테스트 10개: `src/lib/scheduler/insertion-feasibility.test.ts`. 수정 전 엔진에서 5개가 실패함을 확인했다.

### 17-12. 다음 구현 TASK 후보 (이번 TASK 범위 밖 — 코드 미변경)

1. **고정 일정 입력 경로** — This Trip 장소별 날짜·시간 지정 UI + `anchors`/`fixed_events` 전달. 엔진 변경은 불필요할 가능성이 높다
2. **미배치 사유 리포트** — `SchedulerResult`에 미배치 목록·사유를 추가하고 여행 단위로 집계해 사용자에게 알림 + 우선순위 재선택 후 재계산
3. **AI context V1 확장** — `EnrichmentContext`에 시간대와 Trip context 추가. 신규 geocoding 없이 기존 값만 사용(§9-1)

---
