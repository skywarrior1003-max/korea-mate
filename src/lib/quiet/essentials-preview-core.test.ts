// Essentials preview 2슬롯 선정 — DISCOVERY-EXPLORE-PRODUCTION-V1
import test from "node:test";
import assert from "node:assert/strict";
import { essentialKind, pickEssentialsPreview } from "./essentials-preview-core.ts";

test("성격 판별 — 결정적 키워드", () => {
  assert.equal(essentialKind("도시철도"), "transport");
  assert.equal(essentialKind("교통카드"), "pay");
  assert.equal(essentialKind("동백패스"), "pay");
  assert.equal(essentialKind("여행 안내 핫라인"), "help");
  assert.equal(essentialKind("짐 보관"), "luggage");
  assert.equal(essentialKind(null), "etc");
});

test("부산(전부 교통계열): 수단+수단 대신 수단+결제를 고른다", () => {
  const busan = [
    { id: 1, category: "도시철도" }, { id: 2, category: "시내버스" },
    { id: 3, category: "공항리무진" }, { id: 4, category: "교통카드" },
    { id: 5, category: "동백패스" }, { id: 6, category: "택시" },
    { id: 7, category: "여행 안내 핫라인" },
  ];
  const picked = pickEssentialsPreview(busan);
  assert.deepEqual(picked.map(x => x.id), [1, 4]); // 도시철도 + 교통카드
});

test("전주(수단+짐보관 실재): 다른 성격 최상위가 온다", () => {
  const jeonju = [
    { id: 1, category: "광역 교통 → 전주" }, { id: 2, category: "광역 교통 → 전주" },
    { id: 3, category: "짐 보관" }, { id: 4, category: "시내버스" },
  ];
  assert.deepEqual(pickEssentialsPreview(jeonju).map(x => x.id), [1, 3]);
});

test("전부 같은 성격·같은 소분류면 정직하게 상위 2개 / 2개 이하는 그대로", () => {
  const same = [{ id: 1, category: "시내버스" }, { id: 2, category: "시내버스" }, { id: 3, category: "시내버스" }];
  assert.deepEqual(pickEssentialsPreview(same).map(x => x.id), [1, 2]);
  assert.deepEqual(pickEssentialsPreview([{ id: 9, category: "택시" }]).map(x => x.id), [9]);
});

test("같은 성격이지만 소분류가 다르면 소분류 차등", () => {
  const modes = [{ id: 1, category: "도시철도" }, { id: 2, category: "도시철도" }, { id: 3, category: "시내버스" }];
  assert.deepEqual(pickEssentialsPreview(modes).map(x => x.id), [1, 3]);
});
