# TASK-DATA-BUSAN-RESTAURANT-IMAGE-SAFETY-SCAN-20A-10 완료보고서

**작성일**: 2026-07-26  
**상태**: 완료 (기술 스캔 Option A — 운영 반영·commit·push 보류)

---

## 1. 검증 내용

### 1-1. 프롬프트 구조 검증 (개정 프롬프트)

| 항목 | 검증 결과 |
|------|-----------|
| 시각 검사 제외 선언 | 명시 ✓ ("워터마크·인물·상호 불일치에 대한 시각검사가 아니다") |
| `visual_inspection_status` 고정값 | `not_inspected` 전건 ✓ |
| `technical_status` 허용값 4종 | valid / access_failed / invalid_image / too_small ✓ |
| `final_recommendation` 허용값 2종 | use_candidate / replace_image ✓ |
| `use_candidate` 판정 기준 | HTTP 200 + 정상 이미지 + ≥10KB + 정상 해상도 ✓ |
| `replace_image` 판정 기준 | 접근 실패 / 비이미지 / 손상 / <10KB / 저해상도 ✓ |
| GET + 브라우저 헤더 지정 | User-Agent + Referer 명시 ✓ |
| HARD STOP 조건 | 5종 명시 ✓ |
| 원본 수정 금지 | 스냅샷 검증 포함 ✓ |

**개선 아이디어 없음 — 프롬프트 구조 이상 없음.**

### 1-2. 데이터 사전 확인

| 항목 | 결과 |
|------|------|
| 입력 파일 (`busan-restaurant-image-rights.csv`) | 416줄 (헤더 + 415행) ✓ |
| yes + low 필터 결과 | **397건** ✓ |
| 이미지 URL 없는 건 | 0건 ✓ |
| URL 도메인 | 전부 `www.visitbusan.net/uploadImgs/files/cntnts/...` |
| 중복 URL | **0건** (397건 전부 고유) |
| GET 접근 테스트 (사전 검증) | HTTP 200 + JPEG 113KB + 1200×544px 확인 |
| HEAD 차단 여부 | 서버가 HEAD 차단 — GET + 브라우저 헤더 필수 |

### 1-3. 기술 구현 검증

| 구현 항목 | 방법 |
|----------|------|
| JPEG 해상도 추출 | SOF 마커(0xC0~0xCF) 직접 파싱 (라이브러리 없음) |
| PNG 해상도 추출 | IHDR offset 16-23 고정 파싱 |
| 파일 크기 | 응답 버퍼 전체 크기 (`buf.length`) |
| MIME 타입 | `content-type` 헤더 + 매직 바이트 교차 확인 |
| 동시 처리 | 10건 배치 (Promise.all) |
| 임시 파일 | 없음 — 전량 메모리 내 처리 후 결과만 CSV 출력 |

---

## 2. 실행 결과

### 2-1. 기술 상태 분포

| technical_status | 건수 | 비율 |
|-----------------|------|------|
| **valid** | **396** | 99.7% |
| access_failed | 0 | 0% |
| invalid_image | **1** | 0.3% |
| too_small | 0 | 0% |
| **합계** | **397** | 100% |

### 2-2. 최종 권고

| final_recommendation | 건수 |
|---------------------|------|
| **use_candidate** | **396** |
| **replace_image** | **1** |

### 2-3. valid 396건 이미지 특성

| 항목 | 값 |
|------|-----|
| 너비 (전건 동일) | **1200px** |
| 높이 범위 | 544 ~ 1800px (중앙값 545px) |
| 파일 크기 최솟값 | **22,201B (21.7KB)** → 10KB 기준 충분 초과 |
| 파일 크기 최댓값 | 1,959,341B (1.87MB) |
| 파일 크기 중앙값 | 96,788B (94.5KB) |
| 포맷 분포 | JPEG 383건 / PNG 13건 |
| 중복 URL | 0건 |

### 2-4. replace_image 1건 상세

| 항목 | 내용 |
|------|------|
| candidate_id | `busan-F-00324` |
| 음식점명 | 부산명물횟집 |
| 이미지 URL | `https://www.visitbusan.net/uploadImgs/files/cntnts/20230613131233567_ttiel` |
| HTTP 상태 | 200 |
| 응답 content-type | `text/html` |
| 매직 바이트 | `0a0a3c21` (HTML 태그 `<!` 시작) |
| 파일 크기 | 2,236B |
| 판정 | **invalid_image** — URL이 존재하나 이미지가 아닌 HTML 페이지 반환 |
| 조치 | replace_image (KTO 대체 이미지 탐색 또는 VB 재수집 필요) |

> `busan-F-00324`는 HTTP 200이지만 실제 이미지가 아닌 HTML 오류 페이지를 반환함. VisitBusan 서버에서 해당 이미지가 삭제되었거나 URL이 잘못된 상태로 추정.

---

## 3. 검증 결과

| 항목 | 결과 |
|------|------|
| yes+low 397건 누락 0 | ✓ |
| candidate_id 중복 0 | ✓ |
| visual_inspection_status = not_inspected 397건 | ✓ |
| technical_status 허용값 검증 | ✓ |
| final_recommendation 허용값 검증 | ✓ |
| 중복 URL | 0건 (없음) ✓ |
| 원본 rights CSV 무변경 | ✓ |
| 원본 audit CSV 무변경 | ✓ |
| 원본 candidates JSON 무변경 | ✓ |
| 원본 candidates CSV 무변경 | ✓ |
| 임시 파일 삭제 | ✓ (디스크 저장 없음 — 메모리 내 처리) |
| 실행 시간 | 16.4초 |

---

## 4. 변경 파일

| 파일 | 유형 | 내용 |
|------|------|------|
| `data/tourapi/reports/busan/busan-restaurant-image-safety-scan.csv` | **신규** | 398줄 (헤더 + 397행) |
| `scripts/tourapi-busan-restaurant-image-safety-scan-20a10.mjs` | **신규** | 기술 스캔 스크립트 |

---

## 5. 운영 참고

- **use_candidate 396건**: 기술 검사 통과 (URL 접근 가능 + JPEG/PNG 포맷 + 크기·해상도 정상). 전건 1200px 너비의 고해상도 이미지. **시각 검수(워터마크·인물·상호 불일치) 미실시** — `visual_inspection_status = not_inspected`로 명시됨.
- **replace_image 1건** (`busan-F-00324`, 부산명물횟집): URL이 HTML 페이지를 반환함. 이미지 재수집 또는 교체 필요.
- **시각 검수 미실시 범위**: 전 397건에 대해 워터마크, 타 업체 상호, 인물, 저작권자 표기 등의 시각적 내용은 확인되지 않음. 이 부분은 별도 육안 검수 또는 Vision AI 파일럿(선택지 B)으로 보완 필요 시 추가 진행 가능.

---

## 참고: 이전 검증보고서

원래 프롬프트(시각 검사 포함)의 불가 사유 및 선택지 A/B 제안 내용은 [busan-restaurant-image-safety-scan-20a10-verification.md](busan-restaurant-image-safety-scan-20a10-verification.md) 참조.

---

TASK-DATA-BUSAN-RESTAURANT-IMAGE-SAFETY-SCAN-20A-10 음식점 이미지 기술 스캔(Option A) 완료 — 운영 반영·commit·push 보류.
