# TASK-DATA-BUSAN-REPEAT-AUTOMATION-01 — 검증 보고서

**날짜:** 2026-07-23
**태스크:** TASK-DATA-BUSAN-REPEAT-AUTOMATION-01
**상태:** REVIEW REQUIRED

---

## 판단 요약

실행 보류. BLOCKER-01(비교 필드 4개 미수집)이 해소되지 않으면 §2 변경 감지의 `ended_event` 분류 및 해당 필드 diff가 의미 없는 null→null 비교로 남습니다.

---

## BLOCKER-01 — 비교 필드 4개 미수집

태스크 §2에서 diff 비교 대상으로 지정한 10개 필드 중 4개가 현재 정규화 스키마에 존재하지 않습니다.

| 비교 필드 | 스키마 존재 | 비고 |
|---|---|---|
| title | O | |
| address | O | |
| latitude | O | |
| longitude | O | |
| **phone** | **X** | API 미반환 — Busan/KTO 양쪽 모두 |
| **opening_hours** | **X** | API 미반환 |
| **event_start_date** | **X** | API 미반환 |
| **event_end_date** | **X** | API 미반환 |
| image_url | O | |
| description | O | |

**현재 정규화 스키마 20개 필드:**
`source_provider, source_service, source_id, source_language, source_key,
title, title_normalized, address, district, latitude, longitude, description,
content_type_id, category, image_url, image_source, image_license,
modified_at, collected_at, source_verified`

**영향 범위:**

1. **null→null 비교 노이즈**: phone/opening_hours/event_start_date/event_end_date 4개 필드는 모든 레코드에서 null로 동일 → diff에서 항상 "unchanged"로 분류되거나, 코드가 undefined 비교 오류 발생
2. **ended_event 분류 불가**: 태스크가 `ended_event` 판별을 "event 날짜 필드 기반"으로 지시하는데, event_start_date/event_end_date 필드가 없으면 `missing_once`와 `ended_event`를 구분할 수 없음 → 전부 `missing_once`로 분류되어 ended_event 카테고리가 무의미해짐
3. **§3 synthetic test 영향**: "각 1건 이상 검증"에서 ended_event 시나리오 생성 자체가 불가능

---

## IMPROVEMENT-01 — 비교 필드 범위 조정 제안

현재 수집 가능한 6개 필드만으로 diff를 운영하면 즉시 구현 가능합니다.

| 필드 | 변경 감지 가치 |
|---|---|
| title | 명칭 변경, 오탈자 수정 |
| address | 주소 이동, 폐업 갱신 |
| latitude / longitude | 좌표 보정 |
| image_url | 대표 이미지 교체 |
| description | 설명문 업데이트 |

`ended_event` 분류는 phone/event 날짜 필드가 추후 수집에 추가될 때 별도 태스크로 확장 권장.

---

## IMPROVEMENT-02 — 스냅샷 저장 경로 미지정

태스크 §2: "최신 이전 normalized snapshot을 자동 탐색"

현재 태스크에서 스냅샷 저장 위치가 명시되지 않았습니다. 현재 산출물 구조와 정합성이 있는 경로 제안:

```
data/tourapi/snapshots/busan/YYYY-MM-DD/busan-batch-normalized.json
```

탐색 방식: `data/tourapi/snapshots/busan/` 하위 날짜 디렉터리를 정렬해 현재 날짜보다 이전인 최신 항목 선택.

이 경로가 확정되어야 §2 코드 구현과 .gitignore 처리 방향이 정해집니다.

---

## INFO-01 — .gitignore 현황 (누락 확인)

**위치:** `korea-mate/.gitignore`

| 필요 패턴 | 현재 상태 |
|---|---|
| `data/tourapi/raw/` | **누락** (COMMIT-PREP에서 기 식별) |
| `data/tourapi/normalized/busan/busan-batch-normalized.json` | **누락** |
| 스냅샷 경로 (`data/tourapi/snapshots/`) | **누락** (신규) |

.gitignore 업데이트 자체는 BLOCKER-01과 독립적으로 실행 가능합니다. 그러나 스냅샷 경로(IMPROVEMENT-02)가 확정되어야 추가할 패턴이 정해지므로, 일괄 업데이트가 효율적입니다.

---

## INFO-02 — 디스크 체크 구현 가능 여부

- Node.js 버전: **v24.15.0** (Node 19+이므로 `fs.statfs()` 사용 가능)
- 실행 환경: Windows 11 Pro

Windows에서 `fs.statfs()`가 동작하는지 검증이 필요합니다. 미지원 시 대안:
```js
import { execSync } from 'child_process';
const out = execSync('wmic logicaldisk where "DeviceID=\'C:\'" get FreeSpace').toString();
```
이 부분은 구현 시점에 테스트로 확인 가능하며, BLOCKER는 아닙니다.

---

## GPT에게 요청할 확인 사항

다음 두 가지를 확인받은 후 재제출 시 실행합니다.

1. **비교 필드 조정**: phone / opening_hours / event_start_date / event_end_date 4개 필드를 태스크에서 제외하고, 현재 수집 가능한 6개 필드(title, address, latitude, longitude, image_url, description)만으로 diff 운영 → `ended_event` 분류는 이 필드들 추가 이후로 연기

2. **스냅샷 저장 경로 확정**: 제안 경로 `data/tourapi/snapshots/busan/YYYY-MM-DD/busan-batch-normalized.json` 또는 다른 경로 지정

---

## 변경 없음 파일

이번 보고서 작성 외 파일 수정 없음.

| 항목 | 현재 값 |
|---|---|
| 정규화 레코드 | 3,952건 |
| high | 2,364건 |
| manual_review | 66건 |
| unlinked (insufficient_evidence) | 92건 |
| 재처리 검증 | PASS |

---

TASK-DATA-BUSAN-REPEAT-AUTOMATION-01 검증 완료 — BLOCKER-01 해소 및 경로 확정 후 재제출 요망.
