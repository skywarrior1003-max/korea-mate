# 서울 야간 품질 감사 완료보고서 v1

| 항목 | 값 |
|---|---|
| TASK | TASK-SEOUL-NIGHT-OFFLINE-MULTILINGUAL-ENTITY-RELATION-QUALITY-AUDIT-V1 |
| 완료일 | 2026-08-10 |
| 감사 방법 | 오프라인 전수 감사 (3,765건) |
| API 호출 | 0 |
| 자동 삭제·병합·제외 | 0 |
| QA 상태 | PASS |

---

## A. TASK 개요

3,765건 VisitSeoul 인벤토리 전수 오프라인 감사.  
목표: 다국어 링크 무결성 / SCT 분류 품질 / entity relation 후보 / 중복 후보 / blanket rule 탐지.  
입력 데이터 변경 없음. 출력은 모두 새 파일로만 생성.

---

## B. 입력 파일

| 파일 | 건수 |
|---|---|
| seoul-visitseoul-full-inventory-v1.jsonl | 3,765 |
| seoul-full-enrichment-routing-v1.jsonl | 3,765 |
| seoul-integrated-travel-value-detail-samples-v1.jsonl | 120 |
| seoul-visitseoul-detail-dryrun-v1.jsonl | 16 |

---

## C. 다국어 링크 감사 결과

```
EN_LINK    = 3,610 / 3,765 (95.9%)   MISSING_EN    = 155
JA_LINK    = 3,408 / 3,765 (90.5%)   MISSING_JA    = 357
ZH_CN_LINK = 3,395 / 3,765 (90.2%)   MISSING_ZH_CN = 370
ZH_TW_LINK = 3,386 / 3,765 (90.0%)   MISSING_ZH_TW = 379
KO_ONLY    = 110
HIGH_PRIORITY_LANGUAGE_GAP = 258
STRUCTURAL_ANOMALIES = 0
```

**결론**: 구조 이상 없음. High-value 레코드 258건에서 언어 gap 존재. KO-only 110건은 다국어 추천 제외 후보.

---

## D. SOURCE_CONTENT_TYPE 재감사

```
ROUTE_COURSE_PRIOR_COUNT        = 0   (기존 routing 결과)
ROUTE_COURSE_AUDITED_COUNT      = 1   (감사 후)
EDITORIAL_MULTI_ROUTE_COUNT     = 1
PHYSICAL_PLACE_WITH_ROUTE_COUNT = 9
DULLEGIL_RECORD_COUNT           = 4
SCT_RECLASSIFIED_COUNT          = 16
```

**핵심 발견**:
- KOP015873 "서울 둘레길 코스 안내" → EDITORIAL_MULTI_ROUTE_CONTENT (전체 코스 안내 성격)
- 서울 둘레길 21개 코스의 개별 CID는 존재하지 않음
- ROUTE_COURSE = 0 선언은 부정확 — 감사 후 1건 존재

---

## E. Entity Relation 후보

```
ENTITY_RELATION_CANDIDATE_COUNT = 306
  EVENT_VENUE_RELATION  = 255 (행사 → 개최 장소)
  KPOP_RELATION         = 37  (K-pop 쇼핑/장소 → Hallyu 연결)
  NATURE_ROUTE_RELATION = 9   (둘레길 → 메인 코스 안내)
  기타                  = 5

AUTO_MERGE = 0  (모든 관계는 검토 후 확정)
```

---

## F. 중복·Near-Duplicate 후보

```
DUPLICATE_CANDIDATE_COUNT = 152
  EXACT_DUPLICATE_CANDIDATE       = 14  (HIGH confidence)
  NEAR_DUPLICATE_CANDIDATE        = 80  (MEDIUM confidence)
  SAME_PLACE_DIFFERENT_CONTENT    = 58  (LOW confidence)

AUTO_MERGE  = 0
AUTO_DELETE = 0
```

---

## G. Blanket Rule 감사

```
BLANKET_RULE_DEFECT_COUNT = 2

BLANKET_01: Ck6n0w6 (주점) 전체 F → 28/60건 upgrade 필요 (IS_POLICY_VIOLATION = YES)
BLANKET_02: Cl2d2s1 (교육) 전체 H → 체험형 시설 A 상향 필요 (IS_POLICY_VIOLATION = YES)
```

routing script v2에서 수정 예정. 이번 task에서 자동 변경 없음.

---

## H. Review Queue

```
REVIEW_QUEUE_COUNT = 526
```

| 우선순위 그룹 | 유형 | 건수 |
|---|---|---|
| HIGH | 다국어 고우선 gap | 258 |
| HIGH | Blanket rule 정책 위반 | 2 |
| HIGH | Event↔Venue relation | 255 |
| HIGH | Duplicate HIGH confidence | 14 |
| MEDIUM | Bar/pub upgrade 후보 | 28 |
| MEDIUM | SCT 재분류 확인 | 16 |
| MEDIUM | H-routing 수동 결정 | 48 |
| MEDIUM | Duplicate MEDIUM | 80 |

---

## I. 출력 파일

| 파일 | 위치 | 건수 |
|---|---|---|
| seoul-multilingual-link-audit-v1.jsonl | data/seoul-source-audit/ | 3,765 |
| seoul-entity-relation-candidates-v1.jsonl | data/seoul-source-audit/ | 306 |
| seoul-duplicate-related-candidates-v1.jsonl | data/seoul-source-audit/ | 152 |
| seoul-night-quality-review-queue-v1.jsonl | data/seoul-source-audit/ | 526 |
| seoul-night-quality-audit-manifest-v1.json | data/seoul-source-audit/ | 1 |

| 문서 | 위치 |
|---|---|
| seoul-offline-multilingual-quality-summary-v1.md | docs/data-collection/seoul/ |
| seoul-entity-relation-quality-summary-v1.md | docs/data-collection/seoul/ |
| seoul-routing-blanket-rule-audit-v1.md | docs/data-collection/seoul/ |
| seoul-night-quality-audit-summary-v1.md | docs/data-collection/seoul/ |

---

## J. STOP 조건 확인

| 조건 | 상태 |
|---|---|
| API 호출 | 0 ✓ |
| 자동 병합 | 0 ✓ |
| 자동 삭제 | 0 ✓ |
| 자동 제외 | 0 ✓ |
| 원본 데이터 변경 | 없음 ✓ |
| 기존 routing 덮어쓰기 | 없음 ✓ |

---

## K. 다음 단계

```
RECOMMENDED_NEXT_TASK = TASK-SEOUL-PLACE-CORE-DETAIL-COLLECTION-V1

WHY = 194건 PLACE_CORE 미보유 detail → 단일 배치로 TV gate 전 판정 가능
      blanket rule 수정은 routing v2 script 작업으로 분리 진행
      bar/pub 28건 upgrade = routing v2에서 처리 (별도 collection task 불필요)

ROUTING_V2_REQUIRED = YES (BLANKET_01 + BLANKET_02 keyword exception 추가)
```

---

## QA 플래그

```
TASK_STATUS                       = COMPLETE
API_CALLS                         = 0
AUTO_MERGE                        = 0
AUTO_DELETE                       = 0
AUTO_EXCLUDE                      = 0
SOURCE_MUTATION                   = NO
MULTILINGUAL_STRUCTURAL_ANOMALIES = 0
ROUTE_COURSE_AUDITED_COUNT        = 1
BLANKET_RULE_DEFECT_COUNT         = 2
BAR_PUB_UPGRADE_CANDIDATE         = 28
REVIEW_QUEUE_COUNT                = 526
RECOMMENDED_NEXT_TASK             = TASK-SEOUL-PLACE-CORE-DETAIL-COLLECTION-V1
ROUTING_V2_REQUIRED               = YES
```
