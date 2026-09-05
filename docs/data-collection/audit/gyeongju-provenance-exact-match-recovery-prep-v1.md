# 경주 provenance 정확명 매칭 복구 준비 v1 (2026-09-05)

> ⚠ **SUPERSEDED (2026-09-05)** — `gyeongju-exact38-*` 패키지는
> `gyeongju-official-page-images-*` (OFFICIAL-PAGE-IMAGE-GAPFILL-V1, 133 전수) 로 대체됨.
> **DO NOT APPLY SEPARATELY.** 상세: `gyeongju-official-page-image-gapfill-v1.md` §4.

> TASK-GOKOREAMATE-GYEONGJU-PROVENANCE-EXACT-MATCH-RECOVERY-PREP-V1 (Owner 승인 B 경로).
> 상위: gyeongju-official-image-api-completion-status-v1(HOLD 배경) · recovery-prep v1 · 감사 v1.
> Production 실행 없음 — 적용은 별도 Owner 승인 PROD-SQL 태스크.

## 1. 계약 (EXACT ONLY)

- 입력 고정: gap 133(중복 0) × provenance 1,814(blob `799efb73…`).
- 매칭 = **provenance alt_text ↔ Final title_ko 의 정확 일치**. 정규화는 NFC·trim·내부 공백 축약뿐.
- 이름 고유성 도메인 = canonical 302 전체(동명 다중 identity 면 EXACT_MULTIPLE).
- fuzzy/부분일치/유사도/의미 매칭/별칭 추측 **0** (스크립트에 유사도 라이브러리 미사용).

## 2. 결과 (합계 133 정확)

| 분류 | 수 |
|---|---|
| **EXACT_UNIQUE** | **38** |
| EXACT_MULTIPLE | 0 |
| NO_EXACT_MATCH | 95 (동궁과 월지 포함 — 그 이미지 alt 는 "동궁과 월지 야경" 등 수식형뿐) |
| PROVENANCE_ONLY_AMBIGUOUS | 0 |
| ALREADY_REFLECTED | 0 (38 전부 Production relation·image_url 0 실측) |

EXACT_UNIQUE 38 상세: 공식 이미지 **84행** · 단일 이미지 19곳(→ primary 자명) · 다중 이미지 19곳
(→ relation 만 준비, **primary 는 게이트** — 기존 Final 규칙이 후보당 1장·primary=True 뿐이라
다중 세트의 순서 규칙이 존재하지 않음. 임의 미학 규칙을 만들지 않음).
경주세계자동차박물관(GJ01-0093, spot 506) = EXACT_UNIQUE(단일, `pick7_img24.jpg`) — **포함·검증 완료**.

## 3. 복구 패키지 (immutable)

`data/main-intake/five-city-reflection-recovery-v1/`

| 파일 | 내용 |
|---|---|
| gyeongju-exact38-mapping-v1.jsonl | 84행 전체 매핑(candidate·spot·source_id·이름·URL·순서·primary/pending·권리) |
| gyeongju-exact38-images-apply-v1.sql | relation INSERT 84(NOT EXISTS·기존 primary 보호 가드) + 단일 19곳 image_url SET — sha256 `d5470e0125c35d934187ecbc8499c03ac938ea4d561dad4df3e61fd1ce59e770` |
| gyeongju-exact38-images-precheck/-readback-v1.sql | 적용 전/후 검증 (precheck 는 실서버 실측 완료: 38 pub·img 0·rel 0) |

기대 결과: relations +84 · primary +19 · image_url +19 · 경주 relation 총계 274→358 · 무관 행 0.

기존 `gyeongju-owner-two-images-apply-v1.sql` 과의 관계: **506(자동차박물관)은 본 패키지가 대체**
(동일 URL — 가드로 이중 적용 안전). 그 파일은 이후 **동궁과 월지(439) 전용**으로만 사용하며,
Owner 야경 지정본 확정 후 실행한다.

## 4. 동궁과 월지 — OWNER CONFIRMATION REQUIRED

> ✅ **해소(2026-09-05)**: Owner 가 아래 후보표 **3번 = moonCourse13.jpg** 를 primary 로 최종 지정.
> 반영은 `gyeongju-official-page-images-*-v2` 패키지(유일 apply 대상). `gyeongju-owner-two-images-apply-v1.sql`
> 은 **SUPERSEDED — DO NOT APPLY**.

repo·로컬 기록 전수 탐색 결과 과거 지정본의 파일명/URL 증거 **없음** →
OWNER_SELECTED_EXACT_IMAGE = **NO**. 임의 선택·moonCourse13 자동 확정 **하지 않음**.
공식 야경 후보 9종(전부 gyeongju.go.kr, 클릭 확인 가능):

| 파일명 | alt | 페이지(mnu_uid) |
|---|---|---|
| course01_img5-1.jpg | 밤의 동궁과 월지 전경 | 2297 |
| course01_img5-3.jpg | 밤의 동궁과 월지 전경 | 2297 |
| moonCourse13.jpg | 동궁과 월지 야경 | 2299 |
| moonCourse14.jpg | 동궁과 월지 야경 | 2299 |
| bustago1-2.jpg | 동궁과 월지 야경 | 2301 |
| unescoCourse19.jpg | 동궁과 월지 야경 | 2533 |
| bustago2-20.jpg / -21.jpg | 동궁과 월지 야경 | 2548 |
| pick7_img18.jpg | 동궁과 월지 야경 | 2942 |

URL 형식: `https://www.gyeongju.go.kr/design/tour2019/img/sub/<파일명>`.

## 5. A 경로 병행 확인 (공식 재게시 여부)

- 당일 재호출: GJ03/GJ04/GJ05 = **STILL_EMPTY**(totalCount 0 · NORMAL_SERVICE; 동시 GJ01=159·GJ06=10 정상 — 증거 JSON 유지).
- 이관/대체 공지: 기존 계약 문서·API 응답 범위에서 **NO_OFFICIAL_NOTICE_FOUND**
  (data.go.kr 카탈로그 웹페이지는 JS 렌더라 이번 범위에서 미확인 — 오너 채널 문의 권장 유지).

## 6. 잔여 95 — 다음 판단 재료

- 95 중 기존 **KTO 결정 링크 보유 10건**(수만 산출 — 이번 태스크에서 KTO 미사용, Owner 결정 대기).
- 나머지 85건은 현 원칙(정확명·do_not_guess) 하에서 연결 불가 — 선택지: 공식 재게시 대기(A) /
  Owner 승인 하의 후보별 수동 확정 목록 / KTO Type1 확대 여부(별도 결정).
