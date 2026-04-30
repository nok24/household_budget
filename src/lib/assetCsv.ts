import Papa from 'papaparse';
import { decodeCsvBytes } from './csv';

// 資産推移CSV（妻が別フォルダで管理しているマネーフォワード資産推移エクスポート）
// の列構成。MFの取引CSV（src/lib/csv.ts）とは別物で、列単位の残高スナップショット。
//
// 期待されるヘッダ:
//   日付,合計(円),預金・現金・暗号資産(円),株式(現物)(円),投資信託(円),年金(円),ポイント(円)
//
// 直近は日次・過去は月末のみ、というふうに混在しているのが実データ。
// アプリでは月次集計だけ使うので、各月の最終日付の行を「月末スナップショット」扱いに丸める。

export interface RawAssetRow {
  日付?: string;
  '合計(円)'?: string;
  '預金・現金・暗号資産(円)'?: string;
  '株式(現物)(円)'?: string;
  '投資信託(円)'?: string;
  '年金(円)'?: string;
  'ポイント(円)'?: string;
}

export interface AssetRow {
  date: string; // YYYY-MM-DD
  total: number;
  savings: number;
  stocks: number;
  funds: number;
  pension: number;
  points: number;
}

export interface MonthlyAssetSnapshot {
  yearMonth: string; // YYYY-MM
  date: string; // 元データ日付
  total: number;
  savings: number;
  stocks: number;
  funds: number;
  pension: number;
  points: number;
}

const REQUIRED_HEADERS = [
  '日付',
  '合計(円)',
  '預金・現金・暗号資産(円)',
  '株式(現物)(円)',
  '投資信託(円)',
];

/**
 * ヘッダ行を検査して資産推移CSVと判定できるかを返す。
 * 取引CSVと混在しても誤って取り込まないための安全弁。
 */
export function looksLikeAssetCsv(text: string): boolean {
  // 先頭行だけ取って簡易判定。BOM除去 + 改行どちらでも対応
  const firstLine = text.replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0] ?? '';
  const cells = firstLine.split(',').map((s) => s.trim());
  return REQUIRED_HEADERS.every((h) => cells.includes(h));
}

function parseDate(slashDate: string): string {
  const trimmed = slashDate.trim();
  if (!trimmed) return '';
  const parts = trimmed.split('/');
  if (parts.length !== 3) return '';
  const [y, m, d] = parts.map((s) => s.padStart(2, '0'));
  return `${y}-${m}-${d}`;
}

function parseYen(v: string | undefined): number {
  if (!v) return 0;
  const cleaned = v.replace(/[,\s]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export function parseRawAssetCsv(text: string): RawAssetRow[] {
  const result = Papa.parse<RawAssetRow>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  if (result.errors.length > 0) {
    console.warn('[assetCsv] parse warnings:', result.errors.slice(0, 3));
  }
  return result.data;
}

export function normalizeAssetRow(raw: RawAssetRow): AssetRow {
  return {
    date: parseDate(raw.日付 ?? ''),
    total: parseYen(raw['合計(円)']),
    savings: parseYen(raw['預金・現金・暗号資産(円)']),
    stocks: parseYen(raw['株式(現物)(円)']),
    funds: parseYen(raw['投資信託(円)']),
    pension: parseYen(raw['年金(円)']),
    points: parseYen(raw['ポイント(円)']),
  };
}

/**
 * 全行を月単位にロールアップ。各月の最大日付の行を採用する。
 */
export function rollupMonthly(rows: AssetRow[]): MonthlyAssetSnapshot[] {
  const byMonth = new Map<string, AssetRow>();
  for (const r of rows) {
    if (!r.date) continue;
    const ym = r.date.slice(0, 7);
    const cur = byMonth.get(ym);
    if (!cur || r.date > cur.date) byMonth.set(ym, r);
  }
  return [...byMonth.entries()]
    .map(([yearMonth, r]) => ({
      yearMonth,
      date: r.date,
      total: r.total,
      savings: r.savings,
      stocks: r.stocks,
      funds: r.funds,
      pension: r.pension,
      points: r.points,
    }))
    .sort((a, b) => (a.yearMonth < b.yearMonth ? -1 : 1));
}

export function parseAssetCsvText(text: string): MonthlyAssetSnapshot[] {
  if (!looksLikeAssetCsv(text)) {
    throw new Error('資産推移CSVのヘッダが期待と一致しません');
  }
  const raws = parseRawAssetCsv(text);
  const rows = raws.map(normalizeAssetRow).filter((r) => r.date);
  return rollupMonthly(rows);
}

export function decodeAndParseAsset(buf: ArrayBuffer): MonthlyAssetSnapshot[] {
  return parseAssetCsvText(decodeCsvBytes(buf));
}
