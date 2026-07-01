/**
 * 明星球員 → 俱樂部 shortName 靜態對照。
 *
 * 為何需要：世界盃在夏天，五大聯賽/土超/沙烏地都「夏休、無 running competition」，
 * football-data 的 /persons 對這些球員回傳的是「國家隊」而非俱樂部（拿不到俱樂部），
 * 且聯賽/俱樂部端點免費層不含 squad。→ 只能靠靜態表補這些夏休聯賽的球員。
 * 季中聯賽（MLS/巴甲/阿甲/北歐/Liga MX）仍由 /persons 自動抓，不放這裡。
 *
 * 只收「高度確定」的大牌（轉會頻繁者寧可留白）。shortName 必須對得上 clubNames 的鍵。
 */
export const WC_PLAYER_CLUBS: [string, string][] = [
  // 法國
  ["Kylian Mbappé", "Real Madrid"], ["Aurélien Tchouameni", "Real Madrid"], ["William Saliba", "Arsenal"],
  ["Jules Koundé", "Barça"], ["Ibrahima Konaté", "Liverpool"], ["Dayot Upamecano", "Bayern"],
  ["Marcus Thuram-Ulien", "Inter"], ["Mike Maignan", "Milan"], ["Ousmane Dembélé", "PSG"],
  ["Bradley Barcola", "PSG"], ["Lucas Hernández", "PSG"], ["Warren Zaïre-Emery", "PSG"],
  ["Desire Doue", "PSG"], ["Jean-Philippe Mateta", "Crystal Palace"], ["Lucas Digne", "Aston Villa"],
  ["Michael Olise", "Bayern"], ["Manu Koné", "Roma"], ["Maxence Lacroix", "Crystal Palace"],
  // 英格蘭
  ["Harry Kane", "Bayern"], ["Jude Bellingham", "Real Madrid"], ["Bukayo Saka", "Arsenal"],
  ["Declan Rice", "Arsenal"], ["John Stones", "Man City"], ["Jordan Pickford", "Everton"],
  ["Reece James", "Chelsea"], ["Marc Guéhi", "Crystal Palace"], ["Eberechi Eze", "Arsenal"],
  ["Anthony Gordon", "Newcastle"], ["Ollie Watkins", "Aston Villa"], ["Morgan Rogers", "Aston Villa"],
  ["Kobbie Mainoo", "Man United"], ["Elliot Anderson", "Nottingham"], ["Dan Burn", "Newcastle"],
  ["Mikel Merino", "Arsenal"], ["Marcus Rashford", "Barça"],
  // 西班牙
  ["Lamine Yamal", "Barça"], ["Pedri", "Barça"], ["Pablo Gavira", "Barça"], ["Rodri", "Man City"],
  ["Dani Olmo", "Barça"], ["Pau Cubarsí", "Barça"], ["Ferrán Torres", "Barça"], ["Fabián Ruiz", "PSG"],
  ["Marc Pubill", "Atleti"], ["Marcos Llorente", "Atleti"], ["Cucurella", "Chelsea"],
  ["Pedro Porro", "Tottenham"], ["David Raya", "Arsenal"], ["Unai Simón", "Athletic"],
  ["Nico Williams", "Athletic"], ["Mikel Oyarzabal", "Real Sociedad"], ["Álex Baena", "Atleti"],
  ["Alejandro Grimaldo", "Leverkusen"], ["Martín Zubimendi", "Arsenal"],
  // 葡萄牙
  ["Bruno Fernandes", "Man United"], ["Bernardo Silva", "Man City"], ["Rúben Dias", "Man City"],
  ["Diogo Dalot", "Man United"], ["Rafael Leão", "Milan"], ["Vitinha", "PSG"], ["Nuno Mendes", "PSG"],
  ["Joao Neves", "PSG"], ["Gonçalo Ramos", "PSG"], ["Pedro Neto", "Chelsea"],
  ["Renato Veiga", "Villarreal"], ["Matheus Nunes", "Man City"],
  // 德國
  ["Jamal Musiala", "Bayern"], ["Florian Wirtz", "Liverpool"], ["Joshua Kimmich", "Bayern"],
  ["Kai Havertz", "Arsenal"], ["Antonio Rüdiger", "Real Madrid"], ["Leroy Sané", "Galatasaray"],
  ["Jonathan Tah", "Bayern"], ["Nico Schlotterbeck", "Dortmund"], ["Leon Goretzka", "Bayern"],
  ["Deniz Undav", "Stuttgart"], ["Nick Woltemade", "Newcastle"], ["Aleksandar Pavlović", "Bayern"],
  ["Manuel Neuer", "Bayern"], ["David Raum", "RB Leipzig"], ["Angelo Stiller", "Stuttgart"],
  ["Maximilian Beier", "Dortmund"], ["Nadiem Amiri", "Mainz"],
  // 荷蘭
  ["Virgil van Dijk", "Liverpool"], ["Cody Gakpo", "Liverpool"], ["Ryan Gravenberch", "Liverpool"],
  ["Frenkie de Jong", "Barça"], ["Denzel Dumfries", "Inter"], ["Tijjani Reijnders", "Man City"],
  ["Jurrien Timber", "Arsenal"], ["Mickey van de Ven", "Tottenham"], ["Nathan Aké", "Man City"],
  // 比利時
  ["Jeremy Doku", "Man City"], ["Youri Tielemans", "Aston Villa"], ["Amadou Onana", "Aston Villa"],
  ["Leandro Trossard", "Arsenal"], ["Thibaut Courtois", "Real Madrid"], ["Charles De Ketelaere", "Atalanta"],
  ["Dodi Lukebakio", "Sevilla FC"], ["Kevin De Bruyne", "Napoli"],
  // 克羅埃西亞
  ["Luka Modrić", "Milan"], ["Joško Gvardiol", "Man City"], ["Mateo Kovačić", "Man City"],
  ["Josip Stanišić", "Bayern"], ["Marin Pongračić", "Fiorentina"], ["Andrej Kramarić", "Hoffenheim"],
  // 摩洛哥 / 其他
  ["Achraf Hakimi", "PSG"], ["Brahim Diaz", "Real Madrid"], ["Noussair Mazraoui", "Man United"],
  ["Ismael Saibari", "PSV"], ["Ismaïla Sarr", "Crystal Palace"], ["Pape Sarr", "Tottenham"],
];
