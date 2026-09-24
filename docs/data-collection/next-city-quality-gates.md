# 다음 도시 수집 — 필수 Quality Gates (OFF-17463 사건 반영)

근거: `docs/data-incidents/OFF-17463-cross-entity-contamination.md`
실행 게이트: `node scripts/data-gates/entity-coherence-gate.mjs <candidates.json>`
(exit 0 = 통과 · exit 2 = quarantine 존재 — 승격 중단)

체크리스트 항목 중 `[GATE]` 표시는 위 validator 가 기계 검사한다. 나머지는 사람 확인.

## 1. 수집 전

- [ ] 원천별 category/content type 정의표 작성(예: KTO 32=숙박 ↔ FOOD 결합 금지 목록)
- [ ] 사진 권리 규칙 확정 — `display_eligible:false`·rights 불명은 **hard gate** [GATE]
- [ ] 기관 대표번호 목록 갱신 — `GOVERNMENT_PHONES`(entity-coherence-gate.mjs)에 신규 도시 번호 추가 [GATE]
- [ ] geocoder 기준·좌표 원천 우선순위 문서화
- [ ] ambiguous 처리 정책 확인: **AMBIGUOUS = 차단 상태**, 사람 해소(identity_review=true) 전 승격 금지 [GATE]

## 2. 후보 통합 전 (candidate merge)

- [ ] 동일 entity 근거 없이 서로 다른 후보의 필드를 조합하지 않는다(best-field 조합 금지)
- [ ] 이름 정규화 후 원천 간 이름 대조 — 불일치면 결합 금지 [GATE: NEAR_BUT_DIFFERENT_NAME]
- [ ] 주소 일치(도로명 기준) — 결합 원천 주소가 주 entity 주소와 다르면 채택 금지
- [ ] 좌표 거리 임계(기본 30m, configurable) 초과 + 이름 불일치 → quarantine [GATE: COORD_ENTITY_CONFLICT]
- [ ] 전화 일치 — 기관 대표번호·타 장소 반복 번호는 자동 채택 금지 [GATE: GOVERNMENT_PHONE]
- [ ] category ↔ content type 일치(restaurant↔lodging 등 금지) [GATE: CATEGORY_MISMATCH]
- [ ] 사진 identity — 이미지 원천 entity 가 주 entity 와 같은가 [GATE: IMAGE_CROSS_ENTITY]
- [ ] 사진 rights — display_eligible/rights_status [GATE: IMAGE_NOT_ELIGIBLE/IMAGE_RIGHTS]
- [ ] field provenance 를 행에 유지(source ID·match type·confidence·eligibility)

## 3. Final 승격 전

```
node scripts/data-gates/entity-coherence-gate.mjs data/<city>/.../<catalog>.json
node --test scripts/data-gates/entity-coherence-gate.test.mjs
```

- [ ] [GATE] exit 0 — AMBIGUOUS 미해소 0
- [ ] [GATE] display_eligible:false 이미지 게시 0
- [ ] [GATE] category mismatch 0
- [ ] [GATE] 기관 대표번호 phone 채택 0
- [ ] [GATE] address-coordinate/entity conflict 0
- [ ] cross-entity field mix 0 (게이트 + 표본 육안)
- [ ] 지도 착지 표본 확인(음식점·숙소·관광지 각 1 이상 — Naver·Google 실착지)
- [ ] 이미지 없는 장소는 fallback(placeholder) 허용 — no-image 로 승격을 막지 않는다

## 4. 배포 전

- [ ] city 표본 브라우저 검증(검색 카드 ↔ 상세 동일성·지도 착지·locale 4종)
- [ ] 음식점·숙소·관광지 각각 표본 1+
- [ ] correction ledger(`data/main-intake/*/corrections/`) 반영 여부 확인
- [ ] 보조 PC 독립 검증 완료(`docs/data-handoffs/` 해당 문서 절차)

## 회귀 fixture

- negative: `data/quality-gates/off-17463/negative-fixture.json` → 반드시 exit 2
- positive: `data/quality-gates/off-17463/positive-fixture.json` → 반드시 exit 0
