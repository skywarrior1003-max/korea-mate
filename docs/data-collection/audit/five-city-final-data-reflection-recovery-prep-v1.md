# 5도시 반영 복구 준비 v1 — Jeju L10N · Gyeongju Images (2026-09-05)

> TASK-GOKOREAMATE-JEJU-L10N-GYEONGJU-IMAGE-REFLECTION-RECOVERY-PREP-V1.
> 상위: `five-city-final-data-reflection-audit-v1.md`(감사) · closeout SSOT P0-1.
> **이 단계는 준비만** — Production 실행은 별도 Owner 승인 PROD-SQL 태스크
> (TASK-GOKOREAMATE-JEJU-L10N-GYEONGJU-IMAGE-PRODUCTION-REFLECTION-APPLY-V1)에서 1회.

## 1. 적용 아티팩트 (immutable · dry-run 검증 완료)

경로: `data/main-intake/five-city-reflection-recovery-v1/`

| 파일 | sha256 | 역할 |
|---|---|---|
| jeju-l10n-apply-v1.sql | `f5a7e8d5e315bd1239c0568be360a7c9d5df242ca918643028194b4cffa123f3` | 제주 1,483곳 name_l10n/desc_l10n 반영(기존 키 우선 병합·idempotent) |
| jeju-l10n-precheck-v1.sql / -readback-v1.sql | (READ-ONLY) | 적용 전/후 검증 |
| gyeongju-owner-two-images-apply-v1.sql | `dce913d664b21ef94053753b73ab6f283c8ddf51b6dba3002504707002d26aaa` | 동궁과 월지(439)·자동차박물관(506) — **SUPERSEDED — DO NOT APPLY**(2026-09-05, `gyeongju-official-page-images-*-v2` 가 완전 대체) |
| gyeongju-…-precheck/-readback-v1.sql | (READ-ONLY) | 〃 |

## 2. Jeju multilingual — 근거와 수치

- 원천(불변 blob): `origin/data/jeju-multilingual-v1 : jeju-multilingual-enrichment-v1.jsonl` (git blob `4cd273ab…`), SUCCESS 행만 사용. **신규 번역 생성 0** — title/short_description 그대로(HTML 태그 제거·공백 정규화·zh-CN→zh — 서울/전주 Production 반영과 동일 형태).
- 조인: enrichment `source_cid` = `city_spot_sources.source_key`(source_type='visitjeju') — identity 재매칭 0.
- 실측(2026-09-05 Production READ-ONLY):
  - 대상 1,483곳 / **matched 1,483 · unmatched 0 · duplicate 0 · 전부 published**
  - 언어별: en 1,482 · ja 1,483 · zh 1,482
  - 현재 Production: en/ja/zh/desc_en 전부 **0** (precheck 실측) — 충돌 row 0
  - **dry-run(적용 SQL 의 VALUES+조인을 SELECT 로 실서버 실행): joinable 1,483 · 전부 published · already_en 0** — 인용/이스케이프까지 서버 파서 검증 완료
- 병합 규칙: `(ko=name || 아티팩트값) || 기존_l10n` — **기존 키가 항상 승리**(덮어쓰기 0), 재실행 idempotent. ko 키는 서울 계약과 동일하게 name 으로 채움.
- 예상 결과(read-back 기대): en≥1,482 · ja≥1,483 · zh≥1,482 · ko≥1,483.

## 3. Gyeongju images — 감사 결론의 정밀화 (중요)

감사 v1 은 "import 아티팩트 생성 단계 탈락(B)"으로 분류했으나, 이번 정밀 추적 결과:

- `gyeongju-canonical-places-v1.jsonl` 의 VG_OFFICIAL_PUBLIC 133행은 **image_url 자체가 None** — 즉 Final canonical 레코드에 URL 미수록.
- `gyeongju-aux-data-gap-queue-v1.jsonl` 이 이를 공식 기록: **IMAGE_MISSING 정확히 133건(GJ01 전량)**, `do_not_guess: true`, 지정 원천 = **"경주시 GJ03·GJ04·GJ05 이미지 API (이용허락범위 제한 없음)"**.
- 따라서 133 전수의 성격은 "반영 누락(B)"이 아니라 **"Final 파이프라인이 지정해 둔 공식 이미지 API 수집 단계가 미실행된 대기 상태"**다. import·Production 은 Final 을 충실 반영했다.
- 단, 공식 자료실 이미지 URL 의 **수집본은 존재**한다: `gyeongju-official-image-provenance-v2.jsonl`(git blob `799efb73…`, 1,814행, gyeongju.go.kr·alt_text 포함). 이 아티팩트에는 후보ID 키가 없어 **133 전수를 기존 키만으로 연결할 수 없다**(이름/alt 기반 전수 매칭은 do_not_guess·재매칭 금지 원칙과 충돌).

### 이번 prep 의 경주 산출물 범위

- **Owner 필수 2건만** 명시 지정으로 준비(이름 재매칭이 아니라 Owner 지시에 따른 개별 지정):
  - **동궁과 월지(439·source 15·GJ01-0017)** — provenance 에 야경 원본 **9종 실재**. 제안 primary = `moonCourse13.jpg`(alt "동궁과 월지 야경"). 대안(전부 공식 야경): course01_img5-1/5-3 · moonCourse14 · bustago1-2 · unescoCourse19 · bustago2-20/21 · pick2_img2 · pick7_img18 — **PROD 게이트에서 Owner 최종 확정**(승인 필수 단계 존재).
  - **경주세계자동차박물관(506·source 82·GJ01-0093)** — 제안 primary = `pick7_img24.jpg`(alt "경주세계자동차박물관"). 참고: bomun2Course8/9 는 alt 에 "(업체제공)" 표기 — 제외.
- 권리 필드: Final 판정 그대로 `VG_OFFICIAL_PUBLIC` + rights_note(공공저작물·Owner 지정 명시), attribution_required=true(공공누리 출처표기 관례), as_of=2026-08-08.
- precheck 실측(2026-09-05): 두 행 모두 published·image_url NULL·relation 0·source 15/82 일치 ✔.
- dry-run 예상: relations added 2 · primary added 2 · image_url populated 2 · 기존 행 변경 0 · duplicate 방지(NOT EXISTS same url).

### 잔여 131건

기존 키로 연결 가능한 URL 아티팩트가 없어 이번 prep 산출물에 포함하지 않음.
정도(正道) = gap queue 가 지정한 **경주시 GJ03·GJ04·GJ05 이미지 API 수집 실행**(후보ID 키 확보) 후 표준 import — 별도 태스크
(예: TASK-GOKOREAMATE-GYEONGJU-GJ0345-IMAGE-API-COLLECTION-AND-IMPORT-V1, Owner 결정 필요 — "신규 웹 검색"이 아니라 Final 이 지정해 둔 공식 수집 단계의 실행이다).

## 4. Opening hours — Owner 결정 기록 (2026-09-05)

**Owner 결정**: 구조화 가능한 운영시간은 기존 structured hours 사용 · 구조화가 어렵지만 Final 에 원문이 존재하면 **원문 운영시간을 fallback 으로 보존·표시**한다. 정보를 버리거나 숨기지 않는다.

조사 결과:
- **원문 위치(실증)**: `five-city-core-deferred-fields-v1.jsonl` field=opening_hours **1,729행**(busan 394 · gyeongju 102 · seoul 1,233), value 에 원문 그대로 보존(예: "브라운핸즈백제 10:00 - 21:30 (라스트 오더 21:20) …"). 사유 `RAW_VALUE_DEFER: 구조화 불가`.
- **현재 계약**: `city_spots.opening_hours` = jsonb `{"open","close"}` 단일 구간 · runtime 타입 `{open,close}` 고정 · PlaceDetail 은 `open – close` 만 렌더 → **원문 fallback 을 담을 자리가 전 계층에 없음**.
- **최소 구현 범위 제안(별도 태스크 — 이번에 구현하지 않음)**:
  1) jsonb 확장: 선택 키 `"raw"` 허용(`{"raw":"원문"}` 또는 open/close 와 병존) — **스키마 마이그레이션 불필요**
  2) runtime 타입 open/close optional + `raw?: string` (city-spots.ts 2개 매퍼)
  3) PlaceDetail: 구조화값 우선, 없으면 raw 원문 표시(4언어 라벨은 기존 hours 라벨 재사용, 원문은 번역하지 않음)
  4) 반영 SQL: deferred 1,729건을 `opening_hours IS NULL` 행에만 `{"raw": …}` 주입(기존 structured 미덮어씀)
  - 제안 태스크명: TASK-GOKOREAMATE-OPENING-HOURS-RAW-FALLBACK-V1

## 5. PROD-SQL 실행 패키지 구성 (다음 태스크용)

독립 apply 단위 2개(도메인 분리·실패 격리), 한 태스크 내 순차 실행 허용:
1. `jeju-l10n-precheck` → `jeju-l10n-apply`(sha 대조) → `jeju-l10n-readback`
2. `gyeongju-…-precheck` → (Owner 야경 최종 확정) → `gyeongju-…-apply`(sha 대조) → `…-readback`

원칙: sha256 일치 필수 · 각 apply 1회 · 오류 시 즉시 중단·재시도 0 · unrelated row 영향 0(readback 의 도시 총계로 확인).
