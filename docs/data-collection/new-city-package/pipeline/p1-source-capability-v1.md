# P1 SOURCE_CAPABILITY — Phase Instruction

## Phase 목표
신규 도시에서 사용 가능한 data source를 조사하고 각 Phase별 primary/fallback source를 결정한다.
이 Phase가 PASS하기 전 Core 수집 시작 금지.

## 허용 입력
- 도시 공식 관광 웹사이트
- 한국관광공사(KTO) API/데이터셋
- TourAPI4 endpoints
- 광역/기초지자체 공개 관광 DB

## 필수 출력 (checkpoint)
각 source role별로 아래 항목 기록:

| Role | 설명 |
|------|------|
| PLACE_PRIMARY | 비음식 장소 주요 수집처 |
| FOOD_PRIMARY | 음식점 주요 수집처 |
| EVENT_PRIMARY | 이벤트/축제 주요 수집처 |
| MULTILINGUAL_SOURCE | EN/JA/ZH 공식 번역 제공처 |
| IMAGE_SOURCE | 공식 이미지 제공처 |
| REGIONAL_SOURCE | 교통/여행 정보 제공처 |
| FALLBACK_SOURCE | KTO/TourAPI 보조 수집처 |

각 source마다:
- provider, official/public, URL/API, source_id_key, locale_capability, image_capability, access_status

## STOP 조건 (HOLD 보고)
- 모든 source가 403/차단 또는 없음
- 공식 source가 재사용 금지 명시
- KTO 연동 불가

## 금지 행위
- 실제 대규모 수집 시작
- unofficial scraping (robots.txt 금지 위반)
- personal/private 데이터 수집

## checkpoint 완료 후
```bash
python scripts/city-pipeline-v1.py advance <slug> --phase P1 --status PASS \
  --checkpoint data/city-packages/<slug>/checkpoints/p1-checkpoint.json
```

## PASS 기준
- PLACE_PRIMARY, FOOD_PRIMARY source 각 1개 이상 확인
- source_id_key 형식 결정
- KTO 연동 가능 여부 확인
