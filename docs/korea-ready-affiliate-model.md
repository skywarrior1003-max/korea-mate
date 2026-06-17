# GoKoreaMate — Korea Ready 제휴 링크 데이터 모델 설계 문서

> 브랜드: GoKoreaMate / gokoreamate.com  
> 작성일: 2026-06-17  
> Task: TASK-007 — Korea Ready 제휴 링크 데이터 모델 초안 추가  
> Migration: `supabase/migrations/007_affiliate_links_schema.sql` (Draft — 운영 적용 전 승인 필요)

---

## 1. 왜 이 테이블이 존재하는가

> **Korea Ready는 광고 배너 농장이 아니라 도움말처럼 보여야 한다.**

GoKoreaMate의 Korea Ready 섹션은 외국인 여행자가 한국에서 겪는 실질적인 준비 과제를 해결해줍니다.  
eSIM, KTX 패스, 액티비티 예약, 숙박 — 이것들은 여행자에게 진짜 필요한 정보입니다.  
제휴 링크는 그 "도움말"의 연장선에서 수익을 발생시키는 구조입니다.

**철학:** 사용자가 "광고를 클릭했다"가 아니라 "도움이 돼서 눌렀다"는 경험을 제공해야 한다.

---

## 2. affiliate_links 테이블 핵심 컬럼

| 컬럼 | 타입 | 역할 |
|------|------|------|
| `affiliate_link_id` | TEXT UNIQUE | 사람이 읽기 쉬운 고유 식별자 (변경 금지) |
| `provider` | TEXT | 제공 업체 (airalo / klook / korail 등) |
| `category` | TEXT | 수익화 우선순위 분류 |
| `title` | JSONB | 다국어 제목 (ko/en/ja/zh 확장 가능) |
| `description` | JSONB | 다국어 설명 |
| `destination_url` | TEXT | 최종 목적지 URL (제휴 링크 포함) |
| `tracking_code` | TEXT NULL | 공개 안전한 UTM 파라미터만 — 시크릿 절대 금지 |
| `city` | TEXT NULL | 특정 도시 한정 노출 (NULL = 전국 공통) |
| `placement_context` | JSONB DEFAULT '[]' | 노출 위치 목록 (배열) |
| `priority` | INTEGER DEFAULT 50 | 낮을수록 먼저 표시 (1 = 최우선) |
| `is_active` | BOOLEAN DEFAULT true | 활성화 여부 |
| `starts_at` / `ends_at` | TIMESTAMPTZ NULL | 프로모션 기간 (NULL = 상시) |
| `admin_status` | TEXT DEFAULT 'pending' | approved만 앱에 노출 |

---

## 3. category — 수익화 우선순위

| category | 우선순위 | 설명 | priority 권장 |
|----------|---------|------|--------------|
| `esim` | ★★★★★ (1순위) | 신규 방문자 최우선 노출 | 1~5 |
| `activity` | ★★★★☆ (2순위) | 액티비티·투어·체험 | 10~20 |
| `stay` | ★★★☆☆ (3순위) | 숙박 | 20~30 |
| `transport` | ★★☆☆☆ (4순위) | 교통·공항픽업·KTX | 30~40 |
| `payment-tip` | 정보형 | 결제·전화번호 인증 팁 | 40~60 |
| `map-tip` | 정보형 | 지도 앱 사용 팁 | 40~60 |

**이유:** eSIM은 비행기에서 내리는 순간부터 필요합니다. 가장 먼저 노출되어야 전환율이 높습니다.

---

## 4. title / description — jsonb 다국어 구조 (TASK-004 동일 패턴)

```json
{
  "ko": "한국 eSIM — 도착 즉시 사용",
  "en": "Korea eSIM — Ready on Arrival",
  "ja": "韓国eSIM — 到着後すぐ使える",
  "zh": "韩国eSIM — 落地即用"
}
```

**왜 jsonb인가:** affiliate_links는 `events`와 동일한 서비스 공식 콘텐츠입니다.  
외국인을 대상으로 ko/en/ja/zh 다국어 동시 지원이 필요하므로 TASK-004와 동일한 jsonb 다국어 주머니 구조를 채택합니다.

표시 우선순위: 요청 언어 → `en` → `ko` → 첫 번째 키

---

## 5. placement_context — 유연한 다중 위치 노출

같은 링크를 여러 화면에서 동시에 노출할 수 있도록 jsonb 배열로 설계했습니다.

| 위치 값 | 화면 |
|---------|------|
| `korea-ready-page` | Korea Ready 전용 페이지 |
| `itinerary-start` | AI 일정 생성 시작 화면 |
| `itinerary-card` | 일정 안 맥락 카드 (숙박·투어) |
| `near-airport` | 공항·항만 근처 Near Me 화면 |
| `near-station` | 기차역·버스터미널 근처 Near Me 화면 |
| `area-card` | 특정 지역 카드 내 (숙박·투어) |
| `home-hero` | 홈 화면 Korea Ready 섹션 |

**eSIM 예시:**
```json
["korea-ready-page", "itinerary-start", "home-hero"]
```

**부산 일일 투어 예시:**
```json
["korea-ready-page", "itinerary-card", "area-card"]
```

**앱 쿼리 (GIN 인덱스 사용):**
```sql
WHERE placement_context @> '["korea-ready-page"]'
  AND admin_status = 'approved'
  AND is_active = true
ORDER BY priority ASC;
```

---

## 6. 보안 설계 — 시크릿 절대 분리

| 저장 위치 | 저장 가능 항목 | 저장 금지 항목 |
|----------|--------------|-------------|
| `affiliate_links.tracking_code` | UTM 파라미터, 공개 레퍼러 코드 | API 시크릿, OAuth 토큰, 비밀 키 |
| `.env.local` / Cloudflare Secret | API 키, OAuth 토큰 | (DB에 절대 저장 금지) |

> **원칙:** DB에는 공개 안전한 파라미터만. 제휴 API 인증은 서버 환경변수에서만 관리.

---

## 7. TASK-004 연동 계획 — events.affiliate_link_id FK 활성화

현재 `events` 테이블에는 `affiliate_link_id UUID` 컬럼이 FK 없이 존재합니다.  
TASK-007 migration 운영 반영 후 별도 ALTER로 연결할 예정입니다.

```sql
-- 별도 migration (사장님 승인 후)
ALTER TABLE events
  ADD CONSTRAINT fk_events_affiliate_link
  FOREIGN KEY (affiliate_link_id) REFERENCES affiliate_links(id) ON DELETE SET NULL;
```

**활성화 전 확인사항:**
1. `007_affiliate_links_schema.sql` 운영 DB 적용 완료
2. `affiliate_links` 테이블에 최소 1개 이상 데이터 삽입
3. 사장님 최종 승인

---

## 8. RLS 정책 계획 (DRAFT)

```sql
-- 공개 SELECT: approved + active + 기간 내
-- INSERT/UPDATE/DELETE: service role만 (관리자 전용)

ALTER TABLE affiliate_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "affiliate_links_public_read" ON affiliate_links
  FOR SELECT USING (
    admin_status = 'approved'
    AND is_active = true
    AND (starts_at IS NULL OR starts_at <= now())
    AND (ends_at IS NULL OR ends_at >= now())
  );
```

> ⚠ RLS는 `007_affiliate_links_schema.sql` 주석에만 포함됩니다. 실제 적용 전 별도 승인 필요.

---

## 9. 데이터 입력 워크플로우

```
[1단계] 제휴 업체 계약 체결
         │
         ▼
[2단계] affiliate_links 등록 (admin_status = 'pending')
         - affiliate_link_id 작명: {provider}-{category}-{region}
         - title/description jsonb 작성 (ko/en 필수, ja/zh 선택)
         - placement_context 배열 설정
         - tracking_code: UTM 파라미터만 (시크릿 금지)
         │
         ▼
[3단계] 관리자 검토
         - destination_url 유효성 확인
         - tracking_code 공개 안전 여부 확인
         - placement_context 배치 적절성 확인
         │
         ▼
[4단계] admin_status = 'approved' 설정
         │
         ▼
[5단계] 앱 화면 노출 (placement_context 기준)
```

---

## 10. 향후 연동 계획

| 기능 | 연동 | 예정 Task |
|------|------|----------|
| Events 행사 제휴 링크 | `events.affiliate_link_id → affiliate_links.id` (FK 활성화) | TASK-007 이후 별도 승인 |
| AI Scheduler 수익화 | 일정 내 맥락 삽입 (`itinerary-card` placement) | TASK-014 |
| Korea Ready 전용 페이지 | `korea-ready-page` placement 기반 렌더링 | TASK-009/010 |
| Near Me 연동 | `near-airport`, `near-station` placement | TASK-010 |

---

## 11. 절대 금지사항

```
- 제휴 API 시크릿·OAuth 토큰을 tracking_code 또는 DB에 저장 금지
- commercial_use_allowed가 없는 이미지를 제휴 카드에 사용 금지 (TASK-006 원칙 준수)
- admin_status = 'pending' 상태의 링크를 앱에 노출 금지
- affiliate_link_id 한 번 결정 후 변경 금지 (events가 이 값에 의존)
- 직접 PG 결제 로직을 이 테이블에 구현 금지 (별도 Task에서 논의)
- 이 Migration을 Supabase 운영 DB에 직접 실행 금지 (사장님 승인 후 진행)
- gokoreamate 브랜딩이 빠진 문서·코드 작성 금지
```

---

*이 문서는 Draft 설계 기준입니다. 실제 Migration 적용 및 제휴 계약 관련 데이터 입력은 사장님 최종 승인 후 진행합니다.*  
*GoKoreaMate / gokoreamate.com*
