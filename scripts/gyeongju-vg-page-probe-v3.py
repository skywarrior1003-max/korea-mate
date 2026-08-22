#!/usr/bin/env python3
"""
Probe v3: Confirm JA URL (/jp/ vs /ja/) and ZH variants.
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

def fetch_and_parse(url, label):
    print(f"\n--- {label} ---")
    print(f"URL: {url}")
    try:
        resp = requests.get(url, headers=HEADERS, timeout=15)
        soup = BeautifulSoup(resp.text, "html.parser")
        art = soup.find("article")
        if art:
            h2 = art.find("h2")
            name = h2.get_text(strip=True) if h2 else "NO H2"
            paras = [p.get_text(strip=True) for p in art.find_all("p") if p.get_text(strip=True)]
            print(f"STATUS: ARTICLE FOUND")
            print(f"  name: {name!r}")
            first_para = paras[0][:200] if paras else "NO PARAS"
            print(f"  para[0]: {first_para!r}")
        else:
            body = soup.find("body")
            print(f"STATUS: NO ARTICLE")
            if body:
                print(f"  body start: {body.get_text(separator=' ', strip=True)[:100]!r}")
    except Exception as e:
        print(f"ERROR: {e}")

urls = [
    (f"https://www.visitgyeongju.or.kr/jp/cuisine/view/{TEST_VG_ID}", "JA (/jp/)"),
    (f"https://www.visitgyeongju.or.kr/ja/cuisine/view/{TEST_VG_ID}", "JA (/ja/ - prev test)"),
    (f"https://www.visitgyeongju.or.kr/chs/cuisine/view/{TEST_VG_ID}", "ZH-S (/chs/)"),
    (f"https://www.visitgyeongju.or.kr/cht/cuisine/view/{TEST_VG_ID}", "ZH-T (/cht/)"),
    (f"https://www.visitgyeongju.or.kr/zh/cuisine/view/{TEST_VG_ID}", "ZH (/zh/ - prev works)"),
]

for url, label in urls:
    fetch_and_parse(url, label)
    time.sleep(2)

print("\nDONE")
