import type { Metadata } from "next";
import PlannerRedirect from "./PlannerRedirect";

// 스케줄러 일원화 (Owner 2026-09-12): 여행 만들기 진입은 This Trip(Picks) 하나다.
// /planner 는 기존 링크(CTA·클론 딥링크·legacy #planner 승계)의 의미를 보존한 채
// /picks 로 보내는 승계 route 로만 남는다. V1 폼(PlannerClient)은 route 에서
// 내려갔다 — 파일은 가드 테스트 참조용으로 유지.
export const metadata: Metadata = {
  alternates: {
    canonical: "https://gokoreamate.com/picks/",
  },
};

export default function PlannerPage() {
  return <PlannerRedirect />;
}
