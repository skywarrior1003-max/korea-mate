# gokoreamate Production 배포

작성일 2026-08-15 · 대상 `gokoreamate.com`

배포 경로를 몰라서 같은 커밋을 두 번 올리거나, 이미 올라간 것을 다시 올리는 일이
있었다. 그래서 지금 확인된 사실만 적어 둔다.

## 확인된 구성

- Platform: **Cloudflare Pages** (project `korea-mate`)
- Production branch: **`master`**
- Production 도메인
  - `gokoreamate.com`
  - `www.gokoreamate.com`
  - `korea-mate.pages.dev`
- Cloudflare Pages 화면에 **`자동 배포 사용됨`** 표시

## 기본 경로

```
검증 완료  →  commit  →  master push  →  Cloudflare 자동 Production 배포  →  확인
```

**`master` push 가 기본 Production 반영 경로다.** 검증이 끝난 커밋을 push 하면
Cloudflare 가 빌드해서 Production 으로 올린다.

## 반영 확인 방법

두 가지를 함께 본다.

1. Cloudflare Pages 의 Production Source — branch 와 commit, 그리고 상태
2. 실제 `gokoreamate.com` 의 **동작**

정적 asset 이름(청크 해시)만으로 판단하지 않는다. 실측에서 이 방법은 틀렸다 —
바뀐 화면이 초기 HTML 에 없는 청크에서 로드되면 해시가 그대로여도 코드는 이미
새것이다. 반대의 경우도 있다. **바뀐 동작을 직접 확인하는 편이 빠르고 정확하다.**

## `*.korea-mate.pages.dev` 는 Preview 표시가 아니다

배포마다 고유 주소(`https://<hash>.korea-mate.pages.dev`)가 생긴다.
**그 주소가 있다는 사실만으로 Preview 라고 판단하지 않는다.**
Cloudflare 에서 그 deployment 의 **Environment 가 `Production` 인지** 본다.

## `npm run deploy`

```
npm run deploy = build:static && wrangler pages deploy out --project-name=korea-mate
```

정상적인 개발 완료 작업에서 **`git push` 와 `npm run deploy` 를 습관적으로 함께
실행하지 않는다.** 자동 배포가 이미 도는데 CLI 로 한 번 더 올리면 같은 코드가
두 벌 올라간다.

수동 CLI 배포는 다음일 때만 쓴다.

- 자동 배포가 실패했거나 돌지 않을 때
- 수동 배포가 명시적으로 필요한 상황

그때도 **사용자 승인**과 **배포 대상 commit 확인**을 먼저 한다.

## 하지 않는 것

- Cloudflare 설정 변경 (Git 연동 · production branch · 커스텀 도메인)
- secret 값 조회·출력·기록

> Production history 에 같은 commit 이 두 번 있는 사례가 관측됐다. 자동 배포와
> CLI 배포가 겹친 것으로 보이지만, 화면만으로 어느 줄이 어느 쪽인지 확정하지는
> 못했다. 추정으로 적지 않는다.

관련: 보안 설정 운영은 [`cloudflare-security-operations.md`](../automation/cloudflare-security-operations.md).
