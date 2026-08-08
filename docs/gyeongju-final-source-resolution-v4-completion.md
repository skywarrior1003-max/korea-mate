# TASK-GYEONGJU-FINAL-SOURCE-RESOLUTION-KTO-CROSSWALK-V4 완료보고서

**작성일**: 2026-08-08  
**브랜치**: `data/gyeongju-final-source-resolution-v4`  
**베이스**: `data/gyeongju-overnight-release-batch-v1` @ `fed67de`  
**스크립트**: `scripts/gyeongju_final_source_resolution_v4.py`

---

## 1. 작업 목적

경주 관광 데이터 파이프라인 최종 소스 해소 배치:

1. **Phase 1** — HOLD 190건 소스 상태 심층 감사 (VG_PENDING / DUPLICATE / KTO_PARSEABLE / KTO_CACHE_MISS 분류)
2. **Phase 2** — 188건×623 KTO 전수 교차 대조 (직접 contentId + 이름 기반 매칭)
3. **Phase 3** — contentType 범위 감사 (KTO14·38 20건 IN_SCOPE/OOS/REVIEW)
4. **Phase 4** — 중복 감사 (TIER_A 26건 + 내부중복 4건)
5. **Phase 5** — KTO detailCommon2 수집 (74건 CACHE_MISS + 2건 DESC_OK 재파싱)
6. **Phase 6** — VG 2건 HTTP 수집 (감포항·강동워터파크)
7. **Phase 7** — EN 97건 targeted 처리
8. **Phase 8** — Event 31건 targeted 처리
9. **Phase 9** — 최종 Release 분류 (190건)
10. **Phase 10** — Quality Metrics
11. **Phase 11** — Common Rules Docs 작성

---

## 2. 핵심 기술 결정 및 수정사항

### KTO tier-a 캐시 파싱 버그 수정
- tier-a-117-v1 캐시는 `d['item']` 직접 구조 (표준 `response.body.items.item` 아님)
- V1 스크립트가 18건을 HOLD_DESCRIPTION으로 오분류 → 수정 완료
- `parse_ko_detail()` 함수에 tier-a 간략 포맷 분기 추가

### BYTE_IDENTICAL 설계 (2가지 수정)
1. **Error sentinel 분류 일관성**: Phase 5 HTTP 실패 시 sentinel 파일(`_error: true`) 캐시에 기록.
   Phase 1에서 sentinel을 만났을 때 `KTO_DESCRIPTION_EMPTY`가 아닌 `KTO_CACHE_MISS`로 분류하여
   Run1/Run2 간 `kto_cache_miss` 목록이 동일하게 유지됨.
2. **network_mode 결정론화**: `NETWORK_ALLOWED` 플래그 대신 실제 `_http_counter["total"]` 기반으로
   `"USED"` / `"CACHE_ONLY"` 설정 → 양 run 동일 출력 보장.

### KTO API 수집 결과
- 74건 API 요청 → 전량 실패 (`apis.data.go.kr` 방화벽/네트워크 차단)
- Sentinel 파일 캐시 기록 → Run2에서 재현 가능 (BYTE_IDENTICAL 보장)
- 74건 전체 `data_source: "KTO_DETAIL_UNAVAILABLE"` 처리

### VG HTTP 수집 결과
- 감포항 (mnu_uid=2294, area_uid=160): HTTP 200, description len=44 ✓
- 강동워터파크 (mnu_uid=2291, area_uid=300): HTTP 200, description len=74 ✓

---

## 3. 실행 결과

### Run 1 (정식 Run, 캐시 우선)
- 실행 시간: 0.2초
- HTTP: total=0 VG=0 KTO=0
- QA: 17/17 PASS

### Run 2 (BYTE_IDENTICAL 검증, --network=0)
- HTTP: total=0 VG=0 KTO=0
- QA: 17/17 PASS
- **12/12 파일 SHA 전수 일치 → BYTE_IDENTICAL PASS** ✅

---

## 4. Phase별 결과 요약

### Phase 1 — 소스 상태 감사

| source_state | 건수 |
|---|---|
| KTO_DESCRIPTION_PARSEABLE | 2 |
| KTO_CACHE_MISS | 74 |
| VG_COLLECTION_PENDING | 2 |
| DUPLICATE_COVERED | 18 |
| KTO_NOT_IN_623 | 32 |
| NO_KTO_LINK | 62 |
| **합계** | **190** |

### Phase 2 — 188×623 KTO 교차대조

| crosswalk_match | 건수 |
|---|---|
| DIRECT_CONTENTID_MATCH | 92 |
| NAME_BASED_MATCH | 33 |
| CONTENTID_NOT_IN_623 | 32 |
| NO_KTO_MATCH | 31 |
| **합계** | **188** |

충돌: 3건 (복수 후보)

### Phase 3 — ContentType 범위 감사 (20건)

| 결정 | 건수 |
|---|---|
| OUT_OF_SCOPE | 4 |
| IN_SCOPE | 13 |
| REVIEW_REQUIRED | 3 |

### Phase 4 — 중복 감사 (30건)

| 유형 | 건수 |
|---|---|
| COVERED_BY_TIER_A_EQUIVALENT | 26 |
| BOTH_IN_HOLD_INTERNAL_DUPLICATE | 4 |

### Phase 5 — KTO Detail Snapshot

| data_source | 건수 |
|---|---|
| KTO_DETAIL_AVAILABLE | 2 |
| KTO_DETAIL_UNAVAILABLE | 74 |
| **합계** | **76** |

### Phase 9 — 최종 Release 분류 (190건)

| 분류 | 건수 |
|---|---|
| HOLD_DESCRIPTION | 157 |
| DUPLICATE_COVERED | 26 |
| OUT_OF_SCOPE | 3 |
| HOLD_IMAGE | 2 |
| READY_FOR_RELEASE | 2 |

---

## 5. 출력 파일 목록 및 SHA-256

**경로**: `data/tourapi/normalized/gyeongju/` (데이터 파일)

| 파일명 | SHA-256 (앞 16자) | Phase |
|---|---|---|
| gyeongju-final-source-state-audit-v4.jsonl | db3e93941f2e202b | 1 |
| gyeongju-kto-188-global-crosswalk-v4.jsonl | 7ebcaf279ccaada6 | 2 |
| gyeongju-kto-188-collision-audit-v4.jsonl | 44134f70853e2d71 | 2 |
| gyeongju-contenttype-scope-audit-v4.jsonl | 5918a77ce3407c4d | 3 |
| gyeongju-final-duplicate-audit-v4.jsonl | 23c2abf0cf45427d | 4 |
| gyeongju-final-kto-detail-snapshot-v4.jsonl | 3ca0f2d12f742083 | 5 |
| gyeongju-final-image-rights-overlay-v4.jsonl | c0ce498b70240e8d | 5 |
| gyeongju-final-vg-pending2-snapshot-v4.jsonl | 0c06f06968adaae7 | 6 |
| gyeongju-final-en-targeted-result-v4.jsonl | 0918c27c2df0e15f | 7 |
| gyeongju-final-event-targeted-result-v4.jsonl | 98e045089b42ddb6 | 8 |
| gyeongju-final-release-classification-v4.jsonl | 7f2dfc0394b6e4a5 | 9 |
| gyeongju-final-quality-metrics-v4.json | fcfe42d6615621b0 | 10 |

**Run1=Run2 BYTE_IDENTICAL: 12/12 파일 SHA 일치** ✅

**경로**: `data/tourapi/validation/gyeongju/` (검증 파일)

- `gyeongju-final-source-resolution-summary-v4.json`
- `gyeongju-final-source-resolution-qa-v4.json`
- `gyeongju-final-source-resolution-sha-v4.json`

**경로**: `docs/data-collection/` (방법론 문서)

- `common-city-collection-rules-v1.md` — 공통 도시 수집 규칙
- `gyeongju-collection-lessons-v1.md` — 경주 파이프라인 교훈
- `busan-gap-audit-application-v1.md` — 부산 적용 gap 분석

---

## 6. 안전 규칙 준수

- ✅ master checkout/merge/push 금지 — branch: `data/gyeongju-final-source-resolution-v4`
- ✅ force push 금지
- ✅ git add . / git add -A 금지 — 개별 파일 명시적 stage
- ✅ DB/migration/src/functions/package/lock 수정 없음
- ✅ frozen/raw 기존 파일 덮어쓰기 없음
- ✅ API key 출력/커밋 없음
- ✅ LLM 번역/설명 생성 없음 (캐시 데이터만 사용)
- ✅ coordinate/address 단독 자동확정 없음
- ✅ KTO contentType만으로 일괄 OUT_OF_SCOPE 처리 없음
- ✅ 수량 목표 억지 승격 없음 (157건 HOLD_DESCRIPTION 유지)
- ✅ BYTE_IDENTICAL (12 data files, Run1=Run2)

---

## 7. 남은 미완료 항목 (NEXT_STEP = FINAL_CLOSEOUT_HANDOFF_ONLY)

| 우선순위 | 항목 | 건수 |
|---|---|---|
| HIGH | HOLD_DESCRIPTION 157건 description 수집 | 157 |
| HIGH | KTO API 74건 description 재수집 (네트워크 허용 시) | 74 |
| MED | VG 감포항·강동워터파크 추가 확인 | 2 |
| MED | ContentType REVIEW_REQUIRED 3건 | 3 |
| LOW | 내부중복 4건 최종 처리 | 4 |

---

작업을 완료했습니다
