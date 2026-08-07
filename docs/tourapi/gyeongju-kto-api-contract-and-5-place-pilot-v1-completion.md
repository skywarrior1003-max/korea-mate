# TASK-GYEONGJU-KTO-API-CONTRACT-AND-5-PLACE-PILOT-V1 완료 보고서

> 작성일: 2026-08-07  
> 브랜치: `data/gyeongju-kto-api-contract-and-5-place-pilot-v1`  
> Base HEAD: `95d275b` (data/gyeongju-full-tourism-coverage-audit-v2)

---

## 1. 전제 검증 결과

| 항목 | 확인값 |
|------|--------|
| ZIP 매뉴얼 존재 | ✅ 2개 파일 |
| TOUR_API_KEY | ✅ .env.local 로드 성공 |
| TIER_A 117건 queue | ✅ |
| 기존 collector 재사용 | ✅ gyeongju_official_detail_collector_v1.py |
| Frozen SHA | ✅ 4개 파일 ALL_OK |

---

## 2. Phase A: areaBasedList2 수집

| 항목 | 결과 |
|------|------|
| type12 (관광지) | HTTP 200 · **104건** |
| type14 (문화시설) | HTTP 200 · **9건** |
| 인덱스 통합 | **113건** (정규화 이름 기반) |

경주시 areaCode=35, sigunguCode=2 확인. `_kto_get()` 재사용으로 추가 API 구현 불필요.

---

## 3. Phase B: KTO 이름 매칭 (5건)

| candidate_id | name_ko | 정규화 | match_status | kto_content_id |
|---|---|---|---|---|
| gyeongju-GJ01-0008 | 교촌마을 | 교촌마을 | KTO_MATCH_NOT_FOUND | — |
| gyeongju-GJ01-0010 | 금장대 | 금장대 | KTO_MATCH_NOT_FOUND | — |
| gyeongju-GJ01-0039 | 황남리 고분군 | 황남리고분군 | KTO_MATCH_NOT_FOUND | — |
| gyeongju-GJ01-0041 | 황룡사지 | 황룡사지 | **EXACT_MATCH** | 127985 |
| gyeongju-GJ01-0055 | 서출지 | 서출지 | **EXACT_MATCH** | 128612 |

**매칭 성공: 2/5** (40%)

미매칭 원인:
- **교촌마을**: KTO type12/14 미등록 (경주시 자체 장소 구분)
- **금장대**: KTO 미등록 (소규모 명소 — 야경·전망 속성만 보유)
- **황남리 고분군**: KTO type12 경주 금척리 고분군(250274)·황오리 고분군 등 있으나 황남리 고분군은 별도 미등록

→ TIER_A 전수 수집 시 추가 전략 필요: type25(여행코스) 추가, 이름 변형 fuzzy 매칭 검토

---

## 4. Phase C: VG HTML 수집 (5건)

| candidate_id | area_uid | mnu_uid | HTTP | html_len |
|---|---|---|---|---|
| gyeongju-GJ01-0008 | 52 | 2292 | **200** | 74,465 |
| gyeongju-GJ01-0010 | 72 | 2292 | **200** | 72,941 |
| gyeongju-GJ01-0039 | 380 | 2292 | **200** | 71,211 |
| gyeongju-GJ01-0041 | 68 | 2292 | **200** | 73,607 |
| gyeongju-GJ01-0055 | 91 | 2295 | **200** | 69,677 |

**5/5 HTTP 200, parse_ok=True**

VG URL 패턴 확정:
```
https://www.gyeongju.go.kr/tour/page.do?listType=&mnu_uid={mnu_uid}&sortKwd=name&code_uid={code_uid}&srchKwd=&area_uid={area_uid}&cmd=2
```
mnu_uid → code_uid 매핑: {2291:1011, 2292:1012, 2293:1015, 2294:1016, 2295:1014, 2296:1010}  
mnu_uid 출처: WEB-ATT source facts `web_mnu_uid` 필드

---

## 5. Phase D: KTO detail 수집

| candidate_id | content_id | detailCommon2 | detailIntro2 | detailImage2 |
|---|---|---|---|---|
| gyeongju-GJ01-0041 | 127985 | HTTP 200 (item 빈) | HTTP 200 ✅ | HTTP 200 (0건) |
| gyeongju-GJ01-0055 | 128612 | HTTP 200 (item 빈) | HTTP 200 ✅ | HTTP 200 (0건) |

**주요 발견: detailCommon2 item 빈 현상**
- contentId 127985, 128612 모두 `detail_common2.item = {}`
- `detail_intro2.item`은 정상 (infocenter, parking, restdate, usetime 있음)
- CORE27에서도 동일 현상 확인됨 (알려진 KorService2 API 특성)
- **대응**: `areaBasedList2` 응답 항목에서 mapx/mapy/addr1을 fallback으로 사용 ✅

---

## 6. Phase E: Snapshot 결과 (5건)

| candidate_id | VG_ok | description_ko | images | lat/lng | kto_match |
|---|---|---|---|---|---|
| 교촌마을 | ✅ | 610자 | 6장 | 없음* | NOT_FOUND |
| 금장대 | ✅ | 260자 | 6장 | 없음* | NOT_FOUND |
| 황남리 고분군 | ✅ | 317자 | 4장 | 없음* | NOT_FOUND |
| 황룡사지 | ✅ | 681자 | 6장 | (35.837°N, 129.232°E) | EXACT_MATCH |
| 서출지 | ✅ | 366자 | 6장 | (35.796°N, 129.242°E) | EXACT_MATCH |

\* KTO 미매칭 건: areaBasedList2 좌표도 없음 (type12/14 미등록)

- description_ko: **5/5** (전건 VG KOGL1)
- images: **28장** (전건 VG KOGL1)
- 좌표: **2/5** (areaBasedList2 fallback 성공)
- coord_source: `areaBasedList2_list` (detailCommon2 빈 경우)

---

## 7. 완료 검증

| 항목 | 결과 |
|------|------|
| areaBasedList2 수집 | ✅ HTTP 200, 104건 |
| VG 5건 HTTP 200 | ✅ 5/5 |
| VG parse_ok | ✅ 5/5 |
| KTO 매칭 | ✅ 2/5 EXACT_MATCH (≥2 → CONDITIONAL_PASS) |
| KTO detail HTTP 200 | ✅ 2/2 (매칭 성공 건) |
| description_ko | ✅ 5/5 |
| images | ✅ 28장 |
| Frozen SHA | ✅ ALL_OK (4개 파일) |
| 인증키 노출 | ✅ 0건 |
| Run1=Run2 | ✅ **BYTE_IDENTICAL_PASS** (5/5 파일) |

**종합 판정: CONDITIONAL_PASS** (KTO 매칭 2/5, VG 5/5)

---

## 8. API 계약 확정

| 항목 | 확정 내용 |
|------|----------|
| KTO Base URL | `https://apis.data.go.kr/B551011/KorService2` |
| 목록 API | `areaBasedList2` (areaCode=35, sigunguCode=2) |
| 상세 API | `detailCommon2 + detailIntro2 + detailImage2` |
| type12 경주 건수 | **104건** |
| type14 경주 건수 | **9건** |
| detailCommon2 item 빈 현상 | KNOWN — areaBasedList2 좌표로 fallback |
| 이미지 권리 | 전건 `RIGHTS_EVIDENCE_MISSING` (DEF-ENRICH-M01 유지) |
| VG URL 패턴 | `page.do?mnu_uid=...&code_uid=...&area_uid=...&cmd=2` |
| VG 권리 | `VERIFIED_ALLOWED_BY_PUBLIC_LICENSE_KOGL_TYPE1` |

---

## 9. 발견된 이슈 및 다음 단계 권고

### DEF-PILOT-W01 (WARNING): KTO 매칭 40%
- 교촌마을·금장대·황남리 고분군 type12/14 미등록
- **권고**: type25(여행코스), type28(레포츠) 추가 수집; fuzzy 매칭(부분 일치) 검토
- **태스크 차단 없음** (CONDITIONAL_PASS 기준 충족)

### DEF-PILOT-W02 (WARNING): KTO 좌표 fallback 필요
- `detailCommon2.item`이 비어 있음 → `areaBasedList2` 좌표로 대체
- CORE27에서도 동일 패턴 확인됨
- **대응 완료**: 파이프라인에 fallback 로직 내장

### DEF-PILOT-I01 (INFO): KTO 미매칭 3건 좌표 없음
- 교촌마을·금장대·황남리 고분군: areaBasedList2에도 없음
- **권고**: VG HTML에서 좌표 추출 시도 또는 geocoding 별도 태스크

---

## 10. 다음 단계

1. **TIER_A 전수 KTO 매칭**: type25/28 추가 → 매칭율 향상 기대
2. **TIER_A 배치 VG 수집**: 117건, 배치 20건 × 6회 (WEB-ATT mnu_uid 활용)
3. **KTO 미매칭 장소 좌표**: 별도 geocoding 태스크 또는 VG HTML 좌표 추출 검토
4. **GJ-03/04/05 이미지 연결**: CORE27에서 확인된 패턴으로 TIER_A 이미지 보강

---

## 11. 생성 산출물

### raw
| 파일 | 위치 |
|------|------|
| kto-type12-areabasedlist2-gyeongju-v1.json (104건) | raw/gyeongju/kto-list/ |
| kto-type14-areabasedlist2-gyeongju-v1.json (9건) | raw/gyeongju/kto-list/ |
| vg-area-52,68,72,91,380.json (5건) | raw/gyeongju/gyeongju-tier-a-pilot-v1/ |
| kto-127985.json, kto-128612.json (2건) | raw/gyeongju/gyeongju-tier-a-pilot-v1/ |

### validation
| 파일 | 내용 |
|------|------|
| gyeongju-tier-a-pilot-kto-link-v1.jsonl | 5건 매칭 감사 |
| gyeongju-tier-a-pilot-qa-v1.json | QA 요약 |
| gyeongju-tier-a-pilot-frozen-sha-v1.json | Frozen SHA |
| gyeongju-tier-a-pilot-run1-run2-sha-v1.json | Run1=Run2 SHA |

### normalized
| 파일 | 내용 |
|------|------|
| gyeongju-tier-a-pilot-snapshot-v1.jsonl | 5건 snapshot (VG+KTO) |

### scripts
| 파일 | 내용 |
|------|------|
| gyeongju_tier_a_kto_pilot_v1.py | 파이럿 실행 스크립트 |

### docs/tourapi
| 파일 |
|------|
| gyeongju-kto-api-contract-and-5-place-pilot-v1.md (계약서) |
| gyeongju-kto-api-contract-and-5-place-pilot-v1-verification.md (사전 검증) |
| gyeongju-kto-api-contract-and-5-place-pilot-v1-completion.md (이 파일) |

---

**종합 판정: CONDITIONAL_PASS**  
작업을 완료했습니다.
