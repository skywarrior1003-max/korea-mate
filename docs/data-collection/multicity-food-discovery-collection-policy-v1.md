# Multicity Food Discovery Collection Policy V1

**Status**: ACTIVE_PROVISIONAL  
**Effective**: 2026-08-11  
**Scope**: 경주, 부산, (향후) 서울·제주 전체 도시 식당 데이터 수집

---

## 1. 개요

본 문서는 한국 주요 도시의 식당(restaurant) 후보 데이터 수집·검증·풀 관리에 적용되는 범도시 공통 정책을 정의한다. 도시별 작업에서 이 정책을 기준으로 삼으며, 도시별 예외가 있는 경우 별도 문서에 명시한다.

---

## 2. Phone Gate 정책

### 2.1 전화번호 필수 원칙

```
RESTAURANT_SERVICE_PHONE_REQUIRED = YES
FINAL_RETAINED_CANDIDATES_WITHOUT_PHONE = 0
```

- 서비스 노출 후보(service candidate)는 반드시 검증된 전화번호를 가져야 한다.
- 전화번호가 없으면 서비스 풀에서 제외(EXCLUDED_NO_VERIFIABLE_PHONE)한다.
- **단**: 제외 ≠ 폐업 확정(`MISSING_PHONE_EQUALS_CLOSED_CONFIRMED = NO`)  
  전화번호 미확인 = 데이터 한계, 폐업 증거 없으면 closed 마킹 금지.

### 2.2 전화번호 수집 순서 (공식 소스 우선)

1. **KTO TourAPI** — `detailCommon2` (KorService2 endpoint, `serviceKey` 파라미터)
2. **지자체 공식 관광 사이트** — 도시별 공식 URL
3. **정부24 / 국가공간정보포털** — tel 필드 존재 시
4. **식당 공식 SNS** — bio에 전화번호 명시된 경우에 한함
5. **Naver Place** — 위 모든 소스에서 미확인 시, 최종 검증

### 2.3 Naver 단독 최종 검증 정책

```
NAVER_FINAL_VERIFICATION_ONLY = YES
GOOGLE_MAPS_VERIFICATION = FORBIDDEN
KAKAO_VERIFICATION = FORBIDDEN
```

- **Naver Place가 한국 식당 전화번호의 유일한 최종 검증 소스**다.
- Google Maps: 데이터 스테일 가능성, 국내 갱신 주기 불투명 → **사용 금지**
- Kakao Map: 폐업·이전 정보 반영 지연 → **사용 금지**
- 공식 소스에서 전화번호를 확인한 경우에도 **Naver Place 일치 여부를 최종 확인**한다.

### 2.4 Naver 접근 불가 시 STOP 조건

네이버 Place 페이지 접근 불가(CAPTCHA 차단, 봇 차단, 환경 제한 등)인 경우:

```
NAVER_VERIFICATION_COMPLETE = NO
PHONE_GATE_STATUS = OPEN_PHONE_VERIFICATION
→ STOP: 후보 파일 수정 없이 STOP 상태 보고
```

- 후보 파일(`*-candidates-v1.jsonl`)은 수정하지 않는다.
- STOP 상태 파일(`*-phone-gate-stop-v1.json`)을 생성하고 manifest를 업데이트한다.
- Naver 접근 가능한 환경(보조 데스크탑, 브라우저 자동화 등)에서 재실행한다.

---

## 3. 검증 출처 표기 (field_provenance)

전화번호가 추가/업데이트될 때 반드시 출처를 기록한다:

```json
"field_provenance": {
  "phone": "naver_place:verified:2026-08-11",
  "opening_hours_raw_text": "naver_place:explicit_text:2026-08-11"
}
```

| 출처 태그 | 의미 |
|---|---|
| `kto_detail:detailCommon2` | KTO detailCommon2 반환값 |
| `official_city_site` | 지자체 공식 사이트 |
| `naver_place:verified` | Naver Place 확인 |
| `naver_place:explicit_text` | Naver에서 명시적으로 표시된 텍스트 |

---

## 4. Naver Place 동일 패스 보강 (same-pass enrichment)

전화번호 확인 과정에서 Naver Place를 방문하는 경우, **같은 페이지**에서 아래 필드도 함께 수집한다:

- `opening_hours_raw_text` — Naver에 표시된 영업시간 그대로
- `description` — 소개글 (있는 경우, 원문 그대로)
- `image_main_url` — 대표 이미지 (저작권 확인 가능한 경우)

**금지**:
- AI 추론 / AI 번역 / AI 요약 기반 값 입력 (`AI_INFERRED_RESTAURANT_FACT = FORBIDDEN`)
- Naver 미표시 필드에 unknown → null 변환 이외 처리 (`UNKNOWN_DISTINCT_FROM_NO = REQUIRED`)
- 동일 패스 외 별도 검색으로 필드 추가 (추가 소스는 별도 검증 태스크로 분리)

---

## 5. 제외 처리 원칙

```
EXCLUDED_NO_VERIFIABLE_PHONE:
  - candidates 파일: validation_status 업데이트
  - review_flags: ['EXCLUDED_NO_VERIFIABLE_PHONE', 'PHONE_GATE_FAIL']
  - proposed_values.phone = null 유지 (삭제 불가)
  - 원본 facts 보존 (물리적 삭제 금지)
  - service_pool_eligible = false 마킹
```

제외된 후보는 `service_pool`에서 제외되지만 `candidate` 레코드 자체는 보존한다. 향후 재검증 가능성을 열어둔다.

---

## 6. 데이터 품질 불변 원칙

| 원칙 | 값 |
|---|---|
| AI 추론 기반 식당 사실 입력 | FORBIDDEN |
| 수치 기반 강제 제외(numeric pruning) | FORBIDDEN |
| unknown → no 자동 변환 | FORBIDDEN |
| FINAL_HOLD 자동 승격 | FORBIDDEN |
| 타 도시 데이터 변경 | 0 |
| production DB 직접 쓰기 | 0 |
| API key 출력·커밋 | FORBIDDEN |

---

## 7. 시장 집합형 특수 케이스

식당 골목·뷔페촌 등 시장 내 집합형 구역(market collective zone)은 다음 원칙을 따른다:

- 단일 대표 전화번호가 없을 수 있음 → 시장 관리 사무소 번호 ≠ 개별 매장 번호
- Naver Place에서 해당 구역 자체 페이지가 없으면 `EXCLUDED_NO_VERIFIABLE_PHONE` 처리
- 폐업 마킹은 폐업 증거가 있을 때만

---

## 8. 도시별 현황

| 도시 | Phone Gate 상태 | 비고 |
|---|---|---|
| 경주 | OPEN_PHONE_VERIFICATION | Naver 접근 불가(환경 제한)로 STOP. 71건 미검증 |
| 부산 | NOT_STARTED | 부산 food discovery 프리체크 선행 필요 |
| 서울 | NOT_STARTED | 서울 수집 진행 중 |
| 제주 | NOT_STARTED | — |

---

## 9. 이력

| 날짜 | 버전 | 변경 내용 |
|---|---|---|
| 2026-08-11 | v1 | 초안 생성. 경주 Phone Gate STOP 계기로 정책 문서화 |
