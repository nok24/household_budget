import Papa from 'papaparse';
import { decodeCsvBytes } from './mfTransactions';

/**
 * 資産推移 CSV (MF の「資産推移」エクスポート相当) を月単位スナップショットに変換する。
 * src/lib/assetCsv.ts のロジックを Worker 側へ移植。
 *
 * 期待ヘッダ:
 *   "日付","合計（円）","預金・現金・暗号資産（円）","株式(現物)（円）","投資信託（円）",
 *   "年金（円）","ポイント（円）"
 *
 * 直近は日次・過去は月末のみ、というデータ。月次集計しか使わないので各月の最終日付を採用。
 */

export interface RawAssetRow {
  日付?: string;
  '合計（円）'?: string;
  '預金・現金・暗号資産（円）'?: string;
  '株式(現物)（円）'?: string;
  '投資信託（円）'?: string;
  '年金（円）'?: string;
  'ポイント（円）'?: string;
}

export interface AssetRow {
  date: string;
  total: number;
  savings: number;
  stocks: number;
  funds: number;
  pension: number;
  points: number;
}

export interface MonthlyAssetSnapshot {
  yearMonth: string;
  date: string;
  total: number;
  savings: number;
  stocks: number;
  funds: number;
  pension: number;
  points: number;
}

const REQUIRED_HEADERS = [
  '日付',
  '合計（円）',
  '預金・現金・暗号資産（円）',
  '株式(現物)（円）',
  '投資信託（円）',
];

function stripQuotes(s: string): string {
  const t = s.trim();
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) {
    return t.slice(1, -1).replace(/""/g, '"');
  }
  return t;
}

export function looksLikeAssetCsv(text: string): boolean {
  // BOM (U+FEFF) と先頭改行を除去して 1 行目だけで判定
  const firstLine = text.replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0] ?? '';
  const cells = firstLine.split(',').map(stripQuotes);
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
    total: parseYen(raw['合計（円）']),
    savings: parseYen(raw['預金・現金・暗号資産（円）']),
    stocks: parseYen(raw['株式(現物)（円）']),
    funds: parseYen(raw['投資信託（円）']),
    pension: parseYen(raw['年金（円）']),
    points: parseYen(raw['ポイント（円）']),
  };
}

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

export function decodeAndParseAssetCsv(buf: ArrayBuffer): MonthlyAssetSnapshot[] {
  const text = decodeCsvBytes(buf);
  if (!looksLikeAssetCsv(text)) {
    throw new Error('asset csv header mismatch');
  }
  const raws = parseRawAssetCsv(text);
  const rows = raws.map(normalizeAssetRow).filter((r) => r.date);
  return rollupMonthly(rows);
}
