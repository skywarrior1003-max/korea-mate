# Home Storytelling 이미지 자산 권리 기록 v1

TASK-GOKOREAMATE-HOME-VISUAL-REALIGN-V1 에서 로컬 편입한 Home 에디토리얼
이미지의 출처·권리 근거를 남긴다. 이 파일이 없으면 나중에 이 사진들이 어디서
왔고 왜 써도 되는지 아무도 모른다.

## 자산 성격

Google Stitch 로 생성한 **GoKoreaMate 디자인 산출물**이다. 시안을 사용자가
직접 선택·수정·승인했고, GoKoreaMate 브랜드·광고 화면에서의 상업적 사용을
승인했다. 원본 시안은
`docs/design/final-mobile-2026-08-02/` 의 `home_ai_inspired_storytelling` ·
`home_screen_premium_discovery` 폴더이며, 이미지는 그 `code.html` 이 참조하던
`lh3.googleusercontent.com/aida-public/…` URL 에서 내려받았다.

## 편입 목록

취득일: 2026-08-04 · 취득 방법: 각 `code.html` 의 원본 URL + `=s2048` 크기 파라미터
(Storytelling 은 `<img src>`, Discovery 도시 카드는 `background-image: url(...)`)

| 로컬 경로 | 원본 역할 | 해상도 | SHA-256 |
|---|---|---|---|
| `public/images/home/story-hero.jpg` | Hero (매거진 표지 합성본) | 768×1376 | `09c31292b10032a40a2dfc7205672325112ca0d97c74fa99391bbf857fa0e824` |
| `public/images/home/story-hero-photo.jpg` | Hero 사진만 (y≥560 크롭) | 768×816 | `145e1471295f0c4391554a22ddad1d33a5fa635d758d03f7a71f9383d00f09f5` |
| `public/images/home/story-card-market.jpg` | 카드 1 (시장 음식) | 1408×768 | `20a6600c6f81ba291b3ff4911d683a356694d1e84f692ea5ee517ecf6cc02dfb` |
| `public/images/home/story-card-village.jpg` | 카드 2 (마을 골목) | 768×1376 | `d37fcd43ce12b75301fe62ef1c622486693b4ba0e91fd497d26edf3f123a3069` |
| `public/images/home/city-seoul.jpg` | Discovery 서울 카드 | 1408×768 | `870b6eff8c74bd442c0cb76bd408883c859f695bd3ad4f5f16f3435a97ded177` |
| `public/images/home/city-busan.jpg` | Discovery 부산 카드 | 1408×768 | `213f6a3f466578c368d5bd98b54a31f0a8c6fafaca762081890d162970a3a2aa` |
| `public/images/home/city-jeju.jpg` | Discovery 제주 카드 | 704×1520 | `c5ea9867fb1103d3b7864efb4b4eb7cb8ccda5156a0300862f2d43a9e8b21d61` |
| `public/images/home/city-busan-hero.jpg` | City Entry 부산 Hero (해안 골든아워) | 1408×768 | `e68c74a7fd3da607d126de5ad22ccd720f03af321eca3c3a7e5adf5fa1cfef27` |

`city-busan-hero.jpg` 는 2026-08-04 City Entry 시안(`code.html`)의 Hero
`background-image` 원본을 같은 `=s2048` 방식으로 받은 것이며, 위 자산들과 동일한
약관·사용 규칙을 그대로 따른다. 시안 Hero 에는 문구가 구워져 있지 않아 제목·칩은
전부 HTML 로 렌더한다(EN/KO/JA/ZH).

원본 URL 은 각 297자의 `https://lh3.googleusercontent.com/aida-public/AB6AXu…`
형태이며 `code.html` 에 그대로 남아 있어 대조 가능하다.

**편입하지 않은 것**
- 헤더 아바타 이미지 — 디자인 도구가 넣은 무관한 SaaS 대시보드 목업(가공 인물)
- BottomNav 아이콘 스프라이트 — 투명 배경이 체커보드로 구워진 JPEG 라 사용 불가

## 적용 약관

- Google Terms of Service
- Google Generative AI Prohibited Use Policy

Google 약관은 생성 콘텐츠에 대해 Google 이 소유권을 주장하지 않는다고 명시한다.
사용자가 그 산출물을 자신의 목적으로 쓸 수 있다는 근거는 여기에 있다.

다만 **AI 산출물 자체에 독점적 저작권이 성립한다고 주장하지 않는다.** 여러
나라에서 사람의 창작적 기여가 없는 생성물은 저작권 보호 대상이 아니거나 범위가
불명확하다. 즉 "우리가 쓸 수 있다" 와 "남이 못 쓴다" 는 다른 문제이고, 여기서
확인한 것은 앞쪽뿐이다.

## 사용 규칙

- **핫링크 금지.** `googleusercontent.com` 을 런타임에 부르지 않는다. 로컬 자산만 서비스한다
- **실제 인물·실제 후기처럼 표현 금지.** 생성 이미지 속 인물은 실존 인물이 아니다.
  이름·후기·여행 기록을 붙이지 않는다
- **표지 문구를 사용자 데이터처럼 다루지 않는다.** `story-hero.jpg` 에 구워진
  `BUSAN: GOLDEN HOUR` · `DAY 3 IN BUSAN` · `ISSUE 04: THE COASTAL ROUTE` 는
  에디토리얼 표지 아트다. 사용자의 일정·Day 수가 아니며 그렇게 읽히게 두지 않는다
- **중복 렌더 금지.** 위 영문은 HTML 로 다시 쓰지 않는다. 화면의 본문·설명·CTA·
  접근성 문구만 EN/KO/JA/ZH 로 구현한다
- **최대 렌더 폭 제한.** Hero 원본이 768px 폭이라 그 이상으로 확대하면 흐려진다.
  Hero 컨테이너 폭을 768px 로 묶는다. 도시 카드(1408×768)는 시안과 같이
  3:4 로 crop 해 쓰므로 280px 카드에서 확대가 일어나지 않는다
- **도시 사진은 그 도시에만.** 서울 사진을 부산 카드에 돌려쓰지 않는다.
  원본이 없는 경주·전주는 토큰 아트로 둔다
