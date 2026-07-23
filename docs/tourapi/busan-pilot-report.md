# GoKoreaMate 부산 파일럿 수집 보고서

**날짜:** 2026-07-23
**태스크:** TASK-DATA-BUSAN-PILOT-01

## 수집 결과

| 원천 | 수집 건수 | API 상태 |
|---|---|---|
| busan-attraction-ko | 20 | OK |
| busan-attraction-en | 20 | OK |
| busan-food-ko | 20 | OK |
| busan-food-en | 20 | OK |
| kto-ko | 20 | OK |
| kto-en | 20 | OK |

**API 요청 수:** 0회 (한도 20회, 재시도 포함 상한 30회)
**정규화 레코드:** 120건

## 필드 보유율

| 항목 | 보유율 |
|---|---|
| 좌표 | 100.0% |
| 이미지 URL | 88.3% |
| 설명문 | 66.7% |

이미지 라이선스: 모두 '미확인' — 공공누리 유형 별도 확인 필요

## 언어 연결 후보

| 신뢰도 | 건수 |
|---|---|
| high | 40 |
| manual_review | 0 |
| low | 0 |
| 합계 | 40 |

## 기존 데이터 비교 (참고자료 기준)

> state.json (31건), busan.ts (7건)은 운영 city_spots SSOT가 아님. 비교 근거 부족 항목은 comparison_source_missing 또는 manual_review로 분류함.

| 분류 | 건수 |
|---|---|
| comparison_source_missing | 78 |
| matched_busan_ts | 3 |
| new_candidate | 39 |

## 재처리 검증

| 항목 | 결과 |
|---|---|
| 1차·2차 레코드 수 일치 | PASS |
| 1차·2차 언어 연결 수 일치 | PASS |
| 전체 재처리 일치 | PASS |

## 전체 배치 전 보완사항

- 부산시 FoodService·FestivalService 다국어 실제 필드 완전성 확인 필요 (추정 기반 수집)
- 이미지 라이선스 확인 전 상업 서비스 자동 사용 금지
- 언어 연결 manual_review 항목 수동 검토
- KorService2/EngService2 contentId 다른 장소에도 언어 연결 점수 보정 필요
- comparison_source_missing 항목은 운영 Supabase 접근 후 재분류 필요

*자동 DB 반영 없음. 운영 반영은 사람 승인 필수.*
