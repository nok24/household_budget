import Encoding from 'encoding-japanese';
import Papa from 'papaparse';

// マネーフォワードME のCSVは Shift_JIS BOM無し、列順は固定。
// ヘッダの全角括弧を含む列名を内部キーに rename する。

export interface RawMfRow {
  計算対象: string;
  日付: string;
  内容: string;
  '金額（円）': string;
  保有金融機関: string;
  大項目: string;
  中項目: string;
  メモ: string;
  振替: string;
  ID: string;
}

export interface MfRow {
  isTarget: boolean;
  date: string; // YYYY-MM-DD
  contentName: string;
  amount: number;
  account: string;
  largeCategory: string;
  midCategory: string;
  memo: string;
  isTransfer: boolean;
  id: string;
}

/**
 * Drive から取得した ArrayBuffer (Shift_JIS) を UTF-8 文字列にデコードする。
 * BOMで UTF-8 と判定できれば素直に decode。
 */
export function decodeCsvBytes(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  const detected = Encoding.detect(bytes);
  const from = detected && detected !== 'BINARY' ? detected : 'SJIS';
  const converted = Encoding.convert(bytes, {
    from: from as Encoding.Encoding,
    to: 'UNICODE',
    type: 'string',
  });
  return converted as string;
}

export function parseRawMfCsv(text: string): RawMfRow[] {
  const result = Papa.parse<RawMfRow>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  if (result.errors.length > 0) {
    // 致命でなければ console に出すだけ
    console.warn('[csv] parse warnings:', result.errors.slice(0, 3));
  }
  return result.data;
}

function parseDate(yyyySlashMmSlashDd: string): string {
  // "2026/04/24" → "2026-04-24" (JST 前提でそのまま)
  const trimmed = yyyySlashMmSlashDd.trim();
  if (!trimmed) return '';
  const [y, m, d] = trimmed.split('/').map((s) => s.padStart(2, '0'));
  return `${y}-${m}-${d}`;
}

function parseAmount(yen: string): number {
  // MF はカンマ区切りで来る場合あり。前後空白も除去
  const cleaned = yen.replace(/[,\s]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function parseFlag(v: string): boolean {
  return v.trim() === '1';
}

export function normalizeMfRow(raw: RawMfRow): MfRow {
  return {
    isTarget: parseFlag(raw.計算対象 ?? ''),
    date: parseDate(raw.日付 ?? ''),
    contentName: (raw.内容 ?? '').trim(),
    amount: parseAmount(raw['金額（円）'] ?? '0'),
    account: (raw.保有金融機関 ?? '').trim(),
    largeCategory: (raw.大項目 ?? '').trim(),
    midCategory: (raw.中項目 ?? '').trim(),
    memo: (raw.メモ ?? '').trim(),
    isTransfer: parseFlag(raw.振替 ?? ''),
    id: (raw.ID ?? '').trim(),
  };
}

export function decodeAndParse(buf: ArrayBuffer): MfRow[] {
  const text = decodeCsvBytes(buf);
  const raws = parseRawMfCsv(text);
  return raws.map(normalizeMfRow).filter((r) => r.id); // ID無し行は捨てる
}
