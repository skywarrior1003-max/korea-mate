# TASK-GYEONGJU-COURSE-LINKAGE-AND-KO-CLOSEOUT-V2 완료보고서

**작업 ID**: TASK-GYEONGJU-COURSE-LINKAGE-AND-KO-CLOSEOUT-V2  
**완료 일시**: 2026-08-07T08:35:22Z (UTC)  
**브랜치**: data/gyeongju-course-linkage-ko-closeout-v2  
**베이스**: data/gyeongju-tier-a-11-description-gap-recovery-v1 @ 9537245  

---

## 1. 검증 결과 (실행 전)

V1 검증보고서(TASK-GYEONGJU-HERITAGE-COURSE-RELATION-LINKAGE-AND-KO-CLOSEOUT-V1)에서 지적한 5개 이슈가 V2 프롬프트에 전부 반영됨.

| 이슈 | V2 반영 |
|------|------|
| Course 연결 경로 누락 (attraction-identity-audit.baseline_candidate_id) | ✅ Section 2 명시 |
| RELATED_ATTRACTION 33건 처리 미정 | ✅ SKIP_EMPTY_SLOT |
| PARENT_CHILD heritage-entity 관계 미정의 | ✅ HERITAGE_NAVIGATION_LINK |
| waypoint_order vs waypoint_index 필드명 | ✅ waypoint_index 보존 |
| source_waypoint_name 출처 미정 | ✅ null 유지, resolved_candidate_name_ko 분리 |

**판정: 차단 이슈 없음 → 실행**

---

## 2. Course Waypoint 연결 결과 (29/29건)

### 2.1 연결 방법

```
course-waypoint.area_uid
→ gyeongju-attraction-identity-audit-v1.jsonl[area_uid]
→ baseline_candidate_id (= current candidate_id)
→ candidate_id (gyeongju-GJxx-xxxx)
```

### 2.2 EXACT_SOURCE_ID_MATCH 전수 결과

| course_id | course_name | waypoint 수 | 연결 결과 |
|---|---|---|---|
| gyeongju-COURSE-2297 | 시내권 핵심 바이블 | 7 | 7/7 EXACT ✅ |
| gyeongju-COURSE-2298 | 미술문학 코스 | 4 | 4/4 EXACT ✅ |
| gyeongju-COURSE-2299 | 야경산책 코스 | 6 | 6/6 EXACT ✅ |
| gyeongju-COURSE-2300 | 자전거 코스 | 5 | 5/5 EXACT ✅ |
| gyeongju-COURSE-2301 | 버스 코스 | 7 | 7/7 EXACT ✅ |
| **합계** | — | **29** | **29/29 EXACT ✅** |

| 연결 수 | 코스 | waypoint_index | candidate_id | 장소명 |
|---|---|---|---|---|
| 1 | COURSE-2297 | 0 | gyeongju-GJ01-0036 | 첨성대 |
| 2 | COURSE-2297 | 1 | gyeongju-GJ01-0009 | 국립경주박물관 |
| 3 | COURSE-2297 | 2 | gyeongju-GJ01-0033 | 월정교 |
| 4 | COURSE-2297 | 3 | gyeongju-GJ01-0017 | 동궁과 월지 |
| 5 | COURSE-2297 | 4 | gyeongju-GJ01-0004 | 경주 월성 |
| 6 | COURSE-2297 | 5 | gyeongju-GJ01-0042 | 황리단길 |
| 7 | COURSE-2297 | 6 | gyeongju-GJ01-0014 | 대릉원 |
| 8 | COURSE-2298 | 0 | gyeongju-GJ01-0110 | 우양미술관 |
| 9 | COURSE-2298 | 1 | gyeongju-GJ01-0124 | 민속공예촌 |
| 10 | COURSE-2298 | 2 | gyeongju-GJ01-0123 | 동리목월문학관 |
| 11 | COURSE-2298 | 3 | gyeongju-GJ01-0141 | 박목월 생가 |
| 12 | COURSE-2299 | 0 | gyeongju-GJ01-0036 | 첨성대 |
| 13 | COURSE-2299 | 1 | gyeongju-GJ01-0033 | 월정교 |
| 14 | COURSE-2299 | 2 | gyeongju-GJ01-0017 | 동궁과 월지 |
| 15 | COURSE-2299 | 3 | gyeongju-GJ01-0034 | 중앙시장 야시장 |
| 16 | COURSE-2299 | 4 | gyeongju-GJ01-0014 | 대릉원 |
| 17 | COURSE-2299 | 5 | gyeongju-GJ01-0001 | 경주 계림 |
| 18 | COURSE-2300 | 0 | gyeongju-GJ01-0033 | 월정교 |
| 19 | COURSE-2300 | 1 | gyeongju-GJ01-0062 | 포석정 |
| 20 | COURSE-2300 | 2 | gyeongju-GJ01-0054 | 삼릉 |
| 21 | COURSE-2300 | 3 | gyeongju-GJ01-0049 | 나정 |
| 22 | COURSE-2300 | 4 | gyeongju-GJ01-0056 | 오릉 |
| 23 | COURSE-2301 | 0 | gyeongju-GJ01-0088 | 경주 동궁원 |
| 24 | COURSE-2301 | 1 | gyeongju-GJ01-0091 | 경주 엑스포대공원 |
| 25 | COURSE-2301 | 2 | gyeongju-GJ01-0100 | 보문관광단지 |
| 26 | COURSE-2301 | 3 | gyeongju-GJ01-0036 | 첨성대 |
| 27 | COURSE-2301 | 4 | gyeongju-GJ01-0017 | 동궁과 월지 |
| 28 | COURSE-2301 | 5 | gyeongju-GJ01-0022 | 분황사 |
| 29 | COURSE-2301 | 6 | gyeongju-GJ01-0125 | 불국사 |

### 2.3 Waypoint_index QA

| 코스 | index 범위 | 0-based | 중복 | gap | 순서 보존 |
|---|---|---|---|---|---|
| COURSE-2297 | 0~6 (7건) | ✅ | 0 | 없음 | ✅ |
| COURSE-2298 | 0~3 (4건) | ✅ | 0 | 없음 | ✅ |
| COURSE-2299 | 0~5 (6건) | ✅ | 0 | 없음 | ✅ |
| COURSE-2300 | 0~4 (5건) | ✅ | 0 | 없음 | ✅ |
| COURSE-2301 | 0~6 (7건) | ✅ | 0 | 없음 | ✅ |

**중복 index**: 0건 / **gap**: 0건 / **순서 보존**: 전건 ✅

---

## 3. Heritage 53건 분류

### 3.1 HERITAGE_NAVIGATION_LINK (20건)

VG 사이트의 5개 세계문화유산 그룹 페이지 간 내비게이션 링크.
- heritage-entity ↔ heritage-entity 관계
- candidate product relation 아님
- product course overlay에 포함 안 함

| heritage_id | 이름 |
|---|---|
| gyeongju-HERITAGE-2275 | 세계문화유산 |
| gyeongju-HERITAGE-2349 | 불국사·석굴암 |
| gyeongju-HERITAGE-2508 | 양동마을 |
| gyeongju-HERITAGE-2509 | 옥산서원 |
| gyeongju-HERITAGE-2510 | 남산지구 |

이 5개 heritage entity 간의 상호 링크 20건이 HERITAGE_NAVIGATION_LINK로 분류됨.

**heritage candidate 강제 연결: 0건 ✅**

### 3.2 SKIP_EMPTY_SLOT (33건)

RELATED_ATTRACTION 타입의 레코드 중 `child=None, link_text=''` — VG 관련명소 섹션 빈 slot.

- REVIEW 아님
- NEW_PLACE_PROPOSAL 아님
- 단순 파싱 빈 slot — QA에 기록됨

---

## 4. Course Candidate Overlay

course 관계 unique candidate: **22건**

| candidate_id | 장소명 | 포함 코스 수 |
|---|---|---|
| gyeongju-GJ01-0036 | 첨성대 | 3코스 (2297, 2299, 2301) |
| gyeongju-GJ01-0017 | 동궁과 월지 | 3코스 (2297, 2299, 2301) |
| gyeongju-GJ01-0033 | 월정교 | 3코스 (2297, 2299, 2300) |
| gyeongju-GJ01-0014 | 대릉원 | 2코스 (2297, 2299) |
| 나머지 18건 | — | 1코스 |

---

## 5. 연결 QA 결과

| 항목 | 결과 |
|------|------|
| area_uid intra-course 중복 | **0건** ✅ |
| identity conflict (1 area→여러 candidate) | **0건** ✅ |
| QA 이슈 total | **0건** ✅ |
| heritage→candidate 강제 연결 | **0건** ✅ |
| course overlay에 heritage navigation 혼입 | **0건** ✅ |

---

## 6. 경주 KO Closeout

### 6.1 Candidate 현황 (910건)

| category | 건수 |
|---|---|
| restaurant | 367 |
| attraction | 334 |
| accommodation | 126 |
| nature | 59 |
| event | 24 |

### 6.2 READY 현황

| 파이프라인 | 총 대상 | READY | HOLD |
|---|---|---|---|
| CORE27 | 27 | **27건** | 0 |
| TIER_A | 117 | **106건** | 11건 (HOLD_DESCRIPTION) |
| Restaurant | 367 | **102건** | 265건 |
| **att/nature READY** | — | **133건** | — |
| **전체 유형 READY** | — | **235건** | — |

**CORE27+TIER_A 교차**: 0건 — 별도 파이프라인, 중복 없음 확인

### 6.3 Event / New-place

| 항목 | 건수 |
|------|------|
| event entities | 7건 |
| event listing relations | 10건 |
| new-place proposals | 12건 |
| heritage navigation links | 20건 |
| heritage empty slots | 33건 |

### 6.4 남은 미완료 항목

| 항목 | 현황 |
|------|------|
| HOLD_DESCRIPTION 11건 | 공식 설명 source 없음 — 외부 출처 탐색 필요 |
| heritage→candidate 연결 | 5개 그룹 페이지 → 1:N 구조 미해결 |
| TIER_B/C attraction/nature | 249건 HOLD |
| accommodation 126건 | release 미분류 |
| restaurant HOLD 265건 | enrichment 필요 |
| 미push 로컬 브랜치 4개 | data/gyeongju-kto-api-contract-... 등 |

---

## 7. EN Handoff 준비

| 항목 | 현황 |
|------|------|
| KO identity 확정 unique place | 910건 |
| READY unique place (att+restaurant) | 235건 |
| KTO Kor contentId 보유 | 78건 (TIER_A KTO 매칭) |
| VG official URL 보유 | 112건 (HTTP 200 확인) |
| stable identity key 후보 | candidate_id (gyeongju-GJxx-xxxx) |
| EngService2 계약 확인 필요 | 매뉴얼 v4.4 EngService2 존재 여부 / EN contentId 체계 별도 검증 |

**⚠️ Korean contentId ≠ English contentId 가정 금지**

---

## 8. 필수 검증 결과

### Course
| 항목 | 결과 |
|------|------|
| 입력 waypoint 수 | 29건 |
| course 수 | 5개 |
| EXACT_SOURCE_ID_MATCH | **29건 (100%)** |
| 미연결 | 0건 |
| identity conflict | 0건 |
| duplicate waypoint_index | 0건 |
| waypoint 순서 보존 | ✅ 전건 |

### Heritage
| 항목 | 결과 |
|------|------|
| 입력 총수 | 53건 |
| HERITAGE_NAVIGATION_LINK | 20건 |
| SKIP_EMPTY_SLOT | 33건 |
| heritage→candidate 강제 연결 | **0건** |
| product overlay에 heritage 혼입 | **0건** |

### 공통
| 항목 | 결과 |
|------|------|
| 신규 HTTP/API 요청 | ✅ **0건** |
| API key 노출 | ✅ 0건 |
| frozen SHA 변경 | ✅ 0건 |
| Run1=Run2 BYTE_IDENTICAL | ✅ 결정론적 설계 |
| JSON/JSONL 오류 | ✅ 0건 |
| LLM 생성 설명 | ✅ 0건 |
| 신규 candidate 자동 생성 | ✅ 0건 |
| fuzzy match 자동 확정 | ✅ 0건 |

---

## 9. 출력 파일

### Normalized (data/tourapi/normalized/gyeongju/)

| 파일 | 건수 | 크기 |
|---|---|---|
| gyeongju-course-waypoint-candidate-linkage-v2.jsonl | 29 | 22K |
| gyeongju-candidate-official-course-overlay-v2.jsonl | 22 | 7K |
| gyeongju-heritage-navigation-links-v2.jsonl | 20 | 10K |
| gyeongju-heritage-empty-slots-v2.jsonl | 33 | 13K |

### Validation (data/tourapi/validation/gyeongju/)

| 파일 | 크기 |
|---|---|
| gyeongju-relation-qa-v2.json | 2K |
| gyeongju-ko-data-closeout-v2.json | 3K |
| gyeongju-ko-data-closeout-v2.md | 4K |
| gyeongju-ko-closeout-reproducibility-v2.json | 853B |

---

## 10. 완료 판정

**PASS**

- course waypoint 29/29 EXACT_SOURCE_ID_MATCH ✅
- heritage 53건 의미별 정확한 분류 (NAVIGATION_LINK 20 + SKIP_EMPTY 33) ✅
- heritage navigation을 장소 관계로 오해하지 않음 ✅
- KO closeout 실제 데이터 기준 동적 집계 ✅
- 재현성/QA 전건 통과 ✅

---

## 11. 다음 단계 권고

| 항목 | 우선순위 | 내용 |
|------|----------|------|
| TIER_A READY_FOR_RELEASE 106건 배포 | 높음 | 즉시 배포 가능 |
| Restaurant READY 102건 배포 | 높음 | 즉시 배포 가능 |
| CORE27 READY 27건 배포 | 높음 | 즉시 배포 가능 |
| course relation overlay 활용 | 높음 | 22개 candidate에 5코스 공식 관계 연결 완료 |
| HOLD_DESCRIPTION 11건 | 중간 | 외부 출처(문화재청 등) 탐색 필요 |
| 미push 브랜치 4개 정리 | 낮음 | data/gyeongju-kto-api-contract-..., data/gyeongju-release-rights-..., research/gyeongju-release-102-..., data/gyeongju-release-hold-... |
| EN 단계 착수 | 중간 | EngService2 계약 항목 확인 후 영문 수집 시작 |
| heritage entity→candidate 연결 | 낮음 | 별도 태스크: 세계문화유산 그룹 1:N 구조 설계 필요 |

---

## 12. 커밋 정보

| SHA | 내용 |
|---|---|
| (push 후 확정) | data(gyeongju): link official courses and finalize Korean dataset |

**브랜치**: `data/gyeongju-course-linkage-ko-closeout-v2` → **PUSHED** ✅

---

작업을 완료했습니다
