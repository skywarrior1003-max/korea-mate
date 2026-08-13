# 제주 Active Branch State v2

| 항목 | 값 |
|---|---|
| 버전 | v2 |
| 작성일 | 2026-08-13 |
| 작성 TASK | TASK-MULTICITY-COMMON-ACTIVE-AND-JEJU-V2-BOOTSTRAP-V1 |

---

```
JEJU_ACTIVE_BRANCH = data/jeju-collection-v2

PREVIOUS_BRANCH        = data/jeju-collection-v1
PREVIOUS_BRANCH_STATUS = SUPERSEDED_PENDING_SAFE_DELETE

COMMON_POLICY_SSOT   = data/multicity-common
COMMON_POLICY_COMMIT = dc6f9be563983d369f400e4e8b0eea139f82da7c

COLLECTION_RULE =
  Every new collection, supplementation, correction,
  refresh, or re-audit must read the current approved
  data/multicity-common policy first.

COMMON_IMPROVEMENT_RULE =
  If Jeju work discovers a rule useful across cities,
  do not make Jeju the policy SSOT.
  Promote and validate the improvement through
  data/multicity-common.
```

---

## 기준점

| 항목 | 값 |
|---|---|
| origin/master | `a9014c6` |
| v2 base | `a9014c6` (master에서 직접 분기) |
| common HEAD | `dc6f9be` |
| v1 base | `7a71304` (Seoul HEAD — SUPERSEDED) |

## v1 → v2 변경 이유

`data/jeju-collection-v1`은 `data/seoul-collection-v1` HEAD에서 분기되어 서울 전용 44개 docs + 12개 scripts + 337개 data 파일을 상속했으나, 이는 의도한 구조가 아님.

`data/jeju-collection-v2`는 최신 master(`a9014c6`)에서 독립 분기하여 Seoul 계보를 포함하지 않음.

## v1 고유 자산 보존

| 파일 | 상태 | 보존 경로 |
|---|---|---|
| `jeju-source-state-audit-v1.md` | SUPERSEDED_HISTORICAL | `docs/data-collection/jeju/history/jeju-source-state-audit-v1.md` |

원본 commit: `0bc7f8a` (data/jeju-collection-v1)

## 다음 Task

```
NEXT_TASK = TASK-JEJU-REGIONAL-SOURCE-CAPABILITY-CHECK-V1
```
