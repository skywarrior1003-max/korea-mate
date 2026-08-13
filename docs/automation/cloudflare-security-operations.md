# Cloudflare 보안 설정 운영 규칙

작성일 2026-08-13 · 대상 zone `gokoreamate.com`

Cloudflare 설정은 잘못 건드리면 사이트가 통째로 막히거나, 반대로 막고 있던 것이 조용히 열린다. 그리고 되돌리기 전까지 아무도 모른다. 그래서 무엇을 바꿀 수 있는지를 문서가 아니라 **코드로** 못 박아 둔다.

구현: `src/lib/ops/cloudflare-security-core.ts` (순수 규칙) · `scripts/cloudflare-security-read.ts` (조회) · `scripts/cloudflare-security-apply.ts` (변경)

---

## 1. 자격 증명은 역할별로 분리한다

| 환경변수 | 역할 | 하는 일 |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | Pages 배포 | Pages project 조회·배포. **WAF 관리로 확대하지 않는다** |
| `CLOUDFLARE_SECURITY_READ_TOKEN` | 보안 조회 | zone·plan·WAF·Rate Limiting 조회. **절대 쓰기에 쓰지 않는다** |
| `CLOUDFLARE_SECURITY_WRITE_TOKEN` | 보안 변경 | 오너가 승인한 변경 TASK **에서만** |

**다른 역할의 토큰으로 대신하지 않는다.** 쓰기 토큰이 없다고 배포 토큰을 끌어다 쓰면 분리한 의미가 없다 — 그건 분리가 아니라 이름만 바꾼 것이다.

## 2. secret 값은 어디에도 나오지 않는다

토큰 값·일부·길이·hash·Authorization 헤더·`.env.local` 내용을 코드·로그·보고서·commit 어디에도 출력하지 않는다. 보고할 수 있는 것은 `AVAILABLE` / `UNAVAILABLE` 뿐이다.

## 3. 읽기와 쓰기는 다른 파일이다

조회 도구에는 `POST`·`PATCH`·`PUT`·`DELETE`를 보낼 방법 자체가 없다. 조건에 따라 바꾸는 구조를 만들면 언젠가 그 조건이 참이 된다.

## 4. 변경은 네 개의 문을 모두 통과해야 한다

1. **전용 쓰기 토큰** — 없으면 즉시 중단
2. **`--apply`** — 없으면 dry-run. 기본은 아무것도 바꾸지 않는 쪽이다
3. **`--confirm=CLOUDFLARE-SECURITY-CHANGE-APPROVED`** — 오타는 통과하지 못한다
4. **정확한 대상** — zone 은 `gokoreamate.com` 하나, 규칙은 이름으로 명시. `*`·`all`·빈 값 금지

## 5. 있던 규칙은 건드리지 않는다

신규 규칙 추가 TASK에서 기존 규칙의 수정·삭제·순서 변경은 **금지**다.
기존 규칙 **수정**은 `--update-approved`, **삭제**는 `--delete-approved`가 있어야 하며, 그 플래그는 오너가 그 TASK에서 명시적으로 승인했을 때만 붙인다.

> "정리", "cleanup", "중복 제거"는 삭제의 이유가 되지 않는다.

## 6. 바꾸기 전과 후를 찍어 비교한다

`BEFORE snapshot → 승인 대상 확인 → 최소 횟수 mutation → AFTER snapshot → diff 판정` 순서다.

snapshot에는 rule id·name·expression·action·threshold·period·enabled·순서만 담고 credential은 담지 않는다.

**승인한 것 말고 뭔가 달라졌으면 `FAIL`이다.** "새 규칙 1개 추가"를 승인했는데 기존 규칙 하나가 함께 바뀌었다면 그건 부작용이 아니라 우리가 이해하지 못한 변경이다. 그 자리에서 mutation을 더 하지 않는다.

## 7. 이 도구가 다루지 않는 것

DNS · 도메인 삭제 · 커스텀 도메인 · Pages project 삭제 · Pages 배포 · 환경변수 · secret · Worker 삭제 · 계정/멤버 · billing/plan · 토큰 생성·삭제·rotation · 다른 zone.

토큰이 기술적으로 더 많은 것을 허용해도 도구가 거부한다.

## 8. Production AI 활성화는 별개다

WAF 설정 TASK에서 `AI_PERSONALIZATION_MODE`나 Gemini production-live를 켜지 않는다. 순서는 이렇다.

```
Rate Limit 설계 → 오너 승인 → Rate Limit 생성 → READ 재검증
→ 429/fallback 검증 → 오너 최종 확인 → 별도 Production AI rollout TASK
```

## 9. 오너가 만들 토큰의 최소 권한

Cloudflare 대시보드 → My Profile → API Tokens → Create Token → Custom token.

**READ 토큰**
- `Zone` → `Zone` → **Read**
- `Zone` → `Zone WAF` → **Read**
- (선택) `Zone` → `Analytics` → **Read** — traffic baseline 확인용
- Zone Resources: **Include → Specific zone → `gokoreamate.com`**

**WRITE 토큰**
- `Zone` → `Zone` → **Read**
- `Zone` → `Zone WAF` → **Edit**
- Zone Resources: **Include → Specific zone → `gokoreamate.com`**

두 토큰 모두 `Account` 권한은 넣지 않는다. Pages 배포 토큰과 합치지 않는다.
값은 `.env.local`에만 두고, 대화·보고서·commit에 붙여넣지 않는다.
