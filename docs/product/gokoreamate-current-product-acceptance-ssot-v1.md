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

### B. City Hub final visual — CLOSED (2026-09-08, master 51c855e)
DISCOVERY-EXPLORE-PRODUCTION-V1 로 디자인 SSOT
(`docs/design/discovery-explore-final-v1.md`) Blue/Fresh 계약 구현:
로컬 Fresh 팔레트(paper #F5F8FC) · 히어로 white-up 그라데이션 · blue eyebrow ·
warm 잔재 치환 · navy Explore CTA. → §4.
~~잔여 OWNER ATTENTION: 부산 Hero 사진 자산~~ → **RESOLVED (2026-09-11,
a5cd8b9)**: Owner 가 로컬 후보 2장을 제공, 광각 광안리(광안대교+양측
스카이라인·밝은 하늘) 선택 — `city-busan-hub-hero-v2.webp`.
`cityHubHeroVisual()` override 로 **Busan Hub 만** 교체, Home cover ·
planner cover · OG · 검색 썸네일은 기존 `city-busan-hero.jpg` 유지
(Hub≠Home 이 Owner 의도). 럭셔리 호텔 데크 야경 후보는 어둡고 무거워 탈락.

### C. City Hub Weather — SUPERSEDED (재OPEN 금지)
2026-09-08 actual repo audit 당시 "NOT CURRENTLY IMPLEMENTED / 최신 Owner 계약
→ §3" 이었으나, **2026-09-08 Owner weather scope 결정으로 SUPERSEDED**:
중기예보(My Trip Day 예보 칩, §3.5)만으로 충분하다. City Hub 현재기온 칩은
구현하지 않으며, 단기/초단기 API 추가·KMA 활용신청·새 provider 도입을 이유로
**이 항목을 다시 OPEN 으로 만들지 않는다.** → §3.2 SUPERSEDED 주석.

### D. My Trip Weather — KEEP / STAGE B LIVE (2026-09-08, master 8ec30ad)
공공데이터 KMA 중기예보(MidFcstInfoService) 로 My Trip Day 예보 칩 LIVE —
5도시 regId, taMin/taMax + wf, 제공 창(+4~+10일) 밖은 정직하게 미표시.
**삭제 금지 · 축소 금지.** 현재기온(초단기실황)은 Owner 결정으로 범위 밖. → §3.

### E. Living Map — CLOSED (2026-09-08, TRAVEL-MEMORY-PRODUCTION-V1)
승인 living_map_final 계약 구현·Production QA PASS: 마커 우선순위(사용자 사진→
카탈로그→숫자, Story 와 같은 결합 규칙 한 벌)·사각 사진+번호 배지(원형 crop 0)·
Day/Whole Trip(Whole 도 Day 마다 1부터·Day 색·범례)·STOP 시트(Directions handoff·
Add Photo=기존 캡처)·이름 pill 상시 표시 제거·base 핀 회색 강등. → §5.

### F. Story final visual fidelity — CLOSED (2026-09-08, TRAVEL-MEMORY-PRODUCTION-V1)
owner Story 에 몰입형 Cover + Journey Summary + map context(Living Map 읽기 전용
Whole Trip) 추가, 공개 Story cover 우선순위(동의 지정 cover→공개 사진→대표성
카탈로그 — 단순 첫 장 금지). 콜라주/인용 리듬·Day 챕터는 기존 승인 구현 유지.
(정정 2026-09-09, SHARED-STORY-MAP-CONTEXT-FIX-V1) "공개 Story 는 좌표 비노출
때문에 지도 없음" 이라는 과거 판단은 Owner 결정으로 폐기됐다. **최신 계약:
Shared Story 에는 large non-interactive Trip Map visual 을 포함한다. raw
coordinates / exact location discovery / navigation 기능은 제공하지 않는다.**
구현: 서버가 좌표를 상대 기하(0..1)로 투영해 소멸시킨 journeyMap 장면 —
공개 카탈로그 stop 만, 숙소/user_spot 제외, pan/zoom/click/GPS/Directions 없음.
Journal 과 Journey Summary 사이의 독립 챕터. → §6.

### F-2. Focus — CLOSED (2026-09-08, TRAVEL-MEMORY-PRODUCTION-V1)
memory_focus_view 계약의 풀스크린 trip-wide 모먼트 뷰어가 owner/공개 Story 양쪽
LIVE: 분절 progress(여행 전체 기준)·k/N·DAY·지역 칩·큰 세리프 인용·SWIPE 힌트
(첫 이동 후 소멸)·좌우 탭/스와이프/키보드·**browser back 은 Focus 만 닫음**
(pushState 계약). 캡션 pointer-events 통과로 하단 탭 결함 수정.

### G. 9:16 Share Image — CLOSED (2026-09-09, SHARING-VISUAL-PRODUCTION-V1)
사진 전면 + **실제 Trip title 우선**(generic 덮어쓰기 0) + 사용자 memo 인용 +
조용한 wordmark. 이미지 우선순위: 공개 사용자 사진 → 대표 카탈로그
(representativeCoverUrl, CORS 시도) → 승인 도시 자산 → designed 잉크 fallback
(orange 포스터 제거). 긴 제목 CJK 폭 티어·말줄임, locale 사람 날짜(Intl),
eyebrow 폭 fit. Blind quality "SNS 에 올리고 싶은가" = YES. → §7.2.

### H. Share Link Preview / OG — CLOSED (2026-09-09, SHARING-VISUAL-PRODUCTION-V1)
og/twitter title = **실제 Trip title**(없을 때만 "N-Day City Trip"),
description = 사실 요약 "City · N days · M places · dates"(광고문 제거),
og:image = 동의 개인 cover → 대표 카탈로그(공개 순간 가중) → tourism 자산 →
5도시 designed fallback(jeonju 포함 — 과거 누락 해소) → 브랜드.
비공개/미존재 = 브랜드 메타만. meta description·canonical 포함. → §7.3.

### I. AI Writing quality — CLOSED (2026-09-11, e48466a — locale fact grounding)
3단 개선으로 종결: ① 품질 개편(ced1df5, §8.7) ② witty 1024+1800·parser
guard(58aaf43, §8.8) ③ **locale fact grounding**(e48466a, §8.9 — DB 가 아는
locale 사실은 DB 값 그대로, AI 는 그 안에서 문장만). LIVE 반복 72회에서
한글 오염·발명 음차·国饭류 어휘 오류·사진행동 발명·fake event **전부 0** →
**witty = CLOSED · AI Writing Quality bundle = CLOSED**. Owner FAIL 예
`부산 2박3일 웃음꽃피우다` 계열 광고카피는 영구 FAIL 기준으로 보존. → §8.

## 3. WEATHER — 최신 Owner 계약 + 실측 결과

### 3.1 Actual repo finding — 2026-09-08

TASK-GOKOREAMATE-WEATHER-PRODUCT-CONTRACT-RECORD-V1 실측:

- **City Hub**: 현재 weather UI 없음. 과거 `CityHubClient` 코드 주석
  "지도·필터·랭킹·날씨는 넣지 않는다" 가 존재하며, 이 중 **weather 부분은
  2026-09-08 Owner Decision 으로 SUPERSEDED** (주석 자체는 후속 구현 태스크에서 갱신).
- **My Trip**: `WeatherLinkChip` 존재. **STAGE A** — 실제 예보/기온 미연동이라
  기온을 지어내지 않는 정직한 link-only 단계. 표기는 `날씨 보기`, 링크는
  weather.go.kr **공통 홈**(city-specific destination 아님).

### 3.2 City Hub Weather — SUPERSEDED (원문 보존)

> **SUPERSEDED — 2026-09-08 Owner weather scope 결정.** 아래 원문(당시 Owner
> 계약)은 기록으로 보존하되 더 이상 요구사항이 아니다. Owner 최신 결정:
> **"중기예보만으로 충분하다."** City Hub 현재기온 칩은 구현하지 않는다.
> 단기예보/초단기실황 API 추가 금지 · KMA 활용신청 요구 금지 · 새 weather
> provider 도입 금지 · My Trip Weather(§3.5, LIVE) 변경 금지. 가짜 현재온도
> 표시는 어떤 경우에도 금지. **이 항목을 다시 OPEN 으로 만들지 않는다.**

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

(갱신 2026-09-08) My Trip Weather 는 **STAGE B LIVE** — 공공데이터 KMA
중기예보(MidFcstInfoService, Owner 확정 provider) 로 Day 예보 칩(최저/최고 +
하늘상태 glyph) 이 Production 에 연결되었다(master 8ec30ad). 제공 창(발표 기준
+4~+10일) 밖 날짜는 지어내지 않고 미표시. 2026-09-08 Owner weather scope 결정:
**여기까지가 weather 의 전부다** — 추가 확장(단기/초단기·현재기온·새 provider)
금지, 이 기능 자체는 KEEP(삭제/축소 금지).

## 4. CITY HUB — 최신 visual 계약

**Home 과 City Hub 는 같은 분위기로 이어지면 안 된다.**

- Home = travel memory · editorial · warmth · emotion · photography.
- City Hub = 도시로 진입한 순간 **"이제 여행이 시작된다"** 는 느낌:
  시원함 · 산뜻함 · **Blue family** · 밝고 깨끗한 surface · photography 유지 ·
  clear hierarchy · start/exploration energy.

(갱신 2026-09-08) 위 계약은 DISCOVERY-EXPLORE-PRODUCTION-V1(master 51c855e) 로
구현 완료 — page background Fresh #F5F8FC · 히어로 하단 white-up 그라데이션(어두운
바닥 scrim 제거) · blue eyebrow 헤딩 · cool line/ink 토큰 치환 · navy Explore CTA ·
5도시 동일 컴포넌트라 consistency 자동 확보. 상세 계약은
`docs/design/discovery-explore-final-v1.md` §4 가 기준.
잔여였던 부산 Hero 사진 자산은 2026-09-11 Owner 제공 자산으로 교체 완료(§2.B).

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

### 7.2 9:16 Share Image — CLOSED (2026-09-09 — §2.G 구현 내역)
SNS 에 이미지 자체로 공유하는 자산. (원문 보존 — 아래는 당시 audit 항목.)
Audit: photography dominance · crop · user/trip identity · title ·
memo/personality · places/day context · template 느낌 여부 · **"SNS 에 실제
올리고 싶은가".** Living Map 을 9:16 카드에 자동 삽입하는 것으로 문제를 해결하지
않는다 — 두 surface 는 별개.

### 7.3 Share Link Preview / OG — CLOSED (2026-09-09 — §2.H 구현 내역)
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

### 8.7 구현·검증 기록 — 2026-09-09 (ced1df5 · Worker 재배포 포함)

AI-WRITING-QUALITY-PRODUCTION-V1 로 prompt/context 만 개편(provider ·
gemini-2.5-flash · Seoul Worker placement · retry 0 · timeout · 실패 무해 계약
전부 무변경). 구현된 품질 계약:

- **Context enrichment (privacy-safe)**: title 요청에 `tripFacts` —
  일정에서 결정적으로 셈한 사실만(길이·stop 수·food/cafe 비중·상위 카테고리·
  대표 장소명 최대 6, 숙소 제외). raw 좌표·device·내부 경로 전달 금지 유지.
  memo 요청에 trip title 전달.
- **Locale-native**: KO/EN/JA/ZH 독립 voice(§8.4) + locale isolation
  (비KO 출력에 한글 0 · 고유명사 창작 번역/음차 금지 — context 표기 그대로
  또는 일반명사).
- **Generic-copy 억제**: 금지어 명시(웃음꽃·행복/추억/낭만/설렘 가득·힐링·
  특별한 순간·잊지 못할·소중한 추억·행복한 시간·배꼽) + witty craft 지시
  (관찰·반전·understatement, 직유/의인화 남발 금지).
- **Fact discipline**: 사진 내용·식사/구매·동행·시간대/날씨·재방문 단정 금지,
  no-draft 시 사건 발명 금지, 답 전 self-check(근거 없는 구체 주장 삭제).
- **Draft 우선**: 사용자 draft 의 유머/관찰은 flatten 하지 않고 보존(§10 계약).
- **생성 설정**: direction별 temperature(calm 0.6/witty 0.9/warm 0.75),
  witty thinkingBudget 512(그 외 256) — 모델/provider 변경 아님.

검증: 12 컨텍스트×3방향×4locale 실측 7라운드 + blind 리뷰 수렴, LIVE
Production QA(전 호출 ai_status=live, witty title 재생성 5회 전부 상이·데이터
근거·클리셰 0), UI e2e(실 트립 tripFacts 경유 확인). 결과 —
**restrained/emotional/locale-native/generic 억제/draft 보존 = 검증 완료**,
**witty = IMPROVED(단발 생성 ~15% 잔존 결함, flash+현 설정의 확률적 한계로
판정) — CLOSED 로 선언하지 않는다.** 잔여 레버(모델 상향·thinking 추가 증액·
2-candidate best-of(비용 2배)·§8.6 example bank/quality-signal)는 전부
**Owner 결정 사항**이며 임의 적용 금지. §8.6 의 auto-learning 금지 계약 유지.

### 8.8 WITTY-CLOSURE 시도 기록 — 2026-09-11 (58aaf43 · Worker 4c2083d9)

Owner 승인으로 canary 검증분만 Production 적용:

- **witty 전용 생성 예산**: thinkingBudget 1024 + maxOutputTokens 1800 세트
  (gemini-2.5-flash 는 thinking 토큰이 maxOutputTokens 에 포함 — 세트가
  아니면 JSON 절단, canary 실측). calm/warm/기본 경로 무변경(LIVE 교차 확증:
  calm 2.2~2.8s vs witty p50 5.3s). provider/model/Seoul placement 무변경.
- **parser safety guard CLOSED**: extractSuggestion 이 파싱 실패 시 raw
  provider text 를 승격하던 잠재 결함 제거 — malformed/truncated/unexpected
  응답은 null(honest fallback), code-fence JSON 재시도만 유지. raw payload
  사용자 노출 0 을 테스트로 고정.
- **LIVE 48회 반복 QA**(witty 4컨텍스트×4locale×3회): 48/48 live ·
  rawJSON/금지어/draft 유실 0 · latency p50 5.33s / max 6.89s(8s 내) ·
  밋밋함 희소, food-heavy title 전부 데이터 근거형.
- **판정: PARTIAL — witty 는 여전히 CLOSED 아님(IMPROVED 유지).**
  meaningful BAD 6/48(12.5%) 반복: ① ZH 어휘 오류(국밥→国饭 1회) +
  한글 혼입(国밥 ZH·JA 각 1회) ② 고유명사 발명 음차(ファンファン通り 1회)
  ③ hasPhoto:false 인데 사진 행위 발명(JA 1회) ④ 사건 단정 경계선(KO 1회).
  thin-context/locale 어휘 계열은 thinking 으로 해결되지 않음이 재확인 —
  thinking 추가 증액으로 억지 해결 금지(Owner 지시). 잔여 레버는 §8.7 그대로
  Owner 결정. 증거 tmp/gokoreamate-witty-closure-production-v1/.

### 8.9 LOCALE FACT GROUNDING — CLOSED (2026-09-11, e48466a · Worker 5392487a)

§8.8 잔존 결함(한글 혼입·음차 발명·国饭·사진행동 발명·사건 단정)의 근본 원인을
**첫 호출 입력**에서 제거. thinking/모델/2-candidate 무변경(1 action = 1 call 유지).

- **Locale name grounding 계약**: 결합 캡처 3경로(타임라인·PlaceModal·Living
  Map)가 `aiPlaceName` = requested-locale canonical(l10nOf→localizedPlaceName)
  을 AI 컨텍스트에만 병렬 전달 — 저장 placeName/표시 데이터 무변경. title
  tripFacts 장소명도 locale 해석. **fallback**: 해당 locale l10n 이 없으면
  원문 이름 그대로(번역 창작 0), 자유 순간은 사용자 입력 이름 = proper noun.
- **Allowed-facts writing 계약**: 프롬프트가 ALLOWED FACTS / FACT RULES 구조 —
  "없는 정보 = UNKNOWN(발명 허가 아님)", 고유명사 IMMUTABLE(번역·음차·개명
  금지), 한식 어휘 신조 번역 금지, 사건 단정 금지, thin-context 는
  FACTUAL BEATS FUNNY.
- **hasPhoto 사실 계약**: 양방향 명시 — false 면 "찍지 않았다"(사진행동 서술
  금지), true 면 존재만 알고 내용 단정 금지.
- **좁은 결정적 guard**: JA/ZH 출력의 source 밖 한글, hasPhoto:false 사진행동만
  차단(사용자 draft 의 한글/사진 언급은 보존) → 걸리면 200+null honest
  fallback(`fallback_guard`), 재시도 없음. LIVE 발동 2/72(2.8%), 오탐 0.
- **검증**: LIVE 72회(4 locale×6 유형 반복 + JA/ZH 집중 24) — §14 전항 0.
  DATA TRACE: DB name_l10n 보유 장소(서울시립미술관·원조할머니떡볶이집·
  북촌돌하르방미술관)는 출력 표기 100% verbatim. 관찰(결함 아님): l10n 부재로
  Latin 이름이 간 경우 표준 가타카나/한자 표기로 옮겨 적는 사례 있음(왜곡 0).
- **판정: witty = CLOSED · AI Writing Quality bundle = CLOSED.** 향후 재개방
  기준: 광고카피 계열(§8.2)·발명·오염이 사용자 노출 출력에서 재현되면 재OPEN.

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

## 10. CURRENT APPROVED WORK SEQUENCE — SUPERSEDED BY OWNER DECISION 2026-09-08

(아래 원문은 기록으로 유지한다. **현재 유효한 순서는 본 문서 하단의
"Current Remediation Work Sequence — 2026-09-08"** 다.)

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

## Post-Audit Owner + GPT Findings — 2026-09-08

2026-09-08 Visual/Product Audit(evidence ZIP)를 Owner와 GPT가 직접 보고 확정한
발견·제품 의미·해결 방향의 기록이다. DOCUMENTATION ONLY —
구현은 아래 Remediation Sequence 의 해당 PHASE 에서만 진행한다.

### A. Discovery / City Hub

1. **City Hub visual** — 현재 Home 의 warm/ivory/orange/nostalgic tone 이 City Hub
   까지 이어짐(blue 는 CTA/nav 일부 수준). 계약: Home=warm/editorial/emotion,
   City Hub=**Blue/Fresh/bright/travel-start feeling**. 단순 버튼 Blue 만으로 완료 금지.
2. **City Hero** — 현재 Busan hero 가 Home 과 유사한 오래된/warm 이미지로 느껴짐.
   방향: 각 도시는 즉시 도시 정체성이 느껴지는 밝고 대표적인 hero(부산은
   광안대교/해안+도시 등 승인 가능한 대표 이미지 검토). 이미지는 임의 변경하지
   않고 design phase 에서 확정.
3. **City Hub Weather** — 현재 UI 없음. 계약: 이모지 아이콘+현재온도(`26°C`) 수준만,
   GPS 금지·현재 탐색 중인 travel city 기준, 클릭 → city-specific weather
   detail/source.
4. **My Trip Weather** — KEEP. 현재 WeatherLinkChip/STAGE A/generic weather.go.kr.
   삭제/대체 금지. 승인 디자인의 Day weather(`18°C 맑음` 칩)와 과거 구현을
   audit/restore 대상으로 유지. **Owner 는 과거 별도/v1 환경에서 weather API 연결을
   실제 확인한 기억이 있음 — 새 provider 선정보다 old implementation/v1 위치
   조사가 우선.**
5. **Recommended Trip CTA — HIGH-PRIORITY ROUTING DEFECT** (Owner 실발견):
   Home → Region → Recommended Trip → "부산일정 만들기" 가 **폐기된 old orange
   AI Scheduler 로 이동**. 방향: 현재 V2 Planner/current Trip contract 로 연결.
   legacy scheduler 로의 user navigation 금지.
6. **Search inconsistency** — Home Search 는 일반 검색+URL auto-detect/import,
   City Hub Search 는 동일하게 보이나 URL Import 미동작. 방향: 검색 입력 문법 통일
   — URL → 동일 detection/import, 일반 텍스트 → current city 우선 context 검색.
   숨겨진 서로 다른 search behavior 금지.
7. **Essentials Preview** — 현재 첫 2개가 모두 transport. 방향: 2개 preview 라면
   category diversity 우선 — 실제 데이터가 있으면 transport 1 + luggage/baggage 1
   우선 검토. eSIM 은 중요 utility 이나 향후 commercial context 와 함께 자연 배치
   가능. 없는 데이터를 발명하지 않는다.

### B. Explore Map — Owner Findings

**Explore Map(=destination discovery)과 Living Map(=personal trip memory)을
혼동하지 않는다.**

1. **Mobile map viewport** — 상단 search/filter 영역이 지나치게 커 지도 가시영역
   잠식. 방향: map mode 진입 시 compact/collapsible search/filter(필요 시 expand).
   지도 자체가 primary.
2. **Place selection card** — place card + top search 동시 점유로 지도가 매우
   좁아짐. 방향: draggable **Bottom Sheet**(Peek → Half → Full) 검토, 지도
   viewport 충분히 유지.
3. **Action overlap** — 하단 정보카드가 `전체지도보기` 등 floating control 을 가림.
   방향: selected-state 에 맞춰 controls reposition/hide. UI 상호 겹침 금지.
4. **Full Map place selection — FUNCTIONAL DEFECT** (Owner 실발견): Full Map 에서
   marker 를 눌러도 작은 지도에서 나타나는 place information card 가 나타나지 않음.
   방향: small/full map 이 동일한 place-selection state·동일한 Bottom Sheet
   contract 공유. Full Map 이 기능 축소판이면 안 됨.
5. **Current location** — orange marker 로 구분은 되나 정적·시인성 낮음. 방향:
   명확한 current-location marker + 절제된 pulse/ring.
6. **Recenter** — 지도 이동 후 현재 위치 복귀 control 없음. 방향: floating
   recenter/current-location 버튼 필수 검토. **Explore `내 주변`의 GPS 사용은
   정상이며, Weather 의 city-based/no-GPS 계약과 혼동하지 않는다.**
7. **Label collision** — 여러 place label 이 겹쳐 가독성 저하. 방향:
   marker/photo/selection hierarchy 정리, collision/visibility 개선. 사진 marker
   추가만으로 완료 판정하지 않는다.

### C. Mobile Header / IA — AUDIT REQUIRED

Owner finding: 모바일 각 page 상단에 Home/Explore/My Trip 계열 표시와 language
control 이 존재하고 하단에 Bottom Nav 가 이미 있어 중복/불일치 느낌.
방향 원칙: Mobile 은 **Bottom Nav = primary global navigation**, Top 은
logo/back/page title/context action 중심. Desktop 은 header navigation 가능 —
desktop 대응 header 를 mobile 에 그대로 중복 노출하지 않는다. 언어 전환
위치/패턴도 route 별 일관성 확인. Interaction Sweep 에서 route 별 header 전수
확인 후 최종 구현 범위 결정.

### D. Living Map

구현됨: Day tabs · Day 별 1부터 numbering · dotted visit flow.
미완성: user photo marker · catalog photo fallback · Whole Trip · STOP sheet ·
Directions · Add Photo · approved final interaction.

Latest Owner contract: marker priority (1) user photo+number (2) catalog
대표사진+number (3) number-only. photo shape — **circular crop 금지,
사각형/원형태 유지**. numbering — **각 Day 1부터 reset, 누적 금지**.
Whole Trip 필요. stop selection — place information + Directions + Add Photo.
현재 Production 의 label overlap 도 함께 해결. Living Map 은 navigation app 이
아니라 travel-memory visualization.

### E. Story / Focus

Story functional/data contract = PASS, visual fidelity = PARTIAL.
Approved design 의 좋은 요소(photo-led rhythm · large photography · collage ·
Day chapters · quote styling · journey summary · map/travel context ·
end-of-trip emotional closure)를 **현재 Story contract 에 맞게** 복원/개선.
old user-facing `Memory` terminology 는 되살리지 않는다. Story cover 는 orange
gradient 가 photo-led 경험의 주인공이 되지 않도록 검토. privacy/public consent
contract 유지.

**Focus** — approved design 존재, Production NOT IMPLEMENTED. 정의:
full-screen trip-moment viewer — segmented progress · k/N · DAY context ·
full-bleed photo · place chip · short quote · swipe next moment. **구현 대상.**

### F. Sharing (3 surfaces 분리 유지)

**9:16** 현재 문제: huge orange/empty area · photography weak · 실제 user trip
title 무시 · generic "{N} Days in {City}" · personality weak · template/poster
feel. 방향: **photo protagonist + actual trip identity/title + concise trip
line + quiet gokoreamate branding.** Living Map 억지 삽입 금지.

**OG** 현재 문제: 임의 첫 catalog image(비대표 가능) · generic title ·
홍보문 description("AI-generated... Plan yours free"). 방향: **shared trip
자체가 주인공** — title 은 privacy contract 이 허용하는 실제 public trip title,
description 은 짧고 안전한 trip 요약(days/places/city 또는 safe public memo),
image 우선순위 = public/consented cover → 의도적으로 선정한 대표 catalog
image → designed city fallback. 클릭 목적지 = 올바른 Shared Story. 광고 랜딩
카드처럼 만들지 않는다.

### G. AI Writing Quality

Infrastructure/provider LIVE 이 quality CLOSED 를 의미하지 않는다. Audit 사실:
title context 는 사실상 city+dates 뿐(장소/모먼트 부재), memo 는 상대적으로
풍부, **draft 가 있으면 4개 locale 모두 품질이 실질 개선**. 근본 원인 =
context poverty + 약한 style guidance (provider 가용성 아님).

방향 — title context 에 안전하게 유용한 신호 포함: city · days · 대표 장소 ·
category/moment 패턴 · public/safe moment context · 허용 범위의 photo-presence
context · 사용자 draft/memo · distinctive trip pattern. 불필요한 private data
전달 금지. Witty: generic travel-copy(웃음꽃·행복 가득·추억 가득·낭만·힐링·
설렘·특별한 순간·잊지 못할 등) = FAIL. KO/EN/JA/ZH **locale-native 독립 작성**,
번역식 humour 금지, meme/slang 은 맥락이 자연스러울 때만(강제 삽입 금지).
Future: accepted/edit/regenerate 신호는 유용할 수 있으나 automatic training
이라고 가정하지 않는다.

**2026-09-09 갱신**: 위 방향은 ced1df5 로 구현·검증 완료(§8.7 — tripFacts
context enrichment · locale-native voice/isolation · 금지어 · fact discipline ·
draft 보존 · direction별 생성 설정). witty 만 IMPROVED 상태로 남긴다(단발 생성
잔존 결함 — CLOSED 아님, 잔여 레버는 Owner 결정).

### H. Opening Hours

HC-2 engine CLOSED · KNOWN structured-hours 보호 active. 잔여 = NULL/UNKNOWN
데이터 커버리지 갭. **데이터 재수집을 현재 remediation sequence 에 자동 삽입하지
않는다** — Owner 별도 승인 시 high-value 대표 장소 중심으로만 검토.

### I. Partner / Affiliate

Owner 확인: 파트너사·다국어 정보 이미 준비됨. 현재 remediation 과 섞지 않는다.
Timing: Visual/Product implementation → Production Acceptance 후
Commercial/Affiliate E2E — 그때 추천1+대안1 표현 · placement/surface ·
reason line · disclosure · 실제 deep-link 발급 · tracking parameter ·
city/product landing · mobile click QA 를 함께 결정/검증한다.

## Current Remediation Work Sequence — 2026-09-08 (Owner-approved)

- **PHASE 1 — Documentation**: 이번 Owner+GPT findings 와 sequence 기록(본 태스크).
- **PHASE 2 — Discovery/Explore Interaction Sweep**: Home → City Hub → Search →
  Recommended Trip → Explore List → Explore Map → Full Map → Header/Nav.
  방식: **first pass = 코드 읽기 전 blind Production 사용**, 모든 visible
  interactive surface 실클릭, 지정 문제(A1~7 · B1~7 · C) 재현 + 지시서 밖 문제
  자유 발견 → BLIND EXPLORATORY FINDINGS. 임의 수정 금지.
- **PHASE 3 — Design/Product decisions**: A. Discovery(City Hub Blue/Fresh ·
  Hero · compact Weather · Explore Map interaction) B. Sharing(9:16 ·
  OG/link preview). 기존 approved Living Map/Story/Focus 는 latest Owner
  contract 에 맞게 reuse.
- **PHASE 4 — Discovery UX bundle**: City Hub visual · Hero · City Weather ·
  Search unification · legacy Planner route fix · Essentials preview ·
  Mobile header/nav.
- **PHASE 5 — Explore Map bundle**: compact/collapsible controls · Bottom Sheet ·
  full-map selection · current-location marker · recenter · control overlap ·
  label collision.
- **PHASE 6 — Travel Memory bundle**: Living Map final · Story visual fidelity ·
  Focus.
- **PHASE 7 — Sharing bundle**: 9:16 · OG/link preview.
- **PHASE 8 — AI Writing quality**: richer safe context · locale-native guidance ·
  generic-copy suppression · 실제 KO/EN/JA/ZH live QA.
  → 2026-09-09 구현·배포 완료(ced1df5, §8.7) — witty 만 IMPROVED 로 유지.
- **PHASE 9 — Production Visual/Product Acceptance**: Home → City Hub → Weather →
  Search → Explore Map → Saved → Planner → My Trip → My Trip Weather →
  Living Map → AI Writing → Story → Focus → 9:16 → Share URL → incognito →
  + My Trip 직접 browser E2E.
- **PHASE 10 — Commercial/Affiliate E2E.**
- **PHASE 11 — AI/API Cost/Abuse Guard.**
- **PHASE 12 — Pre-open removal + Final Release Readiness.**

## QA Method — New Default (2026-09-08)

앞으로 final product QA 는:

1. **BLIND UX PASS** — 코드 먼저 읽지 않고 Production 을 사용자처럼 먼저 사용.
2. **INTERACTIVE SURFACE SWEEP** — 버튼/card/link/More/map/search 전부 실클릭.
3. **CONTRACT PASS** — approved design/latest Owner contract 와 비교.
4. **TECHNICAL DIAGNOSIS** — 그 다음에야 code/git/history 분석.
5. **OWNER + GPT VISUAL REVIEW** — 시각/제품 품질은 Fable PASS 보고만으로 종료 금지.
6. **FIX** — product meaning 을 바꾸지 않는 결함만 자동 수정 가능.
7. **PRODUCTION RE-QA.**

원칙: **"기능이 동작한다" 와 "사용자가 만족할 제품이다" 를 별도로 평가**한다.
발견했다고 제품 의미를 마음대로 바꾸지 않되, 좋은 아이디어/중요한 문제는
지나치지 않고 반드시 OWNER ATTENTION 으로 적극 보고한다.


## 12. STATUS TABLE (2026-09-08 post-audit update)

| Surface / Item | Status |
|---|---|
| 5-city Planner | LIVE / CLOSED |
| AI Personalization | LIVE / CLOSED |
| External URL Import | LIVE / CLOSED |
| My Trip core | LIVE / CLOSED |
| Journey Guide | LIVE / CLOSED |
| My Trip - Story data contract | LIVE / CLOSED |
| Shared Story functional | LIVE / CLOSED |
| + My Trip | LIVE / CLOSED |
| Blog / Events / Essentials functional | LIVE / CLOSED |
| Golden Path functional loop | PASS |
| HC-2 engine | CLOSED (2026-09-08, c4c8ab4) |
| Opening-hours data coverage | KNOWN GAP / NOT CURRENT PRIORITY |
| City Hub final visual | CLOSED (2026-09-08, 51c855e; 부산 Hero 자산 2026-09-11 해소) |
| City Hub Hero | CLOSED (2026-09-11, a5cd8b9 — Owner 선택 광안리 자산, Hub 전용 override §2.B) |
| City Hub Weather | SUPERSEDED (2026-09-08 Owner weather scope — 재OPEN 금지, §3.2) |
| My Trip Weather STAGE B | LIVE (8ec30ad, KMA 중기예보 — KEEP·확장 금지) |
| Discovery Search consistency | CLOSED (2026-09-08, 51c855e — Explore 에 URL 문법 통일) |
| Recommended Trip legacy route | NOT REPRODUCED (Sweep + 5도시 smoke 정상 — 변경 금지) |
| Essentials preview diversity | CLOSED (2026-09-08, 51c855e) — luggage/eSIM 은 DATA LIMITATION(발명 금지) |
| Mobile Header/Nav | CLOSED (2026-09-08, 51c855e — briefcase 제거·My Trips 언어 스위처) |
| Explore Map mobile viewport | CLOSED (2026-09-08, 51c855e — compact 상단) |
| Explore Map Bottom Sheet | CLOSED (2026-09-08, 51c855e — Peek/Half/Full) |
| Explore Full Map selection | FIXED / CLOSED (2026-09-08, 51c855e) |
| Explore Full Map back/history | FIXED / CLOSED (2026-09-08, 51c855e — back 은 Full Map 만 닫음) |
| Explore current-location indicator | CLOSED (2026-09-08, 51c855e — blue pulse) |
| Explore recenter | CLOSED (2026-09-08, 51c855e) |
| Explore label collision | CLOSED best-effort (2026-09-08, 51c855e — 라벨 상한 5+선택) |
| Living Map final | CLOSED (2026-09-08, TRAVEL-MEMORY-PRODUCTION-V1) |
| Story visual fidelity | CLOSED (2026-09-08; 2026-09-09 Shared Map 장면으로 보강 유지) |
| Shared Story Map Context | CLOSED (2026-09-09, 7f54215 — large non-interactive Trip Map, 좌표/탐색 기능 0) |
| Focus | CLOSED (2026-09-08 — trip-wide 뷰어, back 계약 포함) |
| Travel Memory bundle (PHASE 6) | CLOSED (2026-09-08) |
| 9:16 Share Image | CLOSED (2026-09-09, 079770b — 실제 제목·사진 주인공·광고 0) |
| OG Share Preview | CLOSED (2026-09-09, 079770b — 실제 제목·사실 요약·대표 이미지 체인) |
| Sharing Visual bundle (PHASE 7) | CLOSED (2026-09-09; hygiene 7afb5c9 master 반영) |
| AI Writing infrastructure | LIVE |
| AI Writing quality | **CLOSED** (2026-09-11, e48466a — locale fact grounding, LIVE 72회 결함 0, §8.9) |
| AI Writing witty | **CLOSED** (2026-09-11, e48466a — §8.9; FAIL 기준 §8.2 영구 보존) |
| AI Writing parser safety guard | CLOSED (2026-09-11, 58aaf43 — raw payload 노출 0 계약) |
| Busan 5-city selector image | CLOSED (2026-09-11, e48466a — Hub Hero 와 도시 identity 동기화, 타 표면 유지) |
| Partner / Affiliate | PREPARED / ACCEPTANCE LATER (PHASE 10) |
| AI/API cost guard | OPEN (PHASE 11) |
| Final Release | OPEN (PHASE 12) |
