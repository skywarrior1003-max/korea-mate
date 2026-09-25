# 신규 추천 장소 게시 운영 절차 v1
(COMMUNITY-RECOMMENDATION-NEW-DISCOVERY-V1 · 2026-09-25)

사용자 장소 제안이 "신규 추천" 페이지에 노출되기까지의 **수동 운영 계약**.
이 절차 밖의 어떤 자동화도 현재 존재하지 않으며, 만들지 않는다.

## 1. 사용자 제안부터 노출까지 (전체 흐름)

```text
사용자 My Places 또는 본인 공개 Story 의 user_spot 에서 제안
→ 관리자 검토 (/api/admin/place-suggestions)
→ accepted
→ 별도 카탈로그 검증 (아래 §3)
→ published city_spot 생성 또는 기존 검증 장소 선택
→ admin publication 연결 (/api/admin/place-suggestion-publications)
→ Production 정적 재빌드
→ 신규 장소 페이지(?tab=new) 노출
```

핵심 원칙:

- **accepted 는 게시 완료가 아니다.** "카탈로그 검증 후보로 접수됨"일 뿐이다.
- **accepted 처리만으로 `city_spots` 행이 생성되지 않는다** (자동 생성 경로 0 —
  가드 테스트로 고정).
- 미검증 장소의 자동 게시는 금지다.
- 게시 전 반드시 확인: 장소 **이름·주소·좌표·카테고리·기존 카탈로그와의
  중복·출처(공식/신뢰 원천)**. 검증 불가 항목이 있으면 게시하지 않는다.
- 신규 장소 카드는 사용자 제안의 **개인 메모·개인 사진·raw device 정보를
  복제하지 않는다** — 카탈로그 데이터(공식 이미지 정책 포함)만 쓴다.
- **기존 5,015개 카탈로그 장소는 신규에 소급 포함하지 않는다** (backfill 0).

## 2. `place_suggestion_publications` 연결 조건

`POST /api/admin/place-suggestion-publications { suggestion_id, city_spot_id }`

서버가 강제하는 조건(하나라도 어긋나면 4xx):

| 조건 | 위반 시 |
|---|---|
| suggestion 이 `accepted` | 409 `suggestion_not_accepted` |
| city_spot 이 `is_published = true` | 409 `city_spot_not_published` |
| suggestion.city == city_spot.city | 409 `city_mismatch` |
| suggestion 1개당 spot 1개 (PK) | 409 `duplicate_suggestion` |
| spot 1개당 suggestion 1개 (UNIQUE) | 409 `duplicate_spot` |

- **`first_published_at` 은 최초 연결 시 서버가 1회 기록하고 불변이다** —
  행 UPDATE 자체를 DB 트리거가 거부한다. 수정·재연결로 신규 60일 창을
  갱신할 수 없다.
- Story 쪽 `first_approved_at` 도 동일하게 1회 기록·불변이다(재제출·재승인
  무효).

## 3. 초기 V2 운영 (일괄 수동)

- 신규 장소는 **실시간 자동 게시하지 않는다**.
- 초기에는 검증을 마친 장소를 **하루 1회 또는 운영자가 정한 배치**로 묶어
  게시한다(카탈로그 게시 → admin 연결).
- 카탈로그 게시·admin 연결 후 **Production 정적 재빌드가 필요하다**.
  재빌드 전까지 신규 장소 카드가 화면에 나타나지 않는 것이 **현재 SSG
  계약**이다(장소 카드·상세는 빌드 타임에 DB 에서 베이크된다).
- 운영자는 재빌드 완료 후 **신규 탭(?tab=new)과 해당 장소 상세**를 직접
  확인한다.
- 자동 Cloudflare build hook·동적 장소 렌더링은 **후속 개선 후보**이며
  현재 범위가 아니다(이번 릴리스에 미구현).

## 4. 실패·중간 상태 처리

| 상태 | 처리 |
|---|---|
| accepted 인데 catalog 미게시 | 신규 미노출 유지(정상 대기 상태) |
| catalog 게시됐는데 admin 미연결 | 신규 미노출 유지(연결 전) |
| admin 연결됐는데 재빌드 전 | API 자격과 정적 카드 사이 시간차 가능(정상) |
| migration/배포 실패 | 자동 우회·중복 배포 금지 — 보고 후 대기 |
| 잘못 연결 | 운영자가 DB 를 직접 임의 수정하지 않는다 — 별도 correction 절차(Owner 승인 TASK)로만 |

- 사용자에게 "게시되었습니다" 류의 **자동 게시 성공 메시지를 보내지 않는다**
  (제안 접수 안내만 존재).

## 5. 보안

- admin 호출은 기존 **`x-admin-key` + `ADMIN_KEY`(fail-closed)** 계약 그대로.
- 키 값은 문서·로그·스크린샷 어디에도 남기지 않는다.
- 무키·오키는 401 이다.
- 일반 사용자는 publication 을 연결할 수 없다(테이블 RLS + anon/authenticated
  권한 회수, endpoint 는 admin 전용).
- Production 동작 확인을 위해 **실제 제안·장소·연결을 만들지 않는다** —
  상태 전이 검증은 Staging/Preview 에서만 한다.
