// GoKoreaMate — Trip Cover 자산 SSOT 바인딩
//
// data/trip-cover/busan-v1-assets.json 을 실제로 import 하는 **유일한** 모듈이다.
// 컴포넌트·Pages Function 은 여기서 나온 COVER_ASSETS 만 사용하고,
// 이미지 URL·출처·테마를 다시 하드코딩하지 않는다.
//
// import 속성(`with { type: "json" }`)을 쓰지 않는 이유:
//   Cloudflare Pages 의 Functions 번들러(wrangler 3.114 / 구 esbuild)가 속성 구문을
//   파싱하지 못해 "Expected ";" but found "with"" 로 배포 빌드가 실패한다.
//   속성 없는 JSON import 는 esbuild·Next 모두 정상 처리하므로 이 형태를 쓴다.
//   Node ESM 런너는 속성을 요구하지만, 단위 테스트는 이 파일을 import 하지 않고
//   cover-core.ts(순수 로직) + fs 로 읽은 manifest 를 직접 검증한다.

import manifest from "../../../data/trip-cover/busan-v1-assets.json";
import { buildCoverAssets, filterByTheme, findById, pickFrom } from "./cover-core";
import type { CoverAsset, CoverTheme } from "./cover-core";

const RAW: unknown[] = ((manifest as { assets?: unknown[] }).assets ?? []);

/** 검증을 통과한 자산만. priority 오름차순 고정 정렬 */
export const COVER_ASSETS: readonly CoverAsset[] = buildCoverAssets(RAW);

/** 로더가 제외한 자산 수 — 진단용 */
export const COVER_ASSETS_REJECTED = RAW.length - COVER_ASSETS.length;

export function assetsByTheme(theme: CoverTheme): readonly CoverAsset[] {
  return filterByTheme(COVER_ASSETS, theme);
}

export function assetById(assetId: string): CoverAsset | undefined {
  return findById(COVER_ASSETS, assetId);
}

/** itineraryId + theme 로 고정 선택. skip 은 이미지 실패 시 다음 후보 오프셋 */
export function pickAsset(
  itineraryId: string,
  theme: CoverTheme,
  skip = 0,
): CoverAsset | undefined {
  return pickFrom(COVER_ASSETS, itineraryId, theme, skip);
}
