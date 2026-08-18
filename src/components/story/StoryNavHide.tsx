"use client";

// Story 가 떠 있는 동안 앱 하단 네비게이션을 감춘다.
//
// 왜 경로로 못 가르나
//   Story 는 `/shared` 안의 **상태**다. 같은 주소에서 공개한 기억이 있으면
//   Story 로, 없으면 기존 공유 화면으로 갈린다. `NavShell` 은 경로만 보므로
//   `/shared` 를 통째로 숨기면 기억이 없는 기존 공유 화면까지 하단 메뉴를
//   잃는다 — 그건 지금 잘 쓰고 있는 화면을 망가뜨리는 것이다.
//
// 그래서 신호를 하나 둔다
//   Story 가 마운트돼 있는 동안만 문서에 표시를 남기고, `NavShell` 이 그것을
//   본다. 화면을 벗어나면 표시가 사라지고 하단 메뉴가 그대로 돌아온다.
//   전역 구조를 고치는 게 아니라, "지금 Story 인가" 한 가지만 알려 준다.

import { useEffect } from "react";

/** `NavShell` 이 읽는 표시. 이름은 한 곳에서만 정한다. */
export const STORY_MODE_ATTR = "data-story-surface";

export default function StoryNavHide() {
  useEffect(() => {
    const el = document.documentElement;
    el.setAttribute(STORY_MODE_ATTR, "1");
    // 화면을 떠나면 반드시 되돌린다 — 남겨 두면 다른 화면의 메뉴가 사라진다
    return () => { el.removeAttribute(STORY_MODE_ATTR); };
  }, []);
  return null;
}
