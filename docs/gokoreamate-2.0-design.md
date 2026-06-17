# GoKoreaMate 2.0 — 서비스 설계 문서

> 작성일: 2026-06-17  
> 목적: 운영 코드 수정 금지. GoKoreaMate 2.0 구현을 위한 기준 설계 문서.

---

## 1. 서비스 정의

GoKoreaMate는 외국인이 한국을 방문할 때 겪는 언어, 지도, 교통, 결제, 일정, 현지 정보 부족 문제를 해결하는 **AI 기반 한국 여행 플랫폼**입니다.

단순 맛집/명소 사이트가 아니라, 사용자의 여행 날짜, 도착시간, 출발시간, 현재 위치, 취향, 좋아요, 선택 장소, 지역 행사, 나만의 추억을 기반으로 여행 일정을 만들고, 필요한 예약 링크와 저장·공유 기능까지 연결하는 **한국 여행 실행 플랫폼**입니다.

---

## 2. 핵심 구조

```
GoKoreaMate 2.0
=
AI Scheduler
+ Near Me Map
+ Explore & Events
+ Story Routes
+ Korea Ready Affiliate Hub
+ My Trip & Trip Moments
+ Trip Story Card
```

---

## 3. 최종 메뉴 구조

| 번호 | 메뉴 | 설명 |
|------|------|------|
| 1 | Home | 여행 바로 시작 화면 |
| 2 | Plan My Korea Trip | AI 기반 일정 생성 |
| 3 | Near Me | 현재 위치 기반 지도 |
| 4 | Explore | 카테고리별 탐색 |
| 5 | Events | 날짜 기반 행사 정보 |
| 6 | Story Routes | 테마별 여행 루트 |
| 7 | Korea Ready | 여행 준비 제휴 허브 |
| 8 | My Trip | 내 일정 및 추억 |
| 9 | Share Trip | 여행 카드 공유 |
| 10 | Contact / Partner | 문의 및 파트너 제안 |

---

## 4. Home 화면 방향

Home은 단순 목록 입구가 아니라 **외국인이 한국 여행을 바로 시작하는 화면**이어야 합니다.

| 섹션 | 역할 |
|------|------|
| Hero | 핵심 가치 메시지 + CTA |
| Quick Start | 날짜 입력 → Plan My Trip 진입 |
| Trip Mood | 취향 선택 (먹방 / 힐링 / K-POP / 도심 탐방 등) |
| Korea Ready | eSIM / 교통 / 투어 바로가기 |
| Happening Soon | 곧 열리는 행사 미리보기 |
| Story Routes | 추천 테마 루트 |
| Popular Now | 인기 장소 |
| Share Preview | 사용자 Trip Story Card 샘플 |

---

## 5. Explore 구조

| 카테고리 |
|----------|
| Food |
| Places |
| K-POP |
| Events |
| Walking |
| Culture |
| Stay |
| Shopping |
| Rainy Day |

---

## 6. Events 설계

Events는 단순 카드가 아니라 **날짜 기반 핵심 여행 데이터**입니다.

### 핵심 원칙

- 방문 날짜와 행사 날짜가 겹치면 **"Happening during your trip"** 으로 추천
- 사용자가 선택한 날짜에 고정된 행사는 AI Scheduler에서 우선 반영
- 날짜가 지난 행사는 `display_until` 기준으로 기본 목록에서 자동 숨김
- 저장된 일정 안의 지난 행사는 **Past Event**로 표시

---

## 7. My Trip / Trip Moments 설계

My Trip은 단순히 "Add to Itinerary"한 장소 목록이 아니라 **사용자의 여행기 원본 데이터**가 되어야 합니다.

### Trip Moments 기능

| 기능 | 설명 |
|------|------|
| 나만의 장소 추가 | custom_spots 테이블 연동 |
| 사진 추가 | photo_url 저장, EXIF 위치 정보 제거 |
| 코멘트 추가 | 자유 텍스트 |
| GPS 위치 저장 | lat/lng + gps_accuracy_m |
| 지도 핀 수정 | 사용자가 직접 위치 조정 |
| 나중에 Google/Naver Maps로 열기 | 딥링크 제공 |
| 공유 카드 포함 여부 선택 | include_in_share_card 필드 |

### GPS 정책

| 원칙 | 내용 |
|------|------|
| 목적 | GPS는 정확한 주소 보증이 아니라 사용자가 다시 찾아갈 수 있는 **추억의 힌트**로 사용 |
| 기본 공개 범위 | private |
| SNS 공유 시 | 정확한 위치는 기본 숨김 |
| 공유 위치 수준 | `hidden` / `neighborhood` / `exact` |
| 사진 업로드 | EXIF 위치 정보 제거 필수 |

---

## 8. Korea Ready 수익화 설계

광고 배너가 아니라 **외국인에게 필요한 여행 준비 도움말처럼** 보여야 합니다.

### 제공 항목

| 항목 |
|------|
| eSIM |
| 교통 / 공항 픽업 / KTX |
| 액티비티 / 투어 |
| 숙박 |
| 지도 사용 팁 |
| 결제 / 전화번호 인증 팁 |

### 수익화 우선순위

| 순위 | 항목 |
|------|------|
| 1 | eSIM |
| 2 | 액티비티 / 투어 |
| 3 | 숙박 |
| 4 | 교통 / 공항 픽업 |
| 5 | 지역 파트너십 |
| 6 | 광고 |

---

## 9. Trip Story Card 설계

Trip Story Card는 **바이럴 핵심 기능**입니다.

초기에는 고급 이미지 생성 엔진보다 **캡처 가능한 9:16 카드 UI**부터 시작합니다.

### 포함 항목

| 항목 |
|------|
| My 2026 Busan Trip (제목) |
| 도시 |
| 날짜 |
| 대표 장소 |
| Trip Moments 사진 |
| 사용자 코멘트 |
| gokoreamate.com 링크 |

---

*이 문서는 코드 변경 없이 설계 기준만 정의합니다. 구현은 roadmap 순서에 따릅니다.*
