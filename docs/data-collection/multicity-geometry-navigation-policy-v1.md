# GoKoreaMate — Multicity Geometry / Navigation Policy v1

| 항목 | 값 |
|---|---|
| 버전 | v1 |
| 작성일 | 2026-08-17 |
| 작성 TASK | TASK-BUSAN-NONFOOD-COMPLETE-AND-COMMON-GEOMETRY-V1 |
| 근거 | 제주 수집 검증: 구역형/선형 관광장소도 실제 방문 좌표 확보 가능 |
| 적용 범위 | 부산 → 경주 → 서울 → 제주 → 전주 및 이후 전 도시 |
| 승격 대상 | `data/multicity-common-baseline-v1` |

---

## 핵심 원칙

```
SEARCHABLE_PLACE_REQUIRES_NAV_COORD = YES
COORD_ABSENCE_EQUALS_SERVICE_INCOMPLETE = YES
AREA_LINE_COORD_EXEMPTION = FORBIDDEN
```

**모든 SEARCHABLE / EXPLORE / USER_CAN_SELECT / AI_ITINERARY 후보는
navigation 가능한 위치정보 확보를 목표로 한다.**

`좌표 없음 = 서비스 완료 아님`

---

## RULE-H — Area/Line 장소도 좌표 예외 금지

다음 장소 유형이라고 해서 좌표 없음을 허용하지 않는다:

| 유형 | 예시 |
|------|------|
| 관광 구역 | 해운대 관광특구, 감천문화마을 |
| 해변/해안 구역 | 해운대해수욕장, 송정해수욕장 |
| 거리 · 골목 | 남포동 BIFF광장 일대, 이바구길 |
| 시장 | 국제시장, 자갈치시장 |
| 산책로 · 트레일 | 갈맷길, 해안산책로 |
| 둘레길 | 부산갈맷길 코스 구간 |
| 해안도로 | 이기대해안산책로 |
| 문화거리 | 대청로, 40계단 문화거리 |
| 복합 관광구역 | BIFF광장, 용두산공원 |
| 선형 관광지 | 절영해안산책로 |

이런 장소도 공식/검증 source에서 실제 방문 가능한 위치정보를 찾는다.

---

## RULE-I — 좌표 확보 우선순위

모든 타입의 장소에 다음 순서로 좌표를 확보한다.

| 순위 | 방법 | 설명 |
|------|------|------|
| 1 | source-provided exact lat/lng | VisitBusan/KTO raw coord |
| 2 | 공식 도로명/지번 주소 → VWorld Geocoder | exact 주소 보유 시 |
| 3 | 공식 지정 입구/출입구 좌표 | 시설 공식 안내 |
| 4 | 관광안내소/방문자센터 좌표 | 장소 자체의 공식 access anchor |
| 5 | 공식 시작점/종점 | 트레일/산책로/둘레길 |
| 6 | 공식 주차/탑승/접근지점 | 관광객 navigation anchor |
| 7 | 공식 area geometry → representative point | source에서 polygon/line 제공 시 |

**금지:**
- 임의 centroid (구/동 대표좌표)
- 지도 눈대중 좌표
- 인근 유명장소 좌표 전이
- 다른 branch/entity 좌표 전이
- 추정 좌표 생성

---

## RULE-J — Area/Line Geometry 보존

source가 area/line geometry를 제공하고 schema가 지원하는 경우 보존한다.

schema가 point만 지원하는 경우:
- 실제 관광객이 navigation할 수 있는 공식 대표 anchor 지정
- anchor 선택 근거와 provenance를 record에 기록

선형 장소 evidence 필드 권장:
```json
{
  "nav_anchor_type": "trailhead | entry_point | visitor_center | start_point | official_address",
  "nav_anchor_source": "visitbusan | kto | official_map | ...",
  "nav_anchor_evidence": "공식 안내에서 확인된 접근점"
}
```

단, 기존 common schema를 변경하지 않는다.
필요한 구조가 없으면 evidence/handoff에 보존하고 기존 필드만 사용한다.

---

## RULE-K — Coordinate Validation 기준

좌표가 숫자로 존재한다고 NAV_READY 처리하지 않는다.

반드시 확인:

| 검사 | 기준 |
|------|------|
| 부산 bbox | lat: 34.8~35.5, lng: 128.7~129.4 |
| lat ≠ lng | lat=lng 값 = 입력 오류 |
| address ↔ coord 일치 | 동/구 레벨 일치 |
| branch/entity 일치 | 다른 entity 좌표 사용 금지 |
| building number 충돌 | 소수점 이하 정밀도 확인 |
| source provenance | 자동 계산 centroid 여부 확인 |

분류:

| 상태 | 조건 |
|------|------|
| `NAV_READY_VERIFIED` | 공식 source coord, bbox 통과, address 일치 |
| `NAV_COORD_PRESENT_UNVERIFIED` | 숫자 있으나 검증 미완료 |
| `MISSING_COORD` | lat/lng 없음 |
| `COORD_OUTSIDE_BBOX` | bbox 밖 (데이터 오류) |
| `COORD_LAT_EQ_LNG` | lat=lng (입력 오류) |
| `AREA_LINE_NEEDS_ANCHOR` | 구역/선형 장소 anchor 미지정 |

---

## RULE-L — 주소 없는 경우 주소 먼저 회수

좌표 없고 주소도 없는 경우 다음 순서로 exact address 확보:

1. 기존 official raw source 재확인
2. VisitBusan/KTO official detail targeted fetch
3. 운영기관 official page
4. 부산시/공공 source
5. Naver Local Search exact entity discovery (identity discovery 보조; raw DB 구축 금지)
6. 주소 확인 후 VWorld Geocoder로 좌표 계산

---

## RULE-M — 도시별 Bbox 기준

| 도시 | lat 범위 | lng 범위 |
|------|---------|---------|
| 부산 | 34.8 ~ 35.5 | 128.7 ~ 129.4 |
| 경주 | 35.6 ~ 36.2 | 129.0 ~ 129.6 |
| 서울 | 37.4 ~ 37.8 | 126.7 ~ 127.3 |
| 제주 | 33.1 ~ 33.6 | 126.1 ~ 126.9 |
| 전주 | 35.7 ~ 35.9 | 127.0 ~ 127.2 |

---

## 다음 도시 적용 Checklist

새 도시 수집 시작 전:

```
[ ] 도시 bbox 정의 완료
[ ] source coord의 integer×10^7 변환 여부 확인
    (KTO mapy/mapx: Integer÷10^7 → float)
[ ] Area/Line 후보 목록 사전 식별
[ ] 각 Area/Line에 nav anchor 유형 결정
[ ] 임의 centroid = 0 조건 QA에 포함
[ ] VWorld API key (VWORLD_API_KEY) 환경변수 확인
[ ] address→coord 변환 실패 시 fallback 절차 정의
```

---

## 관련 문서

- `docs/data-collection/multicity-data-quality-guardrail-v1.md` — RULE-A~G (전화/좌표 semantics)
- `docs/data-collection/multicity-place-eligibility-policy-v1.md` — Place eligibility 5축
- `docs/data-collection/multicity-food-discovery-collection-policy-v1.md` — Food 정책

RULE 번호 체계: A~G = 데이터 품질 가드레일/전화·좌표 semantics, H~M = 이 문서 (Geometry/Navigation).

---

## 제주 검증 교훈 (이 정책의 근거)

제주 데이터 수집에서 확인:
- 해수욕장(point+polygon), 오름(산 정상점), 올레길(trailhead), 관광단지(입구) 등
- 이 모든 유형에서 공식/검증 source의 실제 방문 좌표 확보 가능
- 구역/선형 형태 = 좌표 없음으로 처리하는 것은 자동화 실패이며 서비스 결함
- 공식 source에 explicit lat/lng 없더라도 공식 주소 → VWorld geocode로 좌표 확보 가능

```
AREA_LINE_NO_COORD_IS_PIPELINE_FAILURE = YES
SOURCE_PROVIDED_COORD_ALWAYS_CHECKED_FIRST = YES
OFFICIAL_ADDRESS_VWORLD_GEOCODE_FALLBACK = YES
INVENTED_COORD_FROM_CENTROID = FORBIDDEN
```
