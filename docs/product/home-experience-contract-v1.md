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
/ Home  (route 1개, 가로 carousel 없음)
├─ HomeExperience              ← 신설. Hero 자리를 대체한다
│   ├─ Premium Discovery       기본
│   ├─ Memory Synergy          실제 Memory 가 있을 때
│   └─ Inspired Storytelling   Memory Synergy 에서 "View My Story" 선택 시
├─ AdaptiveHomeCard            기존 유지
├─ #planner                    기존 유지
├─ #essential                  기존 유지
├─ #spots-main                 기존 유지
├─ Survival Guide Preview      기존 유지
├─ footer                      기존 유지
└─ BottomNav (layout 전역)      기존 유지
```

가로 2패널 구조는 폐기했다. 세 화면은 같은 세로 위치에서 **상태로** 갈린다.

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

### 2-A. Premium Discovery — 기본

다음 중 하나라도 해당하면 Discovery 다.

- 소유 itinerary 없음
- 소유 itinerary 는 있으나 Memory 0건
- `/api/itineraries` 실패·타임아웃
- localStorage 접근 불가 (프라이빗 모드 등)
- 판정 진행 중 (loading)

즉 **Discovery 는 판정 실패의 안전 착지점이며 신규 사용자의 정상 화면**이다.

### 2-B. Memory Synergy — 활성 조건

두 조건을 **모두** 만족해야 한다.

1. `GET /api/itineraries` (헤더 `x-device-id`) 가 돌려준 소유 itinerary 가 1건 이상
2. 그중 실제 `trip_moments` 가 1건 이상인 itinerary 가 존재

날짜는 판정에 쓰지 않는다. `end_date < 오늘`, 최근 7·30·90일 기준 전부 사용 금지.
"완료 여행"이 아니라 **"기록이 남은 여행"** 이 활성 조건이다.

#### deterministic selector

```
1. rows = GET /api/itineraries      (서버가 updated_at DESC 로 정렬해 준다)
                                     functions/api/itineraries.ts:52
2. 각 row 에 대해 moments = loadMoments(row.id)   ← localStorage, 네트워크 0
3. withMemory = rows.filter(r => moments(r).length > 0)
4. withMemory 가 비면 → Discovery
5. 정렬 키 (전부 기존 필드):
     1순위  해당 itinerary Memory 중 가장 늦은 captured_at  DESC
     2순위  itinerary.updated_at                            DESC
     3순위  itinerary.id                                    ASC   (완전 결정론용)
6. 첫 항목을 selectedTrip 으로 확정
```

같은 입력이면 항상 같은 결과가 나온다. 임의 기간·임의 최근성 정의가 없다.

#### N+1 회피 근거

- `GET /api/itineraries` → **1회**
- Memory 존재 판정은 `loadMoments(itinId)` = `localStorage["koreamate_moments_<id>"]`
  동기 읽기. `src/lib/trip-moments/storage.ts:22`. 네트워크 0회.
- 사진(`photo_data`) 도 localStorage 에만 있다. 서버는 사진을 내려주지 않는다
  (`storage.ts` 주석: "photo_data 는 서버에 전송하지 않음").

#### 알려진 한계 — blocker 로 기록

`GET /api/trip-moments?itinerary_id=` 는 **itinerary 1건 전용**이다
(`functions/api/trip-moments/index.ts:74`). 기기 전체의 Memory 보유 여부를 서버에
한 번에 물어보는 엔드포인트가 없다. 따라서:

- **기록을 남긴 그 기기**: 정상 동작 (localStorage 히트)
- **다른 기기 / 캐시 삭제 후**: 서버에 Memory 가 있어도 로컬이 비어 Discovery 로 떨어짐

이번 작업에서 API 는 만들지 않는다. 해소하려면 아래 **최소 aggregate 계약**이 필요하다.

```
GET /api/trip-moments/summary        헤더 x-device-id
→ [{ itinerary_id, moment_count, latest_captured_at }]
   소유권은 기존 GET 과 동일하게 itineraries.device_id 로 확인
   사진·memo·좌표는 반환하지 않는다
```

이 API 가 생기기 전까지 cross-device Memory Synergy 는 미지원으로 둔다.
사용자에게 오류로 보이지 않는다 — Discovery 가 정상 화면이기 때문이다.

### 2-C. Inspired Storytelling — 진입·종료

신규 사용자 기본 화면이 **아니다.**

```
Memory Synergy ── "View My Story" ──▶ Inspired Storytelling
       ▲                                        │
       └────────── Back / Close ────────────────┘
```

- Home 내부 로컬 state (`useState`) 로만 전환한다
- `pushState` / `replaceState` / URL 변경 / history entry **전부 금지**
- 새로고침 시 Story 자동 복원 불필요 → Memory Synergy 로 돌아간다
- Memory Synergy 가 고른 **같은 itinerary** 만 대상으로 한다
- Memory Synergy 가 비활성이면 Storytelling 진입 경로 자체가 없다

#### Timeline 에 실제로 표시 가능한 필드

`TripMoment` (`src/lib/trip-moments/types.ts`) 전 필드:

| 필드 | Story 사용 | 비고 |
|---|---|---|
| `captured_at` | 날짜·시각 | ISO datetime. 기존 `TripMomentTimeline` 은 `ko-KR` 로케일 포맷 |
| `memo` | 사용자 기록 본문 | **번역 금지** |
| `photo_data` | 사진 | data URL, localStorage 전용 |
| `has_photo` | 서버 동기화 여부 | 표시용 아님 |
| `category` | 5종 (food/scenery/people/culture/random) | 이모지·라벨은 `MOMENT_CATEGORIES` |
| `location_label` | 위치 힌트 | `"35.1°N 129.0°E"` 형태. **장소명이 아니다** |
| `lat` / `lng` | 좌표 | 표시 선택 |
| `day_number` | Day N | nullable |

itinerary 쪽: `city`, `start_date`, `end_date`, `trip_title`, `cover_kind`, `cover_moment_id`.

**장소명은 없다.** PNG 의 `Jagalchi Market`·`Gamcheon Village` 같은 캡션에 대응하는
필드가 `trip_moments` 에 없다. `location_label` 은 좌표 문자열이다. 따라서 Timeline
캡션은 `날짜 + 카테고리` 조합으로 가고, 장소명은 표시하지 않는다.

**사용자 인용문**으로 쓸 수 있는 실제 필드는 `memo` 하나뿐이다. PNG 의 큰따옴표
인용 스타일은 `memo` 를 그대로 인용부호 안에 넣어 구현한다. 없는 문장을 만들지 않는다.

#### 사진 없는 Memory

`photo_data === null` 인 Memory 는 텍스트 전용이다. 회색 박스를 쓰지 않고
`category` 이모지 + 토큰 배경(§7)으로 그린다. 고정 비율을 유지해 CLS 를 막는다.

### 2-D. AI Insight — 제거

저장된 AI 분석 계약이 **존재하지 않는다.** `src/` `functions/` 전체에서
`ai_insight` / `aiInsight` / `insight` 검색 결과 0건. `trip_moments` 테이블 select
컬럼에도 없다 (`functions/api/trip-moments/index.ts:87`).

따라서 PNG 의 `AI INSIGHT` / `AI OPTIMIZED` 블록은 **구현하지 않는다.**

- 가짜 AI 문장 생성 금지
- 사용자 `memo` 를 AI 결과처럼 표시 금지
- 결정론적 템플릿 문장을 "AI" 라고 표기 금지
- 새 AI API 를 이번에 만들지 않는다

대체: 해당 자리는 **여행 요약 영역**으로 바꾼다. 표시 항목은 실제 값만 —
도시, 기간(`start_date`~`end_date`), Memory 수, 카테고리 분포. "AI" 라는 표현을
쓰지 않는다.

---

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
 └─ loading ──────────────▶ Premium Discovery  (판정 중에도 Discovery 를 그린다)
      │
      ├─ 소유 itinerary 0 / Memory 0 / 조회 실패 ──▶ Premium Discovery
      │
      └─ Memory ≥ 1 ──▶ Memory Synergy ──"View My Story"──▶ Inspired Storytelling
                              ▲                                      │
                              └──────── Back / Close ────────────────┘
```

오류는 전부 Discovery 로 흡수한다. 에러 화면을 따로 만들지 않는다.
loading 중 Discovery 를 먼저 그리므로 **깜빡임 없이 Memory Synergy 로 교체**된다
(정적 export 는 Discovery 를 프리렌더한다).

### 상태별 데이터 흐름

| 항목 | Discovery | Memory Synergy | Storytelling |
|---|---|---|---|
| API | `/api/trips/popular` | `/api/itineraries` | (추가 호출 없음) |
| 로컬 | Selected/favorites | `loadMoments()` | 같은 Memory 재사용 |
| selector | 없음 (기본) | `home-experience-core.ts` | 부모 state |
| ownership | 불필요 | `x-device-id` 헤더 | 상위 판정 승계 |
| cache | 세션 내 1회 | 세션 내 1회 | 재조회 없음 |
| loading | 즉시 렌더 | Discovery 유지 | 즉시 |
| empty | 인기 여행 섹션 숨김 | 해당 없음 | Memory 0이면 진입 불가 |
| error | 그대로 렌더 | Discovery 로 | Memory Synergy 로 |
| image fallback | CityCardArt | 토큰 아트 | 카테고리 아트 |
| i18n | 신규 `home` 네임스페이스 | 동일 | 동일 |
| a11y | 카드 링크 44px, focus visible | 상태 전환 `aria-live` | Back 버튼 focus 복귀 |

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
src/components/home/HomeExperience.tsx
src/components/home/PremiumDiscoveryHome.tsx
src/components/home/MemorySynergyHome.tsx
src/components/home/InspiredStoryHome.tsx
src/components/home/CityCardArt.tsx
src/lib/home/home-experience-core.ts
src/lib/home/home-experience-core.test.ts
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

`home-experience-core.test.ts` 가 고정할 규칙:

1. itinerary 0건 → `discovery`
2. itinerary 있고 Memory 0건 → `discovery`
3. Memory 1건 이상 → `memory`, 선택된 itinerary id 확인
4. Memory 최신 `captured_at` 이 늦은 itinerary 가 선택된다
5. `captured_at` 동률 → `updated_at` 늦은 쪽
6. 둘 다 동률 → `id` 오름차순 (결정론)
7. 조회 실패(빈 배열) → `discovery`
8. 같은 입력 반복 호출 시 항상 같은 결과
9. 날짜 기반 판정 없음 — `end_date` 를 미래로 바꿔도 결과 불변
10. 사진 없는 Memory 도 Memory 로 계산된다

selector 는 순수 함수로 두고 fixture 를 주입한다. production 전역 테스트 hook 을
추가하지 않는다.

---

## 10. 남은 blocker

| # | 내용 | 영향 | 해소 조건 |
|---|---|---|---|
| B1 | 기기 전체 Memory 집계 API 없음 | cross-device Memory Synergy 미동작 | `GET /api/trip-moments/summary` 신설 |
| B2 | `trip_moments` 에 장소명 필드 없음 | Timeline 캡션이 날짜+카테고리로 제한 | DB 스키마 변경 |
| B3 | AI 분석 저장 계약 없음 | AI Insight 블록 전면 제거 | AI 결과 저장 계약 신설 |
| B4 | 도시 사진 4장 부재 | Seoul·Jeju·Gyeongju·Jeonju 는 토큰 아트 | §5 자산 + 권리 증빙 |
| B5 | 부산 1,533건 이미지 권리 미검증 | 해당 이미지 사용 불가 | HR-PROVENANCE-001 해소 |
| B6 | `public/images/spots/*.png` 1건 출처 불명 | 사용 보류 | 출처·권리 기록 |

B1~B3 은 Home 구현을 막지 않는다. 해당 요소를 빼고 구현하면 된다.
B4 는 fallback 으로 대체되며, 자산 확보 시 `CityCardArt` 를 사진 카드로 바꾸는
것만으로 교체된다.

---

## 11. 다음 실행 작업

```
TASK-GOKOREAMATE-HOME-EXPERIENCE-IMPLEMENT-V1
```

이 문서의 §9 를 그대로 구현한다. 추가 설계 질문 없이 착수 가능하다.
자산(§5)은 구현과 병행해서 받아도 되며, 없으면 §7 fallback 으로 완성한다.
