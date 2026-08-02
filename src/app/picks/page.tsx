import type { Metadata } from "next";
import PicksClient from "./PicksClient";

// 개인 데이터 화면 — 색인하지 않는다. 기존 /saved 정책을 그대로 이어받는다.
export const metadata: Metadata = {
  title: "Picks | gokoreamate",
  description: "Your selected places, saved places and private My Places on gokoreamate.",
  robots: { index: false },
};

export default function PicksPage() {
  return <PicksClient />;
}
