# GoKoreaMate — Trip Story Card UI 로드맵

> 브랜드: GoKoreaMate / gokoreamate.com
> 작성일: 2026-06-17
> Task: TASK-010 — Trip Story Card 9:16 UI 초안 추가
> 위치: `src/components/drafts/TripStoryCardDraft.tsx`

---

## 1. 개요: Trip Story Card란?

Trip Story Card는 GoKoreaMate 2.0의 **바이럴 루프(Viral Loop)** 핵심 컴포넌트입니다.

```
사용자가 여행을 마친 뒤
 └─ Trip Story Card 생성 (9:16 이미지)
      └─ SNS / 카카오톡에 공유
           └─ 친구가 링크를 클릭
                └─ gokoreamate.com 접속
                     └─ 친구의 여행 일정을 내 앱에 불러옴
                          └─ 신규 사용자 확보 (마케팅 비용 0)
```

> **비즈니스 목표**: 광고비 없이 유기적 신규 가입자를 확보하는 프로덕트 레드 그로스(PLG) 전략

---

## 2. 9:16 카드 CSS 설계 원칙

```tsx
// 무거운 외부 패키지 없이 순수 CSS로 반응형 9:16 구현
<div className="w-full max-w-[360px] mx-auto">
  <div className="relative w-full aspect-[9/16] overflow-hidden rounded-3xl">
    {/* 360px 기준 높이: 360 × (16/9) = 640px */}
    {/* aspect-[9/16] → CSS: aspect-ratio: 9 / 16 */}
    {/* overflow-hidden: 640px 초과 콘텐츠 자동 클립 */}
  </div>
</div>
```

**핵심 설계 결정**:
- `aspect-[9/16]` 사용 — `h-[640px]` 고정 높이 대신 반응형 비율 적용
- `max-w-[360px]`: 모바일 스크린샷 표준 최대 너비
- `overflow-hidden`: 레이아웃 오버플로우 방지, 카드 외형 보호
- 새 npm 패키지 없음 — Tailwind CSS + React만 사용 (패키지 추가 금지 룰 준수)

---

## 3. 카드 레이아웃 구조 (360×640px)

```
┌─────────────────────────────────┐  ← rounded-3xl (640px total height)
│ gokoreamate.com     Trip Story  │  ← Top bar (48px)
├─────────────────────────────────┤
│ ▬▬▬ (orange accent)            │
│ MY 2026 BUSAN                   │  ← Hero (140px)
│ TRIP ← orange                   │
│ 📅 Oct 3–7, 2026 · 5 days      │
│ 📍 Busan, South Korea 🇰🇷       │
├─────────────────────────────────┤
│                                 │
│  ┌───────────────────────────┐  │
│  │  📷   (photo placeholder) │  │  ← Featured Moment (flex-1)
│  │      Oct 4 · 05:15        │  │
│  └───────────────────────────┘  │  ← h-32 photo (128px)
│  해동용궁사에서 본 일출          │  ← Moment title
│  새벽 5시에 일어난 보람이...    │  ← Comment (line-clamp-2)
│                                 │
├─────────────────────────────────┤
│ MY HIGHLIGHTS                   │  ← Highlights (92px)
│ [🏖️ Haeundae] [🎨 Gamcheon]  │
│ [🐟 Jagalchi] [🏛️ Haedong]   │
├─────────────────────────────────┤
│ 🗺️ 5 places · 📸 3 · 🌙 5 days│  ← Stats bar (33px)
├─────────────────────────────────┤
│ gokoreamate.com            [G]  │  ← Footer (97px)
│ Plan your Korea trip free →     │
│ [📸 Save as Image — Stage 2]   │
└─────────────────────────────────┘
```

---

## 4. Mock 데이터 스키마 연결 (TASK-005 미러링)

TripStoryCardDraft는 아래 TASK-005 스키마를 mock으로 미러링합니다.

| Mock 인터페이스 | 실제 DB 테이블 | 연결 Task |
|----------------|--------------|----------|
| `TripSessionMock` | `trip_sessions` | TASK-005 |
| `TripPlaceMock` | `trip_items` → `places` JOIN | TASK-003 |
| `HighlightMomentMock` | `trip_moments` (include_in_share_card=true) | TASK-005 |
| `TripStatsMock` | `trip_sessions` + COUNT 집계 | TASK-005 |

**중요**: `TripPlaceMock.place_name`은 display-only 문자열입니다. 실제 구현에서는 반드시 `places.id` FK를 통해 조회해야 하며, place_name 텍스트를 DB에 직접 저장하는 것은 금지입니다.

---

## 5. 5단계 구현 로드맵

### Stage 1 — Capture-friendly UI Draft (현재: TASK-010 완료)
**위치**: `src/components/drafts/TripStoryCardDraft.tsx`

- 9:16 비율 카드 레이아웃 (CSS `aspect-[9/16]`)
- 다크 그라디언트 배경 (`#0f172a → #1a1f36`)
- Mock 여행 데이터 렌더링
- "Save as Image" 버튼 placeholder (클릭 가능, 아직 기능 없음)
- `"use client"` 선언 (Stage 2 onClick 준비)
- Draft 워터마크

**제한사항**: PNG 내보내기 없음, 실제 사용자 데이터 없음, Supabase 없음

---

### Stage 2 — Save as Image (별도 Task 필요, 사장님 승인 후)
**예정 위치**: `src/components/drafts/TripStoryCardDraft.tsx` 확장

- `html2canvas` 또는 `satori` + `@resvg/resvg-wasm` 도입 검토
- PNG 다운로드 기능 구현
- "Save as Image" 버튼 실제 동작 연결
- 카드 내 한글 폰트 임베딩 처리

**주의**: 패키지 추가는 별도 Task 기획서 및 사장님 승인이 필수입니다.

---

### Stage 3 — 실제 Trip Moments 연결 (별도 Task 필요, 사장님 승인 후)
**예정 위치**: `src/components/TripStoryCard.tsx` (drafts/ 탈출)

- `include_in_share_card: true` 인 실제 trip_moments 조회
- Supabase 쿼리 연결 (createClient)
- 실제 사용자 사진 표시 (photo_url)
- 프라이버시 검증: `visibility !== 'private'` or 본인 여행만 생성 가능

---

### Stage 4 — Share Link 생성 (별도 Task 필요, 사장님 승인 후)
**예정 위치**: `src/app/trip/[tripId]/story/route.tsx`

- OG 태그 + 공유 URL 생성 (`gokoreamate.com/trip/{tripId}/story`)
- 카카오 공유 SDK 연동 검토
- SNS 메타 태그 (`og:image`, `twitter:card`)
- 링크 만료 정책 정의

---

### Stage 5 — Friend Itinerary Reload (별도 Task 필요, 사장님 승인 후)
**예정 위치**: `src/app/trip/[tripId]/story/page.tsx`

- 공유 링크 접속 시 원본 여행 일정 미리보기
- "이 여행 일정 불러오기" CTA 버튼
- 신규 사용자: 회원가입 → 일정 복사 → GoKoreaMate 첫 경험
- 기존 사용자: 로그인 → 일정 복사
- **바이럴 루프 완성**: 이 단계에서 신규 유저 CAC $0 달성

---

## 6. 절대 금지사항 (TASK-010 범위)

```
금지 1: src/app/** 파일에 TripStoryCardDraft import 금지
금지 2: PNG 내보내기 패키지(satori, html2canvas 등) 추가 금지
금지 3: Supabase 쿼리 금지 (createClient 사용 금지)
금지 4: 실제 사용자 데이터 접근 금지
금지 5: navigator.share / clipboard API 호출 금지
금지 6: 실제 공유 URL 생성 금지
금지 7: gokoreamate 브랜딩 누락 금지
```

---

## 7. Mock → Real 전환 시 교체 대상

```typescript
// Before (Draft — Stage 1)
const MOCK_DATA: TripStoryCardDataMock = { session: {...}, places: [...], ... };

// After (Production — Stage 3+)
const data = await getTripStoryCardData({ tripId, userId });
// → trip_sessions + trip_items + trip_moments 조인 쿼리
```

---

*이 문서는 GoKoreaMate 2.0 Trip Story Card 구현 로드맵입니다.*
*GoKoreaMate / gokoreamate.com*
