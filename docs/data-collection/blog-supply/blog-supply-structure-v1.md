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
