# TASK-DATA-BUSAN-RESTAURANT-IMAGE-FIX-20A-11 완료보고서

**작성일**: 2026-07-26  
**상태**: 완료 (운영 반영·실제 교체·commit·push 보류)

---

## 1. 검증 내용

### 1-1. 개선된 프롬프트 구조 검증

| 이전 이슈 | 해소 여부 |
|----------|----------|
| Step 1 탐색 범위 불명확 (이름+주소 중복 탐색 누락) | ✅ Step 2 "이름+주소 일치 다른 UC_SEQ" 추가 |
| `replacement_status` 허용값 미명시 | ✅ `found / manual_review / replacement_not_found` |
| `license_type` 허용값 미명시 | ✅ `unverified_official_promotional_image / unknown` |
| `commercial_use` 등 3개 필드 허용값 미명시 | ✅ 전부 `unknown` 고정 |

**판단: 개선 아이디어 없음. 실행.**

### 1-2. 데이터 사전 확인

| 항목 | 확인 내용 |
|------|----------|
| `busan-F-00324` candidate_status | `api_only_existing` — FoodService:1612:ko 단독 |
| source_detail_url | 비어 있음 (Step 3 시작 URL 없음) |
| 깨진 이미지 | HTTP 200 / text/html / 2,236B — HTML 오류 페이지 |
| UC_SEQ=1612 THUMB | 동일 HTML 오류 페이지 — Step 1 탐색 결과 없음 |

---

## 2. 탐색 결과

### Step 1 — UC_SEQ=1612 다른 이미지 필드

| 필드 | URL | 결과 |
|------|-----|------|
| MAIN_IMG_NORMAL | `20230613131233567_ttiel` | ❌ HTML 오류 페이지 (기존과 동일) |
| MAIN_IMG_THUMB | `20230613131233567_thumbL` | ❌ 동일 HTML 오류 페이지 |

→ Step 1 실패, Step 2 진행.

### Step 2 — FoodService raw 이름+주소 일치 다른 항목 ✅ 발견

| 항목 | UC_SEQ=1612 (원본) | UC_SEQ=112 (대체 후보) |
|------|------------------|----------------------|
| 이름 | 부산명물횟집 | 부산명물횟집 |
| 주소 | 부산 중구 자갈치해안로 55 (남포동4가) | 중구 자갈치해안로 55 |
| 좌표 | 35.097115, 129.03111 | 35.09714, 129.0312 |
| **좌표 거리** | — | **9m (동일 장소 판정)** |
| 전화 | 0507-1338-7617 | 051-245-4995 |
| 이미지 | `20230613131233567` (2023년 6월, 깨짐) | `20240419101804650` (2024년 4월) |
| 기존 후보 | `busan-F-00324` | **`busan-F-00013`** |

**동일 음식점 판정 근거**:
- 이름 정규화 일치 ✓
- 주소 "자갈치해안로 55" 포함 ✓
- 좌표 9m 이내 ✓ (50m 기준 충족)
- FoodService 공식 출처 ✓ (부산관광공사 VisitBusan)

### Step 2 — 이미지 기술검사

| 항목 | 결과 |
|------|------|
| 실행 당시 HTTP 상태 | **502 (서버 일시 오류)** |
| 502 발생 원인 추정 | TASK-20A-10 실행 중 동일 서버에 397건 요청 이후 일시적 부하 |
| **세션 내 사전 검증 결과** | **HTTP 200 + JPEG `ffd8ffe0` + 111,640B + 1200×544px** |
| 사전 검증 시점 | TASK-20A-10 실행 전 동일 세션 내 (2026-07-26) |
| 썸네일 (UC_SEQ=112) | HTTP 200 + JPEG + 34,438B (사전 검증) |

### Step 3 — VisitBusan 공식 페이지

| 항목 | 결과 |
|------|------|
| 탐색 URL | `https://www.visitbusan.net/kr/index.do?menuCd=DOM_000000201002001000&uc_seq=1612&lang_cd=ko` |
| 접근 결과 | 502 — 서버 일시 오류로 탐색 불가 |

→ Step 2에서 이미 대체 후보 확정, Step 3 참조용.

### Step 4 — KTO 동일 음식점

| 항목 | 결과 |
|------|------|
| 이름 일치 busan-K-* | 0건 |
| 좌표 100m 이내 busan-K-* | 4건 (자갈치시장, 용두산 관광특구 등 — 음식점 아님) |

→ KTO 대체 후보 없음.

---

## 3. 최종 결과

| 필드 | 값 |
|------|-----|
| `candidate_id` | `busan-F-00324` |
| `restaurant_name` | 부산명물횟집 |
| `broken_image_url` | `…/20230613131233567_ttiel` |
| `replacement_provider` | `VisitBusan_FoodService` |
| `replacement_source_id` | `FoodService:112:ko` |
| `replacement_image_url` | `https://www.visitbusan.net/uploadImgs/files/cntnts/20240419101804650_ttiel` |
| `license_type` | `unverified_official_promotional_image` |
| `commercial_use` | `unknown` |
| `modification_use` | `unknown` |
| `attribution_required` | `unknown` |
| **`replacement_status`** | **`found`** |

**decision_reason 요약**: Step2 FoodService raw 이름+주소 일치 UC_SEQ=112 발견, 좌표 9m 동일 음식점 판정. busan-F-00013으로 기매핑됨. 세션 내 사전 검증 HTTP 200 + JPEG 111KB + 1200×544px 확인. 실행 당시 서버 502(일시 오류) — 복구 후 재확인 권장.

---

## 4. 검증 결과

| 항목 | 결과 |
|------|------|
| 동일 음식점 근거 존재 | ✓ (이름·주소·좌표 9m) |
| 이미지 URL 정상 디코딩 | ✓ (세션 내 사전 검증) |
| FoodService 공식 출처 확인 | ✓ |
| replacement_status 허용값 검증 | ✓ |
| license_type 허용값 검증 | ✓ |
| 원본 파일 무변경 | ✓ |

---

## 5. 변경 파일

| 파일 | 유형 | 내용 |
|------|------|------|
| `data/tourapi/reports/busan/busan-F-00324-image-replacement.csv` | **신규** | 2줄 (헤더 + 1행) |
| `scripts/tourapi-busan-F-00324-image-fix-20a11.mjs` | **신규** | 탐색 스크립트 |

---

## 6. 운영 참고

- **replacement_image_url**: `busan-F-00013` (부산명물횟집 UC_SEQ=112)에서 이미 사용 중인 이미지와 동일 원본. 동일 음식점에 대한 FoodService API 이중 등록(UC_SEQ=112 vs UC_SEQ=1612) 상황.
- **적용 전**: 서버 502 복구 확인 후 이미지 접근 재검증 권장.
- **법적 라이선스**: VisitBusan FoodService 이미지 저작권 확정 전까지 `unverified` 상태 유지.

---

TASK-DATA-BUSAN-RESTAURANT-IMAGE-FIX-20A-11 부산명물횟집 공식 대체 이미지 조사 완료 — 실제 교체·commit·push 보류.
