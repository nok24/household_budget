// バリエーションA — クラシック・コンパクト
// 王道の3カラムダッシュボード。情報密度が高く、一目で全体像。
// アクセント: 深緑（節約・蓄え・落ち着き）

const A_ACCENT = '#3F5A4A';
const A_BG = '#F7F5F1';
const A_INK = '#1A1A1A';
const A_INK_2 = 'rgba(26,26,26,0.6)';
const A_INK_3 = 'rgba(26,26,26,0.4)';
const A_LINE = 'rgba(26,26,26,0.08)';

const aStyles = {
  shell: {
    width: 1280, height: 880, background: A_BG, color: A_INK,
    fontFamily: '"Noto Sans JP", -apple-system, sans-serif',
    display: 'grid', gridTemplateColumns: '200px 1fr',
    fontFeatureSettings: '"palt" 1',
  },
  side: {
    background: '#FBF9F5', borderRight: `1px solid ${A_LINE}`,
    padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: 4,
  },
  navItem: (active) => ({
    padding: '8px 12px', borderRadius: 6, fontSize: 13,
    color: active ? A_INK : A_INK_2, background: active ? '#fff' : 'transparent',
    boxShadow: active ? '0 1px 2px rgba(0,0,0,0.04)' : 'none',
    display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
    fontWeight: active ? 500 : 400,
  }),
  main: { padding: '28px 32px', overflow: 'hidden' },
  card: { background: '#fff', borderRadius: 8, padding: 20, border: `1px solid ${A_LINE}` },
  cardTitle: { fontSize: 11, color: A_INK_2, letterSpacing: '0.08em', marginBottom: 12, fontWeight: 500 },
};

function VariantADashboard() {
  const D = window.HOUSEHOLD_DATA;
  const expDelta = D.month.expense - D.month.prevExpense;
  const expDeltaPct = ((expDelta / D.month.prevExpense) * 100).toFixed(1);

  return (
    <div style={aStyles.shell}>
      {/* Sidebar */}
      <aside style={aStyles.side}>
        <div style={{ padding: '0 12px 24px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 8, height: 8, background: A_ACCENT, borderRadius: 1 }} />
          <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.04em' }}>家計簿</div>
        </div>
        {[
          ['ダッシュボード', true],
          ['取引一覧', false],
          ['カテゴリ', false],
          ['予算', false],
          ['レポート', false],
        ].map(([t, a]) => (
          <div key={t} style={aStyles.navItem(a)}>
            <span style={{ width: 14, height: 1, background: a ? A_ACCENT : A_INK_3 }} />
            {t}
          </div>
        ))}

        <div style={{ marginTop: 'auto', padding: '12px', borderTop: `1px solid ${A_LINE}`, paddingTop: 16 }}>
          <div style={{ fontSize: 10, color: A_INK_3, letterSpacing: '0.08em', marginBottom: 8 }}>世帯メンバー</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
              <div style={{ width: 22, height: 22, borderRadius: '50%', background: A_ACCENT, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 10 }}>K</div>
              健太
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
              <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#B8A78A', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 10 }}>M</div>
              美咲
            </div>
          </div>
          <div style={{ fontSize: 10, color: A_INK_3, marginTop: 12 }}>最終更新 2026/04/24 23:48</div>
        </div>
      </aside>

      {/* Main */}
      <main style={aStyles.main}>
        {/* Top bar */}
        <header style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 11, color: A_INK_3, letterSpacing: '0.1em', marginBottom: 4 }}>DASHBOARD</div>
            <h1 style={{ fontSize: 22, fontWeight: 500, margin: 0, letterSpacing: '0.01em' }}>{D.month.label}</h1>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button style={{
              padding: '7px 14px', fontSize: 12, background: '#fff',
              border: `1px solid ${A_LINE}`, borderRadius: 6, color: A_INK_2, cursor: 'pointer',
              fontFamily: 'inherit',
            }}>← 3月</button>
            <button style={{
              padding: '7px 14px', fontSize: 12, background: '#fff',
              border: `1px solid ${A_LINE}`, borderRadius: 6, color: A_INK_3, cursor: 'pointer',
              fontFamily: 'inherit',
            }}>5月 →</button>
            <div style={{ width: 1, height: 20, background: A_LINE, margin: '0 4px' }} />
            <button style={{
              padding: '7px 14px', fontSize: 12, background: A_ACCENT,
              border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer',
              fontFamily: 'inherit',
            }}>CSV取込</button>
          </div>
        </header>

        {/* KPI row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 16 }}>
          {[
            { label: '収入', value: D.month.income, sub: '今月計', delta: null, accent: false },
            { label: '支出', value: D.month.expense, sub: `予算 ${yen(D.month.budget, {abbreviate:true})}`, delta: expDeltaPct, accent: true },
            { label: '収支', value: D.month.balance, sub: '黒字', delta: null, balance: true },
            { label: '貯蓄率', value: null, custom: '39.6%', sub: '目標 35%以上', delta: null },
          ].map((k, i) => (
            <div key={i} style={aStyles.card}>
              <div style={aStyles.cardTitle}>{k.label.toUpperCase()}</div>
              <div style={{
                fontSize: 26, fontWeight: 500, letterSpacing: '-0.01em',
                fontVariantNumeric: 'tabular-nums',
                color: k.balance ? A_ACCENT : A_INK,
                marginBottom: 4,
              }}>
                {k.custom || yen(k.value)}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: A_INK_3 }}>
                <span>{k.sub}</span>
                {k.delta !== null && k.delta !== undefined && (
                  <span style={{ color: parseFloat(k.delta) < 0 ? A_ACCENT : '#B85C3D', fontWeight: 500 }}>
                    {parseFloat(k.delta) > 0 ? '+' : ''}{k.delta}%
                  </span>
                )}
              </div>
              {/* 予算進捗 */}
              {k.label === '支出' && (
                <div style={{ marginTop: 10 }}>
                  <HBar value={D.month.expense} max={D.month.budget} color={A_ACCENT} height={3} />
                  <div style={{ fontSize: 10, color: A_INK_3, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
                    {pct(D.month.expense, D.month.budget)}% 消化 · 残 {yen(D.month.budget - D.month.expense, {abbreviate:true})}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Middle row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 16, marginBottom: 16 }}>
          {/* Trend */}
          <div style={aStyles.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
              <div style={aStyles.cardTitle}>収支推移 · 直近12ヶ月</div>
              <div style={{ display: 'flex', gap: 12, fontSize: 10, color: A_INK_3 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 8, height: 8, background: A_ACCENT, borderRadius: 1 }} />収入
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 8, height: 8, background: 'rgba(0,0,0,0.18)', borderRadius: 1 }} />支出
                </span>
              </div>
            </div>
            <TrendBars data={D.trend} accent={A_ACCENT} height={160} />
          </div>

          {/* Donut */}
          <div style={aStyles.card}>
            <div style={aStyles.cardTitle}>カテゴリ別支出</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
              <Donut
                data={D.categories.slice(0, 6)}
                size={140}
                thickness={18}
                innerLabel={yen(D.month.expense, {abbreviate:true})}
                innerSub="今月支出"
              />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {D.categories.slice(0, 6).map(c => (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                    <span style={{ width: 6, height: 6, borderRadius: 1, background: c.color }} />
                    <span style={{ flex: 1, color: A_INK_2 }}>{c.name}</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>
                      {yen(c.amount, {abbreviate:true})}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 16 }}>
          {/* Budget */}
          <div style={aStyles.card}>
            <div style={aStyles.cardTitle}>予算消化</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              {D.categories.slice(0, 6).map(c => {
                const p = pct(c.amount, c.budget);
                const over = p > 100;
                return (
                  <div key={c.id}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                      <span style={{ color: A_INK }}>{c.name}</span>
                      <span style={{ fontVariantNumeric: 'tabular-nums', color: over ? '#B85C3D' : A_INK_2 }}>
                        {yen(c.amount,{abbreviate:true})} / {yen(c.budget,{abbreviate:true})}
                      </span>
                    </div>
                    <HBar value={c.amount} max={c.budget} color={over ? '#B85C3D' : A_ACCENT} height={3} />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Recent transactions */}
          <div style={aStyles.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
              <div style={aStyles.cardTitle}>最近の取引</div>
              <span style={{ fontSize: 10, color: A_INK_3, cursor: 'pointer' }}>すべて見る →</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {D.transactions.slice(0, 7).map((t, i) => {
                const cat = D.categories.find(c => c.id === t.cat);
                const isInc = t.amount > 0;
                return (
                  <div key={i} style={{
                    display: 'grid', gridTemplateColumns: '40px 1fr auto auto',
                    gap: 10, padding: '7px 0', alignItems: 'center',
                    borderBottom: i < 6 ? `1px solid ${A_LINE}` : 'none',
                    fontSize: 11,
                  }}>
                    <span style={{ color: A_INK_3, fontVariantNumeric: 'tabular-nums' }}>{t.date}</span>
                    <span style={{ color: A_INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
                    <span style={{ fontSize: 10, color: A_INK_3, padding: '2px 6px', background: 'rgba(0,0,0,0.04)', borderRadius: 3 }}>
                      {isInc ? '収入' : (cat ? cat.name : '')}
                    </span>
                    <span style={{
                      fontVariantNumeric: 'tabular-nums', fontWeight: 500, minWidth: 80, textAlign: 'right',
                      color: isInc ? A_ACCENT : A_INK,
                    }}>
                      {isInc ? '+' : ''}{yen(t.amount).replace('-', '−')}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

window.VariantADashboard = VariantADashboard;
