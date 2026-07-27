# 공식 원천·링크 방침 규칙 반영 보고서

**작업**: TASK-DATA-OFFICIAL-SOURCE-AND-LINK-POLICY-21I  
**실행일**: 2026-07-27  
**전체 판정**: PASS

---

## 수정 파일 요약

| 파일 | 수정 전 | 수정 후 | 추가 섹션 |
|------|--------|--------|---------|
| `docs/automation/image-curation-rules.md` | 124줄 | 172줄 | `## 이미지 권리 운영 기준` |
| `docs/automation/data-source-priority.md` | 61줄 | 90줄 | `## 수집 원천과 사용자 안내 원천 분리` |
| `docs/automation/nightly-execution-rules.md` | 176줄 | 224줄 | `## 링크·최신성 검증 단계` |

---

## 이미지 사용 정책 (image-curation-rules.md 추가)

### 적용 범위
`image_source_type: editorial_tourism` 등 공식 관광·음식·행사 원천. 공공데이터포털·TourAPI 원천(KOGL)에는 해당 라이선스 조건 우선 적용.

### 권리 상태값 2종

| 상태 | 의미 |
|------|------|
| `rights_confirmed` | 공공누리·명시적 라이선스 확인 완료 |
| `operational_assumed` | 권리 문서화 불가. 공식 원천 일반 홍보 이미지로 판단, 정보 제공용 운영 허용 |

- 이미지 충분성(`image_status`)과 권리 상태는 독립 필드로 관리
- 공식 출처라는 이유만으로 `rights_confirmed` 표시 금지

### 자동 제외 조건
사진작가·스튜디오·언론·회사 저작권 명시 / 공모전·수상작 / 워터마크 / 이미지별 ARR 또는 재배포 금지 명시 / 인물·초상권 위험

*메타데이터만으로 감지 불가 시 `classification_method: category_inferred` 기록 후 이미지 수준 수동 검토 대상으로 분리*

### 운영 조건
출처 도메인·원본 URL·수집일 보존 필수. 삭제 요청 시 즉시 비노출 처리 가능한 구조 유지. 광고·이미지 판매·예약 상품 직접 홍보 시 권리 기준 재검토.

---

## 링크 우선순위 방침 (data-source-priority.md 추가)

### 수집 원천 vs 사용자 안내 원천 분리
- 지역 관광사이트(VisitBusan 등): **데이터 수집·발견 원천**으로 활용 (기존 '기본 원천' 역할 유지)
- 사용자 안내 링크: **직접 관리 주체 링크** 우선

### 카테고리별 사용자 안내 링크 우선순위

| 카테고리 | 1순위 | 2순위 | 보조 |
|---------|-------|-------|------|
| 행사 | 행사 공식 홈페이지 | 주최기관·구청·공공기관 | 지역 관광사이트 |
| 음식점 | 공식 홈·블로그·SNS | 지도 사업자 페이지 | 지역 관광사이트 |
| 관광지·산·공원 | 운영기관·지자체·공단·국립공원 | 공공기관 보도자료 | 지역 관광사이트 |
| 선정·인증 | 해당 기관 최신 공식 페이지 | — | — |

### 선정·인증 최신성
최신 확인 불가 → 현재 배지 표시 금지. 과거 기록 보존 또는 `verification_required` 처리.

### 링크 필드 분리
`source_url` (수집 원천) / `display_url` (사용자 안내) — 항상 별도 기록.

---

## 행사·음식점·관광지별 적용 기준

| 구분 | 이미지 권리 | 사용자 링크 |
|------|-----------|-----------|
| 행사 | KOGL 확인 시 `rights_confirmed`. 관광사이트 일반 홍보 이미지 `operational_assumed`. 공모전 작품 제외. | 행사 공식 홈페이지 → 주최기관 순. 날짜·취소 여부 `link_outdated` 감지 대상. |
| 음식점 | 메뉴·홍보 사진 `operational_assumed`. 스튜디오·작가 크레딧 명시 시 제외. | 공식 홈·SNS → 지도 사업자. 폐업·이전 `link_outdated` 감지 대상. |
| 관광지·공원 | 운영기관 제공 사진 KOGL 확인 시 `rights_confirmed`. 일반 홍보 `operational_assumed`. | 운영기관·지자체 공식 페이지 우선. 미쉐린·블루리본 등 선정은 `verification_required`. |

---

## 링크·최신성 검증 단계 (nightly-execution-rules.md 추가)

수집 파이프라인 완료 후 적용하는 후처리 단계.

### 링크 상태값 4종
`link_verified` / `link_unverified` / `link_outdated` / `verification_required`

### Validation Gate 추가 (링크)
- `source_url`·`display_url` 필드 누락 → `FAIL`
- `link_outdated` 항목 최신 정보 자동 노출 → `FAIL`
- `verification_required` 현재 배지 표시 → `REVISE_REQUIRED`

---

## 검증 결과

| 항목 | 결과 |
|------|------|
| 세 문서 간 중복·충돌 | PASS — 각 문서 역할 분리됨. nightly-rules의 `rights_confirmed` 언급은 분리 설명 참조로 한정 |
| 특정 도시 수치 포함 | PASS — 없음 |
| 이미지 권리 상태 ↔ 정보 최신성 상태 분리 | PASS — 권리: image-curation-rules.md / 최신성·링크: nightly-execution-rules.md |
| 수집 원천 ↔ 사용자 안내 원천 분리 | PASS — data-source-priority.md에 별도 절로 구분 |
| 기존 규칙 충돌 | PASS — 기존 7개 데이터 선택 기준·Preflight·HARD STOP 무변경 |
| 결함 | 없음 |

---

TASK-DATA-OFFICIAL-SOURCE-AND-LINK-POLICY-21I 완료 — 운영 규칙 반영, 데이터 재분류 대기.
