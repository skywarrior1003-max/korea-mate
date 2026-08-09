# 서울 데이터 수집 전 사용자 확인 항목

**as_of:** 2026-08-09
**branch:** data/seoul-collection-v1
**TASK:** TASK-SEOUL-SOURCE-DISCOVERY-COVERAGE-AUDIT-V1

---

## GROUP A — FALSE POSITIVE 의심 (관광지로 보기 애매한 후보)

KTO TourAPI areaCode=1 sample에서 발견.
각 항목에 대해 KEEP / EXCLUDE / MORE_RESEARCH 결정 요청.

| no | 장소명 | source | 제안 category | 주소 | 유입 원인 | 관광 가능성 | 제외 가능성 | 추천 | 결정 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 강동문화원 | KTO TourAPI | 문화시설(culture) | 서울특별시 강동구 상암로 168 (천호동) | KTO contentTypeId=14 등재 | 낮음 (회사/기관/시설 명칭) | 보통 | MORE_RESEARCH | — |
| 2 | 건국대학교 상허기념도서관 | KTO TourAPI | 문화시설(culture) | 서울특별시 광진구 능동로 120 (화양동) | KTO contentTypeId=14 등재 | 낮음 (회사/기관/시설 명칭) | 높음 | MORE_RESEARCH | — |
| 3 | 경희대학교 자연사박물관 | KTO TourAPI | 문화시설(culture) | 서울특별시 동대문구 경희대로 26 (회기동) | KTO contentTypeId=14 등재 | 낮음 (회사/기관/시설 명칭) | 높음 | MORE_RESEARCH | — |
| 4 | 고려대학교 박물관 | KTO TourAPI | 문화시설(culture) | 서울특별시 성북구 안암로 145 (안암동5가) | KTO contentTypeId=14 등재 | 낮음 (회사/기관/시설 명칭) | 높음 | MORE_RESEARCH | — |
| 5 | 관악문화원 | KTO TourAPI | 문화시설(culture) | 서울특별시 관악구 신림로3길 35 (신림동) | KTO contentTypeId=14 등재 | 낮음 (회사/기관/시설 명칭) | 보통 | MORE_RESEARCH | — |
| 6 | 강서청소년회관 | KTO TourAPI | 레포츠(leisure/sports) | 서울특별시 강서구 공항대로42길 23-19 | KTO contentTypeId=28 등재 | 낮음 (회사/기관/시설 명칭) | 보통 | MORE_RESEARCH | — |
| 7 | 관악청소년센터 | KTO TourAPI | 레포츠(leisure/sports) | 서울특별시 관악구 신림로23길 17 (신림동) | KTO contentTypeId=28 등재 | 낮음 (회사/기관/시설 명칭) | 보통 | MORE_RESEARCH | — |
| 8 | 광운대학교 아이스링크 | KTO TourAPI | 레포츠(leisure/sports) | 서울특별시 노원구 광운로 20 (월계동) | KTO contentTypeId=28 등재 | 낮음 (회사/기관/시설 명칭) | 높음 | MORE_RESEARCH | — |

### GROUP A 집계
- 총 FP 의심: 8건
- EXCLUDE 추천: 0건
- MORE_RESEARCH: 8건

**주의:** 회사/기관이라도 공식 관광 체험/견학/역사 스토리가 있으면 KEEP 가능. 사용자가 최종 결정.

---

## GROUP B — FALSE NEGATIVE 의심 (primary source 누락 핵심 관광자원)

서울 대표 관광자원 32건 Benchmark 목록.
primary source(KTO)에서 발견 안 됐다면 → alternative source 탐색 또는 targeted detail 우선.

| no | 장소명 | 유형 | KTO 발견 | KTO contentId | targeted detail 가능 | 중요 이유 | 추천 next source |
|---|---|---|---|---|---|---|---|
| 1 | 경복궁 | HERITAGE_PALACE | ✅ | 126508 | YES | 서울 대표 궁궐, 유네스코 세계유산 후보, 연간 수백만 방문 | KTO_targeted_detail |
| 2 | 창덕궁 | HERITAGE_PALACE | ✅ | 2923488 | YES | 유네스코 세계유산 등재, 후원으로 유명 | KTO_targeted_detail |
| 3 | 창경궁 | HERITAGE_PALACE | ✅ | 126511 | YES | 4대 궁궐 중 하나 | KTO_targeted_detail |
| 4 | 덕수궁 | HERITAGE_PALACE | ✅ | 130173 | YES | 대한제국 황궁, 중명전 포함 | KTO_targeted_detail |
| 5 | 경희궁 | HERITAGE_PALACE | ✅ | 126484 | YES | 5대 궁궐 중 하나 | KTO_targeted_detail |
| 6 | 종묘 | HERITAGE_UNESCO | ✅ | 126510 | YES | 유네스코 세계유산, 조선 왕실 사당 | KTO_targeted_detail |
| 7 | 한양도성(서울 성곽) | HERITAGE_WALL | ❌ | 2685706 | YES | 서울 조선시대 성곽, 약 18.6km | KTO_targeted_detail |
| 8 | 남대문(숭례문) | HERITAGE_GATE | ❌ | 126553 | YES | 국보 제1호, 조선시대 성문 | KTO_targeted_detail |
| 9 | 동대문(흥인지문) | HERITAGE_GATE | ❌ | 126538 | YES | 보물 제1호, 서울 성문 | KTO_targeted_detail |
| 10 | 북촌한옥마을 | HERITAGE_VILLAGE | ✅ | 126537 | YES | 한옥 보존지구, 전통 마을 관광 | KTO_targeted_detail |
| 11 | 국립중앙박물관 | MUSEUM | 미확인 | 126676 | YES | 한국 최대 박물관, 외국인 필수 방문지 | KTO_targeted_detail |
| 12 | 국립민속박물관 | MUSEUM | 미확인 | 126695 | YES | 경복궁 내 한국 민속 박물관 | KTO_targeted_detail |
| 13 | 서울역사박물관 | MUSEUM | 미확인 | 264274 | YES | 서울 역사 전문 박물관 | KTO_targeted_detail |
| 14 | 국립한글박물관 | MUSEUM | 미확인 | 1753997 | YES | 한글 전문 박물관, 외국인 관심 높음 | KTO_targeted_detail |
| 15 | 리움미술관 | MUSEUM_PRIVATE | 미확인 | 800428 | YES | 삼성 리움, 현대미술+고미술, 국제적 명성 | KTO_targeted_detail |
| 16 | N서울타워(남산서울타워) | MODERN_ATTRACTION | 미확인 | 264337 | YES | 서울 대표 랜드마크 전망대 | KTO_targeted_detail |
| 17 | 롯데월드타워 서울스카이 | MODERN_ATTRACTION | 미확인 | 2685708 | YES | 세계 5위 높이 전망대 | KTO_targeted_detail |
| 18 | DDP(동대문디자인플라자) | MODERN_ATTRACTION | 미확인 | 1870504 | YES | 자하 하디드 설계, 쇼핑/전시 복합 | KTO_targeted_detail |
| 19 | 서울식물원 | NATURE_MODERN | 미확인 | 2611001 | YES | 2019년 개원, 대형 온실 포함 | KTO_targeted_detail |
| 20 | 북한산국립공원 | NATURE_MOUNTAIN | 미확인 | 2781026 | YES | 서울 대표 산, 연간 수백만 등산객 | KTO_targeted_detail |
| 21 | 남산 | NATURE_MOUNTAIN | 미확인 | 2685709 | YES | 서울 중심 산, N서울타워 소재지 | KTO_targeted_detail |
| 22 | 청계천 | NATURE_STREAM | 미확인 | 131220 | YES | 도심 복원 하천, 광화문~동대문 | KTO_targeted_detail |
| 23 | 한강공원 | NATURE_RIVERSIDE | 미확인 | 127248 | YES | 한강변 11개 공원, 서울 대표 야외 명소 | KTO_targeted_detail |
| 24 | 광장시장 | MARKET | 미확인 | 126668 | YES | 넷플릭스 스트리트푸드파이터 등장, 빈대떡·마약김밥 | KTO_targeted_detail |
| 25 | 남대문시장 | MARKET | 미확인 | 126571 | YES | 서울 최대 전통시장 | KTO_targeted_detail |
| 26 | 통인시장 | MARKET | 미확인 | 1920780 | YES | 도시락 카페, 엽전 체험으로 유명 | KTO_targeted_detail |
| 27 | 인사동 | FOOD_CULTURE_DISTRICT | 미확인 | 264491 | YES | 전통공예·갤러리·한식 거리 | KTO_targeted_detail |
| 28 | 이태원 | FOOD_MULTICULTURAL | 미확인 | 264483 | YES | 다국적 음식, 글로벌 관광지 | KTO_targeted_detail |
| 29 | 명동 | SHOPPING_DISTRICT | 미확인 | 264382 | YES | 서울 1등 쇼핑 관광지, K-beauty | KTO_targeted_detail |
| 30 | 홍대 | SHOPPING_CULTURE | 미확인 | 264491 | YES | 젊은이 거리, 인디음악·카페·클럽 | KTO_targeted_detail |
| 31 | SMTOWN 코엑스 아티움 | HALLYU_ATTRACTION | 미확인 | - | NO | SM엔터 공식 팬 공간, K-pop 체험 | VISITSEOUL_MANUAL_CHECK |
| 32 | BTS 그래피티 이태원 | HALLYU_ATTRACTION | 미확인 | - | NO | 공식 관광 맥락 여부 확인 필요 | VISITSEOUL_MANUAL_CHECK |

### GROUP B 정책
경주 교훈: "primary source에 없음 = 없는 곳"이 아님.
known contentId → targeted detail fetch 우선.
KTO에서 안 나오는 경우 → VisitSeoul / 개별 기관 사이트 확인.

---

## GROUP C — ENTITY/CATEGORY 애매

parent/child, 지역/개별, 시장/먹거리거리 등 entity 관계가 불명확한 후보.

| no | 장소 | source | 현재 entity | 관련 entity | 문제 | 추천 |
|---|---|---|---|---|---|---|
| 1 | 경복궁 내 향원정 | KTO | ATTRACTION | 경복궁 | PARENT_CHILD_CONFUSION | CHILD_PLACE or MERGE |
| 2 | 서울성곽(한양도성) vs 낙산공원 | KTO | HERITAGE | NATURE/PARK | MULTI_ENTITY_OVERLAP | INDEPENDENT_PLACE |
| 3 | 한강공원 vs 여의도한강공원 | KTO | NATURE | 한강공원 시리즈 11개 | PARENT_CHILD_CONFUSION | CHILD_PLACE 각자 or AREA_ZONE |
| 4 | 동대문 vs DDP vs 동대문시장 | KTO+visitseoul | SHOPPING/MODERN | 지역 복합 | AREA_ZONE vs INDIVIDUAL | USER_REVIEW_REQUIRED |
| 5 | SMTOWN vs SM엔터테인먼트 코엑스 | KTO or visitseoul | HALLYU_ATTRACTION | 코엑스 | COMPANY_OR_TOURISM_VENUE | USER_REVIEW_REQUIRED |
| 6 | 북촌한옥마을 vs 가회동 골목길 | KTO+visitseoul | HERITAGE_VILLAGE | 개별 골목/공방 | AREA_ZONE vs INDIVIDUAL | AREA_ZONE |
| 7 | 인사동 vs 쌈지길 | KTO+visitseoul | CULTURE_DISTRICT | 개별 복합 쇼핑몰 | DISTRICT vs INDIVIDUAL_ATTRACTION | USER_REVIEW_REQUIRED |
| 8 | 국립중앙박물관 vs 국립중앙박물관 특별전 | KTO+museum_api | MUSEUM | EVENT | PLACE vs EVENT_INSIDE_PLACE | INDEPENDENT (place=museum, event=separate) |
| 9 | 홍대 vs 홍대 걷고싶은거리 | KTO+visitseoul | SHOPPING_CULTURE | 거리/공간 | DISTRICT vs STREET | USER_REVIEW_REQUIRED |
| 10 | 청계천 vs 청계광장 | KTO | NATURE_STREAM | 광장 | PARENT_CHILD_CONFUSION | CHILD_PLACE |

### GROUP C 정책
자동 merge 금지.
USER_REVIEW_REQUIRED인 경우 사용자가 INDEPENDENT_PLACE / CHILD_PLACE / AREA_ZONE / COURSE_STOP 결정.

---

## 사용자 결정 후 → 다음 TASK

GROUP A/B/C 확인 완료 후 bulk collection TASK 시작.

SEOUL_BULK_COLLECTION = NOT_STARTED (이번 TASK 종료 후)
