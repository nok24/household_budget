import { Hono } from 'hono';
import type { AppBindings } from '../types';
import { requireAuth } from '../lib/authMiddleware';
import { requireAdmin } from '../lib/adminMiddleware';
import { getDb } from '../lib/db';
import {
  clearDriveOAuthStateCookie,
  driveOAuthStateCookieName,
  parseCookieHeader,
  serializeDriveOAuthStateCookie,
} from '../lib/cookie';
import {
  buildAuthUrl,
  exchangeCodeForTokens,
  generateOAuthState,
  revokeRefreshToken,
} from '../lib/driveOAuth';
import { SECRET_KEYS, deleteSecret, getSecret, hasSecret, putSecret } from '../lib/secrets';
import { SETTING_KEYS, getAllSettings, getSetting, putSettings } from '../lib/appSettings';
import {
  DriveApiError,
  DriveNotConnectedError,
  downloadFileBytes,
  findFileByNameInFolder,
  listFolderChildren,
} from '../lib/driveClient';
import { hasBudgetData, validateBudgetConfig, writeBudgetConfig } from '../lib/budgetConfig';
import {
  hasOverridesData,
  migrateDriveOverrides,
  validateDriveOverridesFile,
} from '../lib/overridesConfig';

export const adminRouter = new Hono<AppBindings>();

// requireAuth → requireAdmin の二段適用。以下の全ハンドラに効く。
adminRouter.use('*', requireAuth, requireAdmin);

// ─────────────────────────────────────────────────────────────
// Drive 接続
// ─────────────────────────────────────────────────────────────

/**
 * `/api/admin/drive/callback` の絶対 URL を組み立てる。
 * Google Cloud Console の Authorized redirect URIs に登録した URL と完全一致する必要がある。
 *
 * env.OAUTH_REDIRECT_URI が設定されていればそれを優先 (dev で vite proxy 越しに 5173 を使うとき)。
 * 未設定なら Worker のリクエスト URL から自動算出する (本番)。
 */
function buildRedirectUri(c: { env: AppBindings['Bindings']; req: { url: string } }): string {
  if (c.env.OAUTH_REDIRECT_URI) return c.env.OAUTH_REDIRECT_URI;
  const u = new URL(c.req.url);
  return `${u.protocol}//${u.host}/api/admin/drive/callback`;
}

/**
 * 接続フロー開始。state を発行 → cookie に保存 → Google 認可 URL を返却。
 * フロントは受け取った URL に `window.location.href` で遷移する。
 */
adminRouter.post('/drive/connect', async (c) => {
  const state = generateOAuthState();
  const redirectUri = buildRedirectUri(c);
  const authUrl = buildAuthUrl({
    clientId: c.env.GOOGLE_CLIENT_ID,
    redirectUri,
    state,
    loginHint: c.var.user.email,
  });
  c.header('Set-Cookie', serializeDriveOAuthStateCookie(c.env, state));
  return c.json({ authUrl });
});

/**
 * Google からのリダイレクト先。
 * - state cookie と query.state を一致確認 (CSRF 対策)
 * - code → tokens 交換
 * - refresh_token を encrypted_secrets に暗号化保存
 * - 成功/失敗に応じて `/settings?drive=...` にリダイレクト
 *
 * GET メソッドなので CSRF middleware は素通り。state cookie が信頼境界。
 */
adminRouter.get('/drive/callback', async (c) => {
  const url = new URL(c.req.url);
  const code = url.searchParams.get('code');
  const stateParam = url.searchParams.get('state');
  const errorParam = url.searchParams.get('error');

  // ユーザが同意画面で「キャンセル」した場合
  if (errorParam) {
    c.header('Set-Cookie', clearDriveOAuthStateCookie(c.env));
    return c.redirect(`/settings?drive_error=${encodeURIComponent(errorParam)}`);
  }

  const cookies = parseCookieHeader(c.req.header('cookie') ?? null);
  const stateCookie = cookies.get(driveOAuthStateCookieName(c.env));

  if (!code || !stateParam || !stateCookie || stateCookie !== stateParam) {
    c.header('Set-Cookie', clearDriveOAuthStateCookie(c.env));
    return c.redirect('/settings?drive_error=invalid_state');
  }

  try {
    const tokens = await exchangeCodeForTokens({
      clientId: c.env.GOOGLE_CLIENT_ID,
      clientSecret: c.env.GOOGLE_CLIENT_SECRET,
      code,
      redirectUri: buildRedirectUri(c),
    });
    if (!tokens.refresh_token) {
      // prompt=consent + access_type=offline 指定でも、Google は「同じユーザが過去に同意済み」だと
      // refresh_token を再発行しない場合がある。そのときは Google アカウント側で旧アクセスを取り消してもらう必要あり。
      c.header('Set-Cookie', clearDriveOAuthStateCookie(c.env));
      return c.redirect('/settings?drive_error=no_refresh_token');
    }
    const db = getDb(c.env);
    await putSecret(db, c.env, SECRET_KEYS.DRIVE_REFRESH_TOKEN, tokens.refresh_token);
  } catch (e) {
    console.error('[admin/drive/callback] exchange failed', e);
    c.header('Set-Cookie', clearDriveOAuthStateCookie(c.env));
    return c.redirect('/settings?drive_error=exchange_failed');
  }

  c.header('Set-Cookie', clearDriveOAuthStateCookie(c.env));
  return c.redirect('/settings?drive=connected');
});

/**
 * Drive 接続を解除。refresh_token を Google 側でも revoke した上で D1 から削除する。
 */
adminRouter.post('/drive/disconnect', async (c) => {
  const db = getDb(c.env);
  const existing = await getSecret(db, c.env, SECRET_KEYS.DRIVE_REFRESH_TOKEN);
  if (existing) {
    try {
      await revokeRefreshToken(existing);
    } catch (e) {
      // best-effort: revoke 失敗 (既に失効など) でも DB からは消す
      console.warn('[admin/drive/disconnect] revoke failed', e);
    }
    await deleteSecret(db, SECRET_KEYS.DRIVE_REFRESH_TOKEN);
  }
  return c.json({ ok: true });
});

/**
 * 接続状態の照会。フロント Admin パネルが定期的に叩く想定。
 */
adminRouter.get('/drive/status', async (c) => {
  const db = getDb(c.env);
  const connected = await hasSecret(db, SECRET_KEYS.DRIVE_REFRESH_TOKEN);
  return c.json({ connected });
});

/**
 * 指定フォルダ直下のサブフォルダ一覧を返す。
 * - parentId 未指定なら 'root' (My Drive のルート)
 * - DriveFolderSelector が一階層ずつ呼び出して使う想定
 */
adminRouter.get('/drive/folders', async (c) => {
  const parentId = c.req.query('parentId') || 'root';
  const db = getDb(c.env);
  try {
    const folders = await listFolderChildren(db, c.env, parentId);
    return c.json({ folders });
  } catch (e) {
    if (e instanceof DriveNotConnectedError) {
      return c.json({ error: 'drive_not_connected' }, 409);
    }
    if (e instanceof DriveApiError) {
      console.error('[admin/drive/folders] drive api error', e.status, e.body);
      return c.json({ error: 'drive_api_error', status: e.status }, 502);
    }
    throw e;
  }
});

// ─────────────────────────────────────────────────────────────
// app_settings (フォルダ ID 等)
// ─────────────────────────────────────────────────────────────

/** 受け付けるキーのホワイトリスト (admin が任意キーを書き込めないよう絞る) */
const WRITABLE_SETTING_KEYS: readonly string[] = [
  SETTING_KEYS.BUDGET_FOLDER_ID,
  SETTING_KEYS.BUDGET_FOLDER_NAME,
  SETTING_KEYS.ASSET_FOLDER_ID,
  SETTING_KEYS.ASSET_FOLDER_NAME,
];

adminRouter.get('/settings', async (c) => {
  const db = getDb(c.env);
  const all = await getAllSettings(db);
  return c.json({ settings: all });
});

// ─────────────────────────────────────────────────────────────
// budget.json (旧 frontend Drive Picker 経路) → D1 への移行
// ─────────────────────────────────────────────────────────────

interface MigrateBudgetBody {
  /** dryRun=true: 何件読み込むかのプレビューだけ返して D1 を変更しない */
  dryRun?: boolean;
  /** force=true: D1 に既にデータがあっても上書きする */
  force?: boolean;
}

adminRouter.post('/migrate/budget', async (c) => {
  const body = ((await c.req.json().catch(() => ({}))) ?? {}) as MigrateBudgetBody;
  const dryRun = body.dryRun === true;
  const force = body.force === true;

  const db = getDb(c.env);
  const folderId = await getSetting(db, SETTING_KEYS.BUDGET_FOLDER_ID);
  if (!folderId) {
    return c.json({ error: 'budget_folder_not_set' }, 400);
  }

  let fileMeta;
  try {
    fileMeta = await findFileByNameInFolder(db, c.env, folderId, 'budget.json');
  } catch (e) {
    if (e instanceof DriveNotConnectedError) {
      return c.json({ error: 'drive_not_connected' }, 409);
    }
    if (e instanceof DriveApiError) {
      return c.json({ error: 'drive_api_error', status: e.status }, 502);
    }
    throw e;
  }
  if (!fileMeta) {
    return c.json({ error: 'budget_json_not_found' }, 404);
  }

  let parsed;
  try {
    const buf = await downloadFileBytes(db, c.env, fileMeta.id);
    const text = new TextDecoder().decode(buf);
    const json = JSON.parse(text);
    parsed = validateBudgetConfig(json);
  } catch (e) {
    return c.json(
      { error: 'parse_failed', detail: e instanceof Error ? e.message : 'unknown' },
      422,
    );
  }

  const summary = {
    members: parsed.members.length,
    categoryOrder: parsed.categoryOrder.length,
    annualBudgets: Object.keys(parsed.budgets.annual).length,
    accountAnchors: parsed.accountAnchors.length,
    sourceFile: { id: fileMeta.id, name: fileMeta.name, modifiedTime: fileMeta.modifiedTime },
  };

  if (dryRun) {
    const alreadyHasData = await hasBudgetData(db);
    return c.json({ ok: true, dryRun: true, summary, alreadyHasData });
  }

  if (!force) {
    const alreadyHasData = await hasBudgetData(db);
    if (alreadyHasData) {
      return c.json({ error: 'already_migrated', summary }, 409);
    }
  }

  await writeBudgetConfig(db, parsed);
  return c.json({ ok: true, dryRun: false, summary });
});

// ─────────────────────────────────────────────────────────────
// overrides.json (旧 frontend Drive Picker 経路) → D1 への移行
// ─────────────────────────────────────────────────────────────

interface MigrateOverridesBody {
  /** dryRun=true: 何件読み込むかのプレビューだけ返して D1 を変更しない */
  dryRun?: boolean;
  /** force=true: D1 に既にデータがあっても上書きする */
  force?: boolean;
}

adminRouter.post('/migrate/overrides', async (c) => {
  const body = ((await c.req.json().catch(() => ({}))) ?? {}) as MigrateOverridesBody;
  const dryRun = body.dryRun === true;
  const force = body.force === true;

  const db = getDb(c.env);
  const folderId = await getSetting(db, SETTING_KEYS.BUDGET_FOLDER_ID);
  if (!folderId) {
    return c.json({ error: 'budget_folder_not_set' }, 400);
  }

  let fileMeta;
  try {
    fileMeta = await findFileByNameInFolder(db, c.env, folderId, 'overrides.json');
  } catch (e) {
    if (e instanceof DriveNotConnectedError) {
      return c.json({ error: 'drive_not_connected' }, 409);
    }
    if (e instanceof DriveApiError) {
      return c.json({ error: 'drive_api_error', status: e.status }, 502);
    }
    throw e;
  }

  // overrides.json が無い = 移行不要として ok を返す (404 ではなく)。
  if (!fileMeta) {
    const alreadyHasData = await hasOverridesData(db);
    return c.json({
      ok: true,
      dryRun,
      summary: { total: 0, migrated: 0, skipped: 0, ambiguous: 0, sourceFile: null },
      alreadyHasData,
    });
  }

  let parsed;
  try {
    const buf = await downloadFileBytes(db, c.env, fileMeta.id);
    const text = new TextDecoder().decode(buf);
    const json = JSON.parse(text);
    parsed = validateDriveOverridesFile(json);
  } catch (e) {
    return c.json(
      { error: 'parse_failed', detail: e instanceof Error ? e.message : 'unknown' },
      422,
    );
  }

  const sourceFile = { id: fileMeta.id, name: fileMeta.name, modifiedTime: fileMeta.modifiedTime };

  if (dryRun) {
    const alreadyHasData = await hasOverridesData(db);
    return c.json({
      ok: true,
      dryRun: true,
      summary: {
        total: Object.keys(parsed.byTxId).length,
        migrated: 0,
        skipped: 0,
        ambiguous: 0,
        sourceFile,
      },
      alreadyHasData,
    });
  }

  if (!force) {
    const alreadyHasData = await hasOverridesData(db);
    if (alreadyHasData) {
      return c.json(
        {
          error: 'already_migrated',
          summary: {
            total: Object.keys(parsed.byTxId).length,
            migrated: 0,
            skipped: 0,
            ambiguous: 0,
            sourceFile,
          },
        },
        409,
      );
    }
  }

  const counts = await migrateDriveOverrides(db, parsed, c.var.user.id);
  return c.json({
    ok: true,
    dryRun: false,
    summary: { ...counts, sourceFile },
  });
});

adminRouter.put('/settings', async (c) => {
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object') {
    return c.json({ error: 'invalid_body' }, 400);
  }
  const entries: Record<string, string> = {};
  for (const [k, v] of Object.entries(body)) {
    if (!WRITABLE_SETTING_KEYS.includes(k)) {
      return c.json({ error: 'unknown_key', key: k }, 400);
    }
    if (typeof v !== 'string') {
      return c.json({ error: 'value_must_be_string', key: k }, 400);
    }
    entries[k] = v;
  }
  const db = getDb(c.env);
  await putSettings(db, entries);
  const all = await getAllSettings(db);
  return c.json({ ok: true, settings: all });
});
