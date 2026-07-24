# GoKoreaMate — 행사 정보 공식 확인 안내 (확정)

## 사용자 안내 문구

### 표준 문구 (행사 카드·일정 결과 필수)
> Event details may change. Please check the official event website before visiting or purchasing tickets.

### 카드 요약 문구 (짧은 버전)
> Schedule may change. Check the official website before visiting.

### 구매·예약 링크 주변 문구
> Ticket availability, prices, and event details are determined by the organizer or booking partner.

---

## 행사 링크 역할 구분

| 링크 종류 | 필드 | 허용 provider |
|---|---|---|
| 공식 행사 정보 | `official_url` | API 제공 URL만 |
| 티켓·액티비티 예약 | `affiliate_url` | `klook`, `booking` |
| 숙박 연결 | 별도 숙박 필드 | `booking` |

**공식 URL이 없으면 null 유지. 검색 URL·임의 URL 생성 금지.**

---

## 데이터 상태값 정의

| 필드 | 값 | 의미 |
|---|---|---|
| `official_check_required` | `true` | 모든 행사 기본값 — 방문 전 공식 확인 필요 |
| `possible_stale_event` | `true` | event_period_raw 최대 연도 < 현재 연도 — 과거 행사 가능성 |
| `date_review_required` | `true` | possible_stale_event와 동일 조건 — 일정 추천 보류 후보 |
| `schedule_change_detected` | `true` | 이전 스냅샷 대비 venue 또는 event_period_raw 변경됨 |
| `official_url_fallback_language` | `'ko'` | 자체 언어 URL 없어 KO URL을 대체 사용 |

---

## 자동화 허용 / 금지

### 자동화 허용
- `official_check_required=true` 일괄 설정
- `possible_stale_event=true` (과거 연도 감지)
- `date_review_required=true` (same as above)
- `schedule_change_detected=true` (diff 기반)

### 자동 확정 절대 금지
GoKoreaMate가 단독으로 확정하지 않는 상태:
- 행사 취소 확정
- 행사 연기 확정
- 티켓 매진 확정
- 행사 종료 확정

이 정보는 공식 행사 사이트 또는 주최자만 확정할 수 있습니다.

---

## 수익화 흐름에서의 역할

```
행사 발견 (GoKoreaMate 추천)
  → official_check_required=true → 사용자가 공식 사이트 확인
  → 일정 추가 (possible_stale_event=false인 행사 우선)
  → 주변 맛집·관광지 구성
  → 숙박 예약 (affiliate: booking)
  → 액티비티·교통 (affiliate: klook)
  → 제휴 커미션
```

GoKoreaMate는 "행사 정보를 가장 자세히 제공하는 사이트"가 아니라
**행사를 포함한 여행 전체를 가장 쉽게 계획하고 예약으로 연결하는 서비스**입니다.
