import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';
import { colorForCategory } from '@/lib/categories';
import { formatYen } from '@/lib/utils';
import type { CategoryAgg } from '@/lib/aggregate';

interface Props {
  data: CategoryAgg[];
  total: number;
  size?: number;
  thickness?: number;
}

export default function CategoryDonut({ data, total, size = 160, thickness = 18 }: Props) {
  const segments = data.length > 0 ? data : [{ name: '—', amount: 1, count: 0 }];
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={segments}
            dataKey="amount"
            nameKey="name"
            cx="50%"
            cy="50%"
            outerRadius={size / 2}
            innerRadius={size / 2 - thickness}
            stroke="none"
            isAnimationActive={false}
          >
            {segments.map((s, i) => (
              <Cell
                key={i}
                fill={data.length > 0 ? colorForCategory(s.name) : 'rgba(26,26,26,0.06)'}
              />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <div className="text-[10px] tracking-wider text-ink-40">今月支出</div>
        <div className="text-base font-semibold tabular-nums">{formatYen(total)}</div>
      </div>
    </div>
  );
}
