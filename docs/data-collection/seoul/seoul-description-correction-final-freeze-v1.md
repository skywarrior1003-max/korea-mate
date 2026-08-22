# TASK-SEOUL-DESCRIPTION-CORRECTION-FINAL-FREEZE-V1 — verification (generated from the focused harness; READ-ONLY on artifacts)

## Invariants
- Seoul ACTIVE before/after: 1837 / 1837 · removed 0 · added 0 · identity changed 0
- locale non-null before → after: {'en': 1793, 'ja': 1638, 'zh': 1630} → {'en': 1793, 'ja': 1638, 'zh': 1630} · ko 1837
- block metric invariant (blocks ≥ unique · removed = blocks − unique · after = unique): **6/6** · unique official block loss **0**
- leakage after fix — standard HTML tag rows 0 · CSS rows 0 · script/JSON-LD rows 0
- global cap truncated rows 0 · unapproved description diffs 0
- style affected rows {'en': 913, 'ja': 744, 'zh': 735} · script affected rows {'en': 12, 'ja': 4, 'zh': 4} · description changed rows {'en': 928, 'ja': 749, 'zh': 743} (total 2420)
- dedupe: places 3 · locale rows 6
- length after fix (stripped, per locale): {'en': {'>5000': 1, '>10000': 0, '>20000': 0, '>50000': 0, '>100000': 0, 'max': 5141}, 'ja': {'>5000': 0, '>10000': 0, '>20000': 0, '>50000': 0, '>100000': 0, 'max': 2840}, 'zh': {'>5000': 0, '>10000': 0, '>20000': 0, '>50000': 0, '>100000': 0, 'max': 3037}}

## Six approved dedupe rows (single block universe)
| canonical | locale | before chars (old path) | after code-block/tag fix | before blocks | unique | duplicates removed | after blocks | after chars | loss | invariant | order |
|---|---|---|---|---|---|---|---|---|---|---|---|
| seoul-KOPk4sx8q | en | 468316 | 5141 | 5 | 5 | 0 | 5 | 5141 | 0 | True | True |
| seoul-KOPk4sx8q | ja | 172339 | 2840 | 2 | 2 | 0 | 2 | 2840 | 0 | True | True |
| seoul-KOPk4sx8q | zh | 219181 | 3037 | 4 | 4 | 0 | 4 | 3037 | 0 | True | True |
| seoul-KOPpq0clc | en | 6947 | 1298 | 7 | 7 | 0 | 7 | 1298 | 0 | True | True |
| seoul-KOPrfwk6e | en | 19467 | 1761 | 24 | 20 | 4 | 20 | 1749 | 0 | True | True |
| seoul-KOPrfwk6e | zh | 5477 | 498 | 2 | 2 | 0 | 2 | 498 | 0 | True | True |

## Angle-bracket audit
- affected places 11 · locale rows 15 · unique tokens 42 · literal token occurrences (all inside attribute copies) 1746 · visible literal occurrences 0 · tokens lost after fix **0**
- Finding: every literal `<Title>` token in the Seoul artifact sits inside Google-Sheets paste metadata (`data-sheets-value="{…}"` attribute copies of the cell text). The visible text carries titles as `&lt;Title&gt;` entities, which strip_html decodes. The old `<[^>]+>` stripper let a title's `>` inside the attribute terminate the tag early, leaking the attribute JSON copy (incl. repeated program lists) into the description. Protecting non-HTML tokens (iteratively, for nested titles) keeps the tag boundary intact → the leak disappears and visible titles are unchanged.
| canonical | locale | dedupe row | old visible chars | new visible chars | tokens (literal occurrences · visible · old derived · new derived · lost) |
|---|---|---|---|---|---|
| seoul-KOP3pv6se | zh | False | 1143 | 243 | `<Buncheong Stroll>` 12·0·0·0·ok |
| seoul-KOPbtl4l5 | zh | False | 800 | 316 | `<旅行>` 2·0·0·0·ok |
| seoul-KOPer9yef | en | False | 670 | 631 | `<Happiness Recipe Found in a G` 1·0·1·1·ok |
| seoul-KOPjltxu8 | zh | False | 1205 | 305 | `<delight exhibition>` 8·0·2·2·ok |
| seoul-KOPk4sx8q | en | True | 468316 | 5141 | `<Corps extremes>` 97·0·1·1·ok |
| seoul-KOPk4sx8q | ja | True | 172339 | 2840 | `<卒>` 94·0·1·1·ok |
| seoul-KOPk4sx8q | zh | True | 219181 | 3037 | `< Lolling and Rolling>` 79·0·1·1·ok; `<A Notional History>` 79·0·1·1·ok; `<Beckett's Room>` 79·0·1·1·ok; `<Cuckoo>` 79·0·1·1·ok; `<EXTREME BODY>` 79·0·1·1·ok; `<Flesh>` 79·0·1·1·ok; `<Hamartia3部:Lolling and Rollin` 79·0·1·1·ok; `<JODONG>` 79·0·1·1·ok; `<他们只是存在>` 79·0·1·1·ok; `<卒>` 79·0·1·1·ok; `<地上的女人们>` 79·0·1·1·ok; `<就像我把我自己‧‧‧>` 79·0·1·1·ok; `<明天是现在今天是昨天>` 79·0·1·1·ok; `<构造和意识>` 79·0·1·1·ok; `<欢迎来到你的韩国>` 79·0·1·1·ok; `<移葬>` 79·0·1·1·ok; `<话剧练习3. 剧作练习-作为鱼类死亡>` 79·0·1·1·ok; `<韩国话剧的历史, The History of Korea` 79·0·1·1·ok |
| seoul-KOPmfskyu | ja | False | 1011 | 343 | `<記録で散策する_ソウルの公園>` 2·0·1·1·ok |
| seoul-KOPpq0clc | en | True | 6166 | 1298 | `<Parasite>` 4·0·1·1·ok; `<Squid Game>` 4·0·1·1·ok |
| seoul-KOPpq0clc | zh | False | 1678 | 362 | `<Listen>` 4·0·1·1·ok; `<寄生虫>` 8·0·2·2·ok; `<鱿鱼游戏>` 8·0·2·2·ok |
| seoul-KOPrfwk6e | en | True | 19467 | 1761 | `<Simultaneous Events>` 13·0·1·1·ok; `<Special Exhibitions>` 13·0·1·1·ok |
| seoul-KOPrfwk6e | zh | True | 5477 | 498 | `<同时举办>` 13·0·1·1·ok; `<特别馆>` 13·0·1·1·ok |
| seoul-KOPsbarih | zh | False | 297 | 233 | `<A Magical day>` 2·0·1·1·ok |
| seoul-KOPuf1clc | zh | False | 702 | 264 | `<岁月的童话(1991)>` 3·0·1·1·ok; `<平成狸合战(1994)>` 3·0·1·1·ok; `<红发少女安妮(1979)>` 6·0·2·2·ok; `<萤火虫之墓(1988)>` 3·0·1·1·ok; `<辉夜姬物语(2013)>` 3·0·1·1·ok; `<阿尔卑斯山的少女 (1974)>` 6·0·2·2·ok |
| seoul-KOPx61vzb | zh | False | 592 | 376 | `<昨天剩下的时间留给今天：The rest of today` 2·0·1·1·ok |

## Pipeline (fixed order)
short_description → `<style>` 제거 → `<script>` 제거 → non-HTML 꺾쇠 토큰 보호(표준 태그명 단독·닫는/선언 태그·attribute 포함만 마크업; 중첩 제목은 반복) → strip_html(태그→공백·entity 6종·공백 정규화) → 토큰 복원 → allowlist(3 장소/6 locale) exact duplicate block 제거(첫 등장·순서 유지) → description. AI/번역/truncate 0. Secondary Final 원본 불변.
