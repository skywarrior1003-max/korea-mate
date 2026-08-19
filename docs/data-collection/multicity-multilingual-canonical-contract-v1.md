# Multicity Multilingual Canonical Contract v1

| 항목 | 값 |
|---|---|
| 작성 | TASK-MULTICITY-MULTILINGUAL-AUDIT-CORRECTION-AND-CONTRACT-V1 |
| 작성일 | 2026-08-19 |
| 브랜치 | `data/multicity-main-handoff-v1` |
| 상태 | ACTIVE — 이 문서가 다국어 관련 모든 결정의 SSOT |
| 의존 | AUDIT `docs/data-collection/handoff/multicity-multilingual-audit-corrected-v1.md` |

---

## 목적

이 문서는 KoreaMate 4,826건 service universe의 다국어(KO/EN/JA/ZH) canonical 상태와
다음 collection task에 대한 계약(contract)이다.

"contract"란: 메인 노트북, 보조 컴퓨터, 외부 AI가 모두 동의해야 하는 사실과 규칙.
이 계약과 충돌하는 작업은 착수 전 계약을 먼저 수정해야 한다.

---

## 1. 현재 상태 (2026-08-19 기준)

### 1.1 실제 텍스트 기준 coverage 요약

| 언어 | Title | Address | Description | Core3 |
|---|---:|---:|---:|---:|
| KO | 4,826/4,826 (100%) | 4,799/4,826 (99.4%) | 4,228/4,826 (87.6%) | 4,222/4,826 (87.5%) |
| EN | 717/4,826 (14.9%) | 0/4,826 (0%) | 634/4,826 (13.1%) | 0/4,826 (0%) |
| JA | 0/4,826 (0%) | 0/4,826 (0%) | 0/4,826 (0%) | 0/4,826 (0%) |
| ZH | 0/4,826 (0%) | 0/4,826 (0%) | 0/4,826 (0%) | 0/4,826 (0%) |

4개 언어 완성 레코드 수 = **0**

단, ZH는 ZH_POLICY_PENDING으로 인해 이 계약에서 별도 항목으로 다뤄진다.

### 1.2 Source pointer (수집 경로 신호)

이 수치는 source에 multilingual content가 존재할 가능성을 나타낸다. 텍스트가 아니다.

| 도시 | 신호 유형 | EN | JA | ZH |
|---|---|---:|---:|---:|
| Seoul | multilingual_cids (CID string) | 1,797 | 1,638 | CN:1,633 / TW:1,618 |
| Jeju | multilingual boolean flag | 1,226 (en=true) | 1,227 (jp=true) | 1,226 (cn=true) |
| Gyeongju | has_en_title boolean | 138 | 0 | 0 |
| Busan NonFood | LANGUAGE_MARKER in name_ko | 132 | 132 | 144 |
| Busan Food | implicit (VisitBusan EN source) | 194 (수집 완료) | 0 | 0 |
| Jeonju | kto_cid / tour.jeonju.go.kr sid | EN 215+103 | JA 103 (sid) | ZH 103 (sid) |

---

## 2. 언어별 결정

### 2.1 한국어 (KO) — BASE LANGUAGE

**상태: 충분히 수집됨. 보완 가능.**

KO title: 4,826/4,826 완비.
KO address: 4,799/4,826 (Jeonju 21건 gaps — OFFICIAL source 21건 kto_addr 없음, COLLECTION_GAP).
KO description: 4,228/4,826. Gap 598건:
  - Jeonju 236건: description 필드 자체 없음 (KTO + CMS source 존재 → COLLECTION_GAP)
  - BusanNonFood 287건: description 없음 (KTO source 부분 존재 → COLLECTION_GAP)
  - Gyeongju 65건: KTO description 없거나 짧음

**계약 조건:**

```
KO_TITLE_DO_NOT_OVERWRITE = YES
KO_EXISTING_DATA_BASE = 4826 records → source-of-truth, 재수집으로 덮어쓰기 금지
KO_DESCRIPTION_COLLECTION_ALLOWED = YES (Jeonju 236 + NonFood 287 우선순위)
KO_ADDRESS_COLLECTION_ALLOWED = YES (Jeonju 21 OFFICIAL 건)
```

### 2.2 영어 (EN)

**현재 상태:**
- Busan: CANONICAL_PRESENT (194 food + 519 nonfood title + 440 nonfood desc). Provenance 미기록.
- Seoul 4건: CANONICAL_PRESENT (이벤트 title_en만)
- 나머지: COLLECTION_GAP (CID/flag/pointer 있음, text 없음) 또는 UNKNOWN

**계약 조건:**

```
EN_COLLECTION_PHASE_NOT_STARTED = YES
EN_SOURCE_PRIORITY_ORDER = [
  "1. Seoul: VisitSeoul CID API fetch (1797 CID 이미 존재)",
  "2. Jeju: VisitJeju en=true flag records (1226 records)",
  "3. Jeonju: KTO EngService2 + tour.jeonju.go.kr CMS ENG (215+103 records)",
  "4. Gyeongju: gyeongju.go.kr EN content fetch (138 records with has_en_title=True)",
  "5. BusanNonFood: KTO EngService2 + VisitBusan EN SSR (132 EN marker records)"
]
EN_BUSAN_PROVENANCE_AUDIT_REQUIRED = YES
  reason: "기존 519 name_en / 440 desc_en의 source별 분류 미기록 (VisitBusan SSR vs KTO EngService2)"
EN_ADDRESS_COLLECTION_BLOCKED = PRODUCT_DECISION_REQUIRED
  reason: "어떤 source도 EN address를 체계적으로 제공하지 않음. 서비스 요건 확인 필요."
EN_CORE3_UNACHIEVABLE_WITHOUT_ADDRESS_DECISION = YES
```

### 2.3 일본어 (JA)

**현재 상태:** CANONICAL TEXT = 0/4,826.
Source pointer: Seoul 1,638 CID / Jeju 1,227 (jp=true flag) / Busan NonFood 132 "(일)" marker / Jeonju 103 (CMS JPN sid)

**계약 조건:**

```
JA_COLLECTION_PHASE_NOT_STARTED = YES
JA_LANGUAGE_CODE_STANDARD = "ja"
  note: "Jeju 내부 flag는 jp=true이나 외부 canonical 필드명은 ja 사용"
JA_SOURCE_PRIORITY_ORDER = [
  "1. Seoul: VisitSeoul JA CID fetch (1638 CID)",
  "2. Jeju: VisitJeju jp=true records (1227 records)",
  "3. Jeonju: tour.jeonju.go.kr CMS JPN (103 records)",
  "4. BusanNonFood: KTO (일) marker (132 records)"
]
```

### 2.4 중국어 (ZH) — POLICY PENDING

**현재 상태:** CANONICAL TEXT = 0/4,826.
Source pointer: Seoul ZH-CN 1,633 / ZH-TW 1,618 / Jeju cn=true 1,226 / Busan NonFood (중간)/(중번) 144 / Jeonju CMS CHN 103

**중대 미결 사항:**

| 소스 | 제공 ZH variant |
|---|---|
| VisitSeoul | ZH-CN + ZH-TW 별개 CID |
| VisitJeju | cn (Simplified 추정) |
| KTO | Simplified(중번) + Traditional(중간) 별개 API 파라미터 |
| tour.jeonju.go.kr | CHN (Simplified 추정, 미확인) |

**계약 조건:**

```
PRODUCT_ZH_DECISION_REQUIRED = YES
ZH_COLLECTION_BLOCKED = YES_UNTIL_POLICY_RESOLVED
ZH_POLICY_OPTIONS = [
  "A. ZH-CN만 제공 (Simplified 단일)",
  "B. ZH-TW만 제공 (Traditional 단일)",
  "C. ZH-CN + ZH-TW 둘 다 별개 필드로 제공"
]
ZH_MANDATORY_DECISION_BEFORE_COLLECTION = YES
  reason: "ZH-CN vs ZH-TW 구분 없이 cn으로 통합하면 후처리로 분리 불가능"
ZH_JEJU_LANGUAGE_CODE = "cn (VisitJeju 내부)" → 정책 결정 후 canonical 필드명 통일 필요
```

---

## 3. Canonical 필드 표준

### 3.1 필드명 표준

다음은 multilingual text 수집 후 canonical에 사용하는 필드명 표준이다.
현재 존재하지 않는 필드는 product 통합 단계에서 추가.
기존 canonical 필드를 이 계약 이전에 임의로 변경하는 것은 금지.

| 언어 | Title | Address | Description |
|---|---|---|---|
| KO | `name_ko` / `title_ko` | `address` / `kto_addr` | `description` / `description_ko` |
| EN | `name_en` / `title_en` | `address_en` (미설계) | `description_en` |
| JA | `name_ja` / `title_ja` | `address_ja` (미설계) | `description_ja` |
| ZH-CN | `name_zh_cn` / `title_zh_cn` | — (미설계) | `description_zh_cn` |
| ZH-TW | `name_zh_tw` / `title_zh_tw` | — (미설계) | `description_zh_tw` |

**주의:** 도시별로 현재 사용하는 KO 필드명이 다르다.
Seoul: `title_ko`. Jeju: `name_ko` + `description`. Jeonju: `name`. Gyeongju: `name_ko`.
통합 시 필드명 정규화가 필요하다. 이 계약은 정규화 기준을 선언하지 않는다 — 별도 통합 정책 문서에서 결정.

### 3.2 Source pointer 필드 — 수집 시 보존 의무

다음 필드는 multilingual collection task에서 반드시 참조하는 source 경로다.
기존 canonical에서 제거하거나 null로 교체하면 이후 collection 불가.

| 도시 | 필드 | 역할 |
|---|---|---|
| Seoul (비식당) | `multilingual_cids` (string) | EN/JA/ZH-CN/ZH-TW CID |
| Seoul (식당) | `multilingual_cids` (object) | EN/JA/ZH-CN/ZH-TW CID |
| Jeju (C1) | `en` / `jp` / `cn` 필드 | multilingual source availability flag |
| Gyeongju | `has_en_title` / `has_en_overview` | EN source availability boolean |
| Jeonju | `kto_cid` | KTO API fetch용 contentId |
| Jeonju | `sid` | tour.jeonju.go.kr CMS ID |
| Busan NonFood | LANGUAGE_MARKER in `name_ko` "(일)/(중간)/(중번)/(영)" | language availability signal |

**계약:**
```
SOURCE_POINTER_FIELDS_IMMUTABLE_UNTIL_TEXT_COLLECTED = YES
```

---

## 4. Gap 해소 우선순위

### 4.1 KO gap 해소 (단기 — collection 경로 명확)

| 우선순위 | 도시 | Gap | 건수 | 방법 |
|---|---|---|---|---:|
| 1 | Jeonju | KO description | 236 | KTO API contentId로 KO desc fetch |
| 2 | Jeonju | KO address 21건 | 21 | tour.jeonju.go.kr CMS 수동 또는 Naver Map API |
| 3 | BusanNonFood | KO description | 287 | KTO API KO desc fetch |
| 4 | Gyeongju | KO description | 65 | gyeongju.go.kr + KTO 보완 |

### 4.2 EN gap 해소 (중기 — Seoul/Jeju CID fetch 착수 후)

| 우선순위 | 도시 | 언어 | 대상 건수 | 방법 |
|---|---|---|---:|---|
| 1 | Seoul | EN | ~1,793 | VisitSeoul CID API (이미 CID 있음) |
| 2 | Jeju | EN | ~1,226 | VisitJeju C1 en=true records |
| 3 | Jeonju | EN | ~236 | KTO EngService2 + CMS ENG |
| 4 | Gyeongju | EN | ~138 | gyeongju.go.kr EN pages |
| 5 | BusanNonFood | EN | ~130 | KTO 미수집분 + VisitBusan EN |

### 4.3 JA gap 해소 (중기 — EN 착수 병행 또는 직후)

| 우선순위 | 도시 | 대상 건수 | 방법 |
|---|---|---:|---|
| 1 | Seoul | ~1,638 | VisitSeoul JA CID |
| 2 | Jeju | ~1,227 | VisitJeju jp=true records |
| 3 | Jeonju | ~103 | tour.jeonju.go.kr CMS JPN |
| 4 | BusanNonFood | ~132 | KTO JA endpoint |

### 4.4 ZH gap 해소 — BLOCKED (policy 결정 후)

ZH collection은 PRODUCT_ZH_DECISION_REQUIRED 해소 전까지 착수 금지.

---

## 5. 금지 행위

다음 행위는 이 계약 기간 동안 금지된다.

```
PROHIBITED_ACTIONS:
  1. CID / flag / boolean을 텍스트로 계산하거나 보고하는 행위
  2. multilingual_cids / has_en_title / en / jp / cn flag 필드 삭제
  3. ZH_POLICY_PENDING 상태에서 ZH 텍스트 수집 착수
  4. 기존 4,826 KO 데이터 재수집으로 덮어쓰기
  5. EN address 필드를 임의 설계하거나 추정값으로 채우는 행위
  6. KO → EN 기계 번역을 TRANSLATION_CANDIDATE로 분류하여 canonical에 삽입
     (근거 없는 번역 데이터 삽입 = QUALITY_VIOLATION)
  7. 이 계약 문서 없이 multilingual collection task 착수
  8. ZH-CN / ZH-TW를 ZH_POLICY 결정 전에 임의로 cn으로 통합하는 행위
```

---

## 6. 다음 단계 (Next Steps)

### 메인 노트북이 착수 전 완료해야 할 결정

| 결정 | 담당 | 상태 |
|---|---|---|
| PRODUCT_ZH_DECISION: ZH-CN / ZH-TW / 둘 다 | Product | ⬜ PENDING |
| ADDRESS_EN_REQUIREMENT: EN 주소 필요 여부 | Product | ⬜ PENDING |
| KO_DESCRIPTION_COLLECTION_ORDER: Jeonju vs NonFood 우선순위 | Main | ⬜ PENDING |
| BUSAN_EN_PROVENANCE_AUDIT: 519 name_en source 분류 | Main | ⬜ PENDING |

### 착수 가능한 첫 번째 collection task

1. Jeonju KO description 수집 (KTO API / CMS — block 없음)
2. Seoul EN collection (VisitSeoul CID fetch — CID 이미 있음, ZH policy 무관)
3. Jeju EN collection (VisitJeju en=true — flag 이미 있음)

---

## 7. 계약 갱신 조건

이 문서는 다음 사건 발생 시 갱신해야 한다.

- PRODUCT_ZH_DECISION 확정
- multilingual collection task 1개 이상 완료
- 새 도시 추가 (현재 5개 도시, 6번째 도시 착수 시)
- canonical 필드명 표준 정규화 결정
- ADDRESS_EN_REQUIREMENT 결정

갱신 시 이 파일을 직접 수정하지 말고 `multicity-multilingual-canonical-contract-v2.md`로 새 버전 생성.
이 v1 파일은 history reference로 보존.
