import Link from "next/link";

export const metadata = {
  title: "Korea Survival Guide - KoreaMate",
  description: "Everything foreign travelers need to know before and during their trip to Korea.",
};

export default function SurvivalGuidePage() {
  const faqs = [
    {
      q: "Do I need cash in Korea?",
      a: "Yes, you need a small amount of cash. While cards are accepted everywhere, you must recharge transit cards (T-money) with cash only. Street food stalls, local traditional markets, and some small businesses also require cash. We recommend carrying about 50,000 to 100,000 KRW in cash.",
    },
    {
      q: "Can I use my foreign credit card?",
      a: "Yes! Visa and Mastercard are accepted at 95% of businesses including convenience stores, taxis, restaurants, and cafes. Note that foreign-issued cards can occasionally be declined at older terminals, so carrying some cash is a smart backup plan.",
    },
    {
      q: "Is English widely spoken?",
      a: "In major tourist areas (Seoul, Busan, Jeju), signs and menus have English. Subway systems and buses are fully English-friendly. However, local shopkeepers and taxi drivers may not speak fluent English. Downloading translation apps like Papago is highly recommended.",
    },
    {
      q: "Is Korea safe for solo female travelers?",
      a: "South Korea is consistently ranked as one of the safest countries in the world. Crime rates are extremely low, and it is very safe to walk alone at night. Standard travel safety precautions still apply, but you can explore with peace of mind.",
    },
    {
      q: "What apps do I need in Korea?",
      a: "Three apps are absolutely mandatory: 1. Naver Map or KakaoMap (Google Maps does not work for walking directions), 2. Papago (the most accurate English-to-Korean translation app), and 3. Kakao T (for ordering taxis safely).",
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF7F2] text-[#2C2520] font-sans antialiased">
      {/* Navigation Header */}
      <header className="border-b border-[#E6DFD5] bg-[#FAF7F2]/90 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link href="/" className="text-2xl font-normal tracking-tight text-[#2C2520] flex items-center gap-1.5">
              <span className="text-[#D4AF37] text-3xl">🇰🇷</span> go<span className="font-extrabold">korea</span>mate
            </Link>
          </div>
          <nav className="flex items-center gap-8">
            <Link
              href="/blog"
              className="text-base font-bold hover:text-[#D4AF37] transition-colors"
            >
              Blog
            </Link>
            <Link
              href="/survival-guide"
              className="text-base font-bold text-[#D4AF37] transition-colors"
            >
              Survival Guide
            </Link>
            <Link
              href="/about"
              className="text-base font-bold hover:text-[#D4AF37] transition-colors"
            >
              About
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero Header */}
      <section className="bg-gradient-to-b from-[#F3EEE3] to-[#FAF7F2] border-b border-[#E6DFD5] py-20 text-center">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <h1 className="text-4xl sm:text-6xl font-black text-[#2C2520] tracking-tight leading-tight">
            Korea Survival Guide
          </h1>
          <p className="mt-5 text-xl sm:text-2xl text-[#61554D] font-bold">
            Everything foreign travelers need to know before and during their trip to Korea
          </p>
        </div>
      </section>

      {/* Main Content Sections */}
      <main className="max-w-5xl mx-auto w-full px-4 sm:px-6 py-20 flex-1 space-y-16">
        
        {/* Grid for Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          
          {/* Section 1 - Before You Land */}
          <div className="bg-white rounded-3xl border border-[#E6DFD5] p-8 shadow-sm flex flex-col justify-between">
            <div className="space-y-4">
              <h2 className="text-2xl font-black text-[#2C2520] pb-3 border-b border-[#FAF7F2] flex items-center gap-2">
                🛫 Before You Land
              </h2>
              <ul className="space-y-4 text-base text-[#61554D]">
                <li className="leading-relaxed">
                  <strong className="text-[#2C2520] block">📱 Get your eSIM</strong>
                  Buy your eSIM online before flying. Activate it right as you land to have instant 4G/5G data.
                </li>
                <li className="leading-relaxed">
                  <strong className="text-[#2C2520] block">💳 Transit Card Prep</strong>
                  Get a T-money card at airport convenience stores (CU, GS25) inside the arrivals terminal.
                </li>
                <li className="leading-relaxed">
                  <strong className="text-[#2C2520] block">📲 Download Crucial Apps</strong>
                  Download <strong>Naver Map</strong> (Google Maps doesn't work), <strong>Papago</strong> for translations, and <strong>Kakao T</strong> for taxis.
                </li>
              </ul>
            </div>
            <a
              href="https://affiliate.klook.com/sl/KiT3U74"
              target="_blank"
              rel="noopener noreferrer sponsored"
              className="mt-8 inline-flex items-center justify-center px-4 py-3 text-sm font-black uppercase tracking-wider bg-[#2C2520] text-[#FAF7F2] rounded-xl hover:bg-black transition-colors w-full text-center"
            >
              Get eSIM Now
            </a>
          </div>

          {/* Section 2 - Money & Payments */}
          <div className="bg-white rounded-3xl border border-[#E6DFD5] p-8 shadow-sm">
            <h2 className="text-2xl font-black text-[#2C2520] pb-3 border-b border-[#FAF7F2] mb-4 flex items-center gap-2">
              💳 Money & Payments
            </h2>
            <ul className="space-y-4 text-base text-[#61554D]">
              <li className="leading-relaxed">
                <strong className="text-[#2C2520] block">💳 Where Cards are Accepted</strong>
                Visa and Mastercard are accepted almost everywhere (convenience stores, cafes, taxis, and sit-down dinners).
              </li>
              <li className="leading-relaxed">
                <strong className="text-[#2C2520] block">💵 Where You Need Cash</strong>
                Traditional markets, street food stalls, and transit card recharges. Transit recharge kiosks only accept cash KRW.
              </li>
              <li className="leading-relaxed">
                <strong className="text-[#2C2520] block">🏦 Foreign ATM Guide</strong>
                Use ATMs marked with a <strong>Global ATM</strong> sign. Major banks like KB, Hana, and Shinhan have robust English interfaces.
              </li>
            </ul>
          </div>

          {/* Section 3 - Getting Around */}
          <div className="bg-white rounded-3xl border border-[#E6DFD5] p-8 shadow-sm">
            <h2 className="text-2xl font-black text-[#2C2520] pb-3 border-b border-[#FAF7F2] mb-4 flex items-center gap-2">
              🚇 Getting Around
            </h2>
            <ul className="space-y-4 text-base text-[#61554D]">
              <li className="leading-relaxed">
                <strong className="text-[#2C2520] block">🚇 How to use T-money</strong>
                Tap when boarding and tap again when getting off subways or buses. Keep it topped up with cash at subway ticket machines.
              </li>
              <li className="leading-relaxed">
                <strong className="text-[#2C2520] block">🚇 Subway Beginner Guide</strong>
                Subways are highly color-coded and announced in English. Follow transit arrows and check Naver Maps for correct exits.
              </li>
              <li className="leading-relaxed">
                <strong className="text-[#2C2520] block">🚕 Taxi Communication</strong>
                Hail standard orange or grey taxis. Show the driver your address written in <strong>Korean Hangul</strong> from Naver Maps.
              </li>
            </ul>
          </div>
        </div>

        {/* Section 4 - FAQ */}
        <div className="bg-white rounded-3xl border border-[#E6DFD5] p-8 sm:p-12 shadow-sm">
          <h2 className="text-3xl font-black text-[#2C2520] mb-8 pb-4 border-b border-[#FAF7F2] flex items-center gap-2">
            ❓ FAQ: Frequently Asked Questions
          </h2>
          <div className="space-y-8 divide-y divide-[#E6DFD5]">
            {faqs.map((faq, idx) => (
              <div key={idx} className={idx > 0 ? "pt-6" : ""}>
                <h3 className="text-lg sm:text-xl font-black text-[#2C2520] mb-2.5">
                  Q. {faq.q}
                </h3>
                <p className="text-base sm:text-lg text-[#61554D] leading-relaxed">
                  {faq.a}
                </p>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#E6DFD5] bg-[#FAF7F2] py-8 text-center text-sm text-[#8C6239] px-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>© {new Date().getFullYear()} KoreaMate. All rights reserved.</p>
          <p className="font-bold tracking-wide">
            Data provided by Korea Tourism Organization. AI-powered by Gemini.
          </p>
        </div>
      </footer>
    </div>
  );
}
