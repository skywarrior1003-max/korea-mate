# 경주 공식 페이지 이미지 gapfill v1 (2026-09-05)

> TASK-GOKOREAMATE-GYEONGJU-OFFICIAL-PAGE-IMAGE-GAPFILL-V1 (Owner 최신 결정: 경주시 공식 관광 페이지 이미지 직접 사용·출처 기록·takedown 운영).
> 상위: gyeongju-provenance-exact-match-recovery-prep-v1(ccfa293) · API completion status v1(HOLD) · closeout SSOT P0-1.
> Production 실행 없음 — 적용은 별도 Owner 승인 PROD-SQL 태스크.

## 1. Owner 정책 적용 (이 문서가 운영 기록)

- 원천: **경주문화관광(gyeongju.go.kr/tour) 공식 관광지 상세 페이지** — 권역별 관광지 6권역 메뉴
  (mnu_uid 2291–2296)의 registry **159곳**(= Final 이 수집한 GJ01 관광지현황과 동일 등록부).
- 일반 사용자 리뷰/블로그/SNS/상업 사진 사용 **0**. 스크린샷 사용 0. 수집은 공식 페이지 HTML 의 이미지 URL 만.
- **출처 기록**: 각 relation 의 rights_note 에 공식 상세 페이지 URL 포함 + master mapping 에
  provider/official_page_url/image_url/filename/alt/as_of 전량 보존.
- **Takedown 운영 정책(Owner 확정)**: 공식 관광기관 공개 이미지 사용 + 출처 기록 + 권리 문제 제기·삭제
  요청 시 해당 이미지 즉시 삭제/교체. 별도 법률 검토 프로젝트는 열지 않음.

## 2. 매칭 (identity 재판정 0)

- Final title_ko ↔ registry 관광지명 **정확 일치**(NFC·trim·내부 공백 축약만): **133/133**.
  - 132 = 유일 일치 · 1(동대봉산 무장봉)= 두 권역 메뉴에 동일 장소 중복 게재(주소·좌표·썸네일 동일) → 결정적 dedupe.
  - fuzzy/부분일치/유사도/의미 매칭/canonical 재판정 **0**. Final identity 수정 0.
- 확인 보강: 공식 목록의 주소·카카오맵 좌표를 대조(대부분 <500m). 소수 항목에서 공식 사이트 길찾기
  좌표 이상치 발견(§6) — 주소는 전부 일치, identity 충돌 아님.

## 3. 결과 (133 전수)

| 분류 | 수 |
|---|---|
| 기존 exact38 — 보존·확인 | 38 (재수집 0, primary 는 Owner 신규 규칙로 갱신) |
| gapfill 95 — **OFFICIAL_IMAGE_FOUND** | **95** |
| OFFICIAL_PAGE_FOUND_NO_IMAGE / NOT_RESOLVED / IDENTITY_CONFLICT | **0 / 0 / 0** |

이미지 합계 **888 relation** = 공식 상세 페이지 슬라이더 813(순서 보존)
+ 기존 provenance_v2 추가분 74 + 자동차박물관 Owner 지정 1.
(기존 84 중 stamp 아이콘 gif 9건은 장소 사진이 아니라 스탬프투어 도장 그래픽이라 제외 — §6.)

- **Primary 132**: Owner 규칙 = "공식 상세 페이지에서 첫 번째로 대표 노출되는 이미지"(슬라이더 1번).
  다중이미지 19곳 보류도 이 규칙으로 전부 해소.
- **경주세계자동차박물관(506)**: 기존 결정 유지 — primary `pick7_img24.jpg`, "(업체제공)" 2장 제외 유지.
- **동궁과 월지(439)**: Owner override — 공식 페이지 8장 relation 만 준비, **primary 없음(게이트)**.
  Owner 과거 지정본의 정확 식별 증거는 이번에도 미발견(OWNER_SELECTED_EXACT_IMAGE=NO, 임의 선택 안 함).
  참고: 상세 페이지 대표 1번 이미지도 "동궁과월지 야경"이나 이는 자동 확정에 사용하지 않음.
  기존 후보 9종 표는 provenance-exact-match-recovery-prep-v1 §4 유지.

## 4. 복구 패키지 (immutable)

`data/main-intake/five-city-reflection-recovery-v1/`

| 파일 | 내용 |
|---|---|
| gyeongju-official-page-images-master-v1.jsonl | **888행 = 133 target 의 authoritative image mapping SSOT**(candidate·spot·source·페이지URL·이미지URL·alt·순서·primary·origin·as_of·권리) |
| gyeongju-official-page-images-apply-v1.sql | relation INSERT 888(NOT EXISTS·기존 primary 보호) + 132곳 image_url SET(NULL 만) — sha256 `5599a8b2db309746414063295274a5bb8b340c0eb8142667cab4aba4e7557748` |
| gyeongju-official-page-images-precheck/-readback-v1.sql | 적용 전/후 검증(precheck 실서버 실측: 133·pub 132·img 0·rel 0·prim 0) |

기대 결과: relations +888 · primary +132 · image_url +132 · 경주 relation 총계 274→1,162 · 무관 행 0 · idempotent.

### 기존 패키지 관계

- `gyeongju-exact38-*` (ccfa293): **SUPERSEDED — DO NOT APPLY SEPARATELY.**
  본 패키지가 동일 84행 중 75행(스탬프 gif 9 제외)을 포함·확장하고 primary 규칙(Owner 신규)을 적용한다.
  exact38 을 별도 적용하면 stamp gif primary(첨성대·오릉·동리목월문학관·석굴암) 가 들어가므로 금지.
- `gyeongju-owner-two-images-apply-v1.sql`: **동궁과 월지(439) 전용으로만 잔존**(506 부분은 본 패키지가 포함).
  단 이 파일은 moonCourse13 가정본 — Owner 가 다른 후보를 지정하면 재생성 필요. 가드 덕에 이중 적용 안전.

## 5. 검증 (2026-09-05)

- **URL 전수 검증 888/888 PASS**: HTTP 200 · content-type image/* · >5KB · 픽셀 해상도 파싱 — broken 0.
  해상도 min 306 / median 1,600 / max 1,920 px. primary 132 중 29곳은 공식 대표 이미지 자체가 500–740px(§6).
- **서버측 dry-run(READ-ONLY)**: apply 의 VALUES 888행을 실서버 SELECT 로 파싱 —
  total 888 · insertable 888 · prim_rows 132 · prim_blocked 0 · spots 133 · missing_spot 0 · bad_source 0.
- 중복 relation 0 · spot 당 primary ≤1 · 행 정합 888 = 813+74+1 (기존 84 = 74+9 stamp+1 pick7_img24).
- Production 기준선: 133 전수 relation 0·primary 0·image_url 0 (경주생활체육공원 505 만 unpublished — 반영은 무관).

## 6. 발견 사항 (수정하지 않음 — Owner 보고)

1. **stamp gif 9건 제외**: exact38 의 84행 중 9건은 스탬프투어 도장 그래픽(stampN.gif) — 장소 사진 아님.
   exact38 그대로 적용 시 첨성대 등 4곳의 primary 가 도장 아이콘이 될 뻔함. 본 패키지에서 제외(supersede 근거).
2. **공식 사이트 길찾기 좌표 이상치**: 용장사곡삼층석탑(297km)·양남 주상절리(29km)·골굴사(6km) 등 —
   주소는 Final 과 정확 일치, 우리 Final 좌표는 정상 범위로 보임(공식 사이트 kakao 링크 좌표 오류 추정). 조치 불요.
3. **경주생활체육공원(505)**: is_published=false + lat/lng NULL. 이미지는 준비되나 노출·플래너 대상 아님.
4. **29곳 primary 가 500–740px**: 공식 페이지 대표 이미지 원본 자체 해상도. 카드 표시 가능 수준, 규칙대로 채택.
