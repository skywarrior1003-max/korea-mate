"use client";
// 브라우저에서만 정해지는 오늘(한국 날짜). 정적 빌드 HTML 과 hydration 동안에는 null 이다 —
// 빌드한 날의 날짜로 목록을 굽지 않게 해서, 재배포 전까지 끝난 행사가 HTML 에 남지 않게 한다.
// 1분마다 다시 읽어 자정을 넘겨 열어 둔 화면도 날짜가 바뀐다.

import { useSyncExternalStore } from "react";
import { kstToday } from "./kst-today";

const subscribe = (onChange: () => void) => {
  const id = setInterval(onChange, 60_000);
  return () => clearInterval(id);
};

export function useKstToday(): string | null {
  return useSyncExternalStore(subscribe, () => kstToday(), () => null);
}
