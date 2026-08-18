# Public Memory Story — Launch Close v1

| 항목 | 값 |
|---|---|
| `document_title` | Public Memory Story Launch Close |
| `document_type` | **`LAUNCH_CLOSE_RECORD`** |
| `authority` | **`NONE`** — 제품 방향을 정하지 않는다. "여기까지 끝났다"만 기록한다 |
| `status` | **`PUBLIC_MEMORY_STORY_PRODUCTION_LAUNCHED`** |
| `closed_on` | 2026-08-18 |
| `verified_commit` | `87a8c91` — Cloudflare Production 배포 성공(branch `master`) |
| `applied_migrations` | 053 · 054 (운영 적용 및 postcheck 완료) |
| `launch_blockers` | **0** |
| `product_authority` | `gokoreamate-product-constitution-v1.md` |
| `data_authority` | `../architecture/gokoreamate-data-contract-v1.md` |

이 문서의 목적은 하나다 — **다음 사람이 이 트랙을 다시 열었을 때 무엇이 끝났고 무엇이 남았는지만 알면 되게 하는 것.**
중간 시행착오는 적지 않는다. 커밋 기록에 남아 있다.

---

## 1. 무엇을 만들었나

사용자가 여행 중 남긴 기억(Memory)을 **본인이 고른 것만** 바깥에 보여 주는 공개 화면과,
그 공개물에 문제가 있을 때 신고하고 관리자가 가릴 수 있는 흐름.

### 기반 (Production 적용 완료)

| | |
|---|---|
| migration 053 | Memory 의 장소 표시명 · 공개 동의 시각 · 동의 판본 |
| migration 054 | 신고 대상·사유 확장, 관리자 숨김 상태, 자기검증 guard |
| 공개 기본값 | **비공개.** 명시적으로 켠 것만 나간다 |
| 동의 | 공개 전환 시 서버가 시각과 판본을 함께 기록. 부분 갱신 불가 |
| 공개 egress | 화이트리스트. 목록에 없는 값은 화면이 볼 수 없다 |
| 사진 | 되돌릴 수 없는 opaque ref + 비공개 Storage 프록시. 원본 경로·서명 URL 미노출 |
| 관리자 숨김 | `moderation_hidden_at` — `is_public` 과 별개의 상태 |

---

## 2. Production 에서 확인한 lifecycle

사진 2장짜리 fixture 하나로 처음부터 끝까지 실제 운영에서 확인했다.

1. 공개 → Story 200, Memory 1, 사진 2장 노출
2. 신고 접수 → **자동으로 가려지지 않음** (Story 계속 200)
3. 관리자 차단 → Story 404 · 사진 2장 차단 · `/shared` 본문 없음
4. Copy 차단, 새 복사본 0
5. 만든 사람이 다시 켜려 하면 → **409**
6. 차단 중에도 owner 의 여행·Memory·사진·메모 **보존**
7. 차단 해제 → **자동으로 다시 공개되지 않음** (여전히 404)
8. 만든 사람이 직접 공개 → 성공
9. Story·사진 2장 복구, 공개 payload 에 private 필드 재노출 0
10. 여행 전체 삭제 → 소유자·Story·사진 프록시·Memory API 전부 404
11. **legacy 첫 사진과 child 사진의 Storage object 실제 삭제 확인**

11번은 삭제 직전에 Supabase Storage 직행 서명 URL 두 장을 발급해 **한 번도 호출하지 않은 채** 보관하고,
삭제 후 그 URL 의 **최초 요청**에서 둘 다 정상 이미지 200 이 아님을 확인하는 방식으로 검증했다.
공개 프록시의 404 는 권한 차단이지 파일 삭제 증거가 아니므로 그 둘을 섞지 않았다.

---

## 3. 관리자 화면

- 차단 상태는 **클릭 기억이 아니라 서버에 저장된 값**으로 그린다. F5 해도 유지된다
- 차단 중인 카드는 채운 배경·굵은 테두리·`차단 중` 글자·`aria-pressed` 로 구분된다
- 대상이 이미 삭제된 신고는 버튼이 비활성화되고 `대상 없음` 으로 표시된다
- 가려졌는데 공개로 켜져 있는 모순 상태는 **경고만** 표시한다. 화면이 데이터를 고치지 않는다
- 차단/해제 API 는 요청값을 되돌려주지 않고 **실제 저장된 행**을 확인해 응답한다. 대상이 없으면 404

---

## 4. Storage 무결성

`moments` 버킷을 참조하는 DB 컬럼은 **세 개**다. 하나라도 빠뜨리면 정상 사진이 orphan 으로 잡힌다.

- `trip_moments.storage_path`
- `trip_moment_photos.storage_path`
- `user_spots.photo_storage_path`

전수 감사(recursive traversal + prefix 별 pagination, 세 소스 모두 포함) 결과:

| | |
|---|---|
| historical orphan candidate | **0** |
| recent unreferenced | 0 |
| unknown object | 0 |
| duplicate reference | 0 |
| 추가 reference source | 없음 |
| audit error | 0 |

여행 전체 삭제 경로는 cascade **전에** legacy 와 child 경로를 모두 모으고, Storage 를 먼저 지운 뒤 DB 를 지운다.
두 조회 중 하나라도 실패하면 DB 삭제로 넘어가지 않는다 — 목록이 불완전한 채 지우면 추적할 수 없는 파일이 남는다.

---

## 5. 검증 강도 — 과장하지 않기 위해 구분해 둔다

같은 "PASS" 라도 근거의 종류가 다르다. 나중에 이 문서를 인용할 때 섞지 말 것.

| 항목 | 근거 |
|---|---|
| lifecycle 1~11 | **Production 실증** |
| 실제 Storage 삭제 | **Production 실증** (서명 URL cold fetch) |
| 2장 삭제 E2E 당시의 `trip_moments`/`trip_moment_photos` **물리 row 0** | **직접 관측하지 못함.** 허용된 앱 API 로는 소유권 검사 때문에 접근 자체가 막힌다. 근거는 API residue 404 · FK cascade · 로컬 회귀 테스트로 **구분해** 기록 |
| 별도 one-off 정리 건의 row 0 | service_role postcheck 로 **직접 확인**. 위 항목과 다른 사실이므로 섞지 않는다 |
| `가려짐 + 공개=true` 모순 상태에서의 6경로 방어 | **운영에 그 상태를 만들지 않았다.** 커버 프록시는 완전한 동작 테스트, Story·사진 프록시·Copy 는 판정 동작 + 배선 확인, 인기 목록·OG 는 질의 조건 확인까지가 로컬 검증의 한계 |
| 운영 모순 행 수 | READ-ONLY count **0** |

---

## 6. CLOSED — 코드가 다시 바뀌지 않는 한 재검증하지 않는다

sharing privacy · Public Memory 동의/egress · UGC moderation · persisted 관리자 상태 UX ·
가려진 여행의 owner 재공개 409 · `Unhide ≠ Publish` · owner 직접 재공개 복구 ·
사진 2장 여행 삭제 · legacy + child Storage 실제 삭제 · 모순 행 감사 0 ·
historical Storage orphan 감사 0 · E2E QA 잔여 정리.

관련 코드를 고치면 그때 해당 항목만 다시 본다. 습관적으로 fixture 를 다시 만들지 않는다.

---

## 7. 알려진 비차단 후속

### Story 의 Share 버튼
`StorySummary` 는 `onShare` 가 있을 때만 Share 를 그린다. 현재 `shared/page.tsx` 는 `shareLabel` 만 넘기고
`onShare` 를 넘기지 않아 **버튼이 아예 렌더되지 않는다.** 깨진 버튼이 노출되는 상태가 아니므로 출시를 막지 않는다.
붙일지 말지는 제품 판단이다.

---

## 8. launch-close 체크리스트

| 항목 | |
|---|---|
| Production 배포 (`87a8c91`) | PASS |
| migration 053 적용·검증 | PASS |
| migration 054 적용·검증 | PASS |
| 공개 privacy (egress·opaque ref·프록시) | PASS |
| Story 런타임 | PASS |
| UGC moderation (신고·차단·해제) | PASS |
| owner 재공개 guard (409) | PASS |
| 관리자 persisted 상태 UX | PASS |
| 다중 사진 Storage 정리 | PASS |
| 최종 lifecycle E2E | PASS |
| 모순 행 감사 | 0 |
| historical Storage orphan 감사 | 0 |
| QA 잔여 정리 | PASS |
| 최종 smoke | PASS |

**최종 상태 `PUBLIC_MEMORY_STORY_PRODUCTION_LAUNCHED` · launch blocker 0.**

---

## 9. 참조

- `gokoreamate-product-constitution-v1.md` — 제품 최상위 SSOT
- `gokoreamate-product-status-v1.md` §9 — 공개 사용자 콘텐츠 안전 기능 상태
- `../architecture/gokoreamate-data-contract-v1.md` — 데이터·DB SSOT
- `../operations/production-catalog-readonly-053-054.sql` — 053·054 운영 확인용 READ-ONLY 질의
