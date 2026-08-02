# GoKoreaMate — Final Mobile Screen Index (2026-08-02)

| 항목 | 값 |
|---|---|
| `package` | `docs/design/final-mobile-2026-08-02/` |
| `screens` | **21개 — 전부 Final** |
| `status` | **ACTIVE** — 모바일 재설계의 시각 기준 |
| `authority` | 시각 기준. 기능·정보구조 기준은 `../../product/home-experience-decision-v1.md` 및 `../../product/gokoreamate-product-constitution-v1.md` 가 갖는다 |
| `contract` | 구현 계약은 `implementation-contract.md` 를 따른다 |
| `verified_commit` | `b3b3202` |

**21개 화면 모두 보존한다. Archive 로 분류된 화면은 없다.**

---

## 읽는 법

| 열 | 의미 |
|---|---|
| **최종 역할** | 이 화면이 제품에서 맡는 자리 |
| **사용자 흐름** | 어디서 들어와 어디로 나가는가 |
| **현재 route/기능** | 대응하는 운영 코드. `없음` = 신규 |
| **교체할 요소** | 목업에만 있는 것. 운영에서는 실제 데이터·i18n·자산으로 대체 |
| **구현 차수** | `초기` = 첫 배포 대상 · `후속` = 이후 배치 |

샘플 문구·가상 수치·임시 장소명·목업 브랜드명은 **결함이 아니다.** 구현 단계에서 실제 데이터와 i18n 으로 교체한다.

---

## 1. Home (3)

### `home_ai_inspired_storytelling`
- **최종 역할** Home Panel 1 — My Journey / **기본 상태**
- **사용자 흐름** 앱 진입 → 다음 여행 동기 부여 → 플래너 진입 / 좌우 스와이프로 Discover
- **현재 route/기능** `/` (HomeClient)
- **교체할 요소** 매거진 헤드라인·기억 카드 더미 · 한글 고정 문구 → i18n · 하단 내비 3탭 잔재 → 최종 5탭
- **구현 차수** 초기

### `home_ai_memory_synergy`
- **최종 역할** Home Panel 1 — My Journey / **최근 여행 완료·Memory 일시 상태**
- **사용자 흐름** 여행 종료 직후 진입 → Memory 회고 → Story 공유 또는 다음 여행 계획
- **현재 route/기능** `/` (조건부 상태). Memory 는 `/api/trip-moments`
- **교체할 요소** `travel_explore`·`auto_awesome`·`smart_toy` 등 **Material Symbols 리거처가 원문 텍스트로 노출** → 아이콘 폰트 로드 또는 아이콘 컴포넌트로 교체 · "3 Days in Busan" 더미 일정
- **구현 차수** 초기(기본 상태) / 후속(전환 조건 확정 후)

### `home_screen_premium_discovery`
- **최종 역할** Home Panel 2 — **Discover**
- **사용자 흐름** 좌우 스와이프 진입 → 도시 검색·선택 → Explore
- **현재 route/기능** `/` · 도시 랜딩 `/busan` `/seoul` `/jeju` `/gyeongju`
- **교체할 요소** **우하단 원형 FAB 제거**(전역 Build FAB 금지) · **하단 5번째 탭 `프로필` → `More`** · 한글 임시 라벨 → i18n · `@김치익스플로러` 등 **사용자 핸들·좋아요 수는 계정 기능이 없으므로 제거 또는 대체** · Home 탭 아이콘 깨진 자산
- **구현 차수** 초기

---

## 2. Explore (2)

### `explore_list_view_with_toggle_search`
- **최종 역할** Explore 리스트 + Map/List 토글 + 검색
- **사용자 흐름** 하단 Explore 탭 → 장소 탐색 → `Add to Picks` → Picks
- **현재 route/기능** `/explore/[city]` (ExploreCity, 부산 94카드)
- **교체할 요소** 별점 4.9/4.7/4.8 → **평점 데이터 없음, 제거하거나 실제 필드로 대체** · 영문 고정 문구 → i18n
- **구현 차수** 초기

### `explore_map_discovery`
- **최종 역할** Explore 지도 모드 + 장소 바텀시트
- **사용자 흐름** Map 토글 → 마커 선택 → `Add to Selected` / `View Detail`
- **현재 route/기능** `/explore/[city]` 지도 · `NaverMap`
- **교체할 요소** 지도 타일은 **네이버 지도로** · 하단 `My Picks`·`My Trips`·`Profile` 라벨 → 최종 5탭 · 별점 · `12 mins away` 거리 표기(실측 가능 여부 확인)
- **구현 차수** 초기

---

## 3. Picks (4)

### `my_picks_selected_places` ★ 기준 화면
- **최종 역할** **Picks 허브** — `Selected` / `Saved` / `My Places` 3탭 구조의 정본
- **사용자 흐름** 하단 Picks 탭 → Selected 확인 → `Build My Trip with AI` → Planner
- **현재 route/기능** CartDrawer(Selected) · `/saved`(Saved·My Places 2탭 이미 존재)
- **교체할 요소** 브랜드 `GOKOREAMATE` 대문자 → `gokoreamate` · 서울 더미 장소 · 카운트 배지 수치
- **구현 차수** 초기

### `picks_saved_collection`
- **최종 역할** Picks > **Saved** — 날짜 없는 관심 목록
- **사용자 흐름** Picks 탭 → Saved → 항목을 Selected 로 이동 또는 상세 진입
- **현재 route/기능** `/saved` (favorites)
- **교체할 요소** **브랜드 "Luminous Voyage" → GoKoreaMate** · **한국 외 장소(스위스·도쿄·런던) → 한국 장소** · **가격 표기($540/night 등) → 가격 데이터·상거래 없음, 제거** · 별점
- **구현 차수** 초기

### `picks_my_private_places_refined`
- **최종 역할** Picks > **My Places** — 사용자 등록 개인 장소
- **사용자 흐름** Picks 탭 → My Places → 편집·삭제 · `Add to Selected` · `+` 로 신규 등록
- **현재 route/기능** `/saved` My Places 탭 · `user_spots` API
- **교체할 요소** 브랜드명 · **파리 더미 장소 → 한국** · 화면 제목 "Picks – Refined My Private Collection" → 최종 문구
- **비고** 우하단 `+` 는 **문맥형 추가 버튼으로 허용**(전역 Build FAB 아님)
- **구현 차수** 초기

### `my_places_register_new_place`
- **최종 역할** 개인 장소 **등록 폼** (최종안)
- **사용자 흐름** My Places `+` → 사진·이름·주소·지도·카테고리·메모 → `Save Place`
- **현재 route/기능** `user_spots` POST · 현재 CRUD 는 일정 편집기 내부
- **교체할 요소** 지도 샘플(런던 Soho) → 네이버 지도 · 카테고리 칩을 실제 category 계약과 정합
- **구현 차수** 후속
- **비고** 이 화면이 **장소 등록 최종안**이다. 구형 Memory 형태 등록 화면은 패키지에 없다

---

## 4. Planner (3)

### `planner_travel_preparation`
- **최종 역할** Planner 1단계 — 여행 조건 입력
- **사용자 흐름** Picks `Build My Trip` → 날짜·인원·도착/출발·템포 → `Generate My Itinerary`
- **현재 route/기능** `/#planner` (HomeClient 플래너 섹션) · `cart_hints`
- **교체할 요소** 브랜드명 · **`Journey Tempo`(Relaxed/Balanced/Busy)와 `Reservations`는 현재 없는 기능** → 신규 결정 필요 · "5 curated spots from your picks" 수치
- **구현 차수** 초기(기본 입력) / 후속(Tempo·Reservations)

### `planner_ai_generating_optimized`
- **최종 역할** Planner 2단계 — **생성 대기 화면** (실측 6~20초)
- **사용자 흐름** Generate → 진행 표시 → 결과
- **현재 route/기능** `POST /api/trip/plan`
- **교체할 요소** **"Crafting your Luminous voyage" 콘셉트명 노출 → 제거** · `GOKOREA INTELLIGENCE` 문구 · 우측 텍스트 잘림 · 진행 단계 문구를 실제 스케줄러 단계와 정합
- **구현 차수** 초기

### `planner_review_save_trip`
- **최종 역할** Planner 3단계 — 일정 검토·편집·저장
- **사용자 흐름** 생성 결과 → Day 탭·순서 편집 → `Save & Start Journey` → Trips
- **현재 route/기능** `/itinerary` (타임라인·인라인 편집·1.5초 디바운스 저장)
- **교체할 요소** 하단 `My Picks`·`My Trips`·`Profile` → 최종 5탭 · **시간 순서 오류(7:00 AM → 1:30 AM → 2:00 PM)** · `BUILD 15% Distance Saved` 등 **미검증 수치 → 실측 가능한 값만 표시** · 지도는 네이버
- **구현 차수** 초기

---

## 5. Trips · Memory (4)

### `trips_refined_archive`
- **최종 역할** **Trips 목록** — 진행/예정 여행 + Memory Archive
- **사용자 흐름** 하단 Trips 탭 → 여행 선택 → 일정 또는 Memory
- **현재 route/기능** `/my-trips`
- **교체할 요소** 폴더명이 `archive` 이나 실제 역할은 **목록** · 2024 더미 날짜 · `128 Photos`·`12 Memory Stories` 수치 · `Open Optimizer` 등 미구현 CTA
- **구현 차수** 초기

### `trips_memory_timeline`
- **최종 역할** **Memory Timeline** — 여행별 날짜순 기록
- **사용자 흐름** Trips → 여행 → Timeline → `+` 로 Memory 추가
- **현재 route/기능** `/itinerary` 내부 `TripMomentTimeline` · `/api/trip-moments`
- **교체할 요소** **베트남·인도네시아 더미 여행 → 한국** · **"Auto-synced route from Google Maps" 제거**(네이버 지도 사용) · `16 Likes` → 좋아요 기능 없음 · 지도 자산
- **비고** 우하단 `+` 는 **문맥형 Memory 추가로 허용**
- **구현 차수** 초기

### `memory_create_new_entry`
- **최종 역할** **Memory 작성** — 사진·메모·위치·시각·공개범위
- **사용자 흐름** Timeline `+` 또는 일정 화면 `Capture Moment` → 작성 → `Save Memory`
- **현재 route/기능** `TripMomentCapture` · `POST /api/trip-moments` · Storage 업로드
- **교체할 요소** 브랜드명 · 아말피 더미 · **"Visible to travel companions" → 동행자 계정 개념 없음. 공개/비공개 2단계로** · 하단 활성 탭이 `Picks` 로 잘못 표시 → `Trips` · 카드 겹침 레이아웃
- **구현 차수** 초기

### `private_journal_my_thoughts`
- **최종 역할** **Memory 상세 · 개인 기록**(장문 저널)
- **사용자 흐름** Timeline → 항목 선택 → 상세 열람·편집
- **현재 route/기능** `trip_moments` 상세 · 메모 편집 PATCH
- **교체할 요소** **`Voice Journal`(음성 녹음)·`Current Vibe`·`Export to PDF` 는 현재 없는 기능** → 신규 결정 필요 · 폴라로이드가 본문을 가림 · 하단 CTA 가 내비에 잘림 · 4탭+Profile 잔재
- **구현 차수** 후속

---

## 6. Share (2)

### `memory_share_social_postcard`
- **최종 역할** **단일 Memory 의 개인 사진·장소·메모를 공유 자산으로 만드는 화면**
- **사용자 흐름** Memory 상세 → Share → 스타일·비율 선택 → `Export`
- **현재 route/기능** 없음(신규). 참고: 브라우저 Canvas 공유 카드 파이프라인 존재
- **교체할 요소** **스타일 3종 × 비율 3종 × 필터 4종 → 초기에는 단일 템플릿으로 축소 검토** · `src="placeholder"` 깨진 상대경로 3건 · 해시태그 더미
- **구현 차수** **후속** — 실제 생성·내보내기 구현은 별도 배치 가능하며 **초기 구현 차단 조건이 아니다**

### `share_travel_story_card`
- **최종 역할** **여행 전체 Story 공유** (에디토리얼형)
- **사용자 흐름** Trips/Memory → Story 공유 → 공개 링크 또는 이미지
- **현재 route/기능** `/shared/[id]` · `TripStoryExport`
- **교체할 요소** 브랜드 "Luminous Voyage" → GoKoreaMate · `Route Analytics` 수치 · `SYNC/BUILD/OPTIMIZE MODE` 라벨을 실제 상태와 정합
- **구현 차수** 후속

---

## 7. 기타 (3)

### `more_support_settings`
- **최종 역할** **More** — 설정·지원·법적 고지
- **사용자 흐름** 하단 More 탭 → 언어·테마·문의·정책
- **현재 route/기능** `/about` · `ContactModal` · `LanguageSwitcher`
- **교체할 요소** **`Currency (USD)` → 통화 기능 없음** · **`24/7 Live Assistance` → 실제 지원 수준으로** · `v2.4.0` 버전 표기 · 다크 모드 토글은 다크 토큰 완비 후
- **비고** 구형 Profile 중심 More 대안은 패키지에 없다 ✓
- **구현 차수** 초기

### `city_entry_busan`
- **최종 역할** **도시 진입 랜딩**(에디토리얼) — Editorial 상업 범위
- **사용자 흐름** Home Discover 도시 선택 / 외부 유입 → 도시 소개 → `Start Planning with AI`
- **현재 route/기능** `/busan` `/seoul` `/jeju` `/gyeongju`
- **교체할 요소** 브랜드 대문자 표기 · `AI ORCHESTRATION ACTIVE` 문구 · **부산 하드코딩 금지 — 도시별 템플릿으로**
- **구현 차수** 초기

### `place_detail_refined`
- **최종 역할** **장소 상세**
- **사용자 흐름** Explore 카드/지도 마커/검색 → 상세 → `Add to Picks`
- **현재 route/기능** `/place/[id]` · `EventDetailModal`
- **교체할 요소** **`AI 분석: 방문하기 좋은 시간` 차트 → 해당 데이터 없음** · 지도는 네이버 · 운영시간·주소는 `city_spots` 실제 값 · **Trip-Flow 구간이므로 상업 CTA 0 유지**
- **구현 차수** 초기

---

## 8. 문서 폴더 (화면 아님)

| 폴더 | 내용 | 지위 |
|---|---|---|
| `gokoreamate/DESIGN.md` | 토큰·타이포·컴포넌트 (Inter, `#0052CC`, FAB 언급) | **보조 참고** |
| `luminous_voyage/DESIGN.md` | 토큰·타이포·컴포넌트 (Plus Jakarta Sans, `#0055FF`, **FAB 없음·5탭 명시**) | **보조 참고** |

**어느 쪽도 단독 SSOT 가 아니다.** `implementation-contract.md` §1 우선순위를 따른다.

---

## 9. 참조

- `implementation-contract.md` — 구현 계약
- `../../product/home-experience-decision-v1.md` — Home 구조 결정
- `../../product/gokoreamate-product-constitution-v1.md` — 제품 최상위 SSOT
- `../../product/gokoreamate-product-status-v1.md` — 구현 상태 (`authority: NONE`)
