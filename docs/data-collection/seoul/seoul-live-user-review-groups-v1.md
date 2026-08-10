# 서울 VisitSeoul 수집 — 사용자 검토 그룹 v1

| 항목 | 값 |
|---|---|
| 버전 | v1 |
| 생성일 | 2026-08-10 |
| TASK | TASK-SEOUL-VISITSEOUL-LIVE-QUALITY-VALIDATION-V1 |
| branch | data/seoul-collection-v1 |
| 기반 | VisitSeoul API 실시간 검증 (109 calls) |

---

## ⚠️ 이 문서의 목적

VisitSeoul 수집 시 **사용자(또는 담당자)가 직접 검토해야 하는 그룹**을 정의한다.  
자동 확정(bulk INCLUDE/EXCLUDE) 금지 그룹과 그 이유를 명시한다.

---

## GROUP 1 — 자동 포함 가능 (HIGH_CONFIDENCE) ✅

다음 category는 검증 결과 FP 위험이 낮아, 수집 후 개별 검토 없이 canonical 포함 가능.

| Category | 근거 | CID 예시 |
|---|---|---|
| 역사관광 > 역사유적지 > 고궁 | 5대 고궁·종묘 전부 확인. FP 없음. | KOP000072, KOP000295, KOP000507 등 |
| 역사관광 > 역사유적지 > 성/문 | 흥인지문 등 확인. | KOP001999 |
| 문화관광 > 전시시설 > 박물관 | 국립중앙·민속·한글박물관 확인. | KOP000433, KOP001644, KOP035405 |
| 쇼핑 > 시장 | 광장시장·남대문·통인시장 확인. 하위 음식entry 분리 필요. | KOP000286, KOP000085, KOP000281 |
| 자연관광 > 자연공원 | 서울식물원·북한산 확인. | KOP027397, KOP000369 |
| 문화관광 > 랜드마크관광 | 북촌한옥마을 등 관광지 분류. | KOP000261 |

**단서**: 이벤트 entries(축제/공연/행사 category) 반드시 제거 후 포함.

---

## GROUP 2 — 조건부 포함 (CONDITIONAL_REVIEW) ⚠️

**설명이 있는 일부는 포함, 나머지는 제외** — 수집 후 리스트 확인 권장.

### 2A — 체험관광 > 산사체험

| 항목 | 내용 |
|---|---|
| 서울 확인 entry | 국제선센터 템플스테이 (KOP0pzgtj, 양천구 목동) |
| 이유 | 도심 위치. 전통 산사 아님. 예약 필수. |
| 권장 | INCLUDE — AI=CONDITIONAL (intent 조건 적용 필수) |
| AI eligibility_conditions | intents: temple_stay, traditional_culture, wellness, meditation |

### 2B — 문화관광 > 전시시설 > 미술관/화랑

| 항목 | 내용 |
|---|---|
| 확인 entry | 리움미술관(KOP001232), 국립현대미술관 덕수궁관(KOP001707) |
| 이유 | 주요 미술관은 tourism destination. 소규모 갤러리·화랑 다수 혼재. |
| 권장 | 확인된 주요 미술관 INCLUDE. 전체 list USER_REVIEW 후 소규모 갤러리 판단. |

### 2C — 역사관광 > 역사유적지 > 사적지

| 항목 | 내용 |
|---|---|
| 확인 entry | 덕수궁돌담길(KOP023563) |
| 이유 | 사적지는 관광지(고궁·성문)와 달리 도로·구역 포함 가능. |
| 권장 | 수집 후 명칭·위치 검토. 도로·구역 단순 명칭은 EXCLUDE. |

### 2D — 체험관광 > 전통체험

| 항목 | 내용 |
|---|---|
| 확인 entry | 사단법인 전통문화원(KOP012592) |
| 이유 | 전통체험 기관 vs 일반 문화원 구분 필요. |
| 권장 | 전체 list USER_REVIEW. 외국인 체험 프로그램 제공 기관만 INCLUDE. |

### 2E — 문화관광 > 레저스포츠시설

| 항목 | 내용 |
|---|---|
| 확인 entry | 잠원한강공원수영장, 뚝섬눈썰매장 등 |
| 이유 | 관광형 레저(스카이라인 집라인 등) vs 일반 체육시설 구분 필요. |
| 권장 | 외국인 관광객 방문 목적 시설만 선별. |

---

## GROUP 3 — USER_REVIEW_REQUIRED (검토 없이 포함 금지) 🔴

### 3A — 쇼핑 > 전문매장/상가

**FP 위험 HIGH (최근 50건 중 32% = FP)**

| FP 유형 | 예시 | 처리 |
|---|---|---|
| 편의점 chain | CU 성수 디저트파크점 | EXCLUDE |
| 약국 | 옵티마웰니스뮤지엄 약국 | EXCLUDE |
| 캐릭터 굿즈 매장 | 치이카와샵, 나가노마켓 | EXCLUDE (일반 체인) |
| 뷰티 브랜드 단일 매장 | 메디큐브 등 | EXCLUDE (chain) |
| Flagship travel destination | 올리브영 명동 플래그십(KOP012015) | CONDITIONAL INCLUDE |
| 성수동 trendy shop | 뉴뉴하우스(KOPmwrtiq) | USER_REVIEW (외국인 여행 목적 확인 후) |

**처리 원칙**: CID 목록 전체 USER_REVIEW → Flagship 기준 충족 시만 포함.

**Flagship 기준 (잠정)**:
1. 해당 브랜드의 최대 규모 공식 flagship store
2. 외국인 관광객이 일부러 방문하는 tourism destination급
3. VisitSeoul이 단독 등록(chain 지점 없이 1건만) = 자연 필터링 효과

### 3B — 음식 > 카페/찻집

| 항목 | 내용 |
|---|---|
| 총 건수 | 48건 |
| 위험 | 개인 카페·계절 카페 다수. AI 자동 추천 부적합. |
| 처리 원칙 | 아이콘 카페만 선별. 전체 48건 USER_REVIEW. |
| AI eligibility | NO (기본값). 아이콘 카페 CONDITIONAL 가능. |

---

## GROUP 4 — 자동 제외 (BULK_EXCLUDE) ❌

검토 없이 전체 제외.

| Category | 이유 |
|---|---|
| 축제/공연/행사 | Place 아님. 이벤트. |
| 숙박 전체 | 부산·경주 동일 원칙. AI=NO. |
| 음식 > 한식/외국식/기타 | 일반 식당. External search B(외부 지도) 처리. |
| 정보/서비스 | 관광 목적지 아님. |

---

## 구체적 검토 필요 항목 (Named Items)

### VisitSeoul에 없어 KTO 수집 필요한 곳

| 장소 | 이유 | 권장 source |
|---|---|---|
| N서울타워 | VS standalone 없음 | KTO |
| 롯데월드타워 서울스카이 | VS 0건 | KTO |
| SMTOWN | VS 0건 | KTO |
| 한양도성 | VS 500 오류 지속 | KTO |
| 숭례문 | VS 500 오류 지속 | KTO |
| 서울역사박물관 | VS events만 (standalone 미발견) | KTO + 공식 사이트 |
| BTS 그래피티 (특정 위치) | VS events만 | 공식 사이트 |

### 검색 결과 매몰 주의 (buried entries)

VisitSeoul 키워드 검색만으로는 아래 장소 못 찾음 → CID 직접 조회 필요:

| 장소 | 검색 시 노출 순위 | CID |
|---|---|---|
| 경복궁 | 13번째 | KOP000072 |
| 창덕궁 본체 | 11번째 | KOP000295 |
| 창경궁 본체 | 6번째 | KOP000297 |
| 덕수궁 본체 | 7번째 | KOP002046 |
| 국립민속박물관 | 6번째 | KOP001644 |
| 남대문시장 | 4번째 | KOP000085 |
| 리움미술관 | 3번째 | KOP001232 |

**원인**: 이벤트·프로그램 entries가 장소 본체보다 최신 업데이트로 상위 노출.  
**해결책**: category별 CID 전수 수집 후 category 필터링.

---

## 다국어 자동 매핑 가능 (USER_REVIEW 불필요)

VisitSeoul CID suffix가 언어 간 동일 → 다국어 entity 매핑 자동화 가능.

```
예: 광장시장
KOP000286 (ko) → ENP000286 (en) → JPP000286 (ja) → CNP000286 (zh-CN)
→ TCP000286 (zh-TW) → RUP000286 (ru) → MLP000286 (ms)
```

**단, zh-TW / ja 일부 entry 500 오류 확인 → intermittent 처리 필요.**
