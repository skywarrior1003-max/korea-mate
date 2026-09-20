"use client";

// 지도 전용 오류 경계 (GROUNDING-STABLE V3 §E).
//
// Naver SDK 는 인증 실패 상태에서 내부 null 을 밟는 예외를 던질 수 있고,
// 그 예외가 React 트리로 올라오면 My Trip 화면 전체가 내려간다(실측:
// "reading 'capitalize'"). 지도 하나의 실패는 지도 칸의 실패로 끝나야 한다 —
// 일정·Story·문체 선택·저장은 계속 쓸 수 있어야 한다.
//
// fallback 은 안내 문구 + 장소 순서 목록이다. 자동 재시도는 하지 않고(무한
// 재시도 금지), SDK 재로드 없이는 복구가 불가능하므로 "다시 시도" 버튼도
// 걸지 않는다. 페이지 전체 reload 를 강제하지 않는다.

import { Component, type ReactNode } from "react";

interface Props {
  /** 지도 대신 보여줄 방문 순서 목록 — [dayNumber, order, name] */
  places?: { dayNumber: number; order: number; name: string }[];
  /** 안내 문구 — 호출부가 UI locale 로 넘긴다 */
  failLabel: string;
  children: ReactNode;
}

interface State { failed: boolean }

export default class MapErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(): void {
    // 지도 오류는 이미 화면에 fallback 으로 설명된다 — 콘솔 원문만으로 충분하다.
  }

  render() {
    if (!this.state.failed) return this.props.children;
    const places = this.props.places ?? [];
    return (
      <div role="status" className="w-full rounded-xl bg-[#F6F7F8] border border-black/10 px-4 py-5">
        <p className="text-xs font-bold text-[#565D66]">{this.props.failLabel}</p>
        {places.length > 0 && (
          <ol className="mt-3 space-y-1">
            {places.map(p => (
              <li key={`${p.dayNumber}-${p.order}-${p.name}`} className="flex items-center gap-2 text-xs text-[#565D66]">
                <span
                  aria-hidden
                  className="w-4 h-4 rounded-full inline-flex items-center justify-center text-[10px] font-black text-white shrink-0"
                  style={{ backgroundColor: "#FF4A2D" }}
                >
                  {p.order}
                </span>
                <span className="truncate">Day {p.dayNumber} · {p.name}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    );
  }
}
