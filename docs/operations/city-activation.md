# 도시 추가와 활성화

`planningReady: true` 는 **데이터 수집을 시작하는 버튼이 아니다.**
사용자가 그 도시로 실제 일정을 만들어도 된다고 선언하는 **마지막 스위치**다.

한 줄이라 나머지가 비어 있어도 바뀐다. 그래서 순서가 있고, 마지막 직전에
자동 검사가 한 번 있다.

---

## 순서

1. **CityConfig 등록** — `src/data/cities/{slug}.ts` 에 `slug` · `name` · `nameKo` ·
   `defaultCenter` · `emoji` · `seoDescription` · `planningReady: false` · `staticSpots`.
   `src/data/cities/index.ts` 의 `CITY_CONFIGS` · `CITY_SLUGS` 에 추가한다.
   이것만 하면 플래너 목록 · 홈 카드 · City Entry 에 자동으로 나온다(준비 중 표시).

2. **로케일 문구** — `en · ko · ja · zh` 네 파일에 두 키.
   - `tripForm.city_{Name}` — 도시 이름
   - `cityLinks.desc{Name}` — 홈 카드 한 줄 소개

   빠지면 화면에 키 문자열(`city_Jeonju`)이 그대로 나온다.

3. **도시 페이지 / 라우트** — `src/app/{slug}/page.tsx` (SEO 랜딩).
   City Entry 의 "다른 도시" 가 `/{slug}/` 로 링크하므로 없으면 404 로 간다.
   `/explore/{slug}` 는 `CITY_SLUGS` 기반이라 자동이다.

4. **데이터 연결** — `city_spots` 등 실제 장소 데이터.
   여기까지는 `planningReady: false` 인 채로 진행한다. 도시 페이지와 Explore 는
   열려 있고 일정 생성만 막혀 있다.

5. **필수 프리셋 입력** — 사람이 실제 값을 넣는다. 추측하거나 다른 도시에서
   복사하지 않는다.
   - `CITY_ARRIVAL_OPTIONS[{Name}]` — 공항 · 역 · 터미널 · 도심 · 관광지.
     이 중 최소 하나는 `type: "downtown"` 또는 `"tourist_area"` 여야 한다
     (숙박 지역 선택과 지도 중심이 여기서 나온다).
   - `CITY_ARRIVAL_DEFAULTS[{Name}]` — 위 목록 **안에 있는 값** 하나.
   - `CITY_CENTER_COORDS[{slug}]` (`src/app/itinerary/page.tsx`) — 일정 생성이
     쓰는 도시 중심. 없으면 조용히 다른 도시 좌표로 떨어진다.

6. **자동 검사 통과** — `node --experimental-strip-types src/lib/city-switch/city-readiness-guard.test.ts`
   5번이 하나라도 빠지면 무엇이 없는지 이름으로 알려 준다.

7. **실제 UI · 데이터 QA** — 플래너에서 그 도시를 골라 일정을 만들어 본다.
   도착지 목록 · 숙박 지역 · 생성된 일정의 좌표가 그 도시인지 확인한다.

8. **마지막에 `planningReady: true`** — 여기서만 바꾼다.

---

## 사람이 반드시 넣어야 하는 것

자동화하지 않는다. 도시마다 실재하는 장소라 값이 다르고, 틀리면 사용자가
엉뚱한 곳에서 여행을 시작한다.

| 항목 | 왜 사람이 넣나 |
|---|---|
| 도착지 프리셋(`CITY_ARRIVAL_OPTIONS`) | 그 도시의 공항 · 역 · 터미널 이름과 좌표 |
| 숙박 지역 | 실제로 사람이 자는 구역 |
| 기본 도착지 | 그 도시에서 가장 흔한 진입점 |
| 도시 중심 좌표 | 후보 검색의 기준점 |
| 도시 이름 · 소개 문구 4개 언어 | 각 언어에서 실제로 쓰는 표기 |

---

## 하지 않는 것

- 장소 개수로 준비 여부를 판단하지 않는다. 수집이 잠깐 비었다고 도시가 닫히면 안 된다.
- 프리셋이 없다고 다른 도시 값을 복사하지 않는다. 화면에는 부산 프리셋으로
  떨어지는 폴백이 있는데, 그건 안전장치이지 정답이 아니다.
- `planningReady` 를 도시 페이지 존재 여부로 쓰지 않는다. 준비 중인 도시도
  Explore 와 City Entry 는 열려 있다.
