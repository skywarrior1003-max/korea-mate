# Home Continuous Flow — Visual Design v1 (LEVEL 3)

기준: LEVEL 1 `docs/product/home-discovery-external-ai-product-direction-ssot-v1.md` · LEVEL 2 `docs/product/home-ux-decision-ssot-v1.md` (master `c77ee3c`). 과거 Home 시안(2026-08-02 등)은 visual authority 로 사용하지 않았다. **디자인 전용** — runtime 코드·데이터 변경 0, production 라우팅/빌드와 완전 분리.

## 보는 순서 (screen index)

`shots/` 의 PNG 를 아래 순서로 보면 된다. 원본 아트보드는 `proto/*.html`(브라우저로 열림), 재렌더는 `node docs/design/home-continuous-flow-v1/proto/render.mjs`.

### A. 방향 비교 — [direction-comparison.md](direction-comparison.md)
`directions--dirA-*` (4) → `directions--dirB-*` (4) → `directions--dirC-*` (4). UX 구조는 셋 다 동일, 시각 언어만 다르다. **추천 = C (Refined Editorial Hybrid).**

### B. 추천 방향 · 모바일 연속 플로우 (390×844, 13 states)
`mobile-flow--S01…S12` + `mobile-flow--F01`(FUTURE_REFERENCE):
S01 Home 1 Cover → S02 Cover→Floor mid → S03 Home 2 → S04 Search active/empty → S05 Search results → S06 City select mid → S07 City Hub(Busan) → S08 Trips View all → S09 Places View all → S10 Explore handoff → S11 No result → S12 Save feedback → F01 External paste(미래 참조).

### C. 데스크톱 반응형 (1440×900, 6 states)
`desktop-flow--D1…D6`: Home 1 · Home 2 · Search anchored panel · City Hub · Trips View all · Places View all.

### D. 전환 스토리보드 — `storyboards--SB1/SB2/SB3`
Cover→Floor start/mid/end · City→Hub start/mid/end · Reduced-motion 계약.

### E. Search 상태 보드 — `search-states--E1…E6`
default · active empty · query · selected row · no result · keyboard/focus.

### F. 4개 언어 스트레스 — `l10n-board--L-*`
Home 2 · Search results · City Hub × EN/KO/JA/ZH. 실제 repo 문자열 우선, 신규 문구는 LAYOUT_TEST 표기.

### G/H. 스펙과 결정
[design-spec.md](design-spec.md) · [decision-log.md](decision-log.md)

## 콘텐츠/자산 정직성
- 사진: 전부 repo 기존 자산(`public/images/home/*`, `public/images/cities/*`, spots 2종) — 웹 수집 0. 일부 사진은 장소 실사가 아니라 **CURATED DESIGN SAMPLE**(예: Oryukdo 행에 story 사진 대체).
- Trip 제목·구성·기간: 전부 **DESIGN_SAMPLE** — 운영 데이터 아님. Traveled 날짜는 어떤 화면에도 넣지 않았다(실데이터 없음).
- 순위·Popular·Trending 표기 0. 라벨은 `KoreaMate Picks / curated` 만.
- Coming soon 배지는 현재 도시 readiness 사실(Busan·Gyeongju 오픈) 반영 — 오픈 시 제거되는 상태 표기.
