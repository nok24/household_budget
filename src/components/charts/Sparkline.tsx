interface Props {
  data: number[];
  width?: number;
  height?: number;
  accent?: string;
  area?: boolean;
}

export default function Sparkline({
  data,
  width = 120,
  height = 32,
  accent = '#3F5A4A',
  area = true,
}: Props) {
  if (data.length < 2) {
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <line
          x1={0}
          x2={width}
          y1={height / 2}
          y2={height / 2}
          stroke={accent}
          strokeOpacity={0.2}
          strokeWidth={1}
        />
      </svg>
    );
  }
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return [x, y] as [number, number];
  });
  const path = pts
    .map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ',' + p[1].toFixed(1))
    .join(' ');
  const areaPath = `${path} L${width},${height} L0,${height} Z`;
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: 'block' }}
    >
      {area && <path d={areaPath} fill={accent} opacity={0.08} />}
      <path d={path} fill="none" stroke={accent} strokeWidth="1.5" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2" fill={accent} />
    </svg>
  );
}
