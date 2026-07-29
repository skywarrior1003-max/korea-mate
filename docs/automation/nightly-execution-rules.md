# 야간 자동화 상세 실행 규칙

> **적용 범위**: 야간·장기 자동화 스크립트 실행 (`scripts/`, `data/`, `docs/`)  
> Git 안전 규칙·전역 금지 항목은 `CLAUDE.md`를 우선 적용한다.

---

## 자율 진행

- 작업 도중 사용자에게 질문하지 않는다.
- 예외 항목을 포함한 예상하지 못한 항목은 아래 판단 순서에 따라 자율 처리하고, 처리 근거를 실행 로그 또는 최종 보고서에 기록한다.
  1. 기존 규칙으로 안전하게 판단 가능하면 계속 진행
  2. 해당 항목만 분리할 수 있으면 `manual_review` 또는 `blocked`로 기록하고 나머지 계속 진행
  3. 전체 결과의 정합성을 훼손할 가능성이 있으면 HARD STOP
- 불확실한 항목을 임의로 확정하지 않는다.
- 질문 대신 판단 근거와 보류 사유를 최종 보고서에 기록한다.

## 자동 허용 범위

- `scripts/`, `data/`, `docs/` 내부의 승인된 파일 읽기·생성·수정
- 데이터 검증 명령
- 승인된 수집 스크립트 실행
- 저장소 밖 전용 도구 폴더의 설치 및 사용
- 재시도는 단계별 최대 3회

## 보조 컴퓨터 전용 금지 범위

- 데이터 삭제 또는 기존 원본 덮어쓰기
- `scripts/`, `data/`, `docs/` 외부 경로 수정

## HARD STOP

다음 경우 질문하지 않고 안전하게 중단한다.

### 범용 조건

- 현재 브랜치 또는 작업 경로가 승인 범위와 다름
- 정본 행 수·고유키·상태 합계가 깨짐
- 기존 데이터가 대량 삭제 또는 덮어쓰기 될 가능성
- 비밀값 노출 가능성
- 금지 경로 변경 필요
- 외부 인증·결제·로그인이 필요
- 재시도 3회 후에도 핵심 단계 실패

### 야간 자동화 추가 조건

- API 인증 오류(401/403) 또는 API 키 만료
- 정본 행 구조 또는 컬럼 스키마 변경 감지
- contentId·asset_id 중복 삽입 시도
- 기존 raw/normalized 데이터 덮어쓰기 발생
- 허가된 도시·API 서비스·작업 범위 이탈

### HARD STOP 시 처리

- 기존 최종 파일을 보존한다.
- 가능한 중간 결과만 별도 저장한다.
- 처리 건수, 실패 건수, 중단 위치, 원인을 보고한다.
- commit·push하지 않는다.

## 개별 항목 실패 처리

- 단일 항목 실패(네트워크 오류, 파싱 실패 등)는 오류 목록에 기록하고 나머지 항목을 계속 처리한다.
- 누적 요청 20건 이상에서 실패율 10% 초과 시 HARD STOP.
- 동일 원인 3회 연속 실패는 즉시 HARD STOP.

## 체크포인트와 재개

- 페이지 순회 및 태스크 단위로 진행 상태를 저장한다.
- 중단 후 동일 명령으로 재실행 시 마지막 완료 지점부터 재개한다.
- 이미 처리된 항목은 재호출하지 않는다 (중복 방지).

## 디렉토리 구조

- `data/tourapi/raw/` : API 원본 응답
- `data/tourapi/normalized/` : 정규화된 데이터
- `data/tourapi/candidates/` : 매칭 후보
- `data/tourapi/reports/` : 실행 보고서·메트릭
- 오류·재시도 로그는 `callLog` CSV 또는 별도 오류 파일로 분리한다.

## 설정값 원칙

- 도시, API 종류, 언어는 하드코딩하지 않고 설정 파일(`tourapi-nightly-config.json`) 또는 CLI 인수로 주입한다.
- 공통 런타임(`tourapi-batch.mjs`)과 API 어댑터는 분리 상태를 유지한다.

## 자동화 범위 밖

- 운영 DB 반영, master 브랜치 변경, 배포 작업은 이 자동화의 범위 밖이다.

---

## 실행 전 Preflight 원칙

파이프라인 실행 전에 예상 API 호출 수·처리 건수·출력 경로·데이터 효익을 점검한다. 파이프라인 실행 중 Validation Gate 판정과 별개이며, 실행 시작 전 단계에서만 적용한다.

### Preflight 판정

| 판정 | 의미 | 처리 |
|------|------|------|
| PASS | 모든 항목 통과 | 파이프라인 실행 |
| PASS_WITH_WARNINGS | 허용된 경고 있음 | 경고 기록 후 실행 |
| REVISE_REQUIRED | 호출 수·기준·효익 미달 | 실행하지 않고 저비용 개선안 보고 |
| HARD_STOP | 데이터 손실·인증·경로 충돌 | 즉시 중단 |

`REVISE_REQUIRED`는 preflight 전용 판정이다. 실행 중 게이트의 `FAIL`(단계 중단, 이후 단계 금지)과 혼동하지 않는다.

### Preflight 점검 항목

**1. 예상 비용 산출**
실행 전에 예상 API 호출 수·처리 건수·출력 경로를 계산한다. 수치를 산출할 수 없거나 입력 모집단이 불명확하면 REVISE_REQUIRED.

**2. 기존 데이터 재사용 우선**
이미 수집·정규화된 데이터가 있으면 재수집하지 않는다. 재수집이 필요한 이유(데이터 만료, 스키마 변경 등)가 없으면 REVISE_REQUIRED.

**3. 대량 호출 전 표본 효익 확인**
전체 대상 건수가 클 경우 전수 수집 전에 복수 페이지·구간에서 표본을 확인해 효익을 검증한다. 표본 없이 전수 수집을 시작하면 REVISE_REQUIRED.

효익 판정 기준 (모두 확인):
- 기존 데이터에 없는 신규 식별자가 실제로 존재하는가
- 수집 대상이 해당 작업의 매칭 후보와 실제로 연결될 가능성이 있는가
- 무이미지·권리·접근 문제처럼 명확한 보완 필요 항목을 채울 수 있는가
- 기존 데이터 대비 추가 정보 가치가 있는가

위 기준 중 하나 이상이 입증되지 않으면 전수 수집하지 않고 REVISE_REQUIRED. 임의의 비율·건수 threshold를 기준으로 삼지 않는다.

**4. 표적 검색 범위 확인**
검색 대상이 명확하게 문제가 있는 소수 항목(무이미지, 접근 실패 등)에 한정되어야 한다. 후보 전체를 반복 호출하는 구조이면 REVISE_REQUIRED.

**5. 모집단·기준 파일·필터 단일성**
집계 기준이 되는 파일·컬럼·필터 조건이 하나로 특정되지 않으면 실행 금지. 기준 파일이 복수로 해석 가능하면 먼저 기준을 확정하고 보고서에 기록한다.

**6. 분류 기준 완전성**
자동 분류를 수행하려면 각 분류 조건과 threshold가 사전에 정의되어야 한다. 정의 없이 분류를 시작하면 REVISE_REQUIRED.

**7. Validation Gate 조건의 실현 가능성**
데이터 구조상 발생 불가능한 충돌 조건(예: 단방향 매핑 구조에서 동일 항목의 복수 자동 확정)을 Validation Gate로 사용하면 게이트가 항상 통과하거나 항상 실패하므로 REVISE_REQUIRED. 게이트 조건은 실제 데이터로 검증 가능해야 한다.

**8. 출력 경로 분리**
신규 실행의 출력 파일이 기존 수집·정규화 파일과 동일한 경로·파일명을 사용하면 HARD_STOP. 모든 신규 실행은 task 식별자가 포함된 고유 경로·파일명을 사용한다.

**9. 기존 파일 read-only**
기존 파일은 읽기 전용으로 취급한다. 덮어쓰기·삭제가 필요한 구조이면 HARD_STOP.

**10. 증분 필터 실효성 확인**
최신성 기준(modifiedtime 등) 증분 필터를 적용하기 전에 실제 반환 건수를 추정한다. 기존 데이터의 수정일이 오래되어 증분 필터로 실효적 결과를 얻을 수 없으면 전체 재동기화를 강행하지 않는다. baseline 메타데이터(마지막 수집 기준값, 저장 일시)만 기록하고 종료한다.

**11. 복합 판정 원칙**
호출 수·데이터 손실 위험·결정성·효익 중 하나라도 기준 미달이면 전체 preflight를 REVISE_REQUIRED로 판정한다. 부분 통과한 항목만으로 실행을 시작하지 않는다.

### REVISE_REQUIRED 보고 내용

- 미달 항목과 이유
- 축소된 API 호출 수·처리 범위를 포함한 저비용 개선안
- 명확해진 기준 파일과 수정된 출력 경로
- checkpoint는 변경하지 않는다.

---

## 다단계 파이프라인 원칙

수집→정규화→매칭→집계를 하나의 파이프라인으로 연결할 때 적용한다.

### 단계 정의

| 단계 | 입력 | 출력 |
|------|------|------|
| 수집 (collect) | API 파라미터 | `raw/` 페이지 파일 + checkpoint |
| 정규화 (normalize) | `raw/` 파일 | `normalized/` JSONL |
| 매칭 (match) | normalized JSONL + 후보 CSV | match CSV |
| 집계 (aggregate) | match CSV + 후보 CSV | place-summary CSV + metrics |

### Validation Gate 판정

각 단계 완료 후 게이트를 실행한다. 판정 결과에 따라 진행 여부를 결정한다.

| 판정 | 의미 | 처리 |
|------|------|------|
| PASS | 모든 검증 통과 | 다음 단계 진행 |
| PASS_WITH_WARNINGS | 경고 있으나 허용 범위 | 경고 기록 후 다음 단계 진행 |
| FAIL | 합계·중복·파싱·결정성 오류 | 현재 단계 중단, 이후 단계 실행 금지 |
| HARD_STOP | 데이터 손상·인증 오류·범위 이탈 | 즉시 전체 파이프라인 중단 |

### 단계별 필수 검증 항목

- **수집**: API totalCount = 수집 raw 합계 (±허용 오차), 중복 source_id 0건, raw 파일 읽기 가능
- **정규화**: raw 합계 ≥ normalized 합계 (중복 제거 반영), normalized 합계 > 0, 필수 컬럼 존재
- **매칭**: match CSV 행 수 = normalized 합계, confidence 값이 허용 목록(high/manual_review/no_match) 이내, 경로가 `data/tourapi/` 하위
- **집계**: auto_ready + manual_review + unresolved = 활성 후보 합계, 장소당 대표 사진 최대 1장, 결정성(동일 입력 → 동일 출력)

### 파이프라인 Checkpoint

- 파이프라인 실행마다 `data/tourapi/raw/{service}/{city}/pipeline-checkpoint.json` 에 단계별 판정을 기록한다.
- 구조: `{ "runDate": "...", "stages": { "collect": "PASS", "normalize": "PASS", "match": "FAIL", "aggregate": null } }`
- 각 단계 시작 전 checkpoint를 읽어 해당 단계가 이미 `PASS`이면 건너뛴다.
- `PASS_WITH_WARNINGS` 단계도 재실행 시 건너뜀 (경고는 보고서에 보존).
- `FAIL` 또는 `null` 단계부터 재개한다.

### 이전 단계 출력 사용 원칙

- 다음 단계는 반드시 **직전 단계가 PASS 또는 PASS_WITH_WARNINGS를 받은 파일만** 입력으로 사용한다.
- FAIL 판정을 받은 단계의 출력 파일은 이후 단계 입력으로 사용하지 않는다.
- 입력 파일 경로는 checkpoint에 기록된 경로와 일치하는지 확인 후 진행한다.

### 최종 보고

파이프라인 완료 보고서에는 단계별 판정과 전체 판정을 포함한다.

```
단계별: collect=PASS / normalize=PASS / match=PASS_WITH_WARNINGS / aggregate=FAIL
전체 판정: FAIL (aggregate 단계 중단)
재개 방법: 동일 명령 재실행 → aggregate 단계부터 재개
```

전체 판정 기준: 모든 단계 PASS → PASS / 경고 있으나 FAIL 없음 → PASS_WITH_WARNINGS / FAIL 1건 이상 → FAIL.

---

## 링크·최신성 검증 단계

수집 파이프라인 완료 후 적용한다. 정보 원천 URL과 사용자 안내 URL을 별도 필드로 관리하고, 직접 관리 주체 링크를 탐색하여 정보 최신성을 기록한다.

> 링크 상태(`link_status`)는 이미지 권리 상태(`rights_confirmed` 등)와 별개 필드다.

### 링크 필드

- `source_url`: 데이터를 수집한 원천 페이지 URL (파이프라인 수집 시 기록)
- `display_url`: 사용자에게 안내할 직접 관리 주체 URL
- `link_verified_at`: 직접 링크 확인일
- `link_status`: 아래 상태값 중 하나

### 링크 상태값

| 상태 | 의미 |
|------|------|
| `link_verified` | 직접 관리 링크 확인 완료, 최신 정보 일치 |
| `link_unverified` | 직접 관리 링크 탐색 실패. `display_url`에 보조 링크 사용 |
| `link_outdated` | 직접 관리 링크 확인, 정보 불일치(날짜·폐업·취소 등) 감지 |
| `verification_required` | 선정·인증 등 최신성 확인 불가. 현재 배지 표시 금지 |

### 카테고리별 검증 항목

| 카테고리 | 확인 항목 |
|---------|---------|
| 행사 | 날짜·시간·취소·종료 여부 |
| 음식점 | 폐업·이전 여부 |
| 관광지·공원 | 운영 중단·시설 변경 여부 |
| 선정·인증 정보 | 선정 유효 연도, 취소 여부 |

### 처리 원칙

- 직접 관리 링크가 없으면 `link_unverified`로 기록하고 수집 원천 링크를 보조로 사용한다.
- `link_outdated` 항목은 정보를 현재 정보로 자동 노출하지 않고 `manual_review` 대상으로 분리한다.
- `verification_required` 항목은 현재 배지·인증 표시 없이 과거 기록으로만 보존한다.

### Validation Gate 추가 (링크)

| 조건 | 판정 |
|------|------|
| `source_url`·`display_url` 필드 누락 | `FAIL` |
| `link_outdated` 항목을 최신 정보로 자동 노출 | `FAIL` |
| `verification_required` 항목을 현재 배지로 표시 | `REVISE_REQUIRED` |
| `link_verified_at` 누락 (link_verified 상태에서) | `PASS_WITH_WARNINGS` |

---

## 전체 도시 데이터 파이프라인 순서

수집 단계 이후를 포함한 전체 파이프라인 순서다.  
①~② 단계에는 위 규칙(다단계 파이프라인 원칙, Preflight 등)을 적용한다.  
⑥~⑪ 단계는 → `docs/automation/schema-independent-enrichment-rules.md` 를 읽고 실행한다.

```
① collection           → 공공 API·공식 원천 수집         [이 문서: 다단계 파이프라인 원칙]
② normalization        → raw → normalized JSONL           [이 문서: 다단계 파이프라인 원칙]
③ multilingual linkage → KO·EN·JA·ZhS·ZhT source 연결
④ candidate linkage    → 중복 제거, canonical candidate 구성
⑤ image and rights     → 이미지 수집·권리 분류·큐레이션   [image-curation-rules.md]
⑥ schema-independent enrichment                           [schema-independent-enrichment-rules.md]
⑦ identity and branch validation
⑧ district and arrival validation
⑨ review queue separation
⑩ deterministic validation
⑪ checkpoint and handoff
```

각 도시의 파이프라인 실행 전 `schema-independent-enrichment-rules.md`를 읽는다.  
도시별 좌표·유사도 임계값은 표본 검증 후 run manifest에 기록한다.
