import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import dayjs from 'dayjs';
import { formatYen } from '@/lib/utils';
import type { MonthSummary } from '@/lib/aggregate';

const ACCENT = '#3F5A4A';
const ACCENT_DIM = 'rgba(63,90,74,0.55)';
const EXPENSE = 'rgba(26,26,26,0.18)';
const EXPENSE_DIM = 'rgba(26,26,26,0.10)';

interface Props {
  data: MonthSummary[];
  selectedMonth?: string;
  height?: number;
}

export default function TrendBarChart({ data, selectedMonth, height = 180 }: Props) {
  const chartData = data.map((d) => ({
    label: dayjs(`${d.yearMonth}-01`).format('M月'),
    yearMonth: d.yearMonth,
    income: d.income,
    expense: d.expense,
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={chartData} margin={{ top: 8, right: 4, bottom: 4, left: 4 }}>
        <CartesianGrid stroke="rgba(26,26,26,0.06)" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10, fill: 'rgba(26,26,26,0.55)' }}
          axisLine={{ stroke: 'rgba(26,26,26,0.08)' }}
          tickLine={false}
        />
        <YAxis hide />
        <Tooltip
          cursor={{ fill: 'rgba(63,90,74,0.06)' }}
          contentStyle={{
            background: '#fff',
            border: '1px solid rgba(26,26,26,0.08)',
            borderRadius: 6,
            fontSize: 11,
          }}
          formatter={(value, name) => [
            formatYen(typeof value === 'number' ? value : Number(value) || 0),
            name === 'income' ? '収入' : '支出',
          ]}
          labelFormatter={(label) => label}
        />
        <Bar dataKey="income" radius={[2, 2, 0, 0]} isAnimationActive={false}>
          {chartData.map((entry) => (
            <Cell
              key={entry.yearMonth}
              fill={entry.yearMonth === selectedMonth ? ACCENT : ACCENT_DIM}
            />
          ))}
        </Bar>
        <Bar dataKey="expense" radius={[2, 2, 0, 0]} isAnimationActive={false}>
          {chartData.map((entry) => (
            <Cell
              key={entry.yearMonth}
              fill={entry.yearMonth === selectedMonth ? EXPENSE : EXPENSE_DIM}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
