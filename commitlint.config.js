export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // ヘッダ全体（プリフィックス含む）の最大長を 100 文字に拡張（既定72）。日本語本文を許容するため。
    'header-max-length': [2, 'always', 100],
    // type は Conventional Commits 標準＋ chore/build/ci 等を許可（config-conventional で網羅）
  },
};
