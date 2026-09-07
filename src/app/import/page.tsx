// External URL Import — Preview 페이지. (EXTERNAL-URL-IMPORT-ENGINE-V1)
// 개인 흐름 화면이라 색인하지 않는다. 모든 상태는 ImportClient 에 있다.

import type { Metadata } from "next";
import ImportClient from "@/components/importer/ImportClient";

export const metadata: Metadata = {
  title: "Import from a link — gokoreamate.com",
  description: "Preview and import an itinerary or places from a pasted link.",
  robots: { index: false },
};

export default function ImportPage() {
  return <ImportClient />;
}
