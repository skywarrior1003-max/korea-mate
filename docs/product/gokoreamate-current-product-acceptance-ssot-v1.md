# gokoreamate Current Product Acceptance SSOT v1 (2026-09-08)

기록 태스크: TASK-GOKOREAMATE-CURRENT-PRODUCT-ACCEPTANCE-SSOT-V1 (DOCUMENTATION ONLY).

2026-09-08 현재 Owner·GPT 가 다시 확인·확정한 **현재 제품 상태와 최신 제품 계약**의
authoritative 요약이다. 이 문서의 존재 이유: 앞으로 Claude/Fable/GPT 가 과거
완료보고·옛 디자인·부분 구현 상태를 혼동하거나, **"기능이 있으니 최종 디자인까지
완료됐다"** 라고 잘못 판단하지 않게 하는 현재 제품/Acceptance 기준을 한 곳에 둔다.

## 0. Authority

기준 우선순위:

1. 최신 Owner 결정
2. actual repo / code / Production
3. **이 문서** (`gokoreamate-current-product-acceptance-ssot-v1.md`)
4. 과거 SSOT / 디자인 / 완료보고

- `gokoreamate-current-work-order-ssot-v1.md` 의 본선 ①~⑥ 은 **CLOSED 된 역사적
  Work Order** 로 유지한다. 그 문서의 "Weather 제품 계약 — Owner Decision
  2026-09-08" 섹션도 삭제하지 않는다(내용은 본 문서 §3 에 통합 반영됨).
- 과거 문서와 최신 Owner Decision 이 충돌하면 과거 기록을 삭제하지 않고
  `SUPERSEDED BY OWNER DECISION 2026-09-08` 등으로 현재 기준을 표시한다.
- 기록 시점 기준선: Production = master = `1d8541b`, weather 계약 기록 커밋
  `6ccb48c` 는 feature branch 에만 존재(master 미반영).

## 1. CURRENT PRODUCT STATUS — CLOSED (기능적 완료)

아래는 Production 실브라우저 검증을 거친 **기능적** 완료 상태다.
(§11-2: 기능 존재 ≠ 최종 visual design 완료.)

### 1.1 Five-city Planner
Busan · Seoul · Jeju · Gyeongju · Jeonju — 5도시 Production LIVE.

### 1.2 AI Personalization
Production LIVE. 현재 계약:

```
Rule Scheduler → Gemini preference profile / weights → Rule feasibility constraints
```

Gemini 가 전체 itinerary 를 자유 생성하지 않는다.

### 1.3 External URL Import
Production LIVE.

- gokoreamate shared URL → shared flow
- external itinerary → Preview → My Trip
- single place → Preview → Saved
- multi-place content → Preview → selected → This Trip
- auto-save 금지 · imported itinerary 를 Scheduler 가 임의 재생성하지 않음

### 1.4 My Trip core
실제 Production browser 검증 완료: itinerary · day · place add/remove ·
time edit · photo/moment · title/memo edit · Naver/Google handoff · save/re-entry.

### 1.5 My Trip ↔ Story data contract
**My Trip = record/edit SSOT. Story = 같은 Trip content 의 다른 visual/expression
view.** 별도 Story title/memo/photo copy 를 만들지 않는다. My Trip 변경 → Story
반영. user-facing standalone `Memory` 개념은 사용하지 않는다.

### 1.6 Shared Story functional
public shared Story · incognito consumption · privacy check(누출 0) · + My Trip ·
copied itinerary — 기능적 PASS.

**매우 중요: `Shared Story functional PASS` ≠ `Story final visual fidelity PASS`.**

### 1.7 First Trip Journey Guide
최신 Golden Path 실검증 완료: first-user auto-start · contextual/non-blocking ·
current UI 정확 지칭 step · 한 번에 1 coach · legacy coach 충돌 0 · Tips ON →
OFF → 다시 ON · Replay · finale 의 More(…) Tips/Replay 안내 · returning user
자동 강제 재시작 없음. **current functional PASS.**

### 1.8 Blog / Events / Essentials
내부 detail → official source 흐름 Production functional PASS.

### 1.9 Golden Path functional loop
Home/Discovery → Saved → This Trip → Planner → My Trip → Photo → AI Writing →
Story → Share → Shared Story → + My Trip — 핵심 기능 루프를 실제 Production 에서
완주(2026-09-07, TASK-GOKOREAMATE-PRODUCTION-GOLDEN-PATH-ACCEPTANCE-V1).

단, **Planner HC-2 와 visual/product audit 가 남았으므로 전체 Launch Acceptance
완료라고 쓰지 않는다.**

## 2. CURRENTLY OPEN / AUDIT REQUIRED

아래를 CLOSED 로 추정하면 안 된다.

### A. Planner Opening Hours HC-2 — CLOSED (2026-09-08, master c4c8ab4)
Golden Path 에서 실제로 폐관 이후 박물관/사찰 등이 일정에 배치됨 → HC2-PRODUCTION-V1
로 KNOWN structured hours 를 엔진 feasibility 에 실적용하고 Production QA PASS. → §9.
잔여 사실(데이터): structured hours 는 busan 17·gyeongju 47·seoul 531 = 595곳이며,
Golden Path 의 실제 위반 장소(석당박물관·용궁사)는 opening_hours NULL(UNKNOWN)이라
계약상 계속 배치 가능 — 이들을 막으려면 별도 Owner 승인 데이터 태스크가 필요하다.

### B. City Hub final visual — AUDIT REQUIRED
Owner 판단: Home 의 warm/nostalgic/답답한 분위기가 City Hub 까지 이어진다.
과거 Blue normalization 완료보고만으로 현재 visual acceptance 를 CLOSED 처리하지
않는다. → §4.

### C. City Hub Weather — NOT CURRENTLY IMPLEMENTED
2026-09-08 actual repo audit: City Hub 에 weather UI 없음. 최신 Owner 계약 → §3.

### D. My Trip Weather — KEEP / STAGE A
기능은 존재하나 실제 forecast/기온 연결 없음. `WeatherLinkChip` STAGE A —
`날씨 보기` 표기, weather.go.kr 공통 홈 링크(도시별 아님). **삭제 금지.**
연결 상태 audit/implementation 필요. → §3.

### E. Living Map — AUDIT REQUIRED
과거 final design/계약 존재. 현재 Production 의 실제 최종 구현 여부는 미확정.
audit 전 CLOSED 선언 금지. → §5.

### F. Story final visual fidelity — AUDIT REQUIRED
data/function 은 PASS. final approved photo-led Story 와 current Production 의
visual fidelity 비교는 AUDIT REQUIRED. → §6.

### G. 9:16 Share Image — VISUAL ACCEPTANCE OPEN
생성 기능은 있으나 Owner 판단 "약하다". → §7.2.

### H. Share Link Preview / OG — AUDIT REQUIRED
9:16 과 별개 surface. 현재 공유 URL preview 의 image/title/description/domain
표현이 약한 것으로 Owner 관찰. → §7.3.

### I. AI Writing quality — AUDIT / IMPROVEMENT REQUIRED
Gemini LIVE = infrastructure PASS 일 뿐. writing quality, 특히 `유머와 재치, 센스`
는 CLOSED 아님. 실제 실패 예: `부산 2박3일 웃음꽃피우다`. → §8.

## 3. WEATHER — 최신 Owner 계약 + 실측 결과

### 3.1 Actual repo finding — 2026-09-08

TASK-GOKOREAMATE-WEATHER-PRODUCT-CONTRACT-RECORD-V1 실측:

- **City Hub**: 현재 weather UI 없음. 과거 `CityHubClient` 코드 주석
  "지도·필터·랭킹·날씨는 넣지 않는다" 가 존재하며, 이 중 **weather 부분은
  2026-09-08 Owner Decision 으로 SUPERSEDED** (주석 자체는 후속 구현 태스크에서 갱신).
- **My Trip**: `WeatherLinkChip` 존재. **STAGE A** — 실제 예보/기온 미연동이라
  기온을 지어내지 않는 정직한 link-only 단계. 표기는 `날씨 보기`, 링크는
  weather.go.kr **공통 홈**(city-specific destination 아님).

### 3.2 City Hub Weather — 최신 Owner 계약

City Hub 에 작고 조용한 weather utility 를 제공한다. 표현 수준은 `☀️ 26°C` 정도.

- 허용: weather icon + current temperature.
- 추가하지 않는다: 최고/최저 · 강수확률 카드 · 7-day dashboard · 큰 weather
  module · 복잡한 기상 UI.
- 원칙: **gokoreamate 는 기상 서비스가 아니다.** Weather 는 여행 결정을 위한
  작은 utility 다.

### 3.3 City-based, NOT GPS-based

City Hub weather 기준은 사용자의 현재 GPS 가 아니라 **현재 탐색 중인 여행 도시**다.
Busan Hub → Busan / Seoul Hub → Seoul / Jeju Hub → Jeju / Gyeongju Hub →
Gyeongju / Jeonju Hub → Jeonju. (해외에서 계획하는 사용자의 GPS 는 여행 도시와 무관.)

### 3.4 Weather click

weather icon + temperature 영역은 클릭 가능하며, 클릭 시 **그 도시의** weather
detail/source 로 간다. Busan 에서 클릭하면 Busan, Seoul 에서 클릭하면 Seoul.
GPS current-location weather 금지 · generic Korea destination 금지.
후속 audit 에서 기존 approved provider/link 를 찾아 유지/복구한다 —
**새 weather provider 를 임의 발명하지 않는다.**

### 3.5 My Trip Weather — KEEP (매우 중요)

My Trip 의 현재 weather 기능은 유지한다. 삭제 금지 · 숨김 금지 · City Hub
weather 로 대체 금지 · City Hub 추가를 이유로 축소 금지.

- City Hub Weather = 여행지를 **탐색**할 때 보는 도시 weather utility.
- My Trip Weather = 사용자가 만든 **Trip/Day 문맥**에서 보는 날씨.

현재 My Trip Weather 는 STAGE A / generic weather.go.kr link 상태다. 후속 audit
에서 과거 승인 weather-before/after 디자인 + git history + 현재 코드 + Production
을 비교해 원래 intended destination/data 연결을 확인한다.

## 4. CITY HUB — 최신 visual 계약

**Home 과 City Hub 는 같은 분위기로 이어지면 안 된다.**

- Home = travel memory · editorial · warmth · emotion · photography.
- City Hub = 도시로 진입한 순간 **"이제 여행이 시작된다"** 는 느낌:
  시원함 · 산뜻함 · **Blue family** · 밝고 깨끗한 surface · photography 유지 ·
  clear hierarchy · start/exploration energy.

현재 Owner 관찰: Production City Hub 에 Home 의 warm/nostalgic background 느낌이
너무 남아 있어 답답하다. → **VISUAL AUDIT REQUIRED.**
단순히 CTA/버튼만 파랗게 만드는 것으로 완료 처리 금지.

Audit 대상: first viewport · page background · hero treatment · card surfaces ·
section hierarchy · blue usage · Home→City Hub 전환감 · 5도시 consistency.

## 5. LIVING MAP — 최신 Owner 계약

Living Map 은 navigation app 이 아니다. 목적:
**"내가 이 여행에서 어디를 어떻게 돌아다녔는지를 사진과 순서로 한눈에 회고하는
지도."** 실제 길찾기는 계속 Naver/Google.

### 5.1 Marker priority
1. 그 장소에서 사용자가 찍은 **사진 + 방문 순번**
2. 사용자 사진 없으면 **catalog 대표사진 + 방문 순번**
3. 둘 다 없으면 **숫자 marker**

### 5.2 Photo shape
**사진을 원형 crop 하지 않는다.** 사용자 사진/장소 사진은 **사각형 형태 그대로**
크기만 축소해 표현. avatar/profile-style circular marker 금지.

### 5.3 Numbering
방문 번호는 전체 여행 누적이 아니라 **각 Day 마다 1부터 reset**.

```
DAY 1: 1 → 2 → 3 → 4
DAY 2: 1 → 2 → 3
DAY 3: 1 → 2 → 3 → 4
```

금지: DAY 1 = 1~4, DAY 2 = 5~8, DAY 3 = 9~12.
(Day 자체가 강한 구분 정보 — 높은 누적 숫자는 인지부하만 높인다.)

### 5.4 Audit required (확인 전 구현 완료 선언 금지)
approved living_map_final · current entry point · current route/mode ·
user photo marker · catalog image fallback · number fallback · rectangular
photo · Day-reset numbering · actual itinerary order · completed trip access ·
mobile layout.

## 6. STORY — 현재 제품 계약

Story 는 itinerary list 가 아니다. My Trip 의 같은 Trip content 를 **photo-led
travel journal** 처럼 표현하는 surface. 중심 = 여행 사진과 여행 흐름.

Audit 항목: cover/large photography · trip title · date/city · Day chapters ·
places · user photos · catalog photos · memo · visual journey flow ·
route/map context(approved design 에 있다면) · end summary · Share · + My Trip ·
management controls 가 Story 보다 튀지 않는가.

현재: **FUNCTIONAL = PASS / FINAL VISUAL FIDELITY = AUDIT REQUIRED.**

## 7. SHARE — 서로 다른 3개 surface (혼동 금지)

### 7.1 Shared Story — Functional PASS
공유 URL 클릭 후 gokoreamate 안에서 보는 실제 Trip/Story.

### 7.2 9:16 Share Image — Visual Acceptance OPEN
SNS 에 이미지 자체로 공유하는 자산. 기능은 존재하나 Owner visual acceptance OPEN.
Audit: photography dominance · crop · user/trip identity · title ·
memo/personality · places/day context · template 느낌 여부 · **"SNS 에 실제
올리고 싶은가".** Living Map 을 9:16 카드에 자동 삽입하는 것으로 문제를 해결하지
않는다 — 두 surface 는 별개.

### 7.3 Share Link Preview / OG — Audit required
URL 을 Kakao/Messenger/X 등에 공유했을 때 나오는 preview. 검증: OG image ·
OG title · description · domain · canonical · current public URL · correct
Shared Story destination · city/trip-specific image/content · fallback.
Owner 관찰: 현재 page/address 중심으로 보여 share preview 가 약함.

## 8. AI WRITING — 최신 제품 계약

3 directions 유지: ① 절제된 담담하고 부담스럽지 않은 ② 유머와 재치, 센스
③ 감성적인. **AI provider LIVE 여부와 writing quality 를 혼동하지 않는다.**

### 8.1 Witty 정의
`유머와 재치, 센스` 는 웃긴 단어/유행어 삽입 스타일이 아니다. 실제 context —
place · photo(가능한 범위의 subject/context) · food/landscape/moment ·
user memo · Day · time · actual trip situation — 를 기반으로, 해당 언어권
사람이 자연스럽게 쓸 법한 **짧은 관찰 · 상황형 재치 · 반전 · understatement ·
가벼운 meme/slang 감각**을 선택적으로 사용.

### 8.2 Generic travel copy = FAIL
KO witty 에서 다음 계열을 좋은 결과로 판정하지 않는다: 웃음꽃 피우다 · 행복 가득 ·
추억 가득 · 낭만 가득 · 힐링 여행 · 설렘 가득 · 특별한 순간 · 잊지 못할 여행.
실제 발생한 실패 예: **`부산 2박3일 웃음꽃피우다`**.

### 8.3 Desired direction 예 (기계적 복사 금지 — 맥락이 뒷받침될 때의 감각 예시)
- `계획은 관광, 결과는 다섯 끼.`
- `부산에서는 길보다 메뉴를 더 많이 바꿨다.`
- 광안리 사진/상황이 자연스럽게 맞을 경우: `광안리 야호!`
- 식사 context 가 자연스럽게 맞을 경우: `밥은 줍니까?`

원하는 것은 generic tourism copy 가 아닌 **사람다운 맥락형 센스**다.

### 8.4 Locale-native (매우 중요)
**한국어 결과를 만든 뒤 EN/JA/ZH 로 번역하는 구조 금지.** KO/EN/JA/ZH 각각
독립 writing — 각 언어권의 humour · cadence · understatement · internet
language · cultural tone 에 맞게 작성. 같은 여행이라도 언어별 표현이 달라지는
것이 정상.

### 8.5 Trend / meme
유행어·밈은 context 가 정확히 맞을 때만 선택적으로. 억지 삽입 금지 · 남발 금지 ·
아재개그화 금지.

### 8.6 Future quality learning opportunity
향후 사용자 행동(candidate 그대로 채택 / 일부 수정 / 전면 수정 / regenerate /
style 재선택)은 품질 개선 신호가 될 수 있다. 단 **"AI 가 자동으로 사용자를
학습한다" 고 가정/표현 금지.** 향후 별도 제품 설계로 locale · context category ·
AI candidate · final accepted wording · edit distance · regenerate ·
accept/use signal 같은 **비식별** 품질 신호 활용을 검토한다. 초기에는
`locale-specific owner-approved / high-acceptance example bank` 방식부터 검토
가능. **private photo / private memo 를 몰래 training data 화하지 않는다.**

## 9. PLANNER OPENING HOURS / HC-2 — CLOSED (2026-09-08)

Golden Path 실측 문제: 폐관 시간 뒤에 박물관/사찰 등 일정 배치 발생.

목표: **기존 structured opening_hours 가 있는 장소에** Scheduler feasibility
constraint 를 실제 적용.

금지: 전국 영업시간 재수집 · raw 자연어 억지 parsing · NULL 추측 · 데이터
closeout 재개.

- KNOWN structured hours → constraint 적용.
- UNKNOWN → 거짓으로 open 이라고 보장하지 않되, 현재 fallback 계약 유지.

**HC-2 완료보고 전 전체 Launch Acceptance CLOSED 선언 금지.**

완료 기록(2026-09-08, TASK-GOKOREAMATE-PLANNER-OPENING-HOURS-HC2-PRODUCTION-V1,
master `c4c8ab4`): KNOWN {open,close} 를 후보·This Trip 픽에 부착해 엔진 후보
루프(점수 산정 전 — AI 가중치가 못 이김)와 reorder 재계산에 적용, Fixed 는
운영시간 밖이면 전용 4-locale 고지(fixedHoursTitle)로 분리. UNKNOWN/malformed
는 추측 없이 기존 fallback. Busan PRIMARY 3 runs + 5도시 회귀 + Seoul KNOWN
검증 전부 Production 실브라우저 PASS.

## 10. CURRENT APPROVED WORK SEQUENCE

- **PHASE 1** — HC-2 상태 분리 및 완료. 다른 visual/product 작업과 섞지 않고
  그 task 만 완료/배포/보고.
- **PHASE 2** — Fable + GPT Visual/Product Audit (READ-ONLY). 검증:
  ① City Hub Blue/Fresh ② City Hub Weather ③ My Trip Weather ④ Living Map
  ⑤ Story ⑥ Focus ⑦ 9:16 Share Image ⑧ Share Link Preview/OG
  ⑨ AI Writing context+output quality.
- **PHASE 3** — Owner + GPT + Fable 공동 판정. **Fable 의 PASS 보고만으로
  visual acceptance 완료 금지.** APPROVED DESIGN | CURRENT PRODUCTION 의
  PNG / comparison HTML / evidence ZIP 을 Owner 와 GPT 가 직접 본다.
- **PHASE 4** — 최종 Product/Visual contract 확정.
- **PHASE 5** — Audit 결과 기준으로 surface 묶음 구현(실제 범위는 Audit 후
  Owner 최종 승인). 예상 묶음:
  A. Travel Discovery(City Hub visual · compact city weather)
  B. Travel Memory(Living Map · Story visual fidelity · Focus)
  C. Sharing(9:16 Share Image · Share Link Preview/OG)
  D. AI Writing(locale-native prompt · actual context quality ·
  generic-copy suppression)
- **PHASE 6** — Production Visual/Product Acceptance. 실제 한 여행:
  Home → City Hub → Weather → Saved → Planner → My Trip → Photo → Living Map →
  AI Writing → Story → Focus → 9:16 → Share URL → incognito Shared Story →
  + My Trip 실브라우저 검증.
- **PHASE 7** — Commercial / Affiliate E2E. 파트너사는 별도로 이미 준비되어
  있음. 현재 visual/product audit 와 혼합 금지.
- **PHASE 8** — AI/API Cost & Abuse Guard: WAF · rate limit · kill switch ·
  cost protection.
- **PHASE 9** — Pre-open 해제 판단 + Final Release Readiness. **그 후에만
  `현재 버전 출시 가능` 최종 판정.**

## 11. CRITICAL GUARDRAILS

1. 과거 디자인보다 **latest Owner decision 이 우선**한다.
2. **기능이 존재한다고 final visual design 까지 완료됐다고 판정하지 않는다.**
3. Home 과 City Hub 를 같은 warm/nostalgic tone 으로 만들지 않는다.
4. City Hub = **Blue / Fresh / travel-start feeling**.
5. City Hub Weather = **icon + current temperature 정도만**.
6. gokoreamate 를 weather dashboard 로 만들지 않는다.
7. City Weather 는 GPS 기준 금지 — **selected travel city 기준**.
8. **My Trip Weather 삭제 금지.**
9. 현재 My Trip Weather 는 **STAGE A / generic weather.go.kr link** 상태임을 기억.
10. Living Map 은 navigation app 이 아니라 **travel memory visualization**.
11. Living Map user/catalog photo — **원형 crop 금지, 사각형 형태 유지**.
12. Living Map numbering — **각 Day 마다 1부터 reset**.
13. Shared Story / 9:16 Share Image / Share Link Preview 는 **서로 다른 surface**.
14. Story functional PASS 와 Story visual fidelity PASS 를 혼동하지 않는다.
15. AI provider LIVE 와 AI writing quality PASS 를 혼동하지 않는다.
16. Witty 는 **locale 별 독립 작성** — 번역식 humour 금지.
17. 사용자 행동 데이터가 자동 학습된다고 가정하지 않는다.
18. 발견했다고 제품 의미를 마음대로 변경하지 않는다 — 중요한 문제/아이디어는
    **OWNER ATTENTION** 으로 보고.

## 12. STATUS TABLE (2026-09-08)

| Surface / Item | Status |
|---|---|
| 5-city Planner | LIVE / CLOSED |
| AI Personalization | LIVE / CLOSED |
| External URL Import | LIVE / CLOSED |
| My Trip core | LIVE / CLOSED |
| Journey Guide | LIVE / CLOSED |
| My Trip ↔ Story data contract | LIVE / CLOSED |
| Shared Story functional | LIVE / CLOSED |
| + My Trip | LIVE / CLOSED |
| Blog / Events / Essentials | LIVE / CLOSED |
| Golden Path functional loop | PASS |
| Planner Opening Hours HC-2 | CLOSED (2026-09-08, c4c8ab4 — KNOWN 595곳 적용·UNKNOWN fallback 유지) |
| City Hub final visual | AUDIT REQUIRED |
| City Hub Weather | NOT CURRENTLY IMPLEMENTED / OWNER CONTRACT CONFIRMED |
| My Trip Weather | KEEP / STAGE A / CONNECTION AUDIT REQUIRED |
| Living Map | AUDIT REQUIRED |
| Story final visual fidelity | AUDIT REQUIRED |
| 9:16 Share Image | VISUAL AUDIT REQUIRED |
| Share Link Preview / OG | AUDIT REQUIRED |
| AI Writing infrastructure | LIVE |
| AI Writing witty quality | AUDIT / IMPROVEMENT REQUIRED |
| Commercial / Affiliate E2E | NOT YET ACCEPTED / SEPARATE LATER TASK |
| AI/API cost guard | OPEN |
| Final Release Readiness | OPEN |
