# Home Continuous Flow — Design Spec (Direction C · Refined Editorial Hybrid)

LEVEL 3 시각 스펙. LEVEL 1/2 SSOT 를 전제로 하며 이 문서가 UX 를 바꾸지 않는다. 값 중 "제안"은 구현/프로토타입 단계에서 조정 가능한 OPEN 값이다.

## 1. Typography
- 본문/기능: 현행 sans 스택(Pretendard · Apple SD Gothic Neo · Noto Sans KR 계열, `--gkm-font-sans`). 프로토타입은 OS 폰트로 대체 렌더.
- Cover 캡션 전용: Story 와 같은 serif 계열(`--gkm-font-serif`, Noto Serif/나눔명조) — **Home 1 캡션과 D1 캡션에만** 사용. Floor 이하 어떤 기능 표면에도 serif 금지.
- 스케일(모바일): 캡션 27/1.32 serif · 화면 제목 20/900 · 카드 제목 15.5/800 · 본문 메타 12–13/600 · eyebrow 11/800 letter-spacing .1em · 시스템 최소 11px.
- JA/ZH: 캡션도 sans 대체 허용(serif 품질 저하 시) — l10n 보드 기준.

## 2. Color
현행 토큰 그대로: 액션 `#0041C8`(+tint `#E8EDFB`) · ink `#191C21` · sub `#565D66` · faint `#8A919B` · line `#E5E7EA` · dim `#F6F7F8` · Save 하트만 coral `#FF4A2D`. 새 색 추가 0. 사진 위 텍스트는 §5 scrim 규칙.

## 3. Spacing · Grid · Radii
- 모바일 여백 20/24px, 섹션 리듬: eyebrow 위 26 아래 10.
- 데스크톱: 콘텐츠 1000px 컬럼(+헤더 48px 패딩), 도시 2열(부산 wide 2span), Trips 3열, Places 3열, View all Trips 2열.
- radius: pill(검색·배지) 999 · 카드 16 · 썸네일 8–12 · Hero/시트 상단 22–24.
- 이미지 비율: 도시 스트립 390×92(대략 4.2:1) · Trip 카드 사진 ~2.4:1 · Place 썸네일 1:1 · Search 썸네일 City 원형 44 · Trip 64×44 · Place 44×44.

## 4. 핵심 컴포넌트
- **Search (surviving element)**: Cover 위 = 유리질 pill(백 16% + 백 38% 테두리 + blur) → Floor = dim 배경 pill. focus = 흰 배경 + 블루 1.5px 테두리 + 3px tint ring + Cancel 링크. 결과는 field 바로 아래 같은 문서 흐름(모바일) / field +30px 폭 anchored panel(데스크톱).
- **Result row**: 썸네일(모양=타입 1차 신호) + 제목 15/800 + 메타 12/600(타입·도시·기간 — 텍스트=2차 신호). selected = tint 배경 + 좌측 3px 블루 바(색·형태 이중).
- **City strip card**: 사진 + 좌측 55% 그라데이션 + 이름 18/800 + desc 11/600. Coming soon = 우상단 소형 pill(사실 표기).
- **Trip card**: 사진 + 제목 + `N days` bold 메타. 배지·별점·순위 없음.
- **Place**: Hub 에서는 56px 행, View all 에서는 2열(모바일)/3열(데스크톱) 카드 + Save 하트.
- **Explore entry**: 리스트 말미 1행(제목 + 부제 + →). sticky/floating 없음.

## 5. Photography · Scrim
- full-bleed Cover: 상단 34% 그라데이션(.34) + 하단 .62 — 캡션·pill 이 항상 4.5:1 이상이 되도록 사진별 하단 scrim 은 .55–.7 범위에서 조정.
- Hub hero: 상 .30 / 하 .58. 도시 스트립: 좌측 .55→.06 가로 그라데이션.
- 관광청 포스터 톤·HDR 과보정·행사 포스터류 이미지를 장소 사진 자리에 쓰지 않는다(셀프 QA 에서 1건 교체).

## 6. Search 행동(시각 계약)
탭한 자리에서 focus → 키보드 → 아래 공간 확장. Bottom sheet/모달/URL 점프/탭 3개 없음. Back/Cancel = 원래 Home 문맥 복귀. 키보드: ↑↓ 행 이동 · Enter 열기 · Escape(1회 목록 닫기, 2회 Cancel). 구현 시 combobox/listbox 시맨틱 + aria-expanded + activedescendant — 정확한 ARIA 는 구현 단계.

## 7. Motion (제안값 — OPEN)
- Cover→Floor: 스크롤 구동. 사진 scale 1.0→1.06 + translateY, 캡션 fade 200ms, Search pill 는 위치·배경 보간(스크롤 진행도 매핑), Floor 시트 radius 24→0. 경계 1곳만 soft snap(선택).
- City→Hub: 타일 → hero shared-element 확장 380–460ms, ease `cubic-bezier(.32,.72,0,1)`.
- 전부 CSS transform/opacity — WebGL·3D·physics·scroll-jacking·비디오 없음.
- `prefers-reduced-motion`: 모든 연출 제거 → 표준 스크롤 + 200ms cross-fade, 정보 구조 동일(SB3 보드).

## 8. Responsive 규칙
390 기준으로 설계, 640+ 에서 데스크톱 헤더로 전환(하단 탭 → 헤더 IA), 1000px 컬럼 캡. 가로 오버플로 금지. 터치 타깃 ≥44px(검색 50–54px, 도시 카드 92px, 탭 78px 영역).

## 9. Accessibility 체크(디자인 반영)
사진 위 텍스트 scrim 통제 · field/row focus 이중 시각화 · 타입은 모양+텍스트 이중 신호(색 단독·모양 단독 없음) · motion 단독 의미 없음 · 4언어 wrapping 검증(F 보드) · Save 는 하트 상태 + toast 텍스트 병행.

## 10. Performance / 구현성
신규 라이브러리 0 · 이미지 = 기존 자산 재사용(도시 스트립은 저해상 crop 로 충분) · 애니메이션 타임라인 2개(Cover→Floor, City→Hub) · Cloudflare 정적 export 그대로 구현 가능. 오픈 지연 요인 없음.
