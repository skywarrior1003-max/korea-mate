import type { Metadata } from "next";
import SavedClient from "./SavedClient";

export const metadata: Metadata = {
  title: "Saved places — gokoreamate",
  description: "Your saved places and private My Places on gokoreamate.",
  alternates: { canonical: "https://gokoreamate.com/saved/" },
  robots: { index: false }, // 개인 데이터 화면 — 색인 불필요
};

export default function SavedPage() {
  return <SavedClient />;
}
