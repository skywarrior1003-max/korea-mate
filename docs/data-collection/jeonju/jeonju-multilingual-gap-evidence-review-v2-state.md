# TASK-JEONJU-MULTILINGUAL-GAP-EVIDENCE-REVIEW-V2 State

| 항목 | 값 |
|---|---|
| TASK | TASK-JEONJU-MULTILINGUAL-GAP-EVIDENCE-REVIEW-V2 |
| 완료일 | 2026-08-20 |
| BRANCH | data/jeonju-multilingual-v1 |
| PREV_SHA | 19e3ee4af338ca5fdb8ca2e52bd7de7270529944 |
| FINAL_QA | PASS |
| SAFE_TO_CLOSE | YES |
| NEXT_TASK | TASK-JEONJU-MULTILINGUAL-MAIN-HANDOFF |

---

## 작업 내용

EN 30개 미매칭 VisitJeonju 레코드에 대해 공식 증거 검토 후 연결.
OWNER_CONFIRMED + MANUAL_CONFIRMED_OFFICIAL_EVIDENCE 방식으로 coverage 확대.
JA/ZH 미매칭 31건/30건도 동일 방법론으로 추가 조사.

---

## 최종 커버리지 (service_universe=236)

| locale | 이전 | 이후 | 방법 |
|---|---|---|---|
| EN | 62/236 (26.3%) | 89/236 (36.0%) | +7 OWNER +23 MANUAL |
| JA | 61/236 (25.8%) | 69/236 (29.2%) | +8 OWNER +3 MANUAL |
| zh-CN | 62/236 (26.3%) | 69/236 (29.2%) | +8 OWNER +2 MANUAL |

---

## OWNER_CONFIRMED_ENTITY_MAPPING 결정 (EN 기준)

| VJ EN dataSid | 제목 | 매핑 canonical | 비고 |
|---|---|---|---|
| 10031 | Jeonju Zoo | OFF-9784 (전주동물원) | 동물원 |
| 16763 | Jeonju Dreamland | OFF-9784 (전주동물원) | 동물원 내부시설로 처리 |
| 14654 | Jeonju National Museum | OFF-9756 (국립전주박물관) | 박물관 본관 |
| 16192 | Jeonju Children's Museum | OFF-9756 (국립전주박물관) | 어린이관 = 동일 canonical |
| 16136 | Nambu Market & Youth Mall | OFF-16084 (남부시장·청년몰) | 청년몰 exact match |
| 16137 | Nambu Market Night Market | OFF-16085 (남부시장 야시장) | 야시장 exact match |
| 10029 | Jeonjucheon Stream | OFF-9742 (오목대·이목대) | 전주천 = 오목대 주변 맥락으로 처리 |

---

## MANUAL_CONFIRMED_OFFICIAL_EVIDENCE (EN: 23건)

증거 유형:
- **공식 romanization**: EN 제목이 KO catalog display_name의 결정론적 로마자표기 → 동일 출처(VisitJeonju)
- **주소 매칭**: EN 주소 건물번호 ↔ kto_addr 건물번호 일치
- **Owner 구두 확인**: 색장정미소(KO이름), 마루달(공식 Instagram)
- **에코뮤지엄**: EN "21, Baramssoeneun-gil" = KO 바람쐬는길 21 (완산구) 주소 일치

---

## Gap 분류 변화 (EN 기준)

| 유형 | V1 (이전) | V2 (이후) |
|---|---|---|
| NO_VISITJEONJU_LOCALE_RECORD | 133 | 133 |
| MAPPING_GAP | 34 | 14 |
| AMBIGUOUS_MAPPING | 7 | 0 |
| **TOTAL GAP** | **174** | **147** |

AMBIGUOUS_MAPPING 7건:
- 4건 → MATCHED (전주동물원, 국립전주박물관, 남부시장·청년몰, 남부시장야시장)
- 3건 → MAPPING_GAP (전주드림랜드, 어린이박물관, 전주천: VJ 페이지가 다른 canonical로 연결됨)

---

## JA/ZH OWNER_CONFIRMED 상세

JA 8건: 전주동물원(9929,16764), 국립전주박물관(14655,16193), 남부시장야시장(16145), 남부시장청년몰(16143), 오목대(9909), 전주천(9926)
JA MANUAL 3건: 전주사고(16783), 기지제(9921), 마루달(9948→OFF-9785)

ZH 8건: 전주동물원(9899,16765), 국립전주박물관(14656,16194), 남부시장야시장(16150), 남부시장청년몰(16149), 오목대(9917), 전주천(9897)
ZH MANUAL 2건: 전주사고(16784), 기지제(9893)

---

## QA 체크리스트

```
FALSE_MATCH                    = 0
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

## 생성/수정 파일

| 파일 | V1 | V2 |
|---|---|---|
| `data/jeonju-multilingual-v1/jeonju-multilingual-enrichment-v1.jsonl` | 185건 | 236건 |
| `data/jeonju-multilingual-v1/jeonju-multilingual-gaps-v1.jsonl` | 523건 | 481건 |
| `data/jeonju-multilingual-v1/jeonju-multilingual-coverage-qa-v1.json` | V1 | V2 |
| `docs/data-collection/jeonju/jeonju-multilingual-gap-evidence-review-v2-state.md` | — | 신규 |

---

## OWNER_REQUEST_FOR_MAIN_HANDOFF = YES

EN 89/236, JA 69/236, zh-CN 69/236 → `required_core_ready=True` 기준.
KTO-only 133건은 SOURCE_NO_LOCALE 유지 (KTO JA/ZH API 승인 후 보완 가능).
