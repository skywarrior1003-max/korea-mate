# TASK-GYEONGJU-EN-ENGSERVICE2-CONTRACT-AND-10-PLACE-PILOT-V1 완료보고서

**작성일시**: 2026-08-07  
**브랜치**: `data/gyeongju-engservice2-contract-10-pilot-v1`  
**Base HEAD**: `3bca9e4` (data/gyeongju-course-linkage-ko-closeout-v2)

---

## 1. 검증 단계 요약

본 보고서는 프롬프트 검증 → 실행 → 완료보고를 통합한다.

### 검증 결과

| 검증 항목 | 결과 |
|---|---|
| Base HEAD 3bca9e4 | ✅ |
| EngService2 계약 로컬 자료 | ✅ `approved-api-inventory.md` Section 6 |
| TOUR_API_KEY 존재 | ✅ .env.local |
| 프롬프트 구조 (금지규칙/Gate/중단조건) | ✅ 이슈 없음 |
| KO READY 입력 파일 | ✅ CORE27/TIER_A/RESTAURANT 모두 존재 |

**판정: 이슈 없음 → 실행**

### 실행 중 발견된 기술 이슈 (파일럿에서 자체 해결)

| # | 발견 | 조치 | 분류 |
|---|---|---|---|
| 1 | `areaCode2` 응답이 영어 지명 반환 ("Gyeongju-si", "Gyeongsangbuk-do") → 한국어 검색 실패 | 검색 로직을 영어 지명으로 수정 | 계약 정보 갱신 |
| 2 | `detailImage2`에 `subImageYN` 파라미터 불가 (`INVALID_REQUEST_PARAMETER_ERROR`) | `contentId`만 사용으로 수정 | 계약 추가 확인 |
| 3 | `set` 이터레이션으로 파일럿 선정 비결정적 | JSONL 파일 순서 기반 `list` 이터레이션으로 수정 | 재현성 수정 |

---

## 2. EngService2 공식 계약 확인 결과

### 계약 소스

- **로컬 매뉴얼**: `docs/tourapi/approved-api-inventory.md` (Section 6) — **존재 확인**
- **전용 OpenAPI 매뉴얼**: 별도 다운로드본 없음 (로컬 인벤토리로 대체)

### Base Endpoint

```
https://apis.data.go.kr/B551011/EngService2
```

### 인증

환경변수: `TOUR_API_KEY` (.env.local 존재 ✅)

### Operation 계약 상태

| Operation | 상태 | 비고 |
|---|---|---|
| areaCode2 | CONFIRMED_PARTIAL | 영어 지명 반환, 삭제 예정 공식 미확인 |
| areaBasedList2 | CONFIRMED_ACTUAL | 경주 64건 실측 |
| locationBasedList2 | CONFIRMED_ACTUAL | 기존 사용 중 |
| searchKeyword2 | CONFIRMED_ACTUAL | 기존 사용 중 |
| detailCommon2 | CONFIRMED_ACTUAL | rc:0000, contentId만 사용, YN 파라미터 금지 |
| detailIntro2 | CONFIRMED_PILOT | 파일럿 9건 실측 (contentId + contentTypeId) |
| detailInfo2 | CONFIRMED_PILOT | 일부 장소 0건 (contentType 따라 다름) |
| detailImage2 | CONFIRMED_PILOT | contentId만 사용 (imageYN/subImageYN 금지) |
| searchFestival2 | NOT_TESTED | 미실측 |
| searchStay2 | NOT_TESTED | 미실측 |
| areaBasedSyncList2 | NOT_TESTED | 미실측 |
| ldongCode2 | NOT_TESTED | 신규 endpoint 미실측 |
| lclsSystmCode2 | NOT_TESTED | 신규 endpoint 미실측 |

### 신규 발견 계약 항목

- `areaCode2` 응답 언어: **영어** (EngService2 특성 — KorService2와 다름)
- `detailImage2`: `subImageYN` / `imageYN` 파라미터 **INVALID** → contentId만 허용
- `detailImage2` 오류 응답 구조: 표준 `response.header.body` wrapper 없이 `{responseTime, resultCode, resultMsg}` 직접 반환

---

## 3. 경주 지역 필터 확정

| 항목 | 값 | 확인 방법 |
|---|---|---|
| areaCode | `35` | `/areaCode2` → "Gyeongsangbuk-do" |
| sigunguCode | `2` | `/areaCode2?areaCode=35` → "Gyeongju-si" |
| 계약 상태 | **CONTRACT_CONFIRMED** | API 직접 확인 |
| 경주 EN 목록 | **64건** | `/areaBasedList2?areaCode=35&sigunguCode=2` |

**KorService2 파라미터 재사용 여부**: `lDongRegnCd=47, lDongSignguCd=130` 사용 안 함. EngService2 `/areaCode2` API를 직접 호출해 독립 확인.

---

## 4. ContentId 네임스페이스

```
kto_ko_content_id  — KorService2 전용 (JOIN KEY 사용 금지)
kto_en_content_id  — EngService2 전용 (JOIN KEY 사용 금지)
```

### 파일럿 관찰 결과

| 관찰값 | 건수 |
|---|---|
| OBSERVED_ID_DIFFERENT | 4건 |
| OBSERVED_ID_EQUAL | 0건 |
| N/A (KTO KO contentId 없음) | 6건 |

→ **확인된 3건 모두 KO/EN contentId 다름** (예상된 별도 체계 재확인)

---

## 5. 파일럿 10건 목록

| # | candidate_id | name_ko | 유형 | KTO match | EN match |
|---|---|---|---|---|---|
| 1 | gyeongju-GJ01-0001 | 경주 계림 | CORE27 | ✗ | HIGH_CONFIDENCE |
| 2 | gyeongju-GJ01-0004 | 경주 월성 | CORE27 | ✗ | HIGH_CONFIDENCE |
| 3 | gyeongju-GJ01-0005 | 경주읍성 | CORE27 | 2756611 | HIGH_CONFIDENCE |
| 4 | gyeongju-GJ01-0002 | 경주 문화원 | TIER_A | 130030 | HIGH_CONFIDENCE |
| 5 | gyeongju-GJ01-0006 | 경주최부자댁 | TIER_A | 2614343 | EXACT |
| 6 | gyeongju-GJ01-0007 | 경주향교 | TIER_A | 1621391 | EXACT |
| 7 | gyeongju-GJ01-0144 | 서악서원 | TIER_A | ✗ | HIGH_CONFIDENCE |
| 8 | gyeongju-GJ01-0019 | 동부사적지구 꽃단지 | TIER_A | ✗ | REVIEW_REQUIRED |
| 9 | gyeongju-GJ08-105 | 위드구스토 | RESTAURANT | ✗ | EXACT |
| 10 | gyeongju-GJ08-106 | 황남금고 | RESTAURANT | ✗ | HIGH_CONFIDENCE |

---

## 6. EN Match 결과

| 판정 | 건수 |
|---|---|
| EXACT_OFFICIAL_IDENTITY | 3건 |
| HIGH_CONFIDENCE_MULTI_EVIDENCE | 6건 |
| IDENTITY_REVIEW_REQUIRED | 1건 |
| NO_EN_RECORD | 0건 |

**주의**: HIGH_CONFIDENCE 판정은 좌표 근접(100~500m) 기반. 경주 중심부는 문화유산 밀집 지역이므로 상세 검토 시 일부 오매칭 가능성 있음. EN title과 KO name 대조 필요. (예: 서악서원 → 무열왕릉 EN record 반환됨)

---

## 7. EN title/description/address/운영정보/image coverage

대상: EXACT + HIGH_CONFIDENCE 9건 상세 호출

| 필드 | 보유 건수 |
|---|---|
| EN title | 9/9 (100%) |
| EN overview/description | 9/9 (100%) |
| EN address | 9/9 (100%) |
| EN coordinates | 9/9 (100%) |
| EN image (firstimage) | 6/9 (67%) |
| EN homepage | 일부 |

---

## 8. Operation별 API 결과 요약

| Operation | 성공 | 빈 응답 | 오류 |
|---|---|---|---|
| detailCommon2 | 9/9 | 0 | 0 |
| detailIntro2 | 9/9 | 0 | 0 |
| detailInfo2 | 3/9 (건수 있음) | 6/9 (빈 items) | 0 |
| detailImage2 | 9/9 | (이미지 없는 장소 3건) | 0 |

**detailInfo2**: contentType별로 반복 정보 항목이 다름. 빈 응답은 해당 contentType에 반복 정보 없음을 의미 (오류 아님).

---

## 9. 공식 경주 영문사이트 handoff

- `data/tourapi/validation/gyeongju/visitgyeongju/` 디렉토리 존재
- `data/tourapi/normalized/gyeongju/gyeongju-multilingual-entity-link-audit-v1.jsonl` 존재
- EN URL 규칙: `https://www.gyeongju.go.kr/eng/` (추정 — 이번 단계에서 신규 수집 금지)
- rights/source contract: CONTRACT_NOT_CONFIRMED_FOR_EN (다음 단계 확인 필요)
- 다음 EN 보강 단계의 source proposal로만 기록

---

## 10. GYEONGJU_EN_FULL_COLLECTION_READY

```
GYEONGJU_EN_FULL_COLLECTION_READY = true
```

| 조건 | 결과 |
|---|---|
| EngService2 계약 충분히 확인 | ✅ CONTRACT_CONFIRMED |
| identity 연결 방식 재현 가능 | ✅ (JSONL 순서 기반 결정론적 선정) |
| 심각한 parser 오류 없음 | ✅ (0건) |
| ID namespace 혼용 0 | ✅ |
| 임의 번역 생성 0 | ✅ |
| 구조적 API 오류 없음 | ✅ |
| 경주 EN 목록 조회 성공 | ✅ 64건 |

---

## 11. 재현성 / QA

| 항목 | 결과 |
|---|---|
| Run1 신규 HTTP 호출 | 35건 |
| **Run2 신규 HTTP 호출** | **0건** ✅ |
| 파일럿 10건 동일 선정 | ✅ (JSONL 파일 순서 기반) |
| 출력 파일 SHA 차이 | `as_of` 타임스탬프 필드 (논리 결과 동일) |
| frozen SHA 변경 | 없음 (신규 파일만 생성) |
| JSON/JSONL 오류 | 0건 |
| API key 노출 | 없음 |
| 임의 번역 | 없음 |
| worktree clean | ✅ (커밋 후) |

**SHA 차이 설명**: 출력 파일의 `as_of` UTC 타임스탬프가 Run1/Run2 실행 시각 차이로 인해 달라짐. API 응답(캐시) 및 논리 결과는 동일. `gyeongju-engservice2-source-contract-v1.json` (타임스탬프 없음)은 완전 동일.

---

## 12. 산출물

| 파일 | 경로 |
|---|---|
| EngService2 계약 MD | `docs/tourapi/gyeongju-engservice2-source-contract-v1.md` |
| EngService2 계약 JSON | `data/tourapi/normalized/gyeongju/gyeongju-engservice2-source-contract-v1.json` |
| 파일럿 입력 10건 | `data/tourapi/normalized/gyeongju/gyeongju-en-10-pilot-input-v1.jsonl` |
| KO↔EN Identity Link | `data/tourapi/normalized/gyeongju/gyeongju-ko-en-identity-link-pilot-v1.jsonl` |
| EN 스냅샷 | `data/tourapi/normalized/gyeongju/gyeongju-engservice2-10-pilot-snapshot-v1.jsonl` |
| EN 상세 감사 | `data/tourapi/normalized/gyeongju/gyeongju-engservice2-detail-audit-v1.jsonl` |
| EN 커버리지 | `data/tourapi/validation/gyeongju/gyeongju-en-pilot-coverage-v1.json` |
| EN Gate | `data/tourapi/validation/gyeongju/gyeongju-en-full-collection-gate-v1.json` |
| EN 영문사이트 handoff | `data/tourapi/normalized/gyeongju/gyeongju-official-en-site-handoff-v1.json` |
| Run1/Run2 SHA 감사 | `data/tourapi/validation/gyeongju/gyeongju-engservice2-pilot-run1-run2-sha-v1.json` |
| 완료보고서 | `docs/tourapi/gyeongju-engservice2-contract-10-pilot-v1-completion.md` |

---

## 13. 결함

| # | 내용 | 상태 |
|---|---|---|
| 1 | `areaCode2` 한국어 검색 실패 (영어 지명 반환 미인지) | 수정 완료 |
| 2 | `detailImage2` `subImageYN` 파라미터 오류 | 수정 완료 (contentId만 사용) |
| 3 | `set` 이터레이션 비결정성 | 수정 완료 (list 이터레이션) |
| 4 | HIGH_CONFIDENCE 일부 오매칭 가능성 | REVIEW_REQUIRED 표시, 다음 단계 검토 |

---

## 14. 다음 단계 권고

1. **EN Identity REVIEW_REQUIRED 해소**: 4건 (동부사적지구 꽃단지 등) 수동 검토
2. **HIGH_CONFIDENCE 매칭 검증**: EN title vs KO name 대조로 오매칭 확인 (좌표 밀집 지역)
3. **EN 전체 수집**: Gate=true 판정에 따라 경주 EN 235건 전체 수집 단계 진행 가능
4. **detailImage2 권리 검토**: cpyrhtDivCd 필드 없음 → RIGHTS_REVIEW_REQUIRED 해소
5. **EN 영문사이트 보강**: visitgyeongju EN 채널 구조 탐색 (별도 단계)
6. **ldongCode2 / lclsSystmCode2**: 신규 endpoint 계약 확인 (필요 시)

---

## Git

```
브랜치: data/gyeongju-engservice2-contract-10-pilot-v1
Base:   3bca9e4 (data/gyeongju-course-linkage-ko-closeout-v2)
```

작업을 완료했습니다
