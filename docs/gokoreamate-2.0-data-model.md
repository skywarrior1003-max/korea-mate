# GoKoreaMate 2.0 — 데이터 모델 설계 문서

> 작성일: 2026-06-17  
> 목적: 운영 코드 수정 금지. GoKoreaMate 2.0 데이터 구조 기준 문서.

---

## 핵심 원칙

> **GoKoreaMate의 핵심 자산은 AI가 아니라 검증된 여행 데이터다.**
>
> AI는 검증된 `places`, `events`, `route_templates`, `trip_moments`를 기반으로 일정을 정리하고 설명하는 역할을 해야 한다.

---

## 1. 테이블 후보 목록

| 테이블명 | 역할 | 주요 필드 예시 | 우선순위 | 주의사항 |
|----------|------|---------------|----------|----------|
| `places` | 장소 단일 원본 | place_id, name, category, lat, lng, coordinate_quality, is_ai_usable, admin_status | ★★★★★ | admin_status=approved만 공개. 이름만으로 연결 금지 |
| `place_aliases` | 장소 이름 별칭 | alias_id, place_id, alias, lang | ★★★ | 검색 매칭용. 원본은 places만 |
| `place_sources` | 장소 출처 기록 | source_id, place_id, source_type, source_url, fetched_at | ★★★ | 데이터 출처 추적 및 저작권 관리 |
| `place_media` | 장소 미디어 | media_id, place_id, url, media_type, license_id, is_approved | ★★★★ | 라이선스 확인 전 사용 금지 |
| `media_licenses` | 미디어 라이선스 | license_id, license_type, source, allowed_commercial, conditions | ★★★★ | 상업용 여부 반드시 명시 |
| `place_links` | 장소 외부 링크 | link_id, place_id, link_type, url | ★★★ | 예약/공식 링크 연동 |
| `place_hours` | 영업시간 | hours_id, place_id, day_of_week, open_time, close_time, is_closed | ★★★ | 요일별 관리, 예외일 별도 처리 |
| `events` | 행사 정보 | event_id, title, start_date, end_date, start_time, end_time, display_until, fixed_time_event, source, official_url, is_ai_usable | ★★★★★ | display_until 기준 자동 숨김 |
| `event_sources` | 행사 출처 | source_id, event_id, source_type, source_url | ★★★ | 이벤트 데이터 출처 추적 |
| `route_templates` | 테마 루트 원본 | route_id, title, theme, city, duration_days, is_published | ★★★★ | AI 일정 생성의 뼈대 |
| `route_template_items` | 루트 구성 장소 | item_id, route_id, place_id, day, order, note | ★★★★ | place_id 기준으로만 연결 |
| `trip_sessions` | 사용자 여행 세션 | trip_id, user_id (nullable), city, start_date, end_date, arrival_time, departure_time, created_at | ★★★★★ | 비로그인 세션도 지원 |
| `trip_items` | 일정 구성 장소 | item_id, trip_id, place_id, event_id, day, order, added_by | ★★★★ | place_id / event_id 기준 |
| `trip_moments` | 여행 추억 기록 | moment_id, trip_id, place_id, custom_spot_id, title, comment, photo_url, lat, lng, gps_accuracy_m, geo_source, address_label, map_note, visibility, share_location_level, created_at, visit_time, include_in_share_card | ★★★★★ | GPS는 힌트 용도. 기본 private |
| `custom_spots` | 사용자 직접 추가 장소 | spot_id, trip_id, name, lat, lng, note, created_at | ★★★ | places와 분리. AI 사용 금지 |
| `likes` | 장소/행사 좋아요 | like_id, user_id, place_id, event_id, created_at | ★★★★ | AI Scheduler 입력 신호로 활용 |
| `candidate_pool` | AI 일정 후보 장소 | pool_id, trip_id, place_id, score, reason | ★★★ | AI가 직접 장소 생성 금지. 검증된 places만 |
| `affiliate_links` | 제휴 링크 | link_id, category, provider, url, commission_type, is_active | ★★★★ | Korea Ready 수익화 핵심 |
| `share_cards` | 공유 카드 정보 | card_id, trip_id, title, city, card_data, visibility, created_at | ★★★ | Trip Story Card 데이터 |
| `place_reports` | 장소 정보 오류 신고 | report_id, place_id, reporter, issue_type, note, status | ★★ | 데이터 품질 유지 |
| `contact_inquiries` | 문의 및 파트너 제안 | inquiry_id, name, email, type, message, created_at | ★★ | Contact / Partner 메뉴 연동 |

---

## 2. 핵심 데이터 정책

### 2-1. places 원칙

| 원칙 | 내용 |
|------|------|
| 단일 원본 | 장소 정보의 단일 원본은 Supabase `places` 테이블 |
| 연결 기준 | Like, Add, AI, Near Me, 지도, 일정은 모두 `place_id` 기준으로 연결 |
| 이름 연결 금지 | 이름만으로 장소 연결 절대 금지 (동명 장소 충돌 방지) |
| 좌표 품질 | `coordinate_quality` 필드로 GPS 신뢰도 관리 |
| AI 사용 가능 여부 | `is_ai_usable` 필드로 AI Scheduler 사용 가능 장소 제어 |
| 공개 기준 | `admin_status = approved`인 장소만 서비스에 공개 |
| 사용자 장소 분리 | 사용자가 추가한 장소는 `custom_spots`로 완전 분리 |

### 2-2. Events 원칙

Events는 단순 콘텐츠가 아니라 **날짜 기반 일정 데이터**입니다.

| 필드 | 역할 |
|------|------|
| `start_date` | 행사 시작일 |
| `end_date` | 행사 종료일 |
| `start_time` | 행사 시작 시각 (nullable) |
| `end_time` | 행사 종료 시각 (nullable) |
| `display_until` | 이 날짜 이후 기본 목록에서 자동 숨김 |
| `fixed_time_event` | true이면 AI Scheduler에서 시간 고정 |
| `source` | 데이터 출처 |
| `official_url` | 공식 행사 페이지 |
| `is_ai_usable` | AI 일정 추천 포함 여부 |

### 2-3. Trip Moments 원칙

Trip Moments는 사용자의 **여행기 원본 데이터**입니다.

| 필드 | 설명 |
|------|------|
| `moment_id` | 추억 고유 ID |
| `trip_id` | 소속 여행 세션 |
| `place_id` | 연결된 장소 (nullable) |
| `custom_spot_id` | 사용자 직접 추가 장소 (nullable) |
| `title` | 추억 제목 |
| `comment` | 자유 텍스트 코멘트 |
| `photo_url` | 사진 URL (EXIF 위치 제거 후 저장) |
| `lat` | GPS 위도 |
| `lng` | GPS 경도 |
| `gps_accuracy_m` | GPS 정확도 (미터) |
| `geo_source` | 위치 획득 방식 (gps / manual / place) |
| `address_label` | 사람이 읽을 수 있는 주소 레이블 |
| `map_note` | 지도 핀 관련 메모 |
| `visibility` | 공개 범위 (private / friends / public) |
| `share_location_level` | 공유 시 위치 정밀도 (hidden / neighborhood / exact) |
| `created_at` | 생성 시각 |
| `visit_time` | 실제 방문 시각 |
| `include_in_share_card` | Trip Story Card 포함 여부 |

---

## 3. Media / License 원칙

공공 홈페이지 또는 관광 홈페이지에 사진이 있다고 해서 **무조건 상업용으로 사용 가능한 것이 아닙니다.**

| 사진 출처 | 사용 가능 여부 |
|-----------|---------------|
| 직접 촬영 사진 | ✅ 사용 가능 |
| 제휴 업체 제공 사진 | ✅ 계약 조건 내 사용 가능 |
| 공공누리 / 오픈라이선스 명확한 사진 | ✅ 조건 준수 시 사용 가능 |
| 관광 API에서 재사용 허용된 사진 | ✅ 조건 준수 시 사용 가능 |
| 공식 홈페이지에만 있는 사진 | ⚠️ 라이선스 확인 전 보류 |
| 블로그 / 인스타 / 구글 / 네이버 사진 | ❌ 사용 금지 |
| 미쉐린 / 리뷰 플랫폼 사진 | ❌ 계약 없으면 사용 금지 |

모든 미디어는 `media_licenses` 테이블에 라이선스 유형과 상업용 허용 여부를 반드시 기록합니다.

---

*이 문서는 코드 변경 없이 데이터 구조 기준만 정의합니다. 실제 migration은 roadmap 순서에 따릅니다.*
