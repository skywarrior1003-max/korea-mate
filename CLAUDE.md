@AGENTS.md

## 데이터 작업 안전 규칙

`data/`, `scripts/`, `docs/automation/` 범위 작업에만 적용한다. 착수 전 해당하는 문서만 골라 읽는다 — 야간 수집·재시도·HARD STOP은 `docs/automation/nightly-execution-rules.md`, 출처 비교·교체 판단은 `data-source-priority.md`, 이미지 선정·상태값은 `image-curation-rules.md`, PhotoGalleryService1 수집·동기화는 `photo-gallery-rules.md`. 상세 문서가 이 파일과 충돌하면 상세 문서를 따른다.

- `master` 직접 push·force push 금지. merge·cherry-pick은 명시적 승인이 있을 때만.
- `git add .` / `git add -A` 금지 — 관련 파일만 명시적으로 stage.
- 데이터 작업에서 운영 DB·migration·deploy 금지.
- **HARD STOP** `supabase db push` · `supabase migration repair` · migration history 직접 조작 금지. 작업 프롬프트가 있더라도 사용자에게 해당 명령의 실행을 명시적으로 승인받지 않은 한 실행하지 않는다. 로컬 migration 파일 수와 원격 history 기록 수가 다른 것은 이 저장소의 **정상 상태**이며 repair 사유가 아니다 — `docs/architecture/gokoreamate-data-contract-v1.md` "migration 수동 적용 운영 계약" 참조.
- 승인 없이 `src/`·`functions/`·`supabase/`·package/lock 수정 금지.
- 비밀값은 출력도 커밋도 하지 않는다.
