# 기록 추가 사진 단독 수정 — Production 적용·되돌림 절차 (준비본 · 2026-10-02)

브랜치 `fix/moment-extra-photos-hotfix` (master `ecc5bf01` 기준). **V2 전체와 분리된 수정**이다 — 가져오기·사용권·AI·Staging 전용 DB 084~088 에 의존하지 않는다. 이 문서는 준비와 Preview 검증까지이며, Production 적용은 Owner 결정 뒤.

## 1. 무엇을 고치나

- **결함(Production 에 있음, dcf874b4 이후):** 정상 온라인 저장에서 한 기록의 2번째 이후 사진이 서버에 올라가지 않고 그 기기 브라우저에만 남는다. 서버·다른 기기·Story·공유에는 기록마다 1장만 보인다.
- **영향 규모는 서버에서 알 수 없다.** Production 의 추가 사진 0장(10-02 읽기)은 영향받은 사용자가 0명이라는 뜻이 아니다 — 기기에만 남은 사진은 서버가 셀 수 없다. 브라우저 데이터를 지운 기기·다시 열지 않는 여행의 사진은 이 수정으로도 올라오지 않는다.
- **같이 고쳐야 하는 이유:** 업로드만 고치면 다시 열 때 늦게 올라온 사진이 **이미 공개한 기록**에서 확인 없이 공개된다(Preview 재현).

## 2. 커밋·파일

| 커밋 | 내용 |
|---|---|
| `24dcee43` | 클라이언트 업로드 수정 + 서버 공개 보호(동의 뒤 사진 비공개·소유자 확인 UI·첫 사진 삭제 시 비공개 전환) + 같은 사진 중복 방지 + 업로드 허용 표시(`x-gkm-late-photo-guard`) + 운영 정지 스위치 |
| `9f2d4f68` | 추가 사진을 올리기 **직전에** 서버에 다시 묻는다(되돌린 뒤 열린 탭도 0장) |
| (문서) | 이 문서 · `moment-extra-photos-rollback.sql` |

파일: `src/lib/trip-moments/{storage,types,photo-set,late-photo-guard}.ts` · `functions/_lib/late-photo-guard.ts` · `functions/api/trip-moments/{index.ts,[momentId]/photos.ts,[momentId]/photos/[photoId].ts}` · `functions/api/shared/[id]/story.ts` · `functions/img/memory/[itineraryId]/[ref].ts` · `src/lib/community/recommendations-server.ts` · `src/lib/share/public-memory.ts` · `src/components/TripMomentTimeline.tsx` · `src/messages/{ko,en,ja,zh}.json`(2키) · 테스트 2개.
**DB 변경 없음** — Production 에 `trip_moment_photos.created_at`·`trip_moments.public_consent_at`·`ai_ops_switches` 가 이미 있다(10-02 읽기 확인).

## 3. 안전장치(조합별)

| 클라이언트 \ 서버 | 옛 서버(master) | 새 서버(이 수정) |
|---|---|---|
| **옛 클라이언트**(배포 전 열린 탭·캐시) | 지금 Production 그대로 | 첫 사진만 저장 · 추가 사진 업로드 0 · 공개 그대로(Preview D2 실측) |
| **새 클라이언트** | 업로드 0 — 목록·업로드 응답에 보호 표시가 없으면 올리지 않는다(되돌린 뒤 열린 탭 D4 실측: 시도 0·기기 대기 2) | 늦은 사진 업로드 · 공개 기록의 늦은 사진은 비공개(익명 Story 1장·주소 404) · 소유자 "나중에 올라온 사진 n장 … 확인하고 함께 공개" · 중복 0 |

- 운영 정지: `ai_ops_switches` 에 `('moment_extra_photos','paused')` 행 → 목록 표시 `0`·`/photos` 503 PAUSED · **첫 사진 저장·열람·메모·공개 Story 는 그대로**, 추가 사진은 기기에 남는다(거짓 성공 없음). 행을 지우면 다음 열기에서 올라간다(Preview 실측: 정지 중 서버 1장·기기 2장 → 해제 뒤 3장·0장).

## 4. 배포 순서·중단 조건·확인할 응답

1. **배포 직전 기준 기록**(읽기): 추가 사진 수 `select count(*) from trip_moment_photos` · 공개 기록 수.
2. Pages 배포(이 브랜치). alias 가 바뀌는 데 Preview 실측 11~16초 — 그 사이 열린 탭은 옛 클라이언트로 동작한다(안전).
3. **확인(배포 직후 5분 안):**
   - `GET /api/trip-moments?itinerary_id=<내 시험 여행>` 응답 머리글 `x-gkm-late-photo-guard: 1`
   - `POST /api/trip-moments/<임의 uuid>/photos`(인증 없음) → 401 이고 머리글 `x-gkm-late-photo-guard: 1`
   - 공개 시험 여행의 `/api/shared/<id>/story` 사진 수가 배포 전과 같다
4. **중단 조건 → 즉시 운영 정지(3절 스위치)·조사:** 머리글이 없다 · 공개 Story 사진 수가 소유자 확인 없이 늘었다 · `/photos` 5xx 가 평소보다 많다 · 같은 경로 중복 행(`count(*) <> count(distinct storage_path)`).
5. 이상 없으면 24시간 동안 위 확인을 하루 2회.

## 5. 되돌림

- **1순위 — 공개 보호를 유지하는 되돌림(클라이언트만):** "옛 클라이언트 정적 파일 + 이 수정의 서버" 배포를 미리 만들어 둔다(master 의 `src` 로 빌드한 `out` + 이 브랜치의 `functions`). 업로드는 멈추고(옛 클라이언트) 공개 보호는 남는다. Preview 실측(D2'): 공개 Story 1장 유지·늦은 사진 주소 404·새 기록은 첫 사진만.
- **2순위 — 운영 정지 스위치:** 배포 없이 추가 사진 업로드만 멈춘다(3절).
- **최후 — 공개 보호 없는 옛 서버(master)로 전체 되돌림:** 이미 올라온 늦은 사진이 공개 기록에서 **바로 노출된다**(Preview D4 실측: 익명 공개 Story 1→3장·주소 200). 반드시 되돌리기 **전에** `moment-extra-photos-rollback.sql` ①→② 를 실행하고 ② 의 결과를 보관한다(대상 기록이 비공개로 바뀌어 첫 사진·메모도 공개 Story 에서 빠진다 — 사용자 영향). 앞으로 고친 배포를 다시 올린 뒤 ③ 으로 복원(같은 동의 시각 → 늦은 사진은 계속 비공개). Preview 실측: ② 뒤 노출 0 · ③ 뒤 공개 1장·늦은 사진 404.
- 새 클라이언트가 열린 탭은 옛 서버를 만나도 올리지 않는다(9f2d4f68) — 그래서 되돌림 동안 새로 노출되는 사진은 없고, 노출은 "이미 올라온 늦은 사진"뿐이다.

## 6. 남은 것

- Production 적용·실기기(휴대전화) 확인은 하지 않았다. 실제 사용자 기기에 남은 사진 수는 알 수 없다.
- 같은 사진의 동시 업로드가 1.5초 안에 끝나지 않는 드문 경우 같은 경로 행이 2개 생길 수 있다(화면은 같은 경로를 한 번만 보여 주고, 개수만 하나 더 센다).
