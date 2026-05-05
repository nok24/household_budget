// Google Identity Services (https://accounts.google.com/gsi/client) の型エクスポート。
// `window.google` の global 宣言もここに集約する (旧 google-api.d.ts は PR-G で撤去済)。

declare global {
  interface Window {
    google?: {
      accounts: {
        id: GoogleAccountsId;
      };
    };
  }
}

// ─────────────────────────────────────────────────────────────
// Google Identity Services - Sign-In (ID Token) API
// https://developers.google.com/identity/gsi/web/reference/js-reference
//
// Drive アクセス用 OAuth2 token client (`google.accounts.oauth2`) の型定義は
// PR-G で削除済み。Drive アクセスは Worker 側 (admin が refresh_token を D1 に
// 暗号化保存) が代理する。
// ─────────────────────────────────────────────────────────────

export interface IdConfiguration {
  client_id: string;
  callback: (response: CredentialResponse) => void;
  auto_select?: boolean;
  login_uri?: string;
  /** ITP (Safari) 対応のため、ボタン表示時に推奨 */
  use_fedcm_for_prompt?: boolean;
  /** Sign-In ボタンや One Tap で「このアカウントでログインする」と暗示するメール */
  hint?: string;
  /** nonce を ID Token に埋めたい場合 */
  nonce?: string;
  cancel_on_tap_outside?: boolean;
}

export interface CredentialResponse {
  /** JWT 形式の ID Token */
  credential: string;
  /** "btn" | "auto" など、トリガ種別 */
  select_by?: string;
}

export interface PromptMomentNotification {
  isDisplayMoment(): boolean;
  isDisplayed(): boolean;
  isNotDisplayed(): boolean;
  getNotDisplayedReason():
    | 'browser_not_supported'
    | 'invalid_client'
    | 'missing_client_id'
    | 'opt_out_or_no_session'
    | 'secure_http_required'
    | 'suppressed_by_user'
    | 'unregistered_origin'
    | 'unknown_reason';
  isSkippedMoment(): boolean;
  getSkippedReason(): 'auto_cancel' | 'user_cancel' | 'tap_outside' | 'issuing_failed';
  isDismissedMoment(): boolean;
  getDismissedReason(): 'credential_returned' | 'cancel_called' | 'flow_restarted';
  getMomentType(): 'display' | 'skipped' | 'dismissed';
}

export interface GsiButtonConfiguration {
  type?: 'standard' | 'icon';
  theme?: 'outline' | 'filled_blue' | 'filled_black';
  size?: 'large' | 'medium' | 'small';
  text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
  shape?: 'rectangular' | 'pill' | 'circle' | 'square';
  logo_alignment?: 'left' | 'center';
  width?: string | number;
  locale?: string;
}

export interface GoogleAccountsId {
  initialize(config: IdConfiguration): void;
  prompt(momentListener?: (notification: PromptMomentNotification) => void): void;
  renderButton(parent: HTMLElement, options: GsiButtonConfiguration): void;
  disableAutoSelect(): void;
  cancel(): void;
}
