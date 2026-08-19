# Main Laptop Data Intake Checklist v1

| 항목 | 값 |
|---|---|
| 문서 목적 | 메인 노트북 데이터 인수인계 단계별 점검표 |
| 작성 | TASK-MULTICITY-MAIN-LAPTOP-HANDOFF-CONTEXT-PACKAGE-V2 |
| 작성일 | 2026-08-19 |
| 참조 | multicity-main-laptop-handoff-v1.md, multicity-final-artifact-manifest-v1.json |

---

## 진행 방법

각 항목을 순서대로 진행한다.  
`[OK]` = 확인 완료. `[FAIL]` = 문제 발견 → 내용 기록 후 중단. `[N/A]` = 해당 없음.  
FAIL 발생 시 보조컴퓨터에 구체적 문제만 보고한다 (broad 재검증 요청 금지).

---

## PHASE 0 — 핸드오프 문서 읽기

| # | 점검 항목 | 결과 |
|---|---|---|
| 0.1 | `multicity-main-laptop-handoff-v1.md` 전체 읽기 완료 | [ ] |
| 0.2 | `multicity-final-artifact-manifest-v1.json` 전체 읽기 완료 | [ ] |
| 0.3 | 부산 TWO-ARTIFACT CONTRACT 이해 (194+764=958, 단일 파일 없음 = 정상) | [ ] |
| 0.4 | 853≠764 수치 차이 이해 (853=provenance, 764=service, excluded=89) | [ ] |
| 0.5 | 서울 AI_AUTO 771 이해 (V1 1,803→TV Gate→771. 오류 아님) | [ ] |
| 0.6 | 제주 RULE-M bbox 수정 이해 (33.1-33.6→33.0-34.0, 추자도/우도 포함) | [ ] |

---

## PHASE 1 — Git 원격 branch·SHA 확인

```bash
# 메인 노트북에서 실행
git fetch origin
```

| # | Branch | 예상 SHA (full) | 확인 결과 |
|---|---|---|---|
| 1.1 | `data/busan-food-discovery-v1` | `40ecc06498a786ede426d0dcd6ec7ddbb66f1136` | [ ] |
| 1.2 | `data/busan-nonfood-complete-v1` | `26fb3affceca253d805dc264e3fcaab7647672ef` | [ ] |
| 1.3 | `data/gyeongju-targeted-completion-v1` | `0d9ab8afe5acd398481c0826b793e50cfac48fa1` | [ ] |
| 1.4 | `data/seoul-targeted-completion-v1` | `a57e01c29296ce243e223a0ab70b9c0fd9cd3fd8` | [ ] |
| 1.5 | `data/jeju-targeted-completion-v1` | `b6539a96908a972705836067430223645473951f` | [ ] |
| 1.6 | `data/jeonju-targeted-completion-v1` | `b3645d711143234b79407529f1a9b15babe934c0` | [ ] |
| 1.7 | `data/multicity-common` | `bc8d5d4aaa904ffa710e3f1203e58787de3fa44e` | [ ] |
| 1.8 | `data/multicity-main-handoff-v1` | (push 후 확인) | [ ] |

**SHA 불일치 시**: `git ls-remote origin <branch>` 로 원격 SHA 재확인 후 기록.

---

## PHASE 2 — Artifact 파일 존재·크기 확인

각 branch를 checkout 후 artifact 파일 존재 및 크기를 확인한다. 내용 재검증 불필요.

### 2-A. Busan Food
```bash
git switch data/busan-food-discovery-v1
ls -lh data/tourapi/normalized/busan/busan-food-194-canonical-v1.json
```
| # | 점검 항목 | 결과 |
|---|---|---|
| 2.1 | `busan-food-194-canonical-v1.json` 파일 존재 | [ ] |
| 2.2 | 파일 크기 > 0 (0바이트 아님) | [ ] |

### 2-B. Busan NonFood
```bash
git switch data/busan-nonfood-complete-v1
ls -lh data/tourapi/normalized/busan/busan-nonfood-canonical-v1.json
```
| # | 점검 항목 | 결과 |
|---|---|---|
| 2.3 | `busan-nonfood-canonical-v1.json` 파일 존재 | [ ] |
| 2.4 | 파일 크기 > 0 | [ ] |

### 2-C. Gyeongju
```bash
git switch data/gyeongju-targeted-completion-v1
ls -lh data/gyeongju-final-release/gyeongju-canonical-places-v1.jsonl
```
| # | 점검 항목 | 결과 |
|---|---|---|
| 2.5 | `gyeongju-canonical-places-v1.jsonl` 파일 존재 | [ ] |
| 2.6 | 파일 크기 > 0 | [ ] |

### 2-D. Seoul
```bash
git switch data/seoul-targeted-completion-v1
ls -lh data/seoul-final-release/seoul-canonical-places-v1.jsonl
```
| # | 점검 항목 | 결과 |
|---|---|---|
| 2.7 | `seoul-canonical-places-v1.jsonl` 파일 존재 | [ ] |
| 2.8 | 파일 크기 > 0 | [ ] |

### 2-E. Jeju
```bash
git switch data/jeju-targeted-completion-v1
ls -lh data/jeju-final-release/jeju-canonical-places-v1.jsonl
```
| # | 점검 항목 | 결과 |
|---|---|---|
| 2.9 | `jeju-canonical-places-v1.jsonl` 파일 존재 | [ ] |
| 2.10 | 파일 크기 > 0 | [ ] |

### 2-F. Jeonju
```bash
git switch data/jeonju-targeted-completion-v1
ls -lh data/jeonju-raw-collection-v1/jeonju-final-service-catalog-v1.json
```
| # | 점검 항목 | 결과 |
|---|---|---|
| 2.11 | `jeonju-final-service-catalog-v1.json` 파일 존재 | [ ] |
| 2.12 | 파일 크기 > 0 | [ ] |

---

## PHASE 3 — Record Count 빠른 확인

artifact에서 record 수를 빠르게 확인한다.  
정확한 수 불일치 시 보조컴퓨터에 구체적 수치와 함께 보고.

| # | 도시/카테고리 | 예상 count | 점검 명령 | 결과 |
|---|---|---|---|---|
| 3.1 | Busan Food | 194 | `jq '.canonical_entity_count' busan-food-194-canonical-v1.json` | [ ] |
| 3.2 | Busan NonFood (service) | 764 | `jq '.service_universe' busan-nonfood-canonical-v1.json` | [ ] |
| 3.3 | Busan NonFood (total_provenance) | 853 | `jq '.total' busan-nonfood-canonical-v1.json` | [ ] |
| 3.4 | Gyeongju (ACTIVE) | 299 | `wc -l gyeongju-canonical-places-v1.jsonl` ≒ 302 (ACTIVE 299 포함) | [ ] |
| 3.5 | Seoul | 1837 | `wc -l seoul-canonical-places-v1.jsonl` ≒ 1838 (provenance) | [ ] |
| 3.6 | Jeju (ACTIVE) | 1496 | `jq '.total' jeju-canonical-places-v1.jsonl` field 확인 | [ ] |
| 3.7 | Jeonju (ACTIVE_SERVICE) | 236 | `jq '.ACTIVE_SERVICE' jeonju-final-service-catalog-v1.json` | [ ] |

**수치 해석 주의**:
- `total_provenance` vs `service_universe`는 다른 값이며 둘 다 정상
- 853·423·302·1838 등은 provenance count (excluded 포함)
- 서비스 대상: 764·236·299·1837·1496·194가 각 도시 실제 사용 수

---

## PHASE 4 — Common Policy 확인

```bash
git switch data/multicity-common
ls docs/data-collection/
```

| # | 점검 항목 | 결과 |
|---|---|---|
| 4.1 | `multicity-place-eligibility-policy-v1.md` 존재 | [ ] |
| 4.2 | `multicity-phone-semantics-and-geometry-policy-v1.md` 존재 (RULE-A~M 포함) | [ ] |
| 4.3 | `multicity-place-accommodation-policy-v1.md` 존재 | [ ] |
| 4.4 | `multicity-event-freshness-policy-v1.md` 존재 | [ ] |
| 4.5 | `multicity-food-discovery-collection-policy-v1.md` 존재 | [ ] |
| 4.6 | `multicity-food-trusted-curation-policy-v1.md` 존재 | [ ] |
| 4.7 | `multicity-data-quality-guardrail-v1.md` 존재 | [ ] |
| 4.8 | HEAD = `bc8d5d4aaa904ffa710e3f1203e58787de3fa44e` | [ ] |

---

## PHASE 5 — Main Laptop Schema 매핑

메인 노트북의 city_spots schema와 각 artifact의 field 구조를 비교한다.  
이 단계는 보조컴퓨터가 아닌 메인 담당.

| # | 점검 항목 | 결과 |
|---|---|---|
| 5.1 | city_spots 테이블 스키마 확인 | [ ] |
| 5.2 | Busan Food: 필드 매핑 확인 (id·name·nav_coord·image_url·ai_eligibility) | [ ] |
| 5.3 | Busan NonFood: service_universe 764건 필드 매핑 확인 | [ ] |
| 5.4 | Gyeongju: 필드 매핑 확인 | [ ] |
| 5.5 | Seoul: ai_taxonomy 4분류 (auto/conditional/not_auto/hard_blocked) 매핑 확인 | [ ] |
| 5.6 | Jeju: bbox 확장 (33.0-34.0) 적용 여부 확인 | [ ] |
| 5.7 | Jeonju: image_gap 30건·phone_gap 70건 NICE_TO_HAVE (서비스 미차단) 확인 | [ ] |
| 5.8 | 5축 eligibility 필드 (SEARCHABLE/EXPLORE/AI_ITINERARY/USER_CAN_SELECT/USER_CAN_SAVE) 존재 확인 | [ ] |

**스키마 불일치 발견 시**: 구체적 필드명과 예상/실제 값을 기록. 보조컴퓨터에 해당 artifact의 해당 필드만 확인 요청.

---

## PHASE 6 — 이미 완료된 검증 재중복 방지 점검

아래 항목은 이미 완료됐으므로 재실행하지 않는다.

| # | 재실행 금지 항목 | 이미 완료된 단계 |
|---|---|---|
| 6.1 | Busan Food 194건 원천 재검증 | VBC JSONL + IMAGE-FINAL-CLOSURE-V3 (보조) |
| 6.2 | Gyeongju 좌표 복구 재실행 | VWorld 116건 복구 + 해안bbox 11건 (보조) |
| 6.3 | Seoul TV Gate 재적용 | V3 완료 (보조) |
| 6.4 | Jeju bbox outlier 재스캔 | RULE-M v7 완료 (보조) |
| 6.5 | 부산 Food/NonFood duplicate 재감사 | TWO-ARTIFACT 설계 확인됨 (보조) |
| 6.6 | 전체 도시 이미지 재검증 | 각 도시 close-state 문서에 완료 기록 |
| 6.7 | 853건 NonFood 서비스 대상 재확인 | 764 = 853 - 89(excluded) 정상 |
| 6.8 | 958 단일 파일 생성 | TWO-ARTIFACT 설계 정상. 생성 불필요 |

---

## PHASE 7 — 통합 진행

이 단계는 메인 노트북의 통합 작업. 보조컴퓨터 지침 없음.

| # | 항목 | 결과 |
|---|---|---|
| 7.1 | Import 순서 결정 (권장: gyeongju→jeonju→busan→jeju→seoul 순서, 소→대) | [ ] |
| 7.2 | Busan Food 194건 import | [ ] |
| 7.3 | Busan NonFood 764건 import (853 전체 아님) | [ ] |
| 7.4 | Busan 합산 확인 = 958 | [ ] |
| 7.5 | Gyeongju 299건 import | [ ] |
| 7.6 | Seoul 1,837건 import (AI 분류 4종 포함) | [ ] |
| 7.7 | Jeju 1,496건 import (ACTIVE만) | [ ] |
| 7.8 | Jeonju 236건 import (ACTIVE_SERVICE만) | [ ] |
| 7.9 | 전체 합산 확인 = 4,826 | [ ] |

**합산 기준**:

```
194 (Busan Food)
+ 764 (Busan NonFood)
+ 299 (Gyeongju)
+ 1,837 (Seoul)
+ 1,496 (Jeju)
+ 236 (Jeonju)
= 4,826
```

---

## PHASE 8 — QA 샘플링 (선택, 통합 후)

전체 재검증 아닌 샘플 spot check.

| # | 도시 | 샘플 장소 | 점검 항목 |
|---|---|---|---|
| 8.1 | Busan Food | 할매재첩국 | nav_coord, image_url, ai_auto=true |
| 8.2 | Busan NonFood | 반송공원 | COORD_GENUINE_EXCEPTION, nav=false |
| 8.3 | Gyeongju | 불국사 | nav_coord, ai_auto=true |
| 8.4 | Seoul | 경복궁 | nav_coord, ai_auto=true |
| 8.5 | Seoul | 비건레스토랑 샘플 | ai_conditional=true (SPECIALTY) |
| 8.6 | Seoul | 인천공항 정보센터 | ai_itinerary=false |
| 8.7 | Jeju | 추자도 장소 | bbox 33.0-34.0 내 위치 |
| 8.8 | Jeonju | 건지산 | nav_coord (lat=35.858634, lng=127.131975) |

---

## 보조컴퓨터 추가 요청 양식

통합 중 구체적 문제 발견 시 다음 형식으로 요청:

```
CITY:               [도시명]
TARGET_BRANCH:      [브랜치명]
TARGET_SHA:         [예상 SHA]
TARGET_ARTIFACT:    [파일 경로]
MAIN_CONTEXT:       [메인에서 어떤 작업 중인지]
MAIN_FOUND_ISSUE:   [발견한 구체적 문제]
EXPECTED:           [예상값/상태]
ACTUAL:             [실제값/상태]
NEEDED_CHECK:       [보조컴퓨터에서 확인해야 할 것]
DO_NOT_TOUCH:       [변경하면 안 되는 것]
```

**금지**: "부산 다시 검증해줘" 같은 broad 요청.
**허용**: "busan-nonfood-canonical-v1.json의 반송공원 레코드에서 coord_exception 필드값이 COORD_GENUINE_EXCEPTION인지 확인해줘."

---

## Checklist 완료 기준

| 조건 | 기준 |
|---|---|
| PHASE 0-4 전항목 OK | 기본 인수인계 완료 |
| PHASE 5 매핑 확인 완료 | 스키마 이해 완료 |
| PHASE 7 통합 완료 | 데이터 통합 완료 |
| grand_total = 4,826 | 숫자 검증 완료 |
| PHASE 6 전항목 미실행 확인 | 재중복 작업 없음 확인 |

---

> **This checklist is a one-time intake process. After all phases pass, the auxiliary computer's data collection work for these 5 cities is considered fully transferred.**
