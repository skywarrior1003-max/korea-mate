# 경주 공식 이미지 API 완결 시도 — 상태 기록 v1 (2026-09-05)

> TASK-GOKOREAMATE-GYEONGJU-OFFICIAL-IMAGE-API-COMPLETION-V1 · RESULT = HOLD.
> 상위: recovery-prep v1 · 감사 v1 · closeout SSOT P0-1.

## 1. 실행한 것 (지정 공식 수집 단계 — 실제 실행됨)

Final gap queue 가 예약한 경주시 공식 이미지 API 3종을 기존 수집기 계약
(`scripts/gyeongju_full_collect.py` 의 endpoint/operation/params, TOUR_API_KEY)대로
전량 페이지네이션 호출했다.

| API | endpoint | 파일럿(2026-08-04) | **이번 실측(2026-09-05)** |
|---|---|---|---|
| GJ03 시내권 영상이미지 | 5050000/dwtwTrrstrService · getDwtwTrrstr | 680 | **totalCount 0** |
| GJ04 보문권 영상이미지 | 5050000/bomunTrrsrtService · getBomunTrrsrt | 560 | **totalCount 0** |
| GJ05 남산권 영상이미지 | 5050000/namsanTrrsrtService · getNamsanTrrsrt | 52 | **totalCount 0** |

대조군(같은 키·같은 순간): GJ01 관광지현황 **159** · GJ06 야경정보 **10** · GJ07 조망점 **10** — 전부 NORMAL_SERVICE.
→ 키/파라미터/권한 문제가 아니라 **이미지 서비스 3종의 데이터가 상류(경주시 공공데이터)에서 소거된 상태**다
(GJ02 가 과거 "CONFIRMED_EMPTY_OR_DEPRECATED"였던 것과 동일 패턴 — 자료실/사이트 리뉴얼 추정).

증거: `data/tourapi/gyeongju/gj-image-api-v1/gj-image-api-emptiness-evidence-v1.json`
(resultCode·totalCount 원본, serviceKey 마스킹).

## 2. 133건 분류 (전수)

- gap queue 재고정: **133건 정확·중복 0** · Production 반영 선존재 0(439·506 포함 전부 relation 0).
- 공식 API 수집 결과: **API_NOT_FOUND/EMPTY 133/133** — 지정 원천이 비어 있어 MATCHED 0.
- 계약상 secondary(KTO Type1, source-priority-matrix conflict_rule): 결정적 링크(linked_source_facts 의 KTO id) 보유 **17/133** — 그마저 Type1 여부 미확인. 동궁과 월지(0017)·자동차박물관(0093)은 KTO 링크 **없음**.
- 기수집 공식 원본(`gyeongju-official-image-provenance-v2.jsonl`, gyeongju.go.kr 1,814장)은 존재하나
  **후보ID 키가 없어 이름/alt 매칭 없이는 연결 불가** — 현행 identity 원칙(do_not_guess)상 자동 연결 금지.

→ 133 전수 identity-safe recovery artifact 는 **현시점 구성 불가** = HOLD.

## 3. 영향받지 않는 것

- **기존 2건 apply 패키지는 유효**: `gyeongju-owner-two-images-apply-v1.sql`(동궁과 월지·자동차박물관)의
  원천은 API 가 아니라 기수집 공식 provenance + Owner 개별 지시라 이번 소거와 무관하다.
  (동궁과 월지 primary 는 Owner 야경 지정본 확정 게이트 유지.)
- 제주 다국어 반영(완료)·전주 권리 게이트·Events/Essentials 계획 — 무관.

## 4. Owner 선택지

- **(A) 경주시 공공데이터 문의/재게시 대기** — GJ03/04/05 소거가 일시적(이관/리뉴얼)인지 확인. 재게시 시 본 태스크 그대로 재실행.
- **(B) 기수집 공식 provenance 승격(추천)** — Owner 승인으로 "gyeongju.go.kr 공식 기수집 1,814장 + 관광지명 **정확 일치** 매칭"을 명시 계약으로 신설(원 GJ03-05 계약도 '관광지명 기준 매칭'이었음). 정확 일치 실패분은 AMBIGUOUS 로 Owner 확정 목록화 — 추측 매칭은 계속 금지.
- **(C) KTO Type1 fallback 17건 선처리** — matrix 가 승인한 secondary. 소규모지만 즉시 가능.

권고: **B(주 경로) + A(원천 정합 병행)**, C 는 B 진행 시 자연 포함.
