// 取引一覧画面 — バリエーションA のスタイル準拠
const TX_ACCENT = '#3F5A4A';
const TX_BG = '#F7F5F1';
const TX_INK = '#1A1A1A';
const TX_INK_2 = 'rgba(26,26,26,0.6)';
const TX_INK_3 = 'rgba(26,26,26,0.4)';
const TX_LINE = 'rgba(26,26,26,0.08)';

function TransactionsScreen() {
  const D = window.HOUSEHOLD_DATA;
  const all = D.transactions;
  return (
    <div style={{
      width: 1280, height: 880, background: TX_BG, color: TX_INK,
      fontFamily: '"Noto Sans JP", -apple-system, sans-serif',
      display: 'grid', gridTemplateColumns: '200px 1fr',
      fontFeatureSettings: '"palt" 1',
    }}>
      <aside style={{ background: '#FBF9F5', borderRight: `1px solid ${TX_LINE}`, padding: '24px 16px' }}>
        <div style={{ padding: '0 12px 24px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 8, height: 8, background: TX_ACCENT, borderRadius: 1 }} />
          <div style={{ fontSize: 13, fontWeight: 600 }}>家計簿</div>
        </div>
        {[['ダッシュボード', false], ['取引一覧', true], ['カテゴリ', false], ['予算', false], ['レポート', false]].map(([t, a]) => (
          <div key={t} style={{
            padding: '8px 12px', borderRadius: 6, fontSize: 13, marginBottom: 4,
            color: a ? TX_INK : TX_INK_2, background: a ? '#fff' : 'transparent',
            display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
            fontWeight: a ? 500 : 400,
            boxShadow: a ? '0 1px 2px rgba(0,0,0,0.04)' : 'none',
          }}>
            <span style={{ width: 14, height: 1, background: a ? TX_ACCENT : TX_INK_3 }} />
            {t}
          </div>
        ))}
      </aside>

      <main style={{ padding: '28px 32px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 11, color: TX_INK_3, letterSpacing: '0.1em', marginBottom: 4 }}>TRANSACTIONS</div>
            <h1 style={{ fontSize: 22, fontWeight: 500, margin: 0 }}>取引一覧 <span style={{ fontSize: 13, color: TX_INK_3, fontWeight: 400, marginLeft: 8 }}>2026年4月 · {all.length}件</span></h1>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={{ padding: '7px 14px', fontSize: 12, background: '#fff', border: `1px solid ${TX_LINE}`, borderRadius: 6, color: TX_INK_2, cursor: 'pointer', fontFamily: 'inherit' }}>絞り込み</button>
            <button style={{ padding: '7px 14px', fontSize: 12, background: TX_ACCENT, border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>＋ 取引追加</button>
          </div>
        </header>

        {/* Filters */}
        <div style={{
          display: 'flex', gap: 8, marginBottom: 16, padding: '12px 14px',
          background: '#fff', border: `1px solid ${TX_LINE}`, borderRadius: 8,
          alignItems: 'center', fontSize: 12,
        }}>
          <input type="text" placeholder="検索..." style={{
            flex: 1, padding: '6px 10px', fontSize: 12,
            border: `1px solid ${TX_LINE}`, borderRadius: 4, outline: 'none',
            fontFamily: 'inherit', background: TX_BG,
          }} />
          {['すべて', '支出', '収入'].map((t, i) => (
            <span key={t} style={{
              padding: '6px 12px', fontSize: 11, borderRadius: 4, cursor: 'pointer',
              background: i === 0 ? TX_ACCENT : 'transparent',
              color: i === 0 ? '#fff' : TX_INK_2,
              border: i === 0 ? 'none' : `1px solid ${TX_LINE}`,
            }}>{t}</span>
          ))}
          <div style={{ width: 1, height: 18, background: TX_LINE, margin: '0 4px' }} />
          {['夫', '妻', '共通'].map((t) => (
            <span key={t} style={{
              padding: '6px 10px', fontSize: 11, borderRadius: 4, cursor: 'pointer',
              border: `1px solid ${TX_LINE}`, color: TX_INK_2,
            }}>{t}</span>
          ))}
        </div>

        {/* Table */}
        <div style={{ background: '#fff', border: `1px solid ${TX_LINE}`, borderRadius: 8, flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '90px 1fr 130px 120px 80px 130px',
            gap: 12, padding: '12px 18px',
            fontSize: 10, color: TX_INK_3, letterSpacing: '0.08em', fontWeight: 500,
            borderBottom: `1px solid ${TX_LINE}`, background: '#FBF9F5',
          }}>
            <span>日付</span><span>項目</span><span>カテゴリ</span><span>口座</span><span>担当</span><span style={{ textAlign: 'right' }}>金額</span>
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {all.map((t, i) => {
              const cat = D.categories.find(c => c.id === t.cat);
              const isInc = t.amount > 0;
              return (
                <div key={i} style={{
                  display: 'grid', gridTemplateColumns: '90px 1fr 130px 120px 80px 130px',
                  gap: 12, padding: '11px 18px', alignItems: 'center', fontSize: 12,
                  borderBottom: i < all.length - 1 ? `1px solid ${TX_LINE}` : 'none',
                }}>
                  <span style={{ color: TX_INK_2, fontVariantNumeric: 'tabular-nums' }}>4/{parseInt(t.date.slice(3,5))} <span style={{ color: TX_INK_3, marginLeft: 2 }}>{t.day}</span></span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
                  <span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: TX_INK_2 }}>
                      <span style={{ width: 6, height: 6, borderRadius: 1, background: cat ? cat.color : '#5B8B5E' }} />
                      {isInc ? '収入' : (cat ? cat.name : '—')}
                    </span>
                  </span>
                  <span style={{ color: TX_INK_2, fontSize: 11 }}>{t.account}</span>
                  <span style={{ fontSize: 10, color: TX_INK_2, padding: '2px 6px', background: 'rgba(0,0,0,0.04)', borderRadius: 3, justifySelf: 'start' }}>{t.member}</span>
                  <span style={{
                    fontVariantNumeric: 'tabular-nums', fontWeight: 500, textAlign: 'right',
                    color: isInc ? TX_ACCENT : TX_INK,
                  }}>
                    {isInc ? '+' : '−'}¥{Math.abs(t.amount).toLocaleString()}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}

window.TransactionsScreen = TransactionsScreen;
