-- content-recovery apply v1 (2026-09-14) — 실행 금지 상태로 준비(Owner 승인 후 정확 1회)
-- 대상: 이미지 5행(28,1319,40,1360,1273 — image_url IS NULL 일 때만) ·
--        ko 본문 16행(672,729,736,742,744,763,765,778,917,1088,1089,1098,1109,1125,1126,1633 — desc_l10n.ko 부재 시에만) ·
--        EN 3행(427,778,1319 — name/desc en 부재 시에만).
-- 원천: KTO TourAPI(공공데이터포털 활용신청 키 — 기존 KTO_OFFICIAL 계보와 동일), master jsonl 에 contentid·주소.
-- 좌표 identity: KTO mapy/mapx ↔ Main lat/lng 대조 기록(§15). 미확보(749·743 ko, 22·48 img, 778/1319 ja·zh)는 대상 밖.
BEGIN;

UPDATE city_spots SET image_url = 'https://tong.visitkorea.or.kr/cms/resource/69/3492369_image2_1.jpg', updated_at = now()
 WHERE id = 28 AND image_url IS NULL;

UPDATE city_spots SET image_url = 'https://tong.visitkorea.or.kr/cms/resource/99/3546099_image2_1.jpg', updated_at = now()
 WHERE id = 40 AND image_url IS NULL;

UPDATE city_spots SET image_url = 'http://tong.visitkorea.or.kr/cms/resource/44/3561844_image2_1.jpg', updated_at = now()
 WHERE id = 1273 AND image_url IS NULL;

UPDATE city_spots SET image_url = 'https://tong.visitkorea.or.kr/cms/resource/70/3561970_image2_1.jpg', updated_at = now()
 WHERE id = 1319 AND image_url IS NULL;

UPDATE city_spots SET image_url = 'http://tong.visitkorea.or.kr/cms/resource/00/2646400_image2_1.jpg', updated_at = now()
 WHERE id = 1360 AND image_url IS NULL;

UPDATE city_spots SET desc_l10n = coalesce(desc_l10n,'{}'::jsonb) || jsonb_build_object('ko','경주 남산 기슭에 흩어져 있던 것을 1923년 지금의 자리에 모아 세웠다. 이 석불들은 기본양식이 똑같아 처음부터 삼존불［三尊佛］로 모셔졌던 것으로 보인다. 중앙의 본존불은 머리에 상투 모양의 머리(육계)가 있는데, 특이하게도 이중으로 되어 있으며, 표면이 매끄럽게 표현되었다. 어린아이 표정의 네모난 얼굴은 풍만하며, 둥근 눈썹, 아래로 뜬 눈, 다문 입, 깊이 파인 보조개, 살찐 뺨 등을 통하여 온화하고 자비로운 불성［佛性］을 표현하고 있다. 목이 표현되지 않은 원통형의 체구에 손을 큼직하게 조각하였는데, 왼손은 내리고 오른손은 올리고 있다. 묵직해 보이는 옷은 불상을 전체적으로 강직해 보이게 하지만, 어린아이 같은 표정과 체구 등으로 오히려 따뜻한 생명을 실감 나게 표현하고 있다. 왼쪽의 보살은 머리에 보관을 쓰고 만면에 미소를 띠고 있으며, 가는 허리를 뒤틀고 있어 입체감이 나타난다. 오른손은 가슴에 대고 왼손은 내려 보병［寶甁］을 잡고 있는데, 보관에 새겨진 작은 부처와 더불어 이 보살이 관음보살임을 알 수 있게 해 준다. 오른쪽의 보살 역시 잔잔한 내면의 미소를 묘사하고 있는데, 무겁게 처리된 신체는 굵은 목걸이와 구슬장식으로 발목까지 치장하였다. 조각솜씨가 뛰어난 다정한 얼굴과 몸 등에서 인간적인 정감이 넘치면서도 함부로 범할 수 없는 종교적 신비가 풍기고 있는 작품으로 7세기 신라 불상조각의 대표작으로 평가된다.'), updated_at = now()
 WHERE id = 672 AND NOT coalesce(desc_l10n,'{}'::jsonb) ? 'ko';

UPDATE city_spots SET desc_l10n = coalesce(desc_l10n,'{}'::jsonb) || jsonb_build_object('ko','태조 이성계의 어진을 봉안하고 제사하는 전각인 전주 경기전은 1991년 1월 9일 사적으로 지정되었다. 1410년(태종 11)에 임금은 전주, 경주, 평양에 태조 이성계의 어진을 봉안하고 제사하는 전각을 짓고 어용전(御容殿)이라 하였다. 조선 왕조의 발상지라 여기는 전주에 건립한 태조 진전으로 경기전이라는 명칭은 세종 때 붙인 이름이다. 건물은 정유재란 때 소실되었던 것을 1614년(광해군 6)에 중건하였다. 보호 면적은 49,590㎡이다. 경기전의 경역은 정전(正殿)과 조경묘(肇慶廟)로 나뉜다. 정전은 태조 이성계의 어진을 봉안한 곳으로, 정면 3칸, 측면 3칸 규모이다. 지대석(地臺石)과 면석(面石) 및 갑석(甲石)을 갖춘 기단 위에 세운 다포계(多包系) 형식의 맞배집으로, 그 전면 가운데에는 1칸 규모의 기단을 돌출시켜 쌓고 그 위에 첨각(添閣)을 세워 배례청을 시설했다. 마치 능침(陵寢)의 정자각(丁字閣)과 같은 형상이다. 이 첨각 기단의 3면에 벽돌을 깐 보도를 연결하였다. 조경묘는 정전 북쪽에 있다. 태조의 22대조이며 전주이 씨의 시조인 신라 사공공(司空公) 이한(李翰) 부부의 위패를 봉안하기 위하여 1771년(영조 47)에 지은 것이다. 이곳에 남아 있는 경기전 조경묘 도형의 그림을 보면 지금은 없어진 전사청(典祀廳)·동재·서재·수복방·제기고 등 부속건물들과 별전이 따로 있는 광범위한 성역이었다.

경기전은 전주한옥마을에 방문했다면 꼭 들러야 할 곳 중 하나다. 드라마 촬영 명소로도 유명한 대나무숲, 고풍스러운 돌담길, 세월의 흔적을 간직한 소나무 숲과 매화나무는 고즈넉한 한옥들과 어우러져 아름다운 풍경을 선보이고 홍살문을 지나 정전으로 향하는 길에 보이는 풍경은 경건하기까지 하다. 

(출처 : 비짓전주)

◎ 한류의 매력을 만나는 여행 정보
도심 한가운데 있는 조선 시대의 고풍스러운 공간으로 정전, 돌담, 대나무숲 등이 사극의 분위기를 한껏 살린다. 먹거리, 놀 거리가 풍부한 전주한옥마을 안에 있어 전동성당과 함께 돌아보기 좋으며 주변에 한복대여소가 많아 한복을 입고 돌아보기를 추천한다.'), updated_at = now()
 WHERE id = 729 AND NOT coalesce(desc_l10n,'{}'::jsonb) ? 'ko';

UPDATE city_spots SET desc_l10n = coalesce(desc_l10n,'{}'::jsonb) || jsonb_build_object('ko','전주하면 완산칠봉, 완산칠봉하면 전주를 생각하게 할 만큼 전주의 대명사로 불리우는 산이 바로 완산칠봉이다. 천년고도 전주와 함께 이어 온 완산의 명맥이 호남평야로 흐르면서 익산과 군산 등 3시전의 발상지가 되고 있으며, 유서깊은 칠성사와 약수터 등을 품에 안고 있다. 완산칠봉 정상의 팔각정 전망대에 오르면 온 천지가 발 아래로 와서 머뭇거린다. 동학농민운동때 격전이 벌어졌던 장소이기도 한 완산칠봉은 현재 숲이 우거진 시민공원으로 가꾸어져 있다.'), updated_at = now()
 WHERE id = 736 AND NOT coalesce(desc_l10n,'{}'::jsonb) ? 'ko';

UPDATE city_spots SET desc_l10n = coalesce(desc_l10n,'{}'::jsonb) || jsonb_build_object('ko','남부시장의 역사는 조선 초기로 거슬러 올라간다. 당시 ‘남문밖시장’이 남부시장의 모태(母胎, base) 로 알려진다. 1905년에 정기 공설시장으로 개설됐고, 이후 ‘남부시장’이라는 명칭이 사용되기 시작했다. 21세기로 접어든 남부시장은 약 800여 개 점포에 주단, 가구, 건어물, 채소, 과일, 약재 등이 주요 취급 품목이다. 현재는 청년들의 전통시장 살리기가 남부시장의 새로운 활력을 불어넣고 있다. 빈 점포가 즐비했던 시장 6동 2층에는 서울의 삼청동과 홍대 골목 분위기와 흡사한 청년몰이, 남부시장 내 한옥마을에선 다양한 먹거리와 예술품이 가득한 야시장이 열리면서 남부시장만의 독특한 장터 풍경이 펼쳐진다. 추가로 매주 금·토요일에 열리는 야시장은 독특하고 개성있는 주전부리가 많은 것으로 유명한데 전통강호 피순대 정식과 고소한 녹두전, 비빔밥 롤 등이 남녀 모두에게 인기다.'), updated_at = now()
 WHERE id = 742 AND NOT coalesce(desc_l10n,'{}'::jsonb) ? 'ko';

UPDATE city_spots SET desc_l10n = coalesce(desc_l10n,'{}'::jsonb) || jsonb_build_object('ko','전주시 교동 한옥마을과 서학동을 잇는 남천교, 그리고 남천교 위에 세워진 팔작지붕을 한 청연루가 ‘전주 남천교 명품화사업’을 통하여 한옥마을의 새로운 랜드마크로 자리매김하고 있다. 남천교(길이 82.5m, 폭 25m)는 이 자리에 있던 옛 홍예교의 이미지를 살려 아치형 교량 구조를 하고 있다. 다리 위에 세워진 청연루는 전주 8경 중 하나인 한벽청연인 한벽당과 대칭적 의미로 붙여진 이름이다. 청연루에 올라 앉아 동쪽을 바라보면 멀리 기린봉 자락에 자리 잡은 동고사가 아스라이 보인다. 남천교 위에 기와로 지붕을 얹고 목재로 기둥을 세워 청연루를 만들어 놓았는데, 그 모습이 천년고도다운 격조가 있고 고풍이 완연하다. 완산팔경 가운데 하나가 ‘한벽청연’이다. ‘한벽’과 ‘청연’을 대구로 사용해서 다리 위쪽으로 한벽루가 있으니, 그 아래쪽에다가 청연루를 지은 것이다. 다리 위에 이런 정자가 있으니 여름엔 아주 시원할 듯하다. 무지개 모양의 교각과 한옥 모양의 다리가 아름다움을 자아낸다.'), updated_at = now()
 WHERE id = 744 AND NOT coalesce(desc_l10n,'{}'::jsonb) ? 'ko';

UPDATE city_spots SET desc_l10n = coalesce(desc_l10n,'{}'::jsonb) || jsonb_build_object('ko','한벽당은 조선왕조 태조의 개국을 도운 공신이며, 집현전 직제학을 지낸 월당 최담 선생이 태종 4년에 별장으로 건립하였는데, 한벽청연이라 하여 전주 8경의 하나로 꼽던 곳이다. 한벽당은 전주뿐만 아니라 호남의 명승으로 알려져 시인 묵객들이 그칠새 없이 찾던 곳으로 원래 옥처럼 항시 맑은 물이 흘러 바윗돌에 부딪혀 정경이 마치 벽옥한류 같다 해서 한벽이란 이름이 붙여졌다 전해지는데, 한벽당이라 불리게 된 연대는 알 수 없고 다만 월당 최담의 유허비에 월당루라는 기록이 있는 것으로 미루어 보아, 애초 월당루라고 불렸던 것을 알 수 있다. 규모는 정면 3칸, 측면 2칸의 팔작지붕이며, 전체가 마루인 구조이다.'), updated_at = now()
 WHERE id = 763 AND NOT coalesce(desc_l10n,'{}'::jsonb) ? 'ko';

UPDATE city_spots SET desc_l10n = coalesce(desc_l10n,'{}'::jsonb) || jsonb_build_object('ko','풍남문은 옛 전주읍성의 남쪽문으로 정유재란 때 파괴된 것을 영조 10년(1734) 성곽과 성문을 다시 지으면서 명견루라 불렀으며, 풍남문이라는 이름은 관찰사 홍낙인이 영조 44년(1768) 다시 지으면서 붙인 것이다. 순종 때 도시계획으로 성곽과 성문이 철거되면서 풍남문도 많은 손상을 입었는데 지금 있는 문은 1978년부터 시작된 3년간의 보수공사로 옛 모습을 되찾은 것이다. 규모는 1층이 앞면 3칸, 옆면 3칸, 2층이 앞면 3칸, 옆면 1칸이며, 지붕은 옆면에서 볼 때 여덟 팔(八)자 모양을 한 팔작지붕이다. 지붕 처마를 받치기 위해 장식하여 짠 구조가 기둥 위에만 있다. 평면상에서 볼 때 1층 건물 너비에 비해 2층 너비가 갑자기 줄어들어 좁아 보이는 것은 1층 안쪽에 있는 기둥을 그대로 2층까지 올려 모서리 기둥으로 사용하였기 때문이다.'), updated_at = now()
 WHERE id = 765 AND NOT coalesce(desc_l10n,'{}'::jsonb) ? 'ko';

UPDATE city_spots SET desc_l10n = coalesce(desc_l10n,'{}'::jsonb) || jsonb_build_object('ko','한벽당과 전주향교의 북쪽 4차선 노변, 벼랑같이 솟은 언덕에 세워진 오목대는 고려 말 우왕 6년(1380년)에 이성계가 운봉 황산에서 왜군을 무찌르고 돌아가던 중 조상인 목조가 살았던 이 곳에 들러 승전을 자축한 곳으로, 그 후 고종 황제가 친필로 쓴 태조고황 제주필유지비를 세웠다. 여기서 육교를 건너서 이목대가 있는데, 천주교의 성지 치명자산이 있는 승암산 발치에 위치한다. 오목대에서 육교를 건너면 70m 위쪽으로 이목대가 있는데 건물이 있는 80m 아래쪽에 비석과 비각을 세웠다. 이 비 속에는 목조대왕 구거유지라 새겨져 있는데 고종 황제의 친필이다. 목조는 조선조를 건국한 이태조의 5대 조로, 목조가 어릴 때 이곳에서 진법놀이를 하면서 살았던 유적지로 알려져 있으며, 그러한 내용이 용비어천가에도 나타나 있다. 목조가 당시의 전주 부사와의 불화로 이곳에서 함경도로 옮겨간 것이 이성계로 하여금 조선조를 건국할 수 있었던 계기가 되었으므로, 이를 하늘의 뜻이라고 여겼다 한다.'), updated_at = now()
 WHERE id = 778 AND NOT coalesce(desc_l10n,'{}'::jsonb) ? 'ko';

UPDATE city_spots SET desc_l10n = coalesce(desc_l10n,'{}'::jsonb) || jsonb_build_object('ko','건지산 줄기에 울창한 소나무숲으로 둘러싸여 있는 조경단은 1973년 6월 23일에 전북특별자치도 기념물로 지정되었다. 조선 태조의 21대조 이한은 묘역을 특별히 수호하도록 명했으며 이후 역대 왕들도 그와 같이 정성을 다해 보호해 왔다. 특히 고종은 1899년(광무 3) 5월에 이곳에 단을 쌓아 당상관을 배치하고 비석을 세워 전주 이 씨 시조의 묘로 정하고 ‘대한조경단(大韓肇慶壇)’이라 명명했다. 또한 해마다 한차례 제사를 지냈으며 단을 중심으로 450 정보의 단역을 마련했다. 이는 경기전, 조경묘와 함께 전주가 왕조 전주 이 씨의 발상지라는 의의를 한층 현실화한 조치였다. 전주 이 씨 선원계보에 따르면, 신라시대에 사공 벼슬을 지낸 이한을 시조로 18대인 목조까지 전주에 기거하였다는 기록이 있다고 한다(태조 22대). 경내 1만여 평의 주변을 돌담으로 쌓고 동·서·남·북문을 두었다. 조경단 남쪽 20m 지점에는 고종이 세운 비석이 비각에 안치되어 있다. 비석은 거북등 위에 세워졌으며 너비 1.8m, 두께 0.3m, 높이 약 2m로 거대한 대리석으로 만들어져 있다. 비석 앞면에 새겨진 ‘대한조경단’이라는 글씨와 비문은 고종의 어필이다. 비각은 한 변이 7.2m인 정사각형 3칸 팔작지붕으로 되어 있다.'), updated_at = now()
 WHERE id = 917 AND NOT coalesce(desc_l10n,'{}'::jsonb) ? 'ko';

UPDATE city_spots SET desc_l10n = coalesce(desc_l10n,'{}'::jsonb) || jsonb_build_object('ko','향교는 훌륭한 유학자의 위패를 모시고 제사를 지내며 지방민의 교육과 교화를 위해 설립된 고려·조선시대의 국립 교육기관이다. 전주향교에는 훌륭한 분들의 위패를 모신 대성전을 비롯해 동무·서무, 계성사, 학생들을 가르치던 곳인 명륜당 등의 여러 건물이 있다. 
대성전은 효종 4년(1653)이 고쳐 세웠는데, 이기발이 중건기를 남겼다. 이후 융희 원년(1907)에 군수 이중익이 다시 고쳤으며, 규모는 앞면 3칸, 옆면 2칸이다. 대성전 앞뜰의 400년이 넘은 은행나무를 비롯해 곳곳에 은행나무가 많아 1년 중 가을이 가장 아름답다고 알려져 있고, ‘구루미 그린 달빛’, ‘성균관 스캔들’ 등 각종 드라마와 영화의 배경지로 유명하다. 향교와 주위를 둘러싼 돌담을 배경으로 고즈넉한 분위기의 기념사진을 남길 수 있다.'), updated_at = now()
 WHERE id = 1088 AND NOT coalesce(desc_l10n,'{}'::jsonb) ? 'ko';

UPDATE city_spots SET desc_l10n = coalesce(desc_l10n,'{}'::jsonb) || jsonb_build_object('ko','전주 전동성당은 사적으로 조선시대 천주교도의 순교 터에 세워졌다. 이 건물은 천주교 신자들을 사형했던 전라북도 전주시 전동 풍남문 밖에 지어진 성당이다. 조선시대의 전주는 전라감영이 있었으므로 천주교회사에서 전동은 자연히 순교지의 하나가 됐다. 정조 15년(1791)에 최초의 순교자 윤지충(바오로)과 권상연(야고보), 순조 원년(1801)에 호남 첫 사도 유항검(아우구스티노)과 윤지헌(프란치스코) 등이 이곳에서 박해를 받고 처형됐다. 신유박해(1801년) 때는 이곳에서 유항검과 유관검 형제가 육시형을, 윤지헌, 김유산, 이우집 등이 교수형을 당했다. 이들의 순교의 뜻을 기리고자 1891년(고종 28)에 프랑스 보두네(Baudenet) 신부가 부지를 매입하고 1908년 성당 건립에 착수해 1914년에 완공했다. 이 성당 건물은 일제강점기에 지어졌으며 서울 명동성당을 설계한 프와넬 신부에게 설계를 맡겨 23년 만에 완공한 것이다. 회색과 붉은색 벽돌을 이용해 지은 건물은 겉모습이 서울의 명동성당과 비슷하며 초기 천주교 성당 중에서 매우 아름다운 건물로 손꼽힌다. 비잔틴 양식과 로마네스크 양식을 혼합한 건물로 국내에서도 가장 아름다운 건축물 중의 하나이다. 처음 이 성당은 천주교 순교지인 풍남문 밖에 세웠으나 후에 현재의 자리에 확장해 지은 것이다. 호남지역에서 최초로 지어진 로마네스크 양식의 건물로 장방형의 평면에 외부는 벽돌로 쌓았으며 중앙과 좌우에 비잔틴 양식의 종탑이 있다. 내부 천장은 아치형이며 양옆의 통로 위 천장은 십자 형태로 교차된 아치형이다. 성당 건축에 사용된 일부 벽돌은 당시 일본 통감부가 전주 읍성을 헐면서 나온 흙을 벽돌로 구웠으며 전주 읍성의 풍남문 인근 성벽에서 나온 돌로 성당의 주춧돌을 삼았다고 한다.'), updated_at = now()
 WHERE id = 1089 AND NOT coalesce(desc_l10n,'{}'::jsonb) ? 'ko';

UPDATE city_spots SET desc_l10n = coalesce(desc_l10n,'{}'::jsonb) || jsonb_build_object('ko','전주는 마한시대 이래 호남지방에서 규모가 큰 고을로 그 이름은 마한의 원산성에서 유래했다. 40여 년간 후백제의 수도였으며, 조선시대에는 이성계의 선조가 살았던 고향이라는  이유로 완산유수부로 개칭되기도 했다. 전주에서 볼거리로 강한 인상을 받게 되는 것 중의 하나가 덕진공원에 피는 연꽃이다. 그만큼 덕진공원 연못은 전주의 명물이다. 전주 IC에서 시내로 들어가는 팔달로변에 위치한 덕진공원은 고려시대에 형성된 자연 호수가 1978년 4월 시민공원 결정 고시에 의거, 도시공원으로 조성되었고 취향정과 더불어 유서 깊은 곳이다.
4만 5천 평의 경내에는 남쪽으로 3분의 2를 차지하고 있는 연못과 북쪽의 보트장을 동서로 가로지른 현수교가 그사이를 양분하고 있다. 그윽이 풍기는 연못 중앙으로 아치형 현수교를 거닐면서 한없는 시정에 젖어볼 수 있다. 특히, 대대적으로 정비 공사를 하여 1998년부터 재개장한 공원의 특색은 마운딩 시공으로 향촌의 작은 숲(언덕)을 연상케 하고, 전통 정자와 창포늪을 조성하여 역사성을 극대화하였고 또한 인공폭포와 목교를 설치하여 자연 친화 시설로 시민의 정서에 맞도록 조성하였으며 단오절에는 연못물로 부녀자들이 아침 일찍 머리를 감고 한해 건강을 기원하는 단오 창포물 잔치로도 유명하다.'), updated_at = now()
 WHERE id = 1098 AND NOT coalesce(desc_l10n,'{}'::jsonb) ? 'ko';

UPDATE city_spots SET desc_l10n = coalesce(desc_l10n,'{}'::jsonb) || jsonb_build_object('ko','전북특별자치도 전주시 한옥마을에 위치한 전주 전통술박물관은 공립 2종 박물관으로, 관람객들에게 한국 전통주에 관한 내용을 전시하고 있다. 시민과 관광객이 함께 향유할 수 있는 다양한 체험 프로그램과 문화 행사를 기획·운영하는 문화시설이다. 지역 양조장의 부흥과 전통주 문화 보급을 위해 박물관 내부에서 지역 전통주를 위탁 판매하고 있다. 또한 전통주에 관심이 있는 시민들을 대상으로 주기적인 전통주 관련 교육 프로그램을 운영하며 지역 전통주 문화의 거점 역할을 하고 있다.'), updated_at = now()
 WHERE id = 1109 AND NOT coalesce(desc_l10n,'{}'::jsonb) ? 'ko';

UPDATE city_spots SET desc_l10n = coalesce(desc_l10n,'{}'::jsonb) || jsonb_build_object('ko','전주한지박물관은 국내 제지업계의 선두 주자로 신문 용지와 출판 용지를 생산하는 전주페이퍼를 운영하고 있다. 우리 전통 한지 문화와 현재 우리 생활 속에서 사용되고 있는 한지의 모습을 동시에 선보여, 일반인들에게 한지의 우수성을 제대로 알리고 한지 문화 발전에 이바지하고자 2007년부터 종이 박물관에서 전주한지박물관으로 명칭을 변경하여 운영하고 있다. 현재 한지공예품, 한지 제작 도구, 고문서, 고서적 등 한지 관련 유물을 다시 소장하고 있으며, 해마다 다양한 주제로 한지의 색다른 모습을 살펴볼 수 있는 특별전을 개최하여 한지의 우수성과 아름다움을 소개하고 있다.'), updated_at = now()
 WHERE id = 1125 AND NOT coalesce(desc_l10n,'{}'::jsonb) ? 'ko';

UPDATE city_spots SET desc_l10n = coalesce(desc_l10n,'{}'::jsonb) || jsonb_build_object('ko','전주천은 전주시를 가로질러 삼천과 합류해 만경강으로 흘러 들어가는 하천으로 총길이 41.5㎞로 전주에 흐르는 6개의 하천 중 가장 길다. 전주천은 지난 1990년대 말까지만 하더라도 생활하수와 폐수, 콘크리트 제방 등으로 오염돼 4~5 급수의 물이 흐르는 하천이었다. 하지만 지난 1998년 전주천 자연형 생태하천복원사업을 통해 1 급수의 물이 흐르는 하천으로 탈바꿈했다. 전주천에는 1 급수에서만 산다는 쉬리와 갈겨니, 버들치 그리고 천연기념물인 수달과 원앙, 멸종위기종인 삵과 흰목물떼새도 만날 수 있다. 여러 생명체가 살아가는 전주천은 환경부 자연형 하천 정화 우수사례로 선정됐으며 여러 지자체에서 모범사례로 인정받았다. 물길을 따라 산책로와 자전거길이 조성되어 있어 전주시민들의 휴식과 운동 공간으로 사랑받고 있으며 봄날의 벚꽃길과 가을의 물억새 군락이 그림같이 펼쳐져 사람들이 발걸음이 끊이지 않는다. 특히 전주천 자전거길은 도보 길과 구분되어 있고 별다른 장애물이 없어 경관을 감상하며 자유롭게 자전거를 즐기기에 안성맞춤이다. 한옥마을과 남부야시장, 남천교와 청연루, 전주천을 가로지르는 운치 넘치는 징검다리와 한벽당과 한벽굴 등 중간에 잠시 길을 멈추고 가볼 곳들도 많다. 또 전주시 공영자전거 대여소인 꽃싱이가 곳곳에 설치되어 있어 저렴한 가격으로 시간제한 없이 자전거를 대여해 라이딩을 즐길 수도 있다.'), updated_at = now()
 WHERE id = 1126 AND NOT coalesce(desc_l10n,'{}'::jsonb) ? 'ko';

UPDATE city_spots SET desc_l10n = coalesce(desc_l10n,'{}'::jsonb) || jsonb_build_object('ko','부산 해운대 도시철도역 4번 출구에서 옛 해운대 기차역 뒤편 기찻길을 건너면 해리단길이 시작된다. 해리단길은 서울의 경리단길에서 아이디어를 얻은 이름이다. 좁은 도로를 따라 다양한 개성의 카페와 음식점들이 속속 생겨나면서 해운대 인기 명소로 자리매김했다.
골목길 담벼락에 그려진 위트 넘치는 벽화를 비롯해 자유로운 거리 분위기를 즐길 수 있어 시민들은 물론 관광객들도 일부러 찾아오는 곳이다. 사진 찍기 좋은 아기자기한 외관의 카페와 식당, 색다른 기념품을 판매하는 소품샙, 비정기적으로 열리는 플리마켓 등 다채로운 볼거리가 발길을 끌어모은다.'), updated_at = now()
 WHERE id = 1633 AND NOT coalesce(desc_l10n,'{}'::jsonb) ? 'ko';

UPDATE city_spots SET name_l10n = coalesce(name_l10n,'{}'::jsonb) || jsonb_build_object('en','Gyeongju Wolseong Palace Site (Banwolseong Fortress) (경주 월성(반월성))'), updated_at = now()
 WHERE id = 427 AND NOT coalesce(name_l10n,'{}'::jsonb) ? 'en';

UPDATE city_spots SET desc_l10n = coalesce(desc_l10n,'{}'::jsonb) || jsonb_build_object('en','This was the location of the palace-fortress during the Silla dynasty (57 BC ~ AD 935). The fortress takes after its name, which, literally translates to mean a crescent moon shape on top of a hill. The famous history books of Samgukyusa mention that Silla&rsquo;s 4th King Seoktalhae (AD 57~80) thought this area was an ideal spot for the fortress and bought the land from a nobleman. The 2nd King Namhae (AD 4~24) impressed by Seoktalhae&rsquo;s actions, took him in as his son-in-law, later, becoming the 4th king. The area was then under Silla&rsquo;s rule for 900 years, the last king being the 56th, Gyeongsoon (AD 927~935). 

Although the magnificent grandeur of the palace is now just an empty lot, it has been told that this area was filled with imperial buildings during the Silla dynasty. Currently, the region of Wolseong has a freezer made out of rocks called Seokbinggo, an archery range, a horse-riding field, and a traditional playground, which resembles the grounds of the Joseon Period (the dynasty that ruled the Korean peninsula from 1392-1910).'), updated_at = now()
 WHERE id = 427 AND NOT coalesce(desc_l10n,'{}'::jsonb) ? 'en';

UPDATE city_spots SET name_l10n = coalesce(name_l10n,'{}'::jsonb) || jsonb_build_object('en','Omokdae and Imokdae Historic Sites (오목대와 이목대)'), updated_at = now()
 WHERE id = 778 AND NOT coalesce(name_l10n,'{}'::jsonb) ? 'en';

UPDATE city_spots SET desc_l10n = coalesce(desc_l10n,'{}'::jsonb) || jsonb_build_object('en','Omokdae Historic Site is located on top of a steep hill and is one of the places where Yi Seong-gye, who later became King Taejo, the first king of the Joseon dynasty, stopped to celebrate his victory on his way home from a war against the Japanese army at Unbong Peak of Hwangsan Mountain. Across the bridge from Omokdae is Imokdae Historic Site, situated at the foot of Seungamsan Mountain. Approximately 80 meters downhill from Imokdae are memorial stones and a building where Mokjo, the great-great-grandfather of King Taejo, once used to live. The engraved letters on the stones are the handwritings of Emperor Gojong. Mokjo moved to Hamgyeongdo as a result of a dispute with the then minister of Jeonju, an incident which King Taejo believed to have laid the foundation for him to shape the Joseon dynasty.'), updated_at = now()
 WHERE id = 778 AND NOT coalesce(desc_l10n,'{}'::jsonb) ? 'en';

UPDATE city_spots SET name_l10n = coalesce(name_l10n,'{}'::jsonb) || jsonb_build_object('en','Bupyeong (Kkangtong) Market (부평시장(깡통시장))'), updated_at = now()
 WHERE id = 1319 AND NOT coalesce(name_l10n,'{}'::jsonb) ? 'en';

UPDATE city_spots SET desc_l10n = coalesce(desc_l10n,'{}'::jsonb) || jsonb_build_object('en','Busan''s Bupyeong Market is also known as Kkangtong (tin can) Market. It earned that funny name when it had a variety of imported canned goods from the United States for the US forces stationed in Korea during the Korean War. It was also known as "Dottegi (bustling plea) Market." All foreign products found in the country at that time were supplied from this market. Due to its vast property and many rare goods that were hard to find anywhere else during the time, it was also referred as "Gukje (International) Market." Nowadays, the market has reduced in size as many foreign products are freely imported, but the reputation and potential still remain. Some imported goods including liquor, clothes, ornaments, accessories, fashion items and electronic goods are still sold here. A night market opens from 19:30-23:30 at the public parking lot and at Arcade 2 of the market . Along the 110m-long street market are 11 kiosks selling Korean food, 6 kiosks selling international food such as Japanese and Filipino foods, and 13 vendors selling clothes and accessories. The entrance of the market greets visitors with bright LED lights and fun performances. A magic show and a guitar performance take place twice a day by the entrance of the market and the at the four-way intersection inside the market.'), updated_at = now()
 WHERE id = 1319 AND NOT coalesce(desc_l10n,'{}'::jsonb) ? 'en';

DO $$
DECLARE img_cnt int; ko_cnt int; en_cnt int;
BEGIN
  SELECT count(*) INTO img_cnt FROM city_spots WHERE id IN (28,40,1273,1319,1360) AND image_url IS NOT NULL;
  SELECT count(*) INTO ko_cnt FROM city_spots WHERE id IN (672,729,736,742,744,763,765,778,917,1088,1089,1098,1109,1125,1126,1633) AND coalesce(desc_l10n,'{}'::jsonb) ? 'ko';
  SELECT count(*) INTO en_cnt FROM city_spots WHERE id IN (427,778,1319) AND coalesce(name_l10n,'{}'::jsonb) ? 'en' AND coalesce(desc_l10n,'{}'::jsonb) ? 'en';
  IF img_cnt <> 5 OR ko_cnt <> 16 OR en_cnt <> 3 THEN
    RAISE EXCEPTION 'content-recovery verification failed: img=% ko=% en=%', img_cnt, ko_cnt, en_cnt;
  END IF;
END $$;

COMMIT;
