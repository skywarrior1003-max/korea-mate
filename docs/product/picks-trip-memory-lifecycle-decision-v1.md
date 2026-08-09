# Picks · Trip · Memory 생애주기 결정 v1

| 항목 | 값 |
|---|---|
| `document_title` | Picks · Trip · Memory Lifecycle Decision |
| `document_version` | 1.0 |
| `document_type` | `DECISION_RECORD` — 확정된 제품 의미와 원칙만 기록한다 |
| `status` | **`ACTIVE`** — Saved ↔ This Trip ↔ My Places 이동과 삭제 UX 는 구현·QA 완료. 날짜·시간 지정 등 §5 항목은 미구현 |
| `authority` | **`SUBORDINATE`** — 상위 원칙은 `gokoreamate-product-constitution-v1.md`가 갖는다 |
| `scope` | Saved · This Trip · My Places · Trip · Memory 의 의미와 이동 규칙 · 삭제 UX |
| `conflict_rule` | Constitution 과 충돌하면 Constitution 이 우선한다. 코드·DB 와 충돌하면 임의 진행하지 않고 중단·보고한다 |
| `implementation_status` | **부분 구현.** §2 이동 규칙과 §3 삭제 UX 는 구현·QA 완료(390px A~F). §5 미확정 항목은 구현 없음. 현재 구현 사실의 SSOT 는 `gokoreamate-product-status-v1.md` 다 |
| `decided_on` | 2026-08-09 |
| `verified_commit` | `a7c936a` (결정 시점 대조 코드) |

**이 문서에 쓰지 않는 것** 컴포넌트 파일 경로 · 픽셀값 · API 시그니처 · 구현 일정. 구현 설계 단계에서 정하고 그 결과는 Status 문서가 기록한다.

---

## 1. 다섯 개념의 의미

```
Saved  ──넣기──▶  This Trip  ──AI 일정 생성──▶  Trip  ──여행 후──▶  Memory
       ◀─빼기──
My Places ──참조──▶ This Trip        (원본은 My Places 에 그대로 남는다)
```

### Saved
어디서 발견했든 — Explore · 추천 · 공유받은 링크 — 관심이 생겨 담아 둔 **보관함**이다.

- **Saved 는 그 자체로 일정에 반영되지 않는다.** AI 가 Saved 를 자동으로 집어넣지 않는다
- 날짜 개념이 없다. 다음 여행일 수도, 언젠가일 수도 있다
- 사용자가 고른 것만 `This Trip` 으로 간다

### This Trip
**이번 여행 일정에 실제로 반영하고 싶은 장소**다. 기존 `Selected` 개념을 이 방향으로 다시 읽는다.

- `Must-go` · `Candidate` 같은 **등급을 만들지 않는다**. 넣었으면 넣은 것이다
- 사용자가 특정 장소의 날짜·시간을 **직접 지정할 수 있다**
- 지정하지 않은 장소는 AI 가 배치한다
- 장소가 많아 전부 넣기 어려우면 **AI 가 조용히 지우지 않는다.** 충돌·조정 필요를 사용자에게 알린다

### My Places
사용자가 직접 등록하고 소유하는 개인 장소다.

- This Trip 에 써도 **My Places 원본은 유지된다**
- This Trip 에서 빼도 My Places 에는 그대로 있다
- This Trip 은 My Places 를 **참조**하는 것이지 가져가는 것이 아니다

### Trip
AI 일정이 만들어지면 그것이 `Trip` 이다. 2박 3일이면 그 **여행 전체 일정**을 뜻한다.

### Memory
여행 후의 Memory 는 **장소 하나의 보관함이 아니라 그 Trip 전체의 여행 기록**이다.

- 일정 · 장소 · Visited · 사진 · 메모가 **여행 맥락과 함께** 남는다
- 과거 Trip 전체를 복사해 새 여행으로 시작·수정할 수 있다
- 과거 Trip 안의 **특정 장소만** Saved 또는 새 This Trip 으로 다시 가져올 수 있다
- **어느 경우에도 원래 여행 기록은 훼손되지 않는다**

---

## 2. 이동 규칙

| 이동 | 동작 | 상태 |
|---|---|---|
| Saved → This Trip | 사용자가 명시적으로 넣는다. **This Trip membership 만 추가**한다 | 구현됨 |
| This Trip → 원래 자리 | `×` 로 뺀다. **membership 만 제거.** 확인창·Undo·토스트·`Moved to Saved` 메시지 없음 | 구현됨 |
| My Places → This Trip | 참조로 들어간다. 서버 `user_spots` 원본 불변 | 구현됨 |
| Trip → Saved / 새 This Trip | 과거 여행의 개별 장소를 다시 가져온다. 원본 Trip 불변 | **미구현** |
| Trip → 새 Trip | 전체 복사. 원본 Trip 불변 | 구현됨 |

### 2-1. 장소를 복사·이동하지 않는다 — 이 구조의 핵심

Saved 와 This Trip 은 **서로 다른 저장소로 데이터를 옮기는 관계가 아니다.** Saved 상태는 그대로 두고 This Trip membership 만 더한다. 화면에서만 **Saved 목록에서 그 장소를 숨긴다** — 같은 장소가 두 목록에 동시에 보이면 사용자가 두 번 담았다고 의심하기 때문이다.

그래서 This Trip 에서 빼면 **되돌리는 동작이 필요 없다.** Saved 원본은 처음부터 손대지 않았으므로 membership 이 사라지는 순간 자동으로 다시 보인다.

**This Trip 제외에 `toggleFavorite()` · `cacheSavedSpot()` 을 사용하지 않는다.** 그 함수를 부르면 Explore 에서 곧바로 This Trip 에 담은(Saved 가 아니었던) 장소까지 Saved 로 새로 만들어 버린다. My Places 장소도 마찬가지로 Saved 에 자동 등록되지 않는다.

**한 장소가 두 목록에 동시에 데이터로 존재하지 않는다.** 두 목록은 같은 장소 정체성(`sourceKey`)을 가리키고, 어느 membership 을 갖는지만 다르다.

---

## 3. 삭제 UX

파괴 정도에 따라 마찰을 다르게 준다.

| 동작 | 마찰 | 이유 | 상태 |
|---|---|---|---|
| This Trip 에서 빼기 (`×`) | **없음** — 즉시 | 잃는 것이 없다. membership 만 사라진다 | 구현됨 |
| **This Trip 전체 비우기 (Clear All)** | **짧은 확인 1회** | 여러 개를 한 번에 지운다. 개별 `×` 와 되돌리기 비용이 다르다 | 구현됨 |
| Saved 삭제 | **정리 모드**에서 다중 선택 후 **최종 삭제 시 확인 1회** | 관심 목록이 사라진다. 평소 카드에는 삭제 문구를 노출하지 않는다 | 구현됨 |
| My Places 실제 삭제 | **확인 1회** | 사용자가 만든 데이터다. 복구 경로가 없다 | 구현됨 |
| Trip 최종 삭제 | **확인 1회** | 여행 전체가 사라진다 | 구현됨 |
| Memory 삭제 | **확인 1회** | 사진·기록은 재현 불가능하다 | 미검증 |

**확인을 남발하지 않는다.** 되돌릴 수 있는 것에는 묻지 않고, 되돌릴 수 없는 것에만 묻는다. 확인 문구는 짧게 둔다 — 긴 설명은 읽히지 않고 마찰만 늘린다.

---

## 3-1. AI 경계 — Saved 는 추천 신호가 아니다

**This Trip = 사용자가 명시한 일정 앵커다.** AI 는 이 장소들을 기준으로 일정을 짠다.

부족한 일정은 **검증된 전체 장소 풀**에서 채운다. 판단 기준은 기존과 같다 — This Trip 주변, 취향, 동선, 날짜·시간, 영업시간, 카테고리 균형.

**Saved 여부 자체를 추천의 우선순위·가산점·감점·제외 조건으로 쓰지 않는다.**

- 추가 추천 장소가 Saved 에 있든 없든 **동일한 여행 적합성 기준**으로 판단한다
- Saved 는 "관심 있다" 는 표시이지 "이번 여행에 넣겠다" 는 뜻이 아니다. 그 구분이 무너지면 Saved 가 사실상 This Trip 이 되어 두 목록을 나눈 이유가 사라진다
- Constitution §11 "Like · Helpful · 반응은 신호이지 강제 일정 입력이 아니다" 와 같은 성격이다

향후 생성된 Trip 에서 사용자가 Saved · My Places 장소를 **수동으로 추가하고 순서를 바꾸거나 지울 수 있는** 방향을 유지한다.

---

## 4. 이 결정이 지키는 상위 원칙

Constitution 의 기존 원칙을 이 구조에 적용한 결과이며 새 원칙을 만들지 않는다.

1. **사용자가 먼저 장소를 고르고 시스템이 일정을 구성한다** — Constitution §11
2. **`Add to Itinerary` 가 일정 입력의 중심이다** — Constitution §11. Saved 는 입력이 아니라 관심 표시다
3. **Like · Helpful · 반응은 신호이지 강제 일정 입력이 아니다** — Constitution §11. Saved 도 같다
4. **사용자가 선택한 장소를 제휴상품이나 광고보다 우선한다** — Constitution §11
5. **사용자 자산은 보존한다** — 과거 Trip · Memory · My Places 는 재사용해도 원본이 남는다
6. **가짜 데이터를 만들지 않는다** — 빈 Saved · 빈 This Trip · 빈 Memory 는 빈 상태로 설계한다

---

## 5. 미확정 (구현 설계 단계에서 정한다)

| # | 항목 | 이미 확정된 부분 |
|---|---|---|
| 1 | This Trip 장소별 **날짜·시간 지정 UI 형태** | 지정할 수 있다는 것과, 미지정은 AI 가 배치한다는 것 |
| 2 | 충돌·과다를 **어떤 문구와 시점**으로 알릴지 | 조용히 지우지 않고 알린다는 것. 스케줄러는 이미 이연·경고를 하고 있다 |
| 3 | 과거 Trip 의 개별 장소를 **어디서** 다시 가져올지 | 가능해야 하고 원본이 훼손되지 않는다는 것 |
| 4 | 생성된 Trip 안에서의 **수동 추가·순서 변경·삭제** UI | 그 방향을 유지한다는 것 |
| 5 | Explore · Place Detail 의 **CTA 문구** | Picks 안의 표기는 `This Trip` 으로 확정. 다른 화면 문구는 CTA 명칭 결정에서 다룬다 |

**결정 전까지 어떤 것도 구현 전제로 삼지 않는다.**

### 5-1. 이번에 확정·구현된 것

- `Selected` 사용자 표기 → **`This Trip`** (4개 언어). **내부 함수·storage key 는 바꾸지 않았다** — `addToCart` · `koreamate_cart` 그대로다. 표기와 내부 이름을 같이 바꾸면 변경 범위가 불필요하게 커진다
- Saved ↔ This Trip 왕복이 membership 만 바꾸고 원본을 건드리지 않음 (390px 왕복 3회 검증)
- Clear All · Saved 다중 삭제 · My Places 삭제의 확인 1회

---

## 6. 참조

- `gokoreamate-product-constitution-v1.md` — **제품 최상위 SSOT (`ACTIVE`)**. 이 문서보다 우선한다
- `gokoreamate-product-status-v1.md` — 구현 상태 스냅샷 (`authority: NONE`)
- `home-experience-decision-v1.md` — Picks 3영역 구성 결정
- `../architecture/gokoreamate-data-contract-v1.md` — 데이터·DB SSOT

---

**이 문서는 생애주기 개념의 확정 결정 기록이다.** 구현이 아니며, 기록 시점에 위 개념 중 일부는 미구현이다.
