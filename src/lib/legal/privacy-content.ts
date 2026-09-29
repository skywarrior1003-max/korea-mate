// 개인정보처리방침 본문 — 현재 공개 서비스판 (PUBLIC-PRIVACY-POLICY-V1, 2026-09-29)
//
// 이 판은 로그인·계정 기능이 없는 현재 Production(master) 기준이다. 서술은 master 코드와
// Production 실측(브라우저 요청·저장소·쿠키)으로 확인된 사실만 쓴다.
//  · 수집: 여행 콘텐츠·사진·나의 장소·반응(기기 식별자 기준), 문의(이름 선택·이메일·메시지),
//    신고(사유·메모·신고 키), 자동 수집(기술 로그·GA4·Cloudflare Web Analytics)
//  · 외부 연결 실측: googletagmanager·google-analytics(GA4, 쿠키 _ga), static.cloudflareinsights.com,
//    oapi.map.naver.com·pstatic·nelo.navercorp.com(네이버 지도), supabase.co, 관광 공식 사이트 이미지
//  · 위치: 브라우저 위치는 '내 주변' 정렬에만 쓰고 서버로 보내지 않는다(코드 확인)
//  · 문의 알림 메일(Resend)에는 이름·이메일·메시지가 담긴다(현재 master contact.ts)
//  · GA-CONSENT-V1: GA 는 첫 방문 안내에서 수집·이용 동의와 국외 이전 동의를 **각각** 받아 둘 다 있을 때만
//    적재·전송(선택 전·나중에·한쪽만·거부 시 요청 0·쿠키 0). 철회 = 더보기 › 사용 통계(그때부터만 — 과거 전송분은
//    보관기간 뒤 삭제). 근거 = 제15조①1호 동의 + 제28조의8①1호 국외 이전 별도 동의(제22조① 구분 동의)
//
// Auth 출시 때는 Auth 브랜치의 같은 경로 파일(로그인·계정 삭제·동의 포함판)로 교체된다 —
// 이 판에서 새로 확인한 사실(네이버 지도·Cloudflare Web Analytics·기기 식별자 저장)은
// Auth 판에도 반영돼 있어야 한다(가드: public-privacy-guard).

import type { LegalDocSet } from "./legal-types";

/** 이 판의 시행일 = Production 게시일. 게시 날짜가 다르면 merge 전 이 한 줄만 바꾼다. */
/** 최초 게시일(개정 이력 표기용) */
export const PUBLIC_PRIVACY_FIRST_DATE = "2026-09-29";
/** 현재 판 시행일 — GA 동의 개정판. 배포일이 다르면 merge 전 이 한 줄만 바꾼다(방침 제13조: 새 시행일과 함께 게시). */
export const PUBLIC_PRIVACY_EFFECTIVE_DATE = "2026-09-30";

const ADDR = "부산시 남구 유엔로 96번길 26-31 (대연동)";

export const PRIVACY: LegalDocSet = {
  en: {
    title: "Privacy Policy",
    effectiveDate: PUBLIC_PRIVACY_EFFECTIVE_DATE,
    lastUpdated: PUBLIC_PRIVACY_EFFECTIVE_DATE,
    intro: [
      "This Privacy Policy explains what information gokoreamate handles, why, and what choices you have. gokoreamate is a Korea travel planning service for exploring places, building day-by-day itineraries, and keeping travel memories. The service currently has no sign-in or accounts; what you create is linked to your browser on this device.",
    ],
    sections: [
      {
        no: 1, title: "Who operates this service",
        paragraphs: [
          `gokoreamate is operated by 케이이엔지, a sole proprietorship in the Republic of Korea (shown by its registered Korean trade name). Address: ${ADDR}, Busan, Republic of Korea.`,
          "Privacy contact: 케이이엔지 privacy team (개인정보보호 담당) · support@gokoreamate.com",
        ],
      },
      {
        no: 2, title: "Information we handle",
        paragraphs: ["We handle only what the service needs:"],
        items: [
          "Travel content you create: itineraries (city, dates, places, title), saved places, your own places (name, memo, location, photos), trip photos and memos, stories, and sharing settings.",
          "Device identifier: a random value created in your browser (not derived from hardware and not linked to your name). It is stored with the content and reactions you create so the service can recognise them as yours; for some records we store a value converted from it instead.",
          "Likes, dislikes, 'helpful' marks, reactions, saves, and place suggestions you send.",
          "Contact form: email address, message, optional name, and the page or place the inquiry is about, plus your browser language.",
          "Reports (optional): the reason, an optional note (up to 500 characters), and a key calculated from your device identifier and the reported item to prevent duplicate reports. Please do not include personal information in notes.",
          "Collected automatically: basic technical logs kept by our hosting providers (such as IP address and request details) and usage statistics (Section 7).",
        ],
      },
      {
        no: 3, title: "Information we do not collect",
        paragraphs: [],
        items: [
          "Passwords or sign-in credentials — the service has no sign-in.",
          "Date of birth, gender, phone number, home address, or contact lists.",
          "Payment or card information — the service has no paid features.",
          "Background or continuous location tracking. When you use 'near me', your browser's location is used on your device to sort nearby places and is not sent to our servers.",
        ],
      },
      {
        no: 4, title: "How we use information",
        paragraphs: [],
        items: [
          "Travel content and device identifier: to provide the service — show your itineraries, places, photos, and stories to you, and to others only when you choose to share.",
          "Reactions and reports: to count reactions, review and act on reported items, and tell apart repeated reports from the same device.",
          "Inquiries: to review and reply to you.",
          "Usage statistics: to understand how features are used and improve the service.",
        ],
      },
      {
        no: 5, title: "AI features",
        paragraphs: [
          "AI-assisted features are currently turned off in the live service. Building an itinerary works without AI and sends nothing to an AI provider.",
        ],
      },
      {
        no: 6, title: "Service providers and processing outside Korea",
        paragraphs: ["Providers that process personal information for us, and where:"],
        items: [
          `Supabase (database and photo storage) — stores travel content and photos in the Seoul region, South Korea (AWS ap-northeast-2). Operator named in its privacy policy: Supabase Pte. Ltd. (Singapore); contact privacy@supabase.com. Kept until you delete the content.`,
          "Cloudflare (website delivery, server functions, and cookie-free visit statistics) — Cloudflare, Inc., 101 Townsend St, San Francisco, CA 94107, USA; contact dpo@cloudflare.com. Each time you use the service, request data (such as IP address and the request itself) may be processed at a nearby Cloudflare location outside Korea.",
          "Google (Google Analytics usage statistics, only if you consent) — Google LLC (USA); contact https://support.google.com/policies.",
          "Resend (sending inquiry notifications to the operator) — Plus Five Five, Inc.; its privacy policy states data is processed in the United States; contact support@resend.com. Inquiry notifications currently include the name, email address, and message you submit.",
          "How, when, and how long: information needed for these tasks is sent over encrypted connections (HTTPS) each time you use the service. Retention: Supabase keeps it until you delete the content; Resend keeps delivery logs for 30 days on our current plan; Google Analytics keeps event data for 2 months and user data for 14 months; Cloudflare does not store execution logs of our server functions (each provider may keep its own logs under its own policies).",
          "How to refuse and what happens: Google Analytics is used only if, in the notice shown on your first visit, you give both consents (collection and use, and transfer outside Korea). If you don't, choose \"Reject all\", or later turn either off under More › Usage statistics, nothing is sent to Google Analytics from then on, its cookies on this site are deleted, and every feature still works. Supabase and Cloudflare are needed to provide the service, so to refuse them you would stop using it (and can ask us to delete what is already stored). If you prefer your inquiry not to pass through the email service, contact us at support@gokoreamate.com instead of the form.",
        ],
      },
      {
        no: 7, title: "Analytics, maps, cookies, and browser storage",
        paragraphs: [
          "We use Google Analytics 4 for usage statistics only with your consent. We ask for two consents separately — consent to collection and use of personal information (Personal Information Protection Act Article 15(1)(1)) and consent to its transfer outside Korea (Article 28-8(1)(1)) — and load Google Analytics only if you give both. Before you choose, if you choose \"Decide later\", or if you give only one of them, the Google Analytics script is not loaded, nothing is sent to Google, and no Google Analytics cookie is set. With both consents, information about your visit (a cookie identifier, screens viewed and features used, device and browser information, and your IP address, which Google uses to estimate a rough region) is sent to Google LLC in the USA each time you use the service. You can change or withdraw your consent at any time under More › Usage statistics; from then on nothing more is sent and this site's Google Analytics cookies are deleted. Statistics already sent are not deleted immediately by withdrawing; they are deleted when the retention periods below end. If what we tell you in the notice changes, we do not apply your earlier choice and ask again. The notice asks people under 14 not to consent, but we do not verify age. In our Google Analytics settings, event data is kept for 2 months and user data for 14 months, and the user-data period restarts when a user is active again. Analytics events carry feature- and place-level information (for example a city name or a public place identifier) and never your email address or name.",
          "Cloudflare Web Analytics counts visits using browser performance data without cookies; Cloudflare states that it does not collect or use visitors' personal data.",
          "Maps are displayed with NAVER Maps. When a map is shown, your browser connects directly to NAVER's servers, which receive standard connection information such as your IP address. Some images are loaded directly from official tourism websites, which likewise receive connection information.",
          "The service itself sets no cookies. Your browser's local storage keeps the device identifier, your trip in progress, saved places, guide status, and language choice. Clearing browser storage removes this information from this device.",
        ],
      },
      {
        no: 8, title: "Affiliate links and external services",
        paragraphs: [
          "Some screens include affiliate links to travel partners (currently Agoda, Trip.com, Klook, and KKday). If you book through these links we may earn a commission at no extra cost to you. The link opens the partner site with an affiliate identifier; your name, email, and travel content are not passed to the partner. Partner sites have their own terms and privacy policies.",
        ],
      },
      {
        no: 9, title: "Public sharing",
        paragraphs: [
          "Trips and stories are private by default. If you make them public or share a link, the shared view shows only the itinerary content you chose to publish — not your email, device identifier, or accommodation arrival times. Public itineraries can be copied by other users to their own device; copies do not carry over the original title or travel dates. Photos attached to memories appear on public views only when you explicitly mark that memory as public.",
        ],
      },
      {
        no: 10, title: "Retention and destruction",
        paragraphs: [
          "Content you delete in the app is deleted immediately, including stored photo files. Content you keep remains until you delete it or ask us to delete it; the service does not auto-expire your travel data.",
          "Inquiry records are kept for 6 months from the date received, and report records for 6 months from the date handling is completed; they are then destroyed without delay. Reports still being handled are kept until handling ends. This period is the service's own operating standard, and records are deleted earlier when their purpose ends or a lawful deletion request is received. Inquiry notification emails in the operator's mailbox are deleted together with the inquiry.",
          "Technical logs at our infrastructure providers: execution logs of the website's server functions are not stored, and the database provider keeps API and database logs for 1 day on our current plan. Automatic database backups are not currently used, so deleted information is not restored from backups. Delivery logs at the email service are kept for 30 days on our current plan.",
          "How records are destroyed: records are deleted from the database and photo files are deleted from storage.",
        ],
      },
      {
        no: 11, title: "Your rights",
        paragraphs: [
          "You can view, edit, and delete your itineraries, saved places, your own places, photos, and memos directly in the app, and turn public sharing off at any time. A place suggestion still under review can be withdrawn.",
          "For anything you cannot do in the app — including viewing, correcting, or deleting inquiry or report records — contact us at support@gokoreamate.com or through the in-app Contact form. We act on requests without delay and tell you the result within 10 days of receiving the request, at the email address you used. Because there are no accounts, we may ask for details (such as a shared trip link or the date of an inquiry) to find the records and confirm the request is yours.",
        ],
      },
      {
        no: 12, title: "Security",
        paragraphs: [
          "Connections are encrypted (HTTPS). Changes to your trips, photos, and places go through server functions that check the device that created them. Photos are kept in private storage and served only through expiring signed links, not public URLs.",
        ],
      },
      {
        no: 13, title: "Changes to this policy",
        paragraphs: [
          "If this policy changes, the updated version will be posted on this page with a new effective date. For significant changes we will provide notice within the service.",
          `History: first posted ${PUBLIC_PRIVACY_FIRST_DATE}. Revised ${PUBLIC_PRIVACY_EFFECTIVE_DATE} — Google Analytics is used only if you give both optional consents (collection and use, and transfer outside Korea) (Sections 6 and 7).`,
        ],
      },
      {
        no: 14, title: "Contact",
        paragraphs: [
          "For privacy questions or requests, contact us at:",
          "Email: support@gokoreamate.com, or the in-app Contact form.",
        ],
      },
    ],
  },

  ko: {
    title: "개인정보처리방침",
    effectiveDate: PUBLIC_PRIVACY_EFFECTIVE_DATE,
    lastUpdated: PUBLIC_PRIVACY_EFFECTIVE_DATE,
    intro: [
      "이 개인정보처리방침은 gokoreamate 가 어떤 정보를 왜 처리하는지, 이용자가 어떤 선택을 할 수 있는지 설명합니다. gokoreamate 는 한국 여행지 탐색, 일자별 일정 만들기, 여행 기억 보관을 위한 여행 계획 서비스입니다. 현재 서비스에는 로그인·계정 기능이 없으며, 이용자가 만든 내용은 이 기기의 브라우저에 연결됩니다.",
    ],
    sections: [
      {
        no: 1, title: "서비스 운영 주체",
        paragraphs: [
          `gokoreamate 는 개인사업자 케이이엔지가 운영합니다. 주소: ${ADDR}.`,
          "개인정보 보호 담당: 케이이엔지 개인정보보호 담당 · support@gokoreamate.com",
        ],
      },
      {
        no: 2, title: "처리하는 정보",
        paragraphs: ["서비스 운영에 필요한 정보만 처리합니다:"],
        items: [
          "이용자가 만드는 여행 콘텐츠: 일정(도시·날짜·장소·제목), 저장한 장소, 직접 등록한 나의 장소(이름·메모·위치·사진), 여행 사진과 메모, 스토리, 공개 설정.",
          "기기 식별자: 브라우저에서 무작위로 만든 값(하드웨어에서 파생되지 않고 이름과 결합되지 않음). 이용자가 만든 콘텐츠와 반응이 이용자의 것임을 알아보기 위해 함께 저장하며, 일부 기록에는 이 값을 변환한 값을 저장합니다.",
          "이용자가 보낸 좋아요·싫어요·'도움됨' 표시·반응·저장·장소 제보.",
          "문의하기: 이메일 주소, 메시지, 선택 입력한 이름, 문의와 관련된 페이지·장소, 브라우저 언어.",
          "신고하기(선택): 신고 사유, 선택 입력한 메모(최대 500자), 같은 기기의 중복 신고를 막기 위해 기기 식별자와 신고 대상으로 계산한 키. 메모에는 개인정보를 적지 말아 주세요.",
          "자동 수집: 호스팅 사업자가 보관하는 기본 기술 로그(IP 주소·요청 정보 등)와 사용 통계(제7조).",
        ],
      },
      {
        no: 3, title: "수집하지 않는 정보",
        paragraphs: [],
        items: [
          "비밀번호·로그인 정보 — 현재 로그인 기능이 없습니다.",
          "생년월일·성별·전화번호·집 주소·연락처 목록.",
          "결제·카드 정보 — 현재 유료 기능이 없습니다.",
          "백그라운드·상시 위치 추적. '내 주변' 기능을 쓸 때 브라우저 위치는 이 기기 안에서 가까운 장소를 정렬하는 데만 쓰이고 서버로 보내지 않습니다.",
        ],
      },
      {
        no: 4, title: "이용 목적",
        paragraphs: [],
        items: [
          "여행 콘텐츠·기기 식별자: 서비스 제공 — 이용자의 일정·장소·사진·스토리를 본인에게, 그리고 이용자가 공유를 선택한 경우에만 다른 사람에게 보여주기 위해 사용합니다.",
          "반응·신고: 반응 집계, 신고된 대상의 검토·조치, 같은 기기의 반복 신고 구분에 사용합니다.",
          "문의 내용: 문의 확인과 회신에 사용합니다.",
          "사용 통계: 기능 사용 현황 파악과 서비스 개선에 사용합니다.",
        ],
      },
      {
        no: 5, title: "AI 기능",
        paragraphs: [
          "AI 보조 기능은 현재 운영 서비스에서 꺼져 있습니다. 일정 만들기는 AI 없이 동작하며 AI 제공업체로 아무것도 보내지 않습니다.",
        ],
      },
      {
        no: 6, title: "처리 위탁과 국외 처리",
        paragraphs: ["개인정보 처리 업무를 맡기는 곳과 처리 위치:"],
        items: [
          "Supabase(데이터베이스·사진 저장) — 여행 콘텐츠와 사진을 대한민국 서울 리전(AWS ap-northeast-2)에 저장합니다. 제공사 개인정보처리방침상 운영 법인: Supabase Pte. Ltd.(싱가포르), 연락처 privacy@supabase.com. 이용자가 삭제할 때까지 보관합니다.",
          "Cloudflare(웹사이트 전송·서버 기능 실행·쿠키 없는 방문 통계) — Cloudflare, Inc.(미국, 101 Townsend St, San Francisco, CA 94107), 연락처 dpo@cloudflare.com. 서비스를 이용할 때마다 요청 정보(접속 IP 주소·요청 내용 등)가 가까운 국외 Cloudflare 거점에서 처리될 수 있습니다.",
          "Google(Google Analytics 사용 통계, 이용자가 동의한 경우에만) — Google LLC(미국), 문의 https://support.google.com/policies.",
          "Resend(운영자에게 문의 알림 메일 발송) — Plus Five Five, Inc., 제공사 방침상 미국에서 처리, 연락처 support@resend.com. 현재 문의 알림 메일에는 이용자가 입력한 이름·이메일·메시지가 담깁니다.",
          "처리 방법·시기·보유기간: 서비스를 이용할 때마다 해당 업무에 필요한 정보가 암호화된 연결(HTTPS)로 전송됩니다. 보유기간은 Supabase 는 이용자가 삭제할 때까지, Resend 발송 기록은 현재 요금제에서 30일, Google Analytics 는 이벤트 데이터 2개월·사용자 데이터 14개월이며, Cloudflare 는 서버 기능 실행 로그를 저장하지 않습니다(각 제공사가 자체 정책에 따라 보관하는 로그는 별도).",
          "거부 방법과 효과: Google Analytics 는 첫 방문 때 보이는 안내에서 수집·이용 동의와 국외 이전 동의를 모두 한 경우에만 사용합니다. 동의하지 않거나 '모두 거부'를 고르거나 나중에 더보기 › 사용 통계에서 어느 하나를 끄면 그때부터 Google Analytics 로 아무것도 보내지 않고 이 사이트의 Google Analytics 쿠키를 지우며, 모든 기능을 그대로 이용할 수 있습니다. Supabase·Cloudflare 처리는 서비스 제공에 필요하므로 거부하려면 서비스 이용을 중단해야 하며, 이미 저장된 정보는 삭제를 요청할 수 있습니다. 문의가 메일 발송 서비스를 거치지 않기를 원하면 문의 양식 대신 support@gokoreamate.com 으로 직접 연락해 주세요.",
        ],
      },
      {
        no: 7, title: "분석 도구·지도·쿠키·브라우저 저장소",
        paragraphs: [
          "사용 통계에 Google Analytics 4 를 이용자가 동의한 경우에만 사용합니다. 동의는 개인정보 수집·이용 동의(개인정보 보호법 제15조제1항제1호)와 국외 이전 동의(제28조의8제1항제1호) 두 가지로 따로 받으며, 두 가지에 모두 동의한 경우에만 Google Analytics 를 불러옵니다. 선택하기 전, '나중에 결정'을 고른 경우, 한 가지에만 동의한 경우에는 Google Analytics 스크립트를 불러오지 않아 Google 로 아무것도 전송되지 않고 Google Analytics 쿠키도 설정되지 않습니다. 두 가지에 모두 동의하면 이용할 때마다 방문 정보(쿠키 식별자, 본 화면과 쓴 기능, 기기·브라우저 정보, Google 이 대략적 지역 산출에 쓰는 접속 IP 주소)가 미국의 Google LLC 로 전송됩니다. 더보기 › 사용 통계에서 언제든 바꾸거나 철회할 수 있으며, 철회하면 그때부터 전송을 멈추고 이 사이트의 Google Analytics 쿠키를 지웁니다. 이미 전송된 통계는 철회로 즉시 삭제되지 않고 아래 보관 기간이 지나면 삭제됩니다. 안내 내용이 바뀌면 이전 선택을 적용하지 않고 다시 묻습니다. 만 14세 미만은 동의하지 않도록 안내하지만, 나이를 확인하지는 않습니다. Google Analytics 설정상 이벤트 데이터는 2개월, 사용자 데이터는 14개월 보관되며, 사용자가 다시 이용하면 사용자 데이터 보관 기간이 새로 시작됩니다. 분석 이벤트에는 기능·장소 수준 정보(예: 도시 이름, 공개 장소 식별자)만 담기며 이메일·이름은 담기지 않습니다.",
          "Cloudflare Web Analytics 는 쿠키 없이 브라우저 성능 정보로 방문을 집계하며, Cloudflare 는 방문자의 개인정보를 수집·이용하지 않는다고 밝히고 있습니다.",
          "지도는 네이버 지도로 표시합니다. 지도가 보일 때 브라우저가 네이버 서버에 직접 접속하므로 네이버는 IP 주소 등 일반적인 접속 정보를 받습니다. 일부 이미지는 관광 공식 사이트에서 직접 불러오며, 해당 사이트도 접속 정보를 받습니다.",
          "서비스 자체는 쿠키를 설정하지 않습니다. 브라우저 로컬 저장소에는 기기 식별자·작성 중인 여행·저장 장소·안내 표시 상태·언어 선택이 보관됩니다. 브라우저 저장소를 지우면 이 기기에서 해당 정보가 삭제됩니다.",
        ],
      },
      {
        no: 8, title: "제휴 링크와 외부 서비스",
        paragraphs: [
          "일부 화면에는 여행 파트너(현재 Agoda·Trip.com·Klook·KKday) 제휴 링크가 있습니다. 링크를 통해 예약하면 이용자 추가 부담 없이 저희가 수수료를 받을 수 있습니다. 링크를 누르면 제휴 식별자와 함께 파트너 사이트로 이동하며, 이용자의 이름·이메일·여행 콘텐츠는 전달하지 않습니다. 파트너 사이트에서는 해당 사업자의 약관과 개인정보 정책이 적용됩니다.",
        ],
      },
      {
        no: 9, title: "공개 공유 범위",
        paragraphs: [
          "여행과 스토리는 기본 비공개입니다. 공개로 설정하거나 링크를 공유하면, 공유 화면에는 이용자가 공개하기로 한 일정 내용만 표시되며 이메일·기기 식별자·숙소 도착 시각은 포함되지 않습니다. 공개 일정은 다른 이용자가 자신의 기기로 복사할 수 있고, 복사본에는 원래 제목과 여행 날짜가 옮겨지지 않습니다. 기억에 붙인 사진은 그 기억을 명시적으로 공개로 표시한 경우에만 공개 화면에 나타납니다.",
        ],
      },
      {
        no: 10, title: "보관기간과 파기",
        paragraphs: [
          "앱에서 삭제한 콘텐츠는 저장된 사진 파일을 포함해 즉시 삭제됩니다. 삭제하지 않은 콘텐츠는 이용자가 삭제하거나 삭제를 요청할 때까지 보관되며, 여행 데이터를 자동으로 만료시키지 않습니다.",
          "문의 기록은 접수한 날부터 6개월, 신고 기록은 처리가 끝난 날부터 6개월 보관한 뒤 지체 없이 파기합니다. 처리 중인 신고는 처리가 끝날 때까지 보관합니다. 이 기간은 서비스가 정한 운영 기준이며, 보관 목적이 없어지거나 적법한 삭제 요청을 받으면 기간 전이라도 삭제합니다. 운영자 메일함에 받은 문의 알림 메일도 해당 문의와 함께 삭제합니다.",
          "인프라 제공사의 기술 로그: 웹사이트 서버 기능의 실행 로그는 저장하지 않으며, 데이터베이스 제공사의 API·데이터베이스 로그는 현재 요금제에서 1일간 보관됩니다. 현재 데이터베이스 자동 백업을 사용하지 않아 삭제한 정보가 백업에서 복구되지 않습니다. 메일 발송 서비스의 발송 기록은 현재 요금제에서 30일간 보관됩니다.",
          "파기 방법: 데이터베이스에서 기록을 삭제하고, 사진 파일은 저장소에서 삭제합니다.",
        ],
      },
      {
        no: 11, title: "이용자의 권리",
        paragraphs: [
          "일정·저장 장소·나의 장소·사진·메모는 언제든 앱에서 직접 열람·수정·삭제할 수 있고, 공개 설정도 언제든 끌 수 있습니다. 심사 중인 장소 제보는 철회할 수 있습니다.",
          "앱에서 할 수 없는 요청(문의·신고 기록의 열람·정정·삭제 포함)은 support@gokoreamate.com 또는 앱 안의 '문의하기'로 보내 주세요. 요청을 받으면 지체 없이 조치하고, 요청을 받은 날부터 10일 이내에 요청하신 이메일 주소로 결과를 알려드립니다. 계정이 없는 서비스이므로 기록을 찾고 본인의 요청인지 확인하기 위해 공유 링크나 문의 날짜 같은 정보를 여쭐 수 있습니다.",
        ],
      },
      {
        no: 12, title: "보안조치",
        paragraphs: [
          "모든 연결은 암호화(HTTPS)됩니다. 여행·사진·장소의 변경은 그 콘텐츠를 만든 기기인지 확인하는 서버 기능을 거칩니다. 사진은 비공개 저장소에 보관되며 공개 URL 이 아닌 만료되는 서명 링크로만 제공됩니다.",
        ],
      },
      {
        no: 13, title: "방침 변경 고지",
        paragraphs: [
          "방침이 변경되면 새 시행일과 함께 이 페이지에 게시합니다. 중요한 변경은 서비스 안에서 안내합니다.",
          `개정 이력: ${PUBLIC_PRIVACY_FIRST_DATE} 최초 게시 · ${PUBLIC_PRIVACY_EFFECTIVE_DATE} 개정 — Google Analytics 를 수집·이용과 국외 이전 두 가지 선택 동의를 모두 한 경우에만 사용(제6·7조).`,
        ],
      },
      {
        no: 14, title: "문의처",
        paragraphs: [
          "개인정보 관련 문의·요청은 아래로 연락해 주세요:",
          "이메일: support@gokoreamate.com · 또는 앱 안의 ‘문의하기’ 양식",
        ],
      },
    ],
  },

  ja: {
    title: "プライバシーポリシー",
    effectiveDate: PUBLIC_PRIVACY_EFFECTIVE_DATE,
    lastUpdated: PUBLIC_PRIVACY_EFFECTIVE_DATE,
    intro: [
      "本プライバシーポリシーは、gokoreamate がどのような情報をなぜ取り扱い、利用者がどのような選択をできるかを説明します。gokoreamate は韓国の旅行先探し、日ごとの旅程作成、旅の記録の保管のための旅行計画サービスです。現在サービスにはログイン・アカウント機能がなく、利用者が作成した内容はこの端末のブラウザに紐づきます。",
    ],
    sections: [
      {
        no: 1, title: "サービス運営者",
        paragraphs: [
          `gokoreamate は大韓民国の個人事業者「케이이엔지」（登録商号の韓国語表記）が運営しています。住所：${ADDR}（大韓民国釜山）`,
          "個人情報保護担当：케이이엔지 個人情報保護担当（개인정보보호 담당）・support@gokoreamate.com",
        ],
      },
      {
        no: 2, title: "取り扱う情報",
        paragraphs: ["サービスの運営に必要な情報のみを取り扱います："],
        items: [
          "利用者が作成する旅行コンテンツ：旅程（都市・日付・場所・タイトル）、保存した場所、自分で登録した場所（名前・メモ・位置・写真）、旅行の写真とメモ、ストーリー、公開設定。",
          "端末識別子：ブラウザでランダムに作成される値（ハードウェアに由来せず、氏名とも結び付きません）。利用者が作成したコンテンツや反応が利用者のものであることを識別するために一緒に保存し、一部の記録にはこの値を変換した値を保存します。",
          "利用者が送った「いいね」「よくないね」「役に立った」表示・反応・保存・場所の提案。",
          "お問い合わせ：メールアドレス、メッセージ、任意入力の氏名、お問い合わせに関連するページ・場所、ブラウザの言語。",
          "通報（任意）：通報理由、任意入力のメモ（最大500文字）、同じ端末からの重複通報を防ぐために端末識別子と通報対象から計算したキー。メモには個人情報を書かないでください。",
          "自動収集：ホスティング事業者が保管する基本的な技術ログ（IPアドレス・リクエスト情報など）と利用統計（第7条）。",
        ],
      },
      {
        no: 3, title: "収集しない情報",
        paragraphs: [],
        items: [
          "パスワード・ログイン情報 — 現在ログイン機能はありません。",
          "生年月日・性別・電話番号・自宅住所・連絡先リスト。",
          "決済・カード情報 — 現在有料機能はありません。",
          "バックグラウンドや常時の位置追跡。「近く」機能を使うとき、ブラウザの位置はこの端末内で近くの場所を並べ替えるためだけに使われ、サーバーには送られません。",
        ],
      },
      {
        no: 4, title: "利用目的",
        paragraphs: [],
        items: [
          "旅行コンテンツ・端末識別子：サービスの提供 — 旅程・場所・写真・ストーリーを本人に、また利用者が共有を選んだ場合にのみ他の人に表示するために使います。",
          "反応・通報：反応の集計、通報された対象の確認・対応、同じ端末からの繰り返し通報の区別に使います。",
          "お問い合わせ内容：お問い合わせの確認と返信に使います。",
          "利用統計：機能の利用状況の把握とサービス改善に使います。",
        ],
      },
      {
        no: 5, title: "AI機能",
        paragraphs: [
          "AI支援機能は現在、運用中のサービスでオフになっています。旅程作成はAIなしで動作し、AI事業者には何も送信しません。",
        ],
      },
      {
        no: 6, title: "処理の委託と国外での処理",
        paragraphs: ["個人情報の処理を委託している事業者と処理の場所："],
        items: [
          "Supabase（データベース・写真の保存）— 旅行コンテンツと写真を大韓民国ソウルリージョン（AWS ap-northeast-2）に保存します。同社のプライバシーポリシー上の運営法人：Supabase Pte. Ltd.（シンガポール）、連絡先 privacy@supabase.com。利用者が削除するまで保管します。",
          "Cloudflare（ウェブサイトの配信・サーバー機能の実行・Cookieを使わない訪問統計）— Cloudflare, Inc.（米国、101 Townsend St, San Francisco, CA 94107）、連絡先 dpo@cloudflare.com。サービスを利用するたびに、リクエスト情報（IPアドレス・リクエスト内容など）が国外の近くのCloudflare拠点で処理されることがあります。",
          "Google（Google Analytics 利用統計、利用者が同意した場合のみ）— Google LLC（米国）、お問い合わせ https://support.google.com/policies。",
          "Resend（運営者宛てのお問い合わせ通知メールの送信）— Plus Five Five, Inc.、同社の方針上米国で処理、連絡先 support@resend.com。現在、お問い合わせ通知メールには利用者が入力した氏名・メールアドレス・メッセージが含まれます。",
          "処理の方法・時期・保存期間：サービスを利用するたびに、各業務に必要な情報が暗号化された接続（HTTPS）で送信されます。保存期間は、Supabase は利用者が削除するまで、Resend の配信記録は現在のプランで30日、Google Analytics はイベントデータ2か月・ユーザーデータ14か月で、Cloudflare はサーバー機能の実行ログを保存しません（各事業者が自社の方針で保存するログは別途）。",
          "拒否の方法と影響：Google Analytics は、初回訪問時に表示される案内で収集・利用への同意と国外移転への同意の両方をした場合にのみ使用します。同意しない、「すべて拒否」を選ぶ、または後で「その他 › 利用統計」でどちらかをオフにすると、その時点から Google Analytics へは何も送信されず、このサイトの Google Analytics の Cookie は削除され、すべての機能をそのまま利用できます。Supabase・Cloudflare による処理はサービスの提供に必要なため、拒否する場合はサービスの利用を中止する必要があり、既に保存された情報の削除を依頼できます。お問い合わせをメール送信サービスを経由させたくない場合は、フォームの代わりに support@gokoreamate.com へ直接ご連絡ください。",
        ],
      },
      {
        no: 7, title: "分析ツール・地図・Cookie・ブラウザストレージ",
        paragraphs: [
          "利用統計には、利用者が同意した場合にのみ Google Analytics 4 を使用します。同意は、個人情報の収集・利用への同意（個人情報保護法第15条第1項第1号）と国外移転への同意（第28条の8第1項第1号）の2つを別々にいただき、両方に同意した場合にのみ Google Analytics を読み込みます。選択する前、「後で決める」を選んだ場合、どちらか一方にのみ同意した場合は、Google Analytics のスクリプトを読み込まないため、Google へは何も送信されず、Google Analytics の Cookie も設定されません。両方に同意すると、利用のたびに訪問情報（Cookie 識別子、閲覧した画面と使った機能、端末・ブラウザ情報、Google がおおよその地域の推定に使う IP アドレス）が米国の Google LLC に送信されます。「その他 › 利用統計」でいつでも変更・撤回でき、撤回するとその時点から送信を止め、このサイトの Google Analytics の Cookie を削除します。すでに送信された統計は撤回によって直ちに削除されず、下記の保管期間が過ぎると削除されます。案内の内容が変わった場合は、以前の選択を適用せず改めてお尋ねします。14歳未満の方には同意しないよう案内していますが、年齢の確認は行っていません。Google Analytics の設定では、イベントデータは2か月、ユーザーデータは14か月保管され、ユーザーが再び利用するとユーザーデータの保管期間が改めて始まります。分析イベントには機能・場所レベルの情報（例：都市名、公開場所の識別子）のみを含み、メールアドレスや氏名は含みません。",
          "Cloudflare Web Analytics は Cookie を使わずブラウザのパフォーマンス情報で訪問を集計し、Cloudflare は訪問者の個人データを収集・利用しないとしています。",
          "地図は NAVER 地図で表示します。地図が表示されるとき、ブラウザが NAVER のサーバーに直接接続するため、NAVER は IP アドレスなど一般的な接続情報を受け取ります。一部の画像は観光公式サイトから直接読み込まれ、そのサイトも接続情報を受け取ります。",
          "サービス自体は Cookie を設定しません。ブラウザのローカルストレージには、端末識別子・作成中の旅程・保存した場所・案内の表示状態・言語設定が保存されます。ブラウザのストレージを消去すると、この端末から該当情報が削除されます。",
        ],
      },
      {
        no: 8, title: "アフィリエイトリンクと外部サービス",
        paragraphs: [
          "一部の画面には旅行パートナー（現在 Agoda・Trip.com・Klook・KKday）のアフィリエイトリンクがあります。リンクから予約すると、利用者の追加負担なく当サービスが手数料を受け取ることがあります。リンクをクリックするとアフィリエイト識別子とともにパートナーサイトへ移動し、利用者の氏名・メールアドレス・旅行コンテンツは渡しません。パートナーサイトでは各事業者の規約とプライバシーポリシーが適用されます。",
        ],
      },
      {
        no: 9, title: "公開共有の範囲",
        paragraphs: [
          "旅程とストーリーは初期設定で非公開です。公開に設定するかリンクを共有すると、共有画面には利用者が公開すると決めた旅程内容のみが表示され、メールアドレス・端末識別子・宿泊先の到着時刻は含まれません。公開旅程は他の利用者が自分の端末にコピーでき、コピーには元のタイトルと旅行日程は引き継がれません。記録に付けた写真は、その記録を明示的に公開とした場合にのみ公開画面に表示されます。",
        ],
      },
      {
        no: 10, title: "保存期間と破棄",
        paragraphs: [
          "アプリで削除したコンテンツは、保存された写真ファイルを含め直ちに削除されます。削除していないコンテンツは、利用者が削除するか削除を依頼するまで保存され、旅行データを自動で失効させることはありません。",
          "お問い合わせの記録は受付日から6か月、通報の記録は処理完了日から6か月保管した後、遅滞なく破棄します。処理中の通報は処理が終わるまで保管します。この期間はサービスが定めた運用基準であり、保管目的がなくなった場合や適法な削除の依頼を受けた場合は期間前でも削除します。運営者のメールボックスで受け取ったお問い合わせ通知メールも、該当するお問い合わせと一緒に削除します。",
          "インフラ事業者の技術ログ：ウェブサイトのサーバー機能の実行ログは保存せず、データベース事業者のAPI・データベースログは現在のプランで1日間保存されます。現在データベースの自動バックアップは使用しておらず、削除した情報がバックアップから復元されることはありません。メール送信サービスの配信記録は現在のプランで30日間保管されます。",
          "破棄の方法：データベースから記録を削除し、写真ファイルはストレージから削除します。",
        ],
      },
      {
        no: 11, title: "利用者の権利",
        paragraphs: [
          "旅程・保存した場所・自分の場所・写真・メモは、いつでもアプリで直接閲覧・編集・削除でき、公開設定もいつでもオフにできます。審査中の場所の提案は取り下げられます。",
          "アプリでできない依頼（お問い合わせ・通報記録の閲覧・訂正・削除を含む）は、support@gokoreamate.com またはアプリ内の「お問い合わせ」へお送りください。依頼を受けたら遅滞なく対応し、受領日から10日以内に、ご依頼いただいたメールアドレスへ結果をお知らせします。アカウントのないサービスのため、記録を特定しご本人の依頼であることを確認するために、共有リンクやお問い合わせの日付などをお尋ねすることがあります。",
        ],
      },
      {
        no: 12, title: "安全対策",
        paragraphs: [
          "すべての接続は暗号化（HTTPS）されます。旅程・写真・場所の変更は、そのコンテンツを作成した端末であることを確認するサーバー機能を経由します。写真は非公開ストレージに保管され、公開URLではなく期限付きの署名リンクでのみ提供されます。",
        ],
      },
      {
        no: 13, title: "ポリシー変更の告知",
        paragraphs: [
          "ポリシーを変更する場合は、新しい施行日とともに本ページに掲載します。重要な変更はサービス内でお知らせします。",
          `改定履歴：${PUBLIC_PRIVACY_FIRST_DATE} 初回掲載・${PUBLIC_PRIVACY_EFFECTIVE_DATE} 改定 — Google Analytics を、収集・利用と国外移転の2つの任意の同意を両方いただいた場合にのみ使用（第6・7条）。`,
        ],
      },
      {
        no: 14, title: "お問い合わせ",
        paragraphs: [
          "プライバシーに関するご質問・ご依頼は下記までご連絡ください：",
          "メール：support@gokoreamate.com、またはアプリ内の「お問い合わせ」フォーム",
        ],
      },
    ],
  },

  zh: {
    title: "隐私政策",
    effectiveDate: PUBLIC_PRIVACY_EFFECTIVE_DATE,
    lastUpdated: PUBLIC_PRIVACY_EFFECTIVE_DATE,
    intro: [
      "本隐私政策说明 gokoreamate 处理哪些信息、出于什么目的，以及你可以作出哪些选择。gokoreamate 是用于探索韩国目的地、制定每日行程和保存旅行回忆的旅行规划服务。目前服务没有登录或账户功能，你创建的内容与此设备的浏览器关联。",
    ],
    sections: [
      {
        no: 1, title: "服务运营方",
        paragraphs: [
          `gokoreamate 由大韩民国个体经营者“케이이엔지”（以韩文登记商号表示）运营。地址：${ADDR}（大韩民国釜山）`,
          "个人信息保护负责窗口：케이이엔지 个人信息保护负责（개인정보보호 담당）· support@gokoreamate.com",
        ],
      },
      {
        no: 2, title: "我们处理的信息",
        paragraphs: ["我们只处理运营服务所需的信息："],
        items: [
          "你创建的旅行内容：行程（城市、日期、地点、标题）、收藏的地点、你自己登记的地点（名称、备注、位置、照片）、旅行照片与备注、故事以及公开设置。",
          "设备标识符：在浏览器中随机生成的值（不源自硬件，也不与你的姓名关联）。它与你创建的内容和互动一同保存，以便识别这些内容属于你；部分记录中保存的是由该值转换而来的值。",
          "你发送的点赞、不喜欢、“有帮助”标记、互动、收藏和地点提议。",
          "联系表单：邮箱地址、留言、选填的姓名、与咨询相关的页面或地点，以及浏览器语言。",
          "举报（可选）：举报原因、选填备注（最多 500 字），以及为防止同一设备重复举报而由设备标识符和举报对象计算出的键。请不要在备注中填写个人信息。",
          "自动收集：托管服务商保存的基本技术日志（如 IP 地址和请求信息）以及使用统计（第 7 条）。",
        ],
      },
      {
        no: 3, title: "我们不收集的信息",
        paragraphs: [],
        items: [
          "密码或登录凭证——目前没有登录功能。",
          "出生日期、性别、电话号码、住址或通讯录。",
          "付款或银行卡信息——目前没有付费功能。",
          "后台或持续的位置追踪。使用“附近”功能时，浏览器位置只在本设备上用于为附近地点排序，不会发送到我们的服务器。",
        ],
      },
      {
        no: 4, title: "使用目的",
        paragraphs: [],
        items: [
          "旅行内容与设备标识符：提供服务——向你本人展示行程、地点、照片和故事，并仅在你选择分享时向他人展示。",
          "互动与举报：用于统计互动、审核和处理被举报的内容，以及区分同一设备的重复举报。",
          "咨询内容：用于确认并回复咨询。",
          "使用统计：用于了解功能使用情况并改进服务。",
        ],
      },
      {
        no: 5, title: "AI 功能",
        paragraphs: [
          "AI 辅助功能目前在正式服务中处于关闭状态。制定行程无需 AI，不会向 AI 服务商发送任何内容。",
        ],
      },
      {
        no: 6, title: "委托处理与境外处理",
        paragraphs: ["受托处理个人信息的服务商及处理地点："],
        items: [
          "Supabase（数据库、照片存储）——将旅行内容和照片存储在韩国首尔区域（AWS ap-northeast-2）。其隐私政策载明的运营法人：Supabase Pte. Ltd.（新加坡），联系方式 privacy@supabase.com。保存至你删除为止。",
          "Cloudflare（网站分发、服务器功能运行、不使用 Cookie 的访问统计）——Cloudflare, Inc.（美国，101 Townsend St, San Francisco, CA 94107），联系方式 dpo@cloudflare.com。每次使用服务时，请求信息（IP 地址、请求内容等）可能在境外就近的 Cloudflare 节点处理。",
          "Google（Google Analytics 使用统计，仅在你同意时）——Google LLC（美国），联系 https://support.google.com/policies。",
          "Resend（向运营方发送咨询通知邮件）——Plus Five Five, Inc.，其政策载明在美国处理，联系方式 support@resend.com。目前咨询通知邮件包含你填写的姓名、邮箱和留言。",
          "处理方式、时间与保存期限：每次使用服务时，完成相应工作所需的信息都会通过加密连接（HTTPS）传输。保存期限：Supabase 保存至你删除为止；Resend 的发送记录在当前套餐下保存 30 天；Google Analytics 的事件数据保存 2 个月、用户数据保存 14 个月；Cloudflare 不保存我们服务器功能的运行日志（各服务商依其自身政策保存的日志另计）。",
          "拒绝方式与后果：只有在你于首次访问时显示的提示中同时同意收集和使用以及境外转移后，我们才使用 Google Analytics。如果不同意、选择“全部拒绝”，或之后在“更多 › 使用统计”中关闭任意一项，则从那时起不会向 Google Analytics 发送任何信息，本网站的 Google Analytics Cookie 会被删除，且全部功能仍可照常使用。Supabase 与 Cloudflare 的处理是提供服务所必需的，如需拒绝则须停止使用服务，并可请求删除已保存的信息。如果不希望咨询经过邮件发送服务，请不使用表单，直接发送邮件至 support@gokoreamate.com。",
        ],
      },
      {
        no: 7, title: "分析工具、地图、Cookie 与浏览器存储",
        paragraphs: [
          "仅在你同意时，我们才使用 Google Analytics 4 进行使用统计。我们分别征求两项同意——收集和使用个人信息的同意（《个人信息保护法》第15条第1款第1项）以及向境外转移的同意（第28条之8第1款第1项）——只有两项都同意时才会加载 Google Analytics。在你作出选择之前、选择“稍后决定”时，或只同意其中一项时，我们不会加载 Google Analytics 脚本，不会向 Google 发送任何信息，也不会设置 Google Analytics Cookie。两项都同意后，每次使用时，访问信息（Cookie 标识符、浏览的页面和使用的功能、设备与浏览器信息，以及 Google 用于估算大致地区的 IP 地址）会发送至美国的 Google LLC。你可随时在“更多 › 使用统计”中更改或撤回；撤回后将从那时起停止发送，并删除本网站的 Google Analytics Cookie。已发送的统计不会因撤回而立即删除，而是在下述保存期限届满后删除。提示内容发生变化时，我们不会沿用你之前的选择，而会重新询问。我们提示未满 14 周岁者不要同意，但不核实年龄。按我们的 Google Analytics 设置，事件数据保存 2 个月，用户数据保存 14 个月；用户再次使用时，用户数据的保存期限重新计算。分析事件仅包含功能和地点层面的信息（例如城市名、公开地点的标识），不包含你的邮箱或姓名。",
          "Cloudflare Web Analytics 不使用 Cookie，而是通过浏览器性能信息统计访问；Cloudflare 表示不收集或使用访客的个人数据。",
          "地图通过 NAVER 地图显示。显示地图时，浏览器会直接连接 NAVER 的服务器，NAVER 会收到 IP 地址等一般连接信息。部分图片直接从官方旅游网站加载，这些网站同样会收到连接信息。",
          "服务本身不设置 Cookie。浏览器本地存储中保存设备标识符、正在编辑的行程、收藏的地点、提示显示状态和语言选择。清除浏览器存储会从此设备上删除这些信息。",
        ],
      },
      {
        no: 8, title: "联盟链接与外部服务",
        paragraphs: [
          "部分页面包含旅行合作伙伴（目前为 Agoda、Trip.com、Klook、KKday）的联盟链接。通过这些链接预订时，我们可能获得佣金，你无需支付额外费用。点击链接后会带着联盟标识跳转到合作伙伴网站，我们不会传递你的姓名、邮箱或旅行内容。合作伙伴网站适用其各自的条款和隐私政策。",
        ],
      },
      {
        no: 9, title: "公开分享范围",
        paragraphs: [
          "行程和故事默认不公开。设为公开或分享链接时，分享页面只显示你选择公开的行程内容，不包括你的邮箱、设备标识符或住宿抵达时间。其他用户可以将公开行程复制到自己的设备，复制时不会带走原标题和旅行日期。附在回忆中的照片，只有在你明确将该回忆设为公开时才会出现在公开页面上。",
        ],
      },
      {
        no: 10, title: "保存期限与销毁",
        paragraphs: [
          "你在应用内删除的内容（包括已存储的照片文件）会被立即删除。未删除的内容将保存至你删除或请求删除为止，服务不会自动使旅行数据过期。",
          "咨询记录自受理之日起保存 6 个月，举报记录自处理完成之日起保存 6 个月，之后将及时销毁。处理中的举报保存至处理完毕。该期限是服务自行确定的运营标准；当保存目的不再存在或收到合法删除请求时，即使未到期也会删除。运营方邮箱中收到的咨询通知邮件也会随相应咨询一并删除。",
          "基础设施服务商的技术日志：网站服务器功能的运行日志不予保存；数据库服务商的 API 与数据库日志在当前套餐下保存 1 天。目前未使用数据库自动备份，已删除的信息不会从备份中恢复。邮件发送服务的发送记录在当前套餐下保存 30 天。",
          "销毁方式：从数据库中删除记录，并从存储中删除照片文件。",
        ],
      },
      {
        no: 11, title: "你的权利",
        paragraphs: [
          "你可以随时在应用内直接查看、修改和删除行程、收藏的地点、你的地点、照片和备注，也可以随时关闭公开设置。审核中的地点提议可以撤回。",
          "无法在应用内完成的请求（包括查看、更正或删除咨询与举报记录），请发送至 support@gokoreamate.com 或使用应用内的“联系我们”。我们收到请求后会及时处理，并在收到之日起 10 日内将结果发送到你提出请求时使用的邮箱。由于服务没有账户，为了找到相关记录并确认是你本人的请求，我们可能会询问分享链接或咨询日期等信息。",
        ],
      },
      {
        no: 12, title: "安全措施",
        paragraphs: [
          "所有连接均经过加密（HTTPS）。行程、照片和地点的修改须经过服务器功能确认是创建该内容的设备。照片保存在私有存储中，仅通过有时效的签名链接提供，而非公开 URL。",
        ],
      },
      {
        no: 13, title: "政策变更通知",
        paragraphs: [
          "政策如有变更，将连同新的生效日期发布在本页面。重大变更将在服务内另行通知。",
          `修订记录：${PUBLIC_PRIVACY_FIRST_DATE} 首次发布 · ${PUBLIC_PRIVACY_EFFECTIVE_DATE} 修订——仅在你同时给出收集和使用以及境外转移两项可选同意时才使用 Google Analytics（第 6、7 条）。`,
        ],
      },
      {
        no: 14, title: "联系我们",
        paragraphs: [
          "有关隐私的问题或请求，请联系：",
          "邮箱：support@gokoreamate.com，或使用应用内的“联系我们”表单",
        ],
      },
    ],
  },
};
