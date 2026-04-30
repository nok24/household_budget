import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { cn, formatYen } from '@/lib/utils';
import {
  getMonthlyDiagnostics,
  getPositiveTransactionsForMonth,
} from '@/lib/diagnostics';

export default function DiagnosticsPanel() {
  const months = useLiveQuery(() => getMonthlyDiagnostics(), [], []);
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);

  if (months.length === 0) {
    return (
      <p className="text-sm text-ink-60">
        まだデータがキャッシュされていません。同期してから再度確認してください。
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full text-xs tabular-nums">
          <thead className="text-[10px] tracking-wider text-ink-40 text-left border-b border-line">
            <tr>
              <th className="py-2 pr-3">月</th>
              <th className="py-2 pr-3 text-right">全件</th>
              <th className="py-2 pr-3 text-right">+件</th>
              <th className="py-2 pr-3 text-right">−件</th>
              <th className="py-2 pr-3 text-right">振替</th>
              <th className="py-2 pr-3 text-right">対象外</th>
              <th className="py-2 pr-3 text-right">集計収入</th>
              <th className="py-2 pr-3 text-right">+総額</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => {
              const suspicious =
                m.positiveRows > 0 && m.countedIncomeRows === 0;
              return (
                <tr
                  key={m.yearMonth}
                  className={cn(
                    'border-b border-line/40 last:border-0 cursor-pointer hover:bg-canvas',
                    suspicious && 'bg-rose-50/60',
                    expandedMonth === m.yearMonth && 'bg-canvas',
                  )}
                  onClick={() =>
                    setExpandedMonth((prev) =>
                      prev === m.yearMonth ? null : m.yearMonth,
                    )
                  }
                >
                  <td className="py-2 pr-3 whitespace-nowrap font-medium">
                    {m.yearMonth}
                  </td>
                  <td className="py-2 pr-3 text-right text-ink-60">{m.total}</td>
                  <td className="py-2 pr-3 text-right">{m.positiveRows}</td>
                  <td className="py-2 pr-3 text-right">{m.negativeRows}</td>
                  <td className="py-2 pr-3 text-right text-ink-60">
                    {m.transferRows}
                  </td>
                  <td className="py-2 pr-3 text-right text-ink-60">
                    {m.nonTargetRows}
                  </td>
                  <td
                    className={cn(
                      'py-2 pr-3 text-right',
                      suspicious && 'text-rose-700 font-medium',
                    )}
                  >
                    {m.countedIncomeRows}
                    {m.countedIncomeAmount > 0 && (
                      <span className="text-[10px] text-ink-40 ml-1">
                        ({formatYen(m.countedIncomeAmount)})
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-right text-ink-60">
                    {formatYen(m.positiveTotalAmount)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-ink-40 leading-relaxed">
        列の意味: <strong>全件</strong>＝CSV取り込み行数 / <strong>+件</strong>＝amount&gt;0
        / <strong>−件</strong>＝amount&lt;0 / <strong>振替</strong>＝振替フラグ=1 /
        <strong>対象外</strong>＝計算対象=0 / <strong>集計収入</strong>＝計算対象=1
        かつ振替=0 かつ amount&gt;0 の件数 / <strong>+総額</strong>＝
        amount&gt;0の合計（フラグ無視）
        <br />
        ピンクの行は「+件は存在するのに、集計収入として認識されている件数が0」という不整合
        サインです。クリックすると amount&gt;0 の取引を一覧表示します。
      </p>

      {expandedMonth && (
        <PositiveRowsTable yearMonth={expandedMonth} />
      )}
    </div>
  );
}

function PositiveRowsTable({ yearMonth }: { yearMonth: string }) {
  const rows = useLiveQuery(
    () => getPositiveTransactionsForMonth(yearMonth),
    [yearMonth],
    [],
  );

  return (
    <div className="border-t border-line pt-4 space-y-2">
      <h3 className="text-xs font-medium tracking-wider text-ink-70">
        {yearMonth} の amount&gt;0 取引（{rows.length} 件）
      </h3>
      {rows.length === 0 ? (
        <p className="text-xs text-ink-60">該当なし</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs tabular-nums">
            <thead className="text-[10px] tracking-wider text-ink-40 text-left border-b border-line">
              <tr>
                <th className="py-1.5 pr-3">日付</th>
                <th className="py-1.5 pr-3">内容</th>
                <th className="py-1.5 pr-3 text-right">金額</th>
                <th className="py-1.5 pr-3">大項目</th>
                <th className="py-1.5 pr-3">中項目</th>
                <th className="py-1.5 pr-3">機関</th>
                <th className="py-1.5 pr-3 text-center">対象</th>
                <th className="py-1.5 pr-3 text-center">振替</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr
                  key={t.id}
                  className={cn(
                    'border-b border-line/30 last:border-0',
                    (t.isTransfer || !t.isTarget) && 'text-ink-40',
                  )}
                >
                  <td className="py-1.5 pr-3 whitespace-nowrap">{t.date}</td>
                  <td className="py-1.5 pr-3 truncate max-w-[200px]">
                    {t.contentName}
                  </td>
                  <td className="py-1.5 pr-3 text-right">
                    {formatYen(t.amount)}
                  </td>
                  <td className="py-1.5 pr-3 whitespace-nowrap">
                    {t.largeCategory || '—'}
                  </td>
                  <td className="py-1.5 pr-3 whitespace-nowrap text-ink-60">
                    {t.midCategory || '—'}
                  </td>
                  <td className="py-1.5 pr-3 truncate max-w-[120px]">
                    {t.account}
                  </td>
                  <td className="py-1.5 pr-3 text-center">
                    {t.isTarget ? '✓' : '×'}
                  </td>
                  <td
                    className={cn(
                      'py-1.5 pr-3 text-center',
                      t.isTransfer && 'text-rose-600 font-medium',
                    )}
                  >
                    {t.isTransfer ? '✓' : '−'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
