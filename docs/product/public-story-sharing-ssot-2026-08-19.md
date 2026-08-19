# Public Story · Sharing SSOT (2026-08-19)

| 항목 | 값 |
|---|---|
| `document_title` | Public Story · Sharing SSOT |
| `document_type` | **`PRODUCT_SSOT`** — 이 영역의 용어와 구조를 정한다 |
| `scope` | My Trip · Memory · Public Story · SNS/메신저 공유 · Copy |
| `decided_on` | 2026-08-19 (Owner 확정) |
| `repo_commit_at_write` | `dd19f19` |
| `product_authority` | `gokoreamate-product-constitution-v1.md` — 상위 원칙은 그쪽이 정본 |
| `clarifies` | `picks-trip-memory-lifecycle-decision-v1.md` · `public-memory-story-launch-close-v1.md` |
| `supersedes` | `picks-trip-memory-lifecycle-decision-v1.md` §1 의 `Memory` 정의 (아래 §2-4) |

이 문서의 목적은 하나다 — **다음에 이 영역을 다루는 사람이 용어와 구조를 다시 헷갈리지 않게 하는 것.**
여기 적힌 것은 제품 결정이고, **구현 상태가 아니다.** 구현 여부는 §9 의 상태표를 따르고, 확인되지 않은 것은 `AUDIT_REQUIRED` 로 둔다.

---

## 1. 이 문서가 다루지 않는 것

이메일·계정 계열, 그리고 개인 기록의 Private Export/Import 계열.
현재 Sharing 결정과 무관하므로 **이 문서의 어떤 판단에도 근거로 쓰지 않는다.** 필요해지면 그때 별도 SSOT 로 다룬다.

---

## 2. 공식 용어 — 셋뿐이다

### 2-1. My Trip
사용자의 **여행 본체**. 일정과 여행기록의 canonical surface다.
Day · 장소 · 순서 · 시간 · 숙박 같은 여행 구조를 가진다.

### 2-2. Memory
My Trip 에 연결되는 **개인 여행추억의 표현 계층**이다 — 직접 찍은 사진, 개인 메모, 여행 중·후에 남긴 것.

**Memory 는 My Trip 과 경쟁하는 별도 여행 archive 가 아니다.** 여행 본체는 언제나 My Trip 하나다.

### 2-3. Public Story
사용자가 **공개하기로 고른** My Trip 정보와 **공개를 허용한** Memory 를 남에게 보여 주는 공개 버전(projection)이다.

Public Story 를 만든다고 Owner 의 My Trip·Memory 원본이 사라지거나 그것으로 대체되지 않는다.

### 2-4. 구조와 supersede 관계

```
My Trip  →  Memory  →  Public Story
```

**`Memorial` 같은 제4의 개념을 만들지 않는다.**

⚠ `picks-trip-memory-lifecycle-decision-v1.md` §1 은 Memory 를 *"장소 하나의 보관함이 아니라 그 Trip 전체의 여행 기록"* 이라고 적었다. 그 문장은 Memory 를 **여행 기록 전체(archive)** 로 읽게 한다.
**이 문서가 그 정의를 대체한다** — Memory 는 My Trip 위의 **표현 계층**이고, 여행 본체는 My Trip 이다.
그 문서의 나머지(장소를 복사·이동하지 않는다, 원래 여행 기록은 훼손되지 않는다, Saved/This Trip/My Places 의 의미)는 **그대로 유효하다.**

---

## 3. Owner 의 원본은 공유해도 그대로다

Owner 는 공유 전에도 후에도 자신의 My Trip 에서 일정·Memory·개인 사진·개인 메모를 계속 본다.

> **공개한다 ≠ Owner 의 private 원본을 없앤다.**

공유 전후로 Owner 의 private 구조를 바꾸지 않는다.

---

## 4. 다른 사용자의 Copy

다른 사용자는 SNS·메신저에서 Public Story 를 발견해 들어와 `Copy this trip` 으로 그 여행계획을 **자신의 새 My Trip** 으로 가져갈 수 있다.

**목적** — 남의 여행 일정과 장소 구성을 자기 여행계획의 **출발점**으로 쓰는 것.

**Copy 하지 않는 것** (기존 계약 그대로, 여기서 확장하지 않는다)

- 원 작성자의 private Memory
- private 사진
- 개인 메모
- private 위치정보
- ownership·device 정보

Public Story 에서 **공개 허용된 사진을 보는 것**과 그 사진을 **다른 사용자의 Memory 로 복제하는 것**은 별개다. 후자는 하지 않는다.

---

## 5. 공유의 원본은 Public Story 하나다

SNS 이미지도, 링크/OG 도 **별도의 Story 가 아니고 별도의 콘텐츠 관리 시스템도 아니다.**
같은 Public Story 를 바깥 환경에 맞게 그리는 **rendering** 일 뿐이다.

```
My Trip + 공개 허용 Memory
        ↓
   Public Story          ← 콘텐츠 원본은 여기 하나
        ↓
   외부 표현
   ├─ SNS visual rendering
   └─ Public Story URL / OG rendering
        ↓
   같은 Public Story 로 유입
        ↓
   Copy this trip
        ↓
   새 사용자의 My Trip
```

채널이 늘어도 **Story 데이터를 채널별로 나누지 않는다.**

---

## 6. SNS 공유의 목적

URL 한 줄이나 제목을 퍼뜨리는 것이 목적이 아니다.

> **사용자가 자기 실제 여행을 SNS 안에서 직접 자랑하고 보여줄 수 있게 하는 것.**

그래서 SNS visual rendering 은 **그것만 보아도 매력적인 여행 콘텐츠**여야 한다.

담을 것의 우선순위

1. 사용자가 직접 찍은 여행사진
2. 여행 도시 · 기간
3. Day 별 여행 흐름
4. 장소 · 일정
5. 지도 · 동선 같은 여행 맥락
6. 짧은 여행 요약

**관광지 홍보사진을 viral core 로 삼지 않는다.** 주인공은 사용자의 실제 사진과 그 여행의 맥락이다.

---

## 7. 9:16 Story 이미지 방향 · `OWNER_DECISION`

- 이미지 중심 SNS 를 위한 **9:16 Story 형 rendering 을 우선** 검토한다
- **자동 생성 template 하나**로 시작한다
- 사용자가 복잡한 디자인 편집을 하지 않는다 — 사진 배치·폰트·색·template 선택을 단계로 요구하지 않는다
- 공유 행동은 짧아야 한다

**9:16 이미지는 별도의 Public Story 가 아니다.** 같은 Public Story 데이터를 쓰는 외부 공유용 rendering 이다.

현재 구현 완료 여부는 **§9 감사 전까지 확정하지 않는다.**

---

## 8. URL / OG 의 역할

Public Story URL 은 **공유 콘텐츠의 본체가 아니다.**

> 역할은 하나 — SNS·메신저에서 관심을 가진 사람을 **GoKoreaMate Public Story 와 Copy 흐름으로 데려오는 통로.**

URL preview 를 지원하는 카카오톡·WhatsApp·DM·X 등에서는 **같은 Public Story URL 과 OG metadata** 를 쓴다. **메신저용 별도 Story 시스템을 만들지 않는다.**

최종 OG 표시는 플랫폼마다 다르다. **모든 메신저가 같게 렌더한다고 가정하지 않는다.**

---

## 9. 아직 확정하지 않은 것 — `AUDIT_REQUIRED`

기억이나 과거 보고서가 아니라 **현재 repo 코드가 정본이다.**

| 항목 | 상태 |
|---|---|
| `TripStoryExport` 의 Production readiness | **`AUDIT_REQUIRED`** — 완성돼 있다고 **확정 금지** |
| 9:16 Story share 배선 | **`AUDIT_REQUIRED`** |
| Public Story Share UI · `onShare` 연결 | **`AUDIT_REQUIRED`** |
| SNS 이미지 생성 코드 · OG/cover pipeline | **`AUDIT_REQUIRED`** |
| Web Share 기기 호환성 | **`AUDIT_REQUIRED`** — 실기기 QA 전 PASS 금지 |
| Instagram 공유 UX | **`AUDIT_REQUIRED`** |
| 5개 도시 앱 runtime readiness | **`AUDIT_REQUIRED`** |
| Public Story privacy/moderation 계약 | **`IMPLEMENTED`** — `public-memory-story-launch-close-v1.md` |
| Copy 의 private 미포함 계약 | **`IMPLEMENTED`** — 같은 문서 |
| device 기반 ownership | **`IMPLEMENTED`** (Constitution §5 기준 과도기 구현) |

### 채널 자동 분기 — 확정하지 않는다
Web Share 를 쓴다고 해서 *"Instagram 을 고르면 이미지, 카카오톡을 고르면 URL"* 처럼 **최종 공유 앱을 알고 payload 를 바꿀 수 있다고 전제하지 않는다.** 실제 공유 UX 는 §10 PHASE 1 감사와 실기기 QA 후에 정한다.

### Instagram
이미지 중심 SNS 에서는 **URL 이 공유의 중심이 되면 안 된다.** 이미지 자체가 자랑거리로 충분해야 하고 링크는 유입 통로다.
**웹앱에서 Link Sticker 자동 부착 같은 것을 전제로 설계하지 않는다.** 정확한 UX 는 실기기 검증 전까지 확정하지 않는다.

### 영상 플랫폼 — `NOT_IN_SCOPE`
**TikTok 및 영상 중심 플랫폼은 현재 범위에서 제외한다.** V2·V3 roadmap 어느 쪽에도 넣지 않는다. 영상 생성·motion graphic·video template·video-first API 없음.
Owner 가 명시적으로 다시 검토하라고 하기 전에는 자동으로 roadmap 에 올리지 않는다.

---

## 10. 지켜야 할 privacy / moderation 불변조건

SNS visual rendering 도 **기존 Public Story 계약을 그대로 따른다.**

금지

- 공개 동의되지 않은 Memory 사진 사용
- private memo 노출
- private·exact 개인 위치 자동 노출
- hidden/unpublished Story 를 공유 이미지 경로로 우회 노출
- moderation 차단을 우회하는 새 image endpoint
- Copy 를 통한 private Memory 전달

새 Share 경로를 만들더라도 **기존 moderation egress 계약을 재사용해야 한다.** 새로 만들지 않는다.

---

## 11. 브랜드 표현

공유 이미지에 `gokoreamate` 출처·브랜드를 쓸 수 있다는 방향은 유지한다.
다만 크기·위치·워터마크 강제 여부·채널 공통 규칙까지 여기서 고정하지 않는다.

핵심은 하나 — **사용자의 여행 콘텐츠가 주인공이어야 한다.**

---

## 12. 초기 서비스 도시 — 5개

- Busan
- Gyeongju
- Seoul
- Jeju
- Jeonju

데이터 준비는 전주까지 진행돼 있다.

⚠ **지금의 핵심 위험은 도시 데이터 준비가 아니라, 앱 기능·버그·도시 연결이 준비된 데이터를 따라가지 못할 가능성이다.**
**데이터가 준비됐다는 사실과 앱이 그 데이터를 실제로 정상 제공한다는 사실은 다르다.** 도시별 runtime readiness 는 이 문서에서 추측으로 PASS 처리하지 않고 §13 PHASE 4 에서 확인한다.

---

## 13. 제품 바이럴 루프

```
Discover / Saved / This Trip → My Trip → 실제 여행 → Memory
        → Public Story → SNS / Messenger 공유
        → 새 사용자 발견 → Public Story 방문 → Copy this trip
        → 새 사용자의 My Trip → 새 여행
```

**여행 계획 → 실제 여행 → 추억 → 자랑·공유 → 발견 → Copy → 새로운 여행.**

바이럴의 주인공은 관광지 홍보 이미지가 아니라 **사용자의 실제 여행과 여행사진**이다.

---

## 14. 개발 순서

| PHASE | 내용 | 상태 |
|---|---|---|
| **0** | **SSOT LOCK** — 용어와 구조 고정 | 이 문서 |
| **1** | **현재 Share 구현 READ-ONLY 감사** | 다음 작업 |
| **2** | **최소 Share 구현** | PHASE 1 을 Owner 가 확인·승인한 뒤에만 |
| **3** | **실기기 QA** | iPhone Safari · Android Chrome |
| **4** | **5개 도시 앱 readiness / 버그 정리** | |
| **5** | **최종 launch readiness 판단** | |

### PHASE 1 에서 확인할 것
`TripStoryExport` 존재·역할·완성도 · Public Story Share UI · `onShare` 현재 연결 · SNS 이미지 생성 코드 · 9:16 rendering · Public Story 디자인 · OG pipeline · cover pipeline · 공개 동의 사진 사용 규칙 · privacy/moderation 연결 · Public Story → Copy 흐름 · Web Share/file share · URL copy/share · 모바일 공유 UX · dead/unwired asset · 재사용 가능한 부분 · 실기기 QA 필요 지점.

판정: `REUSE_EXISTING_SHARE_FOUND` / `PARTIAL_SHARE_WIRING_FOUND` / `NEW_MINIMAL_SHARE_NEEDED` / `AUDIT_INCOMPLETE`.

### PHASE 2 우선순위
① 기존 코드 재사용 → ② 끊긴 배선 연결 → ③ 최소 수정 → ④ **마지막에만** 신규 구현.
**금지**: 여러 template 선택 · 대형 디자인 editor · 채널별 backend · 채널별 Story 데이터 · 영상 공유 · 불필요한 social SDK · unrelated redesign.

### PHASE 3 검증
Story rendering · 이미지 품질 · 공유시트 · file sharing · 다운로드/fallback · Instagram 실제 UX · link copy/share · 카카오톡·WhatsApp URL preview · OG 표시 · 모바일 Public Story · Public Story 진입 · `Copy this trip` · **private Memory 미복사** · privacy/moderation 회귀 없음.
**Web Share 와 외부 앱 동작은 코드 추측만으로 PASS 처리하지 않는다.**

### PHASE 4 검증
5개 도시 각각에서 도시 진입 · Explore · place detail · Saved · This Trip · itinerary generation · My Trip · Memory · Public Story · Copy · 주요 navigation 이 실제로 작동하는지.
버그·연결 누락이 있으면 **launch 전에 필요한 최소 수정만** 한다.

### PHASE 5
남은 launch blocker 와 5-city runtime readiness 로 최종 판단한다.
**Sharing 개선이 커진다고 launch 를 오래 미루지 않는다.**

---

## 15. 참조

- `gokoreamate-product-constitution-v1.md` — 제품 최상위 SSOT
- `public-memory-story-launch-close-v1.md` — Public Story privacy/moderation 계약 (CLOSED)
- `picks-trip-memory-lifecycle-decision-v1.md` — Saved·This Trip·My Places 의미 (Memory 정의는 이 문서가 대체)
- `../architecture/gokoreamate-data-contract-v1.md` — 데이터·DB SSOT
