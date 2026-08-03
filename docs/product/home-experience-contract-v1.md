# Home Experience Contract v1

TASK-GOKOREAMATE-HOME-CONTRACT-ASSET-GATE-V1
기준 커밋: `d9bf77f06c3029b06cf1feb7440f7411c78b77af`

이 문서는 Home 최종 디자인 3종을 구현하기 위한 단일 계약이다. 다음 구현 작업은
이 문서만 읽고 추가 질문 없이 시작할 수 있어야 한다. 여기 적힌 경로·API·필드는
전부 저장소에서 실제로 확인한 값이다. 추정한 값은 없다.

디자인 원본: `docs/design/final-mobile-2026-08-02/`
— `home_screen_premium_discovery` / `home_ai_memory_synergy` / `home_ai_inspired_storytelling`

---

## 1. 최종 Home 구조

```
/ Home  (route 1개)
├─ HomeExperience              ← 신설. 기존 Hero 자리를 대체한다
│   │                            상단만 수동 가로 2페이지. Home 전체가 아니다
│   ├─ Page 1
│   │    ├─ 기본        Inspired Storytelling   (브랜드 에디토리얼)
│   │    └─ 개인화      Memory Synergy          (명시적 여행 마무리 신호 필요)
│   └─ Page 2           Premium Discovery
├─ AdaptiveHomeCard            기존 유지
├─ #planner                    기존 유지
├─ #essential                  기존 유지
├─ #spots-main                 기존 유지
├─ Survival Guide Preview      기존 유지
├─ footer                      기존 유지
└─ BottomNav (layout 전역)      기존 유지
```

Page 1·Page 2 는 **HomeExperience 내부에서만** 가로로 넘어간다. Planner 이하
섹션은 그 아래로 평소처럼 세로로 이어진다. Home 전체를 carousel 에 넣지 않는다.

자동 슬라이드·타이머·URL 변경·history entry 는 전부 금지다.


### 1-1. 현재 Home 실측 구조

`src/app/HomeClient.tsx` 2,245줄. 렌더 순서:

| 줄 | 요소 | 처리 |
|---|---|---|
| 894 | `<header>` sticky 네비 | 유지 |
| 932 | Hero `<section>` `#1a1a2e` + 금색 radial glow | **대체** — HomeExperience 가 이 자리에 들어간다 |
| 1063 | `<AdaptiveHomeCard />` | 유지 (Hero 바로 아래 `-mt-8` 로 물려 있음 → 상단 교체 시 여백 재확인 필요) |
| 1071 | `<section id="planner">` | 유지, 이동 금지 |
| 1327·1367 | Vibe / Departure 모달 | 유지 |
| 1425 | City Quick Links | Discovery 도시 카드와 역할이 겹친다 → **제거 검토 대상** (§8) |
| 1429 | `<section id="essential">` `#f0f4ff` | 유지 |
| 1517 | `<section id="spots-main">` | 유지 |
| 2001 | Survival Guide Preview `#1a1f36` | 유지 |
| 2032 | `<footer>` | 유지 |

Hero 는 사진이 아니라 `#1a1a2e` 바탕 + 금색·보라 radial gradient 다. 즉 현재
Home 상단에는 **교체로 잃을 사진 자산이 없다.**

### 1-2. `#planner` focus·scroll 계약 (변경 금지)

- `HomeClient.tsx:600` 클론 진입 시 `getElementById("planner")?.scrollIntoView({behavior:"smooth"})`
- `HomeClient.tsx:604-616` 해시가 `#planner` 일 때 섹션에 프로그램적 focus.
  섹션은 `tabIndex={-1}` + `aria-labelledby="planner-heading"`
- `HomeClient.tsx:907·919·965` 기존 Hero CTA 3개가 같은 scroll 호출을 쓴다
  → Hero 교체 시 **이 3개 호출을 HomeExperience CTA 로 이관**해야 한다
- 외부 진입점: `src/app/picks/PicksClient.tsx:217`, `src/app/place/[id]/PlaceDetailClient.tsx:441`,
  `src/components/CartDrawer.tsx:56` — 전부 `/#planner`. 계약 유지.

### 1-3. 최소 컴포넌트 경계

`HomeClient.tsx` 대규모 분리는 하지 않는다. Hero 블록만 교체하고 신규 파일에 담는다.

```
src/components/home/
├─ HomeExperience.tsx          상태 분기 + 로딩/에러 → Discovery fallback
├─ PremiumDiscoveryHome.tsx
├─ MemorySynergyHome.tsx
├─ InspiredStoryHome.tsx
└─ CityCardArt.tsx             사진 없는 도시의 공식 fallback 아트

src/lib/home/
├─ home-experience-core.ts     순수 selector (주입형, next/navigation 비의존)
└─ home-experience-core.test.ts
```

`home-experience-core.ts` 는 `home-city-param-core.ts` 와 같은 주입형 코어 패턴을
따른다 — `node --experimental-strip-types` 로 단독 실행 가능해야 한다.

---

## 2. Home 상태 계약

> **정정 이력 (R1)**
> 이 문서의 초판은 Premium Discovery 를 기본 Home 으로, Storytelling 을 개인
> Story 로 해석했다. 그 해석은 폐기한다. Storytelling 은 개인 데이터가 아니라
> **브랜드 에디토리얼 콘텐츠**이고, 그래서 첫 방문자에게 보여줄 수 있다.
> Memory Synergy 만 개인 데이터를 쓰며, Memory 존재가 아니라 **명시적 마무리
> 신호**로 켜진다.

### 2-A. Page 1 기본 — Inspired Storytelling

`home_ai_inspired_storytelling` 은 첫 방문자와 일반 방문자에게 보여주는
GoKoreaMate 의 브랜드·영감 콘텐츠다. **특정 사용자의 실제 Memory 가 아니다.**

전하는 것: "한국 여행은 이런 기억과 이야기로 남을 수 있습니다."

- PNG 의 날짜·장소·여행 단편·감성 문구는 **초기 편집형 콘텐츠**로 사용한다
- 계절·도시·축제·K-POP·캠페인별로 통째 교체 가능해야 한다
- 문구를 `HomeClient` 안에 흩지 않고 typed config 한 곳에 모은다
  → `src/data/home/editorial-story.ts`

표현 규칙:

| 허용 | 금지 |
|---|---|
| `A journey in Busan` | `Your saved memory` |
| `Moments from Korea` | `You wrote this` |
| `Your trip can become a story` | `Your actual trip record` |

에디토리얼 문구가 **사용자가 직접 쓴 글처럼 보이게** 하지 않는다.

### 2-B. Page 1 개인화 — Memory Synergy

세 조건을 **모두** 만족할 때만 Page 1 을 교체한다.

1. 사용자가 소유한 itinerary
2. 그 itinerary 의 실제 `trip_moments` 1건 이상
3. **사용자가 명시적으로 실행한 여행 마무리 또는 Story 생성 신호**

금지:

- `end_date` 가 지났다는 이유만으로 완료 추정
- 최근 7·30·90일 기준
- **Memory 가 생겼다는 이유만으로 자동 전환**
- 공개 여행을 개인 여행처럼 표시
- query parameter 로 production 상태 강제
- 임의 localStorage 완료 플래그 신설

#### 마무리 신호 조사 결과 — 없음

`finish` / `wrapUp` / `trip_end` / `createStory` / `story_created` /
`generateStory` / `shareStory` 를 `src/` `functions/` 전체에서 검색한 결과,
여행 마무리를 뜻하는 신호는 **0건**이다. 검색에 걸린 항목은 전부 무관하다
(`tripStart`/`tripEnd` 날짜 파라미터, Gemini `finishReason`).

`itineraries` 스키마에도 해당 필드가 없다:
`id · city · start_date · end_date · travelers · travel_style · days ·
trip_title · device_id · created_at · updated_at · view_count · helpful_count ·
is_public · copy_of · copy_count · cover_kind · cover_moment_id`

따라서:

- **production selector 는 항상 `false`** — Memory Synergy 는 운영에서 켜지지 않는다
- 기본 Page 1 은 Inspired Storytelling 을 유지한다
- 컴포넌트와 selector 계약은 구현하고 **fixture·unit test 로 검증**한다
- 신호를 새로 만들지 않는다 (DB·localStorage 모두)
- 활성화 blocker 로 기록한다 (§10 B1)

#### selector 계약

```
selectHomeExperience({ trips, momentsOf, finishSignalOf }) →
  { page1: "storytelling" | "memory", trip?: ItineraryRow }

  finishSignalOf 가 true 인 소유 itinerary 중
  실제 Memory 가 1건 이상인 것만 후보다.

  정렬 (전부 기존 필드):
    1순위  해당 itinerary Memory 중 가장 늦은 captured_at  DESC
    2순위  itinerary.updated_at                            DESC
    3순위  itinerary.id                                    ASC

  후보가 없으면 page1 = "storytelling"
```

production 에서는 `finishSignalOf` 가 상수 `false` 를 반환한다. 신호 계약이
생기면 그 함수 하나만 교체하면 된다 — selector·컴포넌트·테스트는 그대로다.

#### 데이터 접근

- 소유 itinerary: `GET /api/itineraries` (헤더 `x-device-id`) — 서버가
  `updated_at DESC` 정렬 (`functions/api/itineraries.ts:52`). **네트워크 1회**
- Memory 존재: `loadMoments(itinId)` = `localStorage["koreamate_moments_<id>"]`
  동기 읽기 (`src/lib/trip-moments/storage.ts:22`). **네트워크 0회 → N+1 없음**
- 사진 `photo_data` 는 localStorage 전용. 서버는 사진을 내려주지 않는다

`GET /api/trip-moments?itinerary_id=` 는 itinerary 1건 전용이라
(`functions/api/trip-moments/index.ts:74`) 기기 전체 Memory 보유 여부를 한 번에
묻는 엔드포인트가 없다. 마무리 신호가 생길 때 함께 필요한 최소 계약:

```
GET /api/trip-moments/summary        헤더 x-device-id
→ [{ itinerary_id, moment_count, latest_captured_at }]
   소유권은 기존 GET 과 동일하게 itineraries.device_id 로 확인
   사진·memo·좌표는 반환하지 않는다
```

### 2-C. Page 2 — Premium Discovery

`home_screen_premium_discovery` 는 **항상 두 번째 페이지**다. Page 1 이 어떤
상태든 Page 2 는 바뀌지 않는다.

역할: 도시 발견 · 공개 여행 발견 · Explore·City Entry 진입 ·
Saved·Selected·Planner 흐름 연결.

### 2-D. Memory Timeline 에 표시 가능한 필드

`TripMoment` (`src/lib/trip-moments/types.ts`):

| 필드 | 사용 | 비고 |
|---|---|---|
| `captured_at` | 날짜·시각 | ISO datetime |
| `memo` | 사용자 기록 본문 | **번역 금지** |
| `photo_data` | 사진 | data URL, localStorage 전용 |
| `has_photo` | 서버 동기화 여부 | 표시용 아님 |
| `category` | 5종 food/scenery/people/culture/random | `MOMENT_CATEGORIES` |
| `location_label` | 위치 힌트 | `"35.1°N 129.0°E"` — **장소명이 아니다** |
| `lat` / `lng` | 좌표 | 표시 선택 |
| `day_number` | Day N | nullable |

itinerary 쪽: `city` · `start_date` · `end_date` · `trip_title` · `cover_kind` ·
`cover_moment_id`.

**장소명 필드가 없다.** PNG 의 `Jagalchi Market` 같은 캡션에 대응하는 값이
`trip_moments` 에 없으므로 Memory 캡션은 `날짜 + 카테고리` 로만 구성하고
장소명을 만들어내지 않는다. 사용자 인용문으로 쓸 수 있는 실제 필드는 `memo`
하나뿐이다.

사진이 없는 Memory 는 회색 박스가 아니라 카테고리 이모지 + 토큰 배경(§7)으로
그리고 고정 비율을 유지해 CLS 를 막는다.

### 2-E. AI 감성 문구 — 이번 범위 밖, 확장점만 남긴다

저장된 AI 분석 계약이 **존재하지 않는다.** `ai_insight` / `aiInsight` /
`insight` 검색 0건, `trip_moments` select 컬럼에도 없다
(`functions/api/trip-moments/index.ts:87`).

따라서 PNG 의 `AI INSIGHT` · `AI OPTIMIZED` · `AI CURATED` · `AI's Pick` 블록은
구현하지 않는다. 가짜 AI 문장 생성, 사용자 `memo` 를 AI 결과로 표시,
결정론적 템플릿을 "AI" 라고 표기 — 전부 금지.

#### 제품 방향 (후속 작업용 기록)

AI 감성 문구는 여행 마무리 전용 기능이 아니다. 장소·맛집·My Places·Memory
**하나마다** 문구를 제안할 수 있어야 한다. 입력 후보:

장소 · 사진 · 날짜 · 시간대 · 짧은 메모 · 여행 분위기 · 같은 날 앞뒤 일정 · 동행 유형

```
장소 하나      → 장소별 감성 문구
장소 여러 개   → 하루 여행 이야기
여러 날        → 전체 여행 Story
여행 마무리    → Memory Synergy 에서 장소별 문구와 Memory 를 모아 정리·공유
```

사용자 선택권: AI 제안 그대로 사용 · 수정 · 다시 생성 · 직접 작성 · 저장 ·
Story 에서 제외.

#### 비용 최적화 단계

| 단계 | 내용 | AI 호출 |
|---|---|---|
| 1 | 장소 ID + 언어 + 분위기 + 시간대 + 장소 유형으로 **저장된 공용 문구** 반환 | 없음 |
| 2 | 저장된 다른 공용 문구 후보 제공 | 없음 |
| 3 | 사용자 사진·메모·하루 일정이 반영될 때만 **개인화 호출** | 있음 |

#### 공용 문구 / 개인화 문구 구분

| 구분 | 저장 | 재사용 |
|---|---|---|
| 공용 문구 | 장소·상황 기준 공용 저장 | 같은 조건의 다른 사용자에게 재사용 가능 |
| 개인화 문구 | 사용자 사진·메모가 들어가므로 **사용자별 저장** | **다른 사용자에게 재사용 금지** |

#### 이번 구현이 남기는 확장점

- Memory Synergy 에 장소별 saved story copy 를 받을 **typed slot** 을 둔다
- 값이 없으면 **해당 블록을 숨긴다.** 빈 가짜 문구를 만들지 않는다
- 브랜드 Storytelling 의 편집형 문구는 그대로 표시한다 (AI 산출물이 아니다)
- AI API·문구 저장 테이블·생성 기능은 만들지 않는다


## 3. Premium Discovery 데이터 계약

### 3-1. 도시 카드

| 도시 | route | plannerReady | 콘텐츠 | 이미지 |
|---|---|---|---|---|
| Busan | `/busan/` | true | 6 highlight + 6 practical | KOGL 24종 (§4) |
| Seoul | `/seoul/` | true | 6 + 6 | 없음 → fallback |
| Jeju | `/jeju/` | true | 6 + 6 | 없음 → fallback |
| Gyeongju | `/gyeongju/` | true | 6 + 6 | 없음 → fallback |
| Jeonju | `/jeonju/` | **false** | 없음 (Coming Soon) | 없음 → fallback |

출처: `src/data/cities/entry-content.ts` 의 `plannerReady` / `highlights` / `practical`,
`src/data/cities/index.ts` 의 `CITY_SLUGS`.

- 카드 설명은 `CityEntryContent.tagline` 또는 `CityConfig.seoDescription` 만 쓴다
- Jeonju 는 Coming Soon 배지를 달되 route 는 200 이므로 링크는 유효하다
- **부산 이미지·문구를 다른 도시에 재사용하지 않는다**
- 병합된 부산 1,533건은 repository 산출물이며 운영 데이터로 직접 import 하지 않는다

### 3-2. 인기 여행 일정

`GET /api/trips/popular?limit=&city=&travel_style=` → `PopularTrip[]`
(`src/lib/supabase.ts:38`, `functions/api/trips/popular.ts`)

서버는 `is_public = true` 만 조회하고 `view_count DESC` 로 정렬한다. private 노출 없음.

| 필드 | 표시 | UI label |
|---|---|---|
| `trip_title` | 제목 | 없으면 `city` + 기간으로 대체 |
| `city` | 도시 | — |
| `start_date` / `end_date` | 기간 또는 N days | — |
| `view_count` | 조회 | **`{n} views`** (`story.copied` 기존 키) |
| `helpful_count` | 도움 | **`helpful`** (`story.helpful` 기존 키) |
| `copy_count` | 복사 | **`Copied {n} times`** (`creatorStats.copied` 기존 키) |
| cover | 썸네일 | `/img/trip-cover/{id}` (§4) |

**작성자명 필드가 스키마에 없다.** `@username` 은 구현하지 않는다.
좋아요 기능도 없다 (`like_count` / `likes` 검색 0건). **하트 아이콘 금지** —
`helpful` 을 Like 로, `view_count` 를 하트로 표기하는 것도 금지.

리스트가 비거나 모든 지표가 0이면 **섹션 전체를 숨긴다.** 0을 그리지 않는다.

### 3-3. 목업 제거 대상

`home_screen_premium_discovery/screen.png` 에서 구현하지 않는 요소:

- `@김치익스플로러` `@네오트래블러` — 작성자 스키마 없음
- `♡ 1.2k` `♡ 856` — 좋아요 기능 없음
- 우하단 `+` FAB — 전역 FAB 추가 금지
- 하단탭 `홈/탐색/찜/여행/프로필` — 현재 BottomNav(`home/explore/picks/trips/more`) 유지
- `auto_awesome` `ios_share` `smart_toy` `directions_run` `add` `arrow_forward`
  — Material Symbols 리거처가 폰트 미로드로 글자 노출된 것. 내부 아이콘·CSS shape 로 대체
- `cdn.tailwindcss.com` / `fonts.googleapis.com` — 외부 CDN·폰트 추가 금지

---

## 4. 이미지 자산 inventory

### USABLE_NOW

| 자산 | 위치 | 근거 |
|---|---|---|
| 부산 커버 24종 | `data/trip-cover/busan-v1-assets.json` | `license_type: kogl_type1` 전량. 발행처 한국관광공사. `cover-core.ts` 가 KOGL Type 1 아닌 자산을 코드로 거부한다 |
| 커버 프록시 | `GET /img/cover/:assetId` (`functions/img/cover/[assetId].ts`) | 같은 출처. 클라이언트가 원본 호스트를 직접 부르지 않는다 |
| 여행 표지 | `GET /img/trip-cover/:itineraryId` (`functions/img/trip-cover/[itineraryId].ts`) | 개인 표지 무효 시 302 로 `/img/cover/:assetId` 대체 |
| 플레이스홀더 | `public/images/placeholder-spot.svg` | 내부 제작 |

부산 24종 상세: 테마 분포 `beach_ocean 6 · food_market 6 · nature_trails 6 ·
culture_village 3 · night_view 2 · accommodation 1`, 해상도 대부분 940×627,
전량 `place_match_status: theme_only`.

> **theme_only 의 의미**: 특정 장소의 사진이라고 표기하면 안 된다.
> `cover-core.ts` 주석이 이를 명시하고, `coverEyebrow()` 가 장소명 대신
> `CITY · THEME` 라벨을 쓰는 이유다. 도시 카드에 쓸 때도 캡션은
> 도시명 + 테마 라벨까지만 허용한다.

### USER_PRIVATE_ONLY

| 자산 | 저장 | 접근 |
|---|---|---|
| Memory 사진 | localStorage `koreamate_moments_<itinId>` 의 `photo_data` | 소유 기기에서만 |
| Memory 사진(서버) | private 버킷 | `GET /api/trip-moments/:momentId/photo-url` signed URL 600초, 소유자 전용 |
| 개인 표지 | `itineraries.cover_kind="moment"` + `cover_moment_id` | 소유자 GET 에서만 내려옴 |

**Memory Synergy·Storytelling 안에서만 사용한다.** 도시 카드·신규 사용자 Hero·
공개 인기 여행 썸네일에 사용 금지.

### RIGHTS_UNKNOWN

| 자산 | 규모 | 근거 |
|---|---|---|
| 부산 repository 이미지 URL | 이미지 보유 1,404건 | `busan-merge-readiness-high-risk-samples.json` HR-PROVENANCE-001: "이미지 권리(image_rights_status) 전수 미검증" |
| `public/images/spots/gwangalli-m-drone-light-show-arirang-busan.png` | 1건 | 출처·권리 기록을 저장소에서 찾지 못함 |

공개 Home 기본 자산으로 사용 금지. 권리 확인 전 USABLE_NOW 로 승격하지 않는다.

### MOCK_ONLY

- `lh3.googleusercontent.com` — 세 `code.html` 전부
- `www.transparenttextures.com` — `home_ai_memory_synergy/code.html`

구현 사용 금지. 복사·다운로드도 하지 않는다.

### MISSING

| 슬롯 | 상태 |
|---|---|
| Seoul / Jeju / Gyeongju / Jeonju 도시 카드 사진 | **0건.** 권리 확인된 자산 없음 |
| Discovery Hero 배경 사진 | 0건 |
| 비부산 여행 표지 fallback 사진 | 0건 (`/img/trip-cover` 는 부산 테마 풀만 참조) |

---

## 5. 필요한 Asset Pack

사진이 있어야 PNG 목표에 도달하는 슬롯만 적는다. §7 fallback 으로 대체 가능한
슬롯은 "선택" 으로 표기했다.

| # | 슬롯 | 화면 | 비율 | 최소 해상도 | crop | object-position | 권리 요구 | 없을 때 |
|---|---|---|---|---|---|---|---|---|
| 1 | Seoul 도시 카드 | Discovery | 3:4 | 900×1200 | mobile 3:4 / desktop 4:3 | `center 40%` | 상업 이용 + 2차 저작 허용 명시 | CityCardArt |
| 2 | Jeju 도시 카드 | Discovery | 3:4 | 900×1200 | 동일 | `center 40%` | 동일 | CityCardArt |
| 3 | Gyeongju 도시 카드 | Discovery | 3:4 | 900×1200 | 동일 | `center 45%` | 동일 | CityCardArt |
| 4 | Jeonju 도시 카드 | Discovery | 3:4 | 900×1200 | 동일 | `center 45%` | 동일 | CityCardArt (Coming Soon) |
| 5 | Busan 도시 카드 | Discovery | 3:4 | — | — | — | **확보됨** KOGL 24종 | — |
| 6 | Discovery Hero 배경 (선택) | Discovery | 16:9 | 1600×900 | mobile 4:5 | `center` | 동일 | 토큰 그라디언트 |
| 7 | 인기 여행 cover fallback | Discovery | 16:10 | 800×500 | — | `center` | **확보됨** `/img/trip-cover/:id` | 토큰 아트 |
| 8 | itinerary cover | Memory Synergy | 16:9 | — | — | `center` | **확보됨** 개인/KOGL | 토큰 아트 |
| 9 | Memory 사진 | Memory·Story | 원본 비율 유지 | — | 컨테이너 고정비 4:3 + `object-fit: cover` | `center` | 사용자 소유 | 카테고리 아트 |
| 10 | Story Hero | Storytelling | 3:4 | — | — | `center 35%` | 사용자 소유(cover 우선) | 토큰 아트 |

**권장 저장 경로·파일명** (자산 확보 시)

```
public/images/cities/seoul-card.webp
public/images/cities/jeju-card.webp
public/images/cities/gyeongju-card.webp
public/images/cities/jeonju-card.webp
public/images/cities/hero-korea.webp          (선택)
docs/product/city-image-rights-v1.md          권리 증빙 기록 (필수 동반)
```

권리 증빙에는 자산별로 **출처 URL · 발행처 · 라이선스 종류 · 상업 이용 가부 ·
2차 저작 가부 · 표기 문구**를 남긴다. 부산 24종이 이미 이 형식을 갖추고 있으므로
(`attribution_text` / `publisher` / `license_type`) 같은 스키마를 쓰면 된다.

**사용자에게 받아야 할 것**: 위 4개 도시 사진과 각각의 권리 증빙. 또는
"토큰 아트로 간다"는 결정. 둘 중 하나만 있으면 구현은 즉시 진행 가능하다.

외부 웹에서 임의 다운로드하지 않는다. AI 생성 관광 사진은 실제 장소를 오인시키므로
도시 대표 사진 대안으로 권장하지 않는다.

---

## 6. Asset Gate 판정

### `IMPLEMENTATION_READY_WITH_OFFICIAL_FALLBACK`

근거:

- Busan 은 권리 확인된 사진 24종을 이미 보유 → 사진 카드로 구현 가능
- Seoul·Jeju·Gyeongju·Jeonju 는 사진 0건 → §7 공식 fallback 으로 구현
- **이 혼합이 오히려 현재 제품 상태를 정직하게 반영한다.** Busan 만 실제 공개
  가능한 데이터 흐름을 갖고 있고 나머지는 준비 중이다. 사진 유무가 readiness 와
  일치하므로 시각적 불일치가 아니라 정보다
- Memory·Story 의 사진은 전부 사용자 자산이라 별도 확보가 필요 없다
- Discovery Hero 는 현재 Home Hero 도 사진이 아니라 그라디언트다 → 후퇴가 아니다

`HOLD_ASSETS` 로 두지 않은 이유: 사진 부재가 **차단** 이 아니라 **표현 선택**의
문제이고, 세 화면 모두 사진 없이도 정보 구조가 성립한다. 다만 §5 의 4장을
확보하면 Discovery 완성도가 확실히 올라간다 — 구현 후에도 교체 가능하도록
`CityCardArt` 와 사진 카드를 같은 인터페이스로 만든다.

---

## 7. 공식 Fallback 계약

임시 회색 박스를 쓰지 않는다. 저장소 토큰만 사용한다.

```
--gkm-action-primary #FF4A2D   Coral
--gkm-ink            #191C21   Ink
--gkm-signal-kpop    #5F5BD6   Violet
--gkm-text-sub       #565D66   --gkm-line #E5E7EA   --gkm-surface-dim #F6F7F8
```

`CityCardArt` 규칙:

- 고정 aspect ratio (도시 카드 3:4) — CLS 방지
- Ink 바탕 + 도시별로 각도·위치만 다른 Coral/Violet radial gradient
  (`CityEntry.tsx` Hero 와 같은 기법, 도시 slug 로 결정론적 파생)
- 도시명 타이포그래피가 주인공. 중립적 표현만 사용
- 비사진형 abstract shape 또는 CSS shape 허용
- `aria-label` 에 도시명 명시, 장식 레이어는 `aria-hidden`
- Coming Soon 도시는 점선 테두리 + 준비 중 배지

금지:

- 도시의 실제 모습처럼 보이는 생성 이미지
- 다른 도시 사진 재사용 — 특히 **부산 사진을 서울·경주·제주·전주에 사용 금지**
- 베이지·골드(`#FAF7F2` `#D4AF37` `#8C6239`) 구 팔레트 복귀
- 외부 icon font, 글자로 노출되는 Material Symbols ligature

---

## 8. PNG 요소 매핑

`KEEP` 그대로 / `ADAPT` 실데이터에 맞게 변형 / `REMOVE` 제거 / `BLOCKED` 선행 조건 필요

### home_screen_premium_discovery

| PNG 요소 | 판정 | 데이터 source | 사용 필드 | 권리 | 최종 처리 |
|---|---|---|---|---|---|
| 상단 로고 + 장바구니 | ADAPT | — | — | — | 기존 header 유지, 목업 아이콘 제거 |
| `안녕! / 어디로 떠나볼까요?` | KEEP | i18n | — | — | 4개 언어 신규 키 |
| 검색 바 | ADAPT | 기존 `#search-section` | — | — | Discovery 검색은 `#spots-main` 검색으로 스크롤. 검색 로직 신설 금지 |
| 도시 탐색 카드 | ADAPT | `CITY_ENTRY_CONTENT` | slug·tagline·plannerReady | Busan KOGL / 나머지 fallback | 5개 도시, `/{slug}/` 링크 |
| `비밀 장소 발견` | ADAPT | — | — | — | `/picks` (My Places) 진입 |
| `나의 여행 · 저장된 아이템 3개` | ADAPT | Selected cart + favorites | 실제 개수 | — | 0이면 개수 숨김 |
| `인기 여행 일정` | ADAPT | `/api/trips/popular` | title·city·기간·view/helpful/copy | public 전용 | §3-2 |
| `@김치익스플로러` 등 | **REMOVE** | 없음 | — | — | 작성자 스키마 부재 |
| `♡ 1.2k` `♡ 856` | **REMOVE** | 없음 | — | — | 좋아요 미구현. Views/Helpful/Copied 로 대체 |
| 여행 썸네일 | ADAPT | `/img/trip-cover/:id` | — | KOGL 302 | 없으면 토큰 아트 |
| 우하단 `+` FAB | **REMOVE** | — | — | — | 전역 FAB 금지 |
| 하단탭 5종 | **REMOVE** | — | — | — | 기존 BottomNav 유지 |
| Material Symbols | **REMOVE** | — | — | — | 내부 아이콘·CSS shape |

### home_ai_memory_synergy

| PNG 요소 | 판정 | 데이터 source | 사용 필드 | 권리 | 최종 처리 |
|---|---|---|---|---|---|
| 도시 Hero 사진 | ADAPT | `/img/trip-cover/:id` | `cover_kind`·`cover_moment_id` | 개인 또는 KOGL | 없으면 토큰 아트 |
| `AI CURATED` 배지 | **REMOVE** | 없음 | — | — | AI 큐레이션 계약 부재 |
| `3 Days in Busan` + 기간 | KEEP | `/api/itineraries` | `trip_title`·`city`·`start_date`·`end_date` | 소유자 | 제목은 번역하지 않음 |
| `Memory Timeline` | KEEP | `loadMoments()` | 전 Memory | USER_PRIVATE | §2-C |
| Memory 사진 | KEEP | `photo_data` | — | USER_PRIVATE | 없으면 카테고리 아트 |
| 날짜 + 장소명 캡션 | ADAPT | `captured_at`·`category` | — | — | **장소명 필드 없음** → 날짜+카테고리 |
| 사용자 인용문 | KEEP | `memo` | — | USER_PRIVATE | 인용부호만 추가, 원문 유지 |
| `smart_toy` / `directions_run` AI 코멘트 | **REMOVE** | 없음 | — | — | §2-D |
| `Share Your Story` | ADAPT | 기존 share 계약 | — | — | 신규 공유 기능 만들지 않음 |
| `Where to next?` + `Plan New Trip with AI` | KEEP | — | — | — | `/#planner` |
| `View My Story` | KEEP | — | — | — | Storytelling 진입 (§2-C) |
| `Stars AI's Pick for your vibe` | **REMOVE** | 없음 | — | — | 가짜 AI 판정 |

### home_ai_inspired_storytelling

| PNG 요소 | 판정 | 데이터 source | 사용 필드 | 권리 | 최종 처리 |
|---|---|---|---|---|---|
| 매거진 Hero `BUSAN: GOLDEN HOUR` | ADAPT | itinerary cover | `city` | 개인/KOGL | 도시명 기반. 잡지 호수·발행어 같은 허구 문구 금지 |
| `DAY 3 IN BUSAN` / `ISSUE 04` | ADAPT / **REMOVE** | `day_number` / 없음 | — | — | Day 는 실제 값, ISSUE 번호는 제거 |
| `AI PRECISION` `DESIGNED FOR YOU` | **REMOVE** | 없음 | — | — | §2-D |
| `기억의 조각들` Timeline | KEEP | `loadMoments()` | — | USER_PRIVATE | Memory Synergy 와 같은 데이터, 다른 표현 |
| 날짜 + 장소 캡션 | ADAPT | `captured_at` | — | — | 장소명 필드 없음 |
| 인용문 | KEEP | `memo` | — | USER_PRIVATE | 원문 유지 |
| `AI INSIGHT` / `AI OPTIMIZED` 블록 | **REMOVE** | 없음 | — | — | 여행 요약 영역으로 대체 (§2-D) |
| `AI 설계자가 만드는 맞춤형 매거진` | **REMOVE** | 없음 | — | — | 미구현 기능 광고 |
| 이메일 입력 필드 | **REMOVE** | — | — | — | Home 신규 수집 흐름 만들지 않음 |
| `다음 목적지는 어디인가요?` + CTA | KEEP | — | — | — | `/#planner` |
| Back / Close | KEEP | — | — | — | Memory Synergy 로 복귀 |
| 하단탭 | **REMOVE** | — | — | — | 기존 BottomNav |

**BLOCKED (선행 조건 필요)**

| 요소 | 선행 조건 |
|---|---|
| cross-device Memory Synergy | `GET /api/trip-moments/summary` (§2-B) |
| Timeline 장소명 캡션 | `trip_moments` 에 장소명 필드 추가 (DB 변경 → 이번 범위 밖) |
| 실제 AI Insight | AI 분석 저장 계약 신설 (이번 범위 밖) |
| Seoul·Jeju·Gyeongju·Jeonju 사진 카드 | §5 자산 4장 + 권리 증빙 |

---

## 9. 구현 계약

### 상태 흐름

```
mount
 └─ Page 1 = Inspired Storytelling   (에디토리얼. 데이터 조회와 무관하게 즉시 렌더)
      │
      └─ 마무리 신호 + Memory 있음 ──▶ Page 1 = Memory Synergy
                                        (현재 production 에서는 발생하지 않음)

Page 2 = Premium Discovery           (Page 1 상태와 무관하게 항상 동일)
```

Page 1 판정은 에디토리얼을 먼저 그린 뒤에만 교체하므로 첫 페인트가 지연되지
않고, 조회 실패는 그대로 Storytelling 유지로 흡수된다. 별도 에러 화면을
만들지 않는다.

### 상태별 데이터 흐름

| 항목 | Storytelling (P1 기본) | Memory Synergy (P1 개인화) | Discovery (P2) |
|---|---|---|---|
| API | 없음 (에디토리얼 상수) | `/api/itineraries` | `/api/trips/popular` |
| 로컬 | 없음 | `loadMoments()` | Selected/favorites |
| selector | 기본값 | `home-experience-selector.ts` | 없음 |
| ownership | 불필요 | `x-device-id` 헤더 | 불필요 (public 전용) |
| cache | 정적 | 세션 내 1회 | 세션 내 1회 |
| loading | 즉시 렌더 | Storytelling 유지 | 스켈레톤 없이 섹션 숨김 |
| empty | 해당 없음 | 신호 없으면 미활성 | 인기 여행 섹션 숨김 |
| error | 해당 없음 | Storytelling 유지 | 섹션 숨김 |
| image fallback | KOGL 밴드 또는 토큰 아트 | 토큰·카테고리 아트 | CityCardArt |
| i18n | `home` 네임스페이스 + 에디토리얼 4개 언어 config | `home` | `home` |
| a11y | 페이저 `aria-label`·indicator | 상태 전환 `aria-live` | 카드 링크 44px |

### i18n

신규 `home` 네임스페이스를 EN/KO/JA/ZH 에 **같은 키 수**로 추가한다.
현재 22개 네임스페이스 / 언어당 276키. 필요한 키:

`greeting` `greetingSub` `exploreCities` `viewAll` `secretPlaces` `myTrip`
`savedItems` `popularTrips` `views` `helpful` `copied` `myStory` `viewMyStory`
`backToMemories` `memoryTimeline` `tripSummary` `memoryCount` `planNewTrip`
`comingSoon` `cityCardAlt` `noPhotoAlt`

지표 라벨은 기존 `story.copied` / `story.helpful` / `creatorStats.copied` 와
표현을 일치시킨다. **사용자 여행 제목·`memo` 는 번역하지 않는다.**

### Planner 배치 (고정)

```
HomeExperience → AdaptiveHomeCard → #planner → #essential → #spots-main
→ Survival Guide → footer → BottomNav
```

`Build My Trip with AI` → `/#planner`. §1-2 의 scroll·focus 계약을 그대로 쓴다.
기존 Hero CTA 3개(`907` `919` `965`)의 호출을 HomeExperience 로 옮기되 동작은 동일해야 한다.

### 구현 예상 파일

**신규**

```
src/components/home/HomeExperience.tsx            2페이지 페이저 + 상태 분기
src/components/home/InspiredStorytellingHome.tsx  Page 1 기본
src/components/home/MemorySynergyHome.tsx         Page 1 개인화
src/components/home/PremiumDiscoveryHome.tsx      Page 2
src/components/home/CityCardArt.tsx               사진 없는 도시 fallback
src/components/home/home-experience-types.ts      공용 타입
src/components/home/home-experience-selector.ts   순수 selector
src/components/home/home-experience-selector.test.ts
src/data/home/editorial-story.ts                  에디토리얼 콘텐츠 (4개 언어)
```

**수정**

```
src/app/HomeClient.tsx        Hero(932-1060) 교체, CTA 이관, City Quick Links(1425) 중복 정리
src/messages/en.json          home 네임스페이스
src/messages/ko.json          동일
src/messages/ja.json          동일
src/messages/zh.json          동일
```

**변경 금지**

`#planner` 내부 / `CITY_ARRIVAL_OPTIONS` / itinerary 생성 payload / Selected cart /
`cart_hints` / Journey Tempo / preference·vibe / 일정 생성 알고리즘 /
API·DB·migration·RLS / 운영 `city_spots` / 부산 repository 산출물 /
Explore / City Entry / Place Detail / Picks / Trips·Memory API /
Share·Copy / `device_id` / BottomNav 정보구조 / Naver·Google Maps.

### 테스트 계약

`home-experience-selector.test.ts` 가 고정할 규칙:

1. itinerary 0건 → `storytelling`
2. itinerary 있고 Memory 0건 → `storytelling`
3. **Memory 만 있고 마무리 신호 없음 → `storytelling`** (자동 전환 금지)
4. 마무리 신호 + Memory 1건 이상 → `memory`, 선택된 itinerary id 확인
5. 마무리 신호 있으나 Memory 0건 → `storytelling`
6. 후보 여럿 → Memory 최신 `captured_at` 이 늦은 itinerary 선택
7. `captured_at` 동률 → `updated_at` 늦은 쪽
8. 둘 다 동률 → `id` 오름차순 (결정론)
9. 조회 실패(빈 배열) → `storytelling`
10. 같은 입력 반복 호출 시 항상 같은 결과
11. 날짜 기반 판정 없음 — `end_date` 를 미래로 바꿔도 결과 불변
12. 사진 없는 Memory 도 Memory 로 계산된다
13. production 기본 신호 함수는 항상 `false`

selector 는 순수 함수로 두고 fixture 를 주입한다. production 전역 테스트 hook 을
추가하지 않는다.

---

## 10. 남은 blocker

| # | 내용 | 영향 | 해소 조건 |
|---|---|---|---|
| B1 | **명시적 여행 마무리·Story 생성 신호 없음** | Memory Synergy production 미활성 | 마무리 신호 계약 신설 + `GET /api/trip-moments/summary` |
| B2 | `trip_moments` 에 장소명 필드 없음 | Timeline 캡션이 날짜+카테고리로 제한 | DB 스키마 변경 |
| B3 | AI 분석 저장 계약 없음 | AI Insight 블록 전면 제거 | AI 결과 저장 계약 신설 |
| B4 | 도시 사진 4장 부재 | Seoul·Jeju·Gyeongju·Jeonju 는 토큰 아트 | §5 자산 + 권리 증빙 |
| B5 | 부산 1,533건 이미지 권리 미검증 | 해당 이미지 사용 불가 | HR-PROVENANCE-001 해소 |
| B6 | `public/images/spots/*.png` 1건 출처 불명 | 사용 보류 | 출처·권리 기록 |

B1 은 Memory Synergy 를 운영에서 끄는 것으로 흡수한다 — 컴포넌트·selector·테스트는
구현되어 있으므로 신호가 생기면 함수 하나 교체로 켜진다. B2·B3 은 해당 요소를
빼고 구현하면 된다.
B4 는 fallback 으로 대체되며, 자산 확보 시 `CityCardArt` 를 사진 카드로 바꾸는
것만으로 교체된다.

---

## 11. 다음 실행 작업

이 문서 §9 는 `TASK-GOKOREAMATE-HOME-EXPERIENCE-IMPLEMENT-V1-R1` 에서 구현했다.

이어서 권장하는 작업:

1. **여행 마무리 신호 계약** — Memory Synergy 를 켜는 유일한 조건 (B1)
2. **장소별 AI 감성 문구** — §2-E 의 3단계 비용 구조부터
3. **도시 사진 4장 + 권리 증빙** — §5. 확보 시 `CityCardArt` 를 사진 카드로 교체
