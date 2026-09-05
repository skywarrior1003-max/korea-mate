# 5도시 Final 데이터 반영 전수 감사 v1 (2026-09-05)

> TASK-GOKOREAMATE-FIVE-CITY-FINAL-DATA-REFLECTION-AUDIT-V1 · READ-ONLY 감사.
> 기준 SSOT: `docs/product/gokoreamate-product-data-closeout-priority-ssot-v1.md` (P0-1).
> Production 변경 0 · Final artifact 변경 0 · 코드 변경 0.
>
> 질문: 이미 수집·정리 완료된 5도시 Final 데이터가
> **Final → normalized/import → Production DB/relation → runtime/API → UI**
> 까지 얼마나 반영되어 있고, 끊긴 지점은 어디인가.

---

## 1. Authoritative Final 원천 (실경로 확인)

| 원천 | 위치 | 내용 |
|---|---|---|
| 5도시 core Final | `data/main-intake/five-city-core-v1/` (master 트래킹) | `five-city-core-active-v1.jsonl`(4,826 active: 장소·4언어 l10n·주소·좌표·url·provenance), `five-city-core-images-v1.jsonl`(4,564행: display_eligible·is_primary·rights), `five-city-core-sources-v1.jsonl`, `five-city-core-crosswalk-v1.jsonl`(canonical↔main id·twin_of), `five-city-core-deferred-fields-v1.jsonl`(7,700+ 이연 필드·사유) |
| 경주 Final 릴리스 | data 브랜치 `data/gyeongju-final-release/*` | `gyeongju-final-image-rights-302-v1.jsonl`(권리 판정본), `gyeongju-city-spot-images-import-v1.jsonl`(169행 — 실제 import 산출물) |
| 도시별 다국어 enrichment | `origin/data/{seoul,jeju,jeonju}-multilingual-v1` | locale 단위 수집행: seoul 5,068 · jeju 4,447 · jeonju 236 (status SUCCESS 중심) |
| 지역 추천/행사/편의 | `data/regional-recommendations/normalized/*-v1.json` (master) | recommended_courses · recommended_now(validTo) · official_guides · travel_utility · excluded_stale |

## 2. 데이터 흐름 계약 (실코드 확인)

- 장소·이미지·l10n·url: Final → import 아티팩트 → **`city_spots`(컬럼: name_l10n/desc_l10n/why_l10n·image_url·official_url·opening_hours 등 35컬럼) + `city_spot_images`(relation: is_primary·display_eligible) + `city_spot_sources`(source_key=canonical)**.
- runtime: `fetchCitySpots` 가 **Supabase 를 직접 조회**(EXPLORE_SELECT 에 name_l10n·desc_l10n·why_l10n·image_url 포함) → **runtime 계층 = Production 계층**(별도 API 손실 지점 없음). UI 카드/허브는 `image_url` 사용.
- 추천 코스/장소: normalized → `src/data/regional/regional-{trips,places}-v1.json`(canonical 64/64 published 고정) → 어댑터 → Home Picks/검색/City Hub/View All — **LIVE**(이 세션 Production 실측).
- Events(별도 surface)·Travel Essentials·official_guides: **아직 어떤 계층에도 배선 없음**(SSOT P0-2 가 계획한 작업) — normalized 원천에만 존재.

## 3. 5도시 Coverage Matrix (전부 실측 숫자)

| City | Final active | Prod pub | Final 이미지 eligible(장소) | Prod image_url | Runtime img(=Prod) | l10n en/ja/zh (Final원천→Prod) | official_url F→P | 판정 |
|---|---|---|---|---|---|---|---|---|
| Seoul | 1,837 | 1,837 | 1,836 | **1,836** | 1,836 | 1,793/1,638/1,630 → **1,795/1,638/1,631** | 530→530 | **완전 일치** |
| Busan | 958(+기존 계보) | 789 pub / 1,037 total | 627 | **459** | 459 | 713 → 547(name_en; 기존 계보 포함 산정) | 323→156* | **충실**(아래 분해) |
| Jeju | 1,496 | 1,496 | 1,237 | **1,237** | 1,237 | 브랜치 SUCCESS **1,482/1,481/1,482** → **0/0/0** | 0→0 | **다국어만 B-누락** |
| Gyeongju | 299(+계보 3) | 302 | 권리판정 **302 전부 has_images=True** / import 산출물 **169** | **170** | 170 | 0(core) → 105(기존 경주 계보) | 102→105 | **이미지 133건 B-누락** |
| Jeonju | 236 | 236 | **0**(174행 전부 권리 보류) | **0** | 0 | 88/72/72 → **89/69/69** | 103→103 | **충실**(권리 게이트) |

\* busan official_url 156 은 published 기준 — Final 323 중 다수가 unpublished 계보·트윈 측에 귀속(구조 손실 아님, §4).

## 4. 이미지 반영 감사 — 도시별 분해

- **Seoul**: 1,836/1,836 완전 일치.
- **Jeju**: eligible 1,237 → Prod 1,237 완전 일치. relation 1,491행도 Final 1,491과 일치. (bbox 밖 29곳 = 추자도 실좌표, 오류 아님.)
- **Busan**: Final eligible 627 = ①crosswalk 매핑 155 → 전부 published+이미지 ✔ ②신규 생성분 source_key 대조 302 → 전부 published+이미지 ✔ ③잔여 **170 = 전부 `CONFIRMED_TWIN`(twin_of→busan-A-\*)** — 본체 row 로 대표되는 **의도적 미생성(E)**. 155+302(+기존 계보 2) = Prod 459. **미해명 손실 0.**
- **Gyeongju**: 권리 판정본 302행 **전부 has_images=True**(VG_OFFICIAL_PUBLIC 133 · VG_RESTAURANT_OFFICIAL 102 · Type3 36 · Type1 27 · 기타 4). 그러나 **import 산출물은 169행뿐 — `VG_OFFICIAL_PUBLIC`(경주 공식 자료실 공공저작물) 133건이 전량 제외됨**. Prod 는 169 산출물을 충실 반영(170; relation·image_url 동기화 완전: rel_primary 보유 published 170 = image_url 170, rel_only 0).
- **Jeonju**: Final 이미지 174행 존재하나 **전부 `KTO_TYPE_UNKNOWN` — "KTO cpyrhtDivCd 미확인 — 권리 확인 후 공개"**(display_eligible=false). import 는 174행을 relation 에 그대로 반영(Prod relation 174·eligible 0), image_url 은 정책대로 0. **파이프라인은 충실 — 0 이 되는 최초 지점은 Final 의 권리 게이트다.**

## 5. Owner 지정 필수 사례 end-to-end

### 5-1. Jeonju image 0
Final(174행, 전부 KTO 권리 보류) → normalized/import(174행 반영 ✔) → Prod relation(174·eligible 0 ✔) → image_url 0 ✔ → runtime/UI 0 ✔.
**분류 E**(권리 정책상 의도적 비공개). "이미지 없음/재수집 필요" 아님 — **복구 = KTO 저작권 유형(cpyrhtDivCd) 확인 → eligible 전환 → primary 승격**.

### 5-2. 동궁과 월지 (경주 spot 439 · 연꽃단지 440)
Final 권리판정: **has_images=True · VG_OFFICIAL_PUBLIC**("Official gyeongju.go.kr attraction images 공공저작물") →
**import 아티팩트에서 탈락(169행에 미포함)** → Prod relation 0·image_url 0 → UI 대표 이미지 없음.
**분류 B(+F)**. Owner 지정 경주 공식 야경 primary 는 복구 시 해당 공식 자료실 세트에서 지정(권리 안전 판정 완료 상태).

### 5-3. 경주세계자동차박물관 (spot 506)
동일 경로 — VG_OFFICIAL_PUBLIC 그룹, import 산출물 탈락, Prod/UI 0. **분류 B(+F)** — 5-2와 같은 133건 그룹.

## 6. 다국어(4언어) 감사

- 런타임 SELECT 에 name_l10n/desc_l10n/why_l10n 포함 — **D(런타임 누락) 없음**.
- Seoul: 브랜치 SUCCESS(1,793/1,638/1,630) ≒ Prod(1,795/1,638/1,631) — **반영 완료**.
- Jeonju: 브랜치(88/72/72) ≒ Prod(89/69/69) — **반영 완료**.
- **Jeju: 브랜치 SUCCESS en 1,482 · ja 1,481 · zh 1,482 (1,483곳) — Prod 0/0/0. 수집은 완료됐고 반영(import) 단계만 미실행. 분류 B(+F).** 서울·전주와 동일 스키마(locale·short_description·title)라 같은 매퍼 재사용 가능.
- Busan: core Final(713 en 등) 대비 Prod 547 — 차이는 트윈(170)·unpublished 계보 귀속으로 §4 와 동일 구조(미해명 손실 0).

## 7. 추천 장소 / 공식 추천 코스

- normalized(코스 22 · recommended_now 23) → `regional-{trips,places}-v1.json`(canonical **64/64 published** — Production 실대조) → 어댑터 → **Home Picks·검색·City Hub 3/3·View All 전부 LIVE**(이 세션 Production 스모크에서 5도시 실측). **누락 없음.**

## 8. Events

- 원천: recommended_now(도시별 3–5건, validTo 관리) — **현재 City Hub '추천 장소' 흐름으로 연결되어 있음**(validTo 만료 자동 제외 확인). `excluded_stale`(3–7건/도시)도 보존.
- **별도 "Events" surface 는 미배선 — 분류 E(INTENTIONAL / P0-2 예정)**. missing data 아님.

## 9. Travel Essentials

- 원천 존재(normalized): travel_utility — busan 7 · gyeongju 8 · jeju 12 · jeonju 10 · seoul 13 (+official_guides 5–34/도시).
- Production/DB·runtime·UI **어디에도 미배선 — 분류 E(P0-2 예정)**. DB 반입 없이 regional 어댑터 방식의 정적 배선도 가능(P0-2 설계 시 결정).

## 10. Gap 분류 총괄

| Class | 건수(그룹) | 내용 |
|---|---|---|
| A (Final 자체 부재) | 1그룹 | jeju core Final 의 official_url/opening_hours/전화 등 일부 필드(l10n 은 A 아님 — 별도 브랜치에 존재). hours/phone 은 전 도시 공통으로 deferred(E)와 중첩 |
| **B (Final 있음/Prod 없음)** | **2그룹(핵심)** | ① **경주 VG_OFFICIAL_PUBLIC 이미지 133건**(동궁과 월지·연꽃단지·자동차박물관 포함) ② **제주 다국어 1,482곳×3로케일** |
| C (Prod 있음/runtime 없음) | 0 | 런타임=DB 직결·SELECT 완전 — 발견 없음 |
| D (runtime 있음/UI 없음) | 0 | 이미지·l10n·url 모두 UI 소비 확인 |
| E (의도적/정책/미배선) | 5그룹 | 전주 이미지 174(권리 보류) · 부산 트윈 170(중복 계약) · deferred fields(phone 3,589 "컬럼 없음"·hours 1,729 "구조화 불가" 등 사유 명기) · Events surface(P0-2) · Travel Essentials/guides(P0-2) |
| F (구조적 공통 원인) | 2건 | B 의 두 그룹 각각 — 원천 그룹 단위 importer 커버리지 누락 |

## 11. Root Causes

**확정:**
- **RC-1 (B/F)**: 경주 이미지 import 아티팩트 생성이 `VG_OFFICIAL_PUBLIC`(경주 공식 자료실) 원천 그룹을 통째로 제외 — 권리판정 302 중 정확히 133건 낙차. Prod 는 산출물(169)을 충실 반영.
- **RC-2 (B/F)**: 제주 multilingual enrichment(SUCCESS 4,445행)가 Production 반영 단계 미실행 — 동일 계보의 서울·전주는 반영 완료(도시별 실행 누락).
- **RC-3 (E)**: 전주 이미지 174행 전부 KTO 저작권 유형 미확인 보류 — 재수집 불요, 권리 확인만 필요.
- **RC-4 (E)**: Events surface·Travel Essentials·official_guides 는 제품 정책상 미배선(P0-2 계획 그대로).
- **RC-5 (E)**: 부산 "누락" 170 은 전부 CONFIRMED_TWIN 중복 계약의 의도적 미생성 — 손실 아님.

## 12. Recovery Plan (이 감사에서는 실행하지 않음)

1. **RECOVERY-1 — 제주 다국어 반영** (최대 blast radius: 1,482곳×3로케일): 기존 서울/전주 반영 매퍼를 jeju-multilingual-v1 에 그대로 실행 → name_l10n/desc_l10n 반영 → READ-BACK.
2. **RECOVERY-2 — 경주 공식 이미지 133건 반영**: VG_OFFICIAL_PUBLIC 그룹으로 import 아티팩트 재생성(권리판정본 기준) → relation+image_url 반영 → **동궁과 월지 primary = Owner 지정 공식 야경 이미지 고정** → READ-BACK.
3. **RECOVERY-3 — 전주 KTO 권리 확인**: cpyrhtDivCd 확인(공공누리 유형 판정) → eligible 전환분 primary 승격. (재수집 아님.)
4. **RECOVERY-4 — P0-2 배선**: Events surface + Travel Essentials(travel_utility/official_guides) City Hub 연결 — 별도 P0-2 태스크.

## 13. UI/브라우저 확인 근거

동일 Production 데이터에 대해 이 세션에서 수행한 실도메인 QA(5도시 Hub·검색·4언어×3폭·place detail)로 UI 계층 소비를 확인 — 이미지가 있는 도시는 표시, 전주는 무사진 편집형 카드로 렌더(깨짐 없음), l10n 존재 도시는 언어 전환 정상. UI 계층 자체 손실(D) 발견 0.
