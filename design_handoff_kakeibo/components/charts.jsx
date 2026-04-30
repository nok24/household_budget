// 共通の数値フォーマッタ・チャートコンポーネント
// バリエーション間で再利用される

const yen = (n, opts = {}) => {
  const { sign = false, abbreviate = false } = opts;
  if (abbreviate && Math.abs(n) >= 10000) {
    const man = n / 10000;
    return (sign && n > 0 ? '+' : '') + '¥' + (Math.abs(man) >= 100 ? Math.round(man) : man.toFixed(1)) + '万';
  }
  return (sign && n > 0 ? '+' : '') + '¥' + n.toLocaleString('ja-JP');
};

const pct = (a, b) => Math.round((a / b) * 100);

// ───────────────────────────────────────────────
// Donut chart (SVG) — カテゴリ別配分
// ───────────────────────────────────────────────
function Donut({ data, size = 180, thickness = 22, gap = 1.2, innerLabel, innerSub, accent }) {
  const total = data.reduce((s, d) => s + d.amount, 0);
  const r = size / 2 - thickness / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block' }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(0,0,0,0.04)" strokeWidth={thickness} />
      {data.map((d, i) => {
        const len = (d.amount / total) * c;
        const dash = `${Math.max(len - gap, 0.001)} ${c}`;
        const el = (
          <circle key={i}
            cx={size/2} cy={size/2} r={r}
            fill="none"
            stroke={d.color || accent || '#1a1a1a'}
            strokeWidth={thickness}
            strokeDasharray={dash}
            strokeDashoffset={-offset}
            transform={`rotate(-90 ${size/2} ${size/2})`}
          />
        );
        offset += len;
        return el;
      })}
      {innerLabel && (
        <g>
          <text x={size/2} y={size/2 - 2} textAnchor="middle"
            style={{ font: '500 18px "Noto Sans JP", sans-serif', fill: '#1a1a1a', fontVariantNumeric: 'tabular-nums' }}>
            {innerLabel}
          </text>
          {innerSub && (
            <text x={size/2} y={size/2 + 16} textAnchor="middle"
              style={{ font: '400 10px "Noto Sans JP", sans-serif', fill: 'rgba(0,0,0,0.5)', letterSpacing: '0.05em' }}>
              {innerSub}
            </text>
          )}
        </g>
      )}
    </svg>
  );
}

// ───────────────────────────────────────────────
// Bar chart — 月次収支推移
// ───────────────────────────────────────────────
function TrendBars({ data, height = 140, accent = '#1a1a1a', mono = false, highlightLast = true }) {
  const max = Math.max(...data.map(d => Math.max(d.income, d.expense)));
  const W = 100 / data.length;
  return (
    <div style={{ width: '100%', height, position: 'relative' }}>
      <svg width="100%" height="100%" preserveAspectRatio="none" viewBox={`0 0 100 ${height}`}>
        {[0.25, 0.5, 0.75].map(t => (
          <line key={t} x1="0" x2="100" y1={height * t} y2={height * t}
            stroke="rgba(0,0,0,0.05)" strokeWidth="0.5" />
        ))}
        {data.map((d, i) => {
          const x = i * W;
          const incH = (d.income / max) * (height - 16);
          const expH = (d.expense / max) * (height - 16);
          const last = i === data.length - 1 && highlightLast;
          return (
            <g key={i}>
              <rect x={x + W * 0.18} y={height - 14 - incH}
                width={W * 0.30} height={incH}
                fill={mono ? 'rgba(0,0,0,0.85)' : accent}
                opacity={last ? 1 : 0.85} />
              <rect x={x + W * 0.52} y={height - 14 - expH}
                width={W * 0.30} height={expH}
                fill={mono ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0.18)'} />
            </g>
          );
        })}
      </svg>
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, display: 'flex' }}>
        {data.map((d, i) => (
          <div key={i} style={{
            flex: 1, textAlign: 'center',
            font: '400 9px "Noto Sans JP", sans-serif',
            color: i === data.length - 1 ? '#1a1a1a' : 'rgba(0,0,0,0.45)',
            fontWeight: i === data.length - 1 ? 600 : 400,
          }}>{d.m}</div>
        ))}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────
// Sparkline
// ───────────────────────────────────────────────
function Sparkline({ data, width = 120, height = 32, accent = '#1a1a1a', area = true }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return [x, y];
  });
  const path = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
  const areaPath = path + ` L${width},${height} L0,${height} Z`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
      {area && <path d={areaPath} fill={accent} opacity="0.08" />}
      <path d={path} fill="none" stroke={accent} strokeWidth="1.5" />
      <circle cx={pts[pts.length-1][0]} cy={pts[pts.length-1][1]} r="2" fill={accent} />
    </svg>
  );
}

// ───────────────────────────────────────────────
// Horizontal bar (for category breakdown)
// ───────────────────────────────────────────────
function HBar({ value, max, color = '#1a1a1a', height = 4, bg = 'rgba(0,0,0,0.06)' }) {
  return (
    <div style={{ width: '100%', height, background: bg, borderRadius: height/2, overflow: 'hidden' }}>
      <div style={{
        width: Math.min(100, (value/max)*100) + '%',
        height: '100%',
        background: color,
        borderRadius: height/2,
      }} />
    </div>
  );
}

// ───────────────────────────────────────────────
// Calendar heatmap — 日々の支出
// ───────────────────────────────────────────────
function CalHeat({ accent = '#1a1a1a' }) {
  // 4月のカレンダー — シードした擬似データ
  const days = Array.from({length: 30}, (_, i) => {
    const seed = (i * 37 + 13) % 100;
    return seed < 15 ? 0 : (seed % 5 === 0 ? 4 : seed % 4 === 0 ? 3 : seed % 3 === 0 ? 2 : 1);
  });
  const start = 2; // April 1, 2026 is Wednesday → offset
  const cells = [];
  for (let i = 0; i < start; i++) cells.push(null);
  days.forEach(d => cells.push(d));

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 6 }}>
        {['日','月','火','水','木','金','土'].map((d, i) => (
          <div key={i} style={{
            font: '400 9px "Noto Sans JP", sans-serif',
            color: i === 0 ? '#c44' : 'rgba(0,0,0,0.4)',
            textAlign: 'center', letterSpacing: '0.1em',
          }}>{d}</div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {cells.map((c, i) => {
          if (c === null) return <div key={i} />;
          const opacity = c === 0 ? 0.04 : 0.12 + c * 0.18;
          return (
            <div key={i} style={{
              aspectRatio: '1',
              background: c === 0 ? 'rgba(0,0,0,0.04)' : accent,
              opacity: c === 0 ? 1 : opacity * 4,
              borderRadius: 3,
            }} />
          );
        })}
      </div>
    </div>
  );
}

Object.assign(window, { yen, pct, Donut, TrendBars, Sparkline, HBar, CalHeat });
