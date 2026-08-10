# 서울 Entity Relation 품질 감사 v1

| 항목 | 값 |
|---|---|
| TASK | TASK-SEOUL-NIGHT-OFFLINE-MULTILINGUAL-ENTITY-RELATION-QUALITY-AUDIT-V1 |
| 감사일 | 2026-08-10 |
| API 호출 | 0  (title/summary 오프라인 분석만) |
| 자동 병합·삭제 | 0 |

---

## A. Entity Relation Candidates (306건)

### Relation 유형별 분포

| Relation type | 건수 | 근거 |
|---|---|---|
| OCCURS_AT / HELD_AT | 255 | 행사 제목·요약에서 장소명 포함 감지 |
| ROUTE_WITHIN | 9 | 둘레길 관련 레코드 → 메인 코스 안내 연결 |
| ASSOCIATED_WITH | 37 | K-pop/할리우 키워드 보유 쇼핑·장소 레코드 |
| VIEW_EXPERIENCE_AT | 일부 | 야경 레코드 → 기반 장소 연결 |
| EXPERIENCE_AT | 일부 | 한강 활동 → 한강공원 연결 |
| PART_OF | 일부 | 시장 내 레스토랑 → 시장 연결 |

**AUTO_MERGE = 0** — 모든 relation은 후속 검증이 필요한 후보 상태.

---

## B. SOURCE_CONTENT_TYPE 재분류

### 재분류 전후 비교

| SCT | 재분류 전 | 재분류 후 | 변화 |
|---|---|---|---|
| PHYSICAL_PLACE | 대부분 | 감소 | 16건 이동 |
| ROUTE_COURSE | 0 | 1 | +1 |
| EDITORIAL_MULTI_ROUTE_CONTENT | 0 | 1 | +1 |
| PHYSICAL_PLACE_WITH_ROUTE_CONTENT | 0 | 9 | +9 |
| EDITORIAL_CONTENT | 0 | 일부 | 일부 |

```
SCT_RECLASSIFIED_COUNT = 16
ROUTE_COURSE_PRIOR_COUNT = 0
ROUTE_COURSE_AUDITED_COUNT = 1
ROUTE_RELATED_CONTENT_TOTAL = 11
```

**→ 서울 둘레길 코스 안내 = EDITORIAL_MULTI_ROUTE_CONTENT (KOP015873)**  
**→ 둘레길 관련 장소/산 레코드 중 9건 = PHYSICAL_PLACE_WITH_ROUTE_CONTENT**  
**→ ROUTE_COURSE = 0 선언은 유효하지 않음. 감사 후 1건 존재 확인.**

---

## C. 둘레길 구조

```
DULLEGIL_RECORD_COUNT = 4
SEOUL_DULLEGIL_21_COURSES_AS_INDEPENDENT_CIDS = NO
```

| CID | 제목 | 재분류 결과 |
|---|---|---|
| KOP015873 | 서울 둘레길 코스 안내 | EDITORIAL_MULTI_ROUTE_CONTENT |
| KOP9jn7zj | 남산 둘레길 | PHYSICAL_PLACE_WITH_ROUTE_CONTENT |
| KOP027296 | 망우산 사색의 길 | PHYSICAL_PLACE_WITH_ROUTE_CONTENT |
| 기타 | 둘레길 키워드 산/공원 | PHYSICAL_PLACE_WITH_ROUTE_CONTENT |

서울 둘레길 21개 코스는 개별 CID로 존재하지 않음.  
KOP015873 1건이 전체 코스 안내 콘텐츠를 담고 있으며 EDITORIAL 성격.

---

## D. 중복·Near-Duplicate 후보 (152건)

| 유형 | 건수 | 신뢰도 |
|---|---|---|
| EXACT_DUPLICATE_CANDIDATE | 14 | HIGH (정규화 제목 완전 일치 + 동일 카테고리) |
| NEAR_DUPLICATE_CANDIDATE | 80 | MEDIUM (제목 앞 12자 일치 + 동일 routing track) |
| SAME_PLACE_DIFFERENT_CONTENT | 58 | LOW (요약 앞 15자 일치 + 동일 카테고리) |

**AUTO_MERGE = 0 / AUTO_DELETE = 0**  
모든 후보는 사람 검토 후 결정. 자동 병합·삭제 전면 금지.

### 주의 사항

- EXACT_DUPLICATE 14쌍: 제목만 동일하고 다른 특성(좌표, 링크 등)을 가질 수 있어 별도 레코드가 정당한 경우 있음
- NEAR_DUPLICATE 80쌍: 지점 내 여러 콘텐츠(예: 같은 박물관의 상설·특별전시) 가능성 있음
- LOW confidence 58쌍: 오탐 가능성 높음 — 검토 우선순위 낮음

---

## E. 한강 / 청계천 / 북한산 구조

### 한강 공원 네트워크

```
한강 관련 record: 약 243건 (inventory routing gap에서 확인)
한강공원 entity relation 생성: EXPERIENCE_AT 다수
```

한강 관련 레코드는 nature 119건에 73건 포함(뚝섬·반포·잠원 등 공원 detail 확보).  
나머지는 한강 관련 음식점·카페·활동 콘텐츠.

**권고**: 한강공원 별 CID 기준 entity 그룹화 → 공원별 관련 콘텐츠 연결.

### 청계천

청계천 관련 레코드는 route-keyword 집합에 포함.  
물리적 장소(PHYSICAL_PLACE) + 산책로(PHYSICAL_PLACE_WITH_ROUTE_CONTENT) 혼재.

### 북한산

북한산 관련 레코드는 Nature 119건 내에 17건 포함 (Cu5u8d4 카테고리).  
등산로 데이터(거리·난이도)는 국립공원공단 source 보강 필요.

---

## QA 플래그

```
ENTITY_RELATION_CANDIDATE_COUNT = 306
EVENT_VENUE_RELATION_COUNT = 255
KPOP_RELATION_COUNT = 37
NATURE_ROUTE_RELATION_COUNT = 9
DUPLICATE_CANDIDATE_COUNT = 152
EXACT_DUPLICATE_COUNT = 14
NEAR_DUPLICATE_COUNT = 80
SCT_RECLASSIFIED_COUNT = 16
ROUTE_COURSE_AUDITED_COUNT = 1
DULLEGIL_RECORD_COUNT = 4
AUTO_MERGE = 0
AUTO_DELETE = 0
API_CALLS = 0
AUDIT_COMPLETE = YES
```
