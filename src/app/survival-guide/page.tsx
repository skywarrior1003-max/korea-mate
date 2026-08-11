import SurvivalGuideClient from "./SurvivalGuideClient";

// 화면은 SurvivalGuideClient 가 그린다 — 이 앱의 locale 은 브라우저에서
// 정해지고 서버 쪽 next-intl 설정이 없어 서버 컴포넌트에서는 번역을 읽을 수
// 없다. (/about 과 같은 구조다.)
//
// metadata 는 여기 남는다. 정적 export 라 빌드 시점에 HTML 이 하나만 나오고
// 그때는 사용자의 언어를 알 수 없다 — 언어별 metadata 는 별도 SEO 과제다.
export const metadata = {
  title: "Korea Survival Guide - gokoreamate",
  description: "Everything foreign travelers need to know before and during their trip to Korea.",
};

export default function SurvivalGuidePage() {
  return <SurvivalGuideClient />;
}
