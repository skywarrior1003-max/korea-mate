# Gyeongju Tourism Data — Independent QA Report v2

**Task:** TASK-GYEONGJU-DATA-INDEPENDENT-QA-V2  
**Branch:** research/gyeongju-independent-qa-v2  
**Base:** origin/data/gyeongju-enrichment-v1 @ 0742009  
**QA date:** 2026-08-04  

---

## 전체 판정

| 항목 | 판정 |
|---|---|
| **전체** | **CONDITIONAL_PASS** |
| **Next state** | **MERGE_READY_WITH_FIXES** |

---

## 섹션별 판정

| 섹션 | 판정 | 비고 |
|---|---|---|
| 1. Manifest 무결성 | **PASS** | 22파일 모두 존재, SHA 일치, JSONL 건수 일치 |
| 2. API 수집 완전성 | **PASS** | GJ-01~09, KTO 7종 모두 기준 일치 |
| 3. KTO type 25 | **DOCUMENTED_EXCLUSION** | 코드 주석 확인, DOCUMENTATION_DEFECT 병기 |
| 4. 비지트경주 | **NOT_COLLECTED** | 사이트 접근 가능, 구조 확인, V3 미수집 |
| 5. Raw→Candidate 재구성 | **PASS** | 910→907→831 모두 검증 |
| 6. 동일성 병합 | **PASS** | 69그룹 전수, WRONG_MERGE 0건 |
| 7. 필드 정확도 표본 | **CONDITIONAL_PASS** | 174건 표본, 6건 좌표 차이는 정상 enrichment |
| 8. 이벤트 24건 | **HOLD** | 전수 DATE_MISSING — detail 수집 필요 |
| 9. 이미지 supplementary | **CONDITIONAL_PASS** | 1,292건 raw 보존, 연결 작업 미완료 |
| 10. EngService2 | **MISSING_SOURCE** | 0건 재확인 |
| 11. 재현성 | **PARTIAL_REPRODUCIBILITY** | 스크립트 repo 미커밋 |
| 12. 금지사항 | **PASS** | 위반 없음 |

---

## 1. Manifest 무결성

- 추적 파일: 22건 전부 존재
- SHA-256: 전 파일 일치
- JSONL 건수: source_facts 907 ✓ / enriched_candidates 831 ✓ / reviewed_candidates 831 ✓
- raw 파일: 로컬 존재 (gitignore 제외, manifest에 SHA 보존)
- **D-08 (INFO):** manifest_sha256 필드가 기록하는 SHA는 해당 필드 추가 전 파일의 SHA. 자기 참조 해시의 구조적 한계. 다른 파일 SHA는 모두 정확.

---

## 2. API별 수집 완전성

| API | totalCount | raw 수집 | 판정 |
|---|---|---|---|
| GJ-01 관광지현황 | 159 | 159 | PASS |
| GJ-02 권역별관광지 | 0 | 0 | **CONFIRMED_EMPTY_SOURCE** |
| GJ-03 시내권이미지 | 680 | 680 | PASS (SUPPLEMENTARY) |
| GJ-04 보문권이미지 | 560 | 560 | PASS (SUPPLEMENTARY) |
| GJ-05 남산권이미지 | 52 | 52 | PASS (SUPPLEMENTARY) |
| GJ-06 야경정보 | 10 | 10 | PASS |
| GJ-07 전망포인트 | 10 | 10 | PASS |
| GJ-08 메뉴별음식점 | 111 | 111 | PASS |
| GJ-09 먹거리핫플레이스 | 61 | 61 | PASS |
| KTO type-12 관광지 | 143 | 143 | PASS |
| KTO type-14 문화시설 | 14 | 14 | PASS |
| KTO type-15 행사축제 | 24 | 24 | PASS |
| KTO type-28 레포츠 | 59 | 59 | PASS |
| KTO type-32 숙박 | 127 | 127 | PASS |
| KTO type-38 쇼핑 | 10 | 10 | PASS |
| KTO type-39 음식점 | 182 | 182 | PASS |
| KTO EngService2 | 0 | — | MISSING_SOURCE |

**GJ-02 상세:** getDstrctsTrrsrt 호출 결과 resultCode=00(NORMAL_SERVICE), totalCount=0. API 오류 아님. 데이터 미공개 또는 추가 파라미터(권역 코드) 필요. GJ-01이 관광지를 커버하므로 우선순위 낮음.

---

## 3. KTO type 25 검증

- 코드 주석 확인: `여행코스(25)는 단일 장소가 아니므로 제외`
- 근거: city_spots는 POI 단위 — 여행코스는 복수 POI 묶음으로 계약 범위 외
- **판정: DOCUMENTED_EXCLUSION**
- **D-01 (LOW):** collection_summary.json과 manifest에 제외 사유 미기재. 코드 주석에만 존재.

---

## 4. 비지트경주 공식 원천 상태

- **판정: NOT_COLLECTED**
- 사이트 접근: 가능 (visitgyeongju.or.kr)
- 언어 채널 5개: `/kr` (한), `/` (영), `/jp` (일), `/zh` (간체), `/tw` (번체)
- 식당 URL 패턴: `/kr/cuisine/search` → `/kr/cuisine/view/[hex_id]`
- 관광지 URL 패턴: `/kr/map/search` → `/kr/map/view/[hex_id]`
- **콘텐츠 ID:** hex 인코딩 문자열 — TourAPI contentId(숫자)와 직접 조인 불가
- 연결 방법: 업체명+주소 퍼지 매칭 필요

**식당 필터 구조 (다음 수집 시 candidate 속성으로 활용 가능):**

| 카테고리 | 값 |
|---|---|
| 음식종류 | 한식·중식·일식·양식·아시아음식·중동음식·뷔페식·카페·기타 |
| 권역 | 황리단길·경주시내권·보문관광단지·불국사권 |
| 분위기 | 로맨틱·캐주얼·아늑함·조용함·유행하는스타일·현대적·한국전통적·레트로 |
| 서비스 | 예약·주차·아침식사·유아의자·반려동물·휠체어석·개인룸·단체석·야외석 등 |
| 외국어/식단 | 영어서비스·외국어메뉴·할랄·채식·알레르기정보 |
| 결제 | 지역화폐·국제카드·알리페이 |

**V3에서 source_priority 완전 적용 미완료.** 비지트경주 수집 후 재평가 필요.

---

## 5. Raw → Candidate 수치 재구성

```
Raw primary 910건
  GJ 경주시 API:  351건  (GJ-01 159 + GJ-06 10 + GJ-07 10 + GJ-08 111 + GJ-09 61)
  KTO KorService2: 559건

  ↓ GJ-08 중복 UID 제거: -3건 (CON_UID 7496 4건 → 1건)

Source Facts: 907건
  검증: 907 + 3 = 910 ✓

  ↓ Identity merge: 69그룹, secondary 제거 -76건

Enriched Candidates: 831건
  검증: 831 + 76 = 907 ✓

  ↓ Review Queue

Reviewed Candidates: 831건
  review_required: 807건
  excluded:         24건 (HOLD_DATE_MISSING_EVENT)
```

**Image SUPPLEMENTARY (별도):** GJ-03/04/05 합계 1,292건. 독립 candidate 생성 없음.

---

## 6. 동일성 병합 전수검증

- 검증 대상: 69개 identity groups, 76개 secondary
- **CORRECT_MERGE: 69건 (100%)**
- **WRONG_MERGE: 0건**
- needs_identity 1건: gyeongju-GJ09-733 (이조한정식)
- **D-09 (INFO):** GJ08-733(고도벌한정식)과 GJ09-733(이조한정식)은 CON_UID=733 충돌이지만 이름·주소 다름 → SEPARATE_PLACE. needs_identity 플래그가 올바르게 설정됨. 경주시 API 원본 데이터의 CON_UID 충돌 (출처 품질 이슈).

**GJ-01 좌표 enrichment:** GJ-01 source_fact에서 lat=None이지만 KTO identity merge 후 candidate에 KTO 좌표가 채워지는 것은 정상 동작 (19건). source_fact 원본 보존됨.

---

## 7. 필드 정확도 표본검증

- 표본: 174건 (attraction 30 / restaurant 30 / accommodation 15 / nature 15 / event 24 / no_coord 30 / has_image 30)
- **PASS: 167건 (96%)**
- **FIELD_ISSUE: 6건** (GJ-01 기반 candidates의 좌표 차이 — identity merge에 의한 KTO 좌표 보강, 정상 동작)
- **NO_CANDIDATE: 1건** (secondary로 제거된 source_fact)

표본 정확도는 전체 정확성을 완전히 보장하지 않음.

---

## 8. 이벤트 24건 전수검증

| 상태 | 건수 |
|---|---|
| date_missing | 24건 |
| date_available | 0건 |
| HOLD_DATE_MISSING_EVENT | 24건 |

KTO areaBasedSyncList2는 eventstartdate/eventenddate 미포함. 모든 이벤트 날짜 미확인.

**D-02 (MEDIUM):** 24건 전원 날짜 미확인. 현재/예정/과거 여부 판정 불가. KTO detailCommon2 + detailIntro2 수집 필요.

---

## 9. 이미지 supplementary 1,292건

| API | raw | URL | 연결 가능(추정) | 미연결(추정) |
|---|---|---|---|---|
| GJ-03 시내권 | 680 | 676 | 128 | 552 |
| GJ-04 보문권 | 560 | 560 | 0 | 560 |
| GJ-05 남산권 | 52 | 52 | 28 | 24 |
| **합계** | **1,292** | **1,288** | **156** | **1,136** |

- 연결 추정치는 CON_TITLE 기반 단순 매칭, 공식 연결 ID 없음
- GJ-04는 CON_TITLE 필드 구조가 달라 제목 매칭 0건 (별도 연결 키 확인 필요)
- 이미지 권리 상태: 전체 RIGHTS_UNKNOWN
- **D-05 (LOW):** 이미지 이용 조건 미확인

---

## 10. EngService2

- 판정: **MISSING_SOURCE**
- areaCode=35, sigunguCode=2 → 0건 (기존 파일럿 + 이전 세션 확인)
- 자동 번역 생성 금지
- 비지트경주 영어 원천(visitgyeongju.or.kr/ )은 EngService2와 별개

---

## 11. 재현성

- 판정: **PARTIAL_REPRODUCIBILITY**
- 수집·정규화·검증 스크립트: scratchpad에만 존재, repo 미커밋
- raw SHA: manifest 기준 모두 일치
- source_facts 정렬: 결정적 (GJ01→GJ06→GJ07→GJ08→GJ09→KTO 순)
- **D-03 (LOW):** scripts/ 하위 커밋 후 완전 재현 가능

---

## 12. 금지사항 확인

- master checkout: 없음 ✓
- master push: 없음 ✓
- 원본 data branch 수정: 없음 ✓
- DB/migration/deploy: 없음 ✓
- src/functions/supabase 수정: 없음 ✓
- 인증키 노출: 없음 ✓
- `git add .` / `git add -A`: 없음 ✓
- 허용 경로 외 변경: 없음 ✓
- 기존 산출물 수정: 없음 ✓

---

## 결함 목록

| ID | 심각도 | 제목 | 영향 | 판정 |
|---|---|---|---|---|
| D-01 | LOW | KTO type 25 제외 사유 미문서화 | 0건 | DOCUMENTATION_DEFECT |
| D-02 | MEDIUM | 이벤트 24건 날짜 전무 | 24건 | HOLD |
| D-03 | LOW | 수집·정규화 스크립트 repo 미커밋 | 0건 | DOCUMENTATION_DEFECT |
| D-04 | MEDIUM | 비지트경주 미수집 | 831건 대상 | NOT_COLLECTED |
| D-05 | LOW | 이미지 권리 전체 RIGHTS_UNKNOWN | 530건 | DOCUMENTATION_DEFECT |
| D-06 | INFO | GJ-02 totalCount=0 | 0건 | CONFIRMED_EMPTY_SOURCE |
| D-08 | INFO | Manifest self-SHA 설계 한계 | 0건 | KNOWN_DESIGN_LIMITATION |
| D-09 | INFO | GJ09-733 CON_UID 충돌 (다른 장소) | 2건 | SEPARATE_PLACE |

**Merge 전 필수 수정:**
1. D-01: collection_summary 또는 manifest에 type 25 제외 사유 기록
2. D-02: KTO detail 수집 → 24건 이벤트 날짜 확인
3. D-03: 스크립트 scripts/ 하위 커밋

---

## Release 수량

| 상태 | 건수 |
|---|---|
| review_required (조건부 release 가능) | 807건 |
| excluded — HOLD_DATE_MISSING_EVENT | 24건 |
| **합계** | **831건** |

event 날짜 확인 후 24건 중 일부 추가 release 가능.

---

## QA 산출물

| 파일 | 위치 |
|---|---|
| API 완전성 | `data/tourapi/validation/gyeongju/qa/gyeongju-api-completeness-qa-v2.json` |
| 레코드 재구성 | `data/tourapi/validation/gyeongju/qa/gyeongju-record-reconciliation-qa-v2.json` |
| 동일성 감사 | `data/tourapi/validation/gyeongju/qa/gyeongju-identity-audit-qa-v2.jsonl` |
| 필드 표본 감사 | `data/tourapi/validation/gyeongju/qa/gyeongju-sample-accuracy-audit-qa-v2.jsonl` |
| 이벤트 감사 | `data/tourapi/validation/gyeongju/qa/gyeongju-event-audit-qa-v2.jsonl` |
| 이미지 감사 | `data/tourapi/validation/gyeongju/qa/gyeongju-image-audit-qa-v2.json` |
| 비지트경주 감사 | `data/tourapi/validation/gyeongju/qa/gyeongju-visitgyeongju-source-audit-v2.json` |
| 재현성 | `data/tourapi/validation/gyeongju/qa/gyeongju-reproducibility-qa-v2.json` |
| 결함 목록 | `data/tourapi/validation/gyeongju/qa/gyeongju-qa-defects-v2.jsonl` |
| QA 요약 | `data/tourapi/validation/gyeongju/qa/gyeongju-qa-summary-v2.json` |
| Manifest 무결성 | `data/tourapi/validation/gyeongju/qa/gyeongju-manifest-integrity-qa-v2.json` |

---

## TASK-GYEONGJU-DATA-INDEPENDENT-QA-V2 완료보고서

**전체 판정:** CONDITIONAL_PASS  
**Next state:** MERGE_READY_WITH_FIXES

**확인된 사실:**
- 수집 건수 모두 기준값 일치 (GJ-01~09, KTO 7종)
- raw→source_facts→enriched 수치 흐름 검증 완료 (910→907→831)
- 동일성 병합 69건 전수 CORRECT_MERGE, WRONG_MERGE 0건
- GJ-02 CONFIRMED_EMPTY_SOURCE (API 오류 아님)
- EngService2 MISSING_SOURCE 재확인
- 비지트경주 사이트 접근 가능, 5개 언어 채널, 풍부한 식당 필터 구조 확인

**Merge 전 필수 조치 3건:** type 25 문서화 / 이벤트 날짜 detail 수집 / 스크립트 커밋  
**Branch:** research/gyeongju-independent-qa-v2 → push 완료
