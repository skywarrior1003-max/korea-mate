# 부산 TourAPI Update 예외 14건 — 검토 자료

**생성일:** 2026-07-22  
**입력 run:** `tmp/tourapi-nightly/runs/20260722-115147/`  
**대상 도시:** busan  
**총 예외:** 14건 (wrong_match 1 · duplicate_conflict 6 · no_match 7)

---

## 요약

| 상태 | 건수 | issue_type |
|------|------|------------|
| wrong_match | 1 | confirmed_wrong_match |
| duplicate_conflict | 6 (3개 그룹) | manual_review 4 · separate_places 2 |
| no_match | 7 | needs_korean_service_check 7 |

duplicate_conflict 6건은 고유 충돌 contentId **3개 그룹**으로 구성된다.

---

## 1. wrong_match (1건)

### ID 30 — Jangsan Mountain

| 항목 | 값 |
|------|----|
| matched_content_id | 658477 |
| matched_title | Naejangsan Mountain Visitor Information Center (내장산 탐방안내소) |
| distance | **207.3 km** |
| issue_type | `confirmed_wrong_match` |
| official_source_needed | yes |

**원인:** 영문명 "Jangsan"이 "Naejangsan(내장산)" 앞부분과 부분 일치하여 전라북도 내장산 방문자 센터로 오매칭. 거리 207 km로 완전히 다른 지역임이 확인됨.

**권장 조치:** contentId 658477 거부 → `장산` 또는 Busan GPS(35.20°N, 129.10°E) 기반 TourAPI 재검색. 공식 한국관광공사 DB에서 장산(해운대구) 정식 contentId 확인 필요.

---

## 2. duplicate_conflict (6건 / 3개 그룹)

### 그룹 A — contentId 264250 (광안리해수욕장)

| ID | city_spot_name | distance | issue_type |
|----|----------------|----------|------------|
| 4 | Gwangalli Beach & Bridge | 0.091 km | manual_review |
| 16 | Gwangalli Beach | 0.070 km | manual_review |

**분석:** ID 4("Beach & Bridge")와 ID 16("Beach")가 동일한 TourAPI 항목(광안리해수욕장)에 매칭됨. "& Bridge"는 광안대교를 가리킬 가능성이 있어 **별도 장소 여부 확인 필요**. 확인 전 manual_review 유지.

**권장 조치:** city_spots에서 두 항목이 동일 장소인지 검토. 동일 시 통합; 광안대교가 별도 POI라면 `광안대교` 키워드로 TourAPI 재검색.

---

### 그룹 B — contentId 2382544 (자갈치시장)

| ID | city_spot_name | distance | issue_type |
|----|----------------|----------|------------|
| 3 | Jagalchi Fish Market | 0.062 km | manual_review |
| 21 | Jagalchi Market | 0.019 km | manual_review |

**분석:** "Jagalchi Fish Market"(ID 3)과 "Jagalchi Market"(ID 21)이 동일 contentId에 매칭. 명칭 유사도 및 GPS(19 m 차이)로 볼 때 **DB 중복 항목 가능성이 높음**. 그러나 Fish Market과 일반 Market이 구역이 다를 수 있으므로 확인 전 manual_review 유지.

**권장 조치:** city_spots DB에서 두 항목의 GPS 좌표 비교. 동일 좌표라면 중복 제거 후 contentId 2382544를 단일 항목에 할당.

---

### 그룹 C — contentId 2656728 (누리마루 APEC하우스)

| ID | city_spot_name | distance | issue_type |
|----|----------------|----------|------------|
| 37 | Dongbaekseom Island Walking Trail | 0.148 km | **separate_places** |
| 38 | Nurimaru APEC House | 0.088 km | **separate_places** |

**분석:** 두 항목이 **서로 다른 장소**임이 명확함. 누리마루 APEC하우스(ID 38)는 동백섬 내에 위치하여 GPS 근접으로 인해 산책로(ID 37)가 잘못 동일 contentId에 매칭됨.

- **ID 38(APEC House):** contentId 2656728 정상 매칭 (score 160, dist 88 m) → 유지
- **ID 37(Walking Trail):** 오매칭 → `동백섬 산책로` 또는 `동백섬`으로 TourAPI 재검색 필요

---

## 3. no_match (7건)

| ID | city_spot_name | issue_type | 권장 검색어 |
|----|----------------|------------|------------|
| 5 | Hwangnyeongsan Night View Trail | needs_korean_service_check | `황령산` / `황령산 야경 트레일` |
| 6 | Jangsan Mountain Trail | needs_korean_service_check | `장산 등산로` / `장산 산책로` |
| 7 | Igidae Coastal Walk | needs_korean_service_check | `이기대` / `이기대 해안산책로` |
| 27 | Taejongdae Resort Park | needs_korean_service_check | `태종대` / `태종대유원지` ★ |
| 31 | Geumjeongsan Mountain | needs_korean_service_check | `금정산` |
| 34 | Baegyangsan Mountain | needs_korean_service_check | `백양산 부산` |
| 35 | Bongnaesan Mountain | needs_korean_service_check | `봉래산` |

★ **ID 27 (태종대):** 부산 대표 관광지로 TourAPI에 미등록일 가능성이 낮음. 키워드 미스매치로 인한 no_match 가능성이 높음 — official_source_needed: yes.

**공통 원인:** TourAPI EngService2 `searchKeyword2`의 영문 키워드 검색 한계. 한국어명 검색 또는 GPS `locationBasedList2` 재시도로 대부분 해소 예상.

---

## 다음 조치 우선순위

1. **즉시 처리:** ID 30 wrong_match → contentId 거부 후 한국어 재검색
2. **DB 확인 후 처리:** 그룹 B (ID 3·21) → GPS 비교로 중복 여부 확인
3. **기획 검토 후 처리:** 그룹 A (ID 4·16) → 광안대교 별도 POI 여부 결정
4. **별도 contentId 검색:** 그룹 C ID 37 → 동백섬 산책로 TourAPI 재검색
5. **한국어 재검색 일괄 처리:** no_match 7건 (ID 5·6·7·27·31·34·35)

---

*입력 파일: `tmp/tourapi-nightly/runs/20260722-115147/results-update-busan.json`*  
*참조 상태: `tmp/tourapi-nightly/state.json` (31건 누적)*  
*자동 승인 없음 — 모든 조치는 수동 검토 후 적용할 것*
