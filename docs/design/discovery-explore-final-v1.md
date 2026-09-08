# Discovery / Explore Final v1 — Visual & Interaction SSOT (2026-09-08)

TASK-GOKOREAMATE-DISCOVERY-EXPLORE-DESIGN-FINAL-V1 산출물.
PHASE 4(Discovery UX)·PHASE 5(Explore Map) 구현의 기준 문서다.

**디자인 캔버스(27 artboards, Owner 검수/편집·PNG/PDF export 가능):**
https://claude.ai/code/artifact/2887eaf6-cb57-4b52-9305-3274bfb4de79
(작업 파일: `tmp/discovery-explore-design-v1/` — gen.mjs 재실행으로 재생성)

Production 코드 수정 0. 이 문서와 캔버스의 Interaction Spec 보드(#26)·Marker
Policy 보드(#27)가 동일 내용의 SSOT다.

## 0. 디자인 방향 한 줄

Home = warm/editorial 유지(무접촉). **City Hub 부터 Blue/Fresh 로 공기가 바뀐다**
— cool paper 위 blue hierarchy, 밝은 낮 사진, 산뜻한 시작감. Explore Map 은
**지도가 주인공**(기본 가시영역 ≥75%, 현 30%에서 회복).

## 1. 토큰 (기존 값 재사용 + cool-shift 신설)

| 토큰 | 값 | 비고 |
|---|---|---|
| blue(action) | `#0041C9` | 기존 --qh-blue/--gkm-action-primary |
| navy | `#001654` | 기존 --qh-navy (CTA/선택 배경) |
| tint | `#E8EDFB` | 기존 action-tint (칩/보조버튼) |
| hub-paper | `#F5F8FC` | 신설 — #f7f3ec(warm)의 cool 대응 |
| hub-ink | `#16233B` | 신설 cool ink |
| hub-sub | `#4C5E7E` / faint `#8DA0BF` / line `#DFE7F2` | 신설 |
| eyebrow | `#3D63C9` | 섹션 캡션(현 orange 대체, Hub 한정) |

폰트: 시스템 sans 유지. **serif 는 Home 전용** — Hub 는 all-sans 로 분위기 분리.
아이콘: emoji 금지, stroke SVG 세트(캔버스 보드의 글리프 그대로).

## 2. City Hub

- 구조 유지: Hero → Recommended Trips → Places → What's happening →
  Essentials → Explore. 신규 대형 섹션 없음.
- **Hero**: 밝은 낮 시간대 도시 정체성 사진(부산=광안대교/해안+도시 방향).
  하단은 white-up gradient 로 paper 에 녹임(다크 스크림 금지). 사진은
  **ASSET SLOT** — PHASE 3에서 권리 확인 자산으로 확정(임의 이미지 금지).
- **Weather chip**: hero 우하단, white/88 blur pill —
  `[SVG glyph + 26°C + ›]`. H/L·강수·주간 금지. 탭 → **그 도시의** weather
  detail/source(provider 는 Owner 확정 대기, GPS 금지). 데이터 없으면 chip
  숨김(가짜 온도 금지). My Trip Weather 는 별개·KEEP.
- 5도시 시스템: 공통 구조/토큰, 사진만 도시별(전부 밝은 톤) — 캔버스 #04.

## 3. Search — One grammar

- Home = Explore 동일 문법: 텍스트 → **current city 우선** + 'Search all
  cities' 행 / URL → **Link detected → Analyze and import** 행(0 results 금지)
  / shared URL → 열기 행. mode toggle 없음.
- **City Hub 에 검색 input 신설하지 않음**(결정) — Hub 는 브라우징, 검색은
  Explore. placeholder: `Search {City} — places, or paste a link`.

## 4. Explore Map (캔버스 #06–13)

- **compact 기본**: 검색 pill(46px)+Filter 버튼, 좌상단 Map/List 세그먼트 —
  상단 점유 ~108px. 카테고리 칩·리스트 기본 숨김.
- **expand**: pill 탭 → 상단 패널 드롭(dim scrim) — 입력+Cancel+FILTERS 칩
  +URL 감지 행. 해제 = Cancel/scrim/확정/지도 제스처.
- **Bottom Sheet**: Peek(썸네일+이름+✕) → Half(Save·View details·요약·
  Naver/Google) → Full(사진 헤더+요약 — Place Detail 복제 금지, View details 로
  이동). 드래그/지도 탭 계약은 캔버스 #26-§3.
- **Floating controls**: 우하단 스택 [Recenter][Full map]. Peek 시 sheet 위로
  이동(가림 금지), Half/Full 시 숨김, Full map 에선 Exit pill+Recenter만 — #26-§4.
- **Full map**: 같은 인스턴스 확장 + **history.pushState** — back/제스처는
  full map 만 닫는다(사이트 이탈 금지). 마커 탭 = 소지도와 동일 sheet
  (**현 결함 수정점: ExploreCity 선택카드의 `!mapExpanded` 조건 제거**).
- **현위치**: blue 15px + white ring + 2s 절제 pulse. **Recenter 버튼**(target
  아이콘) 신설 — 탭 시 내 위치 pan/zoom14, active 시 blue fill.
- **Marker policy**: navy dot(기본)/navy cluster/selected=blue dot+navy 이름
  pill. **사진 마커 금지(Living Map 전용)**. 라벨 = selected 1 + zoom≥16 상위
  5개만. Naver base POI 밀도 최소화(불가 시 라벨 상한으로 보완) — #27.

## 5. Header / Nav

- Mobile: **BottomNav = 유일 global nav**. 상단 = [back|logo|title]+[globe]
  (+context action 1). **상단 Trips 아이콘 제거**(하단 중복).
- route 규칙: Home=logo+globe · Explore=back+"Explore {City}"+globe ·
  CityHub=hero 위 투명 back+globe · **Trips/More=제목+globe(언어 추가)**.
- Desktop(lg+): 기존 full nav 유지 — 역할 분리를 responsive spec 으로 명문화.

## 6. Essentials preview (2 슬롯)

선정 규칙: [1순위] + [다른 category 최상위]; 다른 category 없으면 같은 대분류
내 소분류 차등(수단 vs 결제/패스). **가짜 luggage/eSIM 발명 금지** — 부산 7종
전부 교통(실데이터)이라 diverse 상태는 타 도시 예시(전주)로 시연. 부산 짐보관
데이터 보강은 별도 Owner 결정.

## 7. 의도적으로 유지한 것

현행 정보구조(Hub 섹션 순서·Explore List/Map 토글·recommended CTA→/planner)
· BottomNav 5-item · Naver/Google directions 관례 · quiet 원칙(칩 남발 금지)
· 기존 blue 토큰. Home/Picks/Planner 알고리즘/My Trip/Living Map/Story/Focus/
9:16/OG/AI Writing 무접촉.

## 8. OWNER ATTENTION (발견/결정 필요)

1. **Hero 사진 자산**: 5도시 밝은 대표 사진의 실제 소스/권리 확정 필요(ASSET
   SLOT 상태). 후보 소스 = 기존 승인 city-covers 자산·KTO 공공누리 — PHASE 3.
2. **City weather provider**: 도시별 현재기온 소스 미정(발명 금지 계약) —
   KMA 단기실황(공식) vs v1 구현 재조사 결과에 따름.
3. **발견 제안**: Map/List 세그먼트를 compact 바에서 좌상단 분리 배치(캔버스
   #06)했는데, 한 줄에 넣는 안(더 compact)도 가능 — 지도 점유 4px 차이,
   가독은 분리안이 우세라 분리안을 추천.
4. City Hub 검색 input 미신설 결정의 최종 승인.

## 9. 품질 바 답변 (§17)

Hub 공기 전환 ✔(cool paper+밝은 hero — 캔버스 #01 vs 현 warm) · 지도 주인공
✔(기본 ≥75%) · 선택 중 맥락 유지 ✔(Peek/Half 에서 지도 노출) · 한 번에 복귀
✔(Recenter) · URL 고민 제거 ✔(Link detected 행) · nav 혼동 제거 ✔(상단
global 요소 제거).
