# P0 INIT — Phase Instruction

**자동 실행 Phase. 직접 수행 불필요.**  
`python scripts/city-pipeline-v1.py init <slug> --name-ko <> --name-en <>` 실행 시 자동 처리.

## Phase 목표
City package 디렉토리 및 state 파일 초기화.

## 자동 생성 항목
- `data/city-packages/<slug>/city-package-state.json`
- `data/city-packages/<slug>/checkpoints/`
- `data/city-packages/<slug>/artifacts/`

## PASS 기준
디렉토리 생성 및 state 초기화 성공.

## 다음 Phase
P1 SOURCE_CAPABILITY — `python scripts/city-pipeline-v1.py next <slug>`
