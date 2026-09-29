# 공개 개인정보처리방침 — 현재 서비스판 출시 자료 (PUBLIC-PRIVACY-POLICY-V1, 2026-09-29)

## 1. 현재 Production 공개 경로 확인 결과 (2026-09-29)

| 확인 | 결과 | 근거 |
|---|---|---|
| `/privacy/`·`/terms/`·`/ko/privacy/`·`/en/privacy/`·`/privacy-policy/`·`/legal/`·`/policy/`·`/privacy.html` | 전부 404 | 직접 확인(HTTP) |
| 홈(모바일·데스크톱)·More·About 화면의 처리방침·약관 링크 | 없음. 본문에 '개인정보/Privacy' 문구도 없음 | 직접 확인(브라우저) |
| master 코드의 처리방침 경로·링크 | 없음(`src/app/privacy` 부재, 링크 0) | 코드 확인 |
| 유일한 안내 | 문의 양식 한 줄: "보내기를 누르면 문의 검토와 회신을 위해 내용과 이메일 주소가 저장됩니다." | 코드 확인 |

**공백 확정**: 공개 사이트에 개인정보처리방침이 없다. Legal 문서는 Auth 브랜치에만 있다.

### 현재 Production 이 처리하는 정보

| 항목 | 내용 | 근거 |
|---|---|---|
| 외부 연결 | Google Analytics(googletagmanager·google-analytics, 쿠키 `_ga`·`_ga_C0N…`), **Cloudflare Web Analytics**(static.cloudflareinsights.com), **네이버 지도**(oapi.map.naver.com·pstatic·nelo.navercorp.com), Supabase, 관광 공식 사이트 이미지(visitbusan·visitkorea) | 직접 확인(브라우저 요청) |
| 브라우저 저장소 | `koreamate_device_id`·`koreamate_cart`·`koreamate_saved_spots_data`·안내 상태·언어(바꿀 때)·네이버 지도 캐시. 서비스 자체 쿠키 없음 | 직접 확인 |
| 서버 저장 | 여행(일정·사진·메모)·기억·나의 장소(이름·메모·위치·사진)·저장·좋아요·반응·신고(사유·메모·신고 키)·장소 제보·문의(이름 선택·이메일·메시지·관련 페이지·브라우저 언어)·공유 집계 — 기기 식별자와 함께(일부는 변환값) | 코드 확인(functions/api) |
| 문의 알림 메일 | Resend 로 운영자에게 이름·이메일·메시지 원문 발송 | 코드 확인(master contact.ts) |
| 위치 | '내 주변' 정렬에 브라우저 위치 사용 — 서버 전송 코드 없음 | 코드 확인 |
| 로그인·계정·동의·자동 파기 | 없음(Auth 브랜치·082 미출시) | 코드·DB 확인 |
| AI | 꺼짐 | 기존 확인 |

## 2. 권고 실행안(한 가지)

**master 기반 독립 브랜치 `fix/public-privacy-policy-v1` 을 Production 에 반영한다.**
- `/privacy/` 4개 언어 — 위 사실만 쓴 현재 서비스판(로그인·계정 삭제·동의·자동 파기 서술 없음, 내부 마커 없음).
- 접근: 홈 하단 링크, More 의 '개인정보처리방침' 행, 문의 양식 안내 옆 링크.
- 약관(`/terms/`)은 이번 범위에 넣지 않는다(개인정보 안내 공백 해소가 목적 — 관할 결정이 남아 있음).

### 게시 문안 중 Owner 선택이 필요한 문장 — 없음

국외 이전의 **법적 근거 선택(L1)** 은 문안에 쓰지 않았다. 법 제28조의8②의 고지 항목(항목·국가·시기·방법·받는 자·목적·보유기간·거부 방법과 효과)은 사실대로 모두 적었다. 보호책임자 연락처는 '담당 부서명 + 이메일'이다(전화번호 병기 여부 L5 는 Auth 결정표에 남음 — 이 게시를 막지 않음).

### 남는 위험

- 문의·신고 **6개월 파기는 현재 수동**이다(자동 파기 082 는 Auth 와 함께 출시). 첫 대상은 2026-12-14 문의 1건(운영 시험 기록). 그 전에 082 가 출시되지 않으면 해당일에 수동 삭제한다.
- GA 의 국외 이전 근거 해석(L1)은 여전히 남는다 — 사실 고지와 쿠키 거부 방법은 게시된다.

## 3. 대안 — GA 임시 중단(권고하지 않음)

Production 환경변수 `NEXT_PUBLIC_ANALYTICS_MODE=off` + 재배포(코드가 이미 지원 — `src/app/layout.tsx`). GA 전송은 멈추지만 **문의·기기 식별자·여행 데이터·네이버 지도·Cloudflare Web Analytics 에 대한 안내 공백은 그대로**다. 처리방침 게시 없이 이것만으로 공백이 해결되지 않는다.

## 4. Auth 브랜치와의 통합

시험 병합(Auth ← 이 브랜치) 충돌 파일: `HomeClient.tsx`, `privacy/page.tsx`, `global-more-nav-guard.test.ts`, `privacy-content.ts`, `messages/{ko,en,ja,zh}.json`. 동일(충돌 없음): `LegalDocument.tsx`·`legal-types.ts`·`MoreClient.tsx` 의 개인정보처리방침 행.

Auth 출시 merge 때 해소 규칙:
1. `privacy-content.ts`·`privacy/page.tsx` — **Auth 판을 채택**하되, 이 판에서 새로 확인한 사실을 Auth 판에 먼저 반영해 둔다:
   - 네이버 지도(브라우저가 네이버 서버에 직접 접속, IP 등 전송), Cloudflare Web Analytics(쿠키 없는 방문 집계), 관광 공식 사이트 이미지 직접 로드
   - 기기 식별자는 콘텐츠와 함께 원문으로도 저장됨(일부만 변환값) — Auth 판 보안조치의 "원본 대신 일방향 해시" 문장은 사실보다 넓으므로 교정
   - Auth 판 보안조치의 "모든 읽기·쓰기는 서버 API" 는 "개인 여행·사진·장소의 변경은 소유를 확인하는 서버 기능" 수준으로 교정
   - '내 주변' 위치는 기기 안에서만 사용
2. `HomeClient.tsx` — Auth 판(개인정보처리방침 + 이용약관 링크) 채택.
3. `messages/*.json` — 두 판의 `nav.privacy`·`more.privacyDesc` 값이 같다. Auth 판(terms 키 포함) 채택.
4. `global-more-nav-guard.test.ts` — Auth 판 조건(`LEGAL_EFFECTIVE_DATE`)과 이 판 조건(`PUBLIC_PRIVACY_EFFECTIVE_DATE`)을 합친다.
5. `public-privacy-guard.test.ts` — Auth 판에서는 로그인 문장이 생기므로 '미출시 기능 서술 금지' 테스트를 Auth 판 기준으로 바꾸거나 제거한다.
6. Auth 판 시행일은 새 방침 시행일(변경 고지 — 이 판의 제13조).

## 5. Production 반영 시 확인 항목

- 반영 단위: 이 브랜치 master merge(자동 Production 배포). DB·환경변수·Auth·약관 변경 없음.
- merge 직전: `PUBLIC_PRIVACY_EFFECTIVE_DATE` 를 **실제 게시일**로 맞춘다(한 줄, 다르면 커밋).
- 배포 후: `https://gokoreamate.com/privacy/` 200 · 4개 언어(`?lang=`) 본문·시행일 라벨 · 내부 문구 없음 · 홈 하단 링크(사전 안내 팝업 '확인하고 둘러보기' 후) · More 행 · 문의 양식 링크 · 모바일 가로 스크롤 없음.
- 중단·복구: 하나라도 다르면 직전 Production 배포(`09ea63e5`)로 되돌린다. 되돌리면 처리방침 공백이 다시 생긴다.
