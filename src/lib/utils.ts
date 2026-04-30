import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatYen(n: number): string {
  return '¥' + n.toLocaleString('ja-JP');
}

export function formatYenSigned(n: number): string {
  if (n === 0) return '¥0';
  const sign = n > 0 ? '+' : '−';
  return sign + '¥' + Math.abs(n).toLocaleString('ja-JP');
}

export function formatPct(n: number, fractionDigits = 1): string {
  return n.toFixed(fractionDigits) + '%';
}
