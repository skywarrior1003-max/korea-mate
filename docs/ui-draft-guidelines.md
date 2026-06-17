# GoKoreaMate — UI Draft Component Sandbox 가이드라인

> 브랜드: GoKoreaMate / gokoreamate.com
> 작성일: 2026-06-17
> Task: TASK-009 — UI Draft Component Sandbox 추가
> 위치: `src/components/drafts/`

---

## 1. Sandbox란 무엇인가

> **운영 페이지(Production)와 완전히 격리된 UI 시각 실험실이다.**

`src/components/drafts/` 폴더는 GoKoreaMate 2.0 신규 UI 컴포넌트를 안전하게 검토하고 수정하기 위한 격리 공간입니다. 이 폴더의 컴포넌트는 별도 Task 승인 없이 운영 페이지에 연결할 수 없습니다.

---

## 2. Qwen → Claude Code 워크플로우

GoKoreaMate 2.0 UI 개발은 두 AI가 분업합니다.

```
[Qwen — 디자이너 AI]
  └─ 시각 구조 초안(.tsx) 생성
       │
       ▼
[Claude Code — 엔지니어 AI]
  └─ GoKoreaMate 컨벤션 적용
     - Tailwind 클래스 정리
     - TypeScript 타입 보강
     - gokoreamate.com 브랜딩
     - Mock 데이터 스키마 정합성 확인
     - tsc + build 검증
       │
       ▼
  src/components/drafts/ 에 배치 (Sandbox)
       │
       ▼
[사장님 결재]
  └─ 별도 Task 승인 후 운영 페이지 연결
```

---

## 3. 현재 Sandbox 컴포넌트 목록

| 파일 | 연결 스키마 | 설명 |
|------|------------|------|
| `KoreaReadyDraft.tsx` | TASK-007 `affiliate_links` | Korea Ready 섹션 — 제휴 링크 가로 스크롤 카드 |
| `StoryRouteCardDraft.tsx` | TASK-008 `route_templates` + `route_template_items` | 큐레이션 루트 카드 — 정류장 미리보기 포함 |
| `TripMomentCardDraft.tsx` | TASK-005 `trip_moments` | 여행 추억 카드 — 프라이버시 배지 + Story Card 토글 |

---

## 4. Mock → Real 전환 원칙

Draft 컴포넌트의 Mock 데이터는 실제 DB 스키마를 1:1로 미러링합니다. 전환 시 Mock 데이터 배열을 Supabase 쿼리 함수로 교체하면 됩니다.

```typescript
// Before (Draft — mock)
const MOCK_LINKS: AffiliateLinkMock[] = [{ ... }, { ... }];

// After (Production — real Supabase query)
const links = await getApprovedAffiliateLinks({ city: "busan", placement: "korea-ready-page" });
```

Mock 타입 인터페이스(`AffiliateLinkMock`, `RouteTemplateMock`, `TripMomentMock`)는 실제 스키마 타입으로 교체합니다.

---

## 5. 절대 금지사항

```
금지 1: src/app/** 파일에 drafts 컴포넌트를 import 금지
         (별도 Task 승인 후에만 운영 연결 가능)

금지 2: Supabase 쿼리 작성 금지
         (draft 컴포넌트 내에서 createClient() 사용 금지)

금지 3: useEffect + fetch/axios API 호출 금지
         (mock 데이터만 사용 — 외부 통신 없음)

금지 4: navigator.geolocation 사용 금지
         (GPS 접근은 별도 Task에서 승인 후 구현)

금지 5: 실제 제휴 링크 URL 삽입 금지
         (destination_url은 "#mock-link" 또는 비활성 처리)

금지 6: 실제 사용자 데이터 사용 금지
         (개인정보·세션·localStorage 접근 금지)

금지 7: 새 npm 패키지 추가 금지
         (기존 Tailwind + React만 사용)

금지 8: gokoreamate 브랜딩 누락 금지
         (모든 draft 컴포넌트 상단에 GoKoreaMate / gokoreamate.com 명시)
```

---

## 6. 스타일 컨벤션 (프로젝트 일관성 유지)

기존 `src/components/EventCard.tsx` 분석 결과를 기준으로 통일합니다.

| 항목 | 적용 클래스 |
|------|------------|
| 카드 외형 | `rounded-2xl shadow-md overflow-hidden bg-white border border-gray-100` |
| 이미지 영역 | `relative h-48 w-full overflow-hidden` + `object-cover` |
| 이미지 오버레이 | `absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent` |
| 주 색상 (오렌지) | `text-orange-500` / `bg-orange-500` |
| CTA 버튼 | `bg-[#1a1f36]` 다크 네이비 |
| 태그 알약 | `px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-gray-100 text-gray-600` |
| 호버 효과 | `hover:-translate-y-1 transition-all duration-500` |
| 드래프트 워터마크 | `text-[10px] text-gray-300 select-none` |

---

## 7. 운영 연결 절차

Draft 컴포넌트를 실제 운영 페이지에 연결하려면 반드시 별도 Task를 통해 사장님 승인을 받아야 합니다.

```
1. 새 Task 정의 (예: TASK-013-connect-korea-ready-ui)
2. 기획서 작성 및 사장님 승인
3. feature/TASK-013-* 브랜치에서 작업
4. drafts/ 컴포넌트를 src/components/ 로 이동 또는 복사
5. Mock 데이터 → Supabase 쿼리 교체
6. tsc + build 검증
7. PR 생성 및 사장님 결재
```

---

*이 가이드라인은 GoKoreaMate 2.0 UI 개발 표준입니다.*
*GoKoreaMate / gokoreamate.com*
