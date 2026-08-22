# P9 VALIDATOR — Phase Instruction

**자동 실행 Phase. P8 PASS 즉시 orchestrator가 `validate-new-city-package-v1.py` 호출.**

## Phase 목표
G-01~G-15 Release Gate 자동 검사.  
exit code만으로 판정하지 않는다 — machine-readable JSON gate 결과를 파싱한다.

## 판정 로직
| Gate 결과 | Pipeline 조치 |
|----------|-------------|
| FAIL gate 존재 | P9 FAIL → pipeline HOLD, P11 차단 |
| EXTERNAL_CHECK_REQUIRED | P9 PASS + P10 IN_PROGRESS |
| WARN만 존재 | P9 PASS (blocking 아님) |
| 전부 PASS/NA/WARN | P9 PASS → P11 자동 진행 가능 |

## 수동 재실행 방법
```bash
python scripts/city-pipeline-v1.py validate <slug> \
  --manifest data/city-packages/<slug>/final-manifest-v1.json
```

## FAIL 시 처리
1. validator JSON output의 `errors[]` 확인
2. 해당 Phase checkpoint 수정
3. P8 재실행 (manifest 재생성): `advance <slug> --phase P8 --status NOT_STARTED`
4. P8 자동 재실행 후 P9 재실행

## PASS 기준 (pipeline 관점)
- FAIL gate = 0
- 또는 남은 항목이 모두 EXTERNAL_CHECK_REQUIRED / WARN
