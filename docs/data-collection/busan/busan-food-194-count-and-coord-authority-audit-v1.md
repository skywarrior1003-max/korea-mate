# TASK-BUSAN-FOOD-194-COUNT-AND-OFFICIAL-COORD-AUTHORITY-AUDIT-V1
## 완료 보고서

**작업일**: 2026-08-16  
**기반 커밋**: `1490f17` (TASK-BUSAN-FOOD-194-OFFICIAL-API-RECOVERY-V1)  
**결과**: PASS  
**브랜치**: `data/busan-food-discovery-v1`

---

## 검증 요약

태스크 명세를 검증한 결과 **실행 가능 판정** — 이전 태스크(API Recovery V1)에서 발견된 두 가지 문제(카운트 버그, 좌표 authority 기준 오류)를 정확히 지적하며, address-based authority 검증 방식은 distance-only 방식보다 우월한 개선이다. 차단 이슈 없음.

---

## §1 COUNT RECONCILIATION

**이전 보고된 값**: FOODSERVICE_EXACT_MATCHED=135, UNMATCHED=75 → 합계 210 ≠ 194  
**버그 원인**: `matched_exact=135`는 API-side record count였음. 동일 canonical에 여러 discovery candidate가 각기 다른 UC_SEQ를 가질 경우 API hit가 중복 계산됨.

**수정 결과**:

| 항목 | 값 |
|------|-----|
| `MATCHED_UNIQUE_CANONICAL` | **119** |
| `UNMATCHED_UNIQUE_CANONICAL` | **75** |
| **합계** | **194 ✓** |
| `MULTI_UCSEQ_CANONICALS` | 16 (동일 canonical에 2개 UC_SEQ가 API에 존재) |
| `TOTAL_API_RECORD_HITS` | 135 (과거 overcounting의 실체 — 16 multi-UC_SEQ 중복분 포함) |

**MULTI_UCSEQ 16건 목록**: 모모스커피 본점, 미미루, 동래할매파전, 스시시안, 쉐프리, 동백섬횟집, 부다면옥, 팔레트, 달타이, 탐복 본점, 평산옥, 신발원, 동경밥상 본점, 합천국밥집, 옛날오막집, 물꽁식당

---

## §2 COORDINATE AUTHORITY AUDIT

**이전 기준**: dist ≤ 500m(CLOSE) → 0건 → 전량 reject  
**신규 기준**: 주소 일치 여부를 primary authority로 사용. Guide 좌표와 거리 차이는 reject 사유가 아님.

**addr_match_level 기준**:
- `SAME` — district + dong + 번지/도로명 실질 동일 → `SOURCE_VERIFIED_NAV_READY`
- `SAME_DISTRICT` + name_match — district 일치, dong/상세 상이 → `GUIDE_COORD_CONFLICT_WITH_CURRENT_OFFICIAL_SOURCE`
- `DIFFERENT` — district 불일치 → `GUIDE_COORD_CONFLICT_DIFFERENT_LOCATION`

**좌표 감사 결과**:

| result | 건수 |
|--------|------|
| `SOURCE_VERIFIED_NAV_READY` | **100** |
| `NO_API_MATCH` | 75 |
| `GUIDE_COORD_CONFLICT_WITH_CURRENT_OFFICIAL_SOURCE` | 10 |
| `ALREADY_NAVIGATION_READY` | 5 |
| `MULTI_UCSEQ_CONFLICT` | 2 |
| `ADDR_UNKNOWN_PENDING` | 2 |

**NAVIGATION_READY 변화**: 5 → **105** (+100)

**`SOURCE_VERIFIED_NAV_READY` 100건**: 주소가 canonical address_ko와 동일한 FoodService entity. 공식 LAT/LNG를 navigation coord로 채택.  
`api_recovery_v1.coord_authority_v1` 블록에 `uc_seq`, `api_lat`, `api_lng`, `api_addr`, `guide_dist_m`, `phone_match` 기록.

**`GUIDE_COORD_CONFLICT_WITH_CURRENT_OFFICIAL_SOURCE` 10건**:
- 5건 `DIFFERENT_LOCATION`: 톤쇼우(금정구↔수영구), 으뜸이로리바타(해운대↔수영구), 모리(주소 불일치 558m), 델리봉(수영↔연제구), 편의방(중구↔서구)
- 5건 `SAME_DISTRICT_NAME_MATCH`: 스시시안, 쇼진, 소수인, 동삼정, 본참치

**`MULTI_UCSEQ_CONFLICT` 2건**: 미미루(1265·1555), 달타이(1573·2328) — 동일 이름의 복수 record, phone 불일치

---

## §3 GUIDE COORD SEMANTICS AUDIT

**샘플 분석 결과**: 주소가 동일한 엔티티 8건 분석

| 이름 | Guide 거리 | API 주소 동일 | 결론 |
|------|-----------|-------------|------|
| 율링 | 537m | ✓ | Guide 좌표 부정확 |
| 이흥용과자점 부산대직영점 | 605m | ✓ | Guide 좌표 부정확 |
| 김유순대구뽈찜 | 810m | ✓ | Guide 좌표 부정확 |
| 마파람해물찜해물탕 | 1799m | ✓ | Guide 좌표 크게 부정확 |
| 모모스커피 본점 | 3262m | ✓ | Guide 좌표 매우 부정확 |
| 선창횟집 | 2051m | ✓ | Guide 좌표 크게 부정확 |
| 1969부원동칼국수 남포본점 | 2149m | ✓ | Guide 좌표 크게 부정확 |

**판정**: Guide 좌표는 **APPROXIMATE_OR_WRONG** — 지역 구/동 수준 geocoding이거나 안내서의 주소 geocoding이 부정확. FoodService 공식 API 좌표가 더 신뢰 가능한 navigation 출처.

**근거**: 
- 주소가 완전히 동일한데도 500m~3km 이상 차이 발생
- FoodService는 사업자 등록 주소 기반 공식 DB → 상업용 geocoding보다 정밀도 높음
- Michelin·BusanMat 가이드의 좌표는 편집 과정에서 구-레벨로 round-off 된 것으로 추정

---

## §4 IMAGE

변경 없음: **120/194** (기존 그대로)

---

## 최종 카운트 요약

| 항목 | 값 |
|------|-----|
| CANONICAL 총계 | 194 |
| MATCHED_UNIQUE_CANONICAL | 119 |
| UNMATCHED_UNIQUE_CANONICAL | 75 |
| IMAGE_RESOLVED | 120/194 |
| NAVIGATION_READY | **105/194** |
| AI_AUTO | **87/194** |
| coord_authority_v1_checksum | `bad3b7ef0910` |

---

## 변경 파일

- `data/tourapi/normalized/busan/busan-food-194-canonical-v1.json`
  - Header: `matched_unique_canonical`, `unmatched_unique_canonical`, `navigation_ready_count=105`, `ai_auto_count=87`, `coord_authority_v1_*` 필드 추가
  - 100건 `navigation_ready=True`, `coord_status_r1=OFFICIAL_COORD_CONFIRMED`, `api_recovery_v1.coord_authority_v1` 추가
  - 10건 `coord_status_r1=GUIDE_COORD_CONFLICT_WITH_CURRENT_OFFICIAL_SOURCE`
  - 82건 `ai_auto=True` (navigation_ready + image 모두 충족 시)
  - `api_194_matched_uc_seq_note` 설명 추가 (이전 135의 의미 명시)

---

## WARN 항목

| WARN | 내용 |
|------|------|
| `MULTI_UCSEQ_CONFLICT_2` | 미미루·달타이: 동일 이름 2개 UC_SEQ, phone 불일치 → NAVIGATION_READY 보류 |
| `GUIDE_COORD_CONFLICT_10` | 10건 좌표 provenance 충돌 기록됨, NAVIGATION_READY=NO |
| `UNRESOLVED_74` | 이미지 미해결 74건 (image audit 별도 태스크) |
| `UNMATCHED_75` | API 미매칭 75건 (가이드 전용 Michelin/BusanMat 엔티티) |

---

## NEXT

**TASK-BUSAN-FOOD-194-FINAL-QA-V1**: 전체 194건 최종 QA
- image 120건 검증
- navigation_ready 105건 검증  
- GUIDE_COORD_CONFLICT 10건 수동 검토 후 확정
- 완료 후 서비스 배포 준비
