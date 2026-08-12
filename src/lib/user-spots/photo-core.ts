// My Places 사진의 순수 로직 — 경로 규칙, 수량 한도, Storage 제거.
//
// Trip Moment 쪽 검증 인프라(MIME·크기·SOI·EXIF 제거·signed URL)는 이미
// 도메인과 무관하게 일반적이라 그대로 가져다 쓴다. 여기 있는 것은 Moment
// 에는 없는 규칙, 즉 My Places 만의 경로와 한도뿐이다.
//
// Moment 쪽 endpoint 나 helper 는 건드리지 않는다. 검증된 사진 경로에
// "user_spots 면 건너뛴다" 같은 분기를 넣는 순간 그 경로의 보증이 깨진다.

// functions 번들에 들어가는 파일이라 alias 대신 상대경로를 쓴다 —
// 이 폴더의 다른 photo-* 모듈이 모두 그렇게 되어 있다.
import { PHOTO_BUCKET_NAME } from "../photo-delete.ts";

/** device 하나가 가질 수 있는 My Places 사진 수. */
export const USER_SPOT_PHOTO_DEVICE_LIMIT = 100;

/**
 * Storage object 경로.
 *
 * 세 조각 모두 서버가 만든다 — 클라이언트가 경로를 정하면 남의 파일 위에
 * 쓸 수 있다. device_id 는 넣지 않는다. 경로가 기기 식별자를 담으면
 * 파일 목록만 봐도 누가 무엇을 올렸는지 묶인다.
 *
 * Moment 경로({itineraryId}/{momentId}/{uuid}.jpg)와 같은 bucket 을 쓰지만
 * user-spots/ prefix 로 갈라져 서로 충돌하지 않는다.
 */
export function makeUserSpotPhotoPath(userSpotId: string, versionUuid: string): string {
  return `user-spots/${userSpotId}/${versionUuid}.jpg`;
}

/**
 * 새 사진 슬롯을 더 만들 수 있는가.
 *
 * 교체는 한도와 무관하다 — 파일 수가 늘지 않기 때문이다. 한도에 걸린
 * 사용자가 기존 사진을 바꾸지도 못하면 한도가 아니라 잠금이 된다.
 *
 * COUNT 와 upload 사이에는 창이 있어 동시 요청이면 한도를 잠깐 넘길 수
 * 있다. Moment 쪽도 같은 best-effort 이며, 이를 없애려면 DB 제약이 필요해
 * V1 한계로 둔다.
 */
export function isUserSpotPhotoQuotaExceeded(
  isReplacement: boolean,
  currentPhotoCount: number,
  limit: number = USER_SPOT_PHOTO_DEVICE_LIMIT,
): boolean {
  if (isReplacement) return false;
  return currentPhotoCount >= limit;
}

type StorageBucket = {
  remove(paths: string[]): Promise<{ data: ReadonlyArray<unknown> | null; error: unknown }>;
};
type InjectableStorage = {
  from(bucket: string): StorageBucket;
};

/**
 * My Place 사진 하나를 Storage 에서 지운다. 성공이면 null, 실패면 오류 문자열.
 *
 * Moment 의 removeMomentStorage 와 다른 점이 하나 있다 — 이미 없는 파일을
 * 실패로 보지 않는다.
 *
 * 삭제는 ① 공개 동의 끄기 ② Storage 제거 ③ path 비우기 순서로 진행하는데,
 * ②는 됐고 ③에서 실패하면 파일은 없는데 경로만 남는다. 그 상태에서 다시
 * 삭제를 눌렀을 때 "파일이 없다" 를 실패로 처리하면 경로를 영영 못 지운다.
 * 재시도가 끝을 볼 수 있어야 한다.
 *
 * 권한 문제나 네트워크 오류는 error 로 오므로 이 완화가 실패를 감추지 않는다.
 */
export async function removeUserSpotPhoto(
  storage: InjectableStorage,
  storagePath: string,
): Promise<string | null> {
  const { error } = await storage.from(PHOTO_BUCKET_NAME).remove([storagePath]);
  if (error) {
    return (error as { message?: string })?.message ?? "Storage remove error";
  }
  return null;
}

/**
 * 사진을 뺐을 때 이 장소를 이해할 근거가 남는가.
 *
 * 지금 구현된 실질 Anchor 는 좌표 짝 하나뿐이다. canonical place 관계와
 * trip context 는 저장할 컬럼이 아직 없으므로 있는 것처럼 계산하지 않는다.
 *
 * name 은 세지 않는다. 제목은 장소를 이해하는 근거가 아니라 표현 값이고,
 * 사진만 있는 장소에 사용자가 아무 제목이나 적어 두었다는 이유로 그 사진을
 * 지워 아무것도 남지 않는 행을 만들 수는 없다.
 */
export function hasNonPhotoAnchor(row: { lat?: number | null; lng?: number | null }): boolean {
  return row.lat !== null && row.lat !== undefined
      && row.lng !== null && row.lng !== undefined;
}

/**
 * 응답에 담을 사진 상태.
 *
 * storage path 는 어떤 경우에도 클라이언트로 나가지 않는다. 화면이 알아야
 * 하는 것은 "사진이 있는가" 와 "공개에 동의했는가" 둘뿐이다.
 */
export function toPhotoMeta(row: Record<string, unknown>): { has_photo: boolean; photo_public: boolean } {
  const path = row.photo_storage_path;
  return {
    has_photo:    typeof path === "string" && path.length > 0,
    photo_public: row.photo_public === true,
  };
}
