# 경주 최종 데이터 Handoff v2

> Branch: `data/gyeongju-final-security-relations-handoff-v1`
> Base: `ad6119f` (data/gyeongju-secure-content-final-gap-v1)
> 작성일: 2026-08-08

## 1. 경주 주요 데이터 최종 수치

| 항목 | 수량 |
|---|---|
| READY places | 302 (attraction 200, restaurant 102) |
| Official menu inventory | 132 sections, core 7/7 |
| Events | 87 (ACTIVE=4, UPCOMING=4, PAST=76, DATE_INCOMPLETE=3) |
| Official courses | 57 |
| Course stops | 132 |
| Experiences/leisure | 23 |
| Application/support programs | 6 |
| Official food list | 292 |
| Travel essential info | 54 |
| Tour program info | 133 |

## 2. AI Relation 최종 수치

| 관계 유형 | 수량 | Hard | Soft | Unresolved |
|---|---|---|---|---|
| Course stop → place | 132 | 95 | 11 | 26 |
| Event → place/area | 87 | 17 | 9 | 61 |
| Experience → place | 23 | 6 | 8 | 9 |
| Application | 6 | — | — | — |
| Food → restaurant | 102 | 102 | 0 | 0 |
| **Total** | **350** | **222** | **32** | **96** |

## 3. Unresolved FINAL 항목

- **Course stops MANUAL_REVIEW_FINAL**: 14건
  - 이유: 302 미포함 소규모 유산(굴불사지 별도 부속 유산, 용강동고분 등) + 숙박/시설(코스믹 리조트, 보문콜로세움) + 마을(거마장 마을)
  - 향후: 302 확장 시 자동 연결 가능; 이번 TASK 범위 아님

- **Event VENUE_NOT_IN_PLACE_SET**: 경주예술의전당 등 공연장 — place 302 미포함 시설; 이벤트 relation은 부여됨

## 4. Food Proposals 190 처리 상태

- 190건 = NEW_PLACE_PROPOSAL (302 미포함 음식점/카페 후보)
- 신규 place 승격 이번 TASK 범위 아님
- 부산 등 향후 도시 작업 시 동일 방식 적용
- 파일: `data/gyeongju-official-travel-content/gyeongju-official-food-final-relations-v1.jsonl`

## 5. Security Incident 및 처리

| 항목 | 내용 |
|---|---|
| 원인 | 경주시 공식 사이트 raw HTML에 제3자 Google API key 포함 |
| 우리 credential? | 아니오 |
| 발생 commit | c7bcfbe |
| Sanitizer 적용 | 3개 파일 redaction 완료 (ad6119f) |
| GitHub alert | **DISMISSED (Won't fix)** — 사람이 직접 UI 종료 |
| Close reason | Won't fix (우리 소유 아님; 공개 HTML 포함; sanitized) |
| Current secret candidates | 0 |
| Credential rotation | 불필요 (우리 key 아님) |
| History rewrite | 수행 안 함 (destructive history changes 금지) |
| Official video 정책 | LINK_ONLY_REFERENCE (URL + title만; playlist/binary 금지) |

## 6. 공통 규칙 위치

`docs/data-collection/common-city-collection-rules-v1.md`

§9-§15 추가 완료:
- §9 Travel Content Layer
- §10 보안 · Raw 저장 정책
- §11 공식 음식 목록 수집 정책
- §12 이벤트·코스·신청 정책
- §13 AI itinerary seed 정책
- §14 최종 체크리스트
- §15 다음 도시 적용 순서

## 7. 메인 노트북에서 가져올 파일

```
data/gyeongju-final-release/gyeongju-final-ready-302-v1.jsonl
data/gyeongju-official-travel-content/gyeongju-official-events-final-v1.jsonl
data/gyeongju-official-travel-content/gyeongju-official-courses-v2.jsonl
data/gyeongju-official-travel-content/gyeongju-official-course-place-links-final-v1.jsonl
data/gyeongju-official-travel-content/gyeongju-official-event-place-relations-v1.jsonl
data/gyeongju-official-travel-content/gyeongju-official-experience-place-relations-v1.jsonl
data/gyeongju-official-travel-content/gyeongju-official-food-final-relations-v1.jsonl
data/gyeongju-official-travel-content/gyeongju-official-ai-scheduler-graph-final-v1.jsonl
data/gyeongju-official-travel-content/gyeongju-official-final-qa-v1.json
```

## 8. DB/UI에 아직 직접 반영하지 말 것

- food proposals 190건 → place 승격 미완; DB insert 금지
- course stops MANUAL_REVIEW_FINAL → place 생성 금지
- application programs → eligibility 미확정 4건; AI itinerary 직접 사용 금지
- 모든 relation → soft/unresolved는 AI 가중치 낮게 처리 필요

## 9. 다음 단계

**NEXT_STEP = BUSAN_FINAL_GAP_AUDIT**

경주 신규 수집/검증 TASK 금지.
경주 데이터 변화 → maintenance/update pipeline으로 처리.

---

*파일 경로: `docs/data-collection/gyeongju-final-main-handoff-v2.md`*
*공통 규칙: `docs/data-collection/common-city-collection-rules-v1.md`*
