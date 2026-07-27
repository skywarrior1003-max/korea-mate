# TASK-DATA-IMAGE-RIGHTS-RECLASSIFICATION-21H-REV2-COMMIT 검증 보고서

**검증일**: 2026-07-27
**판정**: REVISE_REQUIRED
**실행 여부**: 미실행 — 아래 결함 해소 후 재지시 필요

---

## 검증 요약

| 항목 | 판정 | 설명 |
|------|------|------|
| 브랜치 확인 | **PASS** | `research/tourapi-nightly-20260722` 확인됨 |
| 21H-REV2 파일 존재 | **PASS** | 4개 파일 모두 존재 |
| 출력 행 수 | **PASS** | rights 958행, status 1,642행 |
| 권리 상태 합계 | **PASS** | operational_assumed 958, blocked 0 |
| image_sufficient | **PASS** | 1,506건 |
| 공통 ARR만으로 blocked | **PASS** | 0건 (21I 검증 통과) |
| 작가명만으로 blocked | **PASS** | 0건 |
| category_inferred만으로 blocked | **PASS** | 0건 |
| 21F·21G 원본 파일 무변경 | **PASS** | SHA 확인됨 (아래) |
| 기존 산출물 덮어쓰기 없음 | **PASS** | 신규 파일명 사용 |
| 무관한 tracked 변경 파일 존재 | **FAIL** | CLAUDE.md, data/tourapi-nightly-config.json 수정됨 → 중단 조건 발동 |
| 재현성 검증 방법 명세 | **WARN** | 스크립트 경로·비교 방법 미명세 |

**전체 판정: REVISE_REQUIRED** (커밋 미실행)

---

## 결함 상세

### [결함 1] 무관한 tracked 파일 수정 — 중단 조건 발동 (FAIL)

프롬프트 조건: "21H-REV2와 무관한 변경 파일이 있으면 커밋하지 말고 보고 후 중단"

`git status --short` 결과에서 수정된 tracked 파일(` M`):

| 파일 | 변경 규모 | 21H-REV2 관련 여부 |
|------|-----------|-------------------|
| `CLAUDE.md` | 69줄 추가 (야간 작업 원칙 추가) | 무관 |
| `data/tourapi-nightly-config.json` | 1줄 변경 | 무관 |

두 파일 모두 21H-REV2 작업과 직접 관계없는 사전 수정 사항이다. 이 조건이 발동되므로 커밋을 실행하지 않는다.

---

### [결함 2] 중단 조건의 과도한 엄격성 — 개선 아이디어

이 결함은 **프롬프트 설계 개선 제안**이다. 실행을 막은 결함 1의 조건이 실제 위험보다 엄격하다.

**현행 조건**:
> "21H-REV2와 무관한 변경 파일이 있으면 커밋하지 말고 보고 후 중단"

**조건의 본래 의도**: 무관한 파일이 커밋에 포함되는 것을 방지.

**실제 상황**: 프롬프트는 이미 `git add .` / `git add -A` 금지 + 관련 파일만 명시적 stage를 요구한다. 이 규칙이 있으면, 수정된 tracked 파일(`CLAUDE.md`, `data/tourapi-nightly-config.json`)은 명시적으로 stage하지 않는 이상 커밋에 포함될 수 없다.

따라서 "무관한 파일이 존재한다"는 사실 자체는 위험이 아니다. 실제 위험은 "무관한 파일이 stage에 포함될 때"이다.

**개선 제안**: 중단 조건을 두 단계로 분리한다.

| 조건 | 처리 |
|------|------|
| 무관한 tracked 변경 파일이 stage에 포함됨 | 중단 (위험, 커밋 오염) |
| 무관한 tracked 변경 파일이 unstaged 상태로만 존재 | 보고 후 계속 (stage에서 제외된 채 커밋 가능) |

**수정 제안 문구**:
```
git status --short 전체 출력 확인.
21H-REV2와 무관한 변경 파일이 있으면 보고한다.
stage에 포함되지 않도록 명시적 file-by-file add를 사용하고,
stage 후 git diff --cached로 stage 내용을 최종 확인한다.
무관한 파일이 stage에 포함된 경우에만 중단한다.
```

---

### [결함 3] 재현성 검증 방법 미명세 (WARN)

프롬프트 조건: "동일 입력으로 재실행 시 결과 완전 동일"

문제점:
- 재실행에 사용할 스크립트 경로가 명세되지 않았다.
- 실제 스크립트는 세션 스크래치패드(`C:\Users\USER\AppData\Local\Temp\...`)에 있어 repo에 추적되지 않는다.
- "완전 동일" 판정 기준이 없다. (SHA 일치? 행 수 일치?)

이번 실행에서는 출력 파일 SHA를 아래에 기록한다. 재현성 검증 절차는 재실행 후 SHA 비교로 수행 가능하다.

**개선 제안**: 재현성 검증 절차를 명확화한다.
```
재현성 검증:
1. 동일 스크립트(경로 명시)를 재실행
2. 재실행 후 각 출력 파일의 SHA256을 계산
3. 기준 SHA(이 보고서에 기재)와 전체 일치 여부 확인
4. 불일치 시 FAIL — 커밋 금지
```

---

## 통과한 검증 항목 (참고용)

### 출력 파일 행 수 검증

| 파일 | 예상 | 실제 | 판정 |
|------|------|------|------|
| busan-visitbusan-rights-21h-rev2.csv | 958 | 958 | PASS |
| busan-image-status-21h-rev2.csv | 1,642 | 1,642 | PASS |

### 권리 상태 수치 검증

| 항목 | 예상 | 실제 | 판정 |
|------|------|------|------|
| 권리 상태 합계 | 958 | 958 | PASS |
| operational_assumed | 958 | 958 | PASS |
| blocked | 0 | 0 | PASS |
| image_sufficient | 1,506 | 1,506 | PASS |

### 안전 검증

| 조건 | 결과 | 판정 |
|------|------|------|
| 공통 ARR만으로 blocked | 0건 | PASS |
| rights_unknown 기반 blocked | 0건 | PASS |
| category_inferred만으로 blocked | 0건 | PASS |
| 기존 산출물 덮어쓰기 없음 | 신규 파일명 사용 확인 | PASS |

### 원본 파일 SHA (21F·21G 무변경 확인)

| 파일 | SHA256 (앞 16자) |
|------|----------------|
| busan-visitbusan-rights-21g.csv | `f84b5813f8f83cd6` |
| busan-image-status-21g.csv | `d90ec01a6cf62f75` |

### 21H-REV2 출력 파일 SHA (재현성 기준값)

| 파일 | SHA256 (앞 16자) |
|------|----------------|
| busan-visitbusan-rights-21h-rev2.csv | `3ddce2b4dd36dba7` |
| busan-image-status-21h-rev2.csv | `9eb746b4b0226d59` |
| busan-image-rights-metrics-21h-rev2.json | `9f7d449a4eae23b9` |

---

## 커밋 미실행 이유

1. **결함 1 (중단 조건 발동)**: CLAUDE.md +69줄, data/tourapi-nightly-config.json 1줄 수정 — 21H-REV2와 무관한 tracked 파일 변경이 존재하므로 현행 프롬프트 조건에 따라 중단.
2. **결함 2 (개선 아이디어)**: 중단 조건이 실제 위험보다 엄격하여 필요 없는 중단이 발생함 — 조건 수정 후 재실행 가능.

---

## 실행 가능 조건

다음 중 하나가 충족되면 즉시 실행 가능하다:

- [ ] **방안 A**: CLAUDE.md와 data/tourapi-nightly-config.json을 별도 커밋으로 먼저 처리하거나 stash한 뒤 21H-REV2 커밋 재지시
- [ ] **방안 B**: 프롬프트 중단 조건을 "무관한 파일이 stage에 포함될 때만 중단"으로 수정 후 재지시 (결함 2의 개선 적용)

방안 B가 더 합리적이며 향후 같은 상황에서 불필요한 중단을 방지한다.

---

*TASK-DATA-IMAGE-RIGHTS-RECLASSIFICATION-21H-REV2-COMMIT 검증 완료 — 결함 해소 후 재지시 필요.*
