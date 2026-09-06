# 운영시간 raw fallback 마감 v1 (2026-09-06)

> TASK-GOKOREAMATE-OPENING-HOURS-RAW-FALLBACK-CLOSEOUT-V1.
> Owner 규칙: structured 우선 · 구조화 불가 원문은 raw fallback 보존/표시 · AI 요약/번역/재수집 0 ·
> 기존 structured 덮어쓰기 0.

## 1. Reconciliation (baseline 1,729 → 실측)

- baseline 1,729 는 five-city-core-**v1** 수치. **authoritative = v3**: opening_hours deferred **1,685**
  (seoul 1,233 · busan 394 · gyeongju 58 — v1→v2 에서 gyeongju 102→58 은 Final 정정 계보의 정상 축소).
- 조인(exact only): `city_spots.external_id = cid | '<city>:'+cid` + `city_spot_sources.source_key = cid`
  → matched **1,579** · cid↔spot 충돌 0 · dup 0 · 타 도시 0.
- **미해결 106**(busan 101 · gyeongju 5): 해당 canonical 이 Production city_spots 에 존재하지 않음
  (Final→Production 반입 대상이 아니었던 행) — 변경 없이 보고만.

## 2. Production 반영 (2026-09-06, 1회 실행·완료 — 재실행 금지)

`data/main-intake/five-city-reflection-recovery-v1/opening-hours-raw-fallback-{precheck,apply,readback}-v1.sql`
apply sha256 `09e65e571714f5bc4884f75f31a8e28d0b799716eb1b300dd952a67a980ce886`

- 주입: opening_hours IS NULL 인 매칭 행에만 `{"raw": 원문}` (trim/개행 통일 외 원문 그대로).
- READ-BACK 실측: **raw_set 1,572**(seoul 1,233 · busan 286 · gyeongju 53) ·
  **structured_preserved 595(변화 0)** · structured 기존재 스킵 7 · mixed 0.
- city_spots CHECK 제약 introspection: opening_hours 관련 제약 0(사전 확인).

## 3. 코드 (이 커밋)

- `src/lib/opening-hours.ts` (신규): `structuredOpeningHours`/`rawOpeningHours` — 의존성 없는 정규화.
- 어댑터 경계 정규화: `city-spots.ts` 두 어댑터 + `place-detail-core.toItineraryEvent` 가 구조화 값일
  때만 `{open, close}` 를 전달 → **raw 는 플래너/카트/고정일정 계약에 절대 유입되지 않음**(표시 전용).
- `PlaceDetailClient`: structured 우선 → raw 원문(fallback, 4언어 공통 원문 그대로) → 기존 안내 문구.
- 테스트: `src/lib/opening-hours.test.ts` 6/6 + place-detail-core 107/107 + tsc 0.
