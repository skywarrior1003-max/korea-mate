@AGENTS.md

## 데이터 작업 안전 원칙

이 원칙은 `scripts/`, `data/`, `docs/` 범위의 승인된 데이터 작업에만 적용한다.

### Git 안전 규칙

- 사용자가 명시적으로 승인한 Git 작업(commit·push 등)만 허용
- `git add .` / `git add -A` 금지 — 관련 파일만 명시적으로 stage
- `master` 직접 push, force push 금지
- merge, rebase, cherry-pick은 사용자 명시 승인 없이 금지

### 항상 금지

- 운영 DB·SQL·migration·배포
- `src/`, `functions/`, `supabase/`, package/lock 수정
- 비밀값 출력
- 승인되지 않은 외부 서비스 가입·로그인·우회

### 데이터 자동화 작업 시 읽어야 할 문서

각 작업 시작 전 해당 문서를 읽고 적용한다. 상세 문서가 이 파일과 충돌하면 상세 문서를 우선한다.

| 작업 유형 | 필수 로드 문서 | 주요 내용 |
|----------|--------------|---------|
| 야간 수집·후처리·Preflight·파이프라인 | `docs/automation/nightly-execution-rules.md` | 자율 진행·허용 범위·재시도·HARD STOP·체크포인트·Preflight 11항목·Validation Gate·다단계 단계별 규칙 |
| 출처 비교·병합·교체 판단 | `docs/automation/data-source-priority.md` | 기본/보완 원천 역할 / 선택 기준 7항목 / 자동 교체 금지 / 충돌 처리 |
| 이미지 선정·큐레이션·상태 관리 | `docs/automation/image-curation-rules.md` | source_pool/curated_images 분리 / 카테고리별 수량 / 상태값 / 재탐색 중단 |
| PhotoGalleryService1 수집·동기화 | `docs/automation/photo-gallery-rules.md` | 엔드포인트 역할 / 비표준 오류 / 증분 수집 / 기존 수집 보존 |

**우선순위 원칙 적용 범위**

두 기준은 목적이 다르며 혼용하지 않는다.

- **공공데이터 원천 비교·교체 판단**: 최신성 우선 (1순위) → `data-source-priority.md` 적용
- **운영 사진 선정**: 장소 일치도 우선 (1순위) → `image-curation-rules.md` 적용
