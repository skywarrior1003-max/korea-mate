# GoKoreaMate 제품·데이터 마감 후속작업 SSOT v1 (2026-09-05)

> **문서 지위**: Owner 확정 결정 기록 (TASK-GOKOREAMATE-PRODUCT-DATA-CLOSEOUT-SSOT-RECORD-V1).
> 원문: `GoKoreaMate_제품_데이터_마감_후속작업_SSOT_v1_2026-09-05.md` (Owner 전달본).
> 이 문서는 지금까지 Owner 와 최종 협의된 제품·데이터 마감 방향, 작업 우선순위,
> 후속 기능 방향, Owner 보고 규칙의 **최신 기준**이다.
>
> **SSOT 계층**: 제품 방향은 `home-discovery-external-ai-product-direction-ssot-v1.md`(LEVEL 1),
> Home UX 확정은 `home-ux-decision-ssot-v1.md`(LEVEL 2)가 유지된다. 이 문서는 그 위에서
> **작업 우선순위와 마감 기준을 정하는 최신 Owner 결정 레이어**이며, 겹치는 주제에서
> 이 문서가 더 최신의 Owner 결정이다. 이미 결정된 내용을 다시 OPEN 으로 만들지 않는다.
>
> **기록 주석(투명성)**: 원문 전달본 중 서두(제목·서문·전제 절)는 전달 과정에서 잘려
> §3 이후 본문만 원문 그대로 수신되었다. 서두의 확정 전제는 같은 태스크 지시문이
> "절대 누락 금지"로 명시한 Owner 확정 목록(아래 §1–§2)으로 기록했다. 본문(§3–§8)은
> Owner 전달 원문을 그대로 보존했다.

---

## 1. 현재 Production 상태 (기록 시점 사실)

- HOME / DISCOVERY / SOCIAL RELEASE: **PRODUCTION LIVE**
- SOCIAL ACTIONS FOUNDATION V1: **PRODUCTION LIVE** (060 = PRODUCTION APPLIED / CLOSED — 재실행 금지)
- Home = Quiet Travel Editorial(Cover→Floor), Anchored Inline Search, 5도시 공식 추천
  Trips/Places runtime 통합, Planner `/planner` 분리 — 모두 Production 반영 완료
- Planner 도시: **Busan ACTIVE · Gyeongju ACTIVE · Jeju ACTIVE / Seoul GATED · Jeonju GATED**
- Production master = `599c295` (Jeju Planner Activation 포함)

## 2. 데이터 전제·조사 원칙 (Owner 확정 — 절대 누락 금지 항목)

- **5도시 Final 데이터는 이미 수집·정리된 데이터라는 전제**로 작업한다.
- **Main 에서 장소 identity / fuzzy matching 을 처음부터 다시 하지 않는다.**
- **이미지는 거의 99% 보완되어 있다는 것이 Owner 전제**다.
- **홈페이지 미표시는 먼저 재수집이 아니라
  Final → Production → relation → API/runtime → UI 전파 누락으로 조사한다.**
- **동궁과 월지 대표이미지 = Owner 지정 경주 공식 야경 이미지로 고정**한다.

---

## 3. P0 작업

### P0-1. 5도시 Final 데이터 반영 마감

확인 대상은 기존 수집 항목 그대로:

- 이미지
- 4언어 제목·설명
- 운영정보
- 공식 URL
- source
- 추천 코스
- 추천 장소
- Events
- Travel Essentials

새 데이터 수집 작업으로 확대하지 않는다.
장소 identity를 다시 판정하지 않는다.

이 단계가 끝나야 "5도시 데이터 작업 완료"라고 판단한다.

### P0-2. City Hub 콘텐츠 완성

첫 Home이 아니라 각 지역 페이지에 들어간 뒤의 City Hub가 대상이다.

현재 첫 Home의 감성과 구성은 유지한다.

City Hub에는 기존 추천 콘텐츠에 이어 다음을 실제 수집 데이터와 연결한다:

Recommended Trips
→ Recommended Places
→ Events
→ Travel Essentials
→ Explore

**Events**

각 지역 공식 원천을 매주 확인한다.

확인·반영 대상:

- 추가
- 변경
- 취소
- 종료
- 삭제

**Travel Essentials**

이미 지역별로 수집한 다음 정보를 실제 지역 페이지에서 확인 가능하게 한다:

- 교통패스
- 여행가방 보관
- 관광안내
- 이동 정보
- 기타 지역 여행 편의정보

**City Hub 시각 방향**

첫 Home을 바꾸는 것이 아니다.
지역 페이지부터 너무 힘없이 보이는 부분은 기존 gokoreamate의 Blue 계열을 살려 정리한다.

### P0-3. Story 실제 구현 상태 감사 및 정상화

현재 Story가 이미 정한 제품 방향대로 실제 작동하는지 확인하고 정상화한다.

My Trip에서 일정만 진행했더라도 Story가 성립해야 한다.
개인 사진이 없으면 장소 대표사진을 사용한다.

확인 대상:

- 여행 제목
- 메모
- Day
- 시간
- 장소
- 장소 대표 이미지
- 사용자 사진
- 일정 순서
- 이동
- 경로 지도
- 지도 위 사용자 사진 또는 대표사진
- Story 연결

사진은 직접 촬영하거나 갤러리에서 추가할 수 있어야 한다.

**AI 제목·메모 글 방향 — 3가지로 고정**

1. 절제된 담담하고 부담스럽지 않은
2. 유머와 재치, 센스
3. 감성적인

사용자가 원하는 방향을 선택한다.
AI가 제목과 메모를 제안하고 사용자가 직접 수정할 수 있다.

기존 원칙:

- 사진
- 장소의 정체성
- 그 순간의 맥락

을 바탕으로 한다.
여행 앞뒤 일정을 자동으로 끼워 넣는 기계적인 설명을 만들지 않는다.

### P0-4. Official Recommended Trip과 Story를 같은 여행 표현 체계로 정리

현재 공식 추천 코스가 제목·시간·짧은 설명만 나열되는 상태는 그대로 두지 않는다.

Official Recommended Trip과 개인의 My Trip → Story는 출처는 다르지만
느낌과 기능이 서로 다른 별개 제품처럼 보이면 안 된다.

장기적으로:

- 현재는 지역 관광기관의 공식 추천 코스가 중심
- 이후에는 개인이 실제 여행해서 만든 Story/추천 코스가 공식 코스와 함께 추천되거나
  더 큰 비중을 차지할 수 있음

따라서 가장 세련되고 기능적으로 우리가 원했던 여행 표현 방식을 공통으로 사용한다.

공통 표현의 핵심:

- 사진
- 장소
- 일정 흐름
- 이동
- 지도
- Story 방향

출처/provenance는 다르게 표시할 수 있지만 여행을 보여주는 느낌과 기능은 분리하지 않는다.

---

## 4. P1 작업

### P1-1. Home에서 필요한 부분만 수정

Home 전체 재디자인은 하지 않는다.

**수정 대상**

현재 화면에서 검색 UI 아래의 섹션 제목 "도시"가 일부 잘려 보이는 문제를 수정한다.
검색 UI와 다음 섹션 사이의 간격/레이어 문제다.

**수정 대상이 아닌 것**

부산 / 서울 / 제주도 등 도시 카드 안의 도시명은 현재 잘 보이며 수정 대상이 아니다.

**Home 검색 + URL Import 최종 결정**

상단에 URL용 새 검색창이나 새 입력창을 만들지 않는다.

현재 Home에 이미 있는 큰 Search 하나를:

- 일반 검색
- URL 붙여넣기

두 기능의 단일 입력창으로 확장한다.

일반 검색어:
부산 / 해운대 / 경복궁 등
→ 기존 Cities / Trips / Places 검색

URL:
→ URL Import로 자동 인식
→ 내용 분석
→ Preview
→ 적절한 여행 흐름으로 가져오기

사용자에게 "검색인지 URL인지" 별도 선택시키지 않는다.

URL 결과 흐름:

- GoKoreaMate 공유 여행 URL → + My Trip
- 외부 일정 URL → Preview 후 여행으로 가져오기
- 단일 장소 URL → Preview 후 Saved
- 여러 장소가 있는 여행글/블로그 → Preview 후 선택하여 This Trip

URL을 붙였다고 즉시 저장하지 않고 Preview를 거친다.

Picks > This Trip에도 URL 가져오기 진입을 둔다.

정리:

- Home = 기존 검색창 하나에서 검색 또는 URL 가져오기
- This Trip = 여행 구성 중 URL 가져오기
- Home 상단에 별도 URL 검색창/입력창 추가 안 함

### P1-2. First Trip Journey Guide — "뽕뽕"

기능 3~4개를 설명하는 튜토리얼이 아니다.

처음 방문한 사용자가 GoKoreaMate에서 여행 하나를 처음부터 끝까지
고민 없이 경험하도록 돕는 Contextual Journey Guide다.

원칙:

- 강제 클릭 없음
- 한꺼번에 여러 안내를 띄우지 않음
- AI가 사용자의 의도나 "지금 새 장소를 발견했다" 같은 시점을 추론하지 않음
- 사용자가 해당 화면을 처음 사용할 때 그 화면의 핵심 행동을 알려줌
- 이미 본 안내는 반복하지 않음
- 첫 방문자에게 자동 안내
- 재방문자에게 자동으로 처음부터 반복하지 않음

**Journey 흐름**

추천 코스/장소
→ 저장 안내

Picks > Saved
→ 저장한 장소 확인

Saved → This Trip
→ 이번 여행에 갈 곳 선택

This Trip with AI
→ 내가 선택한 장소와 AI가 함께 여행 동선을 만든다는 의미
→ with AI와 뽕뽕은 따뜻한 Orange 계열

Planner
→ 날짜/속도
→ 수정
→ 장소 추가/제거/순서 변경
→ 일정 만들기

My Trip 첫 이용
→ 일정 상세/수정
→ 장소 추가
→ 네이버/Google 지도 길찾기
→ 사진 촬영 또는 갤러리에서 추가
→ AI 제목·메모 3가지 스타일 선택
→ Story

**My Places 안내**

My Places에서는 다음 의미를 알려준다:

"기억하고 싶은 나만의 장소를 만들고 저장하고 공유할 수 있다."

My Places는:

- 직접 발견한 나만의 장소를 만들고
- 사진과 메모를 남기고
- 여행에 이용하고
- 공유할 수 있는

GoKoreaMate의 중요한 기능으로 본다.

**튜토리얼 종료/재사용**

첫 Journey가 끝나면 더보기(...) 위치를 알려주고:

- 튜토리얼 ON/OFF
- 튜토리얼 다시 보기

가 있다는 것을 알려준 뒤 종료한다.

### P1-3. Shared Story 경험

공유를 "카드 → 클릭 → 무조건 GoKoreaMate로 이동"만 하는 구조로 끝내지 않는다.

공유된 여행을 열면 Story 자체를 먼저 볼 수 있게 한다.

방향:

- 인스타 사진 갤러리처럼 여러 장의 Story를 바로 볼 수 있음
- 공개된 Story라면 전체를 볼 수 있어도 됨
- Story 안에서 + My Trip, 장소 저장 등 여행 행동으로 이어짐
- 좋은 콘텐츠를 숨겨서 사이트 방문을 강요하지 않음
- Story 자체가 공유 콘텐츠가 됨

공유 Story의 정확한 몇 장 노출 같은 세부 수치는 아직 고정하지 않는다.

### P1-4. Blog 가독성 + 4언어

Blog를 읽기 좋은 콘텐츠 화면으로 정리한다.

추천 여행/Story와 같은 GoKoreaMate 서비스 안에 있다는 느낌을 유지한다.

현재 Blog에서 언어 변환이 안 되는 문제를 수정한다.

지원 언어:

- EN
- KO
- JA
- ZH

---

## 5. P2 작업

### P2-1. External URL Import

UI 원칙은 P1-1에서 이미 고정한 대로:

- Home 기존 Search = Search + URL Import
- Picks > This Trip = URL Import 별도 진입
- 상단에 새로운 URL 검색창을 만들지 않는다.

외부 URL 분석/가져오기 엔진 자체의 구현은
데이터/Story/핵심 화면이 안정된 뒤 진행한다.

---

## 6. Planner 도시 활성화

현재:

- Busan: ACTIVE
- Gyeongju: ACTIVE
- Jeju: ACTIVE
- Seoul: GATED
- Jeonju: GATED

**Seoul**

인천공항 시작점 문제를 먼저 해결한 뒤 활성화한다.
단순히 default만 바꾸고 끝내지 않고, 사용자가 인천공항을 직접 선택했을 때도
일정이 붕괴하지 않는지 확인한다.

**Jeonju**

이미지가 없다고 다시 수집하지 않는다.
P0-1 Final → Production → UI 감사에서 기존 Final 이미지가 실제로 반영되는지를
먼저 확인한 뒤 활성화한다.

---

## 7. 실행 순서 요약

**P0**

1. 5도시 Final 데이터 반영 마감
2. City Hub Events / Travel Essentials 연결
3. Story 정상화
4. Official Trip / Story 공통 여행 표현

**P1**

5. Home 필요한 부분만 수정
6. First Trip Journey Guide
7. Shared Story
8. Blog + 4언어

**P2**

9. External URL Import

**이후**

10. Seoul Planner
11. Jeonju Planner

---

## 8. 새 아이디어·버그 발견 시 Owner 보고 규칙 — 필수

앞으로 Claude/개발방/검토방이 작업 중 다음을 발견하면:

- 좋은 아이디어
- 숨은 버그
- 제품 개선 기회
- 데이터 누락/반영 오류
- 보안·비용·성능 위험
- 기존 합의와 실제 구현의 충돌
- 기술 부채

**명시적으로 승인된 task scope 밖에서 임의로 수정·확장 구현하지 않는다.**

반드시 완료보고서 마지막 부분에 별도 항목:

**OWNER ATTENTION — 발견 사항**

으로 적극 보고한다.

각 발견은 최소 다음을 포함한다:

- 무엇을 발견했는지
- 왜 중요한지
- 현재 영향
- 지금 수정이 필요한지
- 가능한 선택지
- 추천안

Owner가 결정하기 전 제품 의미나 범위를 임의로 변경하지 않는다.

> **강조: 발견했다고 마음대로 고치지 않는다.
> 하지만 좋은 아이디어나 중요한 문제를 발견하고도 그냥 지나치지 않는다.
> 반드시 Owner에게 적극적으로 알린다.**

이 규칙은 향후 **모든 작업의 공통 실행 원칙**이다.
