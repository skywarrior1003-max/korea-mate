# 사용자 행동 의미 결정 v1

| 항목 | 값 |
|---|---|
| `document_type` | `DECISION_RECORD` |
| `status` | **`ACTIVE`** |
| `authority` | **`SUBORDINATE`** — 상위 원칙은 `gokoreamate-product-constitution-v1.md`가 갖는다 |
| `scope` | Save · Like · Helpful · Recommend · Report · Share 의 의미와 기호 |
| `decided_on` | 2026-08-09 |

여섯 행동은 서로 다른 것을 뜻한다. **같은 기호를 두 의미로 쓰면 둘 다 읽히지 않는다.**

| 행동 | 의미 | 기호 | 어디에 |
|---|---|---|---|
| **Save** | 나를 위한 **개인 장소 보관** | **북마크** | Explore 카드 · 장소 모달 · Place Detail · 공유받은 장소 |
| **Like** | 다른 사용자의 **감성 콘텐츠에 대한 사회적 반응** | **하트** | Story · Memory · 사용자 여행 콘텐츠 |
| **Helpful** | 정보성 콘텐츠가 **실제로 도움이 되었는가** | — | 후기 · 팁 · 공유 일정 등 필요한 화면에만 |
| **Recommend** | 내 장소를 **공개 추천 후보로 제출** | — | My Places 소유자 흐름 |
| **Report** | 잘못된 정보·품질 문제 **제보** | — | 저빈도. 가능하면 `⋯` 안에 |
| **Share** | 콘텐츠·장소·여행 **공유** | — | 기존 위치 유지 |

## 지키는 규칙

- **하트를 개인 장소 저장에 쓰지 않는다.** 하트는 Like 전용이다
- **Save 와 Like 를 같은 버튼·같은 저장소로 합치지 않는다**
- Helpful 을 모든 장소·Story 에 공통 버튼으로 붙이지 않는다
- **Recommend 를 일반 장소 카드의 상시 반응 버튼으로 만들지 않는다.** Like 대체가 아니다
- Report 를 주 CTA 로 상시 노출하지 않는다
- **공개 장소 자체에는 Like 를 두지 않는다.** 장소는 사람이 만든 콘텐츠가 아니다

## 구현 상태 (2026-08-09)

**Save 를 쓰는 화면 전체가 북마크로 통일됐다.** Explore 카드 · 장소 모달 · Place Detail · Home 카드 · Saved 패널 · Picks > Saved. 이전에는 하트 + `Like this spot` 라벨이 붙어 있어 사회적 반응처럼 읽혔다.

관련 문구도 함께 맞췄다 — Home 과 `/all-spots` 의 `Liked Spots` 필터와 `tap ❤️ on any card` 안내는 카드에 하트가 없어진 뒤로 사실이 아니게 됐다.

**This Trip 으로 가는 경로는 `Picks > Saved` 하나뿐이다.** `SavedSpotsPanel` 의 직접 `addToCart` 우회 경로를 제거하고 `Manage in Picks` 링크만 남겼다. 컴포넌트 자체는 보존한다.

**Place Detail 의 공개 장소 Like 노출을 제거했다.** `place_likes` 백엔드와 `PlaceLikeButton` 컴포넌트는 보존한다 — 노출만 정리한 것이지 기능을 지운 것이 아니다.

Helpful · Recommend 는 새로 만들지 않았다.

### 남은 하트

현재 저장소에 Save 의미의 하트는 **0** 이다. 앞으로 하트를 쓸 자리는 Story · Memory 의 Like 뿐이다.

## 참조

- `gokoreamate-product-constitution-v1.md` — 최상위 SSOT
- `picks-trip-memory-lifecycle-decision-v1.md` — Saved · This Trip · My Places 생애주기
