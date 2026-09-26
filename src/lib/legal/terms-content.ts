// 이용약관 본문 (PRIVACY-TERMS-V1) — 2026-09-26 코드 감사 기준.
// 현재 구현된 기능만 서술한다: 유료 AI 이용권·결제·환불은 미출시 — 현재 무료
// 사실만 적고(제12조), 유료 도입 시 별도 고지 구조만 남긴다. Owner 확정 전
// 항목(운영 주체·준거법·문의처)은 ownerInput 마커로만 둔다.

import type { LegalDocSet } from "./legal-types";

export const TERMS: LegalDocSet = {
  en: {
    title: "Terms of Service",
    effectiveDate: null,
    lastUpdated: null,
    intro: [
      "These Terms govern your use of gokoreamate, a travel planning service for exploring Korea, building itineraries, and keeping travel memories. By using the service you agree to these Terms.",
    ],
    sections: [
      { no: 1, title: "Operator", paragraphs: [], ownerInput: "운영 주체 표기 확정 필요(개인정보처리방침 제1조와 동일)" },
      {
        no: 2, title: "The service",
        paragraphs: [
          "gokoreamate provides curated place information for Korean cities, an itinerary builder, personal travel records (saved places, personal places, photos, memos, stories), optional public sharing, and optional AI-assisted features when available. The service is provided as-is and may change over time.",
        ],
      },
      {
        no: 3, title: "Accounts and Google sign-in",
        paragraphs: [
          "Most features work without an account. Signing in with Google is optional and is used to associate optional AI usage allowances safely with you. You are responsible for keeping access to your Google account secure and for activity that occurs through your signed-in session. Signing out or not signing in does not remove travel data stored on your device.",
        ],
      },
      {
        no: 4, title: "Acceptable use",
        paragraphs: ["You agree not to:"],
        items: [
          "upload or share content that is unlawful, infringing, hateful, or invades another person's privacy (including posting someone else's personal information or photos without permission);",
          "misrepresent places, safety information, or reviews;",
          "interfere with the service, attempt to bypass access controls or rate limits, or scrape the service at scale;",
          "use the service to send spam or unauthorized advertising.",
        ],
      },
      {
        no: 5, title: "Travel information and AI output are not guarantees",
        paragraphs: [
          "Itineraries, place details, and any AI-assisted suggestions are for planning convenience only. Opening hours, prices, weather, transport, visa rules, and safety conditions change without notice, and automatically generated content can be incomplete or wrong. Always re-check important travel information — especially safety, visa, health, and transport details — with official sources before relying on it. The service is not a travel agency booking on your behalf and does not guarantee any travel outcome.",
        ],
      },
      {
        no: 6, title: "Your content",
        paragraphs: [
          "You keep all rights to the photos, memos, itineraries, and stories you create. So that the service can function, you grant the operator a non-exclusive license to host, store, resize, and display your content — to you, and to others only to the extent you choose to share or publish it. This license ends for content you delete, except where a copy exists in another user's account because you published the content and they copied it while it was public.",
        ],
      },
      {
        no: 7, title: "Public sharing responsibilities",
        paragraphs: [
          "Publishing a trip, story, or memory makes that content visible to anyone with the link and allows others to copy the itinerary. You are responsible for what you publish, including making sure people in your photos consent and that you have the right to share the content. The operator may remove public content that violates Section 4.",
        ],
      },
      {
        no: 8, title: "Affiliate links",
        paragraphs: [
          "Some links to travel partners (currently Agoda, Trip.com, Klook, KKday) are affiliate links: bookings made through them may earn the operator a commission at no extra cost to you. Partner sites are operated by third parties under their own terms; the operator is not a party to purchases you make there and is not responsible for partner services.",
        ],
      },
      {
        no: 9, title: "Service changes and availability",
        paragraphs: [
          "Features may be added, changed, suspended, or discontinued, and availability is not guaranteed. Where a change materially reduces core functionality, reasonable notice will be given within the service.",
        ],
      },
      {
        no: 10, title: "Suspension and termination",
        paragraphs: [
          "The operator may restrict or terminate access that violates these Terms or harms the service or other users. You may stop using the service at any time; data deletion is described in Section 11.",
        ],
      },
      {
        no: 11, title: "Data deletion",
        paragraphs: [
          "You can delete itineraries, saved places, personal places, photos, and memos in the app at any time; deletion takes effect immediately, including stored photo files. A self-service account deletion feature is not yet available; account deletion requests are handled through the contact channel in Section 15. Deleting content does not retract copies other users lawfully made while the content was public.",
        ],
      },
      {
        no: 12, title: "Fees",
        paragraphs: [
          "All current features are free of charge. If paid features are introduced in the future, their price, payment, and refund terms will be announced separately and will apply only after notice, and this section will be updated before launch.",
        ],
      },
      {
        no: 13, title: "Disclaimer and limitation of liability",
        paragraphs: [
          "To the maximum extent permitted by law, the service is provided \"as is\" without warranties of accuracy, availability, or fitness for a particular purpose, and the operator is not liable for indirect or consequential damages arising from use of the service, including reliance on travel information or AI output, or from partner sites. Nothing in these Terms limits liability that cannot be limited under applicable law.",
        ],
      },
      { no: 14, title: "Governing law and disputes", paragraphs: [], ownerInput: "준거법·관할(분쟁 해결 기준) 확정 필요" },
      {
        no: 15, title: "Changes to these Terms and contact",
        paragraphs: [
          "If these Terms change, the updated version will be posted on this page with a new revision date, and significant changes will be announced within the service. Continued use after the effective date constitutes acceptance.",
        ],
        ownerInput: "약관 문의를 실제로 수신할 연락처 확정 필요",
      },
    ],
  },

  ko: {
    title: "이용약관",
    effectiveDate: null,
    lastUpdated: null,
    intro: [
      "본 약관은 한국 여행 탐색·일정 만들기·여행 기억 보관을 위한 여행 계획 서비스인 gokoreamate 의 이용에 적용됩니다. 서비스를 이용하면 본 약관에 동의한 것으로 봅니다.",
    ],
    sections: [
      { no: 1, title: "운영 주체", paragraphs: [], ownerInput: "운영 주체 표기 확정 필요(개인정보처리방침 제1조와 동일)" },
      {
        no: 2, title: "서비스 내용",
        paragraphs: [
          "gokoreamate 는 한국 도시의 장소 정보, 일정 만들기 도구, 개인 여행 기록(저장 장소·나의 장소·사진·메모·스토리), 선택적 공개 공유, 그리고 제공 시점에 한해 선택적 AI 보조 기능을 제공합니다. 서비스는 있는 그대로 제공되며 시간이 지나며 변경될 수 있습니다.",
        ],
      },
      {
        no: 3, title: "계정과 Google 로그인",
        paragraphs: [
          "대부분의 기능은 계정 없이 이용할 수 있습니다. Google 로그인은 선택 사항이며, 선택형 AI 이용권을 이용자에게 안전하게 귀속하는 데 사용됩니다. Google 계정 접근 보안과, 로그인된 세션을 통해 일어나는 활동은 이용자 본인의 책임입니다. 로그아웃하거나 로그인하지 않아도 이 기기에 저장된 여행 데이터는 삭제되지 않습니다.",
        ],
      },
      {
        no: 4, title: "금지행위",
        paragraphs: ["다음 행위를 해서는 안 됩니다:"],
        items: [
          "위법하거나 권리를 침해하거나 혐오적인 콘텐츠, 타인의 개인정보·사진을 동의 없이 게시하는 등 타인의 사생활을 침해하는 콘텐츠의 업로드·공유;",
          "장소·안전 정보·후기의 허위 기재;",
          "서비스 방해, 접근 통제·이용 제한 우회 시도, 대규모 수집(스크래핑);",
          "스팸·무단 광고 발송에의 이용.",
        ],
      },
      {
        no: 5, title: "여행 정보·AI 결과의 한계",
        paragraphs: [
          "일정·장소 정보·AI 보조 제안은 계획 편의를 위한 참고 자료일 뿐입니다. 운영시간·가격·날씨·교통·비자·안전 상황은 예고 없이 바뀌며, 자동 생성 콘텐츠는 불완전하거나 틀릴 수 있습니다. 중요한 여행 정보 — 특히 안전·비자·건강·교통 — 는 이용 전 반드시 공식 출처에서 다시 확인하세요. 본 서비스는 이용자를 대신해 예약하는 여행사가 아니며 어떤 여행 결과도 보증하지 않습니다.",
        ],
      },
      {
        no: 6, title: "이용자 콘텐츠의 권리",
        paragraphs: [
          "이용자가 만든 사진·메모·일정·스토리의 권리는 이용자에게 있습니다. 서비스 동작을 위해 운영자는 콘텐츠를 호스팅·저장·크기 변환·표시할 비독점적 이용허락을 부여받으며, 표시는 본인에게, 그리고 이용자가 공유·공개를 선택한 범위에서만 타인에게 이루어집니다. 이 이용허락은 삭제한 콘텐츠에 대해 종료됩니다. 다만 공개 상태였던 동안 다른 이용자가 적법하게 복사한 사본은 예외입니다.",
        ],
      },
      {
        no: 7, title: "공개 공유에 대한 책임",
        paragraphs: [
          "여행·스토리·기억을 공개하면 링크를 가진 누구나 볼 수 있고, 다른 이용자가 일정을 복사할 수 있습니다. 공개하는 내용 — 사진 속 인물의 동의, 공유할 권리 보유 여부를 포함해 — 은 이용자 본인의 책임입니다. 운영자는 제4조를 위반하는 공개 콘텐츠를 제거할 수 있습니다.",
        ],
      },
      {
        no: 8, title: "제휴 링크와 커미션 고지",
        paragraphs: [
          "여행 파트너(현재 Agoda·Trip.com·Klook·KKday)로 가는 일부 링크는 제휴 링크이며, 이를 통한 예약으로 운영자가 이용자 추가 부담 없이 수수료를 받을 수 있습니다. 파트너 사이트는 제3자가 자체 약관으로 운영하며, 운영자는 그곳에서의 구매 당사자가 아니고 파트너 서비스에 책임지지 않습니다.",
        ],
      },
      {
        no: 9, title: "서비스 변경·중단",
        paragraphs: ["기능은 추가·변경·일시중지·종료될 수 있으며 가용성은 보증되지 않습니다. 핵심 기능이 실질적으로 축소되는 변경은 서비스 내에서 합리적으로 사전 안내합니다."],
      },
      {
        no: 10, title: "이용 제한 및 종료",
        paragraphs: ["운영자는 본 약관을 위반하거나 서비스·다른 이용자에게 해를 끼치는 접근을 제한·종료할 수 있습니다. 이용자는 언제든 이용을 중단할 수 있으며, 데이터 삭제는 제11조를 따릅니다."],
      },
      {
        no: 11, title: "데이터 삭제",
        paragraphs: [
          "일정·저장 장소·나의 장소·사진·메모는 언제든 앱에서 삭제할 수 있고, 저장된 사진 파일을 포함해 즉시 반영됩니다. 셀프서비스 계정 삭제 기능은 아직 제공되지 않으며, 계정 삭제 요청은 제15조의 문의 채널로 접수합니다. 콘텐츠 삭제는 공개 상태였던 동안 다른 이용자가 적법하게 만든 사본까지 회수하지 않습니다.",
        ],
      },
      {
        no: 12, title: "요금",
        paragraphs: ["현재 모든 기능은 무료입니다. 향후 유료 기능이 도입되는 경우 가격·결제·환불 조건은 별도로 고지하며, 고지 이후에만 적용되고 본 조항도 출시 전에 갱신됩니다."],
      },
      {
        no: 13, title: "면책 및 책임 제한",
        paragraphs: [
          "법이 허용하는 최대 범위에서, 서비스는 정확성·가용성·특정 목적 적합성에 대한 보증 없이 \"있는 그대로\" 제공되며, 운영자는 여행 정보나 AI 결과에 대한 의존, 파트너 사이트 이용을 포함해 서비스 이용에서 발생하는 간접·결과적 손해에 책임지지 않습니다. 관련 법상 제한할 수 없는 책임은 본 약관으로 제한되지 않습니다.",
        ],
      },
      { no: 14, title: "준거법과 분쟁 해결", paragraphs: [], ownerInput: "준거법·관할 확정 필요" },
      {
        no: 15, title: "약관 변경·고지 및 문의처",
        paragraphs: ["약관이 변경되면 새 개정일과 함께 이 페이지에 게시하고, 중요한 변경은 서비스 내에서 안내합니다. 시행일 이후 계속 이용하면 변경에 동의한 것으로 봅니다."],
        ownerInput: "약관 문의 실수신 연락처 확정 필요",
      },
    ],
  },

  ja: {
    title: "利用規約",
    effectiveDate: null,
    lastUpdated: null,
    intro: [
      "本規約は、韓国旅行の探索・スケジュール作成・旅の記憶の保管のための旅行計画サービス gokoreamate の利用に適用されます。サービスを利用することで本規約に同意したものとみなします。",
    ],
    sections: [
      { no: 1, title: "運営者", paragraphs: [], ownerInput: "운영 주체 표기 확정 필요" },
      {
        no: 2, title: "サービス内容",
        paragraphs: [
          "gokoreamate は、韓国各都市の場所情報、スケジュール作成ツール、個人の旅行記録(保存した場所・自分の場所・写真・メモ・ストーリー)、任意の公開共有、および提供時に限り任意のAI補助機能を提供します。サービスは現状有姿で提供され、時間とともに変更されることがあります。",
        ],
      },
      {
        no: 3, title: "アカウントとGoogleログイン",
        paragraphs: [
          "ほとんどの機能はアカウントなしで利用できます。Googleログインは任意であり、任意のAI利用権を利用者に安全に紐づけるために使用されます。Googleアカウントのアクセス管理と、ログイン中のセッションを通じて行われる活動は利用者本人の責任です。ログアウトしても、ログインしなくても、この端末に保存された旅行データは削除されません。",
        ],
      },
      {
        no: 4, title: "禁止行為",
        paragraphs: ["次の行為をしてはなりません:"],
        items: [
          "違法・権利侵害・憎悪的なコンテンツや、他人の個人情報・写真を同意なく掲載するなど他人のプライバシーを侵害するコンテンツのアップロード・共有;",
          "場所・安全情報・レビューの虚偽記載;",
          "サービスの妨害、アクセス制御・利用制限の回避の試み、大規模な収集(スクレイピング);",
          "スパム・無断広告の送信への利用。",
        ],
      },
      {
        no: 5, title: "旅行情報・AI出力の限界",
        paragraphs: [
          "スケジュール・場所情報・AIによる提案は、計画の便宜のための参考情報にすぎません。営業時間・価格・天気・交通・ビザ・安全状況は予告なく変わり、自動生成コンテンツは不完全または誤りである可能性があります。重要な旅行情報 — 特に安全・ビザ・健康・交通 — は、必ず公式情報源で再確認してください。本サービスは利用者に代わって予約を行う旅行代理店ではなく、いかなる旅行の結果も保証しません。",
        ],
      },
      {
        no: 6, title: "利用者コンテンツの権利",
        paragraphs: [
          "利用者が作成した写真・メモ・スケジュール・ストーリーの権利は利用者に帰属します。サービスの動作のため、運営者はコンテンツのホスティング・保存・サイズ変換・表示についての非独占的な利用許諾を受けます。表示は本人に対して、また利用者が共有・公開を選択した範囲でのみ第三者に対して行われます。この許諾は削除したコンテンツについて終了します。ただし、公開中に他の利用者が適法に作成したコピーは除きます。",
        ],
      },
      {
        no: 7, title: "公開共有に関する責任",
        paragraphs: [
          "旅行・ストーリー・記憶を公開すると、リンクを持つ誰もが閲覧でき、他の利用者がスケジュールをコピーできます。写真に写る人物の同意や共有する権利の有無を含め、公開する内容は利用者本人の責任です。運営者は第4条に違反する公開コンテンツを削除することがあります。",
        ],
      },
      {
        no: 8, title: "アフィリエイトリンクと手数料の明示",
        paragraphs: [
          "旅行パートナー(現在 Agoda・Trip.com・Klook・KKday)への一部リンクはアフィリエイトリンクであり、経由した予約により運営者が手数料を受け取ることがあります(利用者の追加負担はありません)。パートナーサイトは第三者が独自の規約で運営しており、運営者はそこでの購入の当事者ではなく、パートナーのサービスについて責任を負いません。",
        ],
      },
      { no: 9, title: "サービスの変更・中断", paragraphs: ["機能は追加・変更・一時停止・終了されることがあり、可用性は保証されません。中核機能が実質的に縮小される変更は、サービス内で合理的に事前告知します。"] },
      { no: 10, title: "利用制限および終了", paragraphs: ["運営者は、本規約に違反する、またはサービス・他の利用者に害を及ぼすアクセスを制限・終了することがあります。利用者はいつでも利用を中止でき、データの削除は第11条に従います。"] },
      {
        no: 11, title: "データの削除",
        paragraphs: [
          "スケジュール・保存した場所・自分の場所・写真・メモはいつでもアプリ内で削除でき、保存された写真ファイルを含め直ちに反映されます。セルフサービスのアカウント削除機能はまだ提供されておらず、アカウント削除の依頼は第15条の窓口で受け付けます。コンテンツの削除は、公開中に他の利用者が適法に作成したコピーまでは回収しません。",
        ],
      },
      { no: 12, title: "料金", paragraphs: ["現在すべての機能は無料です。将来有料機能を導入する場合、価格・支払い・返金条件は別途告知し、告知後にのみ適用され、本条も公開前に更新されます。"] },
      {
        no: 13, title: "免責および責任の制限",
        paragraphs: [
          "法の許す最大限の範囲で、サービスは正確性・可用性・特定目的適合性の保証なく「現状有姿」で提供され、運営者は旅行情報やAI出力への依拠、パートナーサイトの利用を含むサービス利用から生じる間接・結果的損害について責任を負いません。適用法上制限できない責任は本規約によって制限されません。",
        ],
      },
      { no: 14, title: "準拠法と紛争解決", paragraphs: [], ownerInput: "준거법·관할 확정 필요" },
      { no: 15, title: "規約の変更・告知および連絡先", paragraphs: ["本規約を変更する場合は、新しい改定日とともに本ページに掲載し、重要な変更はサービス内で告知します。発効日以降の継続利用は変更への同意とみなします。"], ownerInput: "문의 실수신 연락처 확정 필요" },
    ],
  },

  zh: {
    title: "服务条款",
    effectiveDate: null,
    lastUpdated: null,
    intro: [
      "本条款适用于 gokoreamate — 一项用于探索韩国、制定行程并保存旅行记忆的旅行规划服务。使用本服务即表示你同意本条款。",
    ],
    sections: [
      { no: 1, title: "运营方", paragraphs: [], ownerInput: "운영 주체 표기 확정 필요" },
      {
        no: 2, title: "服务内容",
        paragraphs: [
          "gokoreamate 提供韩国城市的地点信息、行程制定工具、个人旅行记录(收藏地点、个人地点、照片、备注、故事)、可选的公开分享，以及在提供期间的可选 AI 辅助功能。服务按现状提供，并可能随时间变化。",
        ],
      },
      {
        no: 3, title: "账户与 Google 登录",
        paragraphs: [
          "大多数功能无需账户即可使用。Google 登录是可选的，用于将可选的 AI 使用权安全地关联到你。你须自行妥善保管 Google 账户的访问权限，并对通过你的登录会话发生的活动负责。退出登录或不登录都不会删除保存在本设备上的旅行数据。",
        ],
      },
      {
        no: 4, title: "禁止行为",
        paragraphs: ["你同意不从事以下行为:"],
        items: [
          "上传或分享违法、侵权、仇恨性内容，或未经同意发布他人个人信息、照片等侵犯他人隐私的内容;",
          "虚假描述地点、安全信息或评价;",
          "干扰服务、试图绕过访问控制或使用限制、大规模抓取;",
          "利用服务发送垃圾信息或未经授权的广告。",
        ],
      },
      {
        no: 5, title: "旅行信息与 AI 输出的局限",
        paragraphs: [
          "行程、地点信息及任何 AI 辅助建议仅供规划参考。营业时间、价格、天气、交通、签证、安全状况随时可能变化，自动生成的内容可能不完整或有误。重要旅行信息 — 尤其是安全、签证、健康和交通 — 请务必在依赖之前通过官方渠道再次确认。本服务不是代你预订的旅行社，不对任何旅行结果作出保证。",
        ],
      },
      {
        no: 6, title: "你的内容的权利",
        paragraphs: [
          "你创建的照片、备注、行程和故事的权利归你所有。为使服务正常运作，你授予运营方非独占许可，用于托管、存储、调整尺寸并展示你的内容 — 向你本人展示，且仅在你选择分享或公开的范围内向他人展示。该许可在你删除内容后终止，但在内容公开期间其他用户依规复制到其账户的副本除外。",
        ],
      },
      {
        no: 7, title: "公开分享的责任",
        paragraphs: [
          "公开旅行、故事或记忆后，任何拥有链接的人都可以查看，其他用户也可以复制该行程。你须对公开的内容负责，包括确保照片中的人物已同意、以及你有权分享该内容。运营方可移除违反第4条的公开内容。",
        ],
      },
      {
        no: 8, title: "推广链接与佣金披露",
        paragraphs: [
          "部分指向旅行合作伙伴(目前为 Agoda、Trip.com、Klook、KKday)的链接为推广链接: 通过其完成的预订可能为运营方带来佣金，你无需支付额外费用。合作方网站由第三方按其自身条款运营；运营方不是你在其网站上购买行为的当事方，也不对合作方的服务负责。",
        ],
      },
      { no: 9, title: "服务的变更与中断", paragraphs: ["功能可能被添加、变更、暂停或终止，可用性不作保证。若变更实质性削减核心功能，将在服务内合理提前通知。"] },
      { no: 10, title: "使用限制与终止", paragraphs: ["运营方可限制或终止违反本条款、或损害服务及其他用户的访问。你可以随时停止使用服务；数据删除见第11条。"] },
      {
        no: 11, title: "数据删除",
        paragraphs: [
          "你可以随时在应用内删除行程、收藏地点、个人地点、照片和备注，删除立即生效，包括已存储的照片文件。自助账户删除功能尚未提供；账户删除请求通过第15条的联系渠道受理。删除内容不会收回其公开期间其他用户依规制作的副本。",
        ],
      },
      { no: 12, title: "费用", paragraphs: ["当前所有功能均为免费。未来如推出付费功能，其价格、支付与退款条款将另行公告，仅在公告后适用，本条也将在上线前更新。"] },
      {
        no: 13, title: "免责声明与责任限制",
        paragraphs: [
          "在法律允许的最大范围内，服务按\"现状\"提供，不对准确性、可用性或特定用途适用性作保证；对因使用服务(包括依赖旅行信息或 AI 输出、使用合作方网站)产生的间接或衍生损害，运营方不承担责任。依适用法律不可限制的责任不受本条款限制。",
        ],
      },
      { no: 14, title: "适用法律与争议解决", paragraphs: [], ownerInput: "준거법·관할 확정 필요" },
      { no: 15, title: "条款变更、通知与联系方式", paragraphs: ["条款如有变更，将连同新的修订日期发布在本页面，重大变更将在服务内另行通知。生效日后继续使用即视为接受变更。"], ownerInput: "문의 실수신 연락처 확정 필요" },
    ],
  },
};
