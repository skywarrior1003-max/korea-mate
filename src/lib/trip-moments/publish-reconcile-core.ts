// 최초 Public Story 공개의 순서와 판단.
//
// 왜 "선택한 것을 켠다" 로 끝내면 안 되는가
//   공개는 한 번에 끝나지 않을 수 있다. 5건 중 3건까지 켜고 실패하면 그 3건은
//   서버에 켜진 채 남는다. 다음 시도에서 사용자가 선택을 바꿨다면, 선택한 것만
//   켜는 방식은 **지난번에 켜 두고 이번엔 고르지 않은 것**을 그대로 공개해
//   버린다. 그래서 매번 서버의 지금 상태를 다시 읽고, 지금 선택과의 차이만
//   적용한다. 사용자의 현재 선택이 유일한 정본이다.
//
// 왜 여행 공개가 마지막인가
//   여행을 먼저 공개하면 Memory 를 정리하는 동안 이미 바깥에서 볼 수 있다.
//   순서를 뒤집으면 "아직 준비 중" 이라는 상태가 공개된 상태와 겹친다.
//   Memory 쪽이 원하는 모양이 된 것을 확인한 **다음에만** 여행을 공개한다.
//   그래서 Memory 단계에서 한 건이라도 실패하면 여행은 비공개로 남는다.
//
// 왜 개별 성공/실패 개수를 결과에 담지 않는가
//   사용자는 Publish 를 한 번 눌렀다. 그 한 번의 의도에 대한 답도 하나여야
//   한다. "3개 성공 2개 실패" 는 서버 사정이지 사용자가 할 일이 아니다.
//   다시 누르면 남은 차이만 다시 계산되므로 목록을 들고 있을 이유도 없다.

import { consentScope, type ConsentScope } from "./public-consent-core.ts";

/** 서버가 알려준 Memory 한 건의 공개 상태 */
export interface MemoryPublicState {
  moment_id: string;
  is_public: boolean;
}

/** 적용해야 할 변경 한 건 */
export interface MemoryDiff {
  momentId: string;
  next:     boolean;
}

/**
 * 지금 서버 상태와 지금 선택의 차이.
 *
 * 켤 것과 끌 것을 **둘 다** 낸다 — 끄는 쪽을 빼면 지난 시도의 잔재가 남는다.
 * 이미 원하는 모양인 건은 나오지 않는다(같은 값을 다시 쓰면 동의 시각만
 * 앞으로 밀린다).
 *
 * 서버에 없는 id 를 골랐다면 그것은 아직 동기화되지 않은 Memory 다. 켜 달라고
 * 보내 봐야 404 이므로 차이에 넣지 않는다 — 고를 수 없게 막는 것은 화면의 몫이고,
 * 여기서는 보낼 수 없는 요청을 만들지 않는 것이 할 일이다.
 */
export function computeMemoryDiff(
  server:   ReadonlyArray<MemoryPublicState>,
  selected: ReadonlyArray<string>,
): MemoryDiff[] {
  const want = new Set(selected);
  const out: MemoryDiff[] = [];
  for (const row of server) {
    const id = typeof row.moment_id === "string" ? row.moment_id : "";
    if (!id) continue;
    const next = want.has(id);
    if (row.is_public === next) continue;
    out.push({ momentId: id, next });
  }
  return out;
}

/** 차이를 적용한 뒤 서버가 이 모양이어야 한다 */
export function isReconciled(
  server:   ReadonlyArray<MemoryPublicState>,
  selected: ReadonlyArray<string>,
): boolean {
  return computeMemoryDiff(server, selected).length === 0;
}

// ── 공개 요약 ────────────────────────────────────────────────────────────────

/** 요약 한 줄을 만들기 위해 화면이 주는 것 */
export interface SelectedSummaryInput {
  photoCount: number;
  hasMemo:    boolean;
}

export interface SelectedSummary {
  /** 기존 Memory 한 건짜리 동의 화면과 같은 판정 규칙 */
  scope:  ConsentScope;
  photos: number;
  memos:  number;
  count:  number;
}

/**
 * 고른 것 전체가 실제로 무엇을 공개하는가.
 *
 * 한 건짜리 동의 화면이 쓰는 `consentScope` 를 그대로 쓴다 — 규칙이 두 곳에
 * 있으면 한쪽만 바뀌어 화면이 거짓말을 하게 된다. 사진 0장·메모 0개인데
 * "사진이 공개됩니다" 라고 말하지 않는 것이 이 함수의 유일한 목적이다.
 */
export function summarizeSelection(
  items: ReadonlyArray<SelectedSummaryInput>,
): SelectedSummary {
  let photos = 0, memos = 0;
  for (const it of items) {
    const n = Number.isFinite(it.photoCount) && it.photoCount > 0 ? Math.floor(it.photoCount) : 0;
    photos += n;
    if (it.hasMemo) memos += 1;
  }
  return { scope: consentScope(photos, memos > 0), photos, memos, count: items.length };
}

// ── 최초 공개 실행 ───────────────────────────────────────────────────────────

/** 바깥 세계. 테스트는 이것만 바꿔 끼운다. */
export interface PublishDeps {
  /** 서버의 지금 Memory 공개 상태 */
  readServerState: () => Promise<{ ok: boolean; rows: MemoryPublicState[] }>;
  /** Memory 한 건 공개/해제 */
  setMomentPublic: (momentId: string, next: boolean) => Promise<boolean>;
  /** 여행 자체를 공개 — 마지막 단계 */
  setTripPublic:   () => Promise<boolean>;
}

/**
 * 한 번의 Publish 에 대한 한 개의 답.
 *
 * `memoryFailed` 는 "아무것도 바뀌지 않았다" 가 아니다 — 일부는 서버에서 이미
 * 바뀌었을 수 있다. 다만 **여행은 비공개로 남았다.** 화면은 그 사실만 말해야
 * 한다. 다시 누르면 남은 차이만 다시 계산된다.
 */
export type PublishOutcome =
  | { status: "published" }
  | { status: "stateUnreadable" }
  | { status: "memoryFailed" }
  | { status: "tripFailed" };

/**
 * 최초 공개. 순서를 지키는 것이 이 함수의 전부다.
 *
 *   지금 상태 읽기 → 차이 계산 → 적용 → 다시 읽어 확인 → **그 다음에** 여행 공개
 *
 * 자동 재시도는 넣지 않았다. 매 호출이 서버 상태를 다시 읽고 차이를 다시
 * 계산하므로 사용자가 다시 누르는 것이 가장 정확한 재시도다. 안에서 몇 번
 * 더 시도하면 실패를 늦게 알려 줄 뿐이고, 그 사이 사용자는 무엇이 켜졌는지
 * 모르는 채 기다린다.
 */
export async function runFirstPublish(
  deps:     PublishDeps,
  selected: ReadonlyArray<string>,
): Promise<PublishOutcome> {
  const before = await deps.readServerState();
  if (!before.ok) return { status: "stateUnreadable" };

  for (const d of computeMemoryDiff(before.rows, selected)) {
    const ok = await deps.setMomentPublic(d.momentId, d.next);
    if (!ok) return { status: "memoryFailed" };
  }

  // 요청이 전부 200 이어도 저장된 것이 원하는 모양인지는 다시 읽어야 안다.
  const after = await deps.readServerState();
  if (!after.ok) return { status: "stateUnreadable" };
  if (!isReconciled(after.rows, selected)) return { status: "memoryFailed" };

  return (await deps.setTripPublic()) ? { status: "published" } : { status: "tripFailed" };
}
