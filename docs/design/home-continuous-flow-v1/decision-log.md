# Decision Log — Home Continuous Flow Visual Design v1

무엇을 골랐고 왜 골랐는지. LEVEL 1/2 를 바꾸는 결정은 없다. 여기의 "결정"은 전부 LEVEL 3 시각 결정이고, Owner 검토 대상이다.

1. **방향 = C (Refined Editorial Hybrid)** — 근거는 direction-comparison.md. A 의 serif 캡션 감각은 C 에 흡수, B 는 밀도 기준선.
2. **Home 1 Search = 유리질 pill, 캡션 아래 고정** — 사진을 가리지 않으면서 첫 화면에서 즉시 발견됨(숨김 gesture 아님). placeholder 는 `Search Korea` 한 단어대 — AI/provider 언급 0.
3. **Cover 캡션 = serif 1문장 + 위치·시각 메타 1줄** — "기록 한 장" 느낌의 최소 구성. 슬로건·기능 소개 0.
4. **scroll cue = `KOREA, BELOW` + 1px 라인** — Start 버튼 없이 아래에 Floor 가 있음을 암시. 문구는 LAYOUT_TEST(확정 카피 아님).
5. **Cover→Floor = 시트 상승 + Search 보간 dock** — 페이지 전환·URL 변경 연출이 아니라 같은 문서의 깊이 변화로 표현(S02/SB1). 수치는 스펙 §7 제안값(OPEN).
6. **Home 1 하단 nav = glass 유지** — 제거하지 않음(발견성·일관성). 사진 위 가독은 하단 그라데이션으로 확보. Owner 가 몰입 우선을 원하면 auto-hide 는 별도 결정.
7. **도시 카드 = 가로 스트립(92px) 비교** — portrait(세로 과다)·edge-to-edge(5개 연속 시 벽화됨)·미니 타일(분위기 전달 실패) 대비, 이름+분위기 1행이 5도시를 한 호흡에 읽게 함. 데스크톱은 2+3 그리드(부산 wide).
8. **Coming soon 배지 표기** — 현재 readiness 사실(부산·경주만 오픈). 가짜 오픈 인상 방지. 도시 오픈 시 제거.
9. **Home 2 Picks = 1열 3장(모바일)/3열(데스크톱)** — feed 화 방지. 라벨 `KOREAMATE PICKS` 고정.
10. **Search 결과 썸네일 문법: City=원형 / Trip=가로 / Place=정사각 + 텍스트 메타 병기** — 모양 단독 전달 금지 원칙 반영. 큰 타입 pill 없음.
11. **선택 행 = tint + 좌측 3px 바** — 색 단독 신호 금지, hover/터치/키보드 공통.
12. **빈 상태 = 도시 chip 5 + Recent 자리** — helpful 최소. AI paste 안내 상시 노출 없음(F01 은 FUTURE_REFERENCE).
13. **City→Hub = shared-element 확장** — "Busan 안으로". fade-only 는 reduced-motion 경로.
14. **Hub 순서 Trips→Places→Explore, Explore 는 말미 1행** — sticky/floating CTA 배제(LEVEL 2). `all 780+ places` 부제는 실제 규모 표기(현 DB 부산 789 published) — 구현 시 실수치 바인딩.
15. **Trips View all = 1열(모바일)/2열(데스크톱) 동일 지오메트리** — masonry 금지 이행. 정렬·필터 UI 미노출(P1), duration filter 는 OPEN 유지.
16. **Places View all = 2열/3열 grid, 지도 없음** — Explore 와 역할 분리. 카드 탭 = 기존 `/place/[id]`(bottom sheet 재정의 없음).
17. **Save = 하트 즉시 + `Saved` mini toast** — 모달·My Places 문구·This Trip 자동 추가 없음.
18. **Explore handoff = 컨텍스트 chip(`from Busan Hub`) + 기존 화면 자리 표시** — Explore 구현 변경 없음.
19. **사진 정직성** — Arirang 드론쇼 포스터 이미지를 Gwangalli "장소 사진" 자리에 썼던 것을 셀프 QA 에서 발견, 해변 실사(city-busan.jpg)로 전량 교체(8곳). 대체 사진은 CURATED DESIGN SAMPLE 표기.
20. **Traveled 날짜 미표기** — 실데이터 없음 → 어떤 카드에도 여행 시점 표기 없음(가짜 사실 금지).

## Self-QA (37개 질문 통과 요약)
광고 landing 아님(S01) · Search 발견 가능(S01) · 연속성(S02/SB1) · motion 은 설명용 · Home 2 비대시보드(금지 블록 0) · 5도시 명료 · Picks 3 · Search 제자리(E 보드) · 타입 구분 이중 신호 · 개발자 UI 아님 · City 연속(S06/SB2) · Hub 비랜딩(관광 slogan 0) · Trips 우선 · Explore CTA 조용 · Trips 비교 가능 · Places≠Explore · Save 의미 보존 · nav 불변 · 4언어 통과(F 보드) · 데스크톱 비확대판(D2) · 사진>chrome · 다음 행동 자명.
발견·수정: ① 포스터 썸네일 교체(above #19) ② S07 프레임에 Explore 진입까지 보이도록 압축 재렌더. 잔여 이슈 없음.

## Remaining visual OPEN (Owner/디자인 다음 단계)
Home 1 사진 최종 선정(현재 부산 hero 1장 기준) · 캡션 최종 카피·다국어 · scroll cue 문구 · motion 수치 확정 · returning user 정책과 Cover 재노출 연출 · Home 1 nav glass vs auto-hide · city hero 사진 셋 확장(도시별 2–3장) · Trips 카드 사진 실데이터 교체 · LAYOUT_TEST 라벨들의 운영 카피 확정.
