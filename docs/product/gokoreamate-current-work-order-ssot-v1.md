# gokoreamate Current Work Order SSOT v1 (2026-09-07)

Owner 확정 작업 순서. 직전 우선순위 SSOT(`gokoreamate-product-data-closeout-priority-ssot-v1.md`,
2026-09-05 — P0 트랙은 전부 CLOSED)를 승계하는 현재 순서다.
Claude 가 발견한 tech debt·아이디어는 Owner 승인 없이 이 순서에 삽입하지 않는다
(발견은 보고서 OWNER ATTENTION 으로만 올린다).

## 순서

1. **AI 기반 마감**
   - Gemini 서울 Placement Worker 안정 통로 (`gokoreamate-ai-writing`, `gcp:asia-northeast3`)
   - My Trip AI writing: 3방향 × KO/EN/JA/ZH × 저장 → Story — Production 최종 LIVE PASS 확정
   - V2 AI Personalization Production 활성화 (`AI_PERSONALIZATION_MODE=production-live`)
2. **Shared Story**
3. **Blog** — EN/KO/JA/ZH 콘텐츠·언어전환
4. **External URL Import 실제 엔진**
5. **Seoul Planner**
6. **Jeonju Planner**

## 별도 정리 (본선 순서 밖)

- legacy V1 `functions/api/generate-itinerary.ts` 는 본선 우선순위가 아니다.
  전용 게이트(`LEGACY_ITINERARY_AI_MODE`, 미설정 = 410)로 격리되어 있다.
  **V2 AI Personalization PASS 후 참조 0/필요성 확인을 거쳐 삭제 여부를 Owner 가 판단한다.**

## V2 Planner 제품 계약

```
Rule Scheduler → Gemini 취향 profile/weight → Rule constraints
```

- Gemini 는 전체 일정을 자유 생성하지 않는다. 프로필(가중치)만 만든다.
- 시간/거리/도착·출발/실행가능성 등 최종 제약은 Rule 이 지킨다.
- 호출은 여행당 정확 1회·재시도 0·실패 시 profile null → 순수 Rule 결과(사용자 무해).
- provider 호출은 서울 Worker `/provider` 경유(HKG ingress 지역 차단 회피).

## My Trip AI writing 계약

- 현재 UI locale 자동 사용(언어를 묻지 않는다): KO/EN/JA/ZH.
- 방향은 정확히 3개: 절제된 담담하고 부담스럽지 않은 / 유머와 재치, 센스 / 감성적인.
- 대상은 title/memo. **My Trip 이 원본**이고 저장된 내용이 Story 에 동일 반영된다(별도 Story AI 없음).
