# P8 FINAL_MANIFEST — Phase Instruction

**자동 실행 Phase. P7 PASS 즉시 orchestrator가 자동 수행.**

## Phase 목표
P2~P7 checkpoints를 집계하여 machine-readable Final Manifest를 자동 생성한다.
사람이 숫자를 다시 직접 맞추는 절차를 두지 않는다.

## 자동 집계 항목
| 소스 Phase | 집계 대상 |
|-----------|---------|
| P2+P3+P4 | universe (sa/ex/rc/ep/rv/canonical), category_counts |
| P3+P2 | identity (canonical_id, source_key) |
| P5 | locale (ko/en/ja/zh-CN title/desc/gap) |
| P6 | data_readiness (coord/image/description_ko) |
| P7 | regional artifact 연결 |

## 생성 파일
`data/city-packages/<slug>/final-manifest-v1.json`

## arithmetic_valid 실패 시
P8 → HOLD (자동). `last_error`에 불일치 내용 기록.  
수동 checkpoint 재확인 후 `advance --phase P8 --status PASS --checkpoint <path>`로 재시도.

## PASS 기준
- arithmetic_valid = true
- approved_sha 기록
- 모든 artifact path 등록

## 생성 후 수동 보완 사항
- `universe.arithmetic_valid` 재확인
- `artifacts[]` 경로 실제 존재 여부
- `release.reproducibility` 기록
- `approved_sha` 최신 SHA로 업데이트
