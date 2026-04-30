// Google APIs (gapi loader, GIS, Picker) の global 宣言を集約する。
// 個別の型定義は ./gis.ts に切り出している（GIS）か、本ファイル内で完結している（gapi/picker）。

import type { GoogleAccountsOAuth2 } from './gis';

declare global {
  interface Window {
    gapi?: GapiNamespace;
    google?: GoogleNamespace;
  }
}

interface GapiNamespace {
  load(libraries: string, options: { callback: () => void; onerror?: () => void }): void;
}

interface GoogleNamespace {
  accounts: {
    oauth2: GoogleAccountsOAuth2;
  };
  picker?: PickerNamespace;
}

interface PickerNamespace {
  PickerBuilder: new () => PickerBuilder;
  DocsView: new (viewId?: string) => DocsView;
  ViewId: { DOCS: string; FOLDERS: string };
  Action: { PICKED: 'picked'; CANCEL: 'cancel'; LOADED: 'loaded' };
  Feature: { NAV_HIDDEN: string; MULTISELECT_ENABLED: string };
  Response: { ACTION: 'action'; DOCUMENTS: 'docs' };
  Document: { ID: 'id'; NAME: 'name'; MIME_TYPE: 'mimeType'; URL: 'url' };
}

interface DocsView {
  setIncludeFolders(b: boolean): DocsView;
  setSelectFolderEnabled(b: boolean): DocsView;
  setMimeTypes(types: string): DocsView;
  setOwnedByMe(b: boolean): DocsView;
  setMode(mode: string): DocsView;
}

interface PickerBuilder {
  addView(view: DocsView): PickerBuilder;
  setOAuthToken(token: string): PickerBuilder;
  setDeveloperKey(key: string): PickerBuilder;
  setAppId(appId: string): PickerBuilder;
  setOrigin(origin: string): PickerBuilder;
  setCallback(cb: (data: PickerCallbackData) => void): PickerBuilder;
  setTitle(title: string): PickerBuilder;
  enableFeature(feature: string): PickerBuilder;
  build(): PickerInstance;
}

interface PickerInstance {
  setVisible(visible: boolean): void;
  dispose(): void;
}

export interface PickerCallbackData {
  action: 'picked' | 'cancel' | 'loaded';
  docs?: Array<{
    id: string;
    name: string;
    mimeType: string;
    url?: string;
    parentId?: string;
    isShared?: boolean;
  }>;
}
