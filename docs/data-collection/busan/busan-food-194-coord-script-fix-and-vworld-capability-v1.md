TASK-BUSAN-FOOD-194-COORD-SCRIPT-FIX-AND-VWORLD-CAPABILITY-V1 완료보고서

---

**작업일**: 2026-08-16  
**기반 커밋**: `3af52c3` (COORD-AI-REGRESSION-AUDIT-V1)  
**브랜치**: `data/busan-food-discovery-v1`  
**common HEAD**: `2476cac` (origin/data/multicity-common, 변경 없음)  
**canonical 변경**: 없음 (스크립트/문서만 추가)

---

## Secret Safety

| 항목 | 값 |
|------|----|
| `VWORLD_API_KEY_PRESENT` | **NO** |
| `ENV_LOCAL_IGNORED` | **YES** (`git check-ignore .env.local` ✓) |
| `ENV_LOCAL_TRACKED` | **NO** (git status에 미노출 ✓) |
| `SECRET_LEAK` | **0** |

`.env.local`에 `VWORLD_API_KEY` 없음 확인. 값 미노출. 추가 방법: `vworld.kr` 개발자 센터 → API 신청 (무료) → `.env.local`에 `VWORLD_API_KEY=<발급키>` 추가.

---

## Script Fix

### §A: 주소 비교 버그 수정

**원본 스크래치패드**: `count_and_coord_audit.py`  
**수정 위치**: `scripts/busan-food-coord-authority-audit-v1.py`

#### 버그 원인 (두 라인의 조합)

```python
# 기존 (buggy)
addr = addr.replace(' ', '').lower()          # 공백 전체 제거
if len(shorter) > 0 and shorter[:12] in longer:  # 12자 prefix만 비교
    return 'SAME'

# 결과: "달맞이길62번길 49" → "달맞이길62번길49"
#       "달맞이길 62번길 19" → "달맞이길62번길19"
# shorter[:12] = "달맞이길62번길49"[:12] = "달맞이길62번길" ← 12자 이내
# → "달맞이길62번길" in "달맞이길62번길19" → SAME (오탐)
```

#### 수정 함수

```python
# canonical address의 comma 이전 부분만 core로 사용
# (층/호 정보 제거, 건물번호 보존)
def canonical_core_in_api(canon_addr, api_addr):
    canon_core = canon_addr[:canon_addr.index(',')].strip()
    canon_norm = normalize_for_comparison(canon_core)
    api_norm   = normalize_for_comparison(api_addr)
    if api_norm.startswith(canon_norm): return True, 'prefix_match'
    if canon_norm in api_norm:          return True, 'substring_match'
    return False, f'MISMATCH: "{canon_norm}" NOT IN "{api_norm}"'
```

#### 유닛 테스트 결과 (7건)

| 케이스 | 예상 | 결과 |
|--------|------|------|
| G-00057: 달맞이길62번길 49 vs 19 | MISMATCH | ✓ MISMATCH |
| 달맞이길65번길 154 / 3층 append | TRUE_SAME | ✓ TRUE_SAME |
| 마린시티3로 37 / 호수 append | TRUE_SAME | ✓ TRUE_SAME |
| 금강로 418 / 2층 append | TRUE_SAME | ✓ TRUE_SAME |
| 중구 구덕로22번길 3 (non-greedy) | TRUE_SAME | ✓ TRUE_SAME |
| 마린시티2로 33 / 긴 빌딩명 append | TRUE_SAME | ✓ TRUE_SAME |
| 민락로33번길 17 / 202호 append | TRUE_SAME | ✓ TRUE_SAME |

**7/7 PASS ✓**

### §B: Stale blocker 버그 수정

**원본 스크래치패드**: `apply_coord_authority_v1.py`  
**수정 위치**: `scripts/busan-food-apply-coord-authority-v1.py`

```python
# 기존 (buggy)
block = [b for b in block if b != 'NAVIGATION_NOT_READY']

# 수정
_STALE_BLOCKERS = frozenset({
    'NAVIGATION_NOT_READY',   # 원래 변형
    'NAVIGATION_READY_NO',    # 스테일 변형 (기존 미처리)
})
block = [b for b in block if b not in _STALE_BLOCKERS]
```

`--apply` / `--check` 두 가지 모드 지원:
- `--check`: read-only, 현재 canonical의 스테일 블록 유무 검증
- `--apply <audit_results.json>`: 실제 canonical 수정 (FoodService 전체 파이프라인 재실행 시 사용)

### Address Normalization Code-Level Fixed

`ADDR_NORMALIZATION_CODE_LEVEL_FIXED = YES`  
(이전 PASS_WITH_WARN 사유 해소)

### Stale Blocker Code-Level Fixed

`STALE_BLOCKER_CODE_LEVEL_FIXED = YES`

### FALSE_SAME_ADDRESS_COUNT

`0` (101건 전수 감사 ✓)

### Regression 결과

| 항목 | Run 1 | Run 2 | 동일 여부 |
|------|-------|-------|---------|
| 감사 대상 | 101 | 101 | ✓ |
| TRUE_SAME | 101 | 101 | ✓ |
| FALSE_SAME | 0 | 0 | ✓ |
| REGRESSION_CHECKSUM | `ea029326c11760e3...` | `ea029326c11760e3...` | ✓ |
| ADDR_REGRESSION_VERDICT | PASS | PASS | ✓ |

### Stale Blocker Regression 결과

| 항목 | Run 1 | Run 2 |
|------|-------|-------|
| navigation_ready = True | 106 | 106 |
| ai_auto = True | 106 | 106 |
| STALE_BLOCKERS_FOUND | 0 ✓ | 0 ✓ |
| NAV_READY_WITHOUT_AI | 0 ✓ | 0 ✓ |
| STALE_BLOCKER_REGRESSION | PASS | PASS |

### Deterministic Checksum

`REGRESSION_CHECKSUM = ea029326c11760e394a24d981bdd52712fb9ec253425f314e7947e515c39378a`

Run 1 = Run 2 = 동일 ✓

---

## VWorld

| 항목 | 값 |
|------|----|
| `VWORLD_API_KEY_PRESENT` | NO |
| `GEOCODER_CAPABILITY` | NOT_TESTED (키 없음) |
| `SEARCH_API_CAPABILITY` | NOT_TESTED |
| `2D_DATA_API_CAPABILITY` | NOT_TESTED |
| Response structure 요약 | — |
| Key 노출 | 0 |

**VWorld 키 획득 절차**:
1. `https://www.vworld.kr` → 로그인 → 개발자 센터
2. API 신청 → OpenAPI 서비스 → 2D 지도/주소 검색
3. 발급 후 `.env.local`에 `VWORLD_API_KEY=<발급키>` 추가
4. 다음 태스크에서 `VWORLD_GEOCODER_CAPABILITY` probe 재실행

**대안 경로 (기존 키 사용 가능)**:
- `TOUR_API_KEY` / `KOR_TOUR_API_KEY` → KTO `detailCommon2` → `mapX`, `mapY` GPS 좌표
- KTO contentId가 확정된 부산 food 엔티티에 적용 가능
- 좌표 Recovery V1 태스크에서 이 경로를 0순위로 우선 사용 가능

---

## QA

| 항목 | 결과 |
|------|------|
| CANONICAL = 194 | ✓ |
| FALSE_SAME_ADDRESS_COUNT = 0 | ✓ |
| STALE_BLOCKERS_FOUND = 0 | ✓ |
| NAV_READY_WITHOUT_AI = 0 | ✓ |
| IMAGE_DATA_CHANGE = 0 | ✓ (canonical 미수정) |
| INVENTED_COORDINATE = 0 | ✓ |
| ENV_LOCAL_GIT_EXPOSURE = 0 | ✓ |
| SECRET_LEAK = 0 | ✓ |
| Common/다른도시/master/production 변경 = 0 | ✓ |
| deterministic checksum | ✓ |

---

## Final Decision

`BUSAN_FOOD_COORD_SCRIPT_FIX = PASS`

`VWORLD_READY_FOR_COORD_RECOVERY = NO`  
(키 없음 — `vworld.kr`에서 발급 후 `.env.local` 추가 필요)

다음 단계:

`SAFE_TO_START_BUSAN_FOOD_194_COORD_RECOVERY_V1 = YES`

단서: VWorld 경로 없음. Coord Recovery V1은 KTO `detailCommon2` → VisitBusan UC_SEQ 순으로 기존 키를 우선 사용하고, 공식 지오코더 경로(VWorld/Juso)는 VWorld 키 확보 후 병행.

---

**변경 파일 (이번 태스크)**:
- `scripts/busan-food-coord-authority-audit-v1.py` (신규)
- `scripts/busan-food-apply-coord-authority-v1.py` (신규)
- `docs/data-collection/busan/busan-food-194-coord-script-fix-and-vworld-capability-v1.md` (이 파일)

TASK-BUSAN-FOOD-194-COORD-SCRIPT-FIX-AND-VWORLD-CAPABILITY-V1 완료보고서  
작업을 완료했습니다.
