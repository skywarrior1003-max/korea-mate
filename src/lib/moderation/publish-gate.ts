// 공개 전환을 허용할지 서버에서 한 곳으로 판정한다.
//
// 왜 따로 뽑았나
//   같은 파일에 공개를 켜는 경로가 둘 있었다(PUT·PATCH). 규칙은 PUT 안에만
//   적혀 있었고, 사람이 실제로 쓰는 것은 PATCH 였다. 그래서 관리자가 가린
//   여행을 만든 사람이 앱에서 그대로 다시 켤 수 있었다. 규칙을 두 곳에 복사하면
//   같은 일이 또 생긴다 — 판정을 한 군데로 모으고 양쪽이 이것을 부른다.
//
// 새 규칙을 만들지 않는다
//   무엇이 허용되는지는 `publishVerdict` 가 이미 정한다. 여기서 하는 일은
//   "지금 이 여행이 가려져 있는가" 를 읽어 와 그 판정에 넘기는 것뿐이다.
//
// 못 읽으면 막는다
//   가려졌는지 확인하지 못한 채 공개를 켜 주면, 확인 실패가 곧 우회 수단이
//   된다. 그래서 읽기가 실패하면 거절한다. 행이 없는 것은 실패가 아니다 —
//   남의 여행이거나 없는 여행이고, 그 경우는 뒤따르는 UPDATE 가 0건으로
//   끝나 404 가 된다. 여기서 미리 다른 말을 하지 않는다.

import { publishVerdict } from "./story-moderation-core.ts";

/**
 * 이 여행의 숨김 상태를 읽어 온다.
 *
 * 소유자 조건까지 포함해 읽는다 — 남의 여행 상태를 알려 주는 통로가 되면 안 된다.
 * `ok:false` 는 읽기 자체가 실패한 것이고, `row:null` 은 해당 행이 없는 것이다.
 */
export interface ModerationStateReader {
  (itineraryId: string, deviceId: string): Promise<{
    ok:   boolean;
    row:  { moderation_hidden_at: string | null } | null;
  }>;
}

export type PublishGate =
  | { allowed: true }
  | { allowed: false; status: number; error: string };

/**
 * 공개 전환을 허용할까.
 *
 * 켜는 요청일 때만 상태를 읽는다. 끄는 요청·제목 수정 등에는 조회를 붙이지
 * 않는다 — 공개를 줄이는 방향까지 막을 이유가 없고, 불필요한 왕복도 만들지 않는다.
 */
export async function publishGate(
  read:         ModerationStateReader,
  itineraryId:  string,
  deviceId:     string,
  nextIsPublic: unknown,
): Promise<PublishGate> {
  if (nextIsPublic !== true) return { allowed: true };

  const got = await read(itineraryId, deviceId);
  if (!got.ok) {
    // 확인 실패가 우회 수단이 되지 않게 한다. 내부 사정은 알려 주지 않는다.
    return { allowed: false, status: 503, error: "Could not verify sharing status. Please try again." };
  }

  const verdict = publishVerdict(got.row ?? { moderation_hidden_at: null }, true);
  return verdict.allowed
    ? { allowed: true }
    : { allowed: false, status: verdict.status, error: verdict.error };
}
