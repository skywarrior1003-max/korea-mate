# GoKoreaMate — Final Mobile Implementation Contract

| 항목 | 값 |
|---|---|
| `document_title` | GoKoreaMate Final Mobile Implementation Contract |
| `document_version` | **1.0** |
| `status` | **ACTIVE** — 2026-08-02 최종 모바일 디자인의 구현 계약 |
| `scope` | 디자인 기준 우선순위 · 내비 구조 · 보존해야 할 기능 계약 · 목업 요소 취급 |
| `authority` | **`SUBORDINATE`** — 제품 원칙은 `../../product/gokoreamate-product-constitution-v1.md` 가 우선한다 |
| `verified_commit` | `b3b3202` |

**이 문서는 "디자인을 코드로 옮길 때 무엇을 지켜야 하는가"만 규정한다.** 화면별 세부는 `screen-index.md` 를 본다.

---

## 1. 디자인 기준 우선순위

충돌 시 **위쪽이 이긴다.**

| 순위 | 기준 | 관할 |
|---|---|---|
| **1** | **최종 21개 `screen.png`** | 시각 — 레이아웃 · 위계 · 컴포넌트 형태 · 여백 |
| **2** | **제품·Home 결정 문서** | 기능 · 정보구조 · 화면의 자리 |
| **3** | **실제 API · DB · 보안 · 기능 계약** | 동작 · 데이터 · 권한 |
| **4** | `gokoreamate/DESIGN.md` · `luminous_voyage/DESIGN.md` | 토큰 · 타이포 **보조 참고** |
| **5** | `code.html` | 목업 레이아웃 **참고만** |

**두 `DESIGN.md` 중 어느 것도 단독 SSOT 가 아니다.** 두 문서가 서로 다르면(서체·primary·FAB 유무) 이 계약과 결정 문서를 기준으로 판단한다.

### 1-1. PNG 와 기능 계약이 충돌할 때

**기능 계약을 보존하면서 시각 구조를 이식한다.**

PNG 가 존재하지 않는 데이터(평점·가격·좋아요·방문 적기 차트)나 없는 기능(계정·통화·음성 녹음)을 그리고 있으면, **그 요소를 빼고 레이아웃을 재구성**한다. 화면을 채우기 위해 **가짜 데이터를 만들지 않는다.**

---

## 2. 운영 브랜드

- 운영 브랜드는 **`GoKoreaMate` / `gokoreamate`** 다
- **`Luminous Voyage` 는 디자인 콘셉트 이름이며 운영 UI 에 노출하지 않는다**
- 목업 헤더·본문에 등장하는 `Luminous Voyage`, `GOKOREA INTELLIGENCE`, `Crafting your Luminous voyage` 는 전부 교체 대상
- 워드마크 표기는 **소문자 `gokoreamate`** 규칙을 따른다 (목업의 `GOKOREAMATE` 대문자는 잔재)

---

## 3. BottomNav 최종 구조

```
Home  ·  Explore  ·  Picks  ·  Trips  ·  More
```

- **일반 화면은 이 5개 메뉴로 구현한다**
- **풀스크린 작성 화면·모달은 BottomNav 를 생략할 수 있다** (예: 장소 등록, Memory 작성, 생성 대기)
- 목업에 남은 **`My Picks` · `My Trips` · `Profile` · 한글 임시 라벨(`홈`·`탐색`·`찜`·`여행`·`프로필`)은 전부 잔재**이며 최종 5개로 통일한다
- **`Profile` 탭을 만들지 않는다** — 로그인·회원가입·프로필 기능이 존재하지 않는다
- 활성 탭은 화면의 실제 자리와 일치시킨다 (목업 `memory_create_new_entry` 는 `Picks` 활성으로 잘못 표시되어 있다)
- 활성 상태를 **색상만으로 구분하지 않는다** — 아이콘 채움·굵기·인디케이터를 병행한다

### 3-1. Picks 내부 구조

```
Picks
 ├─ Selected     — 이번 여행에 담은 장소
 ├─ Saved        — 날짜 없는 관심 목록
 └─ My Places    — 사용자가 등록한 개인 장소
```

세 영역은 **서로 다른 저장소를 쓰는 별개 자산**이며 합치지 않는다.

---

## 4. FAB — 금지와 허용

**금지**

- BottomNav **중앙 Build My Trip FAB**
- Home 의 **전역 Build FAB**

**허용 — 문맥형 추가 버튼**

- `My Places` 화면의 **새 장소 추가 `+`**
- `Memory Timeline` 의 **새 Memory 추가 `+`**

즉 **"중앙 전역 FAB 금지"와 "화면별 문맥형 추가 버튼"은 다른 것**이다. 문맥형 `+` 는 해당 화면이 소유한 단일 생성 동작에만 쓴다.

Build 진입은 **Picks 화면의 Primary CTA 한 곳**으로 단일화한다.

---

## 5. 화면의 샘플 요소는 계약이 아니다

다음은 **디자인 결함이 아니며, 동시에 구현 계약도 아니다.** 실제 데이터와 i18n 으로 교체한다.

- 장소명 · 도시 · 주소 · 사진
- 날짜 · 시각 · 소요시간 · 거리
- 별점 · 좋아요 · 사진 수 · 조회수 · 절약률
- 버튼 문구 · 헤드라인 · 설명문
- 사용자 핸들 · 프로필 이미지

**단, 존재하지 않는 기능을 암시하는 요소는 제거 대상이다** — 평점 시스템 · 가격/통화 · 좋아요 · 계정·동행자 · 예약 · 음성 녹음 · 방문 적기 분석. 넣으려면 별도 제품 결정을 거친다.

---

## 6. `code.html` 취급

**운영 코드에 직접 복사하지 않는다.** 시각 참고 자료이며 제품 기능 계약이 아니다.

전 21개 파일 공통으로 다음을 포함한다.

| 요소 | 실측 | 처리 |
|---|---|---|
| `cdn.tailwindcss.com` | 21/21 | **금지** — 프로젝트의 Tailwind v4 빌드 사용 |
| Google Fonts (`fonts.googleapis.com`·`gstatic`) | 21/21 | **금지** — 셀프호스팅 |
| `lh3.googleusercontent.com` 이미지 | 64회 | **금지** — §8 참조 |
| `transparenttextures.com` | 2회 | **금지** |
| 인라인 `<script>` (`tailwind.config`, IntersectionObserver) | 화면당 1~2 | 참고만 |
| `on*` 인라인 핸들러 | 13개 | **금지** — React 이벤트로 |
| `href="#"` 빈 링크 | 약 90개 | 실제 route 로 |
| handler 없는 `<button>` | 약 180개 | 실제 동작 연결 |
| 깨진 상대경로 `src="placeholder"` | 3건 (`memory_share_social_postcard`) | 실제 자산으로 |

---

## 7. 보존해야 할 기존 계약

디자인 변경이 아래를 바꾸지 않는다. 바꿔야 한다고 판단되면 **중단하고 보고한다.**

- **API · DB 스키마** — 임의 추가·변경 금지
- **`device_id`** 기반 소유권 — 비소유자 응답은 **404**(존재 여부 은닉)
- **`sourceKey`** 장소 identity — `city_spot:` · `local_info:` · `event:` · `user_spot:` 구분 유지. 서로 다른 소스의 동일 숫자 ID 를 합치지 않는다
- **Planner 계약** — `/#planner` 진입 · `cart_hints` · `POST /api/trip/plan` 요청 형식
- **공개 범위** — 공개/비공개 토글 · 공유 일정의 비소유자 제한 · 개인 사진·위치 자동 공개 금지
- **상업 표면 3범위** — Trip-Flow(Explore·장소상세·공유) 제휴 **0**, Post-Plan 비활성, Editorial 은 도시 랜딩·블로그만
- **보안** — `events`·`restaurants`·`spots` 익명 쓰기 차단 상태 유지

---

## 8. 자산·네트워크

- **외부 CDN 사용 금지** — 정적 배포 + CSP 환경
- **`lh3.googleusercontent.com` 등 외부 호스트 이미지 운영 사용 금지** — Canvas 오염으로 공유 이미지 생성이 실패한다. 같은 출처 프록시 또는 자체 호스팅만
- **지도는 네이버 지도** — 목업의 Google 계열 타일·"Auto-synced from Google Maps" 표기는 교체
- 아이콘 폰트 미로딩 시 **리거처 원문이 노출된다**(`auto_awesome`·`smart_toy` 등 실제 발생). 아이콘 컴포넌트 또는 셀프호스팅 폰트로 해결한다

---

## 9. 다국어

- **EN · JA · ZH · KO 4개 언어** 대응
- 사용자에게 보이는 문구는 **전부 i18n 키**. 하드코딩 0
- **4개 언어 키 개수 동수** 유지
- JA·ZH 는 EN 보다 길어지는 경우가 많다 — 고정폭 버튼·한 줄 뱃지 금지
- **장소명은 영어 고정**이다. 로케일을 바꿔도 번역되지 않으며, "영어 장소명 + 번역된 UI" 혼합 화면이 정상이다

### 9-1. CJK 폰트 fallback 필요

패키지가 지정한 서체는 **Inter · Plus Jakarta Sans · JetBrains Mono · Material Symbols · Playfair Display · Caveat · Libre Baskerville · Cormorant Garamond** 로, **CJK 글리프를 포함한 서체가 없다.**

- JA · ZH · KO 용 **fallback 서체를 명시적으로 지정**한다
- 지정하지 않으면 기기 시스템 폰트로 떨어져 **기기마다 다르게 보인다**
- 브라우저 Canvas 로 만드는 공유 이미지에도 같은 문제가 적용된다

---

## 10. 접근성 최소선

- 인터랙티브 요소 **최소 44×44px**
- 모든 포커스에 **보이는 링**
- 모달은 `role="dialog"` + `aria-modal` + Escape + 배경 스크롤 잠금 + **닫은 뒤 원래 요소로 포커스 복원**
- 하단 고정 요소는 **BottomNav(3.5rem + `env(safe-area-inset-bottom)`) 위**에 둔다
- 본문 대비 **WCAG AA**

---

## 11. 참조

- `screen-index.md` — 21개 화면별 역할·교체 요소·구현 차수
- `../../product/home-experience-decision-v1.md` — Home 2면 구조·BottomNav 결정
- `../../product/gokoreamate-product-constitution-v1.md` — 제품 최상위 SSOT
- `../../architecture/gokoreamate-data-contract-v1.md` — 데이터·DB SSOT

---

**이 문서는 구현 계약이다.** 디자인이 이 계약과 충돌하면 **계약을 보존하면서 시각 구조를 이식**하고, 계약 자체를 바꿔야 한다면 중단하고 보고한다.
