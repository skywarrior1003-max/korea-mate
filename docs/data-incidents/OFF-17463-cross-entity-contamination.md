# INCIDENT — OFF-17463 cross-entity contamination

- **Incident ID**: DATA-INC-2026-09-24-OFF-17463
- **발견일**: 2026-09-24 (Production 커뮤니티 릴리스 QA 중 화면 관찰 → 후속 정체성 감사로 확정)
- **발견 경로**: `/place/776` 카드에 음식점과 무관한 침대 사진 → 이미지 NULL 긴급 처리 → 주소가 인접 게스트하우스 값임이 추가 확인 → Main 긴급 교정(JEONJU-776-PLACE-IDENTITY-CORRECTION-V1, master `e66a8c1`)
- **사용자 증상**: 전주 검색·상세에서 음식점 `메르밀진미집 본점` 카드에 숙박업소 침대 사진과 게스트하우스 주소(`향교길 11`)가 노출

## 영향

| 구분 | 값 |
|---|---|
| 장소 | Main `city_spots.id=776` · Data Track `OFF-17463` |
| 오염 필드 | address(향교길 11) · image(2570942 침대) · phone 후보(063-222-1000) · kto_* 결합 6필드 |
| 잘못된 숙소 entity | **다나하루 게스트하우스** — 향교길 11 · KTO contentid **2571938**(숙박) · 좌표 35.8117868/127.1502589 |
| 실제 음식점 entity | 메르밀진미집 본점 — **전주천동로 94**(지번 전동 237) · 전화 **063-288-4020** · 좌표 35.8111035/127.1504062(원값이 정확했음 — 트리플·식신 ±4m) · 원천 tour.jeonju.go.kr dataSid=17463 |

## Root cause

`jeonju-kto-crossmatch-v1` 이 OFFICIAL 게시물 17463(맛집 소개 리스트, title=메르밀진미집 본점)과
KTO 2571938(다나하루, 숙박)을 **좌표 근접(77.6m) 단 하나의 근거**(`_match_evidence:
"COORD_VERY_CLOSE"`, score 8)로 `AMBIGUOUS` 매칭했고, 후속 catalog 가 그 행의
`kto_addr/kto_image/kto_lat/kto_lng` 를 그대로 실은 채 `final_status: ACTIVE_SERVICE` ·
`elig_* 전부 true` 로 승격했다. Main 반입은 address 를 `kto_addr` 에서, image 를
`kto_image` 에서 채택 — **서로 다른 entity 의 best field 조합**으로 존재하지 않는 혼합
장소가 생성됐다.

## Contributing factors

1. **identity-resolution 판정 미반영** — `jeonju-identity-resolution-v1` 은 같은 쌍을 이미
   `classification: DISTINCT_ENTITY`, `reason: category_incompatible(off=미식여행, kto=숙박)`
   로 정확히 분리 판정했으나, catalog 의 kto_* 결합·match_type 에 반영되지 않았다.
2. `AMBIGUOUS` 가 게이트가 아니라 라벨이었다(`identity_review:false` 인 채 ACTIVE — 전주 catalog 에 동형 54건).
3. `display_eligible:false`(rights KTO_TYPE_UNKNOWN) 이미지가 반입 단계에서 차단되지 않았다.
4. OFFICIAL 게시물 메타의 `phone`(063-222-1000)은 **게시물 운영기관(전주시청) 대표번호**인데 장소 전화 후보로 흘러갔다(catalog 내 동형 94행).
5. 게시물 meta address(노송광장로 10 — 기관측)와 본문 텍스트 주소(전주천동로 94 — 진짜) 중 어느 쪽도 채택되지 않고 kto_addr 가 이겼다.

## 탐지 실패 이유

field 단위 provenance 는 남았지만(**AMBIGUOUS·display_eligible:false 가 기록 자체는 됨**),
그 값을 소비하는 hard gate 가 승격·반입 어디에도 없었다. 검증은 "값 존재" 중심이었고
"entity 일관성" 검사가 없었다.

## 조치

- **Production(Main, 완료)**: image NULL(09-24 릴리스) → address `전주천동로 94` 교정
  (`e66a8c1`, SQL sha `121b851c`, affected 1). 좌표·이름·external_id·official_url 무수정.
  재오염 가드 `src/lib/data-guards/jeonju-776-identity-guard.test.ts`.
- **Data Track 정본(본 TASK)**: `jeonju-final-service-catalog-v1.json` OFF-17463 단일 객체
  교정 — match_type `AMBIGUOUS→OFFICIAL_ONLY`(identity-resolution 판정 준거),
  kto_* 6필드 detach, phone `063-288-4020`, identity_review true, correction_ref 부여.
  checksum `da498b04458a71fe → 3a2d0a2139aee1ed`, 423행 불변·타 row 변경 0.
  선행 스냅숏(curation-phase1)·수집 로그(crossmatch·official-raw)는 역사 기록으로 보존.
- **재발 방지 gate**: `scripts/data-gates/entity-coherence-gate.mjs` —
  AMBIGUOUS 차단·category/content-type 불일치 차단·좌표-entity 충돌(기본 30m·이름 대조)·
  기관 대표번호 차단·이미지 hard gate(display_eligible/rights/cross-entity)·no-image 정상.
  fixture 2종 + 회귀 테스트 6/6 (`entity-coherence-gate.test.mjs`).

## 기존 5도시 제한 감사 (2026-09-24 · 수정 없음 — 목록만)

`scripts/data-gates/off-17463-limited-audit.mjs` →
`data/quality-gates/off-17463/five-city-limited-audit-v1.json`

- 전주 catalog 423: confirmed clean 259 · **review candidates 164**
  (AMBIGUOUS 미해소 ACTIVE 54 · 기관 대표번호 phone 94행 · 좌표-entity 충돌 91 ·
  근접-이명 17 — 중복 집계 있음). ACTIVE+quarantine 사유 = **HIGH 65건**.
- Main 반입 five-city-core-v3(4,829행, 읽기 전용): **provenance AMBIGUOUS 반입 55건**
  (전부 전주 OFF-*) — OFF-17463 은 교정 완료(RESOLVED), 나머지 54건 review 후보.
- confirmed contamination 은 OFF-17463 **1건**(교정 완료). 후보 수가 많아 개별 수동
  검증은 **별도 TASK 로 분리 권고**(무단 일괄 수정 금지 준수).

## 시행착오 기록 (다음 도시에 적용)

1. 이름이 일치해도 필드 전체가 같은 장소라는 보장은 없다.
2. 좌표는 맞지만 주소·사진·전화가 다른 entity 일 수 있다 — 이번 사건이 정확히 그 형태다.
3. 서로 다른 후보의 최고 점수 필드를 조합하면 존재하지 않는 혼합 장소가 만들어진다.
4. 인접한 숙소와 음식점(77.6m)은 거리만으로 구분할 수 없다.
5. `AMBIGUOUS` 는 경고가 아니라 자동 게시 차단 상태여야 한다.
6. `display_eligible:false` 는 UI 힌트가 아니라 hard gate 여야 한다.
7. 공공기관 대표번호는 개별 업체 전화번호가 아니다(전주 catalog 에 94행 반복).
8. 권리 불명 사진은 정확해 보여도 게시하면 안 된다.
9. 사진 없음이 잘못된 사진보다 안전하다 — no-image 는 정상값이다.
10. Production patch 만으로는 다음 재수집 오염을 막을 수 없다 — 정본과 게이트를 함께 고쳐야 한다.

## 미해결 (UNRESOLVED)

- 전주 review candidates 164 / intake AMBIGUOUS 54 의 개별 identity 재검토(별도 TASK).
- Main 반입 단계에서 display_eligible 을 소비하지 않은 정확한 스크립트/단계 특정
  (반입은 수동 TASK 체계라 실행 기록 원장 대조 필요).
- 게시물 board 메타 phone 의 일괄 처리 정책(94행) — 기관 번호는 phone 후보에서 제외할지.

## 관련 commit·artifact·checksum

- Main: `e66a8c1`(776 교정) · correction `candidate-corrections-jeonju-776-identity-v1.json` · SQL sha `121b851c76d8dddf`
- Data Track: 본 branch `datafix/off-17463-contamination-prevention-v1` — catalog `da498b04458a71fe → 3a2d0a2139aee1ed`
