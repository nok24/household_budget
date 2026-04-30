// CSVから取得した想定のモックデータ
// 実際の運用では、外部CSVをパースしてこの形に整形する想定

window.HOUSEHOLD_DATA = (function () {
  const fmt = (n) => '¥' + n.toLocaleString('ja-JP');

  // 2026年4月のデータ
  const month = {
    label: '2026年 4月',
    income: 642000,
    expense: 387420,
    balance: 254580,
    budget: 420000,
    prevExpense: 401200, // 前月比較用
  };

  // カテゴリ別支出（多い順）
  const categories = [
    { id: 'food',     name: '食費',       amount: 86420,  budget: 90000,  color: '#7B8F6E', icon: '食' },
    { id: 'housing',  name: '住居',       amount: 132000, budget: 132000, color: '#A89884', icon: '住' },
    { id: 'utility',  name: '水道光熱',   amount: 21800,  budget: 25000,  color: '#9AA5B1', icon: '光' },
    { id: 'transit',  name: '交通',       amount: 18450,  budget: 22000,  color: '#B8A78A', icon: '交' },
    { id: 'comm',     name: '通信',       amount: 14200,  budget: 15000,  color: '#8E9AAB', icon: '通' },
    { id: 'health',   name: '医療・健康', amount: 9800,   budget: 12000,  color: '#C9A89A', icon: '医' },
    { id: 'leisure',  name: '娯楽',       amount: 28600,  budget: 30000,  color: '#B5916A', icon: '娯' },
    { id: 'edu',      name: '教育・教養', amount: 12400,  budget: 18000,  color: '#9C8FA8', icon: '教' },
    { id: 'apparel',  name: '衣服・美容', amount: 24800,  budget: 25000,  color: '#C9967A', icon: '衣' },
    { id: 'other',    name: 'その他',     amount: 38950,  budget: 50000,  color: '#A89C90', icon: '他' },
  ];

  // 月別の収支推移（直近12ヶ月）
  const trend = [
    { m: '5月',  income: 612000, expense: 392000 },
    { m: '6月',  income: 618000, expense: 408000 },
    { m: '7月',  income: 645000, expense: 445000 },
    { m: '8月',  income: 612000, expense: 462000 },
    { m: '9月',  income: 618000, expense: 388000 },
    { m: '10月', income: 624000, expense: 401000 },
    { m: '11月', income: 624000, expense: 415000 },
    { m: '12月', income: 982000, expense: 528000 }, // ボーナス月
    { m: '1月',  income: 624000, expense: 372000 },
    { m: '2月',  income: 624000, expense: 358000 },
    { m: '3月',  income: 642000, expense: 401000 },
    { m: '4月',  income: 642000, expense: 387420 },
  ];

  // 直近の取引（CSV由来、最新順）
  const transactions = [
    { date: '04-24', day: '金', cat: 'food',    name: 'いなげや 高井戸店',          amount: -3842,   account: '楽天カード',   member: '夫' },
    { date: '04-24', day: '金', cat: 'leisure', name: 'Netflix',                       amount: -1490,   account: 'Visa',          member: '共通' },
    { date: '04-23', day: '木', cat: 'transit', name: 'Suica チャージ',                amount: -3000,   account: 'モバイルSuica', member: '妻' },
    { date: '04-23', day: '木', cat: 'food',    name: 'スターバックス 渋谷',           amount: -680,    account: '楽天カード',   member: '夫' },
    { date: '04-22', day: '水', cat: 'comm',    name: 'NTTドコモ',                     amount: -7480,   account: '銀行引落',     member: '共通' },
    { date: '04-22', day: '水', cat: 'food',    name: 'まいばすけっと',                 amount: -2154,   account: '現金',          member: '妻' },
    { date: '04-21', day: '火', cat: 'apparel', name: 'ユニクロ 新宿',                  amount: -8990,   account: 'Visa',          member: '夫' },
    { date: '04-20', day: '月', cat: 'health',  name: '武田薬局',                       amount: -1820,   account: '現金',          member: '妻' },
    { date: '04-20', day: '月', cat: 'food',    name: 'オーケー 環八',                  amount: -5240,   account: '楽天カード',   member: '夫' },
    { date: '04-19', day: '日', cat: 'leisure', name: '紀伊國屋書店',                   amount: -3960,   account: 'Visa',          member: '妻' },
    { date: '04-19', day: '日', cat: 'food',    name: 'スシロー',                       amount: -4280,   account: '楽天カード',   member: '共通' },
    { date: '04-18', day: '土', cat: 'edu',     name: 'Audible',                        amount: -1500,   account: 'Visa',          member: '夫' },
    { date: '04-17', day: '金', cat: 'food',    name: 'いなげや 高井戸店',              amount: -2890,   account: '楽天カード',   member: '夫' },
    { date: '04-16', day: '木', cat: 'transit', name: 'JR東日本 定期',                  amount: -12480,  account: 'Visa',          member: '夫' },
    { date: '04-15', day: '水', cat: '_income', name: '給与 4月',                       amount:  482000, account: 'みずほ銀行',    member: '夫' },
    { date: '04-15', day: '水', cat: 'utility', name: '東京電力',                       amount: -8420,   account: '銀行引落',     member: '共通' },
    { date: '04-14', day: '火', cat: 'food',    name: 'まいばすけっと',                 amount: -1680,   account: '現金',          member: '妻' },
    { date: '04-12', day: '日', cat: 'leisure', name: 'TOHOシネマズ',                   amount: -3800,   account: 'Visa',          member: '共通' },
    { date: '04-10', day: '金', cat: '_income', name: '給与 4月',                       amount:  160000, account: '三井住友銀行',  member: '妻' },
    { date: '04-08', day: '水', cat: 'housing', name: '家賃',                           amount: -132000, account: '銀行引落',     member: '共通' },
  ];

  // メンバー別の支出
  const members = [
    { name: '夫',   amount: 142800, color: '#7B8F6E' },
    { name: '妻',   amount: 98400,  color: '#B8A78A' },
    { name: '共通', amount: 146220, color: '#A89884' },
  ];

  return { month, categories, trend, transactions, members, fmt };
})();
