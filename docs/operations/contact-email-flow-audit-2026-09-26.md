# 문의 → Owner 이메일 전달 구조 감사 (CONTACT-EMAIL-AUDIT-V1, 2026-09-26)

판정: **CONFIRMED — DB + OWNER EMAIL DELIVERY ACTIVE**
(직전 Legal 감사의 "개인 이메일 자동 알림 미확인" 판정을 **정정**한다 — 발송 계층을 놓쳤었다.)

## 실제 흐름 (구조 2 + 신고용 병행)

```
ContactModal(contactForm ns, 4locale, 홈 푸터 Contact)
  → POST /api/contact (functions/api/contact.ts)
      · 8KB 캡 · IP rate limit 5/10분 · honeypot(_hp) · type allowlist · email/message 검증
      → contact_inquiries INSERT (anon key — RLS policy contact_insert_anon: INSERT only)
      → waitUntil(sendAdminEmail)  ← 저장 성공 후 비차단 발송(실패해도 접수 유지)
          · functions/_lib/admin-email.ts → Resend API
          · From = CONTACT_FROM_EMAIL(기본 "gokoreamate <noreply@gokoreamate.com>")
          · To   = ADMIN_NOTIFICATION_EMAIL(서버 secret — 클라 번들 노출 0)
          · 재시도 0 · provider 응답 원문/키 로그 0 · 본문에 문의 전문+admin 딥링크
  → 관리자 화면 /korea-mate-admin/inquiries (ADMIN_KEY 게이트)
```

신고 알림(place_reports)은 같은 helper 를 쓰되 `admin_notification_events` 원장으로
예약(UNIQUE=중복 발송 방지)→발송→sent/failed 기록까지 남긴다(admin-notify.ts).
contact 알림은 원장 기록 없이 waitUntil 1회 발송이다(차이점).

## 증거

- Production env: `RESEND_API_KEY`·`ADMIN_NOTIFICATION_EMAIL`·`CONTACT_FROM_EMAIL` = configured(secret_text). **Preview 는 3종 모두 없음** → Preview 문의는 not_configured 로 발송 skip(정상 fail-safe).
- Production DB 원장: `admin_notification_events` — 2026-08-08 03:09 failed(provider_error) → 03:43 **sent 성공**. 같은 helper·같은 env 로 Resend 발송이 Production 에서 실제 성공한 기록.
- contact_inquiries 총 1건(2026-06-14) — 최초 구현 커밋 72e2e2b(06-14, Resend 발송 포함)과 동일 날짜. Owner 의 "개인 메일 수신 기억"과 시점 일치.
- 제거·비활성 이력 없음: 72e2e2b(생성) → 5c47135(디자인) → 90316c8(08-08, 발송부를 admin-email.ts 로 공용화 — 동작 유지).
- Supabase: contact_inquiries 트리거는 updated_at 뿐, DB webhook/Edge Function 0 → 구조 3 아님.
- legacy `src/app/api/contact/route.ts` + `src/lib/contact.ts` 는 Next 서버 시절 것 — 정적 export 에서 도달 불가(dead), 현행 경로는 Pages Function.

## Owner 확인 항목 (이번 감사에서 접근 불가)

1. `ADMIN_NOTIFICATION_EMAIL` 의 값이 현재도 유효한 본인 메일함인지(값은 secret — 감사에서 미열람).
2. Resend 대시보드 delivered/bounce 기록(API key 는 CF secret 이라 read 불가).
3. Cloudflare Email Routing 상태 — 현 API 토큰에 zone 권한이 없어 조회 불가.
   `support@gokoreamate.com` 은 **아직 존재가 확인되지 않았다** — 정책 반영 금지 유지.

## 목표 구조 대비 GAP

| 요구 | 현재 |
|---|---|
| DB 저장 SSOT·저장 후 발송·실패 비롤백 | 충족(waitUntil) |
| 발송 실패 확인 가능 | **contact 경로는 로그(console)뿐 — 원장 없음**(신고 경로만 원장). 개선 후보 |
| 중복 발송 방지 | contact 는 1요청 1발송(중복 여지 낮음)·신고는 UNIQUE 원장 |
| Reply-To | **미사용**(To=관리자 고정, 사용자 이메일은 본문에만 — 헤더 인젝션 여지 0). Reply-To 도입은 검증 추가 후 별도 승인 |
| 관리자 주소 서버 전용 | 충족(secret·번들 0) |
| 외부 공개 이메일(support@) | 미구성 — Owner 의 Email Routing 설정 필요 |

## Legal Task 연결

- 정책의 [실수신 이메일]·[삭제 접수 채널] 마커 **유지**(support@ 미구성·수신함 최종 확인 전).
- Owner 확인(위 1) 후에는 "앱 내 Contact Form(알림 포함)"을 즉시 정책에 반영 가능.
- `DRAFT — NOT FOR PRODUCTION` 유지.
