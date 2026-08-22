# P3 NONFOOD — Phase Instruction

## Phase 목표
관광지·자연·문화·쇼핑 등 여행 목적 비음식 장소를 수집·정제한다.

## 허용 입력
- P1 SOURCE_CAPABILITY checkpoint의 PLACE_PRIMARY source
- KTO TourAPI (type12 관광지, type14 문화시설, type15 축제공연행사 제외, type28 레저스포츠, type38 쇼핑)
- 도시 공식 관광 DB

## 허용 category
- attraction (관광지/문화시설)
- nature (자연/경관)
- shopping (쇼핑)
- ※ restaurant → P2 FOOD, event → P4 EVENT

## 필수 추적 필드 (per record)
- canonical_id (deterministic)
- source_key / source_type
- service_status
- category (attraction | nature | shopping)
- name_ko
- lat, lng (arrival-point 의미의 좌표)
- address
- description_ko
- image_url, image_provenance
- nav_readiness (NAV_READY | NOT_READY)

## checkpoint 필수 필드 (→ P8 집계 대상)
P2 FOOD와 동일 구조. `_phase: "P3"`.  
`category_counts`에 attraction/nature/shopping 포함.

## STOP 조건 (HOLD)
- 일반 숙박시설(모텔·호스텔)을 Place로 대량 포함 시도
- entity 중복 미해결

## 금지 행위
- accommodation을 Place category로 무분별 분류
- lat/lng = 건물 중심점을 NAV_READY로 자동 처리
- food 장소를 이 Phase에 포함

## PASS 기준
- universe arithmetic_valid = true
- canonical_id_duplicate_count = 0
- NAV 가능 장소 명시적 tag
