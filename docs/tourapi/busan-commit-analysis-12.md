# TASK-DATA-BUSAN-COMMIT-PUSH-12 분석 보고서

**날짜:** 2026-07-24  
**상태:** 분석 완료 — 커밋·푸시 보류 (정리 미완료)  
**분석 대상:** 전체 746개 파일, KoreaMate 프로젝트 루트

---

## 1. 전제 조건 점검

### 1-1. git 리포지토리 없음

```
fatal: not a git repository (or any of the parent directories): .git
```

현재 `c:\기본저장\나의 프로젝트\KoreaMate\korea-mate` 디렉토리에 `.git` 디렉토리가 없다.  
**커밋·푸시 이전에 `git init` 또는 원격 저장소 clone이 선행되어야 한다.**

### 1-2. 커밋·푸시 보류 결정 배경

사용자 판단: "정리되지 않은 내용이 많아서 커밋 푸시 하면 안될듯해."  
본 보고서는 향후 커밋 준비 시 참고할 분석 자료로 작성.

---

## 2. 보안 위험 파일

### 🔴 CRITICAL — API 키·인증 정보 포함

| 파일 | 크기 | 위험 내용 | .gitignore 커버 |
|---|---|---|---|
| `.env.local` | 2,681 B | GEMINI_API_KEY, Supabase URL/Anon Key, TOUR_API_KEY | ✅ `.env.local` |
| `supabase/.temp/project-ref` | 소 | Supabase 프로젝트 참조 ID | ✅ `supabase/.temp/` |
| `supabase/.temp/pooler-url` | 소 | 데이터베이스 풀러 URL (DB 연결 정보) | ✅ `supabase/.temp/` |
| `supabase/.temp/linked-project.json` | 소 | 프로젝트 링크 설정 | ✅ `supabase/.temp/` |

**결론:** 위 4개 항목은 모두 현재 `.gitignore`에서 차단됨. 추가 조치 불필요.  
단, `.env.example` (비밀값 없는 템플릿)이 없으면 작성 권장.

---

## 3. .gitignore 현황 평가

현재 `.gitignore`는 예상보다 잘 설정되어 있음.

### ✅ 이미 차단 중인 항목

| 규칙 | 차단 대상 | 비고 |
|---|---|---|
| `.env.local` | API 키 포함 환경변수 | 보안 필수 |
| `supabase/.temp/` | project-ref, pooler-url, linked-project.json | DB 인증 정보 |
| `/out/` | Next.js 빌드 결과물 (204개 파일) | 재생성 가능 |
| `/.next/` | Next.js 개발 빌드 캐시 | 재생성 가능 |
| `/node_modules` | NPM 패키지 (~수천 파일) | 재생성 가능 |
| `*.tsbuildinfo` | `tsconfig.tsbuildinfo` (137 KB) | 재생성 가능 |
| `data/tourapi/raw/` | TourAPI raw 응답 JSON (100건+) | 대용량·재수집 가능 |
| `data/tourapi/snapshots/` | 배치 스냅샷 4건 × ~5.8 MB = **~23 MB** | 대용량·임시 체크포인트 |
| `data/tourapi/normalized/**/*-batch-normalized.json` | 정규화 배치 JSON (5.8 MB) | 대용량·중간 산출물 |
| `tmp/tourapi-pilot/` | 파일럿 임시 로그 | 임시 |
| `tmp/tourapi-nightly/` | 나이틀리 실행 상태·로그 | 임시 |
| `.vercel` | Vercel 배포 설정 | 재생성 가능 |

### ⚠️ .gitignore 미적용 — 추가 검토 필요

| 파일/경로 | 크기 | 문제 | 권장 조치 |
|---|---|---|---|
| `public/images/spots/gwangalli-m-drone-light-show-arirang-busan.png` | **5,652 KB** (~5.8 MB) | 대용량 바이너리 이미지 | `public/images/spots/*.png` gitignore 추가 또는 LFS 전환 |
| `data/tourapi/candidates/busan/busan-integrated-candidates.json` | ~1,812 KB (1.8 MB) | CSV의 JSON 사본, 대용량 | CSV 우선, JSON은 gitignore 고려 |
| `data/tourapi/candidates/busan/visitbusan-content-full.json` | ~1,200 KB (1.2 MB) | 중간 수집 산출물 JSON | gitignore 또는 커밋 여부 결정 |
| `public/data/events.json` | 204 KB | 앱 정적 데이터 | 의도적 커밋 대상이면 유지 |
| `public/data/restaurants.json` | 202 KB | 앱 정적 데이터 | 의도적 커밋 대상이면 유지 |
| `package-lock.json` | 373 KB | npm lock file | 일반적으로 커밋 권장 (재현성) |

> `out/` 내부에도 동일한 5.8 MB PNG가 있지만, `out/`는 이미 gitignore 처리됨.

---

## 4. 권장 .gitignore 추가 항목

```gitignore
# 대용량 바이너리 이미지 (CDN 또는 별도 스토리지 사용 권장)
public/images/spots/*.png
public/images/spots/*.jpg
public/images/spots/*.webp

# TourAPI JSON 사본 (CSV가 정본, JSON은 파생 산출물)
data/tourapi/candidates/busan/busan-integrated-candidates.json
data/tourapi/candidates/busan/visitbusan-content-full.json
```

> **참고:** 이미지를 Git LFS로 관리하거나 Supabase Storage / CDN으로 이전하면 위 규칙 불필요.

---

## 5. 커밋 대상 파일 분류

### 5-1. ✅ TASK-01~11 부산 데이터 파이프라인 — 커밋 권장

총 **78개 파일** (scripts 20 + candidates CSV 12 + reports JSON 19 + docs 27)

#### 파이프라인 스크립트 (20개, ~523 KB)

| 파일명 | 역할 |
|---|---|
| `scripts/tourapi-busan-pilot.mjs` | 파일럿 수집 |
| `scripts/tourapi-busan-diff.mjs` | 배치 diff 분석 |
| `scripts/tourapi-busan-canonical.mjs` | canonical 후보 생성 |
| `scripts/tourapi-busan-canonical-fix.mjs` | canonical 수정 |
| `scripts/tourapi-busan-event-source.mjs` | 이벤트 소스 매핑 |
| `scripts/tourapi-busan-batch.mjs` | TourAPI 배치 수집 |
| `scripts/tourapi-busan-visitbusan-pilot.mjs` | VB 파일럿 스크레이핑 |
| `scripts/tourapi-busan-visitbusan-collect.mjs` | VB 콘텐츠 수집 |
| `scripts/tourapi-busan-visitbusan-merge.mjs` | VB 병합 |
| `scripts/tourapi-busan-visitbusan-audit.mjs` | VB 감사 |
| `scripts/tourapi-busan-visitbusan-content-pilot.mjs` | VB 콘텐츠 파일럿 |
| `scripts/tourapi-busan-visitbusan-discovery-03.mjs` | **TASK-03** VisitBusan 발견 |
| `scripts/tourapi-busan-visitbusan-content-collect.mjs` | VB 콘텐츠 전수 수집 |
| `scripts/tourapi-busan-visitbusan-regression-02a.mjs` | VB 파서 회귀 테스트 |
| `scripts/tourapi-busan-visitbusan-content-patch-ko.mjs` | VB 한국어 패치 |
| `scripts/tourapi-busan-visitbusan-match-05.mjs` | **TASK-05** VB↔canonical 매칭 |
| `scripts/tourapi-busan-integrated-candidates-06.mjs` | **TASK-06** 통합 후보 생성 |
| `scripts/tourapi-busan-unknown-category-review-07.mjs` | **TASK-07** unknown 173건 분류 |
| `scripts/tourapi-busan-duplicate-manual-resolution-08.mjs` | **TASK-08** 중복 31건 판정 |
| `scripts/tourapi-busan-integrated-candidates-finalize-10.mjs` | **TASK-10** 최종 통합 반영 |

#### 최종 후보 데이터 CSV (12개, ~3,600 KB)

| 파일 | 크기 | 역할 |
|---|---|---|
| `data/tourapi/candidates/busan/busan-integrated-candidates.csv` | ~865 KB | **핵심 산출물** — 1,767건 통합 후보 |
| `data/tourapi/candidates/busan/busan-integrated-manual-review.csv` | 소 | 수동 검토 14건 |
| `data/tourapi/candidates/busan/busan-unknown-category-review.csv` | 소 | unknown category 173건 검토 이력 |
| `data/tourapi/candidates/busan/busan-duplicate-manual-resolution.csv` | 소 | 중복 수동 해소 31건 이력 |
| `data/tourapi/candidates/busan/busan-canonical-candidates.csv` | ~343 KB | canonical 1,356건 |
| `data/tourapi/candidates/busan/busan-canonical-manual-review.csv` | 소 | canonical 수동 검토 이력 |
| `data/tourapi/candidates/busan/busan-canonical-same-place.csv` | 소 | canonical 동일 장소 탐지 이력 |
| `data/tourapi/candidates/busan/busan-canonical-unmatched.csv` | 소 | canonical 미매칭 이력 |
| `data/tourapi/candidates/busan/busan-visitbusan-match-candidates.csv` | ~161 KB | VB↔canonical 매칭 결과 |
| `data/tourapi/candidates/busan/busan-visitbusan-web-only.csv` | ~144 KB | VB web-only 후보 원본 |
| `data/tourapi/candidates/busan/visitbusan-content-full.csv` | ~544 KB | VB 전수 수집 결과 |
| `data/tourapi/candidates/busan/busan-batch-language-links.csv` | ~332 KB | 배치 언어 링크 매핑 |

#### 지표·보고서 JSON (19개, ~255 KB)

`data/tourapi/reports/busan/` 전체:
- `busan-final-metrics.json` (핵심 최종 지표)
- `busan-integrated-candidates-metrics.json`
- `busan-duplicate-manual-resolution-metrics.json`
- `busan-unknown-category-review-metrics.json`
- `busan-visitbusan-match-metrics.json`
- `visitbusan-content-full-metrics.json` 외 14개

#### 문서 (38개, ~255 KB)

`docs/tourapi/` 전체:
- `busan-final-handoff-11.md` (핵심 핸드오프 문서)
- `busan-integrated-candidates-06-report.md`
- `busan-duplicate-manual-resolution-08-report.md`
- `visitbusan-match-05-report.md`
- `visitbusan-content-collect-04-report.md` 외 33개

### 5-2. ⚠️ 별도 검토 후 커밋 여부 결정

| 경로 | 이유 | 비고 |
|---|---|---|
| `supabase/migrations/` | SQL 마이그레이션 18개 — 운영 DB 관련, 이 세션에서 커밋 금지 | 별도 명시적 승인 후 결정 |
| `supabase/seeds/` | SQL 시드 데이터 — 운영 DB 관련 | 별도 검토 |
| `supabase/functions/` | Edge Functions 소스 — 운영 배포 관련 | 별도 검토 |
| `scripts/` (비부산) | `import-spots.ts`, `seed-restaurants.mjs` 등 DB 직접 접근 스크립트 | 이번 데이터 작업과 별개 |
| `public/data/*.json` | 앱 정적 데이터 (events.json 204 KB 등) | 의도적 산출물이면 커밋 가능 |
| `data/tourapi/candidates/busan/*.json` | CSV의 JSON 파생본, 1.8 MB + 1.2 MB | 파일 크기 정책 결정 후 |
| `src/` | Next.js 앱 소스 코드 전체 | 부산 데이터 작업과 무관, 별도 PR 권장 |
| `docs/other/` | 프로젝트 설계 문서 15개 | 앱 코드와 함께 커밋 |

### 5-3. ❌ 제외 대상 (gitignore 적용 중)

| 경로 | 이유 |
|---|---|
| `.env.local` | API 키 — 절대 커밋 금지 |
| `supabase/.temp/` | DB 연결 정보 |
| `out/` | Next.js 빌드 결과물 (204개) |
| `node_modules/` | NPM 패키지 |
| `data/tourapi/raw/` | raw API 응답 JSON (100건+, 대용량) |
| `data/tourapi/snapshots/` | 스냅샷 4건 × ~5.8 MB |
| `data/tourapi/normalized/*-batch-normalized.json` | 5.8 MB 중간 산출물 |
| `tmp/tourapi-pilot/`, `tmp/tourapi-nightly/` | 실행 로그·상태 |
| `tsconfig.tsbuildinfo` | TypeScript 빌드 캐시 |

---

## 6. 대용량 파일 요약

| 파일 | 크기 | 상태 |
|---|---|---|
| `data/tourapi/snapshots/busan-batch-normalized-*.json` × 4 | ~5.8 MB × 4 ≈ **~23 MB** | gitignore ✅ |
| `data/tourapi/normalized/busan/busan-batch-normalized.json` | ~5.8 MB | gitignore ✅ |
| `public/images/spots/gwangalli-m-drone-light-show-arirang-busan.png` | **5,652 KB** | ⚠️ gitignore 미적용 |
| `out/images/spots/gwangalli-m-drone-light-show-arirang-busan.png` | 5,652 KB | out/ → gitignore ✅ |
| `data/tourapi/candidates/busan/busan-integrated-candidates.json` | ~1,812 KB | ⚠️ 미결정 |
| `data/tourapi/candidates/busan/visitbusan-content-full.json` | ~1,200 KB | ⚠️ 미결정 |
| `package-lock.json` | 373 KB | 일반적으로 커밋 권장 |
| `data/tourapi/candidates/busan/visitbusan-content-full.csv` | ~544 KB | 커밋 대상 |

---

## 7. 향후 git 설정 권장 순서

git 리포지토리 초기화 및 커밋 준비 시 아래 순서를 권장:

```bash
# 1. git 초기화 (또는 원격 저장소 클론)
git init
git remote add origin <원격 URL>

# 2. .gitignore 보완 (public/images/spots/*.png 추가)
#    — 본 보고서 §4 참조

# 3. 부산 데이터 파이프라인만 먼저 커밋 (독립 PR 권장)
git add scripts/tourapi-busan-*.mjs
git add data/tourapi/candidates/busan/*.csv
git add data/tourapi/reports/busan/
git add docs/tourapi/
git commit -m "feat: Busan TourAPI data pipeline TASK-01~11 final output"

# 4. 앱 소스 코드는 별도 PR
git add src/ public/ supabase/functions/ ...
git commit -m "..."

# 5. supabase/migrations/는 별도 검토 후 별도 PR
#    — 이 세션에서는 커밋 금지
```

---

## 8. 결론 및 우선 조치 항목

| 우선순위 | 조치 | 내용 |
|---|---|---|
| **P0** | ⛔ `.env.local` 절대 커밋 금지 | 현재 gitignore로 차단됨, 재확인 |
| **P0** | ⛔ `supabase/.temp/` 절대 커밋 금지 | DB 연결 정보, 현재 차단됨 |
| **P1** | .gitignore 추가: `public/images/spots/*.png` | 5.8 MB 바이너리 이미지 |
| **P1** | git 리포지토리 초기화 (또는 클론) | 현재 .git 없음 |
| **P2** | 부산 데이터 파이프라인 20 scripts + CSV + docs 우선 커밋 | 독립 PR 권장 |
| **P2** | `busan-integrated-candidates.json` (1.8 MB) gitignore 여부 결정 | CSV가 정본, JSON은 선택적 |
| **P3** | `supabase/migrations/` 커밋 여부 별도 검토 | 이 세션 금지 |
| **P3** | 앱 소스(`src/`)는 부산 데이터 PR과 분리 | 관심사 분리 |

**현재 상태:** `.gitignore`는 보안 면에서 탄탄하게 구성되어 있으며, 주요 위험 파일은 이미 차단 중.  
`public/images/spots/` 이미지 1건과 대용량 JSON 파생본이 미결 상태.  
커밋 실행 전에 `git init` 및 `.gitignore` 보완이 선행되어야 한다.

---

TASK-DATA-BUSAN-COMMIT-PUSH-12 분석 보고서 완료.  
(실행 보류 — 정리 미완료 사용자 판단, 분석만 작성)
