# GoKoreaMate Home Experience Decision v1 — 모바일 Home 구조 결정 기록

| 항목 | 값 |
|---|---|
| `document_title` | GoKoreaMate Home Experience Decision |
| `document_version` | **1.0** |
| `status` | **ACTIVE** — 모바일 Home 화면 구조의 확정 결정 기록 |
| `document_type` | `DECISION_RECORD` — 확정된 제품 결정과 그 근거만 보유한다 |
| `authority` | **`SUBORDINATE`** — 상위 원칙은 `gokoreamate-product-constitution-v1.md`가 갖는다. 이 문서는 그 원칙 아래에서 내린 화면 구조 결정을 기록할 뿐, 새 원칙을 만들지 않는다 |
| `scope` | 모바일 Home 의 route · 패널 구성 · 상태 전환 · 하단 내비 구성 |
| `conflict_rule` | 이 문서가 Constitution 과 충돌하면 **Constitution 이 우선**한다. 코드·DB 와 충돌하면 임의 진행하지 않고 중단·보고한다 |
| `implementation_status` | **미구현.** 이 문서는 결정만 기록한다. 현재 구현 사실은 `gokoreamate-product-status-v1.md`가 기록한다 |
| `decided_on` | 2026-08-01 |
| `verified_commit` | `b3b3202` (충돌 대조 기준 코드) |

**이 문서에 쓰지 않는 것** 애니메이션 커브 · 픽셀값 · 컴포넌트 파일 경로 · 전환 임계 일수 같은 구현 파라미터. 구현 설계 단계에서 정하고 그 결과는 Status 문서가 기록한다.

---

## 0. 결정 요약

모바일 Home 은 **하나의 `/` route 안에서 좌우로 이동하는 2면 구조**다.

```
Panel 1 — My Journey        ←  가로 스와이프  →        Panel 2 — Discover
(사용자의 여행 상태)                                    (도시·장소 발견)
```

기존에 각각 완성된 세 개의 Home 디자인은 **버전 경쟁 관계가 아니라 서로 다른 자리**를 갖는다.

| 문서상 이름 | 디자인 파일명 | 자리 |
|---|---|---|
| **Home — My Journey / Default** | `home_ai_inspired_storytelling` | Panel 1 기본 상태 |
| **Home — My Journey / Recent Post-trip** | `home_ai_memory_synergy` | Panel 1 최근 여행 완료 상태 |
| **Home — Discover** | `home_screen_premium_discovery` | Panel 2 |

세 디자인 모두 **Final 로 보존한다.** 어느 것도 구버전이 아니다.

---

## 1. Home route

**Home 은 기존 `/` route 하나를 유지한다.**

- 세 디자인을 서로 다른 route 나 별도 페이지로 만들지 않는다
- 패널 이동은 같은 `/` 안에서 일어난다
- 패널 이동을 브라우저 history 에 별도 페이지처럼 쌓지 않는다

**근거** route 를 나누면 공유된 Home 링크가 사용자마다 다른 화면을 가리키게 되고, 뒤로가기가 "이전 패널"과 "이전 페이지" 사이에서 의미를 잃는다.

---

## 2. Panel 1 — My Journey

Panel 1 은 **사용자의 현재 여행 상태에 따라 두 디자인 중 하나**를 쓴다.

### 2-1. 기본 상태 — `Home — My Journey / Default`

**사용 상황**

- 신규 사용자
- 다음 여행을 시작하려는 사용자
- 최근 여행 완료 상태가 아닌 일반 사용자
- 여행 계획·현재 Trip 관련 콘텐츠를 보여줄 사용자

**역할** GoKoreaMate 의 감성적 첫인상과 AI 여행 설계 가치를 전달하는 **기본 Home** 이다.

### 2-2. 최근 여행 완료 상태 — `Home — My Journey / Recent Post-trip`

**진입 조건 (전부 충족)**

- 최근 완료된 Trip 이 있다
- 그 Trip 에 Memory 또는 개인 사진이 있다

**역할** 여행을 막 마친 사용자에게 최근 여행과 Memory 를 강조한다.

**이 상태는 영구 Home 이 아니다.** Story 확인 또는 일정 기간 경과 후 Panel 1 은 다시 기본 상태로 돌아간다.

지난 여행의 전체 Story 와 Memory Timeline 은 계속 다음 경로로 접근한다.

```
Trips → 해당 Trip → Memory Timeline / Story
```

> **정확한 "최근" 기간과 전환 조건은 구현 설계 단계에서 확정한다.** 이 문서는 제품 원칙만 기록한다. §6 참조.

---

## 3. Panel 2 — Discover

디자인: `Home — Discover`

**핵심 메시지**

```
안녕!
어디로 떠나볼까요?
```

**역할** 도시 검색 · 도시 탐색 · 장소 발견 · 첫 여행 시작 · Explore 진입.

**Panel 2 는 사용자의 Trip · Memory 상태와 관계없이 항상 접근 가능하다.** Panel 1 이 어떤 상태든 Discover 는 한 번의 스와이프 거리에 있다.

---

## 4. 전환 원칙

**모바일**

- 손가락 좌우 스와이프
- 작은 페이지 인디케이터
- 탭 가능한 이동 힌트
- **자동 슬라이드 금지**
- 동일 `/` route 유지
- 브라우저 history 에 패널 이동을 별도 페이지처럼 쌓지 않음

좌우 전환의 정확한 애니메이션과 구현 방식은 후속 구현 설계에서 결정한다.

---

## 5. 하단 내비게이션

두 Panel 은 **동일한 하단 내비게이션**을 공유한다.

```
Home  ·  Explore  ·  Picks  ·  Trips  ·  More
```

**중앙 FAB 는 사용하지 않는다.**

### 5-1. Picks 는 하단 핵심 화면이다

`Picks` 는 전역 드로어가 아니라 **하단 내비의 독립 목적지**다. 내부는 세 영역으로 구성된다.

```
Picks
 ├─ Selected     — 이번 여행에 담은 장소 (일정 생성 대상)
 ├─ Saved        — 날짜 없는 관심 목록
 └─ My Places    — 사용자가 직접 등록한 개인 장소
```

**확정된 것** Picks 화면의 존재 · 세 영역의 구성 · `Saved` 가 하단 독립 탭이 아니라 `Picks > Saved` 로 이동한다는 것.

**미확정인 것은 route 구현 방식뿐이다.** §8 참조.

---

## 6. 제품 원칙 (Constitution 종속)

아래는 새 원칙이 아니라, Constitution 의 기존 원칙을 이 화면 구조에 적용한 결과다.

1. **사용자가 한 번 여행했다고 과거 여행 Home 이 영구 노출되지 않는다.**
2. **최근 여행 완료 상태는 일시적으로만 강조한다.**
3. **이후 Home 의 중심은 자연스럽게 다음 여행으로 돌아간다.** — Constitution §3 핵심 순환 구조(`Return and Contribute ↺`)의 화면 표현이다. Home 이 과거에 고정되면 루프가 끊긴다.
4. **과거 Trip 과 Memory 는 Trips 에서 계속 접근 가능하다.** — Constitution §4·§5 사용자 자산 보존.
5. **실제 사용자 데이터가 없으면 가짜 개인 Trip · Memory 를 만들지 않는다.** — 빈 상태는 빈 상태로 설계한다.
6. **Busan 에 하드코딩하지 않고 멀티시티 구조로 기록한다.**
7. **EN · JA · ZH · KO 대응을 전제로 한다.** 패널 제목·인디케이터·이동 힌트 모두 4개 언어 키를 갖는다.
8. **신규 API · DB · route 를 이 결정의 전제조건으로 만들지 않는다.** 전제조건이 필요하다고 판단되면 그 시점에 중단하고 보고한다.

---

## 7. 확정 시점의 기존 자산과의 차이

이 절은 **결정을 바꾸지 않는다.** 구현 착수 전에 무엇이 달라지는지를 사실로 남긴다.

### 7-1. 하단 내비 — 현재 구현에서 새 구조로의 대응

| 위치 | 현재 구현 (`b3b3202`) | 새 구조 | 관계 |
|---|---|---|---|
| 1 | Home | **Home** | 유지 (내부는 2면 패널로 변경) |
| 2 | Explore | **Explore** | 유지 |
| 3 | My Trip | **Picks** | 자리 교체 — 아래 대응표 참조 |
| 4 | Saved (카운트 배지) | **Trips** | 자리 교체 — 아래 대응표 참조 |
| 5 | More | **More** | 유지 |

**기능 대응 — 사라지는 기능은 없다**

| 현재 | 새 구조에서의 위치 |
|---|---|
| `My Trip` (`/my-trips`) | **`Trips`** — 기존 `/my-trips` 기능을 그대로 재사용 |
| `Saved` (Favorites) | **`Picks > Saved`** |
| CartDrawer `My Picks` (Cart) | **`Picks > Selected`** |
| `My Places` (user_spots) | **`Picks > My Places`** |
| `More` | **`More`** 유지 |

`Selected` · `Saved` · `My Places` 는 현재도 **서로 다른 저장소를 쓰는 별개 자산**이며, 새 구조에서도 세 영역으로 분리해 유지한다. 하나로 합치지 않는다.

**구현상 참고 (사실)** 현재 `/saved` 는 이미 `Saved places` · `My Places` **2탭**으로 구현돼 있고, `Selected`(Cart)만 전역 CartDrawer 에 있다. 즉 새 `Picks` 화면은 **기존 2탭에 `Selected` 를 더하는 형태**로 성립한다. 어느 route 위에 놓을지는 §8 에서 정한다.

### 7-2. 이전 디자인 핸드오프와의 관계

`docs/design/gokoreamate-design-handoff.md` 는 하단 내비를 `Home · Explore · My Trip · Saved · More` 로 규정했고 현재 코드가 그것을 따른다. **이 문서의 §5 가 그 항목을 대체한다.** 해당 핸드오프 문서는 이전 디자인 의뢰 산출물이며 갱신 대상이 아니다 — 하단 내비 구성에 대해서는 **이 문서가 우선한다.**

`docs/design/gokoreamate-screen-index.md` 의 Home 항목(#1 · #2)은 6-섹션 단일 Home 을 전제한다. **2면 패널 구조는 그 전제를 대체한다.**

---

## 8. 미확정 구현 항목

아래 다섯 가지는 **구현 방식이 미확정**이다. 제품 결정은 이미 끝났고, 결정된 것을 어떻게 만들지가 남았다.

| # | 미확정 항목 | 이미 확정된 부분 |
|---|---|---|
| 1 | **최근 여행 완료 상태의 기간·종료 조건** | 상태의 존재와 일시성(§2-2) |
| 2 | **Panel 1 상태 판정 데이터 소스** — 서버 조회 · 로컬 캐시 · 혼합 | 판정 기준(완료 Trip + Memory 또는 사진) |
| 3 | **Picks 의 실제 route 구현 방식** — 신규 `/picks` 신설 vs 기존 `/saved` 재사용 | Picks 화면의 존재와 `Selected`·`Saved`·`My Places` 3영역 구성(§5-1) |
| 4 | **Home 패널 전환 애니메이션·제스처 세부** | 스와이프 방식·인디케이터·자동 슬라이드 금지·history 미적재(§4) |
| 5 | **EN · JA · ZH · KO 최종 라벨과 긴 문구 검증** | 4개 언어 대응 전제(§6-7)와 5탭 구성(§5) |

**이번 결정에 포함하지 않은 것** Home 구현 · 컴포넌트 수정 · route 변경 · 코드 작업 일체.

위 다섯 항목은 구현 설계 단계에서 각각 결정한다. **결정 전까지 어떤 것도 구현 전제로 삼지 않는다.**

---

## 9. 참조

- `gokoreamate-product-constitution-v1.md` — **제품 최상위 SSOT (`ACTIVE`)**. 이 문서보다 우선한다
- `gokoreamate-product-status-v1.md` — 구현 상태 스냅샷 (`authority: NONE`)
- `../architecture/gokoreamate-data-contract-v1.md` — 데이터·DB SSOT

---

**이 문서는 모바일 Home 구조의 확정 결정 기록이다.**

- 상위 원칙은 **Product Constitution** 이 갖는다
- 현재 구현 사실은 **Product Status** 가 기록한다
- **이 문서는 구현이 아니다.** 기록 시점에 Home 은 미구현이다
