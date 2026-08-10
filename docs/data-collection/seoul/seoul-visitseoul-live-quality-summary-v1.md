# 서울 VisitSeoul API 실시간 품질 검증 결과 — v1

| 항목 | 값 |
|---|---|
| 버전 | v1 |
| TASK | TASK-SEOUL-VISITSEOUL-LIVE-QUALITY-VALIDATION-V1 |
| 생성일 | 2026-08-10 |
| branch | data/seoul-collection-v1 |
| API 호출 | 109건 (한도 350건 대비 31% 사용) |
| 검증 방법 | VisitSeoul API 실시간 직접 호출 (키워드 검색 + CID 직접 조회) |
| 서울 BULK 수집 상태 | **NOT_STARTED** (이 TASK에서 변경 없음) |

---

## SECTION 1 — 카테고리 트리 및 API 특성

### 확인된 주요 카테고리

| 카테고리 | 수집 적합성 | FP 위험 |
|---|---|---|
| 역사관광 > 역사유적지 > 고궁 | HIGH_PRIORITY | LOW |
| 역사관광 > 역사유적지 > 성/문 | HIGH_PRIORITY | LOW |
| 역사관광 > 역사유적지 > 사적지 | CURATE | LOW |
| 문화관광 > 전시시설 > 박물관 | HIGH_PRIORITY | LOW |
| 문화관광 > 전시시설 > 미술관/화랑 | CURATE | MEDIUM |
| 문화관광 > 랜드마크관광 | CURATE | LOW |
| 체험관광 > 산사체험 | CONDITIONAL | LOW |
| 쇼핑 > 시장 | HIGH_PRIORITY | LOW~MEDIUM |
| 쇼핑 > 전문매장/상가 | USER_REVIEW_REQUIRED | HIGH (32% FP) |
| 음식 > 카페/찻집 | USER_REVIEW_REQUIRED | HIGH |
| 음식 > 한식/외국식 | NO_CANONICAL_BULK | HIGH |
| 축제/공연/행사 | **BULK_EXCLUDE** | N/A |
| 숙박 | **BULK_EXCLUDE** | N/A |
| 자연관광 > 자연공원 | CURATE | LOW |

### ⚠️ API 핵심 특성

1. **카테고리 필터 불작동**: `category_code` 파라미터 무시 — 항상 최신 업데이트 전체 정렬 반환.  
   → **키워드 검색 또는 CID 직접 조회 필수**.

2. **이벤트 entries가 장소 entries 상위 점령**:  
   - 경복궁 본체 = 검색 13번째 (이벤트 12건 선행)  
   - 창덕궁 본체 = 검색 11번째 (달빛기행 이벤트 9건 + 후원 선행)  
   - 덕수궁 본체 = 검색 7번째 (이벤트 6건 선행)  
   → **키워드 검색만으로 장소 수집 금지. Category 필터 후 CID 목록 수집 필요.**

3. **간헐적 500 오류**: 한양도성·숭례문·이태원·명동 등 일부 키워드/CID 지속 실패.  
   → 500 오류 = 해당 장소 미존재 아님. KTO 병행 조회 필요.

4. **총 콘텐츠 수**: 3,765건 (lang=ko 기준).

---

## SECTION 2 — Benchmark 32개 검증 요약

### 결과 분포

| 상태 | 건수 | 비율 |
|---|---|---|
| ✅ CONFIRMED (CID + detail 확인) | 18 | 56.3% |
| 🟡 CONFIRMED_LIST_ONLY (CID 확인, detail 500) | 1 | 3.1% |
| ⚠️ LIVE_SOURCE_DEGRADED (500 오류 / standalone 미발견) | 9 | 28.1% |
| ❌ NOT_IN_VISITSEOUL (0건 또는 장소 entry 없음) | 4 | 12.5% |

### NOT_IN_VISITSEOUL 목록 (KTO 필수)

| 장소 | 상태 | 권장 source |
|---|---|---|
| N서울타워 | 관련 entry 없음 | KTO |
| 롯데월드타워 서울스카이 | 0건 | KTO |
| SMTOWN | 0건 | KTO |
| BTS 그래피티 | 이벤트만 (고정 장소 없음) | KTO/공식 사이트 |

### 주요 검증 결과

| 장소 | CID | 비고 |
|---|---|---|
| 경복궁 | KOP000072 | 검색 13번째. EN=ENP000072 "Gyeongbokgung Palace" |
| 창덕궁 본체 | KOP000295 | 검색 11번째 |
| 창덕궁 후원 | KOPl8f5md | 비표준 CID. 본체와 별도 entry. |
| 창경궁 | KOP000297 | 검색 6번째 |
| 덕수궁 | KOP002046 | 검색 7번째 |
| 경희궁 | KOP001159 | total=1. 직접 노출. |
| 종묘 | KOP000507 | UNESCO 태그. homepage=KHS |
| 흥인지문 | KOP001999 | 확인 |
| 북촌한옥마을 | KOP000261 | 랜드마크관광 |
| 국립중앙박물관 | KOP000433 | 확인 |
| 국립민속박물관 | KOP001644 | 검색 6번째 |
| 국립한글박물관 | KOP035405 | 확인 |
| 리움미술관 | KOP001232 | 한남동. 검색 3번째 |
| DDP | KOP024679 | list만 확인. detail 500. |
| 서울식물원 | KOP027397 | 자연공원 |
| 북한산국립공원 | KOP000369 | 자연공원 |
| 광장시장 | KOP000286 | 7개 언어 CID suffix 동일 |
| 남대문시장 | KOP000085 | 검색 4번째 |
| 통인시장 | KOP000281 | 검색 2번째 |

---

## SECTION 3 — Shopping FP 분석

### 올리브영 Flagship vs Chain 구분

- **VisitSeoul 검색 결과**: 올리브영 1건만 등록 = "올리브영 명동 플래그십" (KOP012015)
- 일반 chain 지점 = VisitSeoul 미등록
- **결론**: `FLAGSHIP_DETECTION_FEASIBLE = YES`

### 전문매장/상가 FP 비율

- 최근 업데이트 50건 기준 16건 = 32% FP
- **FP 유형**: CU 편의점, 약국, 캐릭터 굿즈 체인, 뷰티 브랜드 단매장
- **처리**: USER_REVIEW 후 Flagship 기준 충족 시만 canonical 포함

### NewNew House 평가

- CID: KOPmwrtiq, 성동구 성수이로 93
- 카테고리: 쇼핑 > 전문매장/상가
- 태그: 성수 쇼핑, 성수동 핫플
- **Eligibility**: SEARCHABLE=YES, AI=NO (default), USER PICKED 허용

---

## SECTION 4 — 다국어 연결 품질

### CID Suffix 패턴 확인

```
광장시장(suffix=000286):
  ko: KOP000286 / en: ENP000286 / ja: JPP000286
  zh-CN: CNP000286 / zh-TW: TCP000286 / ru: RUP000286 / ms: MLP000286
```

- **suffix 동일**: 7개 언어 자동 매핑 100% 가능
- **EN 번역 품질**: GOOD (Gyeongbokgung Palace, Gwangjang Market 등 정확)
- **좌표 일치**: ko/en/zh-CN 동일 확인
- **ja·zh-TW 500 오류**: 일부 entry 간헐적 실패 (서비스 degradation)

### 광장시장 EN 예시

| 항목 | 값 |
|---|---|
| CID | ENP000286 |
| Title | Gwangjang Market |
| Address | 88 Changgyeonggung-ro, Jongno-gu, Seoul |
| Category | Shopping > Traditional Markets |
| Homepage | http://www.kwangjangmarket.co.kr/en/ |

---

## SECTION 5 — KTO ↔ VisitSeoul 교차 매핑

- **공통 ID 필드 없음** — 매핑 방법: 이름 정규화 + 좌표 <50m + 주소 일치
- VisitSeoul detail에 KTO contentId 미포함
- 매핑 신뢰도: HIGH(이름+좌표 일치) / MEDIUM(이름만) / LOW(유사 이름)
- 매핑 자동화: VisitSeoul CID suffix 기준 다국어 entity는 100% 자동화 가능

---

## SECTION 6 — Source Cascade 최종 권장

### 권장 Source 우선순위

| 우선순위 | Source | 대상 |
|---|---|---|
| 1 | VisitSeoul | 고궁·박물관·시장·자연공원·랜드마크 (benchmark 59% 직접 확인) |
| 2 | KTO TourAPI | N서울타워·롯데월드서울스카이·SMTOWN·한양도성·숭례문·서울역사박물관 |
| 3 | 공식 기관 사이트 | VisitSeoul·KTO 모두 미등록 신규 명소 |

### VisitSeoul 수집 시 필수 필터

1. category = 축제/공연/행사 → **제거**
2. category = 숙박 → **제거**
3. category = 음식(한식/외국식 등) → **제거** (카페 제외)
4. category = 전문매장/상가 → **USER_REVIEW 후 선별**
5. 키워드 검색 방식 → **CID 직접 조회 방식으로 전환**

---

## SECTION 7 — Temple Stay 검증

| 항목 | 값 |
|---|---|
| 확인 CID | KOP0pzgtj |
| 명칭 | 국제선센터 템플스테이 |
| 카테고리 | 체험관광 > 산사체험 |
| 위치 | 서울 양천구 목동동로 167 (국제템플스테이센터) |
| 위도 | 37.5207859835315 |
| 특이사항 | 도심 위치. 전통 산사 아님. 사전 예약 필수. |
| AI eligibility | CONDITIONAL (intents: temple_stay, traditional_culture, wellness, meditation) |

→ `multicity-place-eligibility-policy-v1.md` ELG_006 정책(CONDITIONAL) 현장 확인됨.

---

## SECTION 8 — 서울역사박물관 이슈

- VisitSeoul '서울역사박물관' 키워드 6건: **전부 2016~2020년 행사/전시 entries**
- 박물관 본체 standalone entry **미발견**
- 서울역사박물관 수집: **KTO + 공식 사이트(museum.seoul.go.kr) 병행 필요**

---

## SECTION 9 — QA 플래그

| 플래그 | 값 |
|---|---|
| VISITSEOUL_API_CATEGORY_FILTER_WORKS | NO |
| EVENT_CONTAMINATION_IN_SEARCH | HIGH (경복궁 13위, 창덕궁 11위) |
| CID_SUFFIX_MULTILINGUAL_CONSISTENT | YES |
| FLAGSHIP_DETECTION_FEASIBLE | YES |
| N서울타워_IN_VISITSEOUL | NO — KTO 필수 |
| SMTOWN_IN_VISITSEOUL | NO |
| 서울역사박물관_STANDALONE | NOT_FOUND |
| TEMPLE_STAY_AI_CONDITIONAL | CONFIRMED |
| BULK_COLLECTION_STATUS | NOT_STARTED (변경 없음) |
| LIVE_SOURCE_DEGRADED_KEYWORDS | 한양도성, 숭례문, 이태원, 명동, 창경궁(초기), 국립민속박물관(직접) |
| API_CALLS_USED | 109 / 350 |

---

## SECTION 10 — 출력 파일 목록

| 파일 | 위치 | 설명 |
|---|---|---|
| `seoul-visitseoul-live-quality-summary-v1.md` | `docs/data-collection/seoul/` | 이 문서 |
| `seoul-visitseoul-category-quality-v1.json` | `docs/data-collection/seoul/` | 카테고리별 품질 분석 |
| `seoul-benchmark-live-verification-v1.json` | `docs/data-collection/seoul/` | benchmark 32개 검증 상세 |
| `seoul-visitseoul-kto-crosswalk-sample-v1.json` | `docs/data-collection/seoul/` | KTO ↔ VisitSeoul 교차 매핑 |
| `seoul-live-user-review-groups-v1.md` | `docs/data-collection/seoul/` | 사용자 검토 그룹 정의 |
| `seoul-source-cascade-live-recommendation-v1.json` | `docs/data-collection/seoul/` | Source cascade 최종 권장 |
| `seoul-visitseoul-live-samples-v1.jsonl` | `data/seoul-source-audit/` | 검증된 place 샘플 (28건) |
| `seoul-visitseoul-live-attempts-v1.jsonl` | `data/seoul-source-audit/` | API 호출 시도 기록 (48건) |

---

## SECTION 11 — MAIN 인수인계 요약

**서울 VisitSeoul 수집 착수 전 MAIN 결정 필요 사항:**

1. **카테고리 기반 CID 수집 전략 승인** — 이벤트 제거 로직 포함
2. **전문매장/상가 USER_REVIEW 프로세스** — Flagship 기준 정의
3. **KTO 병행 수집 승인** — N서울타워 등 6+ 건
4. **서울역사박물관 추가 조사** — VisitSeoul 미등록 확인 후 KTO 대안
5. **다국어 entity 자동 매핑 구현** — CID suffix 동일 활용

**SEOUL_BULK_COLLECTION = NOT_STARTED — 이 TASK에서 bulk 수집 미수행.**
