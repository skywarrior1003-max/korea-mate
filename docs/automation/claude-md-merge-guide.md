# CLAUDE.md 병합 안내서

> 보조 컴퓨터(research 브랜치)의 CLAUDE.md와 자동화 문서를 메인 노트북에 통합할 때 적용한다.

---

## 1. 기본 원칙

- **메인 노트북의 CLAUDE.md를 기준본**으로 사용한다.
- 보조 CLAUDE.md 전체 덮어쓰기 금지.
- 단순 이어붙이기 금지.
- 메인의 개발·보안·DB·배포 규칙은 반드시 유지한다.

---

## 2. 보조 CLAUDE.md에서 이식할 항목

아래 항목만 선택적으로 메인 CLAUDE.md에 추가한다.

| 항목 | 내용 |
|------|------|
| 데이터 작업 안전 원칙 | `scripts/`, `data/`, `docs/` 범위 데이터 작업 규칙 헤더 |
| Git 안전 규칙 | 명시적 승인 Git만 허용 / `git add .`·`-A` 금지 / `master` force push 금지 |
| 항상 금지 보완 | 운영 DB·`src/`·비밀값·외부 서비스 (메인에 없는 경우만) |
| 문서 네비게이션 테이블 | docs/automation/ 4개 문서 읽기 조건 (nightly-rules·data-source·image-curation·photo-gallery) |

**동일 규칙이 메인에 이미 있으면 중복 추가 금지.**

---

## 3. 그대로 병합 가능한 파일

동일 경로가 메인에 없으면 그대로 복사한다. 있으면 diff 후 최신 규칙만 통합한다.

```
docs/automation/nightly-execution-rules.md
docs/automation/data-source-priority.md
docs/automation/image-curation-rules.md
docs/automation/photo-gallery-rules.md
data/tourapi-nightly-config.json
```

---

## 4. 충돌 해결 우선순위

1. 실제 운영 코드와 적용 상태
2. 메인 최신 보안·DB·배포 규칙
3. 사용자의 최신 확정 결정
4. 보조 자동화 문서
5. 오래된 중복 규칙 (제거 대상)

---

## 5. 병합 절차 체크리스트

- [ ] 양쪽 CLAUDE.md diff 확인 (`git diff` 또는 수동 비교)
- [ ] 항목 분류: 동일 / 메인 전용 / 보조 전용 / 충돌
- [ ] 보조 전용 항목 중 §2 이식 대상 선별
- [ ] 메인 CLAUDE.md에 링크·읽기 조건만 추가 (상세 규칙은 docs/automation에 유지)
- [ ] docs/automation/ 파일 복사 또는 병합 (§3)
- [ ] 병합 후 검증:
  - [ ] 메인 보안·DB·배포 규칙 유지 여부
  - [ ] 동일 규칙 중복 없음
  - [ ] CLAUDE.md 네비게이션 경로가 실제 파일과 일치
  - [ ] 충돌 규칙 0건

**자동 merge보다 수동 통합 권장.**

---

## 6. 금지

- 메인 CLAUDE.md 전체 교체
- 데이터 규칙 때문에 메인 보안·개발 규칙 삭제
- 동일 상세 규칙을 CLAUDE.md와 docs/automation 양쪽에 중복
- 충돌 규칙 자동 선택

---

*적용 범위: research/tourapi-nightly-20260722 → main 병합 시.*
