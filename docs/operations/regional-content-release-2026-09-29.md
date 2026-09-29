# 정기 콘텐츠 교정 Production 출시 기록 (REGIONAL-CONTENT-FRESHNESS-PRODUCTION-RELEASE-V1)

> 이 기록은 런북 `regional-content-freshness-runbook-v1.md` §2 의 ④ Production 게시·⑤ 게시 후 실화면 확인 증거다.
> master 에 올리면 Production 이 다시 배포되므로, 이 문서는 콘텐츠 브랜치에 두고 다음 주간 확인 merge 때 함께 올린다.

## 게시

| 항목 | 값 |
|---|---|
| 승인 | Owner, 2026-09-29 (콘텐츠 교정만 — Auth·DB·Legal·환경변수 제외) |
| 합류 | master `1d3334fd` → `ee80ab51` (fast-forward, 콘텐츠 커밋 bd6dda7e·ee80ab51) |
| Preview 검증 커밋 | `ee80ab51` = Preview `f5ebab91` |
| Production 배포 | `09ea63e5-8fd7-4a7a-b57b-a901547bdcce` — environment production, source master `ee80ab51`, 완료 2026-09-29 01:11:39 UTC(10:11 KST) |
| 직전 Production 배포(복구 지점) | `a007c7ac` (master `1d3334fd`) |
| 변경 파일 | 22개 — DB migration·Auth·계정·동의·Legal·비밀값·환경변수 0 |

## 실화면 확인 (gokoreamate.com, 새 브라우저 컨텍스트, 2026-09-29 10:13 KST)

| 화면 | 결과 | 근거 |
|---|---|---|
| `/trending` | PASS | 부산바다축제·부산국제록페스티벌 없음, 다가오는 행사(ONE Asia·자갈치) 표시, 페이지 오류 0 |
| `/all-spots` | PASS(검색 기준) | 첫 페이지와 검색("바다축제") 결과 모두 부산바다축제 없음. 종료 행사 9건 제외는 코드(`isListableEvent`)·데이터 대조로 확인 |
| 제주 City Hub·행사 | PASS | 관악제 없음. 현재 진행 중인 행사가 없어 "곧" 안내 표시(가을 행사 미등록 — 대기 목록) |
| 전주 City Hub·행사 | PASS | 소리축제 없음, 진행 중 행사(jeonju-RN-001) 표시 |
| 서울·부산 City Hub | PASS | 진행 중 행사 표시(목록 회귀 없음) |
| 서울 지하철(seoul-U-001) | PASS | 1,550원, 1,400원 없음 |
| 기후동행카드(seoul-U-007) | PASS | "신규 충전이 2026년 8월 31일(선불)로 끝났다", "이미 충전한 카드는 만료일까지", 후불 9월 30일, 단기권 표시, 65,000원 없음 |
| 재확인 대기 안내(seoul-U-006·jeju-U-003) | PASS | "다시 확인하는 중" 안내 표시 |
| `/api/health/content` | PASS | 200 `{"ok":true,"state":"ok","last_check":"2026-09-29","days_since":0,...}` |

## 주간 운영 인계

- `/api/health/content` 는 **누락을 감지할 뿐 콘텐츠를 게시하지 않는다.** 원천 확인(Data Track) → 데이터 반영·Preview(Main) → Owner 승인·merge → 실화면 확인(Main)은 사람이 한다(런북 §2).
- 외부 감시: **미연결.** 연결 전 월요일 점검 — 담당 Main(Claude) 작업 세션, 방법: `curl -s -o /dev/null -w "%{http_code}" https://gokoreamate.com/api/health/content` 와 `src/data/regional/content-freshness-v1.json` 마지막 확인일. 503 이거나 7일 초과면 그 주 첫 작업을 원천 확인으로 둔다.
- 외부 감시 연결 후속(Owner 계정 작업): 감시 서비스에 `GET https://gokoreamate.com/api/health/content` 등록, 정상 200, 60분 간격, 연속 2회 실패 시 알림, 알림 채널은 Resend 가 아닌 것. Auth 출시 후 `/api/health/retention` 도 추가.
- 다음 주간 확인: 2026-10-05(월)까지. 7+2일 기준이라 2026-10-08 이후에는 `/api/health/content` 가 503 `weekly_check_overdue` 를 낸다.
- 대기 항목: Mpass·제주 버스/택시/마라도·전주 택시 요금 원천 확인, 5도시 가을 이후 행사(공식 일정 확인 후).
