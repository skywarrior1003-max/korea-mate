# Visual Direction Comparison — 동일 UX, 세 가지 시각 언어

UX 구조(LEVEL 2)는 세 방향 모두 동일: Cover→Floor · Anchored Inline Search · Unified results · Trips→Places→Explore. 달라지는 것은 photography treatment · typography · geometry · density · motion tone 뿐이다. 프레임: `shots/directions--dir{A,B,C}-{1..4}-*.png`.

| 축 | A · Photography-led Editorial | B · Quiet Modern Minimal | C · Refined Editorial Hybrid ★ |
|---|---|---|---|
| Visual thesis | 잡지 지면 — serif 이탤릭, 모서리 각(4px), 사진 최대 | 정보 우선 — sans 전용, 사진 최소, 최고 밀도 | 사진 주인공 + 조용한 기능 표면 — serif 는 Cover 캡션에만 |
| Strengths | Home 1 몰입 최고, 가장 "기록" 같음 | 구현 최저비, 다국어 가장 안전, 로딩 가장 가벼움 | 몰입과 기능의 균형, 현행 브랜드(블루·12–16px 라운드)와 즉시 연결 |
| Weaknesses | tone 이 여행문학 과잉으로 넘어갈 위험 · Trip 비교성 저하(카드 경계 약함) | photography protagonist 원칙 위반 소지 — Home 1 과 Home 2 가 다른 서비스처럼 보임 | A 만큼 극적이지 않음 |
| Mobile 적합 | 좋음(큰 사진) — 단 도시 5장 세로 길이 증가 | 매우 좋음(밀도) — 감흥 없음 | 좋음 — 92px 스트립으로 5도시가 한 호흡 |
| Desktop 적합 | 에디토리얼 지면으로 강함 | 앱 관리 화면처럼 보일 위험 | 좋음 — D1~D6 검증됨 |
| Brand 적합 | Story serif 와 연결되나 기능 화면과 단절 | 현 제품보다 차가움 | **My Trip·Story 품질 라인과 동일 세계** |
| 구현 복잡도 | 중 — serif 웹폰트 4언어 로딩·행간 관리 | 최저 | 저 — 현행 토큰/컴포넌트 관례 재사용 |
| Photography 의존 | 최고(사진 나쁘면 무너짐) | 최저 | 중 — 사진 1급이면 살고, 없어도 구조 유지 |
| Accessibility 위험 | 사진 위 serif 대비 관리 필요 | 최저 | 저 — scrim 규칙으로 통제(스펙 §5) |
| Content 확장성 | 카드 경계 약해 30+ 리스트에서 피로 | 좋음 | 좋음 — 카드 지오메트리 일정 |
| 언어 스트레스 | serif 가 JA/ZH 에서 품질 저하(명조 혼입) | 안전 | 안전 — sans 기반, serif 는 EN/KO 캡션 위주 |

## 추천: **Direction C — Refined Editorial Hybrid**

추천 기준 10개 대조: ① 제품 철학(`Powerful functionality, visually quiet`)을 그대로 시각화 ② Home 1(사진·serif 한 줄)과 Home 2(조용한 기능)가 **한 스크롤 안에서** 자연스럽게 이어짐 — A 는 Floor 까지 serif 를 끌고 와 기능 표면이 무거워지고, B 는 Cover 에서 사진이 데커레이션으로 격하 ③ photography protagonist 유지 ④ 화면은 조용(액션 컬러 1개, 배지 최소) ⑤ 모바일 검증됨(S01–S12) ⑥ 데스크톱에서 앱 흉내가 아니라 지면 재배치(D2) ⑦ 4언어 스트레스 통과(F 보드) ⑧ City/Trips/UGC 30+ 확장 시 카드 지오메트리가 버팀 ⑨ CSS transform/opacity 만으로 구현 가능 — 신규 패키지 0 ⑩ 기술 과시 없음.

A 는 Home 1 캡션 serif 처리·전체 여백 감각으로 **C 안에 부분 흡수**되었다(= C 가 hybrid 인 이유). B 는 밀도 기준선으로만 참조.
