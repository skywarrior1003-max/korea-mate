# 전주 공식 이미지 gapfill·마감 v1 (2026-09-06)

> TASK-GOKOREAMATE-JEONJU-OFFICIAL-IMAGE-GAPFILL-AND-CLOSEOUT-V1. Production 실행 없음 —
> 적용은 TASK-GOKOREAMATE-JEONJU-IMAGE-PRODUCTION-REFLECTION-APPLY-V2(오너 승인).

## 1. 62곳 처리 (identity = 기존 source 키만 · fuzzy 0)

| 경로 | 수 | 방법 |
|---|---|---|
| 기수집 자산 회수 | **32** | handoff 브랜치 `data/jeonju-targeted-completion-v1` 의 `jeonju-official-primary-raw-v1.jsonl`(전주문화관광 tour.jeonju.go.kr, 199행) — **dataSid = 기존 city_spot_sources(visitjeonju) 키로 결정적 조인** |
| KTO TourAPI 라이브 gapfill | **5** | 기존 kto source contentid 로 detailCommon2/detailImage2 호출(승인 공식 원천·TOUR_API_KEY) — 솔가·하숙영 가마솥비빔밥·팔복예술공장·이화고택·성미당 |
| **미해결** | **25** | KTO 레코드에 이미지 자체가 없고(라이브 재확인 포함) 전주문화관광 공식 보드(미식여행·숙박 포함 전 메뉴 기수집 199행)에도 부재 — 대부분 음식점·한옥숙박·공방. 공식 원천에 이미지가 실재하지 않아 억지 채움 없이 보고 |

## 2. 전주 최종 상태 (패키지 적용 시)

- 236곳 중 이미지 확보 **211**(기존 174 + 신규 37) · primary **211** · total relations **224**(기존 174 + 신규 50: 신규 37 primary + 13 additional) · 무이미지 25.
- 기존 174 는 primary/sort/source 무변경 — display_eligible + https 정규화 + Owner 결정 note 만.
- 신규 rights: `VISITJEONJU_OFFICIAL` 32곳 / KTO `Type3`·`KTO_TYPE_UNKNOWN`(수집값 그대로 — 재판정 0).
  출처(페이지 URL/contentId)는 rights_note + master 에 기록 · takedown-on-request.

## 3. 검증

- 신규 URL **50/50 PASS**(https 200·image/*·418–4,000px·median 1,180 — broken 0·placeholder/stamp 0).
  기존 174 는 직전 태스크에서 174/174 검증 완료.
- 서버측 READ-ONLY dry-run: upd 174/174 · insertable 50/50 · ins_prim 37 · prim_blocked 0 ·
  bad_source 0 · non_jeonju 0. precheck 실서버 실측 일치(174/174/0/0/0/211/174).
- master 중복 (spot,url) 0 · spot당 primary ≤1.

## 4. 패키지 (immutable)

`data/main-intake/five-city-reflection-recovery-v1/`
- **jeonju-images-master-v1.jsonl** — 224행 authoritative mapping(기존 174 UPDATE + 신규 50 INSERT, 출처·권리·as_of 전량)
- **jeonju-images-full-{precheck,apply,readback}-v2.sql** — apply sha256 `f7614f2d45f5ff5a6bafe85d137b6627f2f7399bf2557b82818d4b6c48f96e58`

기대: relations 174→224 · eligible 0→224 · primary 211 · city_spots.image_url 0→211 · publication 변경 0.
`jeonju-images-eligibility-*-v1`(174-only) = **SUPERSEDED — DO NOT APPLY**.
반영 후 UI 노출은 Production rebuild 1회 필요(SSG).
