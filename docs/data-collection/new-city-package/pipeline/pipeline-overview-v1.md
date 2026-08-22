# New City End-to-End Pipeline — 개요 v1

**신규 도시 전용. 기존 5도시(부산·경주·서울·제주·전주) 적용 금지.**  
Contract: `multicity-new-city-package-contract-v1.md` | Validator: `validate-new-city-package-v1.py`

---

## Pipeline 구조

```
P0 INIT → P1 SOURCE_CAPABILITY → P2 FOOD → P3 NONFOOD → P4 EVENT
         → P5 MULTILINGUAL → P6 MEDIA_NAV → P7 REGIONAL
         → P8 FINAL_MANIFEST (auto) → P9 VALIDATOR (auto)
         → [P10 EXTERNAL_CHECK] → P11 FINAL_FREEZE (auto)
```

각 Phase는 독립 checkpoint를 가지며 PASS하기 전 다음 Phase로 진행하지 않는다.

---

## CLI 빠른 참조

```bash
# 도시 패키지 초기화
python scripts/city-pipeline-v1.py init yeosu --name-ko "여수" --name-en "Yeosu"

# 현재 상태 확인
python scripts/city-pipeline-v1.py status yeosu

# 다음 해야 할 일 표시 (Phase instruction 출력)
python scripts/city-pipeline-v1.py next yeosu

# Phase 완료 보고 (checkpoint 포함 가능)
python scripts/city-pipeline-v1.py advance yeosu --phase P1 --status PASS \
    --checkpoint data/city-packages/yeosu/checkpoints/p1-checkpoint.json

# P8 이후 Validator 실행
python scripts/city-pipeline-v1.py validate yeosu --manifest data/city-packages/yeosu/final-manifest-v1.json

# External Check 해결
python scripts/city-pipeline-v1.py ext-resolve yeosu --gate G-04 --evidence "artifact verified, no mixing"

# Final Freeze
python scripts/city-pipeline-v1.py freeze yeosu
```

---

## Phase 의존관계

| Phase | 의존 | 자동 실행 |
|-------|------|---------|
| P0 INIT | — | ✅ (init 시 자동) |
| P1 SOURCE_CAPABILITY | P0 | ❌ |
| P2 FOOD | P1 | ❌ |
| P3 NONFOOD | P1 | ❌ |
| P4 EVENT | P1 | ❌ |
| P5 MULTILINGUAL | P2+P3+P4 | ❌ |
| P6 MEDIA_NAV | P2+P3+P4 | ❌ |
| P7 REGIONAL | P2+P3 | ❌ |
| P8 FINAL_MANIFEST | P5+P6+P7 | ✅ |
| P9 VALIDATOR | P8 | ✅ |
| P10 EXTERNAL_CHECK | P9 (조건부) | ❌ |
| P11 FINAL_FREEZE | P9+P10 | ✅ |

P4 Event, P7 Regional이 해당 없는 도시 → `NOT_APPLICABLE` 처리 가능.

---

## HOLD 조건

다음 경우에만 pipeline을 HOLD하고 사람에게 보고:
- API key/credential 필요
- official source 403/차단
- entity identity 모호
- arithmetic 불일치
- canonical duplicate unresolved
- Validator FAIL / External Check unresolved

---

## State 위치

```
data/city-packages/<slug>/
  city-package-state.json    ← 메인 state
  final-manifest-v1.json     ← P8 자동 생성
  final-freeze-record-v1.json← P11 자동 생성
  checkpoints/               ← Phase별 checkpoint
  artifacts/                 ← 실제 수집 결과
```

---

## Checkpoint 표준 구조 (P2/P3/P4용)

```json
{
  "_phase": "P2",
  "city_slug": "yeosu",
  "completed_at": "ISO8601",
  "universe": {
    "discovered_count": 0, "canonical_count": 0,
    "service_active_count": 0, "excluded_count": 0,
    "relation_context_count": 0, "expired_count": 0, "review_count": 0
  },
  "category_counts": {"attraction": 0, "restaurant": 0, "nature": 0, "shopping": 0},
  "identity": {
    "canonical_id_count": 0, "canonical_id_duplicate_count": 0,
    "source_key_coverage": 0, "source_key_duplicate_count": 0,
    "canonical_id": {"type": "source-derived", "source_id_available": "YES", "deterministic": "YES", "cross_run_stable": "YES"}
  }
}
```
