# Home · Discovery · External AI — Product Direction SSOT v1

| 항목 | 값 |
|---|---|
| `document_title` | Home · Discovery · External AI Product Direction |
| `document_version` | 1.0 |
| `document_type` | `PRODUCT_DIRECTION_SSOT` — 확정된 제품 **방향**과 판단 기준만 기록한다. 구현 설계서가 아니다 |
| `status` | **ACTIVE** — Home / City Discovery / Search / External AI Import / 내부 학습 / AI 문체 방향의 기준 문서 |
| `authority` | **`SUBORDINATE`** — 최상위 원칙은 `gokoreamate-product-constitution-v1.md`가 갖는다. 충돌 시 Constitution 우선 |
| `scope` | Home 1/2 역할 · Home→City→Explore 발견 흐름 · City Hub · 추천/랭킹 신뢰 규칙 · Global Search 대상 · 외부 AI 일정 수용 · 비공개 스케줄러 학습 · AI 제목/메모 문체 |
| `decided_on` | 2026-09-02 (Owner + GPT 확정 방향을 문서화) |
| `verified_commit` | `6f93f4f` (작성 시점 master) |
| `supersedes` | `home-experience-decision-v1.md`의 **Home 전환 방식 확정 부분** — 전환 방식은 본 문서에서 `OPEN_DECISION`으로 재개봉한다(§16). 그 외 항목은 그대로 둔다 |
| `ux_decision_layer` | LEVEL 2 UX 결정은 `home-ux-decision-ssot-v1.md`가 갖는다 — §16 OPEN 중 Home 1↔2 관계·Search 기본 interaction·Home 2 구조·City Hub 계층·View all 성격·Explore 경계는 그 문서가 닫았다(2026-09-02). 나머지 §16 항목은 계속 OPEN |
| `conflict_rule` | Constitution 과 충돌하면 Constitution 우선. 코드·DB 와 충돌하면 임의 진행하지 않고 중단·보고 |
| `implementation_status` | **미구현 기준 문서.** 현재 코드가 이 방향과 다른 부분이 있어도 이 문서가 코드를 고치라는 지시는 아니다. 향후 Home closure task 의 판단 기준이다 |

**이 문서에 쓰지 않는 것** — Home 상세 UI · transition 방식 · search 표시 형태(overlay/sheet/inline) · City Hub 카드 디자인 · ranking UI · external AI parser 기술 · privacy/consent 세부 계약. 전부 §16 `OPEN_DECISION`이다.

**용어** — 현재 제품 표면/concept 이름으로 `Memory`를 사용하지 않는다. 여행 후 기록의 결과물 이름은 **Story**다. (과거 문서 `picks-trip-memory-lifecycle-decision-v1.md` · `public-memory-story-launch-close-v1.md`의 "Memory" 표기는 역사 기록으로 그대로 두되, 새 문서·새 UI 문구에서는 쓰지 않는다.)

---

## At a glance

- GoKoreaMate 는 대형 LLM과 정면 경쟁하지 않는다. **한국 특화 발견 + 실제 여행 실행 + 기록 + Story + Share + 재발견**의 순환에 집중한다. `OWNER_DECISION`
- **Home 은 2개다.** Home 1 = 여행이 무엇으로 남는지 보여 주는 storytelling 표면, Home 2 = 여행을 시작하는 실용적 입구. 중복이라며 합치지 않는다. `OWNER_DECISION`
- 발견 흐름은 **Home → City Hub → Explore**. City Hub 는 선택지를 줄여 주는 중간 계층이다(Explore 복제 금지). `OWNER_DECISION`
- City Hub 는 **Recommended Trips ~3 → View all(초기 ~30)** / **Recommended Places ~3 → View all(지역 전체)** + `Explore [City]`. `CURRENT_PRODUCT_DIRECTION`
- 데이터 없는 가짜 순위 금지 — 초기엔 `Recommended`/`KoreaMate Picks`만, `Popular`류는 실제 행동 데이터가 쌓인 뒤. `OWNER_DECISION`
- Home Search 는 그 자리에서 시작되는 **Global Search** — 대상은 Cities · Trips · Places. `OWNER_DECISION`
- 외부 AI(Gemini/ChatGPT/Claude 등)에서 만든 일정은 **재심사·재최적화 없이** My Trip 으로 최대한 그대로 수용한다. DB 에 없는 장소도 막지 않는다. `OWNER_DECISION`
- 외부 일정의 **구조 신호**는 비공개 내부 자산으로 GKM Scheduler 개선에만 쓴다. 원문 대화 저장 금지, 외부 노출 금지. `CURRENT_PRODUCT_DIRECTION`
- AI 제목/메모 문체 = **담백함 + 상황에 맞는 작은 유머 + 절제된 감성**. 시적 과잉·광고 카피·억지 유머 금지. `OWNER_DECISION`
- `Powerful functionality, visually quiet.` 다음 단계가 스스로 이어지게 만든다. `OWNER_DECISION`

---

## 1. Purpose

Owner 와 GPT 가 확정한 Home / City Discovery / Search / External AI Import / 내부 학습 / AI 문체 방향을 저장소 안의 판단 기준으로 고정한다. 이 문서는 **방향**만 정한다. 상세 UI·기술 구현은 이후 별도 task(Home UX closure 등)에서 이 문서를 기준으로 설계한다.

## 2. Product Thesis — `OWNER_DECISION`

GoKoreaMate 는 "한국 여행의 모든 답을 혼자 만들어내는 서비스"가 아니다.

사용자가 —
GoKoreaMate 안에서 한국을 발견하고 → 자신의 여행을 만들거나 · 다른 사람의 여행을 발견하거나 · **외부 AI에서 만든 여행을 가져오고** → 실제로 여행하면서 → 사진과 메모를 남기고 → Story 로 정리하고 → 공유하고 → 그 결과가 다시 다른 여행자의 발견으로 이어지는 —
**순환 구조**를 지향한다.

대형 LLM의 개인 취향 데이터·범용 지식·세계 지도 데이터 규모와 정면 경쟁하지 않는다. 대신 다음에 집중한다:

한국 여행 특화 discovery + 실제 여행 실행 + 사진/메모 기록 + Story + Share + 사용자 여행 콘텐츠의 재발견.

현재 모바일 주요 흐름은 Home · Explore · Picks · Trips · More 이고, Picks 안에 Selected/This Trip · Saved · My Places 가 있다. AI Scheduler 의 일반 입력은 사용자가 명시적으로 선택한 This Trip 중심이다(`project` 스케줄러 입력 계약 유지). My Trip 은 실제 여행 일정과 실행 공간, Story 는 여행 후 다시 보고 공유하는 결과물이다.

## 3. Home 1 / Home 2 — `OWNER_DECISION` (FIXED)

Home 은 2개를 유지한다.

| | 역할 | ~이 아니다 |
|---|---|---|
| **HOME 1** | 첫 유입 사용자가 "내 한국 여행이 장소 → 사진 → 메모 → Story → 공유 가능한 여행 기록으로 이렇게 남을 수 있구나"를 직관적으로 느끼게 하는 **storytelling / desire 표면** | 기능 설명 페이지 · Planner form 중심 화면 · 전 기능 노출 dashboard |
| **HOME 2** | 실제 한국 여행을 시작하는 **실용적 입구** — 검색하거나, 도시를 선택하거나, 가볍게 추천 콘텐츠를 발견한다 | 복잡한 여행 설정 form 강요 · first-time user 에게 과도한 선택지 노출 |

정리: **HOME 1 = 여행이 무엇으로 남는지 보여줌 · HOME 2 = 여행 발견과 시작.**

"중복이라서 하나로 합쳐야 한다"는 전제는 금지다(§17 GUARD 1). Home 1 → Home 2 전환 방식(scroll/cinematic/interaction)·정확한 레이아웃·hero 내용은 `OPEN_DECISION`(§16).

## 4. Primary Discovery Flow — `CURRENT_PRODUCT_DIRECTION`

```
HOME 1 → HOME 2 → CITY HUB → EXPLORE
       → Save / Add to This Trip → AI itinerary → My Trip
       → actual travel → photos / notes → Story → Share → new discovery
```

특히 **`Home → City → Explore`** 연결을 자연스럽게 만든다.

문제 의식: Home 에서 도시를 누르자마자 지도·필터·수많은 장소가 있는 Explore 로 직접 던지면 첫 유입 사용자에게 맥락이 부족하다. **City Hub 는 Home 과 Explore 사이의 "선택을 쉽게 해주는 계층"**이다.

## 5. City Hub — `OWNER_DECISION` (FIXED PRODUCT ROLE)

대상 도시: Seoul · Busan · Jeju · Gyeongju · Jeonju. 각 주요 도시는 별도의 recommendation entry experience 를 가진다.

역할: **"이 도시를 처음 보는 사람이 이 시기에 어떤 여행과 장소가 있는지 빠르게 감을 잡게 해주는 것."**

City Hub 는 Explore 의 복제본이 아니며, **의도적으로 선택지를 줄인다**(§17 GUARD 2·3).

기본 구조:

- **Recommended Trips** — 약 3개 preview → `View all`
- **Recommended Places** — 약 3개 preview → `View all`
- **`Explore [City]`** — 더 깊은 탐색으로 이동

카드 레이아웃·타이포·city hero·View all 디자인은 `OPEN_DECISION`(§16).

## 6. Recommended Trips / Places 확장 모델 — `CURRENT_PRODUCT_DIRECTION`

Preview 3개는 전체 콘텐츠의 전부가 아니다.

| | City Hub | View all | 확장 |
|---|---|---|---|
| **Trips** | 약 3개 | 초기: Owner 가 수집한 **약 30개 전후**의 추천 여행코스 | 30개 이상, 필요하면 훨씬 더 많은 콘텐츠 |
| **Places** | 약 3개 | 그 지역의 **전체 추천 장소 목록** | 살아있는 discovery/ranking 표면으로 성장 |

View all 전체 화면은 단순한 작은 dropdown 이 아니라 향후 **살아있는 discovery/ranking surface** 로 성장할 수 있어야 한다. 정확한 board/list/grid UI·정렬·필터는 `OPEN_DECISION`(§16).

## 7. V3 User-Generated Discovery — `PLANNED_V3`

처음에는 GoKoreaMate curated trip/place 데이터로 시작한다. 시간이 지나면 recommendation ecosystem 에 다음이 들어올 수 있다:

- 사용자가 직접 만든 여행 · 공유된 실제 여행
- 사용자 My Places 에서 발생한 신규 장소 · 실제 방문 장소
- 공개 Story/Trip · Save · Copy · Share · 실제 여행 날짜

중요: GoKoreaMate 는 전국의 모든 신규 장소를 **회사 데이터 수집만으로** 미리 완벽하게 채우려 하지 않는다. 사용자가 My Places · 외부/직접 일정 · 실제 여행 중 발견으로 신규 장소를 만들 수 있고, 그것이 장기적으로 서비스 콘텐츠를 보완한다. (공개 승격 절차는 `user-place-public-contribution-contract-v1.md` 계약을 따른다.)

## 8. Recommended vs Popular — 신뢰 규칙 — `OWNER_DECISION`

실제 사용자 데이터가 충분하지 않은 초기에 **가짜 순위를 만들지 않는다**(§17 GUARD 4).

- 초기 사용 가능 라벨: `Recommended` · `KoreaMate Picks`
- 실제 행동 데이터가 충분해진 뒤에만: `Most Saved` · `Popular` · `Trending` · `Recently Shared` · `Seasonal` · `September Trips` 등으로 발전 가능

`Recommended`(편집 추천)와 실제 데이터 기반 `Popular/Trending`을 **항상 구분**한다. 근거 없는 1위/2위/3위 부여 금지. 가중치·최소 데이터 임계값은 `OPEN_DECISION`(§16).

### 여행 날짜 신호 — `CURRENT_PRODUCT_DIRECTION`

사용자가 실제로 여행한 날짜는 중요한 맥락 데이터다. `Traveled Sep 2026` 처럼 **사실인 여행 시점 표시는 가능**하다 — 다른 사용자가 "9월 초 부산에서 이런 여행을 했구나"라는 감을 얻는다.

하지만 한 사람이 9월에 방문했다는 이유만으로 `Best in September` 라고 자동 판단하지 않는다. 충분한 데이터(9월 여행 빈도·save/copy/share 패턴·시즌별 공개 여행)가 모인 뒤에야 `Popular in September` 같은 실제 seasonal discovery 로 발전 가능하다. `PLANNED_V3`

## 9. Home Global Search — `OWNER_DECISION` (FIXED DIRECTION)

현재 문제: 검색창을 눌렀는데 페이지 아래 특정 section 으로 점프하는 방식은 흐름상 불편하다.

새 방향: **검색을 시작한 자리에서 검색이 시작된다.**

Home Search 는 Explore 의 단순 place filter 가 아니라 GoKoreaMate 전체 콘텐츠의 **Global Search** 다. 검색 대상 3종:

| 대상 | 예 |
|---|---|
| **CITIES** | Busan |
| **TRIPS** | 3 Days in Busan · Busan Coast & Night Views |
| **PLACES** | Oryukdo Skywalk · Busan X the Sky |

표시 형태(overlay/sheet/dropdown/inline expand)·랭킹·결과 그룹핑 UI 는 현재 단계에서 확정하지 않는다 — `OPEN_DECISION`(§16).

## 10. External AI Plan Import — `OWNER_DECISION` (STRATEGIC DIRECTION)

Gemini · ChatGPT · Claude · 미래의 AI 서비스에서 이미 여행 일정을 만든 사용자를 GoKoreaMate 가 거부하지 않는다.

핵심: **`PLAN ANYWHERE` → `TRAVEL WITH KOREAMATE` → `RECORD` → `STORY` → `SHARE`**

외부 AI 일정의 목적은 GoKoreaMate 가 다시 심사하거나 최적화하는 것이 아니다. 사용자는 이미 그 여행을 선택했다. 따라서 `external AI trip → GoKoreaMate → My Trip` 으로 최대한 자연스럽게 수용한다.

### Import UX 원칙 — `CURRENT_PRODUCT_DIRECTION`

기본 기대 UX: **AI trip detected → import → My Trip.**

"4 places found · 3 matched · confirm every stop · Add to My Trip" 같은 개발자 중심 중간 절차를 **필수로 만들지 않는다**. 사용자가 Import 작업 자체를 거의 느끼지 않는 것이 이상적이다. 실제 technical failure/security 조건의 fallback UX 는 구현 단계에서 별도 설계한다(`OPEN_DECISION`).

## 11. External AI → My Trip Contract — `OWNER_DECISION`

### 재최적화 금지 (Owner correction)

외부 AI 에서 가져온 일정에 `Optimize with KoreaMate` 같은 **재최적화 기능을 붙이지 않는다**(§17 GUARD 5). Gemini 가 A → B → C → D 를 만들었다면 기본적으로 A → B → C → D 그대로 My Trip 에 수용한다.

가능한 범위에서 보존: order · dates · times · places · supplied notes/context.

Gemini/ChatGPT 의 계획을 다시 평가해 주는 것이 import 의 목적이 아니다.

### Unknown place 수용

외부 일정에 GoKoreaMate DB 에 없는 장소가 있어도 import 를 막지 않는다(§17 GUARD 6).

내부 처리 방향: canonical match 가 있으면 → canonical linkage / 없으면 → private/imported place. 사용자 관점에서는 둘 다 정상적으로 My Trip 에 들어간다. "장소를 확인해주세요" 같은 blocking step 을 기본 flow 로 만들지 않는다. (이 linkage 는 배선이며, Final authoritative 데이터의 identity 판정을 바꾸지 않는다 — Data Contract 우선.)

### 두 개의 입구 (Scheduler 와의 관계)

| | 경로 |
|---|---|
| **PATH A — Native GKM user** | Discover → Save / Add to This Trip → GoKoreaMate AI Scheduler → My Trip |
| **PATH B — External AI user** | Gemini/ChatGPT/Claude 등 → imported plan → My Trip |

둘 다 `My Trip → actual travel → photo/memo → Story → Share` 로 합류한다. External imported plan 의 구조적 learnings 는 장기적으로 **PATH A Scheduler 품질 개선**에 활용 가능하다(§12).

## 12. Private Scheduler Learning — `CURRENT_PRODUCT_DIRECTION` (FIXED STRATEGIC DIRECTION)

외부 AI 일정의 **여행 구조**와 실제 사용 결과는 장기적으로 GoKoreaMate Scheduler 개선을 위한 **비공개 내부 자산**으로 활용 가능하다. 이것은 imported trip 자체를 다시 optimize 한다는 뜻이 **아니다** — 대상은 GoKoreaMate 에서 직접 새 일정을 만드는 사용자(PATH A)에게 더 나은 scheduler 결과를 주는 것이다.

예시 internal signals: common place pairings · stop order · route pattern · day structure · time slot · duration · season · user removed/added/reordered stop · original plan 유지율 · 실제 photo/note engagement · share/save/copy patterns.

초기에는 모델 fine-tuning 이라고 단정하지 않는다. 우선 structured DB / learning artifact / scheduler features 로 축적 가능하고, 데이터가 충분해지면 ranking / candidate comparison / scheduler rules / model learning 에 활용 가능하다. 정확한 learning schema·model training 여부는 `OPEN_DECISION`(§16).

## 13. Privacy Principles — `OWNER_DECISION` (HARD PRINCIPLE)

### 원문 저장 금지

외부 AI 의 전체 conversation 을 무조건 저장하거나 학습 데이터로 통째로 사용하는 방식은 금지 방향이다(§17 GUARD 7). 특히 private prompt · personal preference text · unrelated conversation · account/private information 을 scheduler 학습 원문으로 보관하지 않는다.

가능하면 **필요한 여행 구조만 정규화**한다. 예: source provider · city · trip duration · stop sequence · time · place identity · source link · imported timestamp.

### 비노출

내부 learning asset 은 외부 사용자에게 노출하지 않는다(§17 GUARD 8):

- 특정 사용자의 private preference 를 다른 사용자에게 노출 금지
- imported AI original conversation 공개 금지
- internal scheduler learning dataset 공개 금지
- provider-derived internal pattern 자체를 사용자 UI 에 노출 금지

공개 가능한 것은 사용자가 **명시적으로 공개한** Story · shared trip · public content 뿐이다.

consent · retention · anonymization · deletion · privacy policy 등 실제 개인정보 처리 계약은 `OPEN_DECISION`(§16)이며 별도 설계가 필요하다. (기존 개인정보·공개 경계 원칙은 Constitution 과 `public-story-sharing-ssot-2026-08-19.md`, My Places 외부 공유물 좌표 금지 계약과 함께 읽는다.)

## 14. AI Title / Memo Writing Tone — `OWNER_DECISION` (FIXED)

GoKoreaMate AI 가 여행 장소/사진/순간의 제목이나 메모를 제안할 때.

피할 것: 과도하게 시적인 여행문학 · 지나치게 느끼한 감성 · 광고 카피 · 억지 감동 · 매번 웃기려는 문장 · 유행어/밈 남발 · 과도한 emoji (§17 GUARD 9).

기본 tone: **`담백함` + `상황에 맞는 작은 유머` + `절제된 감성`**

| | 예 |
|---|---|
| BAD | "바다 위로 번지는 빛, 오늘의 부산을 마음에 담았다." |
| GOOD | "생각보다 오래 보게 된 광안리 밤." |
| LIGHT HUMOR | "사진 한 장 찍으려다 40분째 여기." |
| PLAIN | "광안리, 밤 9시쯤." |
| Cafe | "계획엔 없었는데 잘 들어왔다." · "커피보다 뷰가 더 기억남." · "여기서 한 시간 쉬어가기." |

AI 는 상황에 따라 plain · light humor · soft emotion 중 적절한 것을 선택한다. 모든 사진/장소에 유머를 강제하지 않는다. (진화형 스타일 라이브러리 방향과 병행: 문구 일괄 생성 금지, 사용자 반응으로 축적.)

## 15. Product Experience Principles — `OWNER_DECISION`

GoKoreaMate 의 세련됨은 기능이 많아 보이는 것에서 나오지 않는다.

핵심: **`Powerful functionality, visually quiet.`**

사용자가 "다음에 무엇을 해야 하지?"를 고민하지 않아도 자연스럽게 다음 단계로 이어지는 것이 중요하다. 따라서:

- unnecessary wizard 금지
- unnecessary confirmation 금지
- redundant CTA 금지
- feature explanation overload 금지
- developer vocabulary 사용자 노출 금지

## 15-1. Explicit Non-Goals — `NON_GOAL`

이 방향 문서에서 다음은 목표가 아니다:

Home 구현 · Home redesign · Search 구현 · External AI parser 구현 · Gemini scraper 구현 · ChatGPT scraper 구현 · City Hub UI 구현 · ranking 구현 · AI scheduler 변경 · DB schema 변경 · learning pipeline 구현 · privacy consent UI 구현 · V3 구현.

이 문서는 향후 해당 작업들의 **판단 기준만** 정의한다.

## 16. Open Decisions — 전부 `OPEN_DECISION`, 추측으로 CLOSED 금지

> 2026-09-02: 아래 중 Home 1↔2 관계·Search 기본 interaction·Home 2 정보 구조·City Hub 정보 계층·View all 성격·Explore 경계는 Owner 가 `home-ux-decision-ssot-v1.md`(LEVEL 2)에서 닫았다. 그 문서가 다시 OPEN 으로 남긴 세부(visual·motion·ranking·parser 등)는 계속 OPEN 이다.

### Home
- Home 1 → Home 2 transition 방식 · scroll / cinematic transition / interaction 방식
- Home 2 exact layout · Home hero exact content

### Search
- inline expand / dropdown / floating panel / mobile sheet / overlay
- exact search ranking · result grouping UI

### City Hub
- exact card layout · exact typography · city hero
- recommended trips presentation · recommended places presentation · View all design

### Trip/Place Full List
- exact board/list/grid UI · ranking presentation · filters · sort · initial ordering

### V3 Ranking
- save weighting · copy weighting · share weighting · recency · seasonal score · minimum data threshold

### External AI Import
- supported providers at launch · share-link parser implementation · pasted text fallback · document import · server-side fetch strategy · provider adapter · failure fallback · source URL retention

### Privacy / Learning
- consent model · retention · anonymization · deletion contract · public/private boundary implementation · exact learning schema · model training 여부

Claude/Fable 이 이 Open Decisions 를 추측으로 Owner Decision 으로 승격하지 않는다(§17 GUARD 10).

## 17. Direction Guards

| # | Guard |
|---|---|
| **GUARD 1** | Home 1 / Home 2 를 단순 중복이라는 이유로 합치지 않는다 |
| **GUARD 2** | City Hub 를 또 하나의 Explore 로 만들지 않는다 |
| **GUARD 3** | 첫 화면에서 수십/수백 장소를 한 번에 노출하지 않는다 |
| **GUARD 4** | 추천(`Recommended`)과 실제 popularity/ranking 을 혼동하지 않는다 |
| **GUARD 5** | External AI imported trip 에 GoKoreaMate 재최적화를 강요하지 않는다 |
| **GUARD 6** | External AI 일정의 장소를 GKM DB 미존재라는 이유로 차단하지 않는다 |
| **GUARD 7** | External AI 원문 private conversation 을 scheduler learning dataset 처럼 무분별하게 저장하지 않는다 |
| **GUARD 8** | Internal learning asset 을 외부 사용자에게 노출하지 않는다 |
| **GUARD 9** | AI writing 을 과도한 감성/광고 문구/억지 유머로 만들지 않는다 |
| **GUARD 10** | Open Decision 을 Claude/Fable 이 임의로 Owner Decision 으로 승격하지 않는다 |

## 17-1. Future Design Review Rule

향후 Home 디자인을 Claude/Fable 이 검토할 때, 이 SSOT 를 먼저 읽고 다음을 확인한다:

- Home 1 역할(storytelling/desire)을 살리는가?
- Home 2 가 실제 시작점으로 단순한가?
- City Hub 가 선택을 줄여주는가? Explore 와 중복되지 않는가?
- Search 가 페이지 점프식으로 퇴행하지 않는가?
- V3 확장성을 막지 않는가?
- 외부 AI import 를 불필요하게 복잡하게 만들지 않는가?
- 사용자 기록/Story/Share 까지의 흐름을 방해하지 않는가?

**시각적으로 예쁘더라도 위 product direction 과 충돌하면 디자인을 우선하지 않는다.**

## 17-2. 기존 문서와의 관계

| 문서 | 관계 |
|---|---|
| `gokoreamate-product-constitution-v1.md` | 상위. 충돌 시 Constitution 우선 |
| `home-experience-decision-v1.md` (2026-08-01) | Home 이 두 표면을 갖는다는 골격은 일치. 단 그 문서가 확정했던 **전환 방식(1 route 좌우 스와이프)** 은 본 문서 §16 에서 `OPEN_DECISION`으로 재개봉. 역할 정의도 본 문서(§3 Home 1 = storytelling / Home 2 = 시작 입구)가 우선 |
| `home-experience-contract-v1.md` | 과거 구현 계약(2026-08-02 디자인 3종 기준). 그 디자인은 Home 최종안이 아니며, "Memory Synergy" 명명도 현재 용어가 아니다. 향후 Home closure task 는 그 계약이 아니라 **본 문서**를 방향 기준으로 삼는다 |
| `picks-trip-memory-lifecycle-decision-v1.md` · `public-memory-story-launch-close-v1.md` | 역사 기록 유지. "Memory" 표기는 현재 concept 이 아니고 결과물 이름은 Story 다 |
| `content-action-semantics-v1.md` | 유지. Save/Like/Share 의미는 그 문서를 따른다 |
| `gokoreamate-my-places-trip-ai-ssot-2026-08-13.md` | 유지. This Trip 스케줄러 입력 계약·My Places AI 원칙과 본 문서는 상호 보완 |
| `../architecture/gokoreamate-scheduler-v2-direction-ssot.md` | 유지. §12 학습 신호는 향후 그 트랙의 입력 후보일 뿐, 스케줄러 변경을 지시하지 않는다 |
| `../architecture/post-launch-place-delivery-scaling-v1.md` | 유지. View all/전체 목록 확장 시 place delivery 상한·정책은 그 문서를 따른다 |

## 18. Decision Summary

| 항목 | 상태 |
|---|---|
| Product Thesis (순환 구조·LLM 비경쟁) | `OWNER_DECISION` |
| Home 1 / Home 2 유지 + 역할 | `OWNER_DECISION` |
| Home → City Hub → Explore 흐름 | `OWNER_DECISION` |
| City Hub 역할(선택 축소 계층) | `OWNER_DECISION` |
| Trips 3 → View all(초기 ~30 → 확장) | `CURRENT_PRODUCT_DIRECTION` |
| Places 3 → View all(전체 목록 → ranking 표면 성장) | `CURRENT_PRODUCT_DIRECTION` |
| User-generated discovery ecosystem | `PLANNED_V3` |
| Recommended vs Popular 구분·가짜 순위 금지 | `OWNER_DECISION` |
| 여행 날짜 사실 표시 / 자동 Best-in-Month 금지 | `CURRENT_PRODUCT_DIRECTION` |
| Global Search (Cities·Trips·Places, 제자리 시작) | `OWNER_DECISION` |
| External AI import 수용 (PLAN ANYWHERE →) | `OWNER_DECISION` |
| Imported trip 재최적화 금지 | `OWNER_DECISION` |
| Unknown place 수용(차단 금지) | `OWNER_DECISION` |
| Private scheduler learning (비공개 내부 자산) | `CURRENT_PRODUCT_DIRECTION` |
| 원문 대화 비저장·learning 비노출 | `OWNER_DECISION` |
| AI 제목/메모 문체 | `OWNER_DECISION` |
| Powerful functionality, visually quiet | `OWNER_DECISION` |
| Home/Search/City Hub 상세 UI · parser · privacy 세부 | `OPEN_DECISION` |
| Home/Search/파서/랭킹/스키마/V3 구현 | `NON_GOAL` (이번 문서 범위) |
