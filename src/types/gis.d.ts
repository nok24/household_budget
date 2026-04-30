// Google Identity Services (https://accounts.google.com/gsi/client) の型エクスポート。
// `window.google` 自体の global 宣言は google-api.d.ts に集約している。

export interface TokenClientConfig {
  client_id: string;
  scope: string;
  callback: ((response: TokenResponse) => void) | '';
  error_callback?: (error: TokenError) => void;
  prompt?: '' | 'none' | 'consent' | 'select_account';
  hint?: string;
}

export interface TokenClient {
  callback: ((response: TokenResponse) => void) | '';
  requestAccessToken(overrides?: {
    prompt?: '' | 'none' | 'consent' | 'select_account';
    hint?: string;
  }): void;
}

export interface TokenResponse {
  access_token: string;
  expires_in: number; // seconds
  scope: string;
  token_type: 'Bearer';
  error?: string;
  error_description?: string;
  hd?: string;
}

export interface TokenError {
  type: 'popup_closed' | 'popup_failed_to_open' | 'unknown';
  message?: string;
}

export interface GoogleAccountsOAuth2 {
  initTokenClient(config: TokenClientConfig): TokenClient;
  hasGrantedAllScopes(token: TokenResponse, ...scopes: string[]): boolean;
  revoke(accessToken: string, done?: () => void): void;
}
