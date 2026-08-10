# 서울 Routing Blanket Rule 감사 v1

| 항목 | 값 |
|---|---|
| TASK | TASK-SEOUL-NIGHT-OFFLINE-MULTILINGUAL-ENTITY-RELATION-QUALITY-AUDIT-V1 |
| 감사일 | 2026-08-10 |
| 대상 | TASK-SEOUL-FULL-INVENTORY-ENRICHMENT-ROUTING-V1 routing script |
| API 호출 | 0 |
| 자동 변경 | 0 |

---

## 정의

**Blanket rule**: category code / keyword만으로 travel value를 단정짓는 routing 규칙.  
적용 대상 전체를 동일 routing으로 처리하며, 개별 evidence를 무시하는 경향이 있는 규칙.

---

## A. 발견된 Blanket Rule

### BLANKET_01 — 주점 전체 F (정책 위반 ⚠️)

```
Rule:  com_ctgry_sn == Ck6n0w6 → F
Category: 음식 > 주점
Affected: 60건 (기존 detail 보유 4건은 B)
IS_POLICY_VIOLATION = YES
```

**문제**:  
- 야경 루프탑 바: 전망 + 분위기 → high travel value 가능
- 전통주 양조장·체험: traditional_culture intent에 해당
- 포차 거리·포장마차: food_trip + nightlife intent
- 외국인 맞춤 바: halal / vegetarian / solo 여행 intent 대응 가능

**감사 결과**:
```
BAR_PUB_F_TOTAL = 60
BAR_PUB_B = 4 (기존 detail 보유)
BAR_PUB_UPGRADE_CANDIDATE = 28 (야경/루프탑/전통주/포차 등 키워드 보유)
BAR_PUB_UTILITY = 일부
BAR_PUB_KEEP_F = 나머지
```

**상위 upgrade 신호 보유 레코드 (일부)**:
| CID | 제목 | 신호 |
|---|---|---|
| KOP011051 | 삼거리포차 | 포차 |
| KOP011191 | 클럽 NB2 | 클럽 |
| KOP011556 | 파크 하얏트 서울 더라운지 | 루프탑, 호텔 |
| KOP014272 | 논현포차골목 | 포차 |
| KOP036858 | 느린마을 양조장 강남점 | 전통주 양조장 |
| KOP036985 | 한강주조 | 전통주 |
| KOP2h7itr | 남산술클럽 | 남산뷰, 야경 |
| KOPhnvr4s | 문래포차1422 | 포차 |

**권고 수정**: 다음 routing script v2에서 upgrade keyword 체크 추가:
```python
BAR_UPGRADE_KEYWORDS = [
    "야경", "루프탑", "rooftop", "전통주", "막걸리", "포장마차", "포차",
    "k-pop", "kpop", "뷰", "view", "경치", "풍경", "한강뷰", "남산뷰",
    "특색", "개성", "힙", "감성", "이색", "독특", "할랄", "외국인",
]
# → 위 키워드 보유 시 F 대신 A (detail 수집 필요 판정)
```

**AUTO_CHANGE = 0** — 현행 routing file 유지. script v2에서 변경 적용.

---

### BLANKET_02 — 교육시설 전체 H (정책 위반 ⚠️)

```
Rule:  com_ctgry_sn == Cl2d2s1 → H
Category: 문화관광 > 교육시설
IS_POLICY_VIOLATION = YES
```

**문제**:  
- 체험형 과학관, 어린이 박물관: family_kids intent
- 미술관 부속 교육시설: exhibition intent
- 한국문화 체험 교실: traditional_culture intent

**권고**: 다음 routing script v2에서 체험/문화 키워드 보유 시 A 상향.

**AUTO_CHANGE = 0**

---

### BLANKET_03 — 대형마트 전체 F (수용 가능)

```
Rule:  com_ctgry_sn == Ct1z4k9 → F
Category: 쇼핑 > 대형마트
Affected: 3건
IS_POLICY_VIOLATION = NO (낮은 위험)
```

3건 수준에서는 acceptable. K-beauty 소품 전용 마트가 있다면 예외 적용 검토.

---

### BLANKET_04 — 숙박 전체 F (조건부 수용)

```
Rule:  com_ctgry_sn in {Ce7q5s7, Ch4v8z7, Ct9n1n3} → F (문화 키워드 없을 때)
Category: 숙박 계열
IS_POLICY_VIOLATION = NO
```

한옥/문화재/전통 키워드 보유 시 A 상향 규칙이 이미 존재하므로 현재는 acceptable.

---

## B. Bar/Pub F Routing 정책 요약

```
BLANKET_RULE_DETECTED = YES (BLANKET_01)
BAR_PUB_F_TOTAL = 60
BAR_PUB_UPGRADE_CANDIDATE = 28 (키워드 신호 보유)
POLICY_VIOLATION = YES (28건이 F로 과소 분류될 위험)
RECOMMENDED_ACTION = routing script v2 개선 (이번 task에서 auto 변경 없음)
```

---

## C. Shopping F Routing

Shopping F routing 대상이 이번 감사 범위에서 0건으로 확인됨  
(Ct1z4k9 대형마트 3건 제외, SHOPPING_REVIEW track은 별도 A/B 분류 우선).

---

## D. 요약

| Rule | 위반 | 영향 건수 | 권고 |
|---|---|---|---|
| BLANKET_01 (주점→F) | YES | 60건 중 28건 과소분류 위험 | routing v2 keyword upgrade check |
| BLANKET_02 (교육→H) | YES | 미확인 | routing v2 keyword exception |
| BLANKET_03 (마트→F) | NO | 3건 수용 | 확장 시 재검토 |
| BLANKET_04 (숙박→F) | NO | 한옥 예외 이미 존재 | 유지 |

---

## QA 플래그

```
BLANKET_RULE_DEFECT_COUNT = 2
BAR_PUB_BLANKET_RULE_DETECTED = YES
BAR_PUB_UPGRADE_CANDIDATE = 28
AUTO_CHANGE = 0
ROUTING_V2_REQUIRED = YES (BLANKET_01, BLANKET_02 수정 포함)
AUDIT_COMPLETE = YES
```
