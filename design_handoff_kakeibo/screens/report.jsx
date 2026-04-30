// カテゴリ別レポート画面
const R_ACCENT = '#3F5A4A';
const R_BG = '#F7F5F1';
const R_INK = '#1A1A1A';
const R_INK_2 = 'rgba(26,26,26,0.6)';
const R_INK_3 = 'rgba(26,26,26,0.4)';
const R_LINE = 'rgba(26,26,26,0.08)';

function ReportScreen() {
  const D = window.HOUSEHOLD_DATA;
  const total = D.month.expense;

  // 各カテゴリのトレンド（モック）
  const catTrend = D.categories.slice(0, 6).map((c, i) => ({
    ...c,
    sparkData: Array.from({length: 12}, (_, j) => c.amount * (0.7 + 0.3 * Math.sin(j * 0.6 + i))),
  }));

  return (
    <div style={{
      width: 1280, height: 880, background: R_BG, color: R_INK,
      fontFamily: '"Noto Sans JP", -apple-system, sans-serif',
      display: 'grid', gridTemplateColumns: '200px 1fr',
      fontFeatureSettings: '"palt" 1',
    }}>
      <aside style={{ background: '#FBF9F5', borderRight: `1px solid ${R_LINE}`, padding: '24px 16px' }}>
        <div style={{ padding: '0 12px 24px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 8, height: 8, background: R_ACCENT, borderRadius: 1 }} />
          <div style={{ fontSize: 13, fontWeight: 600 }}>家計簿</div>
        </div>
        {[['ダッシュボード', false], ['取引一覧', false], ['カテゴリ', true], ['予算', false], ['レポート', false]].map(([t, a]) => (
          <div key={t} style={{
            padding: '8px 12px', borderRadius: 6, fontSize: 13, marginBottom: 4,
            color: a ? R_INK : R_INK_2, background: a ? '#fff' : 'transparent',
            display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
            fontWeight: a ? 500 : 400,
            boxShadow: a ? '0 1px 2px rgba(0,0,0,0.04)' : 'none',
          }}>
            <span style={{ width: 14, height: 1, background: a ? R_ACCENT : R_INK_3 }} />
            {t}
          </div>
        ))}
      </aside>

      <main style={{ padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: 16, overflow: 'hidden' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div>
            <div style={{ fontSize: 11, color: R_INK_3, letterSpacing: '0.1em', marginBottom: 4 }}>CATEGORIES</div>
            <h1 style={{ fontSize: 22, fontWeight: 500, margin: 0 }}>カテゴリ別レポート</h1>
          </div>
          <div style={{ display: 'flex', gap: 4, padding: 4, background: '#fff', border: `1px solid ${R_LINE}`, borderRadius: 6 }}>
            {['月次', '年次', '比較'].map((t, i) => (
              <span key={t} style={{
                padding: '5px 14px', fontSize: 12, borderRadius: 4, cursor: 'pointer',
                background: i === 0 ? R_ACCENT : 'transparent',
                color: i === 0 ? '#fff' : R_INK_2,
              }}>{t}</span>
            ))}
          </div>
        </header>

        {/* Top: large donut + summary */}
        <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 16 }}>
          <div style={{ background: '#fff', borderRadius: 8, padding: 24, border: `1px solid ${R_LINE}`, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ fontSize: 11, color: R_INK_3, letterSpacing: '0.1em', alignSelf: 'flex-start', marginBottom: 16, fontWeight: 500 }}>支出構成 · 4月</div>
            <Donut
              data={D.categories}
              size={220}
              thickness={26}
              gap={1.5}
              innerLabel={'¥' + (total/10000).toFixed(1) + '万'}
              innerSub="TOTAL"
            />
            <div style={{ marginTop: 14, fontSize: 11, color: R_INK_2, textAlign: 'center' }}>
              最大カテゴリ: <span style={{ color: R_INK, fontWeight: 500 }}>住居 (34%)</span>
            </div>
          </div>

          <div style={{ background: '#fff', borderRadius: 8, padding: 24, border: `1px solid ${R_LINE}` }}>
            <div style={{ fontSize: 11, color: R_INK_3, letterSpacing: '0.1em', marginBottom: 16, fontWeight: 500 }}>カテゴリ別 · 推移と予算</div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{
                display: 'grid', gridTemplateColumns: '24px 110px 60px 1fr 80px 80px',
                gap: 10, fontSize: 10, color: R_INK_3, letterSpacing: '0.06em', paddingBottom: 8,
                borderBottom: `1px solid ${R_LINE}`,
              }}>
                <span /><span>カテゴリ</span><span style={{textAlign:'right'}}>占有率</span><span>12ヶ月推移</span><span style={{textAlign:'right'}}>支出</span><span style={{textAlign:'right'}}>予算比</span>
              </div>
              {catTrend.map((c, i) => {
                const p = pct(c.amount, total);
                const bp = pct(c.amount, c.budget);
                return (
                  <div key={c.id} style={{
                    display: 'grid', gridTemplateColumns: '24px 110px 60px 1fr 80px 80px',
                    gap: 10, padding: '12px 0', alignItems: 'center', fontSize: 12,
                    borderBottom: i < catTrend.length - 1 ? `1px solid ${R_LINE}` : 'none',
                  }}>
                    <span style={{ width: 18, height: 18, borderRadius: 3, background: c.color, opacity: 0.85, color: '#fff', fontSize: 10, display: 'grid', placeItems: 'center' }}>{c.icon}</span>
                    <span>{c.name}</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums', textAlign: 'right', color: R_INK_2 }}>{p}%</span>
                    <Sparkline data={c.sparkData} width={180} height={28} accent={c.color} />
                    <span style={{ fontVariantNumeric: 'tabular-nums', textAlign: 'right', fontWeight: 500 }}>
                      ¥{c.amount.toLocaleString()}
                    </span>
                    <span style={{
                      fontVariantNumeric: 'tabular-nums', textAlign: 'right', fontSize: 11,
                      color: bp > 100 ? '#B85C3D' : (bp > 90 ? '#B8A03D' : R_ACCENT), fontWeight: 500,
                    }}>{bp}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Bottom: detail of one category */}
        <div style={{ background: '#fff', borderRadius: 8, padding: 24, border: `1px solid ${R_LINE}`, flex: 1, overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 11, color: R_INK_3, letterSpacing: '0.1em', fontWeight: 500 }}>CATEGORY DETAIL</div>
              <div style={{ fontSize: 18, fontWeight: 500, marginTop: 4 }}>食費 <span style={{ fontSize: 12, color: R_INK_3, marginLeft: 8, fontWeight: 400 }}>¥86,420 · 22.3%</span></div>
            </div>
            <div style={{ fontSize: 11, color: R_INK_2 }}>
              前月比 <span style={{ color: R_ACCENT, fontWeight: 500, marginLeft: 4 }}>−¥4,300 (−4.7%)</span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 32 }}>
            <div>
              <div style={{ fontSize: 10, color: R_INK_3, letterSpacing: '0.1em', marginBottom: 10 }}>店舗別 TOP</div>
              {[
                ['いなげや 高井戸店', 18420, 8],
                ['オーケー 環八', 12800, 3],
                ['まいばすけっと', 9840, 6],
                ['スシロー', 4280, 1],
                ['その他 (12件)', 41080, 12],
              ].map(([name, amt, cnt], i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 10, padding: '7px 0', fontSize: 11, alignItems: 'baseline', borderBottom: `1px solid ${R_LINE}` }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                  <span style={{ color: R_INK_3, fontSize: 10 }}>{cnt}件</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 500, minWidth: 60, textAlign: 'right' }}>¥{amt.toLocaleString()}</span>
                </div>
              ))}
            </div>

            <div>
              <div style={{ fontSize: 10, color: R_INK_3, letterSpacing: '0.1em', marginBottom: 10 }}>曜日別 平均支出</div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 120, paddingBottom: 18 }}>
                {[
                  {d:'月', v: 2400},{d:'火', v: 1800},{d:'水', v: 3200},
                  {d:'木', v: 2100},{d:'金', v: 4400},{d:'土', v: 5800},{d:'日', v: 4200},
                ].map((x, i) => (
                  <div key={i} style={{ flex: 1, position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                    <div style={{ background: R_ACCENT, opacity: 0.85, height: (x.v / 5800) * 100 + '%', borderRadius: '2px 2px 0 0' }} />
                    <div style={{ position: 'absolute', bottom: -16, left: 0, right: 0, textAlign: 'center', fontSize: 10, color: R_INK_3 }}>{x.d}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 12, fontSize: 11, color: R_INK_2 }}>
                週末に支出が集中 (土曜 ¥5,800/平均)
              </div>
            </div>

            <div>
              <div style={{ fontSize: 10, color: R_INK_3, letterSpacing: '0.1em', marginBottom: 10 }}>12ヶ月の推移</div>
              <Sparkline data={catTrend[0].sparkData} width={260} height={70} accent={R_ACCENT} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: R_INK_3, marginTop: 8 }}>
                <span>5月</span><span>4月</span>
              </div>
              <div style={{ marginTop: 12, fontSize: 11, color: R_INK_2 }}>
                平均 <span style={{ color: R_INK, fontWeight: 500 }}>¥84,200</span> · 標準偏差 ±¥8,400
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

window.ReportScreen = ReportScreen;
