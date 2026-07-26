# TASK-DATA-BUSAN-RESTAURANT-IMAGE-FIX-20A-11 검증보고서

**작성일**: 2026-07-26  
**상태**: 실행 보류 — 개선 사항 4건 (사용자 확인 필요)

---

## 1. 데이터 사전 확인

### 1-1. busan-F-00324 기본 정보

| 항목 | 내용 |
|------|------|
| candidate_id | `busan-F-00324` |
| 음식점명 | 부산명물횟집 |
| candidate_status | `api_only_existing` (VisitBusanContent 없음, FoodService만) |
| linked_source_keys | `FoodService:1612:ko` |
| source_detail_url | **비어 있음** (공식 상세 페이지 URL 없음) |
| 좌표 | 35.097115, 129.03111 |
| 주소 | 부산 중구 자갈치해안로 55 (남포동4가) |
| 깨진 이미지 URL | `https://www.visitbusan.net/uploadImgs/files/cntnts/20230613131233567_ttiel` |

### 1-2. 깨진 이미지 접근 테스트

| URL 유형 | HTTP | content-type | 크기 | 매직 바이트 | 상태 |
|---------|------|-------------|------|------------|------|
| MAIN_IMG_NORMAL (UC_SEQ=1612) | 200 | `text/html` | 2,236B | `0a0a3c21` (HTML) | ❌ 비이미지 |
| MAIN_IMG_THUMB (UC_SEQ=1612) | 200 | `text/html` | 2,236B | `0a0a3c21` (HTML) | ❌ 비이미지 |

> NORMAL·THUMB 모두 동일한 HTML 오류 페이지 반환. FoodService raw Step 1에서 "다른 이미지 필드" 확인 시 THUMB도 정상 이미지 아님.

### 1-3. FoodService raw 탐색 결과 — 핵심 발견

`busan-food-ko-p*.json` (437건) 에서 "부산명물횟집"을 탐색한 결과 **동일 이름 항목이 2건** 존재:

| UC_SEQ | 이름 | 주소 | 전화 | MAIN_IMG_NORMAL | 상태 |
|--------|------|------|------|----------------|------|
| **1612** | 부산명물횟집 | 부산 중구 자갈치해안로 55 (남포동4가) | 0507-1338-7617 | `20230613131233567_ttiel` | ❌ HTML 반환 |
| **112** | 부산명물횟집 | 중구 자갈치해안로 55 | 051-245-4995 | `20240419101804650_ttiel` | ✅ JPEG 111KB |

- UC_SEQ=112 이미지 접근 테스트: HTTP 200, JPEG 111,640B (정상)
- UC_SEQ=112 썸네일: HTTP 200, JPEG 34,438B (정상)

### 1-4. UC_SEQ=112 기존 후보 매핑 확인

| 항목 | 내용 |
|------|------|
| 기존 매핑 candidate_id | **`busan-F-00013`** |
| 이름 | 부산명물횟집 |
| linked_source_keys | `VisitBusanContent:food:112:ko\|FoodService:112:ko` |
| source_detail_url | `https://www.visitbusan.net/kr/index.do?menuCd=DOM_000000201002001000&uc_seq=112&lang_cd=ko` |

> UC_SEQ=112는 이미 `busan-F-00013`로 등록되어 있음.  
> **busan-F-00324와 busan-F-00013는 동일 음식점의 FoodService 이중 등록 항목**으로 추정됨.

### 1-5. KTO 풀 탐색 가능성

TASK-20A-8에서 VB restaurant 415건 ↔ KTO restaurant 222건 이름 정규화 일치 0건 확인됨. 부산명물횟집은 KTO 풀(busan-K-*)에 없을 가능성 높음. (Step 3 탐색 시 no_match 예상)

---

## 2. 이슈 목록

### 이슈 1 ― Step 1 탐색 범위 불명확 (영향: **핵심**, 대체 이미지 발견 여부 결정)

프롬프트: "FoodService raw의 다른 이미지 필드"

**문제**: 이 지시를 문자 그대로 구현하면 UC_SEQ=1612의 `MAIN_IMG_THUMB` 확인 → 동일 HTML 반환 → Step 1 실패로 처리됨.

그러나 실제 FoodService raw에는 **같은 음식점 이름(부산명물횟집)·같은 주소(자갈치해안로 55)로 등록된 별도 항목(UC_SEQ=112)**이 존재하고, 해당 항목에는 **정상 JPEG 이미지(`20240419101804650_ttiel`)** 가 있음.

이 항목(UC_SEQ=112)은 `busan-F-00013`으로 이미 후보에 등록되어 있으므로 이미지 권리 근거도 같은 수준으로 적용 가능.

**제안**: Step 1 탐색 범위에 "같은 이름+주소로 등록된 다른 FoodService 항목(동일 음식점 이중 등록 탐색)" 추가. 현행 프롬프트로는 유일한 실질적 대체 후보를 놓치게 됨.

---

### 이슈 2 ― `replacement_status` 허용값 미명시 (영향: 출력 일관성)

프롬프트: "찾지 못하면 `replacement_not_found`로 기록해줘"

**문제**: 찾은 경우의 값이 정의되지 않음. 출처 별로 값이 달라질 수 있음:

| 발견 경로 | 제안 값 예시 |
|----------|------------|
| FoodService raw 동일 이름 항목 | `found_foodservice_duplicate` |
| VisitBusan 공식 상세 페이지 | `found_visitbusan_page` |
| KTO 동일 음식점 | `found_kto` |
| 찾지 못함 | `replacement_not_found` |

**제안**: found 시 허용값 명시. 또는 단순히 `found` / `replacement_not_found` 2값으로 단순화하고 `replacement_provider`·`replacement_source_id`에 출처 기록.

---

### 이슈 3 ― `license_type` 허용값 미명시 (영향: 라이선스 정보 일관성)

**문제**: VisitBusan FoodService 이미지의 라이선스는 TASK-20A-9에서 `unverified`로 판정됨 (법적 확정 미완). 이 필드에 `unverified`, `kogl_1`, `kogl_3`, `unknown` 중 어느 값을 쓸지 기준이 없음.

KTO 이미지의 경우 `kogl_1`/`kogl_3`으로 명시 가능하나, VB FoodService 이미지는 현재 허가 범위 미확정.

**제안**: TASK-20A-9 기준 적용 — VB FoodService 출처 이미지는 `license_type = unverified` 기재. KTO 출처 이미지는 `kogl_1` 또는 `kogl_3`. 이 기준을 프롬프트에 명시.

---

### 이슈 4 ― `commercial_use`, `modification_use`, `attribution_required` 허용값 미명시 (영향: 필드 파싱 일관성)

**문제**: 3개 부울 성격 필드의 허용값이 정의되지 않음.

| 필드 | 가능한 값 해석 |
|------|-------------|
| `commercial_use` | `yes` / `no` / `unknown` |
| `modification_use` | `yes` / `no` / `unknown` |
| `attribution_required` | `yes` / `no` / `unknown` |

kogl_1 → commercial=yes, modification=yes, attribution=yes  
kogl_3 → commercial=yes, modification=**no**, attribution=yes  
VB FoodService (unverified) → 전부 `unknown`

**제안**: `yes` / `no` / `unknown` 3값으로 허용값 명시.

---

### 이슈 5 (경미) ― Step 2 VisitBusan 상세 페이지 탐색 시작 URL 없음

**문제**: busan-F-00324의 `source_detail_url`이 비어 있어 Step 2 탐색 시작점이 없음.

UC_SEQ=1612를 이용해 `https://www.visitbusan.net/kr/index.do?menuCd=DOM_000000201002001000&uc_seq=1612&lang_cd=ko` URL 구성 가능 (busan-F-00013의 UC_SEQ=112 패턴 참조). 그러나 이 방법이 항상 유효한지 프롬프트에 명시 없음.

**제안**: source_detail_url 없는 경우 UC_SEQ를 이용한 URL 구성 규칙 추가 (`uc_seq=1612` 삽입).

---

## 3. 개선 방향 요약

| 이슈 | 현재 문제 | 제안 |
|------|-----------|------|
| Step 1 탐색 범위 | 동일 이름+주소 다른 UC_SEQ 항목 탐색 누락 가능 | "이름+좌표 기반 중복 FoodService 항목" 탐색 명시 추가 |
| `replacement_status` 허용값 | `replacement_not_found`만 정의 | `found` / `replacement_not_found` 또는 출처별 값 명시 |
| `license_type` | 허용값·VB 기준 없음 | `unverified` (VB FoodService), `kogl_1`/`kogl_3` (KTO) 명시 |
| `commercial_use` 등 3개 필드 | 허용값 없음 | `yes`/`no`/`unknown` 명시 |
| Step 2 시작 URL | source_detail_url 없어 탐색 불가 | UC_SEQ→URL 구성 규칙 추가 |

---

## 4. 사전 조사 결과 미리보기

개선 방향이 반영되면 예상 결과:

| 필드 | 예상 값 |
|------|---------|
| `replacement_provider` | `VisitBusan_FoodService` |
| `replacement_source_id` | `FoodService:112:ko` |
| `replacement_image_url` | `https://www.visitbusan.net/uploadImgs/files/cntnts/20240419101804650_ttiel` |
| `license_type` | `unverified` |
| `commercial_use` | `unknown` |
| `modification_use` | `unknown` |
| `attribution_required` | `unknown` |
| `replacement_status` | `found` (또는 `found_foodservice_duplicate`) |
| `decision_reason` | 동일 이름(부산명물횟집)·동일 주소(자갈치해안로 55) FoodService 이중 등록 항목(UC_SEQ=112, busan-F-00013)에서 정상 이미지 확인. HTTP 200 + JPEG 111KB. |

> UC_SEQ=112 이미지는 2024년 4월 업로드 (UC_SEQ=1612의 2023년 6월 대비 최신). 동일 음식점 근거: 이름·주소·좌표(35.09714/129.0312 ≒ 35.097115/129.03111, 약 2m 이내) 일치.

---

이슈 1~4에 대한 승인(또는 수정) 후 재실행 예정.
