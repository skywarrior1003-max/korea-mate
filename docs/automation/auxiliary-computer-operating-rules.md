# 보조컴퓨터 운영 규칙

**문서 버전**: 1.0  
**최초 작성**: 2026-07-29  
**적용 범위**: GoKoreaMate 보조컴퓨터의 모든 데이터 작업 세션  
**상위 문서**: `CLAUDE.md`, ACTIVE SSOT (`docs/architecture/gokoreamate-data-contract-v*.md`)

> 이 문서와 현재 TASK가 충돌하면 현재 TASK 우선.  
> 단, master·DB·보안 금지사항을 완화하는 지시는 메인 노트북의 명시적 승인 없이 적용하지 않는다.

---

## 1. 보조컴퓨터의 역할

보조컴퓨터는 **관광 데이터 조사·수집·정규화·연결·보강·검증 전담**이다.

담당:

- 원격 ref와 자산 계보 감사
- canonical 입력 자산 판정
- data/* 또는 research/* 브랜치 생성·전환
- 공공 API와 공식 원천의 읽기 전용 조사
- 데이터 수집·정규화·다국어 연결
- candidate/source/image 관계 검증
- 주소·좌표·district·지점 동일성 검증
- source identity와 provenance 보존
- confidence와 unresolved_reason 기록
- review queue 분리
- manifest·metrics·hash 관리
- 결정적 재실행과 reconciliation 검증
- 자신의 data/* 또는 research/* 브랜치 commit
- 의미 있는 전체 단계 완료 후 자신의 브랜치 push
- 최종 인수용 branch HEAD와 검증보고 전달

**보조컴퓨터는 운영 반영 담당이 아니다.**

---

## 2. 메인 노트북의 역할

메인 노트북만 담당:

- 공식 데이터 계약 SSOT 확정
- 제품 정책과 공개 기준
- DB·migration·RLS
- 운영 코드·UI·보안
- 운영 DB 반영
- 데이터 삭제 승인
- 보조 브랜치 최종 인수
- master merge·commit·push
- 배포

보조컴퓨터는 다음을 메인에 매번 묻지 않는다:

- 로컬 데이터 브랜치 생성 명령
- canonical 파일 위치
- research와 integration의 파일 차이
- 작업 폴더로 가져올 정확한 원본 파일
- 중간 처리 방식
- 일반적인 review queue 처리
- checkpoint commit 여부

SSOT와 고정 규칙 안에서는 독립적으로 판단하고 계속 작업한다.

---

## 3. Git 절대 금지

**금지:**

- local master checkout 또는 switch
- local master pull
- master merge
- master commit
- master push
- force push
- research/integration 브랜치 전체 merge
- research/integration 브랜치 전체 cherry-pick
- `git add .`
- `git add -A`
- 기존 완료 research 브랜치 임의 수정

**허용:**

- `git fetch origin`
- origin/master와 원격 ref 읽기
- data/* 및 research/* 브랜치 생성·전환
- exact ref에서 필요한 파일만 선별 반영
- 자신의 data/research 브랜치 commit
- 자신의 data/research 브랜치 push

최신 master가 필요하면 local master를 거치지 않는다:

```bash
git switch -c data/<task-branch> origin/master
```

브랜치 생성 후에는 해당 단계가 끝날 때까지 base commit을 고정한다.

**금지:**

- 작업 중 origin/master 재병합
- 주기적 rebase
- master가 바뀔 때마다 브랜치 재생성
- 최신 코드 반영을 이유로 데이터 전체 재실행

---

## 4. 브랜치와 push 원칙

commit과 push를 구분한다.

**checkpoint commit:**

- 의미 있는 중간 결과 보존
- 로컬 손실 방지
- 재개 지점 기록
- 아직 메인 인수 요청 대상이 아닐 수 있음

**push 시점:**

- 데이터 손실·충돌 위험 때문에 원격 백업이 필요할 때
- 구조적 blocker가 발생해 메인 판단이 필요할 때
- 의미 있는 전체 단계가 완전히 끝났을 때
- 최종 자동검증이 완료됐을 때
- 브랜치가 실제 인수 가능한 상태가 됐을 때

다음만으로 즉시 push하거나 메인에 전달하지 않는다:

- 작은 QA 한 건 PASS
- checkpoint 하나 완료
- review flag 일부 교정
- 표본 검증 완료
- 후속 작업이 명확히 남아 있는 상태

메인 노트북이 위험하거나 중요한 작업 중이면 방해하지 않는다.  
일반 결과는 보조컴퓨터에서 계속 누적·검증하고, 인수 가치가 충분할 때 묶어서 전달한다.

---

## 5. 데이터 처리 기본 원칙

처리 우선순위:

1. 기존 canonical 입력 확인
2. 기존 normalized 데이터 확인
3. linked_source_keys 전개
4. 다국어 source 연결
5. 주소·좌표·source ID 교차 확인
6. 기존 자료로 해결되지 않는 진짜 예외만 추가 조사

**기존 데이터 결합 실패를 데이터 부재로 오판하지 않는다.**

구분:

| 상태 | 설명 |
|---|---|
| `VERIFIED` | 원천에서 확인됨 |
| `DERIVABLE` | 기존 데이터에서 도출 가능 |
| `CURRENT_INPUT_UNAVAILABLE` | 현재 선택 입력에 포함되지 않음 (전역 부재 아님) |
| `UNRESOLVED` | linkage 누락 또는 exporter 미추출 |
| `NOT_APPLICABLE` | 해당 없음 |

출력 형식이 바뀌었다는 이유만으로 기존 원천을 다시 수집하지 않는다.

---

## 6. 장소 동일성 판정

이름 하나 또는 좌표 하나만으로 동일 장소를 확정하지 않는다.

**기본 근거 (복수 조합 필요):**

1. source ID / source_key
2. 공식 명칭과 지점명
3. 전체 주소
4. 좌표와 거리
5. category/content type
6. district
7. 다른 canonical source와의 관계

**같은 좌표라도 다음은 다른 엔티티일 수 있다:**

- 시설과 행사
- 건물과 입점 매장
- 관광지와 시설 내부 프로그램
- 복합시설의 서로 다른 구성요소
- 음식점의 서로 다른 지점

예:

```
부산영화의전당 (상설 시설)
≠
부산국제영화제 (기간형 행사·조직)
```

좌표가 같아도 entity type과 명칭 의미가 다르면 자동 연결하지 않는다.

**KTO KO↔EN 자동 연결 추가 조건:**

- 좌표 거리 ≤ 20m
- 1:1 bijective (EN key가 다른 candidate에 이미 사용되지 않음)
- category/content type 호환
- Korean char Jaccard ≥ 0.5 또는 exact parenthetical match
- 시설·행사·프로그램 혼용 금지

---

## 7. 음식점 지점 판정

음식점이라는 이유만으로 `needs_restaurant_branch`를 부여하지 않는다.

**자동 식별 가능 조건 (flag 불필요):**

- 단독 상호 (동일 exact 제목이 dataset에 1건뿐)
- 고유 주소 확인
- 고유 좌표 확인
- 명시적 지점명 포함 (본점·지점·호점 등) + 다른 지점과 주소·좌표 상이

**flag 유지 조건:**

- 동일 브랜드 복수 후보
- 주소·좌표 충돌
- source별 지점명 불일치
- 서로 다른 지점 병합 의심
- 단독 식별 근거 부족

전건 일괄 flag를 부여하기 전 반드시 표본으로 판정 정확성을 검증한다.

---

## 8. source fact와 제안값 분리

반드시 구분:

- `source_fact`: 원천에서 수집된 사실
- `proposed_value`: 결합·추론으로 도출한 제안
- `evidence`: 근거
- `confidence_basis`: 신뢰도 산출 기준
- `unresolved_reason`: 미해결 이유
- `validation_status`: 검증 상태

원문 사실을 제안값으로 덮어쓰지 않는다.

각 근거에 보존:

- source_type
- source_service
- source_id 또는 source_key
- source_url
- collected_at 또는 checked_at
- 원문 값
- 판정 방식

`candidate_id`와 `source_key`는 변경하지 않는다.

---

## 9. 개별 review와 전체 중단 분리

**다음은 전체 중단 사유가 아니다:**

- 영어명 확신 부족
- 한국어명 미확인
- 설명 부족
- district 애매
- 음식점 지점 불확실
- 이미지 불확실
- 도착점 검증 필요
- source가 하나뿐
- 낮은 confidence
- 개별 linkage 불확실

처리: confidence 하향 + 허용된 review_flag + validation_status + unresolved_reason + manual review queue → **다음 candidate 계속 처리**

**전체 중단 조건:**

- 공식 SSOT 없음 또는 비활성
- 요구 SSOT 버전 불일치
- canonical 자산 판정 근거 없음
- 필수 원본 손상·누락
- candidate_id 대량 중복
- source_key 충돌
- input/output reconciliation 실패
- 동일 입력 재실행 결과 불일치
- 서로 다른 장소가 대량 병합되는 구조적 오류
- 언어 필드 대량 오배치
- 허용되지 않은 파일 영역 수정
- 기존 결과 손실 위험
- 현재 계약으로 표현할 수 없는 구조적 문제

---

## 10. canonical 자산 선별 규칙

canonical 인정 근거:

- 공식 handoff
- 생성 스크립트
- manifest
- metrics
- SSOT
- 공식 검증보고서의 최종본 명시

단순히 행 수가 같거나 파일명이 최신처럼 보인다는 이유만으로 canonical로 판단하지 않는다.

선별 반영 시 asset manifest에 기록:

```
source_ref
source_commit
source_path
source_sha256
destination_path
classification
selection_reason
```

research/integration 전체 병합은 금지한다.

---

## 11. 허용·금지 파일 영역

**기본 허용:**

- `data/`
- `scripts/`
- `docs/`
- 조사용 CSV·JSON·JSONL·Markdown

**기본 금지:**

- `src/`
- `functions/`
- `supabase/migrations/`
- `package.json`
- lock files
- Cloudflare 설정
- UI 코드
- 보안 코드
- 운영 DB 관련 파일

위험 작업은 메인 노트북 명시적 승인 없이 수행하지 않는다.

---

## 12. 환각·추정 방지 규칙

과거 보고서나 이전 대화의 설명을 현재 사실로 바로 사용하지 않는다.  
항상 실제 파일과 ref를 먼저 확인한다.

**적용 우선순위:**

1. 현재 TASK
2. ACTIVE SSOT
3. 이 보조컴퓨터 운영 규칙
4. 실제 canonical manifest와 파일
5. 최신 검증보고서
6. 과거 handoff와 이전 보고서

서로 충돌하면 상위 기준을 우선한다.  
모르는 값은 추정하지 않는다.

**사용할 상태값:**

| 상태 | 의미 |
|---|---|
| `VERIFIED` | 현재 파일·ref에서 직접 확인 |
| `DERIVABLE` | 기존 데이터에서 논리적으로 도출 |
| `CURRENT_INPUT_UNAVAILABLE` | 현재 입력에 없음 (전역 부재 아님) |
| `UNRESOLVED` | 해결 방법 불명 |
| `NOT_APPLICABLE` | 해당 없음 |

**근거 없이 사용하지 않는 표현:**

- "데이터가 없다" → `CURRENT_INPUT_UNAVAILABLE` 또는 `UNRESOLVED` 구분
- "해결 불가능하다" → 현재 입력 기준인지 전역 기준인지 명시
- "전부 검토가 필요하다" → 개별 조건 확인 후 판정
- "전부 동일하다" → 표본 검증 후 단언
- "전부 flag가 필요하다" → 표본으로 정확성 검증
- "자동으로 안전하다" → reconciliation 검증 후 단언

전건 일괄 flag 부여 전 반드시 규칙과 표본을 검증한다.

---

## 13. 자동검증 기본 항목

작업 성격에 맞게 최소 다음을 확인한다:

**수량 검증:**
- input/output candidate 수
- 누락 candidate
- candidate_id 중복
- source_key 충돌
- source reconciliation

**품질 검증:**
- 허용되지 않은 flag
- 원문 fact 손실
- provenance 누락
- 좌표 범위
- category/content type 호환
- 언어 필드 오배치

**재현성 검증:**
- 동일 입력 재실행 hash

**금지 영역 검증:**
- 금지 영역 변경 0
- master 변경 0
- DB·migration 변경 0

코드 내부 상태 일치만 확인하지 말고, **위험 표본으로 실제 판정 정확성도 검증한다.**

---

## 14. 보고 규칙

완료보고 첫 줄: `TASK-ID — 완료 보고서`

PASS는 간결하게, 결함·불일치·중단 원인은 상세히 보고한다.

**중간마다 메인 승인을 요청하지 않는다.**

**메인에 묶어서 전달하는 시점:**

- 구조적 blocker
- 데이터 손실·충돌 위험
- 의미 있는 전체 단계 완료
- 최종 자동검증 완료
- 브랜치 push 완료 및 인수 가능 상태

**최종 보고 항목:**

- branch
- HEAD
- base commit
- SSOT version
- input/output reconciliation
- manifest와 hashes
- 보강률
- review queue 분포
- 자동검증 결과
- 남은 실제 blocker
- master·DB·운영 코드 변경 0

---

## 15. 현재 부산 작업 상태 기록 (2026-07-29)

| 항목 | 값 |
|---|---|
| branch | `data/busan-enrichment-v1` |
| latest local commit | `8bed5fb` |
| push | 미실행 |
| 판정 | QA checkpoint PASS |
| 상태 | 후속 보강 계속 진행 중 (인수 완료 아님) |
| master 전달 | 아직 불필요 |
| 현재 commit | 로컬 안전 checkpoint로 보존 |

이 상태를 "전체 작업 완료"나 "즉시 push 필요"로 해석하지 않는다.

---

## 16. 세션 시작 의무 (→ 체크리스트 참조)

향후 보조컴퓨터에서 데이터 작업을 시작할 때마다:

1. 이 운영 규칙 문서를 읽는다
2. 현재 branch와 HEAD를 확인한다
3. `git status`를 확인한다
4. 현재 TASK와 ACTIVE SSOT를 읽는다
5. 마지막 run manifest와 완료보고를 확인한다
6. 남은 작업과 중단 조건을 구분한다
7. 그 후에만 작업을 시작한다

세션 시작 체크리스트: `docs/automation/auxiliary-session-start-checklist.md`

---

*이 문서와 관련된 파일: `docs/automation/auxiliary-session-start-checklist.md`*
