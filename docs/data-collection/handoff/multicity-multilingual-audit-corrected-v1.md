# Multicity Multilingual Audit — Corrected v1

| 항목 | 값 |
|---|---|
| 작성 | TASK-MULTICITY-MULTILINGUAL-AUDIT-CORRECTION-AND-CONTRACT-V1 |
| 작성일 | 2026-08-19 |
| 브랜치 | `data/multicity-main-handoff-v1` |
| 정정 대상 | TASK-MULTICITY-MULTILINGUAL-COVERAGE-READONLY-AUDIT-V1 |
| 계산 방법 | final service record 직접 읽기 (복사 없음) |

---

## 직전 Audit에서 발견된 오류 정정

직전 보고서(TASK-MULTICITY-MULTILINGUAL-COVERAGE-READONLY-AUDIT-V1)의 글로벌 합산에 오류가 있었다.
Busan Food 194건이 EN title/description 글로벌 합산에 이중 계산됐다.
Jeonju KR address가 실제 측정 없이 236으로 기재됐다.

| 항목 | 직전 (오류) | 정정값 | 차이 |
|---|---:|---:|---:|
| EN title 전체 | 911 | **717** | -194 (BusanFood 이중 계산) |
| EN description 전체 | 828 | **634** | -194 (동상) |
| KR Core3 전체 | 4,224 | **4,222** | -2 (BusanNonFood 477→476, 전체 합산 재계산) |
| KR address 전체 | 4,820 | **4,799** | -21 (Jeonju 236→215) |
| Jeonju KR address | 236/236 | **215/236** | -21 (OFFICIAL 21건 kto_addr 없음) |
| Gyeongju EN MAPPING_GAP | "138건 MAPPING_GAP" | **0건 MAPPING_GAP** | gap-fill 파일 gyeongju branch에 없음. 실제 EN text 없음. 전부 COLLECTION_GAP. |

---

## 교정된 Coverage 수치

### MISSING 판정 기준

- key 없음
- null
- 빈 문자열 (`""`)
- whitespace only
- boolean (`True`/`False`) — text 아님

### 도시별 KO coverage

| 도시 | N | KO title | KO address | KO description | KO Core3 |
|---|---:|---:|---:|---:|---:|
| Busan Food | 194 | 194 | 194 | 194 | **194** |
| Busan NonFood | 764 | 764 | 763 | 477 | **476** |
| Gyeongju | 299 | 299 | 299 | 234 | **234** |
| Seoul | 1,837 | 1,837 | 1,836 | 1,837 | **1,836** |
| Jeju | 1,496 | 1,496 | 1,492 | 1,486 | **1,482** |
| Jeonju | 236 | 236 | 215* | 0† | **0** |
| **TOTAL** | **4,826** | **4,826** | **4,799** | **4,228** | **4,222** |

`*` kto_addr 필드. OFFICIAL source 21건 주소 없음. `†` description 필드 자체 없음.

### 도시별 EN coverage (실제 텍스트만)

| 도시 | N | EN title | EN address | EN description | EN Core3 |
|---|---:|---:|---:|---:|---:|
| Busan Food | 194 | 194 | 0 | 194 | 0‡ |
| Busan NonFood | 764 | 519 | 0 | 440 | 0‡ |
| Gyeongju | 299 | 0 | 0 | 0 | 0 |
| Seoul | 1,837 | 4 | 0 | 0 | 0 |
| Jeju | 1,496 | 0 | 0 | 0 | 0 |
| Jeonju | 236 | 0 | 0 | 0 | 0 |
| **TOTAL** | **4,826** | **717** | **0** | **634** | **0** |

`‡` address_en 없음 → EN Core3 = 0 (전 도시)

### JA/ZH coverage (실제 텍스트)

| 언어 | Title | Address | Description | Core3 |
|---|---:|---:|---:|---:|
| JA | 0/4,826 | 0/4,826 | 0/4,826 | 0/4,826 |
| ZH-CN | 0/4,826 | 0/4,826 | 0/4,826 | 0/4,826 |
| ZH-TW | 0/4,826 | 0/4,826 | 0/4,826 | 0/4,826 |

### 산술 검증

| 검증 항목 | 결과 |
|---|---|
| 도시별 N 합 = 4,826 | 194+764+299+1837+1496+236 = **4,826** ✓ |
| KO title 합 | 4,826 = 4,826 ✓ |
| KO address 합 | 4,799 = 4,799 ✓ |
| KO description 합 | 4,228 = 4,228 ✓ |
| KO Core3 합 | 4,222 = 4,222 ✓ |
| EN title 합 | 717 = 717 ✓ |
| EN description 합 | 634 = 634 ✓ |
| CID/flag/marker를 text로 계산한 건수 | **0** ✓ |

---

## Source/Text Separation

### Seoul (N=1,837)

| 언어 | SOURCE_CAPABILITY | SOURCE_POINTER_COUNT | ACTUAL_TEXT_COLLECTED | CANONICAL_TEXT |
|---|---|---:|---:|---:|
| KO | YES | — | 1,837 | 1,837 (title+desc) |
| EN | YES (VisitSeoul) | 1,797 CID | 0 | 4 (이벤트 title_en만) |
| JA | YES (VisitSeoul) | 1,638 CID | 0 | 0 |
| ZH-CN | YES (VisitSeoul) | 1,633 CID | 0 | 0 |
| ZH-TW | YES (VisitSeoul) | 1,618 CID | 0 | 0 |

CID 구조: 비식당(VISITSEOUL) = string `"en:ENPxxxxxx"`, 식당(VISITSEOUL_FOOD) = object `{en:"ENPxxxxxx"}`.
두 포맷 모두 CID pointer이며 실제 텍스트 아님.

### Jeju (N=1,496)

| 언어 | SOURCE_CAPABILITY | SOURCE_POINTER_COUNT | ACTUAL_TEXT_COLLECTED | CANONICAL_TEXT |
|---|---|---:|---:|---:|
| KO | YES | — | 1,496 | 1,496 (title) |
| EN | YES(C1) / UNKNOWN(C4) | 1,226 flag | 0 | 0 |
| JP→ja | YES(C1) / UNKNOWN(C4) | 1,227 flag | 0 | 0 |
| CN→zh? | YES(C1) / UNKNOWN(C4) | 1,226 flag | 0 | 0 |

flag(`en=true`, `jp=true`, `cn=true`)는 VisitJeju source availability 신호이며 실제 텍스트 아님.
C1 = VISITJEJU_C1 (장소 1,230건). C4 = VISITJEJU_C4 (음식 256건, 다국어 flag 없음).
언어 코드 `jp`/`cn`은 서비스 표준 `ja`/`zh-CN|zh-TW`와 다름 → ZH_POLICY_PENDING.

### Gyeongju (N=299)

| 언어 | SOURCE_CAPABILITY | SOURCE_POINTER_COUNT | ACTUAL_TEXT_COLLECTED | CANONICAL_TEXT |
|---|---|---:|---:|---:|
| KO | YES | — | 299 | 299 (title) |
| EN | PARTIAL (gyeongju.go.kr 일부) | 138 (has_en_title=True) / 19 (has_en_overview=True) | 0 | 0 |
| JA | NO (gyeongju.go.kr 한국어 전용) | 0 | 0 | 0 |
| ZH | NO | 0 | 0 | 0 |

gyeongju branch에 gap-fill 디렉토리 없음. EN text가 repo 어디에도 없음.
`has_en_title=True` boolean = source capability 신호 (text 아님).
EN_STATUS 분포(en-coverage 파일 기준): EN_READY=11, EN_PARTIAL=35, EN_IDENTITY_REVIEW=92, EN_SOURCE_MISSING=97, EN_NOT_COLLECTED=67.
모두 status flag이며 canonical에 실제 EN 텍스트 없음.

### Busan Food (N=194)

| 언어 | SOURCE_CAPABILITY | SOURCE_POINTER_COUNT | ACTUAL_TEXT_COLLECTED | CANONICAL_TEXT |
|---|---|---:|---:|---:|
| KO | YES | — | 194 | 194 |
| EN | YES (VisitBusan EN + KTO EN) | 194 (implicit, all linked) | 194 name_en, 194 desc_en | 194 (title+desc) |
| EN address | NO (field 미설계) | 0 | 0 | 0 |
| JA | UNKNOWN | 0 | 0 | 0 |
| ZH | UNKNOWN | 0 | 0 | 0 |

EN provenance: UNKNOWN_PROVENANCE. VisitBusan EN SSR + KTO EngService2 혼재. 레코드별 출처 미기록.

### Busan NonFood (N=764)

| 언어 | SOURCE_CAPABILITY | SOURCE_POINTER_COUNT | ACTUAL_TEXT_COLLECTED | CANONICAL_TEXT |
|---|---|---:|---:|---:|
| KO | YES | — | 764/763/477 | 764 title / 763 addr / 477 desc |
| EN | PARTIAL (KTO + VisitBusan EN) | 132 LANGUAGE_MARKER | 519 name_en / 440 desc_en | 519 (title) / 440 (desc) |
| JA | PARTIAL (marker 132건) | 132 LANGUAGE_MARKER (명칭 내 "(일)" 표기) | 0 | 0 |
| ZH | PARTIAL (marker 144건) | 144 LANGUAGE_MARKER (명칭 내 "(중)") | 0 | 0 |

`(영)/(일)/(중간)/(중번)` = LANGUAGE_AVAILABILITY_SIGNAL. 실제 텍스트 아님.
JA/ZH 텍스트: branch 어느 파일에도 없음.

### Jeonju (N=236)

| 언어 | SOURCE_CAPABILITY | SOURCE_POINTER_COUNT | ACTUAL_TEXT_COLLECTED | CANONICAL_TEXT |
|---|---|---:|---:|---:|
| KO title | YES | 236 kto_cid/sid | 236 | 236 |
| KO address | PARTIAL (KTO 215, OFFICIAL 21 없음) | 215 kto_cid | 215 | 215 |
| KO description | YES (KTO 및 CMS source 있음) | 215 kto_cid + 103 sid | 0 | 0 |
| EN | PARTIAL (KTO EN + CMS ENG) | 215 kto_cid + 103 sid | 0 | 0 |
| JA | PARTIAL (CMS JPN) | 103 sid | 0 | 0 |
| ZH | PARTIAL (CMS CHN) | 103 sid | 0 | 0 |

---

## Gap 재분류 (수정된 기준)

### 분류 정의

| 분류 | 조건 |
|---|---|
| CANONICAL_PRESENT | final canonical에 실제 텍스트 존재 |
| MAPPING_GAP | repo raw/patch에 실제 텍스트 있으나 canonical 미반영 |
| COLLECTION_GAP | CID/flag/marker 존재, 실제 텍스트 repo 없음 |
| TRANSLATION_CANDIDATE | 공식 source 자체에 해당 언어 없다는 근거 확인 |
| UNKNOWN | repo 근거로 판정 불가 |

### 도시별 Gap 재분류 요약

**Busan Food**
- EN title/desc: CANONICAL_PRESENT (194/194)
- EN address: 없음 (필드 미설계 — 별도 product 결정 필요)
- JA/ZH: UNKNOWN (VisitBusan JA/ZH 능력 미확인, marker/CID 없음)

**Busan NonFood**
- EN title/desc: CANONICAL_PRESENT (519/440) + COLLECTION_GAP (245/324 미수집, EN marker 없는 것 포함)
- JA: COLLECTION_GAP 132 (marker 있음) + UNKNOWN 632 (marker 없는 나머지)
- ZH: COLLECTION_GAP 144 (marker) + UNKNOWN 620 (marker 없는 나머지)

**Gyeongju**
- EN title: COLLECTION_GAP 138 (has_en_title=True 포인터 존재, 텍스트 없음) + UNKNOWN 97 (EN_SOURCE_MISSING — 근거 불충분) + 나머지 64 UNKNOWN
- EN description: COLLECTION_GAP 19 (has_en_overview=True) + UNKNOWN 280
- JA/ZH: UNKNOWN 299 (source 능력 확인 안 됨. gyeongju.go.kr 한국어 전용으로 추정되나 KTO JA/ZH 가능성 미확인)

**Seoul**
- EN: CANONICAL_PRESENT 4 (이벤트 title_en) + COLLECTION_GAP 1,793 (CID 있음, 텍스트 없음) + UNKNOWN 40 (CID 없음)
- JA: COLLECTION_GAP 1,638 (CID) + UNKNOWN 199
- ZH-CN: COLLECTION_GAP 1,633 (CID) + UNKNOWN 204
- ZH-TW: COLLECTION_GAP 1,618 (CID) + UNKNOWN 219

**Jeju**
- EN: COLLECTION_GAP 1,226 (C1 en=true flag) + UNKNOWN 270 (C4 food 256 + 14 others)
- JP(JA): COLLECTION_GAP 1,227 (C1 jp=true) + UNKNOWN 269
- CN(ZH?): COLLECTION_GAP 1,226 (C1 cn=true) + UNKNOWN 270

**Jeonju**
- KO description: COLLECTION_GAP 236 (kto_cid/sid available, 미수집)
- EN: COLLECTION_GAP 215 (kto_cid)+103 (sid) + UNKNOWN 21 (kto_cid/sid 없는 OFFICIAL 21건)
- JA/ZH: COLLECTION_GAP 103 (sid → CMS JPN/CHN) + UNKNOWN 133

---

## 메인 노트북 주의사항

### 1. 4,826 core data 재사용 가능

- 좌표, NAV, AI eligibility, 이미지, provenance 모두 유효
- `FULL_PLACE_RECOLLECTION_REQUIRED = NO`
- `EXISTING_4826_CORE_REUSABLE = YES`

### 2. 현재 multilingual 상태

- KO: 87.5% Core3 (4222/4826). 주요 gap: Jeonju(0), NonFood desc(477/764)
- EN: title 14.9%(717/4826), Core3 0%
- JA: 0%
- ZH: 0%

4개 언어 완성 레코드 = **0건**.

### 3. Source pointer 반드시 보존

통합 시 canonical의 `multilingual_cids` (Seoul), `multilingual_cids boolean` (Jeju), `kto_cid` (Jeonju) 필드를 버리지 않는다.

이 포인터가 없으면 이후 multilingual collection task에서 source fetch 불가.

### 4. 가장 빠른 multilingual 수집 경로

| 우선순위 | 도시 | 언어 | 방법 | 대상 건수 |
|---|---|---|---|---:|
| 1 | Seoul | EN/JA/ZH-CN/ZH-TW | VisitSeoul API, 기존 CID fetch | ~1,797 EN |
| 2 | Jeju | EN/JP→JA/CN→ZH | VisitJeju API, 기존 flag | ~1,226 |
| 3 | Jeonju | KO desc + EN/JA/ZH | KTO + tour.jeonju.go.kr CMS | 236 KO desc |
| 4 | Gyeongju | EN | gyeongju.go.kr EN content fetch | ~138 |
| 5 | Busan NonFood | JA/ZH | KTO JA/ZH + VisitBusan | 132-144 |

### 5. ZH variant 결정 필요

`PRODUCT_ZH_DECISION_REQUIRED = YES`

Seoul: zh-CN + zh-TW 별개 / Jeju: cn / KTO: Simplified+Traditional 분리 가능.
서비스 제공 언어 결정 전까지 임의 통합 금지.

### 6. EN address 결정 필요

전 도시 EN address = 0/4826.
서비스에서 EN 주소 표시가 필요한지 여부는 product에서 결정.
`ADDRESS_EN_REQUIREMENT_PRODUCT_DECISION_REQUIRED = YES`

---

## 검증 결과

| 항목 | 상태 |
|---|---|
| TOTAL_SERVICE = 4826 | ✓ |
| global count = city 합 | ✓ |
| CID/flag/marker를 text로 센 건수 | 0 ✓ |
| actual text 없는 MAPPING_GAP | 0 ✓ (Gyeongju 재분류 완료) |
| source 미확인 TRANSLATION_CANDIDATE | 0 ✓ |
| ZH 강제 통합 | 0 ✓ |
| city core 변경 | 0 ✓ |
