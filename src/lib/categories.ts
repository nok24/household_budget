// MF の大項目名 → 表示色のマッピング。budget.json の categories[] を導入する Step 10 で
// この機能は budget store 経由になり、ここはフォールバック専用に縮小する想定。

const PALETTE: Record<string, string> = {
  食費: '#7B8F6E',
  住居: '#A89884',
  '水道・光熱': '#9AA5B1',
  '水道・光熱費': '#9AA5B1',
  光熱費: '#9AA5B1',
  交通費: '#B8A78A',
  交通: '#B8A78A',
  通信費: '#8E9AAB',
  通信: '#8E9AAB',
  '医療・健康': '#C9A89A',
  健康・医療: '#C9A89A',
  娯楽: '#B5916A',
  '教養・教育': '#9C8FA8',
  '教育・教養': '#9C8FA8',
  '衣服・美容': '#C9967A',
  趣味・娯楽: '#B5916A',
  日用品: '#A8A48A',
  税・社会保険: '#9A857A',
  '特別な支出': '#B85C3D',
  保険: '#7E9AA0',
  現金・カード: '#9AA5B1',
  収入: '#3F5A4A',
  '': '#A89C90',
  未分類: '#A89C90',
  その他: '#A89C90',
};

const FALLBACKS = ['#7B8F6E', '#A89884', '#9AA5B1', '#B8A78A', '#8E9AAB', '#C9A89A', '#B5916A', '#9C8FA8', '#C9967A', '#A89C90'];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function colorForCategory(name: string): string {
  if (PALETTE[name]) return PALETTE[name];
  return FALLBACKS[hashString(name) % FALLBACKS.length];
}
