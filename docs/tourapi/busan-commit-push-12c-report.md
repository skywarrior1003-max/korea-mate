# TASK-DATA-BUSAN-COMMIT-PUSH-12C 완료 보고서

**날짜:** 2026-07-24  
**상태:** **PASS ✓ — commit·push 완료**

---

## 검증 결과 (실행 전)

| 항목 | 결과 |
|---|---|
| `git add .` / `git add -A` 금지 | ✓ 명시적 경로만 stage |
| 브랜치 확인 (master 차단) | ✓ `research/tourapi-nightly-20260722` |
| fetch origin 실행 | ✓ (master는 13c157b→cd3acb5 업데이트, 현재 브랜치 영향 없음) |
| 비밀정보 패턴 탐지 | ✓ 0건 |
| 제외 대상 미포함 | ✓ public/images, .env, migrations, src/, raw/, snapshots/ 전부 0건 |
| 최종 지표 확인 | ✓ 전체 1,767 / active 1,664 / merge_existing 21 / manual_review 4 |

---

## 커밋 정보

| 항목 | 값 |
|---|---|
| **브랜치** | `research/tourapi-nightly-20260722` |
| **commit hash** | `2df92651cf924402b28da3aabb354bed07c888a5` |
| **커밋 메시지** | `feat(data): complete Busan tourism baseline package` |
| **파일 수** | **104개** |
| **삽입/삭제** | 105,745 insertions, 46 deletions |
| **push 결과** | `86b411b..2df9265 → origin/research/tourapi-nightly-20260722` |
| **ahead/behind** | 0 / 0 (remote 완전 동기) |

---

## staged 파일 분류 (104개)

| 카테고리 | 파일 수 | 내용 |
|---|---|---|
| `scripts/tourapi-busan-*.mjs` | 20개 | 전체 부산 파이프라인 스크립트 (TASK-01~12A) |
| `data/tourapi/candidates/busan/` | 30개 | CSV 26개 + JSON 4개 (전체 후보 데이터) |
| `data/tourapi/reports/busan/` | 19개 | 지표 JSON 전체 (pilot~final) |
| `docs/tourapi/` | 35개 | 전체 보고서·검증 문서 (MD) |

---

## 사전 push hook 결과

push 시 프로젝트 하네스가 자동 실행됨:

| 시험 | 결과 |
|---|---|
| Gemini API 쿼타 검증 | ⏭️ SKIP (HARNESS_SKIP_GEMINI=1) |
| Supabase RLS 보안 (anon DELETE 차단) | ✅ PASS |
| VisitBusan 이벤트 날짜 포맷 | ✅ PASS |
| GPS Haversine 거리 계산 | ✅ PASS |
| 지역 필터 매핑 | ✅ PASS |
| 이미지 링크 HTTP 검증 (91건) | ✅ PASS (91/91 HTTP 200) |
| Anthropic API 검증 | ⏭️ SKIP (키 미설정) |
| 미식 가이드 무결성 (194건) | ✅ PASS |

---

## 대용량 파일 목록

| 파일 | 크기 | 포함 여부 |
|---|---|---|
| `busan-integrated-candidates.json` | 1,813,224 B (1.8 MB) | ✅ 포함 (CSV의 JSON 파생본, 정식 산출물) |
| `visitbusan-content-full.json` | 1,212,719 B (1.2 MB) | ✅ 포함 (VBM 전수 수집 JSON 파생본) |
| `visitbusan-content-full.csv` | ~544 KB | ✅ 포함 |
| `busan-canonical-candidates.csv` | ~343 KB | ✅ 포함 |
| `busan-batch-normalized.json` | 5,814,602 B (5.8 MB) | ❌ gitignore 자동 제외 |
| `gwangalli-m-drone-light-show-*.png` | 5,788,266 B (5.8 MB) | ✅ 기존 tracked, 이번 커밋에서 수정 없음 (미포함) |

---

## 제외 파일 목록

| 항목 | 제외 사유 |
|---|---|
| `.env.local` | gitignore — API 키 포함 |
| `supabase/.temp/` | gitignore — DB 연결 정보 |
| `data/tourapi/raw/` | gitignore — raw API 응답 |
| `data/tourapi/snapshots/` | gitignore — 대용량 체크포인트 |
| `data/tourapi/normalized/busan-batch-normalized.json` | gitignore — 5.8 MB 정규화 배치 |
| `data/tourapi/normalized/busan-pilot-normalized.json` | 커밋 범위 외 (candidates/reports 외) |
| `out/`, `.next/`, `node_modules/` | gitignore — 빌드 결과물 |
| `tmp/` | gitignore — 실행 로그 |
| `supabase/migrations/` | 이번 작업 범위 외 |
| `src/`, `functions/` | 앱 소스 코드, 별도 PR 권장 |

---

## 최종 git status --short (커밋 후)

```
?? data/tourapi/normalized/
```

잔여 untracked: `data/tourapi/normalized/` 1건 (busan-pilot-normalized.json 184 KB).  
gitignore 미적용이나 커밋 범위 외 — 향후 normalized/ 정책 결정 시 처리.

---

## 최종 지표

| 항목 | 값 |
|---|---|
| 전체 통합 후보 | **1,767건** |
| 활성 운영 후보 | **1,664건** |
| existing_enriched | 362 |
| api_only_existing | 991 |
| web_only_new | 311 |
| merge_existing | 21 |
| manual_review | 4 |
| excluded | 8 |
| reference_only | 21 |
| course_reference | 49 |

---

## 메인 노트북 fetch 방법

```bash
git fetch origin
git checkout research/tourapi-nightly-20260722
# 또는 특정 커밋
git checkout 2df92651cf924402b28da3aabb354bed07c888a5
```

핵심 파일:
- `data/tourapi/candidates/busan/busan-integrated-candidates.csv` (1차 기준본)
- `data/tourapi/reports/busan/busan-final-metrics.json` (최종 지표)
- `docs/tourapi/busan-final-handoff-11.md` (인수인계 문서)

---

TASK-DATA-BUSAN-COMMIT-PUSH-12C 부산 데이터 1차 기준본 commit·push 완료.
