/**
 * 世界盃歷屆進球王種子資料（生涯 WC 進球，截至 2022 世界盃）
 *
 * 來源：Wikipedia「List of FIFA World Cup top goalscorers」2023-07 存檔
 *   （刻意取 2022 後、2026 前的乾淨快照，避免被進行中的 2026 數據污染），
 *   頂層數字另以 FIFA.com / Opta / Olympics.com 交叉比對。
 *
 * 用法：syncScorers 抓 football-data 的 2026 當屆進球，依 `en`（正規化後）
 *   對應到本表，`g2022 + 2026進球 = 生涯總進球`；有 2026 進球者最後年份改 2026。
 *   2026 才首度進球、不在本表者，由 fetcher 以 0 起算、年份 2026 新增。
 *
 * 收錄門檻：截至 2022 生涯 ≥6 球（歷史總榜顯示 >5）；另補幾位 2026 仍在陣中、
 *   生涯 5 球的「潛在追趕者」（只要 2026 進 1 球即 ≥6 自動上榜）。
 *
 * g2022 = 截至 2022 世界盃的生涯進球；last = 最後參加的世界盃年份。
 */
export interface HistScorer {
  en: string;       // 對應 football-data 的全名（比對用）
  enShort: string;  // 顯示用英文（多為姓氏）
  zh: string;       // 中文名
  country: string;  // 國別（中文，採當時參賽國名）
  g2022: number;
  last: number;
}

export const WC_SCORERS_HISTORY: HistScorer[] = [
  { en: "Miroslav Klose", enShort: "Klose", zh: "克洛澤", country: "德國", g2022: 16, last: 2014 },
  { en: "Ronaldo", enShort: "Ronaldo", zh: "羅納度", country: "巴西", g2022: 15, last: 2006 },
  { en: "Gerd Müller", enShort: "G. Müller", zh: "蓋德·穆勒", country: "西德", g2022: 14, last: 1974 },
  { en: "Lionel Messi", enShort: "Messi", zh: "梅西", country: "阿根廷", g2022: 13, last: 2022 },
  { en: "Just Fontaine", enShort: "Fontaine", zh: "方丹", country: "法國", g2022: 13, last: 1958 },
  { en: "Pelé", enShort: "Pelé", zh: "比利", country: "巴西", g2022: 12, last: 1970 },
  { en: "Kylian Mbappé", enShort: "Mbappé", zh: "姆巴佩", country: "法國", g2022: 12, last: 2022 },
  { en: "Sándor Kocsis", enShort: "Kocsis", zh: "柯奇士", country: "匈牙利", g2022: 11, last: 1954 },
  { en: "Jürgen Klinsmann", enShort: "Klinsmann", zh: "克林斯曼", country: "德國", g2022: 11, last: 1998 },
  { en: "Helmut Rahn", enShort: "Rahn", zh: "拉恩", country: "西德", g2022: 10, last: 1958 },
  { en: "Gary Lineker", enShort: "Lineker", zh: "萊因克爾", country: "英格蘭", g2022: 10, last: 1990 },
  { en: "Gabriel Batistuta", enShort: "Batistuta", zh: "巴提斯圖塔", country: "阿根廷", g2022: 10, last: 2002 },
  { en: "Teófilo Cubillas", enShort: "Cubillas", zh: "庫比拉斯", country: "祕魯", g2022: 10, last: 1982 },
  { en: "Thomas Müller", enShort: "T. Müller", zh: "湯瑪斯·穆勒", country: "德國", g2022: 10, last: 2022 },
  { en: "Grzegorz Lato", enShort: "Lato", zh: "拉托", country: "波蘭", g2022: 10, last: 1982 },
  { en: "Ademir", enShort: "Ademir", zh: "阿德米爾", country: "巴西", g2022: 9, last: 1950 },
  { en: "Eusébio", enShort: "Eusébio", zh: "尤西比奧", country: "葡萄牙", g2022: 9, last: 1966 },
  { en: "Christian Vieri", enShort: "Vieri", zh: "維埃里", country: "義大利", g2022: 9, last: 2002 },
  { en: "Vavá", enShort: "Vavá", zh: "瓦瓦", country: "巴西", g2022: 9, last: 1962 },
  { en: "David Villa", enShort: "Villa", zh: "大衛·比利亞", country: "西班牙", g2022: 9, last: 2014 },
  { en: "Paolo Rossi", enShort: "Rossi", zh: "保羅·羅西", country: "義大利", g2022: 9, last: 1986 },
  { en: "Jairzinho", enShort: "Jairzinho", zh: "雅伊爾辛紐", country: "巴西", g2022: 9, last: 1974 },
  { en: "Roberto Baggio", enShort: "Baggio", zh: "巴吉歐", country: "義大利", g2022: 9, last: 1998 },
  { en: "Karl-Heinz Rummenigge", enShort: "Rummenigge", zh: "魯梅尼格", country: "西德", g2022: 9, last: 1986 },
  { en: "Uwe Seeler", enShort: "Seeler", zh: "烏威·席勒", country: "西德", g2022: 9, last: 1970 },
  { en: "Guillermo Stábile", enShort: "Stábile", zh: "斯塔比萊", country: "阿根廷", g2022: 8, last: 1930 },
  { en: "Leônidas", enShort: "Leônidas", zh: "萊昂尼達斯", country: "巴西", g2022: 8, last: 1938 },
  { en: "Óscar Míguez", enShort: "Míguez", zh: "米格斯", country: "烏拉圭", g2022: 8, last: 1954 },
  { en: "Harry Kane", enShort: "Kane", zh: "凱恩", country: "英格蘭", g2022: 8, last: 2022 },
  { en: "Neymar", enShort: "Neymar", zh: "內馬爾", country: "巴西", g2022: 8, last: 2022 },
  { en: "Rivaldo", enShort: "Rivaldo", zh: "里瓦爾多", country: "巴西", g2022: 8, last: 2002 },
  { en: "Rudi Völler", enShort: "Völler", zh: "弗勒", country: "德國", g2022: 8, last: 1994 },
  { en: "Diego Maradona", enShort: "Maradona", zh: "馬拉度納", country: "阿根廷", g2022: 8, last: 1994 },
  { en: "Cristiano Ronaldo", enShort: "C. Ronaldo", zh: "C·羅納度", country: "葡萄牙", g2022: 8, last: 2022 },
  { en: "Oldřich Nejedlý", enShort: "Nejedlý", zh: "內耶德利", country: "捷克斯洛伐克", g2022: 7, last: 1938 },
  { en: "Lajos Tichy", enShort: "Tichy", zh: "蒂奇", country: "匈牙利", g2022: 7, last: 1966 },
  { en: "Careca", enShort: "Careca", zh: "卡雷卡", country: "巴西", g2022: 7, last: 1990 },
  { en: "Johnny Rep", enShort: "Rep", zh: "雷普", country: "荷蘭", g2022: 7, last: 1978 },
  { en: "Andrzej Szarmach", enShort: "Szarmach", zh: "沙馬赫", country: "波蘭", g2022: 7, last: 1982 },
  { en: "Hans Schäfer", enShort: "Schäfer", zh: "謝弗", country: "西德", g2022: 7, last: 1962 },
  { en: "Luis Suárez", enShort: "Suárez", zh: "蘇亞雷斯", country: "烏拉圭", g2022: 7, last: 2022 },
  { en: "Josef Hügi", enShort: "Hügi", zh: "胡基", country: "瑞士", g2022: 6, last: 1954 },
  { en: "Oleg Salenko", enShort: "Salenko", zh: "薩連科", country: "俄羅斯", g2022: 6, last: 1994 },
  { en: "György Sárosi", enShort: "Sárosi", zh: "沙羅希", country: "匈牙利", g2022: 6, last: 1938 },
  { en: "Max Morlock", enShort: "Morlock", zh: "莫洛克", country: "西德", g2022: 6, last: 1954 },
  { en: "Erich Probst", enShort: "Probst", zh: "普羅布斯特", country: "奧地利", g2022: 6, last: 1954 },
  { en: "Enner Valencia", enShort: "Valencia", zh: "瓦倫西亞", country: "厄瓜多", g2022: 6, last: 2022 },
  { en: "Salvatore Schillaci", enShort: "Schillaci", zh: "斯基拉奇", country: "義大利", g2022: 6, last: 1990 },
  { en: "Davor Šuker", enShort: "Šuker", zh: "蘇克", country: "克羅埃西亞", g2022: 6, last: 2002 },
  { en: "James Rodríguez", enShort: "J. Rodríguez", zh: "J·羅德里格斯", country: "哥倫比亞", g2022: 6, last: 2018 },
  { en: "Helmut Haller", enShort: "Haller", zh: "哈勒", country: "西德", g2022: 6, last: 1970 },
  { en: "Hristo Stoichkov", enShort: "Stoichkov", zh: "斯托伊奇科夫", country: "保加利亞", g2022: 6, last: 1998 },
  { en: "Diego Forlán", enShort: "Forlán", zh: "佛蘭", country: "烏拉圭", g2022: 6, last: 2014 },
  { en: "Asamoah Gyan", enShort: "Gyan", zh: "吉安", country: "迦納", g2022: 6, last: 2014 },
  { en: "Dennis Bergkamp", enShort: "Bergkamp", zh: "柏格坎普", country: "荷蘭", g2022: 6, last: 1998 },
  { en: "Rob Rensenbrink", enShort: "Rensenbrink", zh: "倫森布林克", country: "荷蘭", g2022: 6, last: 1978 },
  { en: "Rivellino", enShort: "Rivellino", zh: "里維利諾", country: "巴西", g2022: 6, last: 1978 },
  { en: "Bebeto", enShort: "Bebeto", zh: "貝貝托", country: "巴西", g2022: 6, last: 1998 },
  { en: "Arjen Robben", enShort: "Robben", zh: "羅本", country: "荷蘭", g2022: 6, last: 2014 },
  { en: "Zbigniew Boniek", enShort: "Boniek", zh: "博涅克", country: "波蘭", g2022: 6, last: 1986 },
  { en: "Thierry Henry", enShort: "Henry", zh: "亨利", country: "法國", g2022: 6, last: 2010 },
  { en: "Robin van Persie", enShort: "van Persie", zh: "范佩西", country: "荷蘭", g2022: 6, last: 2014 },
  { en: "Wesley Sneijder", enShort: "Sneijder", zh: "史奈德", country: "荷蘭", g2022: 6, last: 2014 },
  { en: "Ivan Perišić", enShort: "Perišić", zh: "佩里西奇", country: "克羅埃西亞", g2022: 6, last: 2022 },
  { en: "Mario Kempes", enShort: "Kempes", zh: "肯佩斯", country: "阿根廷", g2022: 6, last: 1982 },
  { en: "Lothar Matthäus", enShort: "Matthäus", zh: "馬特烏斯", country: "德國", g2022: 6, last: 1998 },

  // 現役 5 球追趕者（2026 進 1 球即 ≥6 上榜）
  { en: "Romelu Lukaku", enShort: "Lukaku", zh: "盧卡庫", country: "比利時", g2022: 5, last: 2022 },
  { en: "Xherdan Shaqiri", enShort: "Shaqiri", zh: "沙奇里", country: "瑞士", g2022: 5, last: 2022 },
  { en: "Olivier Giroud", enShort: "Giroud", zh: "吉魯", country: "法國", g2022: 5, last: 2022 },
];

/** 正規化姓名以利比對（去重音、轉小寫、壓空白） */
export function normName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[.\-']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
