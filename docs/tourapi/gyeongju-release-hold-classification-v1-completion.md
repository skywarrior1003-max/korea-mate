# 완료보고서 — TASK-GYEONGJU-RELEASE-HOLD-CLASSIFICATION-V1

**작업**: 경주 910개 Candidate + 행사·관계 데이터 Release/Hold 분류  
**상태**: ✅ COMPLETE — `GYEONGJU_RELEASE_HOLD_CLASSIFICATION_COMPLETE_WITH_LIMITATIONS`  
**결정**: EXECUTE WITH IMPROVEMENTS (3개 구현 개선 사항 반영)  
**스크립트 버전**: v1.0.0  
**브랜치**: `data/gyeongju-release-hold-classification-v1`  
**기반 HEAD**: `74a484d` (POST-LINK-QA 완료 커밋)  
**날짜**: 2026-08-06 (as_of 기준: 2026-08-05T04:08:00Z)

---

## 1. 검증 요약 (사전 검증 결과 반영)

GPT 프롬프트 대비 데이터 실제 상태 검증에서 3개 구현 개선 사항 확인:

| # | 항목 | GPT 프롬프트 | 실제 데이터 | 개선 내용 |
|---|------|------------|-----------|----------|
| 1 | 이미지 권리 판단 | `image_rights_status` 필드 사용 | 전체 831 baseline → `RIGHTS_UNKNOWN` (필드 불신뢰) | `image_url` 도메인 기반 결정으로 변경 |
| 2 | KTO15 행사 처리 | "현재 공식 source로 확인되지 않은 항목" | 24건 전체 `event_start/end_date=None` + 날짜 미확인 | `HOLD_NO_CURRENT_OFFICIAL_SOURCE` primary로 명시 |
| 3 | MRQ blocking 필드 | 문서에 언급 없음 | `baseline_candidate_id` 키 사용 확인 | `baseline_candidate_id` 필드 명시적 참조 |

---

## 2. 분류 결과

### 2.1 Candidate (910개)

| 결정 | 수 | 비율 |
|------|-----|------|
| **RELEASE** | **102** | **11.2%** |
| HOLD | 808 | 88.8% |
| 합계 | 910 | 100% |

#### HOLD 사유 분포 (primary 기준)

| HOLD 사유 | 건수 |
|-----------|------|
| HOLD_ENRICHMENT_REQUIRED | 약 538 |
| HOLD_LOCATION_INCOMPLETE | 약 231 |
| HOLD_NO_CURRENT_OFFICIAL_SOURCE | 24 |
| HOLD_IDENTITY_REVIEW | 약 15 |

#### Category별

| Category | 전체 | RELEASE | HOLD |
|----------|------|---------|------|
| restaurant | 367 | ~102 | ~265 |
| attraction | 334 | 0 | 334 |
| accommodation | 126 | 0 | 126 |
| nature | 59 | 0 | 59 |
| event | 24 | 0 | 24 |

> **핵심 패턴**: restaurant(367개)에서만 RELEASE 발생 — VG-REST 수집분이 주소·좌표·이미지·설명을 충족하는 유일한 source. attraction/accommodation/nature는 설명(description_ko) 전량 부재로 HOLD_ENRICHMENT_REQUIRED.

### 2.2 Web Event Entities (7개)

| 결정 | 수 | 상태 |
|------|-----|------|
| RELEASE | 2 | CURRENT_EVENT |
| HOLD | 5 | DATE_MISSING |
| ARCHIVE_ONLY | 0 | - |

### 2.3 관계 데이터 (113개)

| 분류 | 수 |
|------|-----|
| heritage relations | 53 |
| recommendation place relations | 14 |
| course waypoint relations | 29 |
| cultural guide relations | 17 |
| 합계 | 113 |

모든 관계 데이터: `RELATION_ONLY` / `RELATION_SOURCE_LIMITATION`  
(연결된 RELEASE candidate가 없어 현재 usable 관계 없음)

---

## 3. 이미지 권리 결정 기준 (개선 #1)

```
image_url 도메인 기반 결정:
  tong.visitkorea.or.kr  → OFFICIAL_API_IMAGE_USABLE  (376개 candidates)
  www.gyeongju.go.kr     → OFFICIAL_API_IMAGE_USABLE  (154개 candidates)
  image_url 없음          → NO_IMAGE                   (380개 candidates)

기존 image_rights_status 필드: 전체 831 baseline = RIGHTS_UNKNOWN (무시)
```

RELEASE 102건: 전원 공식 API 이미지 보유 (`tong.visitkorea.or.kr` 또는 `www.gyeongju.go.kr`)

---

## 4. 재현성 (Run1 = Run2 BYTE_IDENTICAL)

| 파일 | SHA-256 (앞 16자) | 일치 |
|------|------------------|------|
| gyeongju-candidate-release-hold-v1.jsonl | `0690bdac67415aaf` | ✅ |
| gyeongju-event-release-hold-v1.jsonl | `1841559b21b72167` | ✅ |
| gyeongju-relation-release-usage-v1.jsonl | `2a022d6e58583f08` | ✅ |
| gyeongju-release-hold-category-summary-v1.json | `c67c05d22266bc07` | ✅ |
| gyeongju-hold-reason-summary-v1.json | `ce71a365e6ef3023` | ✅ |
| gyeongju-product-usable-count-summary-v1.json | `4d374988a8586e45` | ✅ |
| gyeongju-release-quality-coverage-v1.json | `23a4708d1f354928` | ✅ |
| gyeongju-release-rights-usage-audit-v1.jsonl | `b62bc827fe237616` | ✅ |
| gyeongju-release-missing-core-fields-v1.jsonl | `18387312ae743de4` | ✅ |
| gyeongju-release-manual-review-impact-v1.json | `b288e75b46c14767` | ✅ |
| gyeongju-release-source-limitations-v1.jsonl | `bcc25dd86feb64fd` | ✅ |
| gyeongju-release-classification-defects-v1.jsonl | `7eb70257593da06f` | ✅ |
| gyeongju-release-readiness-summary-v1.json | `75d1d505af51231d` | ✅ |
| **합계** | | **13/13 BYTE_IDENTICAL** |

재현성 근거:
- `as_of`: normalization summary에서 읽음 (`2026-08-05T04:08:00Z`)
- `datetime.now()` 미사용
- `sort_keys=True`, 결정적 정렬 전반 적용

---

## 5. 결함 검증

```
defect_counts: {}   ← RELEASE candidate 중 필수 필드 누락 없음
overall_verdict: PASS
```

RELEASE 102건 검증 통과 항목:
- ✅ `title_ko` 전원 보유
- ✅ `address` 전원 보유
- ✅ 좌표 전원 유효 (경주 bounds 내)
- ✅ 공식 API 이미지 전원 보유
- ✅ `description_ko` 전원 보유
- ✅ MRQ blocking 해당 없음

---

## 6. 문서화된 한계 (Source Limitations)

| 코드 | 설명 | 영향 |
|------|------|------|
| `DEF-L01 → CLOSED` | Heritage coverage gap (25건 UNESCO 관련 attraction 미수집) | heritage_relations 53건에 RELATION_SOURCE_LIMITATION 포함 |
| `KTO15_NO_CURRENT_DATE` | KTO15 행사 24건 날짜 전무, 공식 web 미확인 | 24건 HOLD_NO_CURRENT_OFFICIAL_SOURCE |
| `NO_ATTRACTION_DESCRIPTION` | attraction/nature/accommodation description_ko 미수집 | 약 519건 HOLD_ENRICHMENT_REQUIRED 주요 원인 |
| `COORD_MISSING_BASELINE` | baseline_831 중 152건 좌표 없음 | 152건 HOLD_LOCATION_INCOMPLETE |

---

## 7. 제품 활용 가능성 요약

| 구분 | 수 | 설명 |
|------|-----|------|
| **즉시 활용 가능한 장소** | **102** | RELEASE 결정 |
| 현재 웹 행사 (RELEASE) | 2 | CURRENT_EVENT |
| 위치 보강 후 가능 후보 | ~231 | HOLD_LOCATION_INCOMPLETE |
| 콘텐츠 보강 후 가능 후보 | ~538 | HOLD_ENRICHMENT_REQUIRED |
| identity 검토 후 결정 | ~15 | HOLD_IDENTITY_REVIEW |
| 임시 차단 (행사 날짜 부재) | 24 | KTO15 events |

---

## 8. 출력 파일 (data/tourapi/validation/gyeongju/)

| 파일 | 내용 |
|------|------|
| `gyeongju-candidate-release-hold-v1.jsonl` | 910개 candidate 분류 결과 |
| `gyeongju-event-release-hold-v1.jsonl` | 7개 web event entity 분류 |
| `gyeongju-relation-release-usage-v1.jsonl` | 113개 관계 데이터 분류 |
| `gyeongju-release-hold-category-summary-v1.json` | category·source 별 집계 |
| `gyeongju-hold-reason-summary-v1.json` | HOLD 사유 분포 |
| `gyeongju-product-usable-count-summary-v1.json` | 제품 활용 가능성 집계 |
| `gyeongju-release-quality-coverage-v1.json` | 품질 coverage 분석 |
| `gyeongju-release-rights-usage-audit-v1.jsonl` | 이미지 권리 usage scope 감사 |
| `gyeongju-release-missing-core-fields-v1.jsonl` | 필수 필드 누락 감사 |
| `gyeongju-release-manual-review-impact-v1.json` | MRQ 영향 분석 |
| `gyeongju-release-source-limitations-v1.jsonl` | 문서화된 source 한계 |
| `gyeongju-release-classification-defects-v1.jsonl` | 분류 결함 레지스터 (0건) |
| `gyeongju-release-readiness-summary-v1.json` | 최종 readiness 요약 |
| `gyeongju-release-hold-classification-sha-audit-v1.json` | Run1=Run2 BYTE_IDENTICAL 감사 |

스크립트: `scripts/gyeongju_release_hold_classification_v1.py` (v1.0.0)

---

## 9. 다음 단계

- **enrichment task**: HOLD_ENRICHMENT_REQUIRED 대상 description·이미지 보강 (특히 attraction 334건)
- **location enrichment**: HOLD_LOCATION_INCOMPLETE 231건 좌표·주소 보강
- **identity review**: MRQ 대상 15건 수동 검토 완료 후 재분류
- **event 갱신**: KTO15 행사 24건 현재 공식 날짜 확인 후 재분류
- **release pipeline**: RELEASE 102건 운영 DB 반영 여부 별도 승인 필요

---

*스크립트: `scripts/gyeongju_release_hold_classification_v1.py` v1.0.0*  
*기반: TASK-GYEONGJU-POST-LINK-FINAL-INDEPENDENT-QA-V1 (HEAD 74a484d)*  
*실행 환경: Python 3.x, 순수 표준 라이브러리*  
*HTTP 요청: 0건*
