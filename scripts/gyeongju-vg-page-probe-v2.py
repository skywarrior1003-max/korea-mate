#!/usr/bin/env python3
"""
Probe v2: Detailed article parsing + KO URL alternatives + JA/ZH verification.
READ-ONLY.
"""
import time
import requests
from bs4 import BeautifulSoup

TEST_VG_ID = "535f40400604084d0a48034645514b4741"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

def fetch(url):
    resp = requests.get(url, headers=HEADERS, timeout=15)
    return resp

def parse_article(soup):
    art = soup.find("article")
    if not art:
        return None
    result = {}

    # h2 = restaurant name
    h2 = art.find("h2")
    if h2:
        result["name"] = h2.get_text(strip=True)

    # h3 = description heading (not the title itself)
    h3s = art.find_all("h3")
    result["h3s"] = [h.get_text(strip=True) for h in h3s]

    # Description: typically paragraph(s) before the info DL
    # Try to get text of paragraphs in article that aren't inside dl
    paras = []
    for p in art.find_all("p"):
        t = p.get_text(strip=True)
        if t:
            paras.append(t)
    result["paragraphs"] = paras

    # Full article text
    result["full_text"] = art.get_text(separator="\n", strip=True)

    # DL items
    dls = {}
    for dl in art.find_all("dl"):
        dt = dl.find("dt")
        dd = dl.find("dd")
        if dt and dd:
            key = dt.get_text(strip=True)
            val = dd.get_text(separator=" ", strip=True)
            dls[key] = val
    result["dls"] = dls

    return result

# 1. Test EN (works) -- parse article in detail
print("="*60)
print("TEST 1: EN article detailed parse")
url_en = f"https://www.visitgyeongju.or.kr/cuisine/view/{TEST_VG_ID}"
resp = fetch(url_en)
soup = BeautifulSoup(resp.text, "html.parser")
art = parse_article(soup)
if art:
    print(f"  name: {art.get('name')!r}")
    print(f"  h3s: {art.get('h3s')!r}")
    print(f"  paragraphs: {art.get('paragraphs')!r}")
    print(f"  dls: {art.get('dls')!r}")
    print(f"\n  FULL ARTICLE TEXT:\n{art.get('full_text')}")
else:
    print("  NO ARTICLE FOUND")

time.sleep(2)

# 2. Test KO URL alternatives
print("\n" + "="*60)
print("TEST 2: KO URL alternatives")
ko_urls = [
    f"https://www.visitgyeongju.or.kr/ko/cuisine/view/{TEST_VG_ID}",     # /ko/ prefix
    f"https://www.visitgyeongju.or.kr/cuisine/view/{TEST_VG_ID}?lang=ko",  # query param
    f"https://www.visitgyeongju.or.kr/kr/cuisine/view/{TEST_VG_ID}",      # /kr/ prefix
]
for url in ko_urls:
    print(f"\n  URL: {url}")
    try:
        r = fetch(url)
        soup2 = BeautifulSoup(r.text, "html.parser")
        art2 = parse_article(soup2)
        if art2:
            print(f"    name: {art2.get('name')!r}")
            print(f"    paragraphs: {art2.get('paragraphs')!r}")
            print(f"    full_text (first 300): {art2.get('full_text')[:300]!r}")
        else:
            print(f"    STATUS={r.status_code} NO ARTICLE")
            # Check first 500 chars of body
            body = soup2.find("body")
            if body:
                print(f"    body text start: {body.get_text(separator=' ', strip=True)[:200]!r}")
    except Exception as e:
        print(f"    ERROR: {e}")
    time.sleep(2)

# 3. Test JA
print("\n" + "="*60)
print("TEST 3: JA")
url_ja = f"https://www.visitgyeongju.or.kr/ja/cuisine/view/{TEST_VG_ID}"
r = fetch(url_ja)
soup = BeautifulSoup(r.text, "html.parser")
art = parse_article(soup)
if art:
    print(f"  name: {art.get('name')!r}")
    print(f"  paragraphs: {art.get('paragraphs')!r}")
    print(f"  dls: {art.get('dls')!r}")
    print(f"  FULL ARTICLE TEXT:\n{art.get('full_text')}")
else:
    print("  NO ARTICLE")
    body = soup.find("body")
    if body:
        print(f"  body text: {body.get_text(separator=' ', strip=True)[:300]!r}")

time.sleep(2)

# 4. Test ZH
print("\n" + "="*60)
print("TEST 4: ZH")
url_zh = f"https://www.visitgyeongju.or.kr/zh/cuisine/view/{TEST_VG_ID}"
r = fetch(url_zh)
soup = BeautifulSoup(r.text, "html.parser")
art = parse_article(soup)
if art:
    print(f"  name: {art.get('name')!r}")
    print(f"  paragraphs: {art.get('paragraphs')!r}")
    print(f"  dls: {art.get('dls')!r}")
    print(f"  FULL ARTICLE TEXT:\n{art.get('full_text')}")
else:
    print("  NO ARTICLE")
    body = soup.find("body")
    if body:
        print(f"  body text: {body.get_text(separator=' ', strip=True)[:300]!r}")

print("\n" + "="*60)
print("PROBE V2 COMPLETE")
