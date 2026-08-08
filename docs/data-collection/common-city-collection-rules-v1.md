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

## 7. API 엔드포인트·파라미터 계약 관리 (v2 추가 — 경주 KTO HTTP 400 사례)

### 7-1. 공식 엔드포인트 명시

스크립트 헤더에 반드시 기록:

```python
API_CONTRACT_VERSION = "KorService2-v4.4"
API_BASE_URL = "https://apis.data.go.kr/B551011/KorService2"
```

- KorService1 (구버전) 신규 사용 금지
- EngService2 (영문 전용): 영문 수집에만 사용
- 엔드포인트 변경 시 버전 번호 bump 필수

### 7-2. operation별 현행 계약 파라미터

| operation | 필수 | 금지 (legacy v3.x 파라미터) |
|---|---|---|
| detailCommon2 | serviceKey, MobileOS, MobileApp, _type=json, contentId | defaultYN, firstImageYN, addrinfoYN, mapinfoYN, overviewYN |
| detailIntro2 | + contentTypeId | 동일 YN 계열 |
| detailInfo2 | + contentTypeId | 동일 YN 계열 |
| detailImage2 | + **imageYN=Y** | subImageYN |
| areaBasedList2 | + lDongRegnCd, lDongSignguCd | areaCode (deprecated 예정) |

### 7-3. Deprecated 파라미터 regression 방지

- YN 파라미터를 다시 추가하면 HTTP 400 (Bad Request) 발생
- 기존 작업 코드를 복사·수정할 때 YN 파라미터 잔류 여부 필수 확인
- 수집 스크립트 작성 후: `grep -n "YN"` 으로 명시적 검사

### 7-4. HTTP 오류 분류 (오판 방지)

| 현상 | 의미 | 원인 예시 |
|---|---|---|
| HTTP 400 Bad Request | 서버 도달, 요청 거절 | deprecated 파라미터, 잘못된 contentId |
| HTTP 401/403 | 인증 실패 | serviceKey 만료/오류 |
| HTTP 0 / connection error | 네트워크 차단 | 방화벽, timeout |
| resultCode ≠ 0000 | API 레벨 오류 | 범위 초과, contentId 미등록 |

**HTTP 400을 "네트워크 차단"으로 분류 금지.** HTTP 400은 서버가 요청을 받았고 거절한 것이다.

### 7-5. known-good smoke test 필수

- 74건+ bulk 호출 전 반드시 known-good 1건 smoke test
- smoke test: 실제로 동작하는 contentId + 최소 파라미터 + 현행 엔드포인트
- smoke test 실패 시 bulk 절대 금지

### 7-6. error sentinel 취급

- `{"_error": true, "_http_status": 400, ...}` = sentinel (빈 데이터가 아님)
- sentinel을 정상 EMPTY로 처리 금지
- 신규 성공 raw는 별도 경로/파일명으로 저장 (sentinel 덮어쓰기 금지)

---

## 8. BYTE_IDENTICAL 수집 스크립트 원칙 (v2 추가)

- **as_of 고정**: Run1에서 `_run_metadata.json`에 날짜 저장 → Run2는 동일 날짜 재사용
- **HTTP count와 completeness 분리**: `http_total > 0 = "USED"`, `= 0 = "CACHE_ONLY"` — 이 필드가 Run1/Run2 간 달라지지 않도록 설계 (캐시 선행 확인)
- **BYTE_IDENTICAL ≠ completeness**: 재현 가능 ≠ 완전 수집. 별도로 판단.
- **정렬 기준**: JSONL 출력은 `candidate_id` 또는 `kto_content_id` 알파벳 순 정렬 고정

---

## 9. 완료보고서 작성 원칙 (v2 추가 — READY 귀속 오류 방지)

- READY 항목 서술 시 release-classification 파일에서 `release_v4 == "READY_FOR_RELEASE"` 레코드를 직접 읽어 candidate_id → name_ko 순서로 확인
- summary 숫자만 보고 장소명 추정 금지
- 보고서 작성 전: "최종 분류 → candidate IDs → names" 역검증 필수
- 숫자가 달라지면 원인 확정 후 수정

---

## 10. Git 안전 규칙

- `master` push/merge 금지
- `git add .` / `git add -A` 금지 → 파일 명시적 stage
- raw/frozen 기존 파일 덮어쓰기 금지
- API key 출력·커밋 금지
- force push 금지
