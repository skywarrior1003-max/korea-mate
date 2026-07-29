# Schema-Independent Enrichment 규칙

**문서 버전**: 1.0  
**최초 작성**: 2026-07-29  
**적용 범위**: GoKoreaMate 전체 도시의 schema-independent enrichment 단계  
**상위 문서**: `docs/automation/nightly-execution-rules.md`, `docs/automation/auxiliary-computer-operating-rules.md`  
**부산 검증 기준**: TASK-GOKOREAMATE-BUSAN-ENRICHMENT-V1-EXECUTE + QA-02 (commit `8bed5fb`)

> 이 규칙은 부산에서 검증된 절차를 도시 공통 기준으로 일반화한 것이다.  
> 도시별 임계값(좌표 거리, 제목 유사도 등)은 이 문서와 별도로 도시별 표본 검증 후 확정한다.

---

## 전체 도시 데이터 파이프라인 순서

```
① collection           → 공공 API·공식 원천 수집
② normalization        → raw → normalized JSONL
③ multilingual linkage → KO·EN·JA·ZhS·ZhT source 연결
④ candidate linkage    → 중복 제거, canonical candidate 구성
⑤ image and rights     → 이미지 수집·권리 분류·큐레이션
⑥ schema-independent enrichment  ← 이 문서 적용
⑦ identity and branch validation → 장소 동일성·지점 검증
⑧ district and arrival validation → district·arrival 검증
⑨ review queue separation → confidence별 큐 분리
⑩ deterministic validation → input/output reconciliation
⑪ checkpoint and handoff   → manifest·hash·인수 보고
```

①~② 단계: `nightly-execution-rules.md`의 다단계 파이프라인 원칙 적용  
⑥~⑪ 단계: 이 문서 적용  
③~⑤ 단계: 해당 전용 규칙 문서 적용 (image-curation-rules.md 등)

---

## A. 기존 데이터 우선 원칙

1. 기존 canonical 입력 먼저 확인한다
2. normalized 데이터를 먼저 사용한다
3. `linked_source_keys`를 전개하여 연결 가능한 source를 탐색한다
4. 다국어 source를 candidate별로 연결한다
5. 주소·좌표·source ID로 교차 확인한다
6. 위 단계로 해결되지 않는 진짜 예외에 대해서만 추가 조사를 수행한다

**출력 형식이 바뀌었다는 이유만으로 기존 원천을 재수집하지 않는다.**

---

## B. 데이터 상태 구분

기존 데이터 결합 실패를 데이터 부재로 오판하지 않는다.

| 상태 | 의미 |
|---|---|
| `VERIFIED` | 현재 파일·ref에서 직접 확인 |
| `DERIVABLE` | 기존 데이터에서 논리적으로 도출 가능 |
| `CURRENT_INPUT_UNAVAILABLE` | 현재 선택 입력에 없음 — 전역 부재 아님 |
| `UNRESOLVED` | linkage 누락 또는 exporter 미추출 |
| `NOT_APPLICABLE` | 해당 없음 |

다음을 반드시 구분한다:

- 원천에 실제 값이 없음
- 현재 선택 입력에 포함되지 않음 (`CURRENT_INPUT_UNAVAILABLE`)
- linkage가 누락됨 (`UNRESOLVED`)
- exporter가 값을 추출하지 못함 (`UNRESOLVED`)
- source identity가 불확실함 (`UNRESOLVED`)
- 실제 번역 또는 추가 조사가 필요함

---

## C. 실제 Normalized 구조 우선

- raw API 필드명을 가정하지 않는다 (예: `MAIN_TITLE`, `ITEMCNTNTS` 등)
- 실제 normalized 파일의 필드 구조를 파이프라인 시작 전에 확인한다
- source별 필드 차이는 adapter 또는 명시된 매핑으로 처리한다
- 존재하지 않는 필드를 추정하여 0건 처리하지 않는다

---

## D. 다국어 연결

- 공식 언어 원문을 번역값보다 우선한다
- KO·EN·JA·ZhS·ZhT를 candidate별로 연결한다
- 언어값 미출력을 곧바로 `needs_translation`으로 판단하지 않는다
- linkage 실패와 실제 번역 필요를 분리한다
- source fact와 proposed value를 분리한다
- provenance를 보존한다 (`source_key`, `source_language`, `collected_at`)

**`needs_translation` 적용 전 확인:**

1. EN source key가 batch_normalized에 존재하는가?
2. EN key 파생(`ko → en` suffix 변환)이 가능한가?
3. bijective KO↔EN 좌표 매칭이 존재하는가?

위 3가지 모두 실패한 경우에만 `needs_translation` 적용.

---

## E. 장소 동일성 판정

이름 하나 또는 좌표 하나만으로 자동 병합하지 않는다.

**복합 근거 필수:**

1. source ID / source_key
2. 공식 명칭·지점명
3. 전체 주소
4. 좌표와 거리 (임계값은 도시별 표본 검증)
5. category / content type
6. district
7. 다른 canonical source와의 관계

**같은 좌표라도 다른 엔티티일 수 있는 경우:**

- 시설과 행사 — 예: 부산영화의전당 ≠ 부산국제영화제
- 건물과 입점 매장
- 관광지와 시설 내부 프로그램
- 복합시설의 서로 다른 구성요소
- 음식점의 서로 다른 지점

**KTO KO↔EN 자동 연결 공통 최소 조건:**

- 상호 유일한 1:1 (bijective)
- category/content type 호환
- 주소·district 충돌 없음
- source 중복 연결 없음
- 시설·행사·프로그램 혼용 금지

**도시별 별도 검증 필요:**

- 좌표 거리 임계값 (부산 검증값: ≤ 20m — 다른 도시에 그대로 복사 금지)
- 제목 유사도 임계값 (부산 검증값: Korean char Jaccard ≥ 0.5 또는 exact — 다른 도시에 그대로 복사 금지)

→ 세부 규칙: `docs/automation/auxiliary-computer-operating-rules.md` 섹션 6

---

## F. 음식점 지점 판정

음식점 전체에 `needs_restaurant_branch`를 일괄 부여하지 않는다.

**자동 식별 가능 (flag 불필요):**

- 단독 상호 (dataset 내 동일 exact 제목 1건)
- 고유 주소 확인
- 고유 좌표 확인
- 명시적 지점명 포함 (본점·지점·호점 등) + 다른 지점과 주소·좌표 상이

**flag 유지 조건:**

- 동일 브랜드 복수 후보
- 주소·좌표 충돌 또는 거의 동일한 복수 후보
- source별 지점명 불일치
- 서로 다른 지점 병합 의심
- 단독 식별 근거 부족

표본 검증 없이 전건 일괄 처리하지 않는다.

---

## G. Hours 판정

- hours 필드 존재 여부뿐 아니라 값의 유효성을 확인한다
- 다음 값은 유효하지 않음: `'-'`, `'0'`, `'무'`, `'N/A'`, 길이 ≤ 3자 문자열, 빈 문자열
- category만으로 전건 flag를 부여하지 않는다
- nature 카테고리도 상시 개방 여부, 출입 통제 유무, 운영 시설 존재 여부를 근거로 개별 판정한다
- event schedule과 일반 opening hours를 분리한다

**hours reconciliation 필수 기록:**

```
IC.hours 비어 있지 않음 (raw):  N건
유효 판정 통과 (적용):          M건
필터 제거:                       N-M건 (사유별)
```

---

## H. Arrival 판정

- 일반 좌표와 실제 입구·정문·트레일 시작점을 구분한다
- 공식 매장·숙박·행사장 좌표가 충분한 경우 불필요한 flag를 부여하지 않는다

| 상태 | 조건 |
|---|---|
| `needs_arrival_verification` | 좌표가 있으나 최적 도착점 확인이 남아 있음 |
| `needs_arrival` | 좌표가 없거나 안전 안내 불가능한 경우 |

검증 완료 시 `verified` 상태를 기록한다.

---

## I. 외부 조사 조건

외부 검색은 **기존 canonical 데이터로 해결되지 않을 때만** 수행한다.

**허용 조건:**

- source 간 충돌
- 주소·좌표 충돌
- 지점 동일성 불확실
- 공식 설명이 실제로 부재
- 입구·트레일 시작점 부재
- 이미지가 실제 장소를 나타내는지 불명확
- 오래된 공공 원천과 현재 공식 정보 충돌

**원천 우선순위:** 공식 기관·공식 시설·공식 매장·공식 관광 원천  
**금지:** 광범위 일반 검색, 임의 블로그 근거

---

## J. 개별 Review와 전체 중단 분리

**다음은 전체 중단 사유가 아님:**

- 영어명 확신 부족
- 설명 부족
- district 애매
- 음식점 지점 불확실
- 이미지 불확실
- 도착점 검증 필요
- source가 하나뿐
- 낮은 confidence
- 개별 linkage 불확실

처리: `confidence 하향` + `review_flag` + `unresolved_reason` + manual review queue → **다음 candidate 계속**

**전체 중단 조건:**

- SSOT 없음 또는 비활성
- candidate_id 대량 중복
- source_key 충돌
- input/output reconciliation 실패
- 서로 다른 장소의 대량 병합
- 언어 필드 대량 오배치
- 허용되지 않은 파일 영역 수정
- 기존 결과 손실 위험

---

## K. 자동검증 항목

모든 enrichment 실행 후 최소 다음을 확인한다:

**수량 검증:**
- input/output candidate 수 일치
- candidate_id 중복 0
- source_key 충돌 0
- source reconciliation (KO hits + EN derivations = source_facts 합계)

**품질 검증:**
- 허용되지 않은 review_flag 0
- 원문 fact 손실 0
- provenance 누락 0
- 좌표 범위 (해당 도시 bounding box)
- category/content type 호환
- 언어 필드 오배치 0
- review flag 과다 일괄 적용 — 표본으로 정확성 검증

**재현성 검증:**
- 동일 입력 재실행 hash 일치

**금지 영역 검증:**
- 금지 영역 변경 0 (`src/` `functions/` `supabase/` 등)
- master 변경 0
- DB·migration 변경 0

코드 내부 상태 일치만 확인하지 않는다. **위험 표본으로 실제 판정 정확성을 검증한다.**

---

## 도시별 임계값 관리

부산에서 검증된 값을 다른 도시에 그대로 복사하지 않는다.

| 항목 | 부산 검증값 | 다른 도시 |
|---|---|---|
| KTO KO↔EN 좌표 임계값 | ≤ 20m | 도시별 표본 검증 후 확정 |
| KTO KO↔EN Jaccard 임계값 | ≥ 0.5 또는 exact | 도시별 표본 검증 후 확정 |
| 표본 게이트 최소 규모 | 20건 | 20~50건 권장 |

**도시별 임계값 표본 게이트 의무:**

- 전체 확대 적용 전 20~50건 대표 표본 검증
- 표본 실패 시 전체 확대 금지
- 도시별 임계값은 run manifest에 기록

---

## 다른 도시 적용

서울·제주·경주 등 신규 도시에서 동일 enrichment 규칙을 기본 적용한다.

도시별로 별도 설정이 필요한 항목:

- source 서비스 (AttractionService, FoodService 등)
- 필드 adapter
- district 코드표
- 좌표 임계값
- 제목 유사도 기준
- category mapping
- arrival 유형
- 공식 source 우선순위

**부산의 데이터·수치·source key를 다른 도시에 복사하지 않는다.**

---

*관련 문서: `docs/automation/nightly-execution-rules.md` · `docs/automation/auxiliary-computer-operating-rules.md`*
