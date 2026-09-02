# Home UX Decision SSOT v1

| 항목 | 값 |
|---|---|
| `document_title` | Home UX Decision SSOT |
| `document_version` | 1.0 |
| `document_type` | `UX_DECISION_SSOT` — Owner 가 외부 4개 LLM 독립 제안을 비교 검토한 뒤 확정한 **Home/Search/City Hub UX architecture 와 interaction contract**만 기록한다 |
| `status` | **ACTIVE** — Home UX 설계·평가의 LEVEL 2 기준 문서 |
| `authority` | **`SUBORDINATE`** — 상위 방향은 `home-discovery-external-ai-product-direction-ssot-v1.md`(LEVEL 1), 최상위는 `gokoreamate-product-constitution-v1.md`. 충돌 시 상위 우선 |
| `scope` | Home 1/2 UX 관계(Cover→Floor) · Home Search interaction · Home 2 정보 구조 · City Hub 정보 계층 · View all 성격 · Explore 경계 · External AI silent import UX · Save/IA guard · 채택/폐기/보류 아이디어 |
| `decided_on` | 2026-09-02 (외부 LLM 의견 수집 종료 — 추가 수집은 OPEN action 아님) |
| `verified_commit` | `49cb2e1` (작성 시점 master) |
| `level` | **LEVEL 2 — HOW THE HOME UX SHOULD FLOW.** LEVEL 3(visual specification: 타이포·정확한 spacing·카드·motion 수치)과 LEVEL 4(implementation)는 이 문서가 확정하지 않는다 |
| `supersedes` | LEVEL 1 §16 의 OPEN 중 Home 1↔2 관계 · Search 기본 interaction · Home 2 정보 구조 · City Hub 정보 계층 · View all 성격 · Explore 경계 — 본 문서가 닫는다. `home-experience-decision-v1.md`의 **1 route 좌우 스와이프 2면 구조**는 본 문서 §5(Cover→Floor 수직 연속)로 supersede. 그 문서의 하단 내비 5탭 구성 등 그 외 결정은 유지 |
| `conflict_rule` | 상위 문서와 충돌하면 상위 우선. 코드·DB 와 충돌하면 임의 진행하지 않고 중단·보고 |
| `implementation_status` | **미구현 기준 문서.** 코드 변경 0 · runtime 변경 0 |

**status 표기** — `OWNER_DECISION`(확정) · `CURRENT_UX_DIRECTION`(설계 기준) · `OPEN_DECISION`(미확정) · `FUTURE_CANDIDATE`(보존, 미구현) · `REJECTED`(폐기 — 재제안 금지).

---

## At a glance

- 중심 문장: **`Seamless Context Flow`** — 화면 전환마다 방금 보던 맥락이 사라지는 것이 핵심 문제다. `OWNER_DECISION`
- **Home 1 = COVER, Home 2 = FLOOR** — 하나의 연속된 수직 스크롤 경험. Start 버튼·별도 intro page 없음. `OWNER_DECISION`
- Home 1 에도 **Global Search 진입점**이 있고, 그 Search 는 스크롤을 따라 Home 2 상단으로 **이어져 dock** 된다(두 개의 다른 컴포넌트처럼 느껴지지 않게). `OWNER_DECISION`
- 재방문 사용자에게 Home 1 을 매번 강제 통과시키지 않는다(정확한 규칙은 OPEN). `OWNER_DECISION`
- Home 2 는 작게: **Global Search + 5도시 discovery + 약 3개 cross-city trip inspiration** 뿐. `OWNER_DECISION`
- Search = **Anchored Inline Search** — 시작한 자리에서, 필드 바로 아래가 결과 표면. mobile bottom sheet/fullscreen modal/center palette 기본 금지. 결과는 Cities·Trips·Places **One Unified Mixed List**(탭 3개 금지). `OWNER_DECISION`
- External AI import 는 별도 Home feature block 없이 **Search 의 숨은 능력** — paste → detected → Importing… → My Trip. 확인 wizard·재최적화·unknown place 차단 없음. `OWNER_DECISION`
- 도시 선택 → City Hub 는 **shared-element 식 시각 연속**("Busan 안으로 들어왔다"). City Hub 순서는 **Trips → Places → Explore**. `OWNER_DECISION`
- View all Trips = **Structured Editorial Feed**(masonry 금지, mobile 1열·desktop 2열 권장). View all Places = 추천 확장 공간(기본 map 없음). `CURRENT_UX_DIRECTION`
- Save/My Places/This Trip 의미·mobile 하단 5탭 IA 는 이번 Home 작업이 건드리지 않는다. `OWNER_DECISION`
- motion 은 제품이 아니라 설명 수단 — 수치·효과는 전부 `OPEN_DECISION`.

---

## 1. Purpose · Documentation Hierarchy

Owner 가 외부 4개 LLM 의 독립 Home 제안을 비교 검토한 뒤 채택한 UX 결정을 고정한다. 과거 Home 시안(예: 2026-08-02 3종)을 authoritative visual SSOT 로 복원하는 것이 아니라, **Product Direction SSOT 이후 새로 확정된 UX architecture** 다.

| LEVEL | 문서 | 내용 |
|---|---|---|
| 1 | `home-discovery-external-ai-product-direction-ssot-v1.md` | WHY / 제품 방향 (Home 1/2 유지 · Home→City Hub→Explore · Search scope · External AI 원칙 · V3 · privacy/문체) |
| 2 | **이 문서** | HOW THE HOME UX SHOULD FLOW — UX architecture · interaction contract |
| 3 | 향후 디자인 artifact / visual specification | typography · exact spacing · cards · motion 수치 |
| 4 | 향후 implementation | 코드 |

이 문서는 LEVEL 3/4 를 임의로 확정하지 않는다.

## 2. Core UX Thesis — `OWNER_DECISION`

중심 문장: **`Seamless Context Flow`**

사용자가 Home 을 보고 → 검색하고 → 도시를 선택하고 → City Hub 를 열고 → Explore 로 깊게 들어가고 → Save / Add to This Trip 을 하고 → My Trip 으로 이어지는 동안, 각 단계가 **서로 다른 시스템으로 튕기는 느낌**이 없어야 한다.

화면 수를 줄이는 것이 목표가 아니다. 핵심 문제는 **화면 전환마다 사용자가 방금 보던 맥락이 사라지는 것**이다.

UX 설계 원칙 4개:

1. `Seamless Context Flow`
2. `Progressive Disclosure`
3. `Surviving / Persistent Context Element`
4. `Powerful functionality, visually quiet`

## 3. Progressive Disclosure — `OWNER_DECISION`

| Surface | 역할 |
|---|---|
| **HOME 1** | 결과 / Story / 여행 감각 |
| **HOME 2** | 여행 시작 / 검색 / 도시 선택 |
| **CITY HUB** | 도시를 처음 이해하도록 선택지를 줄여주는 curated layer |
| **VIEW ALL** | 추천 콘텐츠를 더 깊게 보는 layer |
| **EXPLORE** | 지도 / 필터 / 전체 DB 를 자유롭게 탐색하는 deep discovery tool |

정보량은 `Home → City Hub → View all / Explore` 로 갈수록 점진적으로 증가한다.

- City Hub 에 Explore 수준의 지도·필터·전체 DB 를 넣지 않는다.
- Home 2 에 City Hub 수준의 모든 추천 콘텐츠를 넣지 않는다.

## 4. HOME 1 — COVER — `OWNER_DECISION`

Home 1 의 UX 역할 = **`COVER`**.

- 첫 유입의 storytelling/desire 표면 — 여행의 결과가 사진과 짧은 기록으로 남는 모습을 보여주는 공간
- 기능 설명 페이지 아님 · planner form 아님 · dashboard 아님 · 광고 landing page 아님

Visual direction (`CURRENT_UX_DIRECTION`): **photography protagonist** — full-bleed 또는 그에 준하는 강한 photography, 짧고 실제 여행자의 기록처럼 느껴지는 copy. 광고성 slogan·감성문학 과잉 금지.

Tone 예 (최종 copy 는 DESIGN 단계 `OPEN_DECISION`):

- `Stayed at Gwangalli longer than planned.`
- `Gwangalli, around 9pm.`
- `Came for one photo. 40 minutes ago.`

### 4-1. Home 1 Search Entry — `OWNER_DECISION`

Home 1 은 반드시 감상한 뒤에만 기능을 쓸 수 있는 **강제 intro 가 되어서는 안 된다**. 따라서 Home 1 에도 Global Search 진입점이 존재한다.

- 목적지가 이미 정해진 사용자 → Home 1 에서 바로 search 시작 가능
- 목적지가 없는 사용자 → Home 1 을 경험한 뒤 자연스럽게 Home 2 로 이동

`Home 1 의 Search → scroll → Home 2 의 Search` 가 서로 완전히 다른 두 컴포넌트처럼 느껴지지 않게 한다. (Owner-approved UX decision — 후보가 아니라 결정이다.)

## 5. HOME 1 → HOME 2 — Cover → Floor — `OWNER_DECISION`

최종 UX direction: **`Cover → Floor`**

```
HOME 1 = COVER
   ↓ vertical continuous scroll
HOME 2 = FLOOR
```

둘은 **하나의 연속된 vertical experience** 다. 별도 intro page + Start button 구조로 만들지 않는다.

- 별도 Start wizard 금지
- 강제 CTA 통과 금지
- 별도 URL 전환을 기본 contract 로 삼지 않음
- 사용자의 가장 자연스러운 scroll/swipe 행위로 깊이가 바뀜

**가장 중요한 continuity** — Home 1 에서 사용한 Search element 가 스크롤 과정에서 사라졌다가 다른 Search 로 새로 나타나는 느낌을 피한다. Search 는 시각적/공간적으로 **Home 2 상단으로 이어지고 dock** 되는 방향을 사용한다(Surviving/Persistent Context Element).

### 5-1. Motion Is Supporting, Not The Product

방향만 확정(`CURRENT_UX_DIRECTION`): vertical continuity · Search continuity · context preservation.

`OPEN_DECISION`: parallax 정확한 정도 · curtain effect 여부 · scroll snap 여부 · spring physics 여부 · scale/fade 수치 · motion duration · exact easing · mobile/desktop motion 차이.

화려한 transition 자체를 제품 기능으로 만들지 않는다. motion 은 오직 **"내가 같은 공간에서 다음 단계로 이동하고 있다"** 를 설명할 때만 사용한다.

## 6. Returning User Principle — `OWNER_DECISION`

Home 1 은 유지한다. 그러나 재방문 사용자에게 매번 동일한 Home 1 경험을 강제로 통과시키지 않는다.

- FIRST / NEW USER → Home 1 의 storytelling value 를 충분히 경험 가능
- RETURNING USER → Home 2 접근 비용 최소화

**`Home 1 은 없애지 않는다` + `매번 Home 1 부터 강제하지 않는다`** 를 동시에 만족해야 한다.

exact policy 는 `OPEN_DECISION`: same session 기준 · 7일/30일 기준 · active My Trip 기준 · last scroll state restore 여부 · Home 1 재노출 조건.

## 7. HOME 2 — FLOOR — `OWNER_DECISION`

Home 2 = 사용자가 실제 여행 discovery 를 시작하는 기본 surface. **P1 Home 2 는 의도적으로 작게 유지한다.**

Owner-approved content hierarchy:

1. **Global Search**
2. **5-city discovery** — Seoul · Busan · Jeju · Gyeongju · Jeonju
3. **아주 제한적인 cross-city Trip inspiration / KoreaMate Picks** — 약 3개 전후

Home 2 에 기본적으로 넣지 않는 것: Recommended Places full block · 지도 · 상세 필터 · 날씨 dashboard · 호텔 form · partner promotion wall · Story feed · AI Import button · 긴 feature explanation · planner settings form · 많은 category icon grid · fake ranking · 수십 개 recommendation cards.

핵심: **`Home 은 선택하게 하고, City Hub 는 추천을 이해하게 하고, Explore 는 자유롭게 찾게 한다.`**

## 8. Global Search — `OWNER_DECISION`

기본 interaction = **`Anchored Inline Search`**.

금지: 검색 클릭 시 페이지 아래 anchor 이동 · 별도 search URL 즉시 점프 · mobile 기본 Bottom Sheet · mobile 기본 fullscreen modal · desktop 기본 center command palette modal · Cities/Trips/Places 탭 3개 강제.

핵심: **사용자가 검색을 시작한 그 자리에서 검색이 시작된다.** Search field 는 활성화 후 맥락을 잃지 않는다.

### 8-1. Mobile Contract

```
Search field tap → 동일 field focus → keyboard 등장
→ Search 바로 아래 가용 공간이 results surface 로 확장
```

- 검색 input 은 갑자기 다른 곳으로 jump 하지 않는다.
- 별도 Bottom Sheet 가 아래에서 올라오는 것을 기본 UX 로 사용하지 않는다.
- results surface 는 Search field 와 **하나의 anchored interaction** 처럼 느껴져야 한다. exact animation 은 `OPEN_DECISION`.
- Back / Cancel 시 원래 Home context 로 자연스럽게 돌아온다.

### 8-2. Desktop Contract

같은 interaction model. Search field 바로 아래 anchored results panel(필요 시 input 보다 약간 넓어질 수 있음). center modal 처럼 **새 도구를 호출한 느낌**을 만들지 않는다.

keyboard usability 지원 필수(구현 단계 requirement): Arrow Up/Down · Enter · Escape · focus management · accessible combobox/listbox semantics. 정확한 ARIA 구현은 implementation 단계.

### 8-3. Search Results — One Unified Mixed List — `OWNER_DECISION`

현재 user-facing search targets: **Cities · Trips · Places** (LEVEL 1 유지). CITIES/TRIPS/PLACES 탭으로 분리하지 않는다.

```
Busan                    City
3 Days by the Sea        Busan · 3 days
Oryukdo Skywalk          Busan · Viewpoint
```

type 은 subtle metadata · thumbnail aspect/shape · hierarchy 로 조용히 구분 — 단 **visual shape 만으로 타입 판별을 강요하지 않는다**. small textual metadata 병용 가능. exact thumbnail shapes 는 `OPEN_DECISION`.

### 8-4. Ranking — `OPEN_DECISION`

city exact match priority · trip vs place weighting · title starts-with · fuzzy match · proximity · recent · popularity 등 미확정. 실데이터가 없는 상태에서 Popularity 를 ranking 핵심 신호로 **가장하지 않는다**(LEVEL 1 신뢰 규칙).

Search architecture 는 향후 **Story** result type 을 받을 수 있게 확장 가능하면 좋다 — 단 현재 필수 user-facing 결과 type 으로 추가하지 않는다.

## 9. External AI — Search As Hidden Capability — `OWNER_DECISION`

External AI Import 는 **별도 Home feature block 을 만들지 않는다**.

금지: Import from Gemini button · AI logo row · AI category tab · Home hero 의 AI marketing · `Paste your AI trip here` 상시 강조.

Global Search 는 사용자에게 일반적인 Korea search 로 보인다. 하지만 architecture 는 향후 Gemini · ChatGPT · Claude · 기타 provider 의 trip link/text paste 를 받을 수 있어야 한다. **Powerful capability, but visually quiet.**

### 9-1. Import UX Contract (LEVEL 1 유지)

```
Paste → trip detected → Importing… → My Trip
```

금지: `Add to My Trip?` · `Save to My Trip` · match review wizard · `4 places found / 3 matched` · Optimize with KoreaMate · re-order recommendation · canonical match blocking · unknown place blocking.

**사용자가 paste 한 행동 자체가 import intent 의 명확한 표현이다.** real technical failure 가 있을 때만 fallback interaction 을 제공한다. exact parsing/fallback 은 `OPEN_DECISION`.

### 9-2. Data Principle (LEVEL 1 유지)

External AI 의 private raw conversation 전체를 기본적으로 Trip DB / learning dataset 에 저장하지 않는다. 가능하면 필요한 여행 구조만 normalize: provider/source class · city · dates · stops · order · exact time(제공 시) · normalized trip-relevant note · canonical place link(매칭 시) · private/imported place identity(미매칭 시). source URL retention 등은 `OPEN_DECISION`.

**No re-optimization 의 근거는 "LLM 이 못하기 때문"이 아니다. 핵심은 `User Agency / Import Contract` 다.** 사용자는 이미 그 여행을 선택했다. 향후 Gemini/ChatGPT 가 훨씬 좋은 planner 가 되어도 이 기본 import principle 은 변하지 않는다.

## 10. City Entry — Context Continuity — `OWNER_DECISION`

Home 2 에서 도시 선택 시, 선택한 도시의 visual/context 가 City Hub 까지 자연스럽게 이어지는 방향을 사용한다.

Strong direction: **City image/tile → City Hub hero** — shared-element style continuity. exact animation implementation 은 `OPEN_DECISION`.

목적: "**새 페이지로 날아왔다**"가 아니라 "**Busan 안으로 들어왔다**"고 느끼게 한다.

## 11. City Hub — `OWNER_DECISION`

역할: **"이 도시는 이렇게 여행할 수 있구나"** 를 빠르게 이해시키는 surface. Explore clone 이 아니다.

핵심 구조와 순서 — **`Trips → Places → Explore`** 로 결정:

```
CITY HERO
  ↓
RECOMMENDED TRIPS   약 3개 · View all
  ↓
RECOMMENDED PLACES  약 3개 · View all
  ↓
EXPLORE [CITY]
```

이유: 처음 방문한 사용자는 장소 목록보다 **"어떻게 여행하면 되는지"** 를 먼저 이해하는 편이 결정 부담이 낮다.

### 11-1. Explore CTA — `CURRENT_UX_DIRECTION`

Explore 는 City Hub 의 명확한 deep-discovery entry 다. 단 **화면 하단에 항상 떠 있는 거대한 sticky/floating CTA 를 기본 UX 로 사용하지 않는다**. Trips → Places → `Explore City →` 라는 콘텐츠 흐름의 끝에서 자연스럽게 이어진다. exact CTA styling 은 DESIGN `OPEN_DECISION`.

### 11-2. City Hub — Do Not Add

기본적으로 넣지 않는다: 지도 · 전체 DB filter · detailed sort · hotel booking block · complex weather module · huge category grid · ranking dashboard · many widgets · partner-commerce wall. 필요한 깊이는 View all 또는 Explore 로 보낸다.

## 12. Recommended Trips — View All — `CURRENT_UX_DIRECTION`

방향: **`Structured Editorial Feed`**. Pinterest-style irregular **masonry 금지** — Trip 은 사진 collection 이 아니라 **비교 가능한 여행 단위**라 일정한 정보 구조를 유지한다.

권장: Mobile 1-column · Desktop 2-column. card 정보 후보: photo · title · city · days · 중요한 short metadata · 사실인 travel period(있을 때).

초기 콘텐츠: KoreaMate Picks · curated content. 실데이터 없이 fake Popular/Trending controls 를 만들지 않는다.

### 12-1. Filter / Ranking

P1 에서 복잡한 sort/filter 는 넣지 않는다. 필요하면 이후 `1 day / 2 days / 3+ days` 급 최소 trip-length filter 검토 가능(P1 포함 여부는 DESIGN/UX prototype 에서 결정 가능 — `OPEN_DECISION`).

실데이터가 충분해지면 Recently Shared · Most Saved · Seasonal · Popular in [month] · Trending 추가 가능. 핵심: **데이터 근거가 없으면 ranking UI 자체가 나타나지 않는다.**

## 13. Recommended Places — View All — `CURRENT_UX_DIRECTION`

| | 역할 |
|---|---|
| View all Places | **추천된 장소를 더 보는 공간** |
| Explore | 전체 DB 를 지도/필터와 함께 자유롭게 탐색 |

기본 방향: curated list/grid · photo protagonist · place name · compact metadata · Save. **초기 기본 View all 에는 map 을 넣지 않는다** — map 을 넣는 순간 Explore 와 역할이 중복된다.

Place card 선택 시 기존 canonical **Place Detail flow(`/place/[id]`) 유지** — Home redesign 때문에 새 bottom sheet 상세로 재정의하지 않는다.

### 13-1. Selection Signal — `FUTURE_CANDIDATE` 포함

보존하는 아이디어: 기존 curated Trip 약 30개에서 **반복 등장하는 장소의 빈도**를 Recommended Places 선정 signal 중 하나로 활용. 단 `가장 많이 등장한 3개 = 무조건 추천 3개` 로 고정하지 않는다. repeat frequency 는 relevance · canonical importance · common itinerary presence 를 설명하는 하나의 signal 이고, season · editorial value · distinctiveness · strategic place · content quality 와 병행 가능. 정확한 selection logic 은 `OPEN_DECISION`.

## 14. Save Contract Guard — `OWNER_DECISION`

Home 디자인이 기존 product semantics 를 변경하지 않는다.

| 개념 | 의미 |
|---|---|
| **Saved** | 장기 bookmark |
| **My Places** | 사용자 직접 등록 / private place |
| **This Trip** | 현재 AI 일정 생성을 위해 사용자가 **명시적으로 선택**한 장소 |

금지: Save → My Places · Save → This Trip 자동 추가 · Saved 장소를 Scheduler 가 자동 강제 입력 · "Ghost Save" 명목의 semantic 변경.

Save 후 UX 는 조용하게. active trip context 가 있을 때 향후 secondary affordance 로 `Add to This Trip` 제공은 검토 가능하나, **Save 와 Add to This Trip 은 서로 다른 explicit action** 으로 유지한다. (`picks-trip-memory-lifecycle-decision-v1.md` · `content-action-semantics-v1.md` 와 일치.)

## 15. Mobile Navigation Guard — `OWNER_DECISION`

이번 Home UX 작업은 global mobile IA 를 재설계하지 않는다. 현재 하단 내비 **Home · Explore · Picks · Trips · More 유지**.

외부 제안의 Discover/My Trip/Story, Discover/My Trip/Saved/Profile 등 3~4탭 redesign 은 폐기(§17). 이 문서에 새 navigation proposal 로 남기지 않는다.

## 16. Writing Tone (LEVEL 1 유지)

Home/City/Search copy: plain · natural · restrained · 맥락에 맞는 light humor · 맥락에 맞는 soft emotion.

피할 것: tourism-board poetry · ad copy · exaggerated inspiration · forced humor · 과도한 emoji · fake trendy slang. English 도 미국식 travel-blog 과장 문체 금지.

- GOOD: `Stayed at Gwangalli longer than planned.` · `Gwangalli, around 9pm.`
- BAD: `Discover the breathtaking magic of Busan.`

multilingual tone library 확장은 별도 task 가능.

## 17. Explicitly Rejected — `REJECTED` (재제안 금지)

향후 Claude/Fable/Designer 가 "좋아 보인다"는 이유로 반복 제안하지 못하게 기록한다.

- Home 1 / Home 2 merge
- Home 1↔2 사이 mandatory Start button
- Pull-down gesture 로 Home 1 재진입을 primary model 로 삼는 것
- mobile Search Bottom Sheet 기본값
- fullscreen Search modal 기본값
- desktop center command palette 기본값
- Trips masonry
- Places View all map-first
- sticky/floating Explore CTA 기본값
- Ghost Save → My Places
- Saved 를 Scheduler 가 자동 사용
- external AI import confirmation CTA (`Add to My Trip?` 류)
- external AI re-optimization (`Optimize with KoreaMate`)
- raw private external AI conversation 기본 저장
- `From AI` 공개 discovery filter
- global bottom nav redesign
- `Be the first to update this place!` 식 contribution pressure

## 18. Future Ideas — `FUTURE_CANDIDATE` (보존, 미구현)

- **A. Same place, different month** — 공개 Story/photo + 실제 여행 시기가 쌓이면 같은 장소의 3월/7월/9월/11월 분위기를 실제 사진으로 비교하는 seasonal discovery. 현재 구현 안 함.
- **B. Trip lineage** — 공개 Trip 의 copy/variation 계보(`Based on 3 Days in Busan · 12 variations`). 장기 UGC 구조. 현재 구현 안 함.
- **C. Public Story → Home Cover** — 명시적 공개/동의된 Story photo 를 Home Cover 콘텐츠 후보로. privacy/credit/consent 별도 설계 필요. 현재 구현 안 함.
- **D. Time / Weather contextual photography** — 시간대/날씨에 따라 hero photography mood 를 조용히 조정하는 micro-personalization. 현재 오픈 범위에 넣지 않음.

## 19. Open Decisions After This Document — 전부 `OPEN_DECISION`

- **HOME 1**: exact photography · exact final copy · image/video 여부 · exact Search styling
- **TRANSITION**: parallax amount · snap/no snap · curtain visual treatment · easing/duration · desktop/mobile exact motion
- **RETURNING USERS**: session rules · day thresholds · active-trip behavior · state persistence
- **HOME 2**: cross-city Trips 정확한 개수 · exact card presentation · exact city ordering · exact city card shape
- **SEARCH**: precise result ranking · fuzzy rules · exact empty state · exact thumbnail grammar · Story result 향후 활성화 · AI link parsing/fallback
- **CITY HUB**: exact hero design · exact trip card design · exact place card design · exact copy · exact Explore CTA styling
- **VIEW ALL**: P1 trip-length filter 포함 여부 · place grid vs list exact layout · future ranking thresholds
- **UGC / FUTURE**: cover photo consent · Trip lineage policy · Same-place-month eligibility · time/weather personalization rules

Claude/Fable 이 이 OPEN 항목을 임의로 CLOSED 하지 않는다. (외부 LLM 의견 수집은 종료 — 추가 수집은 OPEN action 이 아니다.)

## 20. Design Review Contract

향후 Home visual proposal 을 만들거나 평가할 때 이 문서를 먼저 읽고 다음 15개를 검사한다:

1. Home 1 이 forced intro 가 되었는가?
2. Home 1 Search 와 Home 2 Search 의 continuity 가 살아 있는가?
3. Home 1→2 가 자연스러운 vertical flow 인가?
4. Search 가 사용자가 시작한 자리에서 작동하는가?
5. Search 가 mobile bottom sheet / fullscreen modal 로 퇴행했는가?
6. Home 2 에 콘텐츠가 과도하게 늘어났는가?
7. City Hub 가 Explore 처럼 복잡해졌는가?
8. Trips→Places→Explore hierarchy 가 유지되는가?
9. View all Trips 가 비교 가능한가?
10. View all Places 가 두 번째 Explore 가 되었는가?
11. External AI import 에 확인/re-optimize 단계가 다시 생겼는가?
12. Saved/My Places/This Trip 의미가 바뀌었는가?
13. 기존 mobile IA 가 임의 변경됐는가?
14. 사진보다 UI chrome 이 주인공이 되었는가?
15. 사용자가 다음 행동을 고민해야 하는가?

**시각적으로 예쁘더라도 위 contract 와 충돌하면 디자인을 우선하지 않는다.**

## 21. Relation To Existing Docs

| 문서 | 관계 |
|---|---|
| `home-discovery-external-ai-product-direction-ssot-v1.md` (LEVEL 1) | 상위 방향 SSOT. 이 문서는 그 §16 OPEN 중 Home 1↔2 관계·Search interaction·Home 2 구조·City Hub 계층·View all 성격·Explore 경계를 닫는 child decision layer |
| `home-experience-decision-v1.md` | **1 route 좌우 스와이프 2면 구조**는 본 문서 §5 Cover→Floor 수직 연속으로 supersede. 하단 내비 5탭 등 그 외 결정 유지. history 삭제 없음 |
| `home-experience-contract-v1.md` | 과거 구현 계약(08-02 시안 기준) — authoritative visual SSOT 로 복원하지 않는다. 향후 디자인은 LEVEL 1 + 이 문서 기준 |
| `picks-trip-memory-lifecycle-decision-v1.md` · `content-action-semantics-v1.md` | 유지 — §14 Save guard 는 그 결정들과 일치 |
| `../architecture/post-launch-place-delivery-scaling-v1.md` | View all 확장 시 place delivery 상한·정책은 그 문서를 따른다 |

## 22. Decision Summary

| 항목 | 상태 |
|---|---|
| Seamless Context Flow + 4원칙 | `OWNER_DECISION` |
| Progressive Disclosure 계층(Home→City Hub→View all/Explore) | `OWNER_DECISION` |
| Home 1 = COVER (photography protagonist) | `OWNER_DECISION` |
| Home 1 Search entry | `OWNER_DECISION` |
| Cover→Floor 수직 연속(Start wizard 금지) | `OWNER_DECISION` |
| Search 의 Home 2 상단 dock continuity | `OWNER_DECISION` |
| Returning user 원칙(유지 + 비강제) | `OWNER_DECISION` (세부 OPEN) |
| Home 2 = Search + 5도시 + trips ~3 | `OWNER_DECISION` |
| Anchored Inline Search (mobile/desktop 동일 모델) | `OWNER_DECISION` |
| One Unified Mixed List (탭 분리 금지) | `OWNER_DECISION` |
| External AI = Search 숨은 능력, silent import | `OWNER_DECISION` |
| City entry shared-element continuity | `OWNER_DECISION` |
| City Hub Trips→Places→Explore | `OWNER_DECISION` |
| Explore CTA 흐름 끝 배치(sticky 기본 금지) | `CURRENT_UX_DIRECTION` |
| View all Trips = Structured Editorial Feed | `CURRENT_UX_DIRECTION` |
| View all Places = 추천 확장(기본 map 없음)·canonical Place Detail 유지 | `CURRENT_UX_DIRECTION` |
| Save/My Places/This Trip semantics 불변 | `OWNER_DECISION` |
| mobile 하단 5탭 IA 유지 | `OWNER_DECISION` |
| 폐기 아이디어 17종 | `REJECTED` |
| 장기 아이디어 A~D | `FUTURE_CANDIDATE` |
| visual/motion/ranking/parser 세부 | `OPEN_DECISION` |
