# TASK-DATA-BUSAN-RESTAURANT-IMAGE-SAFETY-SCAN-20A-10 검증보고서

**작성일**: 2026-07-26  
**상태**: 실행 보류 — 핵심 이슈 1건 + 개선 방향 2가지 (사용자 확인 필요)

---

## 1. 데이터 사전 확인

| 항목 | 결과 |
|------|------|
| 대상 파일 (`busan-restaurant-image-rights.csv`) | 존재 ✓ |
| yes+low 대상 추출 | **397건** ✓ |
| image_url 없는 건 | 0건 ✓ |
| image_url 도메인 | 전부 `www.visitbusan.net/uploadImgs/files/cntnts/...` |
| 이미지 HTTP 접근 (GET + 브라우저 헤더) | **200 OK / JPEG 113KB 확인** ✓ |
| 이미지 HTTP HEAD 접근 (헤더 없이) | **400 차단** — 서버가 HEAD 메서드·봇 UA를 차단 |
| 이미지 다운로드 속도 (동시 10) | ~34초 / 397건 |

---

## 2. 핵심 이슈 — 시각 검사 자동화 불가

### 이슈 내용

프롬프트에서 요구하는 검사 항목:

| 검사 항목 | 자동화 가능 여부 | 비고 |
|-----------|-----------------|------|
| URL 접근 가능 / 형식 확인 | ✓ **가능** | GET + 브라우저 헤더, JPEG 매직 바이트 확인 |
| 이미지 파일 크기 / 해상도 검증 | △ 부분 가능 | 파일 크기는 확인 가능, 해상도는 라이브러리 필요 |
| **워터마크 / 크레딧 텍스트** | ✗ **불가** | OCR 또는 AI 비전 필요 (`tesseract.js` 미설치) |
| **다른 업체 상호 표시** | ✗ **불가** | 이미지 내 텍스트 인식 필요 |
| **음식점명 불일치** | ✗ **불가** | 이미지-텍스트 비교 불가 |
| **인물 중심 / 개인정보 노출** | ✗ **불가** | 얼굴 검출 라이브러리 필요 |
| **제3자 워터마크 / 로고** | ✗ **불가** | 템플릿 매칭 또는 AI 비전 필요 |

**현재 파이프라인에 설치된 이미지 처리 라이브러리 없음**:
- `sharp`, `jimp`, `canvas`, `tesseract.js`, `node-canvas` → 모두 미설치
- `.tools/playwright-visitbusan/` 에 Playwright ^1.62.0 설치됨 (다운로드는 가능)
- 그러나 다운로드 후 시각 분석을 위한 OCR / 비전 AI 도구 없음

### 문제의 영향

자동화가 불가능한 4개 항목(`watermark_or_credit`, `third_party_indicator`, `place_mismatch_suspected`, `person_or_privacy_risk`)을 모두 "unknown" 또는 "not_inspected"로 처리할 경우:

- 프롬프트 원칙 "확실하지 않은 항목을 정상으로 추정하지 말 것" 적용 시  
  → `final_recommendation = manual_review` 처리 필요  
  → **397건 전부 manual_review** → TASK 목적(이상 건 선별) 소멸

---

## 3. 실행 가능한 범위

### 기술 스캔 (자동화 가능, ~34초)

- 이미지 URL GET 요청 (브라우저 헤더 적용)
- HTTP 200 / content-type=image/* 여부
- JPEG/PNG 매직 바이트 확인
- 파일 크기 (0KB~매우 작은 파일 = 이상)
- 응답 없음 / 타임아웃 = 교체 대상

이 범위로 실행 시 예상 결과:
- 97~100%: URL 정상 접근 + JPEG 확인 → 기술적 이상 없음
- 0~3%: 404 / 타임아웃 / 비이미지 → replace_image 후보

### 시각 스캔 (자동화 불가)

- 워터마크, 상호 불일치, 인물, 제3자 로고 → 직접 검수 필요

---

## 4. 개선 방향 (2가지 선택지)

### 선택지 A — 기술 스캔 전용으로 범위 축소 후 즉시 실행

컬럼 `watermark_or_credit`, `third_party_indicator`, `place_mismatch_suspected`, `person_or_privacy_risk`를 모두 `not_inspected`로 기록.

`final_recommendation` 판정:
- URL 오류 / 비이미지 / 파일 10KB 미만 → `replace_image`
- 기술 이상 없음 → `use_candidate` (단, 시각 검수 미완 명시)

**장점**: 즉시 실행 가능, ~34초  
**단점**: 시각 검사 없음 — 결과물이 "기술적 문제 없음" 보장이지 "시각적 안전" 보장 아님  
**조건**: `decision_reason`에 "시각 검수 미실시, URL·포맷 기술 확인만 완료" 명시 필수

---

### 선택지 B — Playwright 다운로드 + 시각 검수 파일럿 (30건)

1. `.tools/playwright-visitbusan/` 의 Playwright로 397건 이미지 임시 다운로드  
2. 30건 샘플을 Read 도구로 직접 시각 검토  
3. 패턴 기반으로 나머지 367건에 규칙 적용  

**장점**: 실제 시각 검사 수행, 이상 패턴 탐지 가능  
**단점**: 별도 파일럿 세션 필요, 30건 시각 분석 시간 소요  
**조건**: 다운로드한 이미지는 작업 후 전량 삭제

---

## 5. 권고

| 항목 | 내용 |
|------|------|
| 즉시 실행 가능 | **선택지 A** (기술 스캔 전용) |
| 실제 이미지 안전 확인 필요 시 | **선택지 B** (파일럿 + 시각 검수) |
| 두 선택지 조합 | A 실행 → URL 오류·소형 파일 선별 → B로 선별 건 시각 확인 |

---

선택지 A 또는 B로 방향 확인 후 실행 예정.
