import type { Metadata } from "next";
import PlannerClient from "./PlannerClient";

// PLANNER-SPOTS-SEPARATION-V1: AI 플래너의 정상 진입 route.
// 예전에는 Home 안의 #planner 섹션이었다 — 기존 route 중에는 생성 전 입력
// 폼을 수용할 곳이 없어(/itinerary 는 생성 결과 화면, /my-trips 는 목록)
// 최소 신규 route 로 분리했다. 이름은 repo 전반의 기존 어휘(planner
// messages namespace · lib/planner · components/planner)를 따른다.
export const metadata: Metadata = {
  alternates: {
    canonical: "https://gokoreamate.com/planner/",
  },
};

export default function PlannerPage() {
  return <PlannerClient />;
}
