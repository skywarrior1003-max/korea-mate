# 부산 데이터 브랜치 최종 전달 (21W)

**브랜치**: `research/tourapi-nightly-20260722`  
**원격**: `origin/research/tourapi-nightly-20260722`  
**전달일**: 2026-07-27  
**상태**: push 완료 — 메인 병합 대기

---

## 전달 커밋 (7건)

| 해시 | 메시지 | 내용 |
|---|---|---|
| `904d27d` | data(images): reclassify VisitBusan image rights | VB 958건 `operational_assumed` 재분류 (21I 정책 적용) |
| `c9d697b` | chore(data): split automation rules and align retries | 자동화 규칙 분리, MAX_RETRIES 통일 |
| `2e48e1f` | data(images): resolve remaining Busan image gaps | 21P·21Q 최종 산출물, photo-gallery-rules.md 오매칭 방지 규칙 |
| `dff6a64` | docs(automation): add data-source-priority and image-curation rules | 출처 우선순위·이미지 큐레이션 규칙 문서 |
| `af4566a` | feat(scripts): add photo-gallery integrated pipeline script | PG 통합 수집 스크립트 |
| `58cf6c5` | data(tourapi): add normalized busan and photo-gallery baseline data | 정규화 기준 데이터 + gitignore 예외 |
| `3e4162f` | data(images): preserve image curation pipeline inputs | 이미지 파이프라인 재현 최소 세트 |

---

## 최종 데이터 상태

### 이미지 분포 (1,642건 전체)

| image_status | 건수 |
|---|---|
| image_sufficient | 1,506 |
| source_exhausted | 134 |
| image_partial | 2 |
| image_missing | **0** |

기준 파일: `data/tourapi/reports/busan/busan-image-status-21q.csv` (1,642행)  
큐레이션 파일: `data/tourapi/reports/busan/busan-curated-images-21q.jsonl` (1,642행)

### 주요 기준 데이터

| 파일 | 규모 | 역할 |
|---|---|---|
| `data/tourapi/normalized/busan/busan-batch-normalized.json` | 4,135행 | KTO+VB 통합 정규화 |
| `data/tourapi/normalized/photo-gallery/integrated/busan-photo-gallery-integrated-21d-rev2.jsonl` | 9,630행 | PG 증분 동기화 기준선 |

---

## 자동화 문서 (docs/automation/)

| 파일 | 적용 작업 |
|---|---|
| `nightly-execution-rules.md` | 야간 수집·파이프라인·HARD STOP |
| `data-source-priority.md` | 출처 비교·교체 판단 7기준 |
| `image-curation-rules.md` | 이미지 상태값·수량·큐레이션 규칙 |
| `photo-gallery-rules.md` | PG 엔드포인트 운영·오매칭 방지 |
| `claude-md-merge-guide.md` | CLAUDE.md 메인 병합 원칙 |

---

## 파이프라인 연결 관계 (21F→21Q)

```
image-curation-pipeline-21f.mjs
  입력: place-summary-21d-rev2.csv + rights-audit + integrated-candidates + pg-integrated-21d-rev2.jsonl
  출력: image-status-21f.csv, curated-images-21f.jsonl, metrics-21f.json

image-status-rights-21g.mjs
  입력: (21F 출력 3개) + rights-audit
  출력: image-status-21g.csv, visitbusan-rights-21g.csv, metrics-21g.json

21H-REV2 (904d27d): image-status-21g.csv → image-status-21h-rev2.csv (958건 재분류)
21P (2e48e1f): image-status-21h-rev2.csv + curated-images-21f.jsonl → 21P 산출물
21Q (2e48e1f): 21P 산출물 → image_missing 0 최종
```

**재현성 상태**: `not_reexecuted`  
스크립트는 보존됨. 입력·중간 산출물 보존됨. writeAtomic 구조(고정 경로 덮어쓰기)로 인해 재실행 미수행.

---

## 메인 병합 주의사항

- [ ] **CLAUDE.md 전체 덮어쓰기 금지** — `docs/automation/claude-md-merge-guide.md` 따라 수동 통합 (이식 항목 4개)
- [ ] 자동화 문서(`docs/automation/*.md`)는 그대로 병합 가능하나, 동일 경로 존재 시 diff 확인
- [ ] 정규화 기준 데이터는 메인에 미존재하면 그대로 반영, 존재하면 최신성 기준으로 판단

---

## 운영 반영 상태

- DB·city_spots·UI·배포: **미실행** — 메인 담당자가 별도 설계·검증 후 적용
- src/, functions/, supabase/: 변경 없음
- package.json / lock 파일: 변경 없음

---

## 제외한 untracked 파일

| 분류 | 예시 |
|---|---|
| API 호출 로그 | api-call-log-21d-rev2.json, busan-photo-gallery-calllog.csv |
| 중복·이전 버전 보고서 | busan-image-curation-pipeline-21f.md, busan-image-status-rights-21g.md 등 |
| 외부 입력 자료 | 경주 API 신청 목록.txt, 경상북도 관광공사 CSV |
| Superseded 파일 | busan-pilot-normalized.json (batch에 포함), busan-photo-gallery.jsonl (integrated에 포함) |

---

## 메인 담당자 다음 순서

- [ ] `git fetch origin research/tourapi-nightly-20260722`
- [ ] 커밋 7건 및 파일 구조 확인
- [ ] `docs/automation/claude-md-merge-guide.md` 읽고 CLAUDE.md 수동 병합
- [ ] `docs/automation/*.md` 자동화 문서 메인 반영
- [ ] 정규화 기준 데이터 메인 경로 반영
- [ ] DB / city_spots 적용은 별도 설계·검증 후 진행
