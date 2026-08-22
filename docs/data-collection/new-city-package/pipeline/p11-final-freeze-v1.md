# P11 FINAL_FREEZE — Phase Instruction

**자동 실행 Phase. P9(+P10) 조건 충족 시 `freeze` command로 자동 처리.**

## Phase 목표
Validator blocking gate 전부 통과 확인 후 최종 freeze record 생성.

## 실행 조건 (모두 충족 필요)
- P9 status = PASS
- P10 status = PASS 또는 NOT_APPLICABLE
- validator_result.gates에 FAIL = 0
- external_checks 모두 resolved

## 자동 생성 파일
`data/city-packages/<slug>/final-freeze-record-v1.json`

내용:
- FINAL_FREEZE_READY: YES
- SAFE_FOR_MAIN_INTAKE: YES
- APPROVED_SHA
- frozen_at
- validator_summary

## Main Intake 방식
```
RECOMMENDED_MAIN_INTAKE = FINAL_ARTIFACT_INTAKE
WHOLE_BRANCH_MERGE      = HIGH_RISK (금지 권고)
CHERRY_PICK             = FORBIDDEN
```

## 실행 방법
```bash
python scripts/city-pipeline-v1.py freeze <slug>
```

## PASS 기준
- freeze record 생성 성공
- SAFE_FOR_MAIN_INTAKE = YES
- FINAL_FREEZE_READY = YES
