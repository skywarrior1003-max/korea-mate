# 경주 KO 데이터 Closeout — 2026-08-07

**태스크**: TASK-GYEONGJU-COURSE-LINKAGE-AND-KO-CLOSEOUT-V2
**집계 기준**: committed 산출물 동적 읽기
**신규 HTTP 요청**: 0건

---

## A. Candidate 현황

| 항목 | 건수 |
|------|------|
| 전체 candidate | 910 |
| attraction | 334 |
| restaurant | 367 |
| accommodation | 126 |
| nature | 59 |
| event | 24 |

---

## B. READY 현황 (attraction/nature)

| 파이프라인 | 총 대상 | READY | HOLD | 비고 |
|---|---|---|---|---|
| CORE27 | 27건 | 27건 | 0건 | RELEASE_READY_OWNER_APPROVED_WEB_CONTENT |
| TIER_A | 117건 | 106건 | 11건 | HOLD_DESCRIPTION(설명 없음) |
| CORE27+TIER_A 교차 | — | — | — | 0건 (별도 파이프라인, 비교 보류) |
| **유니크 att/nature READY** | — | **133건** | — | 중복 제거 완료 |

---

## C. Restaurant 현황

| 항목 | 건수 |
|------|------|
| restaurant 전체 | 910건 |
| **RELEASE_READY** | **102건** |
| HOLD | 808건 |

---

## D. 전체 READY 합계

| 분류 | 건수 |
|------|------|
| att/nature READY (CORE27+TIER_A 합산) | 133건 |
| restaurant READY | 102건 |
| **총 READY (모든 유형)** | **235건** |

---

## E. Event / New-place Proposal

| 항목 | 건수 |
|------|------|
| event entities | 7건 |
| event listing relations | 10건 |
| new-place proposals | 12건 |

---

## F. Course Relation

| 항목 | 결과 |
|------|------|
| 공식 코스 수 | 5개 |
| waypoint 입력 | 29건 |
| EXACT_SOURCE_ID_MATCH | 29건 |
| 미연결 | 0건 |
| course에 연결된 unique candidate | 22건 |

### 코스별 waypoint

- **시내권 핵심 바이블** (gyeongju-COURSE-2297): 7개 waypoint
- **미술문학 코스** (gyeongju-COURSE-2298): 4개 waypoint
- **야경산책 코스** (gyeongju-COURSE-2299): 6개 waypoint
- **자전거 코스** (gyeongju-COURSE-2300): 5개 waypoint
- **버스 코스** (gyeongju-COURSE-2301): 7개 waypoint

---

## G. Heritage 분류

| 항목 | 건수 |
|------|------|
| 입력 total | 53건 |
| HERITAGE_NAVIGATION_LINK | 20건 |
| SKIP_EMPTY_SLOT | 33건 |
| candidate 강제 연결 | 0건 |
| product course overlay 혼입 | 0건 |

> NAVIGATION_LINK 20건: VG 사이트 세계문화유산/불국사·석굴암/양동마을/옥산서원/남산지구 그룹 간 내비게이션 구조.
> 장소 간 의미 관계가 아님. candidate product relation에 포함하지 않음.

---

## H. EN Handoff 준비

| 항목 | 현황 |
|------|------|
| KO identity 확정 unique place | 910건 |
| READY unique place | 235건 |
| KTO Kor contentId 보유 | 78건 |
| VG official URL 보유 | 5건 |
| stable identity key 후보 | candidate_id (gyeongju-GJxx-xxxx) |
| EngService2 계약 확인 필요 | EngService2 매뉴얼 v4.4 존재 여부 / EN contentId 체계 |

**⚠️ 주의**: Korean contentId = English contentId 가정 금지. EN 수집 시 별도 검증 필요.

---

## I. 남은 미완료 항목

1. HOLD_DESCRIPTION 11건 — VG/KTO 공식 설명 source 없음
2. Heritage entity→candidate 연결 — 세계문화유산 그룹 1:N 구조 해결 필요
3. TIER_B 15건 / TIER_C 234건 — attraction/nature HOLD 상태
4. accommodation 126건 — release 미분류
5. restaurant HOLD 265건 — enrichment 필요
6. 미push 로컬 브랜치 4개 정리
7. EN 단계 착수 전 EngService2 계약 확인

---

*집계 일시: 2026-08-07T08:35:22Z*
*신규 HTTP 요청: 0건 | LLM 생성 설명: 0건 | 결정론적 출력: TRUE*
