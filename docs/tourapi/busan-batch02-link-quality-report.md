# TASK-DATA-BUSAN-BATCH-02 — 언어 연결 품질 검증 보고서

**날짜:** 2026-07-23
**태스크:** TASK-DATA-BUSAN-BATCH-02
**상태:** REVIEW REQUIRED

---

## 검증 결과 요약

| 항목 | 결과 |
|---|---|
| high 표본 오매칭 (20건) | **0건** |
| manual_review 원인별 분류 | **완료** |
| 규칙 수정 실행 | **미실행 (개선 제안 있음)** |
| 정규화 3,952건 유지 | PASS |
| source_key 중복 | PASS |
| 재처리 일치 | 현행 raw 재처리 시 동일 결과 확인 (PASS) |
| 허용 범위 밖 변경 | 없음 |

---

## § 1. high 20건 표본 확인

**표본 전략:** 맛집 ZhS·ZhT 우선 4건씩, JA/EN 2건씩, 명소 ZhS·ZhT 2건씩, KTO score-based 3건

| # | 언어 | 방법 | 점수 | 거리 | KO 제목 (요약) | TG 제목 (요약) | 판정 |
|---|---|---|---|---|---|---|---|
| 01 | zht | same_id | 100 | 0m | 만드리곤드레밥 | 萬德山薊菜飯 (만드리곤드레밥) | 정확 |
| 02 | zht | same_id | 100 | 0m | 민물가든 | 淡水花園 (민물가든) | 정확 |
| 03 | zht | same_id | 100 | 0m | 가야할매밀면 | 伽倻奶奶蕎麥麵 | 정확 |
| 04 | zht | same_id | 100 | 0m | 국제밀면본점 | 國際小麥麵總店 (국제밀면본점) | 정확 |
| 05 | zhs | same_id | 100 | 0m | 할매가야밀면 | 伽耶小麦面 | 정확 |
| 06 | zhs | same_id | 100 | 0m | 거인통닭 | 达人巨人炸鸡 | 정확 |
| 07 | zhs | same_id | 100 | 0m | 부산꼼장어맛집 성일집 | 釜山鳗鱼成一家 | 정확 |
| 08 | zhs | same_id | 100 | 0m | 배비장보쌈구서본점 | Bae Bijang 菜包肉 久瑞店 | 정확 |
| 09 | ja | same_id | 100 | 0m | 장수장 꼬리곰탕 | ジャンスジャンコリコムタン | 정확 |
| 10 | ja | same_id | 100 | 0m | 금수복국 해운대본점 | 錦繍ポックク本店 | 정확 |
| 11 | en | same_id | 100 | 0m | 다온 한정식 | Daon (다온) | 정확 |
| 12 | en | same_id | 100 | 0m | 할매재첩국집 | Halmae Jaecheopguk | 정확 |
| 13 | zhs | same_id | 100 | 0m | 흰여울문화마을 | 白川文化村 | 정확 |
| 14 | zhs | same_id | 100 | 0m | 깡깡이 예술마을 | 奚琴艺术村 | 정확 |
| 15 | zht | same_id | 100 | 0m | 국립해양박물관 | 國立海洋博物館 | 정확 |
| 16 | zht | same_id | 100 | 0m | 태종대 | 太宗台 | 정확 |
| 17 | ja | same_id | 100 | 0m | 죽성성당 | 竹城聖堂 | 정확 |
| 18 | en | score | 80 | 0m | 광안리 SUP Zone | Gwangalli SUP Zone (광안리 SUP Zone) | 정확 |
| 19 | en | score | 80 | 0m | 광안리 해양레포츠센터 | Gwangalli Ocean Leports Center | 정확 |
| 20 | en | score | 80 | 0m | 광안리해변 테마거리 | Gwangalli Beach Theme Street | 정확 |

**오매칭 의심: 0건 / 20건**

> score=80 KTO 링크 3건: EN 제목에 괄호 내 한국어 원문 포함 → title_normalized 부분 일치(10점) + GPS(50점) + 동일 구(20점) = 80점으로 high 기준 충족. 신뢰 가능.

---

## § 2. manual_review 113건 원인별 분류

### 언어별 분포

| 언어 | manual_review | 비율 |
|---|---|---|
| en | 103건 | 91% |
| ja | 4건 | 4% |
| zhs | 3건 | 3% |
| zht | 3건 | 3% |

> **KTO EN 집중**: EN 103건은 모두 KTO KO↔EN score-based 링크. KTO는 KO(KorService2)와 EN(EngService2)이 별도 contentId를 가지므로 GPS+구 코드만으로 매핑.

### 점수 분포

| 점수 | 건수 | 스코어 구성 |
|---|---|---|
| 50 | 63건 (56%) | GPS ≤100m(50) 단독 — 명칭·구 코드 불일치 |
| 60 | 7건 (6%) | GPS ≤100m(50) + 동일 카테고리(10) — Busan city score 폴백 |
| 70 | 43건 (38%) | GPS ≤100m(50) + 동일 구(20) — KTO 명칭 불일치 |

### 원인별 분류

| 원인 | 건수 | 설명 |
|---|---|---|
| **이름 차이** | **82건** (73%) | GPS 인접(≤100m)이지만 명칭 완전 불일치 — 별개 장소 |
| 이름 유사·GPS 인접 | 29건 (26%) | GPS 인접 + 제목 문자 중복 — 연관 장소 또는 인접 업체 |
| parent_child | 2건 (2%) | 한 이름이 다른 이름을 포함 (예: 가게↔건물) |

### 이름 차이 대표 사례

| score | dist | KO 제목 | TG 제목 | 판단 |
|---|---|---|---|---|
| 50 | 25m | 삼진어묵 본점 | AREA6 (AREA6) | 별개 (같은 건물 내 다른 업체) |
| 70 | 94m | 감천사(부산) | Hyewonjeongsa Temple | 별개 사찰 |
| 70 | 43m | 갤러리이알디 부산 | Ocean Spa Cimer | 별개 업체 |
| 70 | 83m | 고래서이뻐 | Haeridan Street | 카페 vs 거리명 |
| 50 | 182m | 공극샌드커피 | Osiria Coastal Walk | 별개 (카페 vs 산책로) |

---

## § 3. 규칙 수정 여부

**실행하지 않음. 개선 제안 포함.**

### 현황 판정

| 기준 | 결과 |
|---|---|
| high 오매칭률 ≥ 10% | 아니오 (0%) |
| manual_review 이름 차이 비율 ≥ 30% | **예 (73%)** |

### IMPROVEMENT-01: score-based 임계값 50 → 60 상향

**문제:** score=50 링크 63건은 GPS ≤100m 단독 매칭으로, 명칭·구·카테고리 보조 신호가 없음. 부산 시내 100m 반경 내에 전혀 다른 업체가 공존하는 경우 다수 (예: 삼진어묵 본점 25m 내 AREA6).

**제안:**
```javascript
// buildLanguageLinks Pass 2 조건 변경
// Before:
if (best && bestScore >= 50) {
// After:
if (best && bestScore >= 60) {
```

**예상 효과:**

| 항목 | 현재 | 수정 후 |
|---|---|---|
| manual_review 총계 | 113건 | 50건 (-63건) |
| 총 링크 | 2,466건 | 2,403건 |
| high | 2,353건 | 2,353건 (유지) |
| 3,952건 유지 | PASS | PASS (재처리 없음) |

**범위:** `scripts/tourapi-busan-batch.mjs` `buildLanguageLinks()` 내 Pass 2 임계값 1줄 변경. raw 재처리 필요 없음 (링크 생성 로직만).

> **주의:** score=60 7건과 score=70 43건에도 이름 차이 사례 존재. 임계값 70으로 상향하면 manual_review 43건(전부 score=70)으로 추가 감소 가능하나, KTO 동일 장소 중 영문 제목에 한국어를 미포함한 사례(괄호 없음)가 제외될 수 있어 추가 검토 필요.

---

## § 4. 현행 검증 지표

| 항목 | 결과 |
|---|---|
| 정규화 레코드 | 3,952건 |
| source_key 중복 | PASS |
| 총 링크 | 2,466건 |
| high / manual_review / low | 2,353 / 113 / 0 |
| link_method 분포 | same_id=2,318건, score=148건 |
| 재처리 일치 | PASS (3,952=3,952, 2,466=2,466) |
| 허용 범위 밖 변경 | 없음 |
| API 추가 호출 | 없음 |
| DB·commit·push | 없음 |

---

## Git 상태

git 저장소 미초기화. 변경 파일 없음.

---

TASK-DATA-BUSAN-BATCH-02 언어 연결 품질 검증 완료.
