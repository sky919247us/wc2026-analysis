/**
 * 俱樂部中文名對照（鍵＝football-data 的 shortName，原樣）。
 * 五大聯賽 shortName 由 /competitions/{PL,PD,BL1,SA,FL1}/teams 精確取得；
 * MLS / 墨西哥(LMX) / 土超(TSL) 的 /teams 為付費層，採已知/回填見到的 shortName 補（盡量準）。
 * 對不到者顯示英文（如其他洲聯賽）。
 */
export const CLUB_ZH: Record<string, string> = {
  // 英超 PL
  "Arsenal": "阿森納", "Aston Villa": "阿斯頓維拉", "Chelsea": "切爾西", "Everton": "埃弗頓",
  "Fulham": "富勒姆", "Liverpool": "利物浦", "Man City": "曼城", "Man United": "曼聯",
  "Newcastle": "紐卡索", "Sunderland": "桑德蘭", "Tottenham": "熱刺", "Hull City": "侯城",
  "Leeds United": "里茲聯", "Ipswich Town": "伊普斯維奇", "Nottingham": "諾丁漢森林",
  "Crystal Palace": "水晶宮", "Brighton Hove": "布萊頓", "Brentford": "布倫特福德",
  "Bournemouth": "伯恩茅斯", "Coventry City": "考文垂",
  // 西甲 PD
  "Athletic": "畢爾包競技", "Atleti": "馬德里競技", "Osasuna": "奧薩蘇納", "Espanyol": "西班牙人",
  "Barça": "巴塞隆納", "Getafe": "赫塔費", "Real Madrid": "皇家馬德里", "Rayo Vallecano": "巴列卡諾",
  "Levante": "萊萬特", "Mallorca": "馬約卡", "Real Betis": "皇家貝蒂斯", "Real Sociedad": "皇家社會",
  "Villarreal": "比利亞雷亞爾", "Valencia": "瓦倫西亞", "Alavés": "阿拉維斯", "Elche": "埃爾切",
  "Girona": "吉羅納", "Celta": "塞爾塔", "Sevilla FC": "塞維利亞", "Real Oviedo": "皇家奧維多",
  // 德甲 BL1
  "1. FC Köln": "科隆", "Hoffenheim": "霍芬海姆", "Leverkusen": "勒沃庫森", "Dortmund": "多特蒙德",
  "Bayern": "拜仁慕尼黑", "HSV": "漢堡", "Stuttgart": "斯圖加特", "Wolfsburg": "沃爾夫斯堡",
  "Bremen": "不來梅", "Mainz": "美因茨", "Augsburg": "奧格斯堡", "Freiburg": "弗萊堡",
  "M'gladbach": "門興格拉德巴赫", "Frankfurt": "法蘭克福", "St. Pauli": "聖保利",
  "Union Berlin": "柏林聯", "Heidenheim": "海登海姆", "RB Leipzig": "RB萊比錫",
  // 義甲 SA
  "Milan": "AC米蘭", "Fiorentina": "佛羅倫斯", "Roma": "羅馬", "Atalanta": "亞特蘭大",
  "Bologna": "博洛尼亞", "Cagliari": "卡利亞里", "Genoa": "熱那亞", "Inter": "國際米蘭",
  "Juventus": "尤文圖斯", "Lazio": "拉齊奧", "Parma": "帕爾馬", "Napoli": "拿坡里",
  "Udinese": "烏迪內斯", "Venezia FC": "威尼斯", "Frosinone": "弗羅西諾內", "Sassuolo": "薩索洛",
  "Torino": "都靈", "Lecce": "萊切", "Monza": "蒙扎", "Como 1907": "科莫",
  // 法甲 FL1
  "Toulouse": "圖盧茲", "Brest": "布雷斯特", "Marseille": "馬賽", "Auxerre": "歐塞爾",
  "Lille": "里爾", "Nice": "尼斯", "Olympique Lyon": "里昂", "PSG": "巴黎聖日耳曼",
  "Lorient": "洛里昂", "Stade Rennais": "雷恩", "Troyes": "特魯瓦", "Angers SCO": "昂熱",
  "Le Havre": "勒阿弗爾", "Le Mans": "勒芒", "RC Lens": "朗斯", "Monaco": "摩納哥",
  "Strasbourg": "斯特拉斯堡", "Paris FC": "巴黎FC",
  // 美職聯 MLS（回填見到者為準，其餘常見隊盡量）
  "Inter Miami": "邁阿密國際", "Orlando City": "奧蘭多城", "Chicago Fire": "芝加哥火焰",
  "Minnesota U": "明尼蘇達聯", "LA Galaxy": "洛杉磯銀河", "LAFC": "洛杉磯FC",
  "Atlanta United": "亞特蘭大聯", "Seattle Sounders": "西雅圖海灣者", "NY Red Bulls": "紐約紅牛",
  "NYCFC": "紐約城", "Toronto FC": "多倫多FC", "Columbus Crew": "哥倫布機員",
  "Nashville SC": "納許維爾", "FC Cincinnati": "辛辛那提", "Philadelphia Union": "費城聯",
  "Portland Timbers": "波特蘭伐木者", "Real Salt Lake": "鹽湖城", "Colorado Rapids": "科羅拉多急流",
  "Sporting KC": "堪薩斯城競技", "FC Dallas": "達拉斯", "Houston Dynamo": "休士頓迪納摩",
  "Austin FC": "奧斯汀", "Charlotte FC": "夏洛特", "New England": "新英格蘭革命",
  "St. Louis City": "聖路易城", "San Diego FC": "聖地牙哥FC", "CF Montréal": "蒙特婁",
  // 墨西哥 Liga MX（常見隊，shortName 盡量）
  "América": "美洲", "Guadalajara": "瓜達拉哈拉", "Cruz Azul": "藍十字", "Pumas": "美洲獅",
  "Tigres": "老虎", "Monterrey": "蒙特雷", "Toluca": "托盧卡", "León": "萊昂",
  "Santos Laguna": "桑托斯", "Pachuca": "帕丘卡", "Atlas": "亞特拉斯", "Tijuana": "提華納",
  // 土超 Süper Lig（常見隊）
  "Galatasaray": "加拉塔薩雷", "Fenerbahçe": "費內巴切", "Beşiktaş": "貝西克塔斯",
  "Trabzonspor": "特拉布宗", "Başakşehir": "巴沙克謝希爾",
};
