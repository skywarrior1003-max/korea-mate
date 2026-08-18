# 제주 V7 Final Close State

| 항목 | 값 |
|---|---|
| 버전 | v7 |
| 작성일 | 2026-08-18 |
| 작성 TASK | TASK-JEJU-RULE-M-RESOLUTION-AND-FINAL-CLOSE-V7 |
| TASK 결과 | COMPLETE |

---

```
JEJU_BRANCH = data/jeju-targeted-completion-v1
JEJU_V4_COMMIT = 19388e4
JEJU_V7_COMMIT = <see git log after push>

COMMON_POLICY_SSOT     = data/multicity-common
BASELINE_COMMON_COMMIT = dc6f9be  (V4 기준 — EXPLICIT_REPO_PIN)
FINAL_COMMON_COMMIT    = bc8d5d4  (V7 RULE-M fix)

RULE_M_FIX = CASE_B
  이전 bbox: lat 33.1-33.6, lng 126.1-126.9 (너무 좁음)
  수정 bbox: lat 33.0-34.0, lng 126.0-127.0 (추자도/우도 포함)
  제외됐던 ACTIVE 레코드: 119건 → 수정 후 0건 제외
  VALID_COORD_CHANGED_FOR_BBOX_ONLY = 0
```

---

## V7 최종 통계

| 항목 | V4 (19388e4) | V7 (이번) | 비고 |
|---|---|---|---|
| TOTAL | 1607 | 1607 | 변동 없음 |
| ACTIVE | 1496 | 1496 | 변동 없음 |
| Place | 1230 | 1230 | |
| Food | 256 | 256 | |
| Event | 10 | 10 | |
| NAV_READY | 1493/1496 | **1496/1496** | NAV-3 해결 |
| NAV_MISSING | 3 | **0** | ✓ |
| AI_AUTO=True | 878 | **895** | +17 |
| FOOD_IMG | 254/256 | 254/256 | |
| RULE-M outlier | 119 | **0** | bbox 수정으로 해결 |
| CORE_DEST ai_auto=False | 13 | **0** | 일괄 수정 |

---

## Phase 5: NAV-3 해결

| CID | 장소명 | 좌표 | anchor |
|---|---|---|---|
| CNTS_300000000012898 | 성안올레 | 33.5149814, 126.5284018 | 쉼터 꼬닥꼬닥(관덕로17길 27-1) |
| CNTS_300000000014728 | 애월 몽달 | 33.4143323, 126.3118679 | 봉성로2길 34-3 |
| CNTS_200000000010375 | 제주환상자전거길 | 33.3694259, 126.2060648 | 해거름마을공원(일주서로 4611) |

좌표 source: VWorld Road Geocoding API (RULE-I Step 3)

---

## Phase 6: AI Eligibility 수정

### 6-A: CORE_DESTINATION ai_auto=False → True (13건)
금룡사 템플스테이, 금룡사, 루나폴, 성클라라수도원 금악성당, 흑돼지거리,
제주아트센터, 비케이브, 성읍녹차동굴, 도토리숲 제주점, 워터월드 제주,
안덕면사무소 수국길, 5.16도로숲터널, 제주센트럴파크

### 6-B: ACTIVITY_EXPERIENCE 체험관/오픈공간 형태 AUTO (4건)
제주인디 (자연염색 체험관), 가죽공방 손방둥이 (오픈공간),
문화공간 휴 (한복/교복 서비스), 구억리옹기체험관

원데이클래스 명시 17건: CONDITIONAL 유지 (예약 필수 implicit)

---

## QA 체크리스트

- [x] TOTAL=1607
- [x] ACTIVE=1496
- [x] NAV_READY=1496/1496 (0 missing)
- [x] RULE-M bbox outliers=0
- [x] CORE_DESTINATION ai_auto=False=0
- [x] FOOD_IMG=254/256
- [x] Event 10건 모두 nav=True
- [x] FINAL_COMMON_COMMIT=bc8d5d4 (Jeju bbox 수정 포함)

```
FINAL_QA = PASS
SAFE_TO_CLOSE = YES
NEXT_CITY = JEONJU
```
