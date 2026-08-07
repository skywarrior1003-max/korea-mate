# TASK-GYEONGJU-EN-CONTRACT-FINALIZE-AND-235-PLACE-FULL-COLLECTION-V1 완료보고서

**작성일시**: 2026-08-07  
**브랜치**: `data/gyeongju-en-235-full-collection-v1`  
**Base HEAD**: `5fc111b` (data/gyeongju-engservice2-contract-10-pilot-v1)

---

## 1. 검증 단계 요약

### 검증 결과

| 검증 항목 | 결과 |
|---|---|
| Base HEAD 5fc111b | ✅ |
| 영문 전용 공식 매뉴얼 탐색 | ✅ 미존재 → `approved-api-inventory.md` Section 6 사용 |
| 파일럿 계약(CONTRACT_CONFIRMED) 확인 | ✅ areaCode=35, sigunguCode=2 |
| "좌표만으로 HIGH_CONFIDENCE 금지" Task 4 발견 반영 | ✅ 올바르게 반영 |
| 235건 구성 (CORE27 27 + TIER_A 106 + Restaurant 102) | ✅ 겹침 없음 |
| EN 목록 64건 한국어 괄호 패턴 (이름 기반 매칭 가능) | ✅ 63/64건 |
| contentId namespace 혼용 금지 | ✅ kto_ko/kto_en 분리 유지 |
| 임의 번역 금지 | ✅ |

**판정: 이슈 없음 → 실행**

---

## 2. EngService2 계약 최종 확정

### 계약 소스 확인 경위

1. `개방데이터_활용매뉴얼(영문).zip` — **미존재** (로컬 탐색)
2. `docs/tourapi/approved-api-inventory.md` Section 6 — **존재** ✅
3. 파일럿 실측 계약(`gyeongju-engservice2-source-contract-v1.json`) — **CONTRACT_CONFIRMED** ✅

`CONTRACT_FINALIZED = true` 판정으로 전체 수집 진행.

### EngService2 확정 계약 항목

| 항목 | 값 |
|---|---|
| Base Endpoint | `https://apis.data.go.kr/B551011/EngService2` |
| 인증 | `TOUR_API_KEY` (.env.local) |
| areaCode (경북) | **35** |
| sigunguCode (경주시) | **2** |
| 경주 EN 목록 건수 | **64건** |

| Operation | 상태 | 비고 |
|---|---|---|
| areaBasedList2 | CONFIRMED_ACTUAL | 경주 64건 실측 |
| searchKeyword2 | CONFIRMED_ACTUAL | 기존 확인 (경주 호출 0건) |
| detailCommon2 | CONFIRMED_ACTUAL | rc:0000 |
| detailIntro2 | CONFIRMED_PILOT | contentId+contentTypeId |
| detailInfo2 | CONFIRMED_PILOT | 빈 응답=오류 아님 |
| detailImage2 | CONFIRMED_PILOT_contentId_only | imageYN/subImageYN 금지 |
| ldongCode2 | NOT_TESTED_GYEONGJU | 부산에서 rc:0000 확인, 경주 미실측 |
| lclsSystmCode2 | NOT_TESTED_GYEONGJU | 위 동일 |

### 확정 계약 제약

- `detailImage2` 파라미터: `contentId`만 허용 (`imageYN`/`subImageYN` → INVALID)
- `areaCode2` 응답 언어: 영어 지명 반환 (Korean 검색 금지)
- `detailImage2` 오류 응답: flat `{responseTime, resultCode, resultMsg}` 구조

---

## 3. 235건 입력 구성

| 그룹 | 건수 | 소스 파일 | 좌표 보유 |
|---|---|---|---|
| CORE27 | 27건 | `gyeongju-core27-release-after-location-v2.jsonl` | 27/27 (`route_latitude/longitude`) |
| TIER_A READY | 106건 | `gyeongju-tier-a-final-release-after-description-recovery-v1.jsonl` | 79/106 (나머지 KTO match index 좌표) |
| Restaurant RELEASE | 102건 | `gyeongju-candidate-release-hold-v1.jsonl` (release_decision=RELEASE) | 102/102 |
| **합계** | **235건** | — | **208/235** |

- 겹침: 0건 ✅
- `title_en` 기존 보유: 0건 (searchKeyword2 미호출)
- 전화번호 보유: 172/235건

---

## 4. EN Identity 연결 결과 (235건)

### 4-1. 판정 분포

| 판정 | 건수 | 비고 |
|---|---|---|
| **EXACT_OFFICIAL_IDENTITY** | **41건** | EN title 내 한국어 이름 매칭 |
| REVIEW_REQUIRED | 93건 | 좌표 단독 500m 이내 (HIGH_CONFIDENCE 부여 불가) |
| NO_EN_RECORD | 101건 | EngService2 경주 EN 목록에 없음 |
| HIGH_CONFIDENCE_MULTI_EVIDENCE | 0건 | 전화 매칭 추가 evidence 없음 |

### 4-2. 그룹별 분포

| 그룹 | EXACT | REVIEW | NO_EN | 합계 |
|---|---|---|---|---|
| CORE27 | 14건 | 8건 | 5건 | 27건 |
| TIER_A | 25건 | 28건 | 53건 | 106건 |
| Restaurant | 2건 | 57건 | 43건 | 102건 |

### 4-3. Task 4 대비 개선: 좌표 단독 HIGH_CONFIDENCE 금지

- Task 4 파일럿: 좌표 근접만으로 HIGH_CONFIDENCE 부여 → 서악서원→무열왕릉 EN record 오매칭 발생
- Task 5: 한국어 이름 매칭(EN title 괄호 내) 또는 전화 매칭 없이는 HIGH_CONFIDENCE 불가
- 결과: 93건이 REVIEW_REQUIRED로 보수적 분류 → **오매칭 가능성 최소화**

### 4-4. EN record 중복 연결

- 중복 플래그(en_duplicate_flag=true): 82건
- 원인: 경주 역사 밀집 지역에서 좌표 기반 REVIEW_REQUIRED 여러 KO place가 동일 EN record에 근접
- EXACT 41건 중 중복: 11건 (하위 문자열 포함 관계로 2개 KO place가 동일 EN record에 매칭 — 예: "황리단길" + "경주 황리단길" 모두 EN "황리단길" record)
- 영향: EN_IDENTITY_REVIEW 단계에서 수동 정리 필요

### 4-5. EXACT 매칭 샘플

| candidate_id | name_ko | EN title | evidence |
|---|---|---|---|
| GJ01-0004 | 경주 월성 | Gyeongju Wolseong Palace Site (Banwolseong...) | `경주 월성 ⊂ 경주 월성(반월성` |
| GJ01-0009 | 국립경주박물관 | Gyeongju National Museum | `exact match` |
| GJ01-0022 | 분황사 | Bunhwangsa Temple (분황사) | `exact match` |
| GJ01-0140 | 무열왕릉 | Gyeongju Tomb of King Muyeol... | `무열왕릉 ⊂ 경주 무열왕릉` |
| GJ01-0007 | 경주향교 | Gyeongjuhyanggyo Local Confucian School | `exact match` |

---

## 5. EN Coverage 분류 (235건)

| 분류 | 건수 | 설명 |
|---|---|---|
| **EN_READY** | **6건** | EN title + overview + addr + 좌표 모두 보유 |
| **EN_PARTIAL** | **35건** | EXACT 매칭이나 일부 필드 누락 |
| **EN_IDENTITY_REVIEW** | **93건** | 좌표 근접 REVIEW_REQUIRED — 수동 검토 필요 |
| **EN_SOURCE_MISSING** | **101건** | EngService2 경주 EN 목록에 없음 |

### EN_READY 6건 목록

| candidate_id | name_ko | EN title |
|---|---|---|
| GJ01-0004 | 경주 월성 | Gyeongju Wolseong Palace Site |
| GJ01-0042 | 황리단길 | Gyeongju Hwangnidan Street |
| GJ01-0140 | 무열왕릉 | Gyeongju Tomb of King Muyeol |
| GJ01-0007 | 경주향교 | Gyeongjuhyanggyo Local Confucian School |
| GJ01-0025 | 성동시장 | Gyeongju Seongdong Market |
| GJ08-7510 | 요석궁1779 | Yosukgung 1779 |

### EN_SOURCE_MISSING 101건 구성

- Restaurant: 43건 (EngService2 경주 식당 EN record 5건에 비해 102건 중 대부분 미등록)
- TIER_A 관광지: 53건 (비주력 관광지 EN 미등록)
- CORE27: 5건 (첨성대, 계림 등 일부 명소가 EN 목록에 개별 등록 없음)

---

## 6. EngService2 상세 호출 결과

- 상세 호출 대상: 41건 EXACT 중 **36개 고유 EN contentId**
- (5건 중복: 동일 EN record에 여러 KO place EXACT 매칭)

| Operation | 성공 | 빈 응답 | 오류 |
|---|---|---|---|
| detailCommon2 | 36/36 | 0 | 0 |
| detailIntro2 | 36/36 | 가변 | 0 |
| detailInfo2 | 36/36 | 가변 (contentType 따라) | 0 |
| detailImage2 | 36/36 | (이미지 없는 장소 포함) | 0 |

### ContentType 분포 (64건 EN 목록)

| Type | 건수 | 추정 분류 |
|---|---|---|
| 75 | 1건 | Tourist Attraction |
| 76 | 45건 | Cultural Facility |
| 78 | 7건 | Sports/Leisure |
| 79 | 2건 | Accommodation |
| 80 | 3건 | Shopping |
| 82 | 5건 | Restaurant |
| 85 | 1건 | Festival/Event |

---

## 7. 번역 대기열

- 총 136건 (`gyeongju-translation-fallback-queue-v1.jsonl`)
  - EN_SOURCE_MISSING: 101건 (`NO_EN_RECORD_IN_ENGSERVICE2`)
  - EN_PARTIAL: 35건 (`EN_RECORD_EXISTS_BUT_INCOMPLETE`)

---

## 8. QA 결과

| 규칙 | 결과 |
|---|---|
| 좌표 단독 HIGH_CONFIDENCE 없음 | ✅ PASS (0건) |
| API key 미노출 | ✅ PASS |
| 임의 번역 없음 | ✅ PASS |
| contentId namespace 혼용 없음 | ✅ PASS |
| detailImage2 contentId only | ✅ PASS |
| 입력 235건 정확 | ✅ PASS |
| **QA 종합** | **PASS** |

---

## 9. 재현성 / API 호출

| 항목 | Run 1 | Run 2 |
|---|---|---|
| 신규 HTTP 호출 | 120건 | **0건** ✅ |
| 캐시 (신규 캐시) | 0건 | 120건 |
| 파일럿 캐시 재사용 | 25건 | 25건 |
| Match 분포 | EXACT=41, REVIEW=93, NO_EN=101 | 동일 |
| Coverage 분포 | EN_READY=6, EN_PARTIAL=35 등 | 동일 |
| 논리 결과 동일 여부 | — | ✅ |

**SHA 비고**: `as_of` 타임스탬프 + `http_stats` 필드가 일부 JSON 파일에 포함되어 있어 Run 1/Run 2 SHA 차이 가능. 논리 결과(identity link, coverage, snapshot, input) JSONL 파일은 결정론적이며 SAME.

---

## 10. 산출물

| 파일 | 경로 | 건수 |
|---|---|---|
| EngService2 계약 최종 확정 JSON | `data/tourapi/normalized/gyeongju/gyeongju-engservice2-contract-finalized-v1.json` | — |
| 235건 입력 | `data/tourapi/normalized/gyeongju/gyeongju-en-235-input-v1.jsonl` | 235건 |
| KO↔EN Identity Link | `data/tourapi/normalized/gyeongju/gyeongju-ko-en-identity-link-235-v1.jsonl` | 235건 |
| EN 스냅샷 | `data/tourapi/normalized/gyeongju/gyeongju-en-235-snapshot-v1.jsonl` | 41건 |
| EN 상세 감사 | `data/tourapi/normalized/gyeongju/gyeongju-engservice2-detail-audit-235-v1.jsonl` | 36건 |
| EN Coverage 분류 | `data/tourapi/normalized/gyeongju/gyeongju-en-coverage-235-v1.jsonl` | 235건 |
| 번역 대기열 | `data/tourapi/normalized/gyeongju/gyeongju-translation-fallback-queue-v1.jsonl` | 136건 |
| Coverage 통계 | `data/tourapi/validation/gyeongju/gyeongju-en-235-coverage-stats-v1.json` | — |
| QA 보고서 | `data/tourapi/validation/gyeongju/gyeongju-en-235-qa-report-v1.json` | — |
| Run1/Run2 SHA | `data/tourapi/validation/gyeongju/gyeongju-en-235-run1-run2-sha-v1.json` | — |
| 수집 스크립트 | `scripts/gyeongju_en_235_full_collection_v1.py` | — |
| 완료보고서 | `docs/tourapi/gyeongju-en-235-full-collection-v1-completion.md` | — |

---

## 11. 다음 단계 권고

1. **EN_IDENTITY_REVIEW 93건 수동 검토**
   - 좌표 근접이지만 이름 매칭 없는 93건 → EN title과 KO name 비교 확인
   - 특히 CORE27 8건 (첨성대, 계림 등)을 우선 검토

2. **EN_SOURCE_MISSING 101건 대응**
   - Restaurant 43건: EngService2에 EN 등록 없음 → 번역 대기열 우선 처리
   - TIER_A 53건: 마찬가지로 번역 대기열
   - CORE27 5건: 중요 관광지 EN 미등록 여부 재확인 (searchKeyword2 국가 전체 탐색)

3. **EN_PARTIAL 35건 보강**
   - EN overview/image 누락 장소 → visitgyeongju EN 채널 보강 검토

4. **번역 대기열 136건 처리**
   - Translation 파이프라인 별도 단계 진행

5. **visitgyeongju EN 공식 연결 확인**
   - 현재 hexID 패턴 INFERRED 상태 → 개별 EN 페이지 실제 확인 필요

6. **ldongCode2 / lclsSystmCode2 경주 실측**
   - 필요 시 별도 단계에서 확인

---

## Git

```
브랜치: data/gyeongju-en-235-full-collection-v1
Base:   5fc111b (data/gyeongju-engservice2-contract-10-pilot-v1)
```

작업을 완료했습니다
