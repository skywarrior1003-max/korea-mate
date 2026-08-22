# P10 EXTERNAL_CHECK — Phase Instruction

## Phase 목표
P9 Validator가 EXTERNAL_CHECK_REQUIRED로 표시한 항목만 수동 해결한다.
전체 재검증 금지. state에 기록된 gate만 처리.

## 조건부 Phase
- Validator에 EXTERNAL_CHECK_REQUIRED gate가 없으면 → `NOT_APPLICABLE`
- External check가 있으면 → `IN_PROGRESS` (자동 설정)

## 처리 방법

각 EXTERNAL_CHECK_REQUIRED gate별:

| Gate | 확인 방법 |
|------|---------|
| G-04 | `jq '[.[] | select(.service_status)] | group_by(.service_status)' canonical.jsonl` |
| G-05 | artifact 파일 경로 직접 존재 확인 |
| G-12 | `grep -r "raw/" data/<city>-final-release/` |
| G-14 | `git fetch origin && git diff HEAD origin/<branch>` |

확인 완료 후:
```bash
python scripts/city-pipeline-v1.py ext-resolve <slug> --gate G-04 \
  --evidence "검사 완료: SERVICE_ACTIVE/EXCLUDED 혼합 없음 확인"
```

## state 기록 항목
```json
{
  "gate": "G-XX",
  "reason": "validator 출력 상세",
  "resolved": true,
  "resolution_evidence": "확인 내용 요약",
  "resolved_at": "ISO8601"
}
```

## PASS 기준
- 모든 external_checks[].resolved = true
- 해결 후 validator 재실행 (orchestrator 자동 권고)

## Validator 재실행 (필수)
```bash
python scripts/city-pipeline-v1.py validate <slug> --manifest <path>
```
P10 PASS 후 validator 재실행 결과가 blocking gate 없음이어야 P11 진행 가능.
