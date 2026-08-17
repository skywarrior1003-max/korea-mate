# GoKoreaMate — Multicity Place Accommodation Eligibility Policy v1

| 항목 | 값 |
|---|---|
| 버전 | v1 |
| 생성일 | 2026-08-17 |
| 근거 TASK | TASK-BUSAN-NONFOOD-FINAL-CURATION-AND-COMMON-POLICY-CLOSURE-V2 |
| 실증 근거 | 부산 accommodation 82건 전수 심사 → 0건 KEEP_EXPERIENTIAL |
| 적용 대상 | 부산·경주·서울·제주·전주·이후 전국 모든 도시 |
| 정책 SSOT | data/multicity-common (이 파일) |
| DB 변경 | 0 |

---

## 핵심 원칙

```
STANDARD_ACCOMMODATION_IS_NOT_CITY_SPOT
```

GoKoreaMate Place catalog은 **관광 목적지(city_spot)**를 수집한다.  
일반 숙박업소는 관광 목적지가 아니다 — **숙박 공급은 별도 partner accommodation surface**가 담당한다.

---

## PART 1 — Accommodation Eligibility 판정 기준

### EXCLUDE (기본값): 일반 숙박

다음에 해당하면 Place catalog에서 **제외**한다. 사유: `EXCLUDE_STANDARD_ACCOMMODATION`

| 유형 | 예시 |
|---|---|
| 호텔 (특급/비즈니스/모텔 포함) | 롯데호텔, 이비스, 토요코인, 브라운도트 |
| 리조트 / 콘도 | 아난티 코브, 마티에 오시리아 |
| 게스트하우스 / 호스텔 | 더파크 게스트하우스, 팝콘 호스텔 |
| 펜션 / 오션뷰 스테이 | 그림하우스, 더웨이브 |
| 에어비앤비형 / 독채 스테이 | 행운인생, 베를리너 하우스 |
| 미니멀/감성 숙소 | 샌드스테이, 이스턴룸 |

**부가 요인으로 KEEP 불가**:
- 오션뷰, 감성 인테리어, 반려동물 친화
- 가성비, 접근성 우수
- 유명 관광지 인근 위치
- 럭셔리 브랜드 (시그니엘, 파크 하얏트 등)
- "한국적 감성", "동양의 결" 등 인테리어 콘셉트

위 요인은 숙박 품질 요소이지 장소 자체의 관광 가치가 아니다.

---

### KEEP_EXPERIENTIAL_LODGING (예외): 체험형 / 문화형 숙박

숙박 자체가 관광 경험·문화 경험·체험 가치인 경우에만 Place catalog 유지 가능.

**유지 조건 — 최소 하나 이상의 구체적 근거 필요**:

| 유형 | 설명 |
|---|---|
| 전통한옥 체험 | 한옥 건물 자체가 문화재/전통 건축으로 KTO 등재 |
| 템플스테이 | 사찰 숙박 + 불교 문화 체험 프로그램 공식 운영 |
| 사찰 숙박 / 명상 | 공인 사찰에서 운영하는 공식 프로그램 |
| 역사적 건축물 숙박 | 근대 문화재 또는 역사 등록 건축물 |
| 해설사 동반 전통 문화 체험 | 숙박+문화 프로그램이 공식 결합된 운영 |

**KEEP 판정 근거 문서화 필수**:
- 운영기관 공식 홈페이지에서 체험 프로그램 확인
- KTO 체험형 숙박 등재 확인
- 지자체/관광공사 공식 인증 확인

---

### RECLASSIFY: Category 오분류

accommodation으로 수집되었으나 실제 category가 다른 경우:

| 원 category | 실제 category | 조건 |
|---|---|---|
| accommodation | attraction | 방문 목적지 (건물 자체가 명소) |
| accommodation | nature | 캠핑장, 카라반파크 (숙박이 야외 레저 활동) |
| accommodation | event | 숙박 연계 이벤트/축제 |

**주의**: category 변경은 canonical taxonomy에 맞게만. 임의 category 생성 금지.

---

## PART 2 — 부산 심사 결과 (실증)

TASK-BUSAN-NONFOOD-FINAL-CURATION-AND-COMMON-POLICY-CLOSURE-V2에서 부산 accommodation 82건을 전수 심사한 결과:

| 결과 | 건수 |
|---|---|
| EXCLUDE_STANDARD_ACCOMMODATION | 82 |
| KEEP_EXPERIENTIAL_LODGING | **0** |
| RECLASSIFY | 0 |

**주요 판정 사례**:

| 이름 | 판정 | 사유 |
|---|---|---|
| 시그니엘 부산 (Michelin Key 2) | EXCLUDE | 럭셔리 호텔 (브랜드/평가 등급은 KEEP 근거 아님) |
| 더펫텔프리미엄스위트 (국내 유일 반려동물 전용) | EXCLUDE | 개념적 독창성이지 문화/전통 체험 아님 |
| 방가방가게스트하우스 (감천문화마을 내부) | EXCLUDE | 관광지 내 위치이지 숙박 자체가 문화 체험 아님 |
| 모닝듀 게스트 하우스 (대한민국 건축상 수상) | EXCLUDE | 건축상 수상이 체험형 문화 숙박 근거 아님 |
| 아난티 앳 부산 코브 (오시리아 관광단지) | EXCLUDE | 럭셔리 리조트. 관광단지 내 위치는 KEEP 근거 아님 |
| 파크 하얏트 부산 | EXCLUDE | 럭셔리 호텔 체인 |

**결론**: 부산 82건 중 전통 한옥, 템플스테이, 역사 건축물 숙박에 해당하는 항목은 **0건**이었다.

---

## PART 3 — AI Eligibility (accommodation)

```
STANDARD_ACCOMMODATION → ai_auto = False (영구)
                          ai_blocked_reason = ACCOMMODATION_EXCLUDED_FROM_AI_ITINERARY

KEEP_EXPERIENTIAL_LODGING → AI eligibility 정상 평가
                              coord_valid + confirmed_tourism_value → ai_auto 가능
```

---

## PART 4 — 다음 도시 적용 가이드라인

신규 도시 수집 시:

1. **accommodation category 항목 전수 심사** 권장 (자동 통과 없음)
2. **KTO 체험형 숙박 DB** 우선 확인: 한국관광공사 "관광두레 숙박형 사업체" / "한옥 체험업" 등재 여부
3. **템플스테이** 공식 DB (templestay.com) 확인
4. KEEP 판정 시 근거 문서화 필수 (canonical `keep_evidence` 필드)
5. 일반 호텔 directory 구축 금지 — 숙박 검색은 partner accommodation surface에서 처리

---

## QA 체크리스트

- [x] STANDARD_ACCOMMODATION_IS_NOT_CITY_SPOT 원칙 명문화
- [x] EXCLUDE 기본값 조건 정의
- [x] KEEP_EXPERIENTIAL 예외 조건 정의 (최소 1개 구체적 근거 필요)
- [x] RECLASSIFY 조건 정의
- [x] 부산 82건 전수 심사 결과 기록
- [x] AI eligibility 연동 정의
- [x] 다음 도시 적용 가이드라인 포함
- [x] DB/schema/src/functions 변경 = 0
- [x] master/city branch 변경 = 0
