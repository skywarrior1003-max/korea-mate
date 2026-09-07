# Blog 공식 원천 공급 구조 v1

TASK-GOKOREAMATE-BLOG-OFFICIAL-SOURCE-SUPPLY-V1 · 2026-09-07 · Production write 0

## 무엇인가

LIVE Blog(공식 기반 여행 이해 콘텐츠)의 **후보 공급층**이다. 수집 ≠ 게시 —
후보는 사람이 Blog 계약 적합성을 판정하고 4-locale 로 집필해야만 게시된다
(`src/data/blog/blog-posts-v1.ts` + `blog-content-guard.test.ts` 가 게시 계약을 강제).

```
공식 source → candidate(JSONL) → blog_fit 분류 → (사람) 4-locale 집필 → publish
```

## 원천 (Owner 확정)

| 원천 | 서비스 | 내용 | locale |
|---|---|---|---|
| 본체: KTO TourAPI | `KorService2/areaBasedList2` contentTypeId=25 | **전국 여행코스**(실측 1,069건) — Blog 여행 아이디어 주 공급원 | ko |
| 본체: KTO TourAPI | `KorService2·EngService2/searchFestival2` | 다가오는 전국 행사 — REVIEW 전용(단순 복사 금지) | ko·en |
| 보조: VisitKorea(영문) | Travel News 공식 목록 1페이지 | 외국인 대상 프로그램·전국/교차지역 캠페인 | en |
| 보조: KTO 보도자료 | `knto.or.kr/pressRelease` 목록 2페이지 | **여행자 가치 사실 탐지 레이더** — 외국인 방한 프로그램·국가/언어권 캠페인·지방공항 연계·교차지역·바우처 | ko |

### 원천별 역할 (Blog 공식원천 계약)

- **KTO TourAPI** = 구조화 관광정보(코스·행사·장소)
- **VISITKOREA Travel News** = 여행자 대상 공식 콘텐츠
- **KTO Press Release** = 외국인/전국/교차지역 프로그램 **탐지 레이더**
- **지역 Visit/지자체** = 실제 지역 시행 세부 확인(기존 Events/Essentials 7일 운영과 별개)

> **작성 원칙**: 공식 자료의 **사실**을 사용하되 원문 표현을 복제하지 않고,
> GoKoreaMate 가 외국인 여행자 관점에서 **독립적으로 새 콘텐츠를 작성**한다.
> 보도자료 전문 재게시·번역 게시·문장 치환·제목/문단 구조 모방 금지.
> 수집기는 보도자료의 **제목과 구조화 메타만** 저장한다(본문 미수집) —
> 복제가 구조적으로 불가능하다. 사진은 글과 별개 권리로 판단하며
> `image_rights_status: NOT_VERIFIED_DO_NOT_AUTOUSE` 로 자동 사용을 차단한다.
> 공공누리 유형은 상세 페이지 마커가 확인될 때만 `kogl_type` 으로 기록한다
> (실측: KOGL_TYPE1 출처표시 — 확인 불가 시 null, 추측하지 않는다).

- KTO **Jpn/Chs 서비스는 403** — data.go.kr 별도 활용신청 필요(OWNER 결정 대기).
- VisitKorea 는 RSS/공개 API 부재 실측(404/302) → 공식 목록 페이지 1곳 브라우저
  수집이 최소·유지보수 가능안. 목록 메타(제목/날짜/공식 상세 URL)만 저장하고
  **본문 장문 복제를 하지 않는다.**
- 새 비공식 뉴스 원천 추가 금지 · 대량 크롤링 금지.

## 파일

| 경로 | 의미 |
|---|---|
| `scripts/blog-supply-collect-v1.mjs` | 수집기(`--source kto\|news\|all`, `--dry-run`) |
| `data/blog-supply/blog-supply-candidates-v1.jsonl` | 후보 저장소(source_key 가 identity) |
| `data/blog-supply/blog-supply-manifest-v1.json` | 실행 요약·counts·sha256·호출수 |
| `data/blog-supply/blog-supply-diff-<date>.json` | NEW/CHANGED/GONE (refresh 구조) |

candidate 최소 메타: `source_provider/service/key/language · title · official_url ·
region · theme · content_type_id · source_modified · event_start/end · collected_at ·
status · blog_fit · fit_reason`. TourAPI 후보의 출처는 provider+service 기록으로
보존한다(항목별 원문 URL 이 없는 API 데이터 특성).

## blog_fit 분류 (게시 계약과 1:1)

- `FIT` — 전국 여행코스 등 여행 이해/아이디어 소재.
- `REVIEW` — 행사·캠페인: **전국/교차지역·외국인 대상 맥락일 때만** Blog 소재.
  지역 Events 정본의 단순 복사는 금지(정본 화면으로 링크).
- `UNFIT_PRACTICAL` — 규정·요금·운영 등 실용정보. **Travel Essentials 가 정본** —
  Blog 에 싣지 않는다.
- `UNFIT_INSTITUTIONAL` — 인사·업무협약·세미나·산업정책 등 기관 소식(보도자료 전용).

### 탐지 레이더 실증 (2026-09-07)

최근 2페이지 30건에서: FIT — "외국인 5명 중 1명 지방공항으로"(지방공항×지역관광),
"태국 방한관광"(국가권), "몽골 K-의료관광"(언어권). 아카이브 검색 실측 —
"이스타항공, **지방공항 중화권** 관광객 유치", "**중화권** 웨딩관광객 **거제·통영**
방문"(주최=전국기관 × 목적지=특정 지역 — '라원 유형' 교차지역) 탐지 확인.

## 호출 예산

실행당 KTO 3~4회(목록 1페이지만, 상세 0). 승인 인벤토리의 미검증 일일 상한
(추정 1,000/op, `data/tourapi/config/kto-detail-call-limit.json` = UNVERIFIED)을
존중한다. 대량 상세 수집은 이 구조의 범위 밖이며 별도 승인 절차를 따른다.

## refresh 운영

- **cadence 는 Owner 미확정** — `refresh_cadence: OWNER_DECISION_PENDING`.
  임의로 "7일" 고정하지 않는다. (지역 Events/Essentials 의 기존 7일 운영과 별개.)
- 실행하면 이전 대비 NEW/CHANGED/GONE 이 diff 파일로 남는다.
  GONE = 원천 목록에서 사라짐(종료·만료·URL 변경 후보) — 게시물이 그 원천을
  참조 중이면 사람이 확인한다.
- 실측 검증(2026-09-07): 재실행 시 NEW 0/CHANGED 0/GONE 0(중복 방지),
  오염 행 2건이 GONE 으로 검출·정리됨.

## AI 사용 원칙

게시 집필에서 AI 는 공식 사실의 요약·정리 보조만 한다. 새 사실·가격·행사
날짜를 만들지 않는다(가드가 가격 수치를 차단). 자동 대량생성 Blog 금지.
