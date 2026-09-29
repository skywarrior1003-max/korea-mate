# 공개 개인정보처리방침 Production 출시 기록 (PUBLIC-PRIVACY-POLICY-PRODUCTION-RELEASE-V1)

> master 에 올리면 Production 이 다시 배포되므로 이 기록은 브랜치에 두고 다음 합류 때 함께 올린다.

| 항목 | 값 |
|---|---|
| 승인 | Owner, 2026-09-29 — 현재 서비스판 처리방침·접근 링크·문구·가드만 |
| 합류 | master `ee80ab51` → `a61ba13e`(fast-forward) |
| Preview 검증 커밋 | `a61ba13e` = Preview `f87820cf`(첫 빌드 2회는 Cloudflare 빌드 이미지의 Node 24.16.0 설치 일시 오류 — 같은 커밋 재시도 성공) |
| Production 배포 | `e0c1fc05-ddfe-4206-8053-52d0afcd8e06`, 소스 master `a61ba13e`, 완료 2026-09-29 02:04:43 UTC(11:04 KST) |
| 복구 지점 | `09ea63e5`(되돌리면 처리방침 공백이 다시 생긴다) |
| 시행일 | 2026-09-29(`PUBLIC_PRIVACY_EFFECTIVE_DATE` = 게시일, 변경 없음) |

## 실화면(gokoreamate.com, 새 브라우저, 11:06 KST)

- `/privacy/` 200. ko·en·ja·zh × 모바일 390·데스크톱 1280 = 8화면: 시행일 라벨("시행일: 2026-09-29" 등)·핵심 사실(케이이엔지·support@·네이버 지도·Cloudflare Web Analytics)·내부 문구 없음·가로 스크롤 없음·페이지 오류 0 — PASS.
- 홈 하단 링크 → /privacy: PASS(모바일·데스크톱). **첫 방문 안내 팝업이 화면을 덮고 있어 '확인하고 둘러보기'를 누른 뒤에 하단 링크를 누를 수 있다** — 기존 About 링크도 같은 현재 동작.
- More '개인정보처리방침' 행 → /privacy: PASS. 문의 양식 안내 옆 링크 표시: PASS.
- 콘텐츠 출시 유지: /trending 부산바다축제 없음 · 서울 지하철 1,550원 · 전주 소리축제 없음 · `/api/health/content` 200 — PASS.

## 운영·Auth 기록
- 6개월 보관 수동 운영: `manual-retention-log.md`(첫 대상 2026-12-14 시험 문의, 확인일 12-07).
- Auth 병합 대조 항목 고정: `public-privacy-guard.test.ts` 의 'Auth 병합 대조 항목' 테스트.
- 처리방침을 공개했다는 것과 모든 법률 해석이 확정됐다는 것은 다르다 — 국외 이전 근거 선택(L1)·연락처 해석(L5)은 여전히 Auth 결정표의 미결 항목이다.
