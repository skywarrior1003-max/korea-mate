#!/usr/bin/env python3
"""
Probe VisitGyeongju food page HTML structure.
Tests one vg_id across 4 locale URLs.
READ-ONLY — no file output except to stdout.
"""
import time
import requests
from bs4 import BeautifulSoup

# 고도벌 한정식 (first record in vg-raw)
TEST_VG_ID = "535f40400604084d0a48034645514b4741"

LOCALE_URLS = {
    "ko": f"https://www.visitgyeongju.or.kr/ko/cuisine/view/{TEST_VG_ID}",
    "en": f"https://www.visitgyeongju.or.kr/cuisine/view/{TEST_VG_ID}",
    "ja": f"https://www.visitgyeongju.or.kr/ja/cuisine/view/{TEST_VG_ID}",
    "zh": f"https://www.visitgyeongju.or.kr/zh/cuisine/view/{TEST_VG_ID}",
}

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

def probe_page(locale, url):
    print(f"\n{'='*60}")
    print(f"LOCALE: {locale}")
    print(f"URL: {url}")
    try:
        resp = requests.get(url, headers=HEADERS, timeout=15)
        print(f"STATUS: {resp.status_code}")
        print(f"CONTENT-TYPE: {resp.headers.get('Content-Type', 'unknown')}")
        if resp.status_code != 200:
            print(f"NON-200 RESPONSE")
            print(resp.text[:500])
            return

        soup = BeautifulSoup(resp.text, "html.parser")

        # Page title
        title_tag = soup.find("title")
        print(f"PAGE TITLE: {title_tag.text.strip() if title_tag else 'NONE'}")

        # Try common description selectors
        selectors_to_try = [
            ("div.view-content", None),
            ("div.content-area", None),
            ("div.detail-content", None),
            ("div.desc", None),
            ("div.description", None),
            ("article", None),
            ("div#content", None),
            ("div.contents", None),
            ("section.detail", None),
            ("div.intro", None),
            ("p.description", None),
            ("div.view-body", None),
            ("div.place-desc", None),
            ("div.detail-info", None),
        ]

        print(f"\n--- SELECTOR SCAN ---")
        for sel, attr in selectors_to_try:
            found = soup.select(sel)
            if found:
                text = found[0].get_text(separator=" ", strip=True)
                print(f"  {sel}: FOUND (len={len(text)}) => {text[:120]!r}")

        # Find all divs with class containing 'desc' or 'content'
        print(f"\n--- DIV CLASS SCAN ---")
        for tag in soup.find_all("div", class_=True):
            classes = " ".join(tag.get("class", []))
            if any(k in classes.lower() for k in ["desc", "intro", "content", "detail", "info", "body", "text"]):
                text = tag.get_text(separator=" ", strip=True)
                if len(text) > 30:
                    print(f"  class={classes!r}: {text[:150]!r}")

        # Check for h1/h2 (page heading)
        print(f"\n--- HEADINGS ---")
        for h in soup.find_all(["h1", "h2", "h3"]):
            t = h.get_text(strip=True)
            if t:
                print(f"  {h.name}: {t!r}")

        # Check metadata
        print(f"\n--- META ---")
        for m in soup.find_all("meta"):
            name = m.get("name", m.get("property", ""))
            content = m.get("content", "")
            if name and content and any(k in name.lower() for k in ["description", "title", "keyword"]):
                print(f"  {name}: {content[:200]!r}")

        # Look for info table / dl / ul with info
        print(f"\n--- DL/TABLE INFO ---")
        for dl in soup.find_all("dl"):
            text = dl.get_text(separator=" | ", strip=True)
            if text:
                print(f"  DL: {text[:200]!r}")

        # Print first 2000 chars of raw HTML for manual inspection
        print(f"\n--- RAW HTML EXCERPT (first 3000 chars) ---")
        print(resp.text[:3000])

    except Exception as e:
        print(f"ERROR: {e}")

for locale, url in LOCALE_URLS.items():
    probe_page(locale, url)
    time.sleep(2)

print(f"\n{'='*60}")
print("PROBE COMPLETE")
