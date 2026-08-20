# TASK-JEONJU-MULTILINGUAL-VISITJEONJU-MAPPING-V1 State

| 항목 | 값 |
|---|---|
| TASK | TASK-JEONJU-MULTILINGUAL-VISITJEONJU-MAPPING-V1 |
| 완료일 | 2026-08-20 |
| BRANCH | data/jeonju-multilingual-v1 |
| FROM_SHA | b3645d711143234b79407529f1a9b15babe934c0 (jeonju final) |
| COMMON_POLICY_COMMIT | 1fb26351d4e195cdc6218d3b4417309e1f1838f3 |
| FINAL_QA | PASS |
| SAFE_TO_CLOSE | YES |
| NEXT_TASK | TASK-JEONJU-MULTILINGUAL-MAIN-HANDOFF (다국어 데이터 → canonical 반영 논의) |

---

## 수집 방법론

### Primary Match: unique normalized phone
- VisitJeonju EN/JA/zh-CN 상세 페이지 HTML에서 전화번호 추출
- 정규화: `+82-63-XXX-XXXX` → `063XXXXXXX` (digits only, `~` 내선 제거)
- catalog `phone` 필드와 1:1 대조
- generic phone `0632221000` (전주시청 대표번호, 25건 공유) 제외

### Secondary Match: address building number
- phone 충돌(2건 이상) → EN 주소 앞 건물번호 vs kto_addr 건물번호 비교
- 1건 확정 시 MATCHED_CONFIRMED, 실패 시 AMBIGUOUS_MAPPING

### 금지 방법
- name fuzzy matching
- 번역·AI 번역
- KTO JA/ZH 미승인 API (JpnService2, ChsService2)
- 추정 좌표 생성

---

## Source 구조

| 소스 | 범위 | 비고 |
|---|---|---|
| VisitJeonju EN | BBS_0000016 (92건) | tour.jeonju.go.kr/eng |
| VisitJeonju JA | BBS_0000017 (92건) | tour.jeonju.go.kr/jpn |
| VisitJeonju zh-CN | BBS_0000018 (92건) | tour.jeonju.go.kr/cnh |
| KTO EngService2 | EN=0 (Jeonju KTO EN 미존재) | 보조 불가 |
| KTO JpnService2 | 403 Forbidden (미승인) | 보조 불가 |
| KTO ChsService2 | 403 Forbidden (미승인) | 보조 불가 |

---

## 수집 결과

### catalog 구조 (236 ACTIVE_SERVICE)

```
SOURCE=OFFICIAL : 103건 (VisitJeonju KO 기반, 전화번호 99/103 보유)
SOURCE=KTO      : 133건 (KTO-only, 전화번호 0/133)
```

### phone collision groups (5개)

| 전화번호 | 건수 | 비고 |
|---|---|---|
| 0632221000 | 25 | 전주시청 대표번호 → GENERIC, 매칭 제외 |
| 0632841344 | 2 | 남부시장·청년몰 + 남부시장 야시장 |
| 0632235651 | 2 | 어린이박물관 + 국립전주박물관 |
| 0632816759 | 2 | 전주드림랜드 + 전주동물원 |
| 0632812114 | 2 | 오목대·이목대 + 전주천 |

### locale별 매칭 결과

| locale | VisitJeonju 공식 건수 | MATCHED_CONFIRMED | required_core_ready | coverage |
|---|---|---|---|---|
| EN | 92 | 62 | 62/236 | 26.3% |
| JA | 92 | 61 | 61/236 | 25.8% |
| zh-CN | 92 | 62 | 62/236 | 26.3% |

### match_stats 상세 (EN 기준)

```
unique_match          : 61
collision_resolved    :  1 (건물번호 비교 성공)
collision_unresolved  :  7 → AMBIGUOUS_MAPPING
generic_phone         :  1 (0632221000)
no_phone_in_source    : 19 (VisitJeonju EN 페이지 전화번호 미기재)
no_catalog_match      :  3 (VisitJeonju EN 전화 ≠ catalog)
fetch_transient       :  0
```

### gap 분류 (EN 기준 174건)

```
NO_VISITJEONJU_LOCALE_RECORD : 133 (KTO-only — VisitJeonju EN 수록 없음)
MAPPING_GAP                  :  34 (OFFICIAL이나 phone 기반 특정 불가)
AMBIGUOUS_MAPPING            :   7 (phone collision 미해소)
```

---

## Coverage 제약 원인

- **KTO-only 133건**: VisitJeonju에 수록되지 않은 숙박·식당·상업시설 위주
  → KTO JA/ZH API 승인 후 보완 가능 (현재 403 Forbidden)
- **MAPPING_GAP 34건**: OFFICIAL 중 VisitJeonju EN에 수록은 있으나
  해당 page가 phone을 미기재하거나(19건), phone collision이 해소 불가
- **AMBIGUOUS_MAPPING 7-8건**: 2개 catalog record가 동일 phone 공유
  → 건물번호 비교로도 식별 불가 (동일 부지 시설)

---

## 생성 파일

| 파일 | 건수 |
|---|---|
| `data/jeonju-multilingual-v1/jeonju-multilingual-enrichment-v1.jsonl` | 185 |
| `data/jeonju-multilingual-v1/jeonju-multilingual-gaps-v1.jsonl` | 523 |
| `data/jeonju-multilingual-v1/jeonju-multilingual-coverage-qa-v1.json` | — |
| `scripts/run-jeonju-multilingual-collection-v1.py` | — |

---

## QA

```
CANONICAL_CHANGED              = 0  (b3645d7 유지)
NEW_PLACES_CREATED             = 0
COORD_CHANGED                  = 0
TRANSLATION_USED               = NO
ZH_TW_COLLECTED                = NO
FUZZY_NAME_MATCHING_USED       = NO
KTO_JA_ZH_UNAPPROVED_API_USED = NO
SECRET_LEAKED                  = NO
FORCE_PUSH_USED                = NO
GIT_ADD_ALL_USED               = NO
```

---

## OWNER_REQUEST_FOR_MAIN_HANDOFF = YES

handoff 권고: EN/JA/zh-CN 모두 `required_core_ready=True`인 record만 handoff 대상.
KTO-only 133건은 `SOURCE_NO_LOCALE` — KTO JA/ZH API 승인 후 재수집 필요.
