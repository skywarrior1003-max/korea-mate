# Multicity Multilingual Canonical Contract v2

| 항목 | 값 |
|---|---|
| 작성 | TASK-MULTICITY-MULTILINGUAL-CANONICAL-CONTRACT-V2 |
| 작성일 | 2026-08-19 |
| 브랜치 | `data/multicity-common` |
| 상태 | **ACTIVE — 현재 multilingual SSOT** |
| supersedes | `multicity-multilingual-canonical-contract-v1.md` |
| v1 상태 | historical reference — 수정 금지, 삭제 금지 |

---

## 목적

이 문서는 KoreaMate 4,826건 서비스 유니버스의 다국어(ko/en/ja/zh-CN) canonical 정책 SSOT다.

v1에서 PENDING이었던 제품 결정(ZH variant, address 게이트, 필수 필드)을 확정하고 source locale mapping을 검증된 근거로 기록한다.

이 계약과 충돌하는 작업은 착수 전 계약을 먼저 v3으로 갱신해야 한다.

---

## 1. 확정 제품 정책

### 1.1 지원 언어 (필수)

```
REQUIRED_LOCALES = ko, en, ja, zh-CN
```

| 코드 | 언어 | 상태 |
|---|---|---|
| `ko` | 한국어 | 필수 — BASE |
| `en` | 영어 | 필수 |
| `ja` | 일본어 | 필수 |
| `zh-CN` | 간체 중국어 (Simplified) | 필수 |
| `zh-TW` | 번체 중국어 (Traditional) | optional / future |

```
ZH_TW_REQUIRED = NO
ZH_TW_STATUS = OPTIONAL_FUTURE_LOCALE
```

### 1.2 필수 다국어 텍스트 필드

```
MULTILINGUAL_REQUIRED_CORE = title + short_description
```

각 locale별 `title` + `short_description` 2개가 multilingual readiness 판정 기준이다.

v1의 Core3(title + address + description) 기반 판정은 이 계약에서 폐기한다. 이유: EN address = 0/4,826 (어떤 source도 체계적으로 제공하지 않음).

### 1.3 주소

```
LOCALIZED_ADDRESS_REQUIRED_FOR_MULTILINGUAL_READY = NO
```

공식 source가 localized address를 제공하면 수집·사용한다.
없을 경우 다음으로 대체한다:
- 한국어/source 주소 원문 보존
- lat/lng (수집 완료)
- Naver Map
- Google Maps
- 공식 홈페이지(실제 존재 시)

위 대체 수단이 있다고 해서 없는 텍스트를 임의 생성하지 않는다.

### 1.4 Optional 운영 정보 수집 기준

공식 source가 이미 해당 locale로 제공하는 경우 다음을 함께 수집할 수 있다:

- `hours` (영업시간)
- `closed_day` (휴무일)
- `usage_info` (이용 안내)
- `menu` (메뉴 정보)
- activity/event 핵심 이용 설명
- 기타 여행자에게 유용한 운영 정보

**이 정보가 없다고 해서 해당 장소의 multilingual readiness 판정을 실패시키지 않는다.**

별도 번역·추가 수집을 강제하지 않는다.

---

## 2. 현재 Coverage 기준선 (v1 감사 교정값)

이 수치는 2026-08-19 기준 교정 완료값이다. 상세는 `handoff/multicity-multilingual-audit-corrected-v1.md` 참조.

### 2.1 KO coverage

| 도시 | N | KO title | KO address | KO description | KO Core3 |
|---|---:|---:|---:|---:|---:|
| Busan Food | 194 | 194 | 194 | 194 | 194 |
| Busan NonFood | 764 | 764 | 763 | 477 | 476 |
| Gyeongju | 299 | 299 | 299 | 234 | 234 |
| Seoul | 1,837 | 1,837 | 1,836 | 1,837 | 1,836 |
| Jeju | 1,496 | 1,496 | 1,492 | 1,486 | 1,482 |
| Jeonju | 236 | 236 | 215 | 0 | 0 |
| **TOTAL** | **4,826** | **4,826** | **4,799** | **4,228** | **4,222** |

### 2.2 EN coverage (실제 텍스트)

| 도시 | N | EN title | EN address | EN description |
|---|---:|---:|---:|---:|
| Busan Food | 194 | 194 | 0 | 194 |
| Busan NonFood | 764 | 519 | 0 | 440 |
| Gyeongju | 299 | 0 | 0 | 0 |
| Seoul | 1,837 | 4 | 0 | 0 |
| Jeju | 1,496 | 0 | 0 | 0 |
| Jeonju | 236 | 0 | 0 | 0 |
| **TOTAL** | **4,826** | **717** | **0** | **634** |

### 2.3 JA / zh-CN coverage

JA text: **0/4,826** (전 도시 미수집)
zh-CN text: **0/4,826** (전 도시 미수집)

---

## 3. Source / Text 구분 원칙

```
CID_POINTER_IS_NOT_TEXT = YES
FLAG_IS_NOT_TEXT = YES
BOOLEAN_IS_NOT_TEXT = YES
MARKER_IS_NOT_TEXT = YES
```

아래는 실제 다국어 텍스트가 아니다:

- Seoul `multilingual_cids`: CID 포인터 (e.g. `"en:ENP000217"`)
- Jeju `multilingual_cids`: boolean flag (`{"en": true, "jp": true, "cn": true}`)
- Gyeongju `has_en_title`: boolean (`True`/`False`)
- BusanNonFood name_ko의 `(영)/(일)/(중간)/(중번)`: language availability signal
- Jeonju `kto_cid`, `sid`: API fetch용 ID

이 포인터들은 source에서 해당 언어 텍스트를 가져올 수 있다는 신호이며, 반드시 실제 텍스트 수집 전까지 canonical에 보존해야 한다.

```
SOURCE_POINTER_FIELDS_IMMUTABLE_UNTIL_TEXT_COLLECTED = YES
```

---

## 4. Source Locale Mapping (검증된 근거만)

### 4.1 검증 원칙

```
NO_GUESSING_ON_LOCALE_CODE = YES
SOURCE_RAW_LOCALE_PRESERVED_IN_PROVENANCE = YES
UNVERIFIED_MAPPING_FORBIDDEN = YES
```

source의 locale 코드가 불명확하면 서비스 canonical 표준(ko/en/ja/zh-CN)으로 임의 변환 금지.
반드시 source 실제 구조를 확인 후 mapping을 이 문서에 기록한다.

### 4.2 VisitSeoul (visitseoul.net)

**근거**: data/seoul-targeted-completion-v1 canonical 직접 확인 (2026-08-19).

```
multilingual_cids 형식 (비식당):
  "ko:KOP000217,en:ENP000217,ja:JPP000217,zh-CN:CNP000217,zh-TW:TCP000217"
```

| Source locale code | 서비스 표준 | 비고 |
|---|---|---|
| `ko:` prefix | `ko` | 필수 |
| `en:` prefix | `en` | 필수 |
| `ja:` prefix | `ja` | 필수 |
| `zh-CN:` prefix | `zh-CN` | 필수 |
| `zh-TW:` prefix | `zh-TW` | optional — 현재 불필요 |
| `ru:` prefix | — | 미지원 locale — 무시 |
| `ms:` prefix | — | 미지원 locale — 무시 |

CID 형식: 비식당 string / 식당 object `{ko, en, ja, zh-CN, zh-TW}` — 구조만 다르고 의미 동일.

### 4.3 VisitJeju (visitjeju.net)

**근거**: data/jeju-targeted-completion-v1 canonical 직접 확인 (2026-08-19).

```
multilingual_cids 형식: {"en": true, "jp": true, "cn": true}
```

| Source locale code | 서비스 표준 | 근거 |
|---|---|---|
| `en` (boolean) | `en` | 영어 직접 대응 |
| `jp` (boolean) | `ja` | ISO 639-1 정규화 필요 (`jp` → `ja`) |
| `cn` (boolean) | `zh-CN` | ZH policy 확정: Simplified Chinese 단일 지원 |

**주의**: C4 food 256건은 multilingual_cids 없음 (별도 확인 필요).

### 4.4 VisitJeonju (tour.jeonju.go.kr)

**근거**: data/jeonju 파이프라인 docs + 공식 페이지 직접 확인 (2026-08-19).

| Source URL path | Source 표기 | 서비스 표준 | 근거 |
|---|---|---|---|
| `/kor/` | KOR | `ko` | 기준 언어 |
| `/eng/` | ENG | `en` | HTTP 200 확인 (v4 pipeline doc) |
| `/jpn/` | JPN | `ja` | HTTP 200 확인 (v4 pipeline doc) |
| `/cnh/` | CHN | `zh-CN` | HTTP 200 + **페이지 내 "简体中文" 명시** 확인 |
| 繁體中文 옵션 | — | `zh-TW` | 별도 URL 존재, optional locale로 현재 불필요 |

**CHN = zh-CN 확인 근거**: `tour.jeonju.go.kr/cnh/` 페이지에서 "简体中文" (Simplified Chinese) 명시. "繁體中文"(Traditional)는 별도 언어 선택지로 분리 제공. 추측 아님.

### 4.5 KTO TourAPI (한국관광공사)

**근거**: KTO TourAPI 공식 API 규격 + BusanNonFood canonical marker 확인.

| KTO API Service | 한국어 내부 표기 | 서비스 표준 | 비고 |
|---|---|---|---|
| `KorService2` | — | `ko` | 기준 언어 |
| `EngService2` | `(영)` marker | `en` | |
| `JpnService2` | `(일)` marker | `ja` | |
| `ZhService2` | `(중간)` marker (간체) | `zh-CN` | Simplified — 필수 locale |
| `ZhTService2` | `(중번)` marker (번체) | `zh-TW` | Traditional — optional, 현재 불필요 |

**Busan NonFood marker 해석**:
- `(중간)` = 중국어 간체(簡體) = Simplified = **zh-CN** ✓
- `(중번)` = 중국어 번체(繁體) = Traditional = **zh-TW** (optional)

```
UNVERIFIED_MAPPING_COUNT = 0
```

---

## 5. Source Pointer 보존 의무

아래 필드는 multilingual collection task에서 반드시 참조하는 source 경로다.
기존 canonical에서 제거하거나 null로 교체하면 이후 collection 불가.

| 도시 | 필드 | 역할 |
|---|---|---|
| Seoul (비식당) | `multilingual_cids` (string) | EN/JA/zh-CN/zh-TW CID |
| Seoul (식당) | `multilingual_cids` (object) | EN/JA/zh-CN/zh-TW CID |
| Jeju (C1 장소) | `en` / `jp` / `cn` (boolean) | source availability flag |
| Gyeongju | `has_en_title` / `has_en_overview` | EN source availability |
| Jeonju | `kto_cid` | KTO API contentId |
| Jeonju | `sid` | tour.jeonju.go.kr CMS ID |
| BusanNonFood | `name_ko` 내 `(영)/(일)/(중간)/(중번)` | language availability signal |

```
SOURCE_POINTER_FIELDS_IMMUTABLE_UNTIL_TEXT_COLLECTED = YES
```

---

## 6. 기존 Core Data 보호

```
EXISTING_4826_CORE_REUSABLE = YES
FULL_PLACE_RECOLLECTION_REQUIRED = NO
EXISTING_COORD_IMMUTABLE = YES
EXISTING_IMAGE_IMMUTABLE = YES
EXISTING_NAV_IMMUTABLE = YES
EXISTING_AI_ELIGIBILITY_IMMUTABLE = YES
EXISTING_SOURCE_POINTER_IMMUTABLE = YES
```

다국어 텍스트 수집 과정에서 위 항목은 변경하지 않는다.

---

## 7. Official Source 우선 원칙

```
OFFICIAL_SOURCE_BEFORE_TRANSLATION = YES
```

공식 source가 해당 locale로 이미 제공하는 텍스트가 있으면 그 텍스트를 사용한다.
공식 source에서 해당 언어가 없다는 것이 확인되기 전까지 번역 파이프라인으로 보내지 않는다.

```
NO_MACHINE_TRANSLATION_AS_CANONICAL = YES
```

KO 원문을 AI/기계 번역한 결과를 공식 multilingual text로 canonical에 삽입하는 것은 금지한다.
단, 번역 결과를 draft/review 용도로 별도 관리하는 것은 별개 정책에서 결정 가능.

---

## 8. 금지 행위

```
PROHIBITED_ACTIONS:
  1. CID / flag / boolean / marker를 실제 텍스트로 계산하거나 보고하는 행위
  2. source pointer 필드 삭제
  3. source locale 미확인 상태에서 서비스 locale으로 임의 변환
  4. 기존 4,826 core data 재수집으로 덮어쓰기
  5. EN/JA/zh-CN address 추정값으로 canonical 채우기
  6. KO → EN/JA/zh-CN 기계 번역을 canonical 공식 텍스트로 삽입
  7. 이 계약 문서 없이 multilingual collection task 착수
  8. zh-CN / zh-TW source를 policy 근거 없이 임의로 통합
  9. v1 파일 수정 또는 삭제
```

---

## 9. 다음 단계 (즉시 착수 가능)

| 우선순위 | task | 이유 | block |
|---|---|---|---|
| 1 | Seoul EN/JA collection | CID 1,797/1,638 이미 존재. ZH 결정 불필요. | 없음 |
| 2 | Jeonju KO description | kto_cid 215 + sid 103 available. block 없음. | 없음 |
| 3 | Jeju EN/JA collection | flag 1,226/1,227 already. C4 food 별도 확인 필요. | C4 ZH는 ZH_POLICY로 이미 해소 |
| 4 | Seoul zh-CN collection | VisitSeoul zh-CN CID 1,633 available. | 없음 |
| 5 | Gyeongju EN collection | has_en_title=True 138건. gyeongju.go.kr EN fetch. | 없음 |
| 6 | Jeonju EN/JA/zh-CN | /eng/ /jpn/ /cnh/ 모두 HTTP 200. | 없음 |

---

## 10. 계약 갱신 조건 및 버전 관리

이 v2를 직접 수정하지 않는다. 갱신 사건 발생 시 v3 신규 생성.

**갱신 조건:**
- zh-TW를 필수 locale로 추가하는 결정
- 새 도시 추가 (6번째 도시)
- 필수 필드 변경 (title + short_description 이외)
- multilingual collection task 완료로 source pointer 보존 규칙 업데이트 필요

**v1 (historical reference)**: `multicity-multilingual-canonical-contract-v1.md`
**v2 (current SSOT)**: 이 파일
