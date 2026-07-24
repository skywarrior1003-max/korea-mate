# VisitBusan 웹 행사 스크래핑 — 검증 보고서

**날짜:** 2026-07-24
**상태:** REVIEW REQUIRED — 실행 전 해결 필요 기술 이슈 2건

---

## 1. GPT 분석 검증 결과

### 타당한 부분 ✓

| 항목 | GPT 판단 | 검증 |
|---|---|---|
| 수집 가능 여부 | PASS | ✓ robots.txt 전면 허용, 인증 불필요 |
| 행사명·기간·장소·공식 URL 원천으로 활용 | PASS | ✓ 상세 페이지 확인 |
| FestivalService API와 병렬 원천 | PASS | ✓ 별도 파이프라인 구조 적합 |
| robots.txt ≠ 콘텐츠 재이용 허가 | CORRECT | ✓ 행사명·날짜·장소·URL만 저장 |
| 요청 수 재산정 (850~950회) | CORRECT | ✓ 클로드 원안 120~200은 목록만 고려한 수치 |
| 정규식 HTML 파싱 취약성 지적 | CORRECT | ✓ 안전장치 필수 |
| 파일럿 후 전체 수집 | CORRECT | ✓ 기술 이슈 2건 해결 전 전체 실행 위험 |

### 수정 사항 — 언어 처리

GPT는 "언어별 dataSid 일치 여부" 미검증으로 파일럿 필요라 했으나:

**실제 확인:** KO·EN 상세 페이지 모두 dataSid=6167 정상 작동, 동일 행사 반환 ✓

**사용자 결정 반영:**
- 비짓부산 공식 5개 언어 콘텐츠를 완성된 공식 데이터로 그대로 사용
- 번역 품질 평가·보완 없음
- 언어 페이지 미제공 시 → KO 페이지 링크 fallback 제공 (번역 아님)

---

## 2. 직접 기술 탐침 결과 — 신규 발견 2건

### [CRITICAL-1] 페이지네이션 GET 파라미터 무효

**테스트 URL:**
```
https://www.visitbusan.net/kr/schedule/list.do?boardId=BBS_0000009
  &menuCd=DOM_000000204012000000&schYear=2026&schMonth=07&pageIndex=2
https://www.visitbusan.net/kr/index.do?menuCd=DOM_000000204012000000
  &schYear=2026&schMonth=07&pageIndex=2
```

**결과:** 두 URL 모두 `pageIndex=2`를 무시하고 **1페이지 동일 12건** 반환.

**영향:** 7월 2026 행사는 24건(2페이지). GET으로는 절반만 수집 가능. 다수 행사 누락.

**원인 분석:** 사이트의 `fn_go_page(2)` JavaScript 함수는 숨겨진 form을 **POST**로 제출하는 방식. GET 파라미터는 서버가 무시.

**필요 해결책:** Node.js `fetch` POST 방식 사용:
```javascript
fetch('https://www.visitbusan.net/kr/schedule/list.do', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    boardId: 'BBS_0000009',
    menuCd: 'DOM_000000204012000000',
    schYear: '2026',
    schMonth: '07',
    pageIndex: '2',
  }).toString()
})
```
단, 실제 파라미터명·POST 엔드포인트는 파일럿에서 확인 필요.

---

### [IMPORTANT-2] 언어 경로가 언어 콘텐츠를 보장하지 않음

**테스트 URL:** `https://www.visitbusan.net/jp/schedule/view.do?...&dataSid=6167`

**결과:** `/jp/` 경로임에도 **한국어 콘텐츠 반환**. "2026 북항 오션 SUP FESTA" 표기, 일본어 행사명 없음.

**영향:** 5개 언어 URL 경로가 해당 언어 데이터를 의미하지 않을 수 있음. 일부 행사는 JA·ZhS·ZhT 번역이 없을 때 KO 콘텐츠를 그대로 반환.

**처리 방법:**
- 수집 시 제목이 한국어(가-힣 포함)인지 판별
- 판별 결과 저장: `language_available: true/false`
- `language_available=false`인 레코드는 `official_url` fallback만 저장, 번역 없음으로 표시

**배경:** FestivalService API에서도 언어별 건수가 40/37/35/35/36으로 달랐던 것과 동일한 패턴. 비짓부산도 동일 구조.

---

## 3. 확인된 사항 (파일럿 없이 확정)

| 항목 | 확인 내용 |
|---|---|
| dataSid 언어 간 일치 | KO·EN 동일 dataSid=6167 → 같은 행사 반환 ✓ |
| 상세 페이지 URL 형식 | `boardId=BBS_0000009 + menuCd=... + dataSid=N` 전부 필요 ✓ |
| 공식 주최자 URL 제공 | 상세 페이지에서 https://bhsupfesta.com/ 직접 추출 가능 ✓ (TourAPI에 없는 실제 주최자 URL) |
| 이미지 URL 상대 경로 | `/upload_data/board_data/...` → `https://www.visitbusan.net` 접두어 필요 |
| 수집 대상 데이터 | 행사명·시작일·종료일·장소·주소·공식 URL·dataSid·언어 |
| 저장 제외 | 소개 본문 전문·이미지 파일 직접 저장 (URL만 보관) |

---

## 4. 파일럿 설계 (수정안)

GPT의 파일럿 권고를 반영하되, 위 2개 이슈를 포함한 설계:

**파일럿 목표:**
1. POST 페이지네이션 작동 확인 (2페이지 이벤트 수집 성공?)
2. 언어 콘텐츠 감지 로직 검증 (KO 반환 → `language_available=false` 표시)
3. HTML 파서 안정성 기준 수립 (파싱 실패 시 전체 중단, 기존 결과 보호)

**파일럿 범위:**
- KO 7월: 전체 페이지 (POST 페이지네이션 포함)
- EN·JA 7월: 상위 10개 dataSid 상세 페이지
- ZhS·ZhT: 상위 3개 dataSid

**검증 지표:**
- 목록 페이지당 실제 건수 및 종료 조건
- POST vs GET 페이지네이션 성공 여부
- 언어별 `language_available` 비율
- 상세 페이지 필드 채움률 (행사명·날짜·장소·공식URL)
- 같은 행사의 여러 달 중복 여부 (예: 7/25~12/19 행사가 8월에도 노출되는지)

---

## 5. 콘텐츠 재이용 범위 확정

| 수집·저장 허용 | 저장 제외 |
|---|---|
| 행사명 | 소개 본문 전문 |
| 시작일·종료일 | 포스터·배너 이미지 파일 직접 저장 |
| 장소·주소 | 사진 재배포 |
| 공식 상세 URL (visitbusan 상세 페이지) | 사이트 문구 대량 복제 |
| 주최자 공식 홈페이지 URL | |
| 이미지 URL (참조만, 직접 저장 아님) | |
| dataSid | |
| language_available 여부 | |

---

## 6. 실행 판정

| 구분 | 판정 |
|---|---|
| 전체 연간 수집 즉시 실행 | ❌ 위험 |
| 파일럿 실행 | ✓ 가능 — POST 페이지네이션 구현 포함 |
| FestivalService API 폐기 | ❌ 병렬 원천 유지 |

파일럿 스크립트에서 POST 페이지네이션이 작동하면 즉시 전체 수집으로 확장 가능.

---

TASK-DATA-BUSAN-VISITBUSAN-PILOT — 검증 완료. 기술 이슈 2건 해결 포함한 파일럿 실행 대기.
