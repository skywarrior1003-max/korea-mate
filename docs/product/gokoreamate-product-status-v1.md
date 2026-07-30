# GoKoreaMate Product Status v1 — 구현 상태 스냅샷

| 항목 | 값 |
|---|---|
| `document_title` | GoKoreaMate Product Status |
| `document_type` | **`IMPLEMENTATION_STATUS_SNAPSHOT`** |
| `authority` | **`NONE`** — 이 문서는 제품 SSOT가 아니다. 아무것도 결정하지 않는다 |
| `status` | **`VERIFIED_SNAPSHOT`** — 아래 `verified_commit` · `verified_db_date` 기준으로 **검증이 완료된 상태**라는 뜻이다. 제품 권한을 뜻하지 않는다 |
| `document_version` | 1.0 |
| `verified_commit` | `1024698` — 이 저장소 commit 기준으로 구현 사실을 검증했다 |
| `verified_db_date` | 2026-07-29 — 이 날짜 기준으로 운영 DB 사실을 검증했다 (코드 사실은 2026-07-30 재확인) |
| `current_product_authority` | 제품 방향 ACTIVE 권한은 **`gokoreamate-product-constitution-v1.md` v1.1 ACTIVE**에 있다 |
| `this_document_authority` | **항상 `NONE`.** 활성화 전환 대상이 아니다 |
| `data_authority` | 데이터 · DB 최상위 SSOT는 `../architecture/gokoreamate-data-contract-v1.md`(v1.2 ACTIVE)다 |
| `freshness_rule` | **수치와 구현 상태가 바뀌면 이 문서가 아니라 실제 저장소·DB가 우선한다.** 차이를 발견하면 이 문서를 갱신한다 |
| `update_rule` | 아래 **갱신 규칙** 참조 |

**이 문서를 근거로 제품 방향을 바꾸지 않는다.** 여기 적힌 것은 "현재 이렇게 되어 있다"이지 "이렇게 되어야 한다"가 아니다.

### 갱신 규칙 (`update_rule`)

이 문서는 **Product Constitution의 핵심 원칙 변경 승인 절차 없이 갱신할 수 있다.** 그것이 Constitution과 분리한 이유다. 다만 "절차가 없다"가 "아무렇게나 고쳐도 된다"는 뜻은 아니다. 갱신에는 다음이 모두 요구된다.

- **확인 가능한 증거가 필수다** — 실제 저장소 · 운영 DB · 배포 결과 등 재현 가능한 근거 없이 고치지 않는다
- **저장소 사실**에는 검증 대상 `verified_commit`을 기록한다
- **DB 사실**에는 `verified_db_date`를 기록한다
- **`FACT` · `INFERENCE` · `UNKNOWN`을 구분**해 적는다
- **확인하지 않은 내용을 `IMPLEMENTED`로 바꾸지 않는다**
- 실제 저장소·DB와 이 문서가 다르면 **실제 상태가 옳다**
- **이 문서는 Product Constitution의 원칙이나 제품 결정을 만들거나 바꿀 수 없다** — 사실만 기록한다

---

## 1. 상태 표기

| 표기 | 의미 |
|---|---|
| `IMPLEMENTED` | 저장소·운영 DB에서 실측 확인된 현재 기능 |
| `PARTIAL` | 일부만 구현. 나머지는 미구현 |
| `PLANNED` | 방향은 확정. 구현 없음 |
| `KNOWN_DEVIATION` | 원칙과 현재 코드가 다름 |
| `UNKNOWN` | 확인되지 않았거나 미결정 |

---

## 2. 운영 데이터 실측 (2026-07-29)

| 대상 | 값 |
|---|---|
| `city_spots` | 86행 / 34컬럼 (전부 `busan`) |
| `city_spots` ACL | `anon=r` · `authenticated=r` · `postgres`·`service_role`=전권 (Security-0 적용 완료) |
| `itineraries` | 55행 / 23컬럼 · 공개 49 · 복사본 1 · 개인 커버 0 |
| `trip_moments` | **0행** |
| `user_spots` | 1행 · 카탈로그 반영 0 |
| `itinerary_helpful_votes` | 0행 |
| `spot_reactions` | 9행 |

**이 숫자들은 정상 운영만으로도 계속 바뀐다.** 인용할 때는 반드시 측정일을 함께 쓴다.

---

## 3. 사용자 자산 축적 상태

Constitution §4가 열거한 자산의 현재 축적 수준이다.

| 자산 | 상태 | 근거 |
|---|---|---|
| 공개 카탈로그 장소 | `IMPLEMENTED` | `city_spots` |
| 사용자 등록 장소 | `IMPLEMENTED` | `user_spots` 16컬럼 (`submission_status`·`city_spot_id`·`published_at`·`device_id`·`photo_url`) |
| 개인 일정 | `IMPLEMENTED` | `itineraries` |
| 공개 일정 | `IMPLEMENTED` | `itineraries.is_public` |
| **복사된 일정** | `IMPLEMENTED` | `copy_of` (FK→`itineraries.id`, `ON DELETE SET NULL`) · `copied_at` · `copy_count`. migration 018·019·030. `functions/api/itinerary/copy.ts`가 기록하고 `increment_copy_count` RPC로 원본 카운트 증가 |
| 사진·메모·trip moments | `IMPLEMENTED` | `trip_moments` 14컬럼 (`is_public`·`device_id`·`city_spot_id`). 운영 데이터 0행 |
| Trip Cover | `IMPLEMENTED` | `cover_kind`·`cover_asset_id`·`cover_moment_id`·`cover_consent_at`·`cover_consent_version` |
| 도움됨 신호 | `IMPLEMENTED` | `itinerary_helpful_votes` · `itineraries.helpful_count` |
| 반응 신호 | `IMPLEMENTED` | `spot_reactions` |
| 조회 신호 | `IMPLEMENTED` | `itineraries.view_count` |
| **저장한 장소 (Saved / Favorites)** | **`PARTIAL`** | 아래 §3-1 |
| **실제 방문한 장소 (Visited)** | **`PARTIAL`** | 아래 §3-1 |
| **일정에 추가한 장소 (Cart)** | **`PARTIAL`** | 아래 §3-1 |
| 장소·일정의 순서·날짜·동선 관계 | `PARTIAL` | `itineraries.days` jsonb에 존재. `city_spot_id` 연결 0건 (Data Contract §14-E) |
| 여행 스토리 | `PARTIAL` | `story-routes` 정적 라우트 존재. 사용자 생성 스토리 미구현 |

### 3-1. Saved · Visited · Cart — 정확한 분해

**기능이 없는 것이 아니라 수명이 짧은 것이다.** 중복 구현하지 않도록 층위를 나눈다.

| 층위 | 상태 | 근거 |
|---|---|---|
| 브라우저 내 저장·방문·Cart 기능 | **`IMPLEMENTED`** | `src/lib/favorites.ts` · `src/lib/visited.ts` · `src/lib/cart.ts` — localStorage 기반으로 동작 |
| 서버 기반 장기 축적 | `PLANNED` | 해당 서버 테이블 0개 |
| 기기 간 복구 | `PLANNED` | 소유권이 기기 식별자 기반 |
| **전체 자산 수명주기** | **`PARTIAL`** | 브라우저를 지우면 사라진다 |

---

## 4. 소유권 · 복구 상태

| 항목 | 상태 | 근거 |
|---|---|---|
| 기기 식별자(`device_id`) 기반 소유권 | `IMPLEMENTED` | `itineraries`·`trip_moments`·`user_spots` 모두 보유. **Constitution §5 기준 과도기 구현** |
| 비공개 전환 (`is_public` 토글) | `IMPLEMENTED` | `itineraries.is_public`·`trip_moments.is_public` |
| Trip Cover 공개 동의 기록 | `IMPLEMENTED` | `cover_consent_at`·`cover_consent_version` |
| **기기 간 복구** | `PLANNED` | 현재 보장되지 않음 (Data Contract §14-G) |
| **복구 구현 방식 / 정식 계정 도입 여부** | `UNKNOWN` | 저장소 내 일반 사용자 인증 코드 0건 (관리자 인증 제외). **방식 미정** |
| 기록 내보내기 | `PLANNED` | 미구현 |
| 기록 삭제 요청 경로 | `PARTIAL` | 소유 기기에서 사진·일정 삭제 API 존재. 계정 단위 일괄 삭제는 미구현 |

**모순 없음 확인** — Constitution §5는 *복구 필요성 = `PRINCIPLE`* / *복구 기능 = `PLANNED`* / *구현 방식 = `UNKNOWN`* 으로 층을 나눈다. 이 표는 그 구분을 그대로 따른다.

---

## 5. 일정·추천 상태

| 항목 | 상태 | 근거 |
|---|---|---|
| 규칙 기반 스케줄러 | `IMPLEMENTED` | `src/lib/scheduler/` |
| 사용자 선택 장소 우선 배치 | `IMPLEMENTED` | cart 항목 최우선 배치 + 배치 실패 시 잔여 gap 재시도 |
| 인기 일정 정렬 | `IMPLEMENTED` | `functions/api/trips/popular.ts` — `view_count + helpful_count×3 + copy_count×5` |
| 복사 신호의 추천 반영 | `IMPLEMENTED` | 위 가중치에서 복사가 최고 가중치(×5) |
| 근처 장소 후보 생성·점수화 | `IMPLEMENTED` | `src/lib/near-me/` |
| **복사 계보(다단계 체인) 활용** | `PLANNED` | `copy_of`는 저장되나 계보 표시·추천 미사용. `helpful-guard-core.ts`가 복사본 소유자 판정에만 사용 |
| **사용자 기록 기반 개인화 추천** | `PLANNED` | 저장·방문이 서버에 축적되지 않아 신호원 없음 (§3-1) |
| 추천 끄기·조정 UI | `PLANNED` | 미구현 |

### 5-1. AI 경로 — 세 가지를 구분한다

**"AI 개인화 계층 PARTIAL"이라는 포괄 표현을 쓰지 않는다.** 실제로는 다음 세 가지가 다르다.

| 구분 | 상태 | 근거 |
|---|---|---|
| **AI 일정 생성 보조 코드** | `IMPLEMENTED` (코드 존재) | `src/lib/scheduler/ai/` — gemini-client · personalizer · prompt-builder · response-parser |
| **운영 배포 경로에서의 live AI 호출** | **비활성** | `functions/api/trip/plan.ts` 주석·구현: *with_ai is ALWAYS forced to false: personalizer and gemini-client are NEVER imported.* 정적 export 빌드에서 Next API 라우트(`/api/scheduler/personalize`)는 배포 산출물에 포함되지 않는다 |
| **사용자 기록 기반 개인화 추천** | `PLANNED` | 위 §5. AI 보조와 별개 개념 |

**추가 안전장치** — `gemini-client`는 `GEMINI_PERSONALIZATION_ENABLED !== "true"`이면 mock으로 떨어진다. 즉 코드 경로와 운영 활성화가 이중으로 분리돼 있다.

---

## 6. 공유·Trip Cover 상태

| 항목 | 상태 | 근거 |
|---|---|---|
| Trip Cover 선택·동의·개인 커버 라벨링 | `IMPLEMENTED` | `src/lib/trip-cover/` · `functions/img/trip-cover/[itineraryId].ts` |
| 개인/관광 커버 판정 일관성 | `IMPLEMENTED` | `functions/api/shared/[id]/cover-kind.ts`가 이미지 프록시와 **동일한 `resolveEffectiveCover`** 사용 — API 판정과 실제 이미지가 어긋나지 않음 |
| 개인 커버 보안 재검증 | `IMPLEMENTED` | 매 요청 동의·일정 일치·기기 일치 재검증. `cover_moment_id`·storage 경로·`device_id` 미노출 |
| 공유 링크 봇/사람 분기 | `IMPLEMENTED` | `functions/shared/[id].ts` |

**현재 커버 구성에 대한 판정**

운영 `trip_moments` 0행이고 `cover_moment_id IS NOT NULL`인 일정도 0건이다. 렌더 경로(`functions/img/trip-cover/[itineraryId].ts`)는 유효한 개인 moment가 있을 때만 개인 사진을 반환하고, 그 외에는 `cover_kind === "asset"` 경로로 도시·테마 asset을 반환한다.

→ **따라서 현재 공유 커버는 사용자 추억 사진 경로로 해결되지 않는다.** 이는 원칙 위반이 아니라 **운영 데이터 공백**이다. Constitution §13의 우선순위 자체는 코드에 구현돼 있다.

---

## 7. 상업 표면 — Constitution §14-1 세 범위별 현재 상태

**기준 코드 snapshot** `verified commit 1024698` · `verified date 2026-07-30`

**이 문서는 코드가 정책을 이미 준수한다고 기록하지 않는다.** 아래는 전부 편차 기록이다.

### 7-1. Trip-Flow Commerce — `KNOWN_DEVIATION`

Constitution §14-1-A 대상 표면에 상업 노출과 상업 문맥 유입이 남아 있다.

| 편차 | 실측 |
|---|---|
| 장소 카드 판매 링크 | `SpotCard` 가 `spot.affiliateUrl` 을 anchor 로 렌더. 운영 `/explore/busan/` 에서 **75개** (JS 렌더 후). 사용자 가시 고지 없음 |
| 장소 객체 commerce 주입 | `ExploreCity` 가 `affiliateUrl`·`affiliateProvider` 를 `commerce` 에 주입 |
| Event·Modal·Timeline 상업 렌더 | `EventCard` 제휴 배지 · `EventDetailModal` 4개 판매 링크 · `TimelineView` `Book via` |
| 일정 장소 항목 예약 링크 | `itinerary/page.tsx` 의 `place.affiliateUrl`·`matched.affiliateUrl` 기반 버튼 |
| `cartHints` affiliate 왕복 | Cart → `cartHints` → plan API 요청에 `affiliate_url`·`affiliate_provider`·`booking_url` 포함 |
| Home 여행계획 전 판매 CTA | `HomeClient` 제휴 anchor. 운영 **2개** 렌더 |
| shared 화면 콘텐츠 제휴 재사용 | 공유 일정 페이지가 도시 랜딩용 준비물 섹션을 그대로 재사용 |
| **Trip-Flow gate 미구현** | 중앙 게이트 없음 |

**스케줄러 입력 자체** — `runScheduler()` 후보 객체에는 상업 필드가 없다(`place_id`·`category`·`coordinate`·`zone_id`·`score`·`stay_minutes_override`). 다만 `affiliate_link_ids` 를 받는 `AffiliateContext` 경로가 엔진 내부에 남아 있고, 그 순서가 `.order("priority")` 결과이므로 **§14 "상업 문맥 자체를 입력받지 않는다" 를 충족하지 못한다.** 참조 테이블 `affiliate_links` 부재(`42P01`)로 현재 **휴면**.

### 7-2. Post-Plan Commerce — `PARTIAL`

| 항목 | 상태 |
|---|---|
| 일정 확정 후 렌더 | 충족 — 일정 렌더 완료 후 별도 배너·스트립 |
| 문맥 사용 | 충족 — 도시·도착시간·여행기간을 읽음 |
| 일정 선택·점수 되먹임 | **확인되지 않음** — 되먹임 경로를 찾지 못했다 |
| 공유 일정 제외 | 부분 충족 — 배너는 `!shareId` 조건 보유 |
| **특정 공급자 URL 하드코딩** | **미충족** |
| **provider-neutral adapter** | **부재** |
| **화면에 보이는 제휴 고지** | **부족** — `rel="sponsored"` 만 있고 가시 문구 없음 |
| **Post-Plan gate 미구현** | 중앙 게이트 없음 |

### 7-3. Editorial Content Affiliate — `PARTIAL`

| 항목 | 상태 |
|---|---|
| 도시 랜딩 준비물 섹션 가시 고지 | **보유** — `Sponsored · gokoreamate partner network · Commission may be earned at no cost to you` |
| 블로그 가시 고지 | **보유** — `Sponsored · Commission may be earned at no cost to you` |
| Survival Guide 가시 고지 | **부족** — `rel="sponsored"` 만 |
| 중앙 설정 · 하드코딩 | **혼재** — 일부는 공급자 설정 경유, 일부는 URL 직접 하드코딩 |
| **명시적 승인 표면 allowlist** | **부재** |
| 동일 컴포넌트의 shared 재사용 | **잘못된 재사용** — 준비물 섹션이 공유 일정에도 렌더된다 (§7-1 참조) |
| **Editorial Content 분류 게이트 미구현** | 중앙 게이트 없음 |

### 7-4. 공통 편차

| 항목 | 상태 |
|---|---|
| 공급자 하드코딩 | **`KNOWN_DEVIATION`** — 전 범위에 걸쳐 특정 공급자명·URL 이 컴포넌트에 고정돼 있다 |
| 사용자 가시 고지 부족 | **`KNOWN_DEVIATION`** — Trip-Flow·Post-Plan 표면 대부분이 `rel` 속성만 보유 |
| 정책별 중앙 게이트 부재 | **`KNOWN_DEVIATION`** — 세 범위 어느 것도 게이트가 구현돼 있지 않다 |
| `affiliate_links` 저장소 부재 | `FACT` — 운영 DB 에 테이블 없음(`42P01`). **이 기록이 즉시 생성 승인을 뜻하지 않는다** |
| 실제 수익 추적 링크 | `FACT` — 실제 추적 ID 가 붙은 링크가 운영에 존재한다. **현재 수익을 0 으로 표현하지 않는다** |

**해소 조건** Constitution §14-1 의 세 범위별 게이트를 구현하고, Trip-Flow 경로에서 상업 문맥과 노출을 제거하며, Post-Plan 은 정상화 조건 10개를 충족한 뒤 활성화하고, Editorial Content 는 명시적 승인 표면 allowlist 를 도입한다. **문서 변경만으로는 어느 것도 해소되지 않는다.**

---

## 8. 보안 상태

| 항목 | 상태 | 근거 |
|---|---|---|
| `city_spots` 공개 역할 쓰기 권한 회수 | `IMPLEMENTED` | Security-0 운영 반영 완료. `anon`·`authenticated`는 SELECT만 |
| 사용자 제보 승인 경로 보호 | `IMPLEMENTED` | `publish_user_spot`은 `SECURITY DEFINER`, 실행 권한은 관리 역할 전용. 승인 시 필수값·좌표 범위·카테고리·중복 검증 |
| 개인 사진 비공개 저장 | `IMPLEMENTED` | private Storage 버킷 + 요청마다 소유권·동의 재검증 |
| **`public` 스키마 default privileges** | **`KNOWN_DEVIATION`** | 아래 §8-1 |
| 나머지 테이블 권한 감사 | `PLANNED` | 별도 보안 작업 |

### 8-1. `KNOWN_DEVIATION` — `public` 스키마 default privileges

**`FACT` (2026-07-29 실측)** `pg_default_acl`에 `public` 스키마 · 객체타입 테이블(`r`) 항목이 존재하며, 생성자 역할 `postgres`와 `supabase_admin` 각각에 대해 `anon`·`authenticated`에게 다음 8종을 부여한다.

```
DELETE · INSERT · MAINTAIN · REFERENCES · SELECT · TRIGGER · TRUNCATE · UPDATE
```

**정확한 적용 범위 — 과장하지 않는다**

- 이 default ACL은 **`postgres` 또는 `supabase_admin`이 `public` 스키마에 생성하는 신규 테이블**에 적용될 수 있다
- **모든 신규 테이블이 무조건 개방된다는 뜻은 아니다.** 다른 역할이 생성하거나 다른 스키마에 만들면 이 항목은 적용되지 않는다
- **이미 존재하는 테이블에는 default privilege 변경이 소급 적용되지 않는다.** 따라서 Security-0로 잠근 `city_spots`의 현재 상태는 이 항목의 영향을 받지 않는다
- migration 033 또는 동등한 default privilege 교정은 **아직 미적용**이다

**`HARD_GATE`**

> **`city_spot_sources`, `city_spot_images`, 또는 다른 신규 `public` 스키마 테이블을 생성하기 전에 migration 033 또는 동등한 default privilege 교정을 완료하고 운영 검증해야 한다.**

**게이트 범위**

- 이 게이트는 **`/place/[id]` 작업을 막지 않는다**
- **신규 테이블 생성 작업만 차단**한다
- **이번 작업에서는 migration 033을 작성하지 않는다**

---

## 9. 공개 사용자 콘텐츠 안전 기능 상태

Constitution §10이 요구하는 항목의 현재 구현 수준이다.

| 항목 | 상태 |
|---|---|
| 공개 철회 (일정·커버) | `IMPLEMENTED` |
| 관리자 검토 후 카탈로그 반영 | `IMPLEMENTED` |
| 관리자 문의 접수 경로 | `IMPLEMENTED` |
| **개인정보 침해 신고 전용 경로** | `PLANNED` |
| **저작권·초상권 신고 경로** | `PLANNED` |
| **스팸·중복·위험 위치 검토 절차** | `PLANNED` |
| **신고 기반 숨김·삭제 운영 흐름** | `PLANNED` |
| 출처·작성 주체 표시 | `PARTIAL` — 공유 화면에 관광 사진 출처 표기는 있음. 사용자 콘텐츠 주체 표시는 미정 |

**공개 발견 지도(Constitution §7 3단계)를 열기 전에 위 `PLANNED` 항목이 필요하다.**

---

## 10. 현재 `UNKNOWN`

| 항목 | 비고 |
|---|---|
| 복구 구현 방식 · 정식 계정 도입 여부 | 필요성은 `PRINCIPLE`, 기능은 `PLANNED`, **방식만** `UNKNOWN` |
| eSIM 외 제휴 공급자 | 분야별 비교 후 결정 |
| 공개 발견 지도 노출 시점·검토 기준 | §9 선행 필요 |
| 추천 알고리즘 구현 형태 | |
| `docs/design/` 문서들의 공식 지위 | 현재 untracked |
| 저장·방문의 서버 축적 스키마 | 방향은 필요하나 설계 미착수 |

**이 항목들을 확정된 것처럼 인용하지 않는다.**

---

## 11. 참조

- `gokoreamate-product-constitution-v1.md` — **Product Constitution v1.0 (`ACTIVE`, 제품 최상위 SSOT)**
- `../architecture/gokoreamate-data-contract-v1.md` — Data Contract v1.2 (`ACTIVE`, 데이터·DB 최상위 SSOT)

---

**이 문서는 권한이 없는 검증 스냅샷이다. 실제 저장소·DB와 다르면 저장소·DB가 옳다.**
