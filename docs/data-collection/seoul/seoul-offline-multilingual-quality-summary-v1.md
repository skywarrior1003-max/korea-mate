# 서울 오프라인 다국어 품질 감사 v1

| 항목 | 값 |
|---|---|
| TASK | TASK-SEOUL-NIGHT-OFFLINE-MULTILINGUAL-ENTITY-RELATION-QUALITY-AUDIT-V1 |
| 감사일 | 2026-08-10 |
| 입력 | seoul-visitseoul-full-inventory-v1.jsonl (3,765건) |
| API 호출 | 0 |
| 자동 변경 | 0 |

---

## A. 다국어 링크 구조 무결성

### 전체 링크 coverage

| 언어 | 링크 보유 건수 | 비율 | 누락 |
|---|---|---|---|
| EN | 3,610 | 95.9% | 155 |
| JA | 3,408 | 90.5% | 357 |
| ZH-CN | 3,395 | 90.2% | 370 |
| ZH-TW | 3,386 | 90.0% | 379 |
| RU | 1,337 | 35.5% | — |
| MS | 788 | 20.9% | — |

### 구조 이상 감지

```
SELF_LINK_COUNT                 = 0
DUPLICATE_LANGUAGE_LINK_COUNT   = 0
LANG_CODE_MISMATCH_COUNT        = 0
MULTI_LANG_STRUCTURE_ANOMALY    = 0
MULTILINGUAL_STRUCTURAL_ANOMALIES = 0
```

**이상 없음 — multi_lang_list 필드 전체 3,765건 구조적으로 정상.**

### KO-only 레코드

```
KO_ONLY_RECORDS = 110
  (EN/JA/ZH-CN/ZH-TW 4개 언어 모두 링크 없음)
```

KO-only 레코드는 주로 소규모 지역 음식점, 일반 상점, 분류 미확정 레코드로 구성된다.  
외국인 여행자 대상 AI 일정 추천 대상에서 자동 제외 고려 필요.

---

## B. 고우선순위 언어 Gap

```
HIGH_PRIORITY_LANGUAGE_GAP_COUNT = 258
```

HIGH_VALUE_TRACKS (PLACE_CORE_CANDIDATE, EXPERIENCE_CANDIDATE,  
TEMPLE_STAY_CANDIDATE, SHOPPING_REVIEW) 또는 HIGH_TRAVEL_VALUE / INTENT_SPECIFIC_VALUE  
signal 보유 레코드 중 target 언어 1개 이상 링크 누락 건.

이 258건은 AI 일정 추천 단계에서 다국어 콘텐츠 연결 시 gap이 되므로  
VisitSeoul multilingual CID 기반 보강 우선 대상이다.

---

## C. 패턴 분포

| 패턴 | 예시 | 의미 |
|---|---|---|
| 5-lang (ko+EN+JA+ZH-CN+ZH-TW) | 다수 | 주요 관광지 |
| 7-lang (+ RU + MS) | 일부 | 고방문 랜드마크 |
| ko-only | 110건 | 다국어 미등록 |
| ko+EN only | 소수 | 부분 등록 |

---

## D. 권고사항

1. **KO-only 110건**: 여행자 타겟 AI 일정 제외 기본 처리. 단, 한국어 사용 여행자 서비스용으로는 유지.
2. **High-priority gap 258건**: 다음 multilingual content 보강 pipeline에서 EN/JA/ZH 링크 공식 확인 우선.
3. **구조 이상 0건**: multi_lang_list 파싱 정책 현행 유지.

---

## QA 플래그

```
MULTILINGUAL_STRUCTURAL_ANOMALIES = 0
KO_ONLY_RECORDS = 110
HIGH_PRIORITY_LANGUAGE_GAP = 258
EN_COVERAGE = 95.9%
JA_COVERAGE = 90.5%
ZH_CN_COVERAGE = 90.2%
ZH_TW_COVERAGE = 90.0%
API_CALLS = 0
AUTO_CHANGE = 0
AUDIT_COMPLETE = YES
```
