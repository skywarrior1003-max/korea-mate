// 개인정보처리방침 본문 (PRIVACY-TERMS-V1) — 2026-09-26 코드 감사 기준.
//
// 모든 서술은 저장소·설정·Production 실측으로 확인된 사실이다. 근거(감사 보고
// DATA FLOW AUDIT):
//  · Google 로그인 scope = openid·email·profile 만(auth-client, 가드 테스트 고정)
//  · 저장소 = Supabase(AWS ap-northeast-2 서울)·Cloudflare(호스팅/CDN)·GA4 활성
//  · AdSense 스크립트 미로드·자체 쿠키 0(document.cookie 사용 0)
//  · 사진 = 비공개 bucket + 서명 URL·반응(like/save)은 raw 기기값 대신 해시 저장
//  · AI 는 Production 에서 전면 비활성(2026-09-25 릴리스) — 조건부 서술만
//  · 계정 삭제 기능 미구현(콘텐츠 개별 삭제는 구현) — 사실대로 기술
// Owner 확정 전 항목은 ownerInput 마커로만 둔다(임의 작성 금지).

import type { LegalDocSet } from "./legal-types";

export const PRIVACY: LegalDocSet = {
  en: {
    title: "Privacy Policy",
    effectiveDate: null,
    lastUpdated: null,
    intro: [
      "This Privacy Policy explains what information gokoreamate collects, how it is used, and the choices you have. gokoreamate is a travel planning service for exploring Korea, building day-by-day itineraries, and keeping travel memories.",
    ],
    sections: [
      {
        no: 1, title: "Who operates this service",
        paragraphs: [],
        ownerInput: "운영 주체(개인/법인 명칭·영문 표기·공개 가능 주소·개인정보 보호책임자) 확정 필요",
      },
      {
        no: 2, title: "Information we collect",
        paragraphs: ["We collect only what is needed to run the service:"],
        items: [
          "Google sign-in (optional): when you choose to sign in with Google, we receive your Google account identifier, name, email address, and profile image link through our authentication provider (Supabase Auth). We never receive or store your Google password.",
          "Travel content you create: itineraries (city, dates, places, titles), saved places, your own places with the name, notes, location, and photos you add, trip photos and memos, stories, and your sharing settings.",
          "Contact form: the name, email address, and message you submit when contacting us.",
          "Automatically: a random device identifier created in your browser to keep your trips on your device (it is not derived from your hardware and is not linked to your name), basic technical logs kept by our hosting provider, and anonymous usage statistics (see Section 8).",
        ],
      },
      {
        no: 3, title: "Information we do not collect",
        paragraphs: [],
        items: [
          "Passwords — Google sign-in never shares your password with us.",
          "Date of birth, gender, phone number, postal address, or your contact list.",
          "Payment or card details — the service currently has no paid features.",
          "Background or continuous location tracking — location data exists only for places you explicitly add or select.",
          "Google Drive, Calendar, or any Google data beyond basic sign-in identity.",
        ],
      },
      {
        no: 4, title: "How we use your information",
        paragraphs: [],
        items: [
          "Sign-in information: to keep you signed in and to associate optional AI usage allowances safely with your account.",
          "Travel content: to provide the service itself — showing your trips, places, photos, and stories back to you and, only when you choose, to people you share them with.",
          "Contact form entries: to read and respond to your inquiry.",
          "Usage statistics: to understand which features are used and improve the service.",
        ],
      },
      {
        no: 5, title: "Google sign-in details",
        paragraphs: [
          "Sign-in uses Google OAuth with the minimum identity scope (OpenID, email, profile). We do not request access to any other Google data, do not request offline access, and do not store Google access or refresh tokens in our own database. Your Google name, email, and profile information are not used for advertising and are not sold.",
        ],
      },
      {
        no: 6, title: "AI features and data sent to AI providers",
        paragraphs: [
          "AI-assisted features (such as itinerary personalization and writing suggestions) are currently disabled in production. Basic itinerary creation works without any AI and sends nothing to AI providers.",
          "If AI features are enabled in the future, they will work as follows, and this policy will be updated before launch: requests are sent to Google's Gemini API. What is sent is limited to the travel context needed for the feature — city, travel dates, travel preferences, and the identifiers, names, and categories of places you selected. The names and precise coordinates of your private personal places are not sent. The writing assistant sends the place name, city, and the note you are editing; the photo caption feature sends the single photo you chose, only when you use it. AI requests never include your email address.",
        ],
      },
      {
        no: 7, title: "Where your data is stored and processed",
        paragraphs: [
          "Your account, travel content, and photos are stored with Supabase on servers located in Seoul, South Korea (AWS ap-northeast-2). Photos are kept in private storage and served through expiring signed links, not public URLs.",
          "The website is delivered through Cloudflare's global network, which processes standard technical logs at edge locations worldwide. Google processes sign-in requests and analytics, and would process AI requests if AI features are enabled; Google may process data outside your country under its own policies.",
        ],
      },
      {
        no: 8, title: "Analytics, cookies, and browser storage",
        paragraphs: [
          "We use Google Analytics 4 to collect anonymous usage statistics. Analytics events contain feature and place-level information (for example, a city name or a public place identifier) and never contain your email, name, sign-in tokens, or account identifier. Google Analytics sets its own cookies; you can block them with browser settings or Google's opt-out tools.",
          "The service itself sets no cookies of its own. Your browser's local storage keeps: the device identifier, your trip in progress, saved places, tutorial state, language choice, and — if you sign in — your session managed by our authentication provider. Clearing your browser storage removes these from your device.",
        ],
      },
      {
        no: 9, title: "Affiliate links and external services",
        paragraphs: [
          "Some pages contain affiliate links to travel partners (currently Agoda, Trip.com, Klook, and KKday). If you follow one and make a booking, we may earn a commission at no extra cost to you. Clicking such a link takes you to the partner's site with an affiliate identifier; we do not send them your name, email, or travel content. The partner's own terms and privacy policy apply on their site.",
        ],
      },
      {
        no: 10, title: "Public sharing",
        paragraphs: [
          "Trips and stories are private by default. If you set a trip public or share a link, the shared view shows the itinerary content you chose to publish — it does not include your email, your device identifier, or your accommodation arrival time. Other users may copy a public itinerary into their own account; copies do not carry your title or travel dates. Photos attached to a memory appear publicly only after you explicitly mark that memory public.",
        ],
      },
      {
        no: 11, title: "Retention",
        paragraphs: [
          "Content you delete in the app is deleted immediately, including the stored photo files. Content you keep remains stored until you delete it or request deletion; the service does not currently auto-expire your travel data.",
        ],
        ownerInput: "보관기간 정책 확정 필요 — 문의(contact) 기록 보관기간, 미이용 계정 처리, 로그 보관기간",
      },
      {
        no: 12, title: "Your rights and deletion",
        paragraphs: [
          "You can view, edit, and delete your itineraries, saved places, personal places, photos, and memos directly in the app at any time. Signing out does not delete anything.",
          "A self-service account deletion feature is not yet available. Until it is, account and data deletion requests are handled manually through the contact channel below.",
        ],
        ownerInput: "삭제 요청 접수 채널(실제 수신 이메일 또는 절차)·처리 기한 확정 필요",
      },
      {
        no: 13, title: "Children",
        paragraphs: [],
        ownerInput: "미성년자(만 14세 미만 포함) 이용 정책·연령 기준 확정 필요",
      },
      {
        no: 14, title: "Security",
        paragraphs: [
          "Access to stored data is restricted: the database blocks direct public access and all reads and writes pass through our server APIs, which verify ownership. Sign-in sessions are verified server-side on every protected request. Photos are private by default and served only through short-lived signed links. Where identifiers are used for reactions and statistics, we store one-way hashes instead of raw values.",
        ],
      },
      {
        no: 15, title: "Changes to this policy",
        paragraphs: [
          "If this policy changes, the updated version will be posted on this page with a new revision date. For significant changes we will provide notice within the service.",
        ],
      },
      {
        no: 16, title: "Contact",
        paragraphs: ["For privacy questions or requests, contact us at:"],
        ownerInput: "개인정보 문의를 실제로 수신할 이메일 주소 확정 필요 (앱 내 문의 폼 존재 — 병기 여부 Owner 결정)",
      },
    ],
  },

  ko: {
    title: "개인정보처리방침",
    effectiveDate: null,
    lastUpdated: null,
    intro: [
      "이 개인정보처리방침은 gokoreamate 가 어떤 정보를 수집하고, 어떻게 사용하며, 이용자가 어떤 선택을 할 수 있는지 설명합니다. gokoreamate 는 한국 여행 탐색, 일자별 일정 만들기, 여행 기억 보관을 위한 여행 계획 서비스입니다.",
    ],
    sections: [
      { no: 1, title: "서비스 운영 주체", paragraphs: [], ownerInput: "운영 주체(개인/법인 명칭·영문 표기·공개 가능 주소·개인정보 보호책임자) 확정 필요" },
      {
        no: 2, title: "수집하는 개인정보",
        paragraphs: ["서비스 운영에 필요한 정보만 수집합니다:"],
        items: [
          "Google 로그인(선택): Google 로그인을 선택하면 인증 제공자(Supabase Auth)를 통해 Google 계정 식별자·이름·이메일 주소·프로필 이미지 링크를 받습니다. Google 비밀번호는 어떤 경우에도 받거나 저장하지 않습니다.",
          "이용자가 만드는 여행 콘텐츠: 일정(도시·날짜·장소·제목), 저장한 장소, 직접 등록한 나의 장소(이름·메모·위치·사진), 여행 사진과 메모, 스토리, 공개 설정.",
          "문의하기: 문의 시 입력한 이름·이메일 주소·메시지.",
          "자동 수집: 여행 데이터를 이 기기에 연결하기 위해 브라우저에서 생성되는 무작위 기기 식별자(하드웨어에서 파생되지 않으며 이름과 결합되지 않음), 호스팅 사업자가 보관하는 기본 기술 로그, 익명 사용 통계(제8조 참조).",
        ],
      },
      {
        no: 3, title: "수집하지 않는 정보",
        paragraphs: [],
        items: [
          "비밀번호 — Google 로그인은 비밀번호를 저희에게 전달하지 않습니다.",
          "생년월일·성별·전화번호·주소·연락처 목록.",
          "결제·카드 정보 — 현재 유료 기능이 없습니다.",
          "백그라운드·상시 위치 추적 — 위치 정보는 이용자가 직접 추가·선택한 장소에만 존재합니다.",
          "Google Drive·캘린더 등 기본 신원 확인 외의 Google 데이터.",
        ],
      },
      {
        no: 4, title: "이용 목적",
        paragraphs: [],
        items: [
          "로그인 정보: 로그인 상태 유지와, 선택형 AI 이용권을 계정에 안전하게 귀속하기 위해 사용합니다.",
          "여행 콘텐츠: 서비스 제공 자체 — 이용자의 일정·장소·사진·스토리를 본인에게, 그리고 이용자가 선택한 경우에만 공유 상대에게 보여주기 위해 사용합니다.",
          "문의 내용: 문의 확인과 회신에 사용합니다.",
          "사용 통계: 기능 사용 현황 파악과 서비스 개선에 사용합니다.",
        ],
      },
      {
        no: 5, title: "Google 로그인 상세",
        paragraphs: [
          "로그인은 Google OAuth 의 최소 신원 범위(OpenID·이메일·프로필)만 사용합니다. 그 외 Google 데이터 접근을 요청하지 않고, 오프라인 접근을 요청하지 않으며, Google 액세스/리프레시 토큰을 자체 데이터베이스에 저장하지 않습니다. Google 이름·이메일·프로필 정보는 광고에 사용하지 않으며 판매하지 않습니다.",
        ],
      },
      {
        no: 6, title: "AI 기능과 AI 제공업체 전송 정보",
        paragraphs: [
          "AI 보조 기능(일정 개인화·글쓰기 제안 등)은 현재 운영 환경에서 비활성화되어 있습니다. 기본 일정 만들기는 AI 없이 동작하며 AI 제공업체로 아무것도 전송하지 않습니다.",
          "향후 AI 기능이 활성화되면 다음과 같이 동작하며, 출시 전 본 방침을 갱신합니다: 요청은 Google Gemini API 로 전송됩니다. 전송 항목은 기능에 필요한 여행 맥락 — 도시·여행 날짜·여행 조건, 그리고 이용자가 선택한 장소의 식별자·이름·분류 — 로 제한됩니다. 비공개 개인 장소의 이름과 정밀 좌표는 전송하지 않습니다. 글쓰기 보조는 장소명·도시·작성 중인 메모를, 사진 문구 기능은 이용자가 그 기능을 사용할 때 선택한 사진 1장을 전송합니다. AI 요청에 이메일 주소는 포함되지 않습니다.",
        ],
      },
      {
        no: 7, title: "저장·처리 위치",
        paragraphs: [
          "계정·여행 콘텐츠·사진은 대한민국 서울 리전(AWS ap-northeast-2)의 Supabase 서버에 저장됩니다. 사진은 비공개 저장소에 보관되며 공개 URL 이 아닌 만료되는 서명 링크로만 제공됩니다.",
          "웹사이트는 Cloudflare 의 글로벌 네트워크로 전송되며, 전 세계 엣지에서 표준 기술 로그가 처리됩니다. Google 은 로그인과 분석을 처리하고, AI 기능 활성화 시 AI 요청도 처리하게 되며, Google 은 자체 정책에 따라 국외에서 데이터를 처리할 수 있습니다.",
        ],
      },
      {
        no: 8, title: "분석 도구·쿠키·브라우저 저장소",
        paragraphs: [
          "익명 사용 통계 수집에 Google Analytics 4 를 사용합니다. 분석 이벤트에는 기능·장소 수준 정보(예: 도시 이름, 공개 장소 식별자)만 담기며 이메일·이름·로그인 토큰·계정 식별자는 절대 담기지 않습니다. Google Analytics 는 자체 쿠키를 설정하며, 브라우저 설정이나 Google 의 차단 도구로 거부할 수 있습니다.",
          "서비스 자체는 쿠키를 설정하지 않습니다. 브라우저 로컬 저장소에는 기기 식별자·작성 중인 여행·저장 장소·튜토리얼 상태·언어 선택, 그리고 로그인 시 인증 제공자가 관리하는 세션이 보관됩니다. 브라우저 저장소를 지우면 이 기기에서 해당 정보가 삭제됩니다.",
        ],
      },
      {
        no: 9, title: "제휴 링크와 외부 서비스",
        paragraphs: [
          "일부 화면에는 여행 파트너(현재 Agoda·Trip.com·Klook·KKday) 제휴 링크가 있습니다. 링크를 통해 예약하면 이용자 추가 부담 없이 저희가 수수료를 받을 수 있습니다. 링크 클릭 시 제휴 식별자와 함께 파트너 사이트로 이동하며, 이용자의 이름·이메일·여행 콘텐츠는 전달하지 않습니다. 파트너 사이트에서는 해당 사업자의 약관과 개인정보 정책이 적용됩니다.",
        ],
      },
      {
        no: 10, title: "공개 공유 범위",
        paragraphs: [
          "여행과 스토리는 기본 비공개입니다. 공개로 설정하거나 링크를 공유하면, 공유 화면에는 이용자가 공개하기로 한 일정 내용만 표시되며 이메일·기기 식별자·숙소 도착 시각은 포함되지 않습니다. 공개 일정은 다른 이용자가 자신의 계정으로 복사할 수 있고, 복사본에는 원래 제목과 여행 날짜가 옮겨지지 않습니다. 기억에 붙인 사진은 그 기억을 명시적으로 공개로 표시한 경우에만 공개 화면에 나타납니다.",
        ],
      },
      {
        no: 11, title: "보관기간",
        paragraphs: [
          "앱에서 삭제한 콘텐츠는 저장된 사진 파일을 포함해 즉시 삭제됩니다. 삭제하지 않은 콘텐츠는 이용자가 삭제하거나 삭제를 요청할 때까지 보관되며, 현재 여행 데이터를 자동 만료시키지 않습니다.",
        ],
        ownerInput: "보관기간 정책 확정 필요 — 문의(contact) 기록 보관기간, 미이용 계정 처리, 로그 보관기간",
      },
      {
        no: 12, title: "이용자의 권리와 삭제",
        paragraphs: [
          "일정·저장 장소·나의 장소·사진·메모는 언제든 앱에서 직접 열람·수정·삭제할 수 있습니다. 로그아웃은 어떤 데이터도 삭제하지 않습니다.",
          "셀프서비스 계정 삭제 기능은 아직 제공되지 않습니다. 제공 전까지 계정·데이터 삭제 요청은 아래 문의 채널로 접수해 수동 처리합니다.",
        ],
        ownerInput: "삭제 요청 접수 채널(실제 수신 이메일 또는 절차)·처리 기한 확정 필요",
      },
      { no: 13, title: "아동·미성년자", paragraphs: [], ownerInput: "미성년자(만 14세 미만 포함) 이용 정책·연령 기준 확정 필요" },
      {
        no: 14, title: "보안조치",
        paragraphs: [
          "저장 데이터 접근은 제한됩니다: 데이터베이스는 외부 직접 접근을 차단하고 모든 읽기·쓰기는 소유권을 검증하는 서버 API 를 거칩니다. 로그인 세션은 보호된 요청마다 서버에서 검증합니다. 사진은 기본 비공개이며 짧은 유효기간의 서명 링크로만 제공됩니다. 반응·통계에 식별자가 필요한 경우 원본 대신 일방향 해시를 저장합니다.",
        ],
      },
      {
        no: 15, title: "방침 변경 고지",
        paragraphs: ["방침이 변경되면 새 개정일과 함께 이 페이지에 게시합니다. 중요한 변경은 서비스 내에서 안내합니다."],
      },
      { no: 16, title: "문의처", paragraphs: ["개인정보 관련 문의·요청은 아래로 연락해 주세요:"], ownerInput: "개인정보 문의를 실제로 수신할 이메일 주소 확정 필요 (앱 내 문의 폼 존재 — 병기 여부 Owner 결정)" },
    ],
  },

  ja: {
    title: "プライバシーポリシー",
    effectiveDate: null,
    lastUpdated: null,
    intro: [
      "本プライバシーポリシーは、gokoreamate が収集する情報、その利用方法、および利用者が選択できる事項を説明します。gokoreamate は、韓国旅行の探索、日別スケジュールの作成、旅の記憶の保管のための旅行計画サービスです。",
    ],
    sections: [
      { no: 1, title: "サービス運営者", paragraphs: [], ownerInput: "운영 주체(명칭·영문 표기·주소·보호책임자) 확정 필요" },
      {
        no: 2, title: "収集する情報",
        paragraphs: ["サービス運営に必要な情報のみ収集します:"],
        items: [
          "Googleログイン(任意): Googleログインを選ぶと、認証プロバイダー(Supabase Auth)を通じて Google アカウント識別子・氏名・メールアドレス・プロフィール画像リンクを受け取ります。Google のパスワードを受け取ること・保存することは一切ありません。",
          "利用者が作成する旅行コンテンツ: スケジュール(都市・日付・場所・タイトル)、保存した場所、自分で登録した場所(名前・メモ・位置・写真)、旅行の写真とメモ、ストーリー、公開設定。",
          "お問い合わせ: 送信時に入力した氏名・メールアドレス・メッセージ。",
          "自動収集: 旅行データをこの端末に紐づけるためブラウザで生成されるランダムな端末識別子(ハードウェア由来ではなく、氏名とは結合されません)、ホスティング事業者が保持する基本的な技術ログ、匿名の利用統計(第8条参照)。",
        ],
      },
      {
        no: 3, title: "収集しない情報",
        paragraphs: [],
        items: [
          "パスワード — Googleログインはパスワードを当方に共有しません。",
          "生年月日・性別・電話番号・住所・連絡先リスト。",
          "決済・カード情報 — 現在有料機能はありません。",
          "バックグラウンド・常時の位置追跡 — 位置情報は利用者が自ら追加・選択した場所にのみ存在します。",
          "Google ドライブ・カレンダーなど、基本的な本人確認以外の Google データ。",
        ],
      },
      {
        no: 4, title: "利用目的",
        paragraphs: [],
        items: [
          "ログイン情報: ログイン状態の維持と、任意のAI利用権をアカウントに安全に紐づけるために使用します。",
          "旅行コンテンツ: サービス提供そのもの — スケジュール・場所・写真・ストーリーを本人に、また利用者が選択した場合にのみ共有相手に表示するために使用します。",
          "お問い合わせ内容: 確認と返信に使用します。",
          "利用統計: 機能の利用状況の把握とサービス改善に使用します。",
        ],
      },
      {
        no: 5, title: "Googleログインの詳細",
        paragraphs: [
          "ログインには Google OAuth の最小限の本人確認範囲(OpenID・メール・プロフィール)のみを使用します。それ以外の Google データへのアクセスは要求せず、オフラインアクセスも要求せず、Google のアクセストークン/リフレッシュトークンを当方のデータベースに保存しません。Google の氏名・メール・プロフィール情報を広告に使用したり販売したりすることはありません。",
        ],
      },
      {
        no: 6, title: "AI機能とAI提供者への送信情報",
        paragraphs: [
          "AI補助機能(スケジュールのパーソナライズ・文章提案など)は、現在本番環境では無効です。基本のスケジュール作成はAIなしで動作し、AI提供者へ何も送信しません。",
          "将来AI機能を有効化する場合は次のとおり動作し、公開前に本ポリシーを更新します: リクエストは Google の Gemini API に送信されます。送信内容は機能に必要な旅行コンテキスト — 都市・旅行日付・旅行条件、および利用者が選択した場所の識別子・名前・分類 — に限定されます。非公開の個人的な場所の名前と正確な座標は送信しません。文章補助は場所名・都市・編集中のメモを、写真キャプション機能は利用時に選択した写真1枚を送信します。AIリクエストにメールアドレスは含まれません。",
        ],
      },
      {
        no: 7, title: "保存・処理の場所",
        paragraphs: [
          "アカウント・旅行コンテンツ・写真は、大韓民国ソウルリージョン(AWS ap-northeast-2)の Supabase サーバーに保存されます。写真は非公開ストレージに保管され、公開URLではなく期限付きの署名リンクでのみ提供されます。",
          "ウェブサイトは Cloudflare のグローバルネットワークで配信され、世界各地のエッジで標準的な技術ログが処理されます。Google はログインと分析を処理し、AI機能が有効化された場合はAIリクエストも処理します。Google は自社の方針に基づき国外でデータを処理することがあります。",
        ],
      },
      {
        no: 8, title: "分析ツール・Cookie・ブラウザ保存領域",
        paragraphs: [
          "匿名の利用統計の収集に Google Analytics 4 を使用します。分析イベントには機能・場所レベルの情報(例: 都市名、公開されている場所の識別子)のみが含まれ、メール・氏名・ログイントークン・アカウント識別子は一切含まれません。Google Analytics は独自の Cookie を設定し、ブラウザ設定や Google の無効化ツールで拒否できます。",
          "サービス自体は Cookie を設定しません。ブラウザのローカル保存領域には、端末識別子・作成中の旅行・保存した場所・チュートリアル状態・言語選択、そしてログイン時には認証プロバイダーが管理するセッションが保管されます。ブラウザの保存データを消去すると、この端末から該当情報が削除されます。",
        ],
      },
      {
        no: 9, title: "アフィリエイトリンクと外部サービス",
        paragraphs: [
          "一部の画面には旅行パートナー(現在 Agoda・Trip.com・Klook・KKday)のアフィリエイトリンクがあります。リンク経由で予約すると、利用者の追加負担なしに当方が手数料を受け取ることがあります。リンクをクリックするとアフィリエイト識別子とともにパートナーのサイトへ移動しますが、利用者の氏名・メール・旅行コンテンツは渡しません。パートナーのサイトでは当該事業者の規約とプライバシーポリシーが適用されます。",
        ],
      },
      {
        no: 10, title: "公開共有の範囲",
        paragraphs: [
          "旅行とストーリーは初期状態で非公開です。公開に設定するかリンクを共有すると、共有画面には利用者が公開すると選んだスケジュール内容のみが表示され、メール・端末識別子・宿への到着時刻は含まれません。公開スケジュールは他の利用者が自分のアカウントへコピーでき、コピーには元のタイトルと旅行日付は引き継がれません。記憶に添付した写真は、その記憶を明示的に公開にした場合にのみ公開画面に表示されます。",
        ],
      },
      {
        no: 11, title: "保存期間",
        paragraphs: [
          "アプリで削除したコンテンツは、保存された写真ファイルを含め直ちに削除されます。削除していないコンテンツは、利用者が削除するか削除を依頼するまで保管され、現在、旅行データを自動的に失効させることはありません。",
        ],
        ownerInput: "보관기간 정책 확정 필요 — 문의 기록·미이용 계정·로그",
      },
      {
        no: 12, title: "利用者の権利と削除",
        paragraphs: [
          "スケジュール・保存した場所・自分の場所・写真・メモは、いつでもアプリ内で直接閲覧・修正・削除できます。ログアウトによってデータが削除されることはありません。",
          "セルフサービスのアカウント削除機能はまだ提供されていません。提供までの間、アカウント・データの削除依頼は下記の窓口で受け付け、手動で対応します。",
        ],
        ownerInput: "삭제 요청 접수 채널·처리 기한 확정 필요",
      },
      { no: 13, title: "子ども・未成年者", paragraphs: [], ownerInput: "미성년자 이용 정책·연령 기준 확정 필요" },
      {
        no: 14, title: "安全管理措置",
        paragraphs: [
          "保存データへのアクセスは制限されています: データベースは外部からの直接アクセスを遮断し、すべての読み書きは所有権を検証するサーバーAPIを経由します。ログインセッションは保護されたリクエストごとにサーバー側で検証されます。写真は初期状態で非公開で、短い有効期間の署名リンクでのみ提供されます。リアクション・統計に識別子が必要な場合は、生の値の代わりに一方向ハッシュを保存します。",
        ],
      },
      { no: 15, title: "ポリシーの変更", paragraphs: ["本ポリシーを変更する場合は、新しい改定日とともに本ページに掲載します。重要な変更はサービス内でお知らせします。"] },
      { no: 16, title: "お問い合わせ", paragraphs: ["プライバシーに関するご質問・ご依頼は下記までご連絡ください:"], ownerInput: "실수신 이메일 확정 필요" },
    ],
  },

  zh: {
    title: "隐私政策",
    effectiveDate: null,
    lastUpdated: null,
    intro: [
      "本隐私政策说明 gokoreamate 收集哪些信息、如何使用这些信息，以及你可以做出的选择。gokoreamate 是一项用于探索韩国、制定逐日行程并保存旅行记忆的旅行规划服务。",
    ],
    sections: [
      { no: 1, title: "服务运营方", paragraphs: [], ownerInput: "운영 주체(명칭·영문 표기·주소·보호책임자) 확정 필요" },
      {
        no: 2, title: "我们收集的信息",
        paragraphs: ["我们只收集运营服务所需的信息:"],
        items: [
          "Google 登录(可选): 当你选择使用 Google 登录时，我们会通过认证服务商(Supabase Auth)收到你的 Google 账户标识、姓名、电子邮箱和头像链接。我们在任何情况下都不会收到或存储你的 Google 密码。",
          "你创建的旅行内容: 行程(城市、日期、地点、标题)、收藏的地点、你自己添加的地点(名称、备注、位置、照片)、旅行照片与备注、故事，以及公开设置。",
          "联系表单: 你联系我们时填写的姓名、邮箱和内容。",
          "自动收集: 为将旅行数据关联到本设备而在浏览器中生成的随机设备标识(并非来自你的硬件，也不会与你的姓名关联)、托管服务商保存的基础技术日志，以及匿名使用统计(见第8条)。",
        ],
      },
      {
        no: 3, title: "我们不收集的信息",
        paragraphs: [],
        items: [
          "密码 — Google 登录不会向我们提供你的密码。",
          "出生日期、性别、电话号码、住址或通讯录。",
          "支付或银行卡信息 — 目前服务没有付费功能。",
          "后台或持续的位置追踪 — 位置信息只存在于你主动添加或选择的地点。",
          "Google 云端硬盘、日历等基础身份信息以外的任何 Google 数据。",
        ],
      },
      {
        no: 4, title: "信息的使用目的",
        paragraphs: [],
        items: [
          "登录信息: 用于保持登录状态，并将可选的 AI 使用权安全地关联到你的账户。",
          "旅行内容: 用于提供服务本身 — 向你本人展示你的行程、地点、照片和故事；只有在你选择分享时才展示给你分享的对象。",
          "联系内容: 用于查看并回复你的咨询。",
          "使用统计: 用于了解功能使用情况并改进服务。",
        ],
      },
      {
        no: 5, title: "Google 登录详情",
        paragraphs: [
          "登录仅使用 Google OAuth 的最小身份范围(OpenID、邮箱、个人资料)。我们不请求访问其他任何 Google 数据，不请求离线访问，也不在自己的数据库中存储 Google 的访问令牌或刷新令牌。你的 Google 姓名、邮箱和资料信息不会用于广告，也不会被出售。",
        ],
      },
      {
        no: 6, title: "AI 功能及发送给 AI 服务商的数据",
        paragraphs: [
          "AI 辅助功能(如行程个性化、文字建议)目前在正式环境中处于停用状态。基础行程创建完全不使用 AI，不会向 AI 服务商发送任何内容。",
          "未来若启用 AI 功能，其运作方式如下，并将在上线前更新本政策: 请求将发送至 Google 的 Gemini API。发送内容仅限于该功能所需的旅行上下文 — 城市、旅行日期、旅行偏好，以及你所选地点的标识、名称和分类。你的私人地点的名称和精确坐标不会被发送。写作辅助会发送地点名、城市和你正在编辑的备注；照片文案功能仅在你使用时发送你选择的一张照片。AI 请求绝不包含你的邮箱地址。",
        ],
      },
      {
        no: 7, title: "数据存储与处理位置",
        paragraphs: [
          "你的账户、旅行内容和照片存储在位于韩国首尔区域(AWS ap-northeast-2)的 Supabase 服务器上。照片保存在私有存储中，仅通过有时效的签名链接提供，而非公开 URL。",
          "网站通过 Cloudflare 的全球网络分发，其位于世界各地的边缘节点会处理标准技术日志。Google 处理登录与分析请求；若 AI 功能启用，也会处理 AI 请求。Google 可能依据其自身政策在境外处理数据。",
        ],
      },
      {
        no: 8, title: "分析工具、Cookie 与浏览器存储",
        paragraphs: [
          "我们使用 Google Analytics 4 收集匿名使用统计。分析事件仅包含功能和地点层面的信息(例如城市名、公开地点的标识)，绝不包含你的邮箱、姓名、登录令牌或账户标识。Google Analytics 会设置其自身的 Cookie，你可以通过浏览器设置或 Google 提供的工具拒绝。",
          "服务本身不设置任何 Cookie。浏览器本地存储中保存: 设备标识、进行中的行程、收藏的地点、引导状态、语言选择，以及登录后由认证服务商管理的会话。清除浏览器存储即可从本设备删除这些信息。",
        ],
      },
      {
        no: 9, title: "推广链接与外部服务",
        paragraphs: [
          "部分页面包含旅行合作伙伴(目前为 Agoda、Trip.com、Klook、KKday)的推广链接。若你通过链接完成预订，我们可能获得佣金，你无需支付任何额外费用。点击链接会携带推广标识跳转到合作方网站；我们不会向其传递你的姓名、邮箱或旅行内容。在合作方网站上适用其自身的条款与隐私政策。",
        ],
      },
      {
        no: 10, title: "公开分享的范围",
        paragraphs: [
          "行程和故事默认私密。当你设为公开或分享链接时，分享页面只显示你选择公开的行程内容 — 不包含你的邮箱、设备标识或住宿到达时间。其他用户可以将公开行程复制到自己的账户，副本不会带走你的标题和旅行日期。附在记忆上的照片，只有当你明确将该记忆设为公开时才会出现在公开页面。",
        ],
      },
      {
        no: 11, title: "保存期限",
        paragraphs: [
          "你在应用内删除的内容(包括已存储的照片文件)会被立即删除。未删除的内容将保存至你删除或请求删除为止；目前服务不会自动使旅行数据过期。",
        ],
        ownerInput: "보관기간 정책 확정 필요",
      },
      {
        no: 12, title: "你的权利与删除",
        paragraphs: [
          "你可以随时在应用内直接查看、修改和删除你的行程、收藏地点、个人地点、照片和备注。退出登录不会删除任何数据。",
          "自助账户删除功能尚未提供。在提供之前，账户及数据删除请求通过下方联系渠道人工处理。",
        ],
        ownerInput: "삭제 요청 접수 채널·처리 기한 확정 필요",
      },
      { no: 13, title: "儿童与未成年人", paragraphs: [], ownerInput: "미성년자 정책 확정 필요" },
      {
        no: 14, title: "安全措施",
        paragraphs: [
          "对存储数据的访问受到限制: 数据库禁止外部直接访问，所有读写都经由验证所有权的服务器 API。登录会话在每个受保护请求上都由服务器验证。照片默认私密，仅通过短时效的签名链接提供。在需要为互动和统计使用标识的场景，我们存储单向哈希而非原始值。",
        ],
      },
      { no: 15, title: "政策变更", paragraphs: ["政策如有变更，将连同新的修订日期发布在本页面。重大变更将在服务内另行通知。"] },
      { no: 16, title: "联系我们", paragraphs: ["有关隐私的问题或请求，请联系:"], ownerInput: "실수신 이메일 확정 필요" },
    ],
  },
};
