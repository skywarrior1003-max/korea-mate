# data-collection/common-city-collection-rules-v1.md

**작성일**: 2026-08-08
**적용 범위**: 경주, 부산 및 향후 추가 도시 전체
**상태**: v1 초안 (경주 파이프라인 완료 후 코드화)

---

## 1. 소스 우선순위

| 순위 | 소스 | 설명 | 권리 |
|------|------|------|------|
| 1 | 공식 시 관광 웹사이트 (VG 등) | HTML 파싱 — 무료 (공공) | 공공저작물 |
| 2 | TourAPI KO detailCommon2 | API — 계약 | KO 계약범위 |
| 3 | TourAPI EN EngService2 | API — 계약 | EN 계약범위 |
| 4 | 기타 공식 관광청/기관 | 케이스별 판단 | 명시 확인 필요 |

원칙: 무료·공공 소스를 최우선, 번역·LLM 생성 금지.

---

## 2. 후보 분류 기준

### 릴리즈 기준 (필수 조건 전체 충족)
- `description_ko`: 설명문 있음 (출처 명시)
- `address`: 주소 있음
- `coordinates`: 좌표 있음
- `images`: 이미지 1건 이상 (권리 확인)

### HOLD 사유
| 코드 | 의미 |
|------|------|
| `HOLD_DESCRIPTION` | 설명문 없음 |
| `HOLD_IMAGE` | 이미지 없음 (설명 있음) |
| `HOLD_LOCATION` | 좌표 없음 |
| `HOLD_ADDRESS` | 주소 없음 |

### 범위 외 (OUT_OF_SCOPE)
- KTO28 레저/스포츠 시설 (골프장, 캠핑장, 수영장 등)
- 일반 도서관, 교육기관 (관광 목적 아님)
- 일반 소매점, 대형마트 (관광 쇼핑 아님)
- 기업 홍보관 (일반 대중 미개방)

---

## 3. Identity 확정 규칙

### 확정 가능 (HIGH_CONFIDENCE)
- 독립 증거 2건 이상 (이름 + 전화, 이름 + 좌표 <200m 등)
- SAME_PLACE 의미론적 동일성 확인

### 확정 불가
- 좌표 단독 (정확도 부족)
- 주소 번지 단독 (동명이장소 위험)
- 이름 substring 단독 (부분 일치)
- parent/child 관계 → SAME_PLACE 처리 금지

### 중복 처리
- 동일 장소 후보가 복수 소스에서 발견 → 더 강한 identity 보유 항목 채택
- KTO12 후보 vs GJ01 후보 동일 장소 → VG identity 있는 GJ01 우선
- KTO 데이터는 설명문/이미지 보강으로 활용

---

## 4. KTO 623 Crosswalk 원칙 (Gyeongju 경험)

- `lDongRegnCd=47, lDongSignguCd=130` 전체 areabasedList (623건) 수집
- 188 × 623 global matrix 비교 (nearest-only 금지)
- KTO12 prefix 후보: contentId → 직접 매칭 (DIRECT_CONTENTID)
- GJ01/WEB-NEW 후보: 이름 정규화 후 623 전체 비교 (NAME_BASED)
- 충돌: 1개 KTO623 항목이 복수 후보와 매칭 → COLLISION 플래그

---

## 5. 캐시 디렉토리 명명 규칙

| 타입 | 경로 패턴 | 파일명 |
|------|-----------|--------|
| KO detailCommon2 (tier-a) | `raw/gyeongju/gyeongju-tier-a-117-v1/kto-detail/` | `detailcommon2-{cid}.json` |
| KO detailCommon2 (일반) | `raw/gyeongju/kto-detail/` | `kto-detail-common2-{cid}.json` |
| KO detailCommon2 (전국) | `raw/kto/detailCommon2/full/` | `detail-common2-{cid}.json` |
| VG HTML | `raw/gyeongju/gyeongju-vg-v4-cache/` | `{candidate_id}.html` |

tier-a 포맷 파싱: `d['item']` 직접 접근 (표준 `response.body.items.item` 아님).

---

## 6. BYTE_IDENTICAL 검증

- Run1: HTTP 허용, 캐시 저장 후 처리
- Run2: `NETWORK=0` (캐시만 사용)
- 데이터 파일 (`*.jsonl`, `*.json`) SHA-256 전수 비교
- 타임스탬프: summary/QA 파일만 (데이터 파일 제외)
- 정렬: `candidate_id` 알파벳 순 (set/dict 이터레이션 금지)

---

## 7. Git 안전 규칙

- `master` push/merge 금지
- `git add .` / `git add -A` 금지 → 파일 명시적 stage
- raw/frozen 기존 파일 덮어쓰기 금지
- API key 출력·커밋 금지
- force push 금지
