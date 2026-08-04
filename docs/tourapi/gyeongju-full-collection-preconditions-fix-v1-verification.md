# TASK-GYEONGJU-FULL-COLLECTION-PRECONDITIONS-FIX-V1 검증보고서

**검증 일자:** 2026-08-04  
**검증 대상:** GPT 생성 프롬프트 TASK-GYEONGJU-FULL-COLLECTION-PRECONDITIONS-FIX-V1  
**검증 결과:** **실행 보류** — 하드 블로커 1건, 구조적 개선 아이디어 3건 발견  
**처리:** 이 검증보고서 작성 후 프롬프트 수정 대기

---

## 1. 검증 전 환경 상태 확인

| 항목 | 결과 |
|------|------|
| Branch | `data/gyeongju-culture-tourism-pilot-correction-v1` ✓ |
| HEAD | `a8a2332` ✓ |
| Worktree | CLEAN ✓ |
| origin 설정 | `https://github.com/skywarrior1003-max/korea-mate.git` ✓ |
| `TOUR_API_KEY` 환경변수 | **NOT SET** ← 핵심 블로커 |

---

## 2. 태스크별 실행 가능성 분석

### 태스크 1 — Origin Push

**판정: FEASIBLE**

- origin remote 설정 완료
- 워크트리 클린, `a8a2332` HEAD 확인
- git 인증 설정(SSH/HTTPS credential)이 맞다면 즉시 실행 가능
- 블로커 없음

---

### 태스크 2 — 행사 #7 con_uid 확인

**판정: FEASIBLE**

- 경주문화관광 9월 행사 목록 페이지 (`mnu_uid=2393&initYear=2026&initMonth=9`) WebFetch로 접근 가능
- API 키 불필요
- 실제 con_uid가 페이지에 노출되면 `IDENTITY_LINK_VERIFIED`, 없으면 `IDENTITY_LINK_HOLD` 기록
- 블로커 없음

---

### 태스크 3 — 관광지 20건 공식 URL 보강

**판정: CONDITIONALLY_FEASIBLE — 사전 검증 단계 누락**

**문제점:**

source-contract-v2 기준으로 `mnu_uid=2292` (시내권 관광지 목록) 접근은 확인됐지만, **개별 관광지 상세 페이지 URL 패턴은 명시적으로 "미검증"으로 남아 있다**.

```
source-contract-v2.json "gyeongju_web_access" → mnu_uid=2292: STATIC_HTML
개별 장소 상세 URL: 미검증
```

경주문화관광 사이트 구조상 관광지 상세 페이지가:
- (A) 별도 URL로 존재하거나 (`page.do?mnu_uid=XXXX&detail_uid=YYYY`)
- (B) 목록 페이지 내 인라인 팝업/확장으로만 제공될 수 있음

(B) 구조라면 개별 URL 확보가 불가능하고 태스크 3의 결과 대부분이 `DETAIL_URL_MISSING`이 된다. 프롬프트는 이 가능성을 구조적으로 다루지 않고 20건 전부 시도를 전제한다.

**개선 아이디어:**

> **사전 샘플 검증 단계를 추가한다.** 20건 전부 시도 전에 시내권 2~3건(첨성대, 동궁과 월지)을 먼저 시도하여 개별 상세 URL 패턴 존재 여부를 확인한다. URL 패턴이 확인되면 20건으로 확장, 확인 안 되면 `DETAIL_URL_STRUCTURE_HOLD`로 기록하고 웹 URL 보강 대신 GJ01 공식 API URL 또는 권역 목록 URL을 `official_url_gyeongju_web`로 기록한다.

---

### 태스크 4 — 좌표 누락 9건 보강

**판정: EXECUTION_BLOCKED — TOUR_API_KEY 미설정**

**하드 블로커:**

```
TOUR_API_KEY=NOT SET
```

스크립트 `gyeongju_full_collect.py`, `gyeongju_event_detail.py` 모두 `TOUR_API_KEY` 환경변수를 필수 조건으로 확인한다. 미설정 시 즉시 `sys.exit(1)` 처리한다.

**프롬프트의 보강 우선순위 분석:**

| 순위 | 원천 | 실행 가능성 |
|------|------|------------|
| 1 | 경주시 공식 공공데이터 API (GJ01) | **원천 자체가 좌표 미제공** — 파일럿에서 이미 확인됨. 실질적으로 0건 보강 가능 |
| 2 | KTO 공식 API | **TOUR_API_KEY 없으면 완전 차단** |
| 3 | 경주문화관광 공식 페이지 구조화 좌표 | WebFetch로 시도 가능. 단 페이지가 좌표를 HTML에 임베드하지 않으면 0건 |
| 4 | 공식 지도 링크 명시 좌표 | 3순위와 동일 경로 |

현재 환경에서 1순위와 2순위가 모두 불가능하므로, 우선순위 상위 2개 원천이 차단된 상태에서 태스크를 시작하면 대부분 `COORDINATE_STILL_MISSING` 결과가 나온다.

**개선 아이디어 1 — TOUR_API_KEY 사전 확인 단계 추가:**

> 프롬프트 시작 전 다음 pre-flight check를 명시한다:
> ```
> if TOUR_API_KEY not set → KEY_REQUIRED_HOLD. 태스크 착수 불가.
> ```
> TOUR_API_KEY 설정 방법은 `.env.local` 또는 환경변수 주입을 통해 준비 후 재시도.

**개선 아이디어 2 — KTO 명칭 기반 재검색 단계 명시:**

파일럿에서 좌표가 MISSING인 9건은 **GJ01-to-KTO12 ID 직접 매칭** 실패가 원인이다. 이는 KTO에 등록되지 않은 것이 아니라 다른 contentId로 등록됐을 가능성이 높다.

특히:
- **불국사**: 유네스코 세계문화유산. KTO 미수록은 비합리적 — GJ01 ID `gyeongju-GJ01-0125`와 KTO의 실제 불국사 contentId가 매칭되지 않은 것으로 판단
- **석굴암**: 동일 이유
- **교촌마을**: 경주 대표 관광지, KTO 수록 가능성 높음

> **프롬프트에 KTO searchKeyword 명칭 검색 단계를 추가한다.** GJ01 ID 직접 매칭이 아닌 관광지 명칭으로 KTO `searchKeyword` API를 호출하고, 반환된 contentId에서 좌표(mapx, mapy)를 추출한다. 단 `TOUR_API_KEY` 설정 후에만 가능.

**개선 아이디어 3 — 1순위 명시 수정:**

> "1순위: 경주시 공식 공공데이터 API"는 이미 파일럿에서 좌표 미제공으로 확인된 원천이다. 이를 "GJ01 API — 좌표 필드 미제공(파일럿 확인), 실질적 1순위는 KTO API"로 수정하여 실행자가 GJ01 조회에 시간을 낭비하지 않도록 한다.

---

## 3. 요약: 발견된 문제 및 개선 아이디어

| # | 유형 | 대상 태스크 | 내용 |
|---|------|------------|------|
| 1 | **하드 블로커** | 태스크 4 | `TOUR_API_KEY` 미설정 → KTO 좌표 조회 즉시 차단 |
| 2 | 구조적 개선 | 태스크 3 | 개별 관광지 상세 URL 패턴 사전 샘플 검증 단계 없음 |
| 3 | 구조적 개선 | 태스크 4 | KTO searchKeyword 명칭 기반 재검색 단계 미명시 (불국사·석굴암 등 명칭 매칭으로 좌표 복원 가능) |
| 4 | 표현 개선 | 태스크 4 | 보강 우선순위 1순위(GJ01)가 이미 실패 확인된 원천 — 불필요한 단계 |

---

## 4. 태스크별 실행 가능 여부 최종 판정

| 태스크 | 판정 | 비고 |
|--------|------|------|
| 1. Origin push | READY | 즉시 가능 |
| 2. 행사 #7 con_uid | READY | WebFetch로 가능 |
| 3. 관광지 20건 URL 보강 | CONDITIONALLY_READY | 샘플 2건 사전 검증 후 진행 권장 |
| 4. 좌표 9건 보강 | **BLOCKED** | `TOUR_API_KEY` 설정 후 재시도 필요 |

---

## 5. 권장 처리 방향

**옵션 A — TOUR_API_KEY 설정 후 재시도 (권장)**

TOUR_API_KEY를 환경변수에 설정하고, 보강 우선순위를 다음으로 수정한 뒤 태스크를 재시작한다:

```
수정된 보강 우선순위 (좌표):
1. KTO searchKeyword API — 관광지명 기반 재검색 (불국사·석굴암 포함 9건)
2. KTO type12/type14 detailCommon2 — 좌표 직접 조회
3. 경주문화관광 공식 페이지 임베드 좌표
4. 공식 지도 링크 명시 좌표
(GJ01 API = 좌표 미제공 확인됨, 조회 생략)
```

아울러 태스크 3 시작 전 첨성대·동궁과 월지 2건 샘플 URL 패턴 검증을 명시한다.

**옵션 B — 좌표 보강 분리, 나머지 3개 태스크 먼저 실행**

태스크 1 (push), 2 (행사 #7), 3 (관광지 URL)만 먼저 실행한다. 태스크 4 (좌표)는 `TOUR_API_KEY` 준비 후 별도 태스크로 진행한다. 이 경우 전체 수집 판정은 `READY_WITH_COORDINATE_HOLD`로 처리한다.

---

*이 검증보고서는 실행 보류 결정과 함께 작성됐습니다. 프롬프트 수정 또는 TOUR_API_KEY 준비 후 재지시 바랍니다.*
