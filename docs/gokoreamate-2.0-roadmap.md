# GoKoreaMate 2.0 — 개발 로드맵

> 작성일: 2026-06-17  
> 목적: 운영 코드 수정 금지. GoKoreaMate 2.0 구현 순서와 역할 분담 기준 문서.

---

## 1. 개발 단계별 순서

| 단계 | 작업 | 설명 |
|------|------|------|
| 0 | restaurants dbae010 운영 반영 확인 | 현재 master 최신 커밋 상태 검증 후 진행 |
| 1 | GoKoreaMate 2.0 정보구조 확정 | 메뉴, 화면 구조, UX 흐름 최종 결정 |
| 2 | 데이터 모델 확장 설계 | places, trip_sessions, likes 등 기존 테이블 확장 설계 |
| 3 | Events 구조 추가 | events, event_sources 테이블 설계 및 migration |
| 4 | Trip Moments / GPS 저장 구조 추가 | trip_moments, custom_spots 테이블 추가 |
| 5 | place_media / media_licenses 설계 | 미디어 라이선스 관리 구조 추가 |
| 6 | Home 개편 | Hero / Quick Start / Trip Mood 등 신규 섹션 구현 |
| 7 | Explore 개편 | 카테고리 탭 및 필터 개선 |
| 8 | Korea Ready 추가 | 제휴 링크 허브 페이지 신설 |
| 9 | Story Routes 추가 | route_templates 기반 테마 루트 페이지 |
| 10 | Near Me 2.0 | 지도 UI 개선 및 실시간 위치 연동 강화 |
| 11 | My Trip 개편 | 일정 관리 + Trip Moments 통합 UI |
| 12 | Trip Story Card 1단계 | 9:16 캡처 카드 UI 구현 (AI 이미지 생성 없이 시작) |
| 13 | 규칙 기반 Scheduler | 날짜/취향/좋아요 기반 정적 규칙 일정 생성 |
| 14 | AI Scheduler 재설계 | 검증된 데이터 기반 Gemini 연동 일정 생성 개선 |

---

## 2. 장비 / AI 역할 분담

| 역할 | 담당 | 설명 |
|------|------|------|
| 노트북 | 자동 개발 공장 | feature branch 코드 자동 생성 및 초안 작업 |
| 데스크탑 | 관제탑 / 검수소 | 최종 검토, 승인, merge 결정 |
| Hermes | 설계와 데이터 모델 초안 | 구조 설계 및 문서 초안 생성 |
| Qwen | UI 컴포넌트 초안 | 컴포넌트 코드 초안 생성 |
| Claude Code | 실제 코드 반영과 검증 | 코드 적용, 타입체크, 빌드 검증 |
| GitHub | 진짜 중앙 기준 | 모든 코드의 단일 원본 |
| project_state.json | AI용 작업 메모 | 세션 간 작업 상태 공유 (비밀키 포함 금지) |
| Cloudflare | 승인 후 배포 | 사람이 승인한 이후에만 배포 |

---

## 3. 자동화 원칙

| 원칙 | 내용 |
|------|------|
| 현재 추천 자동화 수준 | **70~80%** |
| 완전 자동 production 배포 | **현재 비추천** |
| feature branch 자동 개발 | 가능 (노트북에서 진행) |
| 최종 push / merge / deploy | **반드시 사람 승인 후 진행** |

---

## 4. 절대 금지사항

아래 사항은 어떠한 상황에서도 자동으로 실행하지 않습니다.

| 금지 항목 | 이유 |
|-----------|------|
| 직접 PG 결제 | 결제는 공식 제휴 링크로만 연결 |
| 로그인 강제 | 비로그인 사용자도 핵심 기능 사용 가능해야 함 |
| AI가 자유롭게 장소 생성 | 검증된 places 데이터만 AI 입력으로 사용 |
| Gemini live 호출 | 개발/테스트 환경에서는 mock 사용 |
| 무단 이미지 수집 | 라이선스 없는 이미지 수집 및 저장 금지 |
| 사용자 사진 즉시 공개 | 사용자 업로드 사진은 기본 private |
| 정확한 GPS 기본 공개 | 위치 공유 수준은 사용자가 선택 |
| 모든 도시 동시 확장 | 도시별 단계적 확장, 동시 다도시 금지 |
| 지도 API 전면 교체 | 기존 지도 연동 안정성 유지 |
| 광고 배너 남발 | Korea Ready는 여행 도움말 형태로만 노출 |

---

## 5. 현재 기준점

- **최신 master 커밋**: `dbae010` — Refine restaurant image placeholder design
- **0단계 확인 조건**: restaurants 기능이 production에서 정상 작동하는지 확인 후 1단계 진행

---

*이 문서는 코드 변경 없이 개발 순서 기준만 정의합니다. 각 단계 진행 전 데스크탑(관제탑)의 승인이 필요합니다.*
