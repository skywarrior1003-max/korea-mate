# Seoul VisitSeoul Source Content Entity Classification v1

| 항목 | 값 |
|---|---|
| TASK | TASK-SEOUL-TRAVEL-VALUE-INTEGRATION-AND-ENTITY-MODEL-V1 |
| 생성일 | 2026-08-10 |
| 적용 범위 | 전국 공통 원칙 (서울 실증 기반) |
| DB 변경 | 0 |

---

## 핵심 원칙

> **SOURCE_CONTENT_EQUALS_PHYSICAL_PLACE = NO**

VisitSeoul CID가 존재한다는 이유만으로 그것이 실제 물리적 장소(Physical Place)라고 자동으로 처리하면 안 된다.

---

## SOURCE_CONTENT_TYPE 분류

| 타입 | 정의 | 서울 예시 |
|---|---|---|
| `PHYSICAL_PLACE` | 실재하는 물리적 장소. 방문 가능한 고정 위치. | 경복궁, 수락산, 청계천, 롯데월드, 씨라이프 |
| `EXPERIENCE_CONTENT` | 특정 장소에서의 활동·경험. 시간/계절/활동 의존. | 남산서울타워 야경, 뚝섬 한강공원 수영장, 한강몽땅 여름축제 |
| `ROUTE_COURSE` | 경로·코스 자체가 콘텐츠. 시작점 ≠ 목적지. | 서울 둘레길 코스 안내(KOP015873), 한강 자전거 코스(KOP002871), 남산 둘레길 |
| `EVENT` | 기간이 있는 이벤트. 시작·종료일 필수. | 양재천 벚꽃축제, 창덕궁 달빛기행, 영등포 봄꽃축제 |
| `EDITORIAL_CONTENT` | 여러 장소를 묶은 큐레이션 콘텐츠. 단일 위치 없음. | 서울 도보해설관광 코스 안내, 나혼자 간다 솔로투어코스 |
| `MULTI_PLACE_CONTENT` | 다중 장소를 포함하는 콘텐츠. | 서울 둘레길 코스 안내 (21개 코스) |
| `UTILITY_SERVICE` | 여행 편의 서비스. 장소에 附隨. | 물품보관소 (삼성역, 잠실역, DDP), 자전거 대여 |
| `UNKNOWN` | 분류 불명확. USER_REVIEW_REQUIRED. | — |

---

## 실증 예시 (서울 inventory 기반)

### PHYSICAL_PLACE ✅

| CID | 제목 | 근거 |
|---|---|---|
| KOP003165 | 수락산 | 산 — 고정 물리 위치 |
| KOP000034 | 청계천 | 하천 — 고정 위치 |
| KOP001838 | 서울숲 | 공원 — 고정 위치 |
| KOP000374 | 씨라이프 코엑스아쿠아리움 | 테마파크/시설 |
| KOP002192 | 롯데월드 어드벤처 | 테마파크 |
| KOP000036 | 남산서울타워 | 건물/시설 |

### EXPERIENCE_CONTENT ⚡

| CID | 제목 | 근거 |
|---|---|---|
| KOP016321 | 남산서울타워 야경 | 야경 = 시간대 의존 경험 |
| KOP016327 | 선유도 야경 | 야경 경험 |
| KOPbdyynw | 뚝섬한강공원 | 한강공원 자체가 multi-experience hub |
| KOP005750 | 뚝섬 한강공원 수영장 | 계절 시설 경험 (여름만) |
| KOP009044 | 뚝섬 한강공원 눈썰매장 개장 | 계절 이벤트 |

### ROUTE_COURSE 🗺

| CID | 제목 | 거리 | 근거 |
|---|---|---|---|
| KOP015873 | 서울 둘레길 코스 안내 | 156.5km (21코스) | 코스 안내 — 경로 자체 |
| KOP002871 | 한강 자전거 코스 | 240km | 자전거 루트 |
| KOP9jn7zj | 남산 둘레길 | — | 둘레길 = 루트 |
| KOP036754 | 송파둘레길 | 21km | 둘레길 = 루트 |
| KOP028658 | 소월길 | 3.7km | 도보 루트 |

### EVENT 📅

| CID | 제목 | 타입 |
|---|---|---|
| KOP002429 + 이벤트 | 양재천 벚꽃 등 축제 | 계절 축제 |
| KOP037592 | 창덕궁 달빛 기행 | 야간 문화 이벤트 |
| KOP021770 | 2017 고궁음악회 | 전통 공연 (반복성 있음) |
| KOPi94zwj | 2025 영등포 여의도 봄꽃축제 | 계절 축제 |

### EDITORIAL_CONTENT 📖

| CID | 제목 | 근거 |
|---|---|---|
| KOP031741 | 서울 도보해설관광 신규코스 오픈 이벤트 | 도보 투어 큐레이션 |
| KOP036730 | 나혼자 간다 (솔로투어코스) | 솔로 여행 코스 큐레이션 |
| KOP008594 | 한강 역사탐방 프로그램 | 프로그램 안내 |

### UTILITY_SERVICE 🔧

| CID | 제목 | 근거 |
|---|---|---|
| KOPfitqa2 | 삼성역 물품보관소 | 물품보관 서비스 |
| KOPpwo7rk | 잠실역 물품보관소 | 물품보관 서비스 |
| KOPw1zwwt | DDP 물품보관소 | 물품보관 서비스 |
| KOPtdi6q6 | 롯데월드타워 물품보관소 | 물품보관 서비스 |

---

## 플랫폼 구현 요구사항

> schema/DB 구현 이번 TASK 금지. 요구사항만 문서화.

```
RULE SCT-1: 모든 VisitSeoul CID는 SOURCE_CONTENT_TYPE 판정 후 처리.
RULE SCT-2: PHYSICAL_PLACE만 city_spots canonical entity로 직접 변환 후보.
RULE SCT-3: EXPERIENCE_CONTENT는 기반 PLACE entity와 experience_of 관계로 연결.
RULE SCT-4: ROUTE_COURSE는 별도 route entity (시작좌표만 city_spots에 저장 불가).
RULE SCT-5: EVENT는 start_date/end_date 필수 — 날짜 없으면 CURRENT_STATUS=UNKNOWN.
RULE SCT-6: EDITORIAL_CONTENT는 포함된 장소 개별 entity를 참조하는 collection.
RULE SCT-7: UTILITY_SERVICE는 PHYSICAL_PLACE entity의 amenity 속성으로 연결.
RULE SCT-8: UNKNOWN은 USER_REVIEW_REQUIRED — 자동 처리 금지.
```

---

## 판정 기준 (SOURCE_CONTENT_TYPE 결정 플로우)

```
1. 제목/요약에 날짜/기간 언급이 있고 일시적인가?
   YES → EVENT

2. 경로/코스/km가 핵심이며 단일 위치가 없는가?
   YES → ROUTE_COURSE

3. 물리적으로 방문 가능한 고정 위치인가?
   YES → PHYSICAL_PLACE (+ EXPERIENCE_CONTENT 하위 분류 가능)

4. 특정 PHYSICAL_PLACE에서의 계절/시간대/활동 경험인가?
   YES → EXPERIENCE_CONTENT (hosting_place 참조)

5. 여러 장소를 묶은 큐레이션인가?
   YES → EDITORIAL_CONTENT

6. 편의 서비스인가?
   YES → UTILITY_SERVICE

7. 위 모두 불명확?
   → UNKNOWN (USER_REVIEW_REQUIRED)
```

---

## Source Content ≠ Physical Place 원칙 (전국 공통)

이 원칙은 서울뿐 아니라 전국 모든 도시 데이터 처리에 적용:

- 부산 비짓부산 콘텐츠도 동일 분류 필요
- 경주 KTO/공식 API 콘텐츠도 동일 분류 필요
- "북악산 야경"이 CID를 갖는다는 이유만으로 북악산과 별개의 물리 장소로 생성 금지
- 이벤트 CID를 장소 CID로 변환 금지
